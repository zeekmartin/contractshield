import { Router } from 'express';
import { verifyWebhookSignature, handleWebhookEvent } from '../services/stripe.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /webhooks/stripe
 * Stripe webhook endpoint
 * Note: raw body parsing is handled separately in index.js
 */
router.post('/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    logger.warn('Webhook received without signature');
    return res.status(400).json({ error: 'Missing signature' });
  }

  // Verify signature and construct event
  const event = verifyWebhookSignature(req.body, signature);

  if (!event) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  logger.info('Webhook received', { type: event.type, id: event.id });

  try {
    const result = await handleWebhookEvent(event);

    if (result.skipped) {
      return res.status(200).json({ received: true, skipped: true });
    }

    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    logger.error('Webhook processing error', { error: error.message, eventId: event.id });

    // Return 200 to prevent Stripe from retrying if it's a processing error
    // Return 500 only for truly unexpected errors
    return res.status(200).json({
      received: true,
      error: 'Processing failed',
      message: error.message,
    });
  }
});

export default router;
