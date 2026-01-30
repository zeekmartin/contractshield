import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let transporter = null;

/**
 * Initialize email transporter
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!config.email.host || !config.email.user) {
    logger.warn('Email not configured, emails will be logged only');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });

  return transporter;
}

/**
 * Send license key email to customer
 */
export async function sendLicenseEmail(to, licenseKey, plan) {
  const planConfig = config.plans[plan];
  const planName = planConfig?.name || plan;

  const subject = `Your ContractShield ${planName} License`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #0066cc; }
    .logo { font-size: 24px; font-weight: bold; color: #0066cc; }
    .content { padding: 30px 0; }
    .license-box { background: #f5f7fa; border: 1px solid #e1e5eb; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .license-key { font-family: monospace; font-size: 18px; color: #0066cc; letter-spacing: 1px; word-break: break-all; }
    .plan-badge { display: inline-block; background: #0066cc; color: white; padding: 5px 15px; border-radius: 20px; font-size: 14px; margin-bottom: 15px; }
    .features { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .features h3 { margin-top: 0; color: #0066cc; }
    .features ul { margin: 0; padding-left: 20px; }
    .footer { text-align: center; padding-top: 20px; border-top: 1px solid #e1e5eb; color: #666; font-size: 14px; }
    .button { display: inline-block; background: #0066cc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🛡️ ContractShield</div>
    </div>
    <div class="content">
      <p>Thank you for purchasing ContractShield ${planName}!</p>

      <div class="license-box">
        <div class="plan-badge">${planName}</div>
        <p style="margin: 0 0 10px 0; color: #666;">Your License Key:</p>
        <div class="license-key">${licenseKey}</div>
      </div>

      <div class="features">
        <h3>Your plan includes:</h3>
        <ul>
          <li><strong>${planConfig?.seats || 5} seats</strong> (machines)</li>
          ${(planConfig?.features || []).map(f => `<li>${formatFeatureName(f)}</li>`).join('\n          ')}
        </ul>
      </div>

      <h3>Getting Started</h3>
      <p>To activate your license, add the following to your ContractShield configuration:</p>

      <pre style="background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 6px; overflow-x: auto;">
<span style="color: #9cdcfe;">CONTRACTSHIELD_LICENSE_KEY</span>=<span style="color: #ce9178;">${licenseKey}</span></pre>

      <p>Or in your code:</p>

      <pre style="background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 6px; overflow-x: auto;">
<span style="color: #c586c0;">import</span> { <span style="color: #9cdcfe;">contractshield</span> } <span style="color: #c586c0;">from</span> <span style="color: #ce9178;">'@cshield/pro'</span>;

<span style="color: #9cdcfe;">contractshield</span>({
  <span style="color: #9cdcfe;">licenseKey</span>: <span style="color: #ce9178;">'${licenseKey}'</span>,
  <span style="color: #6a9955;">// ... your config</span>
});</pre>

      <p style="text-align: center;">
        <a href="https://contractshield.dev/docs/pro" class="button">View Documentation</a>
      </p>
    </div>
    <div class="footer">
      <p>Need help? Contact us at support@contractshield.dev</p>
      <p>&copy; ${new Date().getFullYear()} ContractShield. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

  const text = `
ContractShield ${planName} License

Thank you for purchasing ContractShield ${planName}!

Your License Key: ${licenseKey}

Your plan includes:
- ${planConfig?.seats || 5} seats (machines)
${(planConfig?.features || []).map(f => `- ${formatFeatureName(f)}`).join('\n')}

Getting Started:
Add the following to your environment:
CONTRACTSHIELD_LICENSE_KEY=${licenseKey}

Documentation: https://contractshield.dev/docs/pro

Need help? Contact us at support@contractshield.dev
`;

  const transport = getTransporter();

  if (!transport) {
    logger.info('Email would be sent (email not configured)', {
      to,
      subject,
      licenseKey: licenseKey.substring(0, 15) + '...',
    });
    return { sent: false, reason: 'not_configured' };
  }

  try {
    await transport.sendMail({
      from: config.email.from,
      to,
      subject,
      text,
      html,
    });

    logger.info('License email sent', { to, plan });
    return { sent: true };
  } catch (error) {
    logger.error('Failed to send license email', { to, error: error.message });
    throw error;
  }
}

/**
 * Format feature name for display
 */
function formatFeatureName(feature) {
  const names = {
    'sink-rasp': 'Sink-aware RASP Protection',
    'learning-mode': 'Learning Mode & Auto-schema',
    'priority-support': 'Priority Support',
    'custom-rules': 'Custom CEL Rules',
    'sla-guarantee': 'SLA Guarantee (99.9%)',
    'dedicated-support': 'Dedicated Support Channel',
  };
  return names[feature] || feature;
}
