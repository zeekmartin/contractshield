import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve, isAbsolute } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * Get the database file path, resolving relative paths from project root
 */
function getDatabasePath() {
  const dbUrl = config.database.url;
  if (isAbsolute(dbUrl)) {
    return dbUrl;
  }
  return resolve(__dirname, '..', '..', dbUrl);
}

/**
 * Initialize database connection
 */
export function initDatabase() {
  if (db) return db;

  const dbPath = getDatabasePath();
  const dbDir = dirname(dbPath);

  // Ensure data directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info('Created database directory', { path: dbDir });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  logger.info('Database initialized', { path: dbPath });

  return db;
}

/**
 * Get database instance (throws if not initialized)
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

/**
 * Run a query and return all results
 */
export function query(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params);
}

/**
 * Run a query and return first result
 */
export function queryOne(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params);
}

/**
 * Run an insert/update/delete and return changes info
 */
export function execute(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

/**
 * Run multiple statements in a transaction
 */
export function transaction(fn) {
  return getDb().transaction(fn)();
}
