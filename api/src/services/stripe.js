import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { queryOne, execute } from '../db/index.js';
import {
  createLicense,
  getLicenseBySubscription,
  getLicenseByCustomer,
  updateLicenseStatus,
  updateLicenseValidity,
  updateLicensePlan,
  clearActivations,
} from './license.js';
import { sendLicenseEmail } from './email.js';

// Initialize Stripe client
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2024-06-20',
});

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(payload, signature) {
  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
  } catch (err) {
    logger.warn('Webhook signature verification failed', { error: err.message });
    return null;
  }
}

/**
 * Check if webhook event was already processed (idempotency)
 */
export function isEventProcessed(eventId) {
  const existing = queryOne(
    'SELECT id FROM webhook_events WHERE stripe_event_id = ?',
    [eventId]
  );
  return !!existing;
}

/**
 * Record processed webhook event
 */
export function recordWebhookEvent(eventId, eventType, payload, status = 'processed') {
  execute(
    `INSERT INTO webhook_events (id, stripe_event_id, event_type, payload, status)
     VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), eventId, eventType, JSON.stringify(payload), status]
  );
}

/**
 * Determine plan from Stripe price/product
 */
function determinePlanFromPrice(priceId, productId, metadata = {}) {
  // Check metadata first (preferred method)
  if (metadata.plan) {
    return metadata.plan;
  }

  // Fallback: could check against known price IDs in config
  // For now, default to 'pro'
  logger.warn('Could not determine plan from price, defaulting to pro', { priceId, productId });
  return 'pro';
}

/**
 * Calculate valid_until date from subscription
 */
function calculateValidUntil(subscription) {
  // Use current_period_end if available
  if (subscription.current_period_end) {
    return new Date(subscription.current_period_end * 1000).toISOString();
  }
  // Fallback: 30 days from now
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString();
}

/**
 * Handle checkout.session.completed
 * Creates a new license and sends email
 */
export async function handleCheckoutCompleted(session) {
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const customerEmail = session.customer_details?.email || session.customer_email;

  if (!subscriptionId) {
    logger.warn('Checkout completed without subscription', { sessionId: session.id });
    return { success: false, reason: 'no_subscription' };
  }

  // Check if license already exists for this subscription
  const existingLicense = getLicenseBySubscription(subscriptionId);
  if (existingLicense) {
    logger.info('License already exists for subscription', { subscriptionId });
    return { success: true, existing: true, licenseId: existingLicense.id };
  }

  // Fetch subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price?.id;
  const productId = subscription.items.data[0]?.price?.product;
  const metadata = subscription.metadata || {};

  const plan = determinePlanFromPrice(priceId, productId, metadata);
  const validUntil = calculateValidUntil(subscription);

  // Create license
  const license = createLicense({
    email: customerEmail,
    plan,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    validUntil,
  });

  logger.info('License created from checkout', {
    licenseId: license.id,
    plan,
    subscriptionId,
  });

  // Track referral conversion
  const referrer = session.metadata?.referrer;
  if (referrer && referrer !== 'organic') {
    try {
      trackReferralConversion(referrer, {
        customerId,
        subscriptionId,
        customerEmail,
        plan,
        amountTotal: session.amount_total,
      });
    } catch (refError) {
      logger.error('Failed to track referral conversion', { error: refError.message, referrer });
    }
  }

  // Send license email
  try {
    await sendLicenseEmail(customerEmail, license.license_key, plan);
  } catch (emailError) {
    logger.error('Failed to send license email', { error: emailError.message });
    // Don't fail the webhook - license is created
  }

  return { success: true, licenseId: license.id, licenseKey: license.license_key };
}

/**
 * Handle customer.subscription.updated
 * Updates license status and validity
 */
export async function handleSubscriptionUpdated(subscription) {
  const license = getLicenseBySubscription(subscription.id);

  if (!license) {
    logger.warn('No license found for subscription update', { subscriptionId: subscription.id });
    return { success: false, reason: 'no_license' };
  }

  const updates = [];

  // Update validity period
  const newValidUntil = calculateValidUntil(subscription);
  if (newValidUntil !== license.valid_until) {
    updateLicenseValidity(license.id, newValidUntil);
    updates.push('validity');
  }

  // Check for plan changes
  const priceId = subscription.items.data[0]?.price?.id;
  const productId = subscription.items.data[0]?.price?.product;
  const metadata = subscription.metadata || {};
  const newPlan = determinePlanFromPrice(priceId, productId, metadata);

  if (newPlan !== license.plan) {
    updateLicensePlan(license.id, newPlan);
    updates.push('plan');
  }

  // Update status based on subscription status
  let newStatus = license.status;
  switch (subscription.status) {
    case 'active':
      newStatus = 'active';
      break;
    case 'past_due':
      newStatus = 'grace_period';
      break;
    case 'canceled':
    case 'unpaid':
      newStatus = 'cancelled';
      break;
    case 'incomplete':
    case 'incomplete_expired':
      newStatus = 'expired';
      break;
  }

  if (newStatus !== license.status) {
    updateLicenseStatus(license.id, newStatus);
    updates.push('status');
  }

  logger.info('Subscription updated', { licenseId: license.id, updates });

  return { success: true, updates };
}

/**
 * Handle customer.subscription.deleted
 * Cancels the license
 */
export async function handleSubscriptionDeleted(subscription) {
  const license = getLicenseBySubscription(subscription.id);

  if (!license) {
    logger.warn('No license found for subscription deletion', { subscriptionId: subscription.id });
    return { success: false, reason: 'no_license' };
  }

  updateLicenseStatus(license.id, 'cancelled');
  clearActivations(license.id);

  logger.info('License cancelled due to subscription deletion', { licenseId: license.id });

  return { success: true };
}

/**
 * Handle invoice.payment_failed
 * Puts license in grace period
 */
export async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) {
    return { success: false, reason: 'no_subscription' };
  }

  const license = getLicenseBySubscription(subscriptionId);

  if (!license) {
    logger.warn('No license found for failed payment', { subscriptionId });
    return { success: false, reason: 'no_license' };
  }

  // Set grace period (7 days from now)
  const graceUntil = new Date();
  graceUntil.setDate(graceUntil.getDate() + 7);

  updateLicenseStatus(license.id, 'grace_period', graceUntil.toISOString());

  logger.info('License put in grace period due to payment failure', {
    licenseId: license.id,
    graceUntil: graceUntil.toISOString(),
  });

  return { success: true, graceUntil: graceUntil.toISOString() };
}

/**
 * Track a referral conversion when a referred customer completes checkout
 */
function trackReferralConversion(partnerId, { customerId, subscriptionId, customerEmail, plan, amountTotal }) {
  const partner = queryOne(
    'SELECT * FROM referrals WHERE partner_id = ? AND status = ?',
    [partnerId, 'active']
  );

  if (!partner) {
    logger.info('No active partner found for referrer', { partnerId });
    return;
  }

  const amount = (amountTotal || 0) / 100;
  const commission = amount * partner.commission_rate;

  execute(
    `INSERT INTO referral_conversions
     (referral_id, stripe_customer_id, stripe_subscription_id, customer_email, plan, amount, commission)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [partner.id, customerId, subscriptionId, customerEmail, plan || 'unknown', amount, commission]
  );

  execute(
    `UPDATE referrals
     SET total_converted = total_converted + 1,
         total_earned = total_earned + ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [commission, partner.id]
  );

  logger.info('Referral conversion tracked', {
    partnerId,
    partnerName: partner.partner_name,
    amount,
    commission,
  });
}

/**
 * Main webhook event handler
 */
export async function handleWebhookEvent(event) {
  const { id, type, data } = event;

  // Idempotency check
  if (isEventProcessed(id)) {
    logger.info('Webhook event already processed, skipping', { eventId: id, type });
    return { success: true, skipped: true };
  }

  let result;

  try {
    switch (type) {
      case 'checkout.session.completed':
        result = await handleCheckoutCompleted(data.object);
        break;

      case 'customer.subscription.updated':
        result = await handleSubscriptionUpdated(data.object);
        break;

      case 'customer.subscription.deleted':
        result = await handleSubscriptionDeleted(data.object);
        break;

      case 'invoice.payment_failed':
        result = await handlePaymentFailed(data.object);
        break;

      default:
        logger.debug('Unhandled webhook event type', { type });
        result = { success: true, ignored: true };
    }

    // Record successful processing
    recordWebhookEvent(id, type, data.object, 'processed');

    return result;
  } catch (error) {
    logger.error('Webhook event processing failed', { eventId: id, type, error: error.message });

    // Record failed processing
    recordWebhookEvent(id, type, data.object, 'failed');

    throw error;
  }
}
