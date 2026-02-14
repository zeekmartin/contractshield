import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || '';
}

function optional(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

export const config = {
  port: parseInt(optional('PORT', '3002'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  database: {
    url: optional('DATABASE_URL', './data/licenses.db'),
  },

  adminApiKey: required('ADMIN_API_KEY'),

  stripe: {
    secretKey: required('STRIPE_SECRET_KEY'),
    webhookSecret: required('STRIPE_WEBHOOK_SECRET'),
  },

  cors: {
    origins: optional('CORS_ORIGINS', 'http://localhost:3000')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean),
  },

  email: {
    host: optional('SMTP_HOST'),
    port: parseInt(optional('SMTP_PORT', '587'), 10),
    user: optional('SMTP_USER'),
    pass: optional('SMTP_PASS'),
    from: optional('FROM_EMAIL', 'licenses@contractshield.dev'),
  },

  rateLimit: {
    windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10),
    maxRequests: parseInt(optional('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  },

  license: {
    cacheTtl: parseInt(optional('LICENSE_CACHE_TTL', '300'), 10),
  },

  // Plan configuration matching Stripe products
  plans: {
    pro: {
      name: 'Pro',
      seats: 5,
      priceMonthly: 49,
      features: [
        'sink-rasp',
        'learning-mode',
        'priority-support',
      ],
    },
    enterprise: {
      name: 'Enterprise',
      seats: 25,
      priceMonthly: 199,
      features: [
        'sink-rasp',
        'learning-mode',
        'priority-support',
        'custom-rules',
        'sla-guarantee',
        'dedicated-support',
      ],
    },
  },
};
