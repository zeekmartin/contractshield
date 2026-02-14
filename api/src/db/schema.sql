-- ContractShield License Database Schema
-- Version: 1.0.0

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    license_key TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL CHECK (plan IN ('pro', 'enterprise')),
    seats INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'grace_period')),
    valid_until TEXT NOT NULL,
    grace_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activations table (machine/fingerprint tracking)
CREATE TABLE IF NOT EXISTS activations (
    id TEXT PRIMARY KEY,
    license_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    activated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT,
    FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
    UNIQUE (license_id, fingerprint)
);

-- Webhook events log (for debugging and replay protection)
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now')),
    payload TEXT,
    status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'failed', 'ignored'))
);

-- Referral partners
CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    partner_id TEXT NOT NULL UNIQUE,
    partner_tier TEXT NOT NULL CHECK (partner_tier IN ('affiliate', 'partner', 'reseller')),
    partner_name TEXT NOT NULL,
    partner_email TEXT NOT NULL,
    commission_rate REAL NOT NULL,
    payment_method TEXT DEFAULT 'bank_transfer',
    payment_details TEXT,
    total_referred INTEGER DEFAULT 0,
    total_converted INTEGER DEFAULT 0,
    total_earned REAL DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Referral conversions tracking
CREATE TABLE IF NOT EXISTS referral_conversions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    referral_id TEXT NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT,
    customer_email TEXT,
    plan TEXT,
    amount REAL NOT NULL,
    commission REAL NOT NULL,
    commission_paid INTEGER DEFAULT 0,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (referral_id) REFERENCES referrals(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_stripe_customer ON licenses(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_licenses_stripe_subscription ON licenses(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_valid_until ON licenses(valid_until);
CREATE INDEX IF NOT EXISTS idx_activations_license ON activations(license_id);
CREATE INDEX IF NOT EXISTS idx_activations_fingerprint ON activations(fingerprint);
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_referrals_partner_id ON referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referral_id ON referral_conversions(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_commission_paid ON referral_conversions(commission_paid);
