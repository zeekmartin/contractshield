#!/usr/bin/env node
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initDatabase, getDb, queryOne, execute, closeDatabase } from './index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  try {
    logger.info('Running database migrations...');

    // Initialize connection
    initDatabase();
    const db = getDb();

    // Create migrations tracking table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Get list of migration files
    const migrationsDir = resolve(__dirname, 'migrations');
    let migrationFiles = [];

    try {
      migrationFiles = readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
    } catch (e) {
      logger.info('No migrations directory found, skipping migrations');
      closeDatabase();
      process.exit(0);
    }

    if (migrationFiles.length === 0) {
      logger.info('No migration files found');
      closeDatabase();
      process.exit(0);
    }

    // Apply each migration that hasn't been applied yet
    let appliedCount = 0;
    for (const file of migrationFiles) {
      const existing = queryOne('SELECT id FROM migrations WHERE name = ?', [file]);
      if (existing) {
        logger.debug(`Migration ${file} already applied, skipping`);
        continue;
      }

      logger.info(`Applying migration: ${file}`);
      const migrationPath = resolve(migrationsDir, file);
      const sql = readFileSync(migrationPath, 'utf-8');

      db.exec(sql);
      execute('INSERT INTO migrations (name) VALUES (?)', [file]);
      appliedCount++;

      logger.info(`Migration ${file} applied successfully`);
    }

    if (appliedCount === 0) {
      logger.info('All migrations already applied');
    } else {
      logger.info(`Applied ${appliedCount} migration(s)`);
    }

    closeDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    process.exit(1);
  }
}

migrate();
