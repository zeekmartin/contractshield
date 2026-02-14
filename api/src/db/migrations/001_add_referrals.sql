-- Migration: Add referral tracking tables
-- Date: 2026-02-14

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  partner_id TEXT NOT NULL UNIQUE,
  partner_tier TEXT NOT NULL CHECK(partner_tier IN ('affiliate', 'partner', 'reseller')),
  partner_name TEXT NOT NULL,
  partner_email TEXT NOT NULL,
  commission_rate REAL NOT NULL,
  payment_method TEXT DEFAULT 'bank_transfer',
  payment_details TEXT,
  total_referred INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  total_earned REAL DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'terminated')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS referral_conversions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  referral_id TEXT NOT NULL REFERENCES referrals(id),
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  customer_email TEXT,
  plan TEXT,
  amount REAL NOT NULL,
  commission REAL NOT NULL,
  commission_paid INTEGER DEFAULT 0,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_referrals_partner_id ON referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referral_id ON referral_conversions(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_commission_paid ON referral_conversions(commission_paid);
