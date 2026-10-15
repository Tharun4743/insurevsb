/**
 * Quotes Routes
 * GET /api/quotes      — list quotes for user
 * GET /api/quotes/:id  — get single quote
 */

import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth';
import { getClient } from '../db/client';
import { createError } from '../middleware/errorHandler';
import { logAuditEvent } from '../services/auditService';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data, error } = await db.from('quotes').select('*')
      .eq('user_id', req.userId).order('created_at', { ascending: false }).limit(50);
    if (error) return next(createError(500, error.message));
    res.json({
      quotes: data || [],
      disclaimer: 'ILLUSTRATIVE ESTIMATES ONLY — not actual insurance quotes.',
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data, error } = await db.from('quotes').select('*')
      .eq('id', req.params.id).eq('user_id', req.userId).single();
    if (error || !data) return next(createError(404, 'Quote not found'));
    res.json({
      quote: data,
      disclaimer: 'ILLUSTRATIVE ESTIMATE ONLY — not an actual insurance quote.',
    });
  } catch (err) { next(err); }
});

router.post('/:id/dispute', async (req: any, res: Response, next: NextFunction) => {
  try {
    const { reason, explanation } = req.body;
    if (!reason || !explanation || explanation.trim().length < 5) {
      return next(createError(400, 'A valid reason and detailed explanation (min 5 characters) are required.'));
    }

    const db = getClient();
    const { data: quote, error: quoteErr } = await db.from('quotes').select('*')
      .eq('id', req.params.id).eq('user_id', req.userId).single();

    if (quoteErr || !quote) {
      return next(createError(404, 'Quote not found or does not belong to you.'));
    }

    const disputeRecord = {
      id: uuidv4(),
      user_id: req.userId,
      quote_id: quote.id,
      trip_id: quote.trip_id || null,
      reason: reason.trim(),
      explanation: explanation.trim(),
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertErr } = await db.from('pricing_disputes').insert(disputeRecord);
    if (insertErr) return next(createError(500, insertErr.message));

    await logAuditEvent(req.userId, 'customer_dispute_submitted', {
      quote_id: quote.id,
      reason: disputeRecord.reason,
    });

    res.status(201).json({
      message: 'Your pricing dispute has been submitted for Compliance Officer review.',
      dispute: disputeRecord,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/dispute', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data: disputes } = await db.from('pricing_disputes').select('*')
      .eq('quote_id', req.params.id).eq('user_id', req.userId).limit(1);

    res.json({ dispute: disputes?.[0] || null });
  } catch (err) {
    next(err);
  }
});

export default router;
