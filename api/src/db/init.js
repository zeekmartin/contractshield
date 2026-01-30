#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initDatabase, getDb, closeDatabase } from './index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function init() {
  try {
    logger.info('Initializing database...');

    // Initialize connection
    initDatabase();

    // Read and execute schema
    const schemaPath = resolve(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    getDb().exec(schema);

    logger.info('Database schema applied successfully');

    // Close connection
    closeDatabase();

    logger.info('Database initialization complete');
    process.exit(0);
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    process.exit(1);
  }
}

init();
