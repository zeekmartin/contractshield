#!/usr/bin/env node

/**
 * CLI tool for managing referral partners
 *
 * Usage:
 *   node scripts/manage-partners.js add --id "partner-xxx" --name "Name" --email "email@example.com" --tier partner --rate 0.20
 *   node scripts/manage-partners.js list
 *   node scripts/manage-partners.js unpaid [--month 2026-02]
 *   node scripts/manage-partners.js pay --partner-id "partner-xxx" --month "2026-02"
 *   node scripts/manage-partners.js disable --partner-id "partner-xxx"
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env before importing modules that depend on config
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: resolve(__dirname, '..', '.env') });

import { initDatabase, query, queryOne, execute, closeDatabase } from '../src/db/index.js';

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = value;
      if (value !== true) i++;
    }
  }
  return parsed;
}

function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log('  (no results)');
    return;
  }

  const widths = {};
  for (const col of columns) {
    widths[col] = col.length;
    for (const row of rows) {
      const val = String(row[col] ?? '');
      if (val.length > widths[col]) widths[col] = val.length;
    }
  }

  const header = columns.map(c => c.padEnd(widths[c])).join('  ');
  const separator = columns.map(c => '-'.repeat(widths[c])).join('  ');

  console.log(`  ${header}`);
  console.log(`  ${separator}`);
  for (const row of rows) {
    const line = columns.map(c => String(row[c] ?? '').padEnd(widths[c])).join('  ');
    console.log(`  ${line}`);
  }
}

const commands = {
  add(args) {
    const { id, name, email, tier, rate } = args;

    if (!id || !name || !email || !tier || !rate) {
      console.error('Error: Missing required arguments');
      console.error('Usage: node scripts/manage-partners.js add --id <id> --name <name> --email <email> --tier <tier> --rate <rate>');
      process.exit(1);
    }

    const validTiers = ['affiliate', 'partner', 'reseller'];
    if (!validTiers.includes(tier)) {
      console.error(`Error: tier must be one of: ${validTiers.join(', ')}`);
      process.exit(1);
    }

    const rateNum = parseFloat(rate);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
      console.error('Error: rate must be a number between 0 and 1');
      process.exit(1);
    }

    const existing = queryOne('SELECT id FROM referrals WHERE partner_id = ?', [id]);
    if (existing) {
      console.error(`Error: Partner with ID "${id}" already exists`);
      process.exit(1);
    }

    execute(
      `INSERT INTO referrals (partner_id, partner_name, partner_email, partner_tier, commission_rate)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, email, tier, rateNum]
    );

    console.log(`Partner created successfully:`);
    console.log(`  ID:    ${id}`);
    console.log(`  Name:  ${name}`);
    console.log(`  Email: ${email}`);
    console.log(`  Tier:  ${tier}`);
    console.log(`  Rate:  ${(rateNum * 100).toFixed(0)}%`);
  },

  list() {
    const partners = query('SELECT * FROM referrals ORDER BY created_at DESC');

    if (partners.length === 0) {
      console.log('No partners found.');
      return;
    }

    console.log(`\nPartners (${partners.length}):\n`);
    printTable(partners, ['partner_id', 'partner_name', 'partner_tier', 'commission_rate', 'status', 'total_converted', 'total_earned']);
    console.log('');
  },

  unpaid(args) {
    const month = args.month || new Date().toISOString().slice(0, 7);
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const unpaid = query(
      `SELECT
         r.partner_id,
         r.partner_name,
         r.partner_email,
         r.partner_tier,
         r.payment_method,
         COUNT(rc.id) AS conversions,
         ROUND(SUM(rc.amount), 2) AS total_amount,
         ROUND(SUM(rc.commission), 2) AS total_commission
       FROM referral_conversions rc
       JOIN referrals r ON r.id = rc.referral_id
       WHERE rc.commission_paid = 0
         AND rc.created_at >= ? AND rc.created_at <= ?
       GROUP BY r.id
       ORDER BY total_commission DESC`,
      [startDate, endDate + ' 23:59:59']
    );

    console.log(`\nUnpaid commissions for ${month}:\n`);

    if (unpaid.length === 0) {
      console.log('  No unpaid commissions for this period.');
    } else {
      printTable(unpaid, ['partner_id', 'partner_name', 'conversions', 'total_amount', 'total_commission', 'payment_method']);

      const grandTotal = unpaid.reduce((sum, row) => sum + (row.total_commission || 0), 0);
      console.log(`\n  Total to pay: $${grandTotal.toFixed(2)}`);
    }
    console.log('');
  },

  pay(args) {
    const { 'partner-id': partnerId, month } = args;

    if (!partnerId || !month) {
      console.error('Error: Missing required arguments');
      console.error('Usage: node scripts/manage-partners.js pay --partner-id <id> --month <YYYY-MM>');
      process.exit(1);
    }

    const partner = queryOne('SELECT * FROM referrals WHERE partner_id = ?', [partnerId]);
    if (!partner) {
      console.error(`Error: Partner "${partnerId}" not found`);
      process.exit(1);
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const result = execute(
      `UPDATE referral_conversions
       SET commission_paid = 1, paid_at = datetime('now')
       WHERE referral_id = ?
         AND commission_paid = 0
         AND created_at >= ? AND created_at <= ?`,
      [partner.id, startDate, endDate + ' 23:59:59']
    );

    if (result.changes === 0) {
      console.log(`No unpaid conversions found for "${partnerId}" in ${month}.`);
    } else {
      console.log(`Marked ${result.changes} conversion(s) as paid for "${partnerId}" in ${month}.`);
    }
  },

  disable(args) {
    const { 'partner-id': partnerId } = args;

    if (!partnerId) {
      console.error('Error: Missing required argument --partner-id');
      console.error('Usage: node scripts/manage-partners.js disable --partner-id <id>');
      process.exit(1);
    }

    const partner = queryOne('SELECT * FROM referrals WHERE partner_id = ?', [partnerId]);
    if (!partner) {
      console.error(`Error: Partner "${partnerId}" not found`);
      process.exit(1);
    }

    if (partner.status === 'terminated') {
      console.log(`Partner "${partnerId}" is already terminated.`);
      return;
    }

    execute(
      `UPDATE referrals SET status = 'terminated', updated_at = datetime('now') WHERE id = ?`,
      [partner.id]
    );

    console.log(`Partner "${partnerId}" (${partner.partner_name}) has been disabled.`);
  },
};

// Main
const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || !commands[command]) {
  console.log('ContractShield Partner Management CLI');
  console.log('');
  console.log('Commands:');
  console.log('  add      Create a new partner');
  console.log('  list     List all partners');
  console.log('  unpaid   Show unpaid commissions');
  console.log('  pay      Mark commissions as paid');
  console.log('  disable  Disable a partner');
  console.log('');
  console.log('Run with --help for command-specific usage.');
  process.exit(0);
}

try {
  initDatabase();
  commands[command](args);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
} finally {
  closeDatabase();
}
