import { Router } from 'express';
import { config } from '../config.js';
import { query, queryOne, execute } from '../db/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * Admin API key authentication middleware
 */
function requireAdminKey(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.headers['x-api-key'];

  if (!apiKey || apiKey !== config.adminApiKey) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or missing API key' });
  }

  next();
}

router.use(requireAdminKey);

/**
 * GET /v1/admin/partners
 * List all partners with stats
 */
router.get('/', (req, res) => {
  try {
    const partners = query(
      `SELECT * FROM referrals ORDER BY created_at DESC`
    );
    return res.status(200).json({ partners });
  } catch (error) {
    logger.error('Failed to list partners', { error: error.message });
    return res.status(500).json({ error: 'internal_error', message: 'Failed to list partners' });
  }
});

/**
 * GET /v1/admin/partners/unpaid
 * List unpaid commissions for current month
 */
router.get('/unpaid', (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const unpaid = query(
      `SELECT
         r.partner_id,
         r.partner_name,
         r.partner_email,
         r.partner_tier,
         r.payment_method,
         r.payment_details,
         COUNT(rc.id) AS conversion_count,
         SUM(rc.amount) AS total_amount,
         SUM(rc.commission) AS total_commission
       FROM referral_conversions rc
       JOIN referrals r ON r.id = rc.referral_id
       WHERE rc.commission_paid = 0
         AND rc.created_at >= ? AND rc.created_at <= ?
       GROUP BY r.id
       ORDER BY total_commission DESC`,
      [startDate, endDate + ' 23:59:59']
    );

    return res.status(200).json({ month, unpaid });
  } catch (error) {
    logger.error('Failed to list unpaid commissions', { error: error.message });
    return res.status(500).json({ error: 'internal_error', message: 'Failed to list unpaid commissions' });
  }
});

/**
 * POST /v1/admin/partners/pay
 * Mark commissions as paid for a partner in a given month
 */
router.post('/pay', (req, res) => {
  try {
    const { partner_id, month } = req.body;

    if (!partner_id || !month) {
      return res.status(400).json({
        error: 'missing_fields',
        message: 'partner_id and month are required',
      });
    }

    const partner = queryOne(
      'SELECT * FROM referrals WHERE partner_id = ?',
      [partner_id]
    );

    if (!partner) {
      return res.status(404).json({ error: 'not_found', message: 'Partner not found' });
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

    return res.status(200).json({
      success: true,
      marked_paid: result.changes,
      partner_id,
      month,
    });
  } catch (error) {
    logger.error('Failed to mark commissions as paid', { error: error.message });
    return res.status(500).json({ error: 'internal_error', message: 'Failed to mark as paid' });
  }
});

/**
 * GET /v1/admin/partners/:id
 * Get partner detail with conversions
 */
router.get('/:id', (req, res) => {
  try {
    const partner = queryOne(
      'SELECT * FROM referrals WHERE partner_id = ?',
      [req.params.id]
    );

    if (!partner) {
      return res.status(404).json({ error: 'not_found', message: 'Partner not found' });
    }

    const conversions = query(
      `SELECT * FROM referral_conversions
       WHERE referral_id = ?
       ORDER BY created_at DESC`,
      [partner.id]
    );

    return res.status(200).json({ partner, conversions });
  } catch (error) {
    logger.error('Failed to get partner detail', { error: error.message });
    return res.status(500).json({ error: 'internal_error', message: 'Failed to get partner' });
  }
});

/**
 * POST /v1/admin/partners
 * Create a new partner
 */
router.post('/', (req, res) => {
  try {
    const { partner_id, partner_name, partner_email, partner_tier, commission_rate, payment_method, payment_details } = req.body;

    if (!partner_id || !partner_name || !partner_email || !partner_tier || commission_rate === undefined) {
      return res.status(400).json({
        error: 'missing_fields',
        message: 'partner_id, partner_name, partner_email, partner_tier, and commission_rate are required',
      });
    }

    const validTiers = ['affiliate', 'partner', 'reseller'];
    if (!validTiers.includes(partner_tier)) {
      return res.status(400).json({
        error: 'invalid_tier',
        message: `partner_tier must be one of: ${validTiers.join(', ')}`,
      });
    }

    if (typeof commission_rate !== 'number' || commission_rate < 0 || commission_rate > 1) {
      return res.status(400).json({
        error: 'invalid_rate',
        message: 'commission_rate must be a number between 0 and 1',
      });
    }

    const existing = queryOne('SELECT id FROM referrals WHERE partner_id = ?', [partner_id]);
    if (existing) {
      return res.status(409).json({ error: 'duplicate', message: 'A partner with this ID already exists' });
    }

    execute(
      `INSERT INTO referrals (partner_id, partner_name, partner_email, partner_tier, commission_rate, payment_method, payment_details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [partner_id, partner_name, partner_email, partner_tier, commission_rate, payment_method || 'bank_transfer', payment_details || null]
    );

    const partner = queryOne('SELECT * FROM referrals WHERE partner_id = ?', [partner_id]);

    logger.info('Partner created', { partnerId: partner_id, tier: partner_tier });

    return res.status(201).json({ success: true, partner });
  } catch (error) {
    logger.error('Failed to create partner', { error: error.message });
    return res.status(500).json({ error: 'internal_error', message: 'Failed to create partner' });
  }
});

/**
 * PATCH /v1/admin/partners/:id
 * Update a partner (tier, rate, status, etc.)
 */
router.patch('/:id', (req, res) => {
  try {
    const partner = queryOne(
      'SELECT * FROM referrals WHERE partner_id = ?',
      [req.params.id]
    );

    if (!partner) {
      return res.status(404).json({ error: 'not_found', message: 'Partner not found' });
    }

    const allowedFields = ['partner_tier', 'commission_rate', 'status', 'partner_name', 'partner_email', 'payment_method', 'payment_details'];
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'no_updates', message: 'No valid fields to update' });
    }

    // Validate tier if provided
    if (req.body.partner_tier) {
      const validTiers = ['affiliate', 'partner', 'reseller'];
      if (!validTiers.includes(req.body.partner_tier)) {
        return res.status(400).json({
          error: 'invalid_tier',
          message: `partner_tier must be one of: ${validTiers.join(', ')}`,
        });
      }
    }

    // Validate status if provided
    if (req.body.status) {
      const validStatuses = ['active', 'paused', 'terminated'];
      if (!validStatuses.includes(req.body.status)) {
        return res.status(400).json({
          error: 'invalid_status',
          message: `status must be one of: ${validStatuses.join(', ')}`,
        });
      }
    }

    // Validate commission_rate if provided
    if (req.body.commission_rate !== undefined) {
      if (typeof req.body.commission_rate !== 'number' || req.body.commission_rate < 0 || req.body.commission_rate > 1) {
        return res.status(400).json({
          error: 'invalid_rate',
          message: 'commission_rate must be a number between 0 and 1',
        });
      }
    }

    updates.push("updated_at = datetime('now')");
    values.push(partner.id);

    execute(
      `UPDATE referrals SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updated = queryOne('SELECT * FROM referrals WHERE id = ?', [partner.id]);

    logger.info('Partner updated', { partnerId: req.params.id, updates: Object.keys(req.body) });

    return res.status(200).json({ success: true, partner: updated });
  } catch (error) {
    logger.error('Failed to update partner', { error: error.message });
    return res.status(500).json({ error: 'internal_error', message: 'Failed to update partner' });
  }
});

export default router;
