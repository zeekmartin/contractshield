import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { logger } from './utils/logger.js';
import webhooksRouter from './routes/webhooks.js';
import licensesRouter from './routes/licenses.js';
import partnersRouter from './routes/partners.js';

const app = express();

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Check against allowed origins
    if (config.cors.origins.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow localhost
    if (config.isDev && origin.includes('localhost')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Rate limiting - different limits for different endpoints
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit', message: 'Too many requests, please try again later' },
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if behind proxy
    return req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  },
});

// Stricter rate limit for validation endpoint (called frequently by SDK)
const validationLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 300, // 300 requests per minute (allow bursts during deployments)
  standardHeaders: true,
  legacyHeaders: false,
  message: { valid: false, error: 'rate_limit', message: 'Too many validation requests' },
});

// Very strict rate limit for activation (prevent abuse)
const activationLimiter = rateLimit({
  windowMs: 3600000, // 1 hour
  max: 50, // 50 activations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { activated: false, error: 'rate_limit', message: 'Too many activation attempts' },
});

// Apply global rate limit
app.use(globalLimiter);

// Stripe webhook needs raw body for signature verification
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// JSON body parser for other routes
app.use(express.json({ limit: '10kb' }));

// Health check endpoint (no rate limit)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Liveness probe
app.get('/live', (req, res) => {
  res.status(200).send('OK');
});

// Readiness probe
app.get('/ready', (req, res) => {
  // Could add DB connection check here
  res.status(200).send('OK');
});

// Routes
app.use('/webhooks', webhooksRouter);

// Apply specific rate limits to license endpoints
app.use('/v1/license/validate', validationLimiter);
app.use('/v1/license/activate', activationLimiter);
app.use('/v1/license', licensesRouter);

// Admin partner routes
app.use('/v1/admin/partners', partnersRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'cors', message: 'Origin not allowed' });
  }

  logger.error('Unhandled error', {
    error: err.message,
    stack: config.isDev ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'internal_error',
    message: config.isDev ? err.message : 'An unexpected error occurred',
  });
});

// Initialize database and start server
async function start() {
  try {
    // Initialize database
    initDatabase();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`ContractShield License API started`, {
        port: config.port,
        env: config.nodeEnv,
      });
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully`);

      server.close(() => {
        logger.info('HTTP server closed');
        closeDatabase();
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.warn('Forcing shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

start();
