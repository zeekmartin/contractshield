import { config } from '../config.js';

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

function formatTimestamp() {
  return new Date().toISOString();
}

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = [
    'password', 'secret', 'token', 'key', 'authorization',
    'cookie', 'creditcard', 'ssn', 'licenseKey',
  ];

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(s => lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function formatMessage(level, message, meta = {}) {
  const entry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...sanitize(meta),
  };

  if (config.isDev) {
    const metaStr = Object.keys(meta).length > 0
      ? ` ${JSON.stringify(sanitize(meta))}`
      : '';
    return `[${entry.timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  return JSON.stringify(entry);
}

export const logger = {
  error(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },

  warn(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  info(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.info) {
      console.log(formatMessage('info', message, meta));
    }
  },

  debug(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.log(formatMessage('debug', message, meta));
    }
  },
};
