/**
 * Review Routes — Human Review Center
 * GET  /api/review                  — list all review cases
 * GET  /api/review/:id              — get single review case
 * POST /api/review/:id/decision     — record reviewer decision
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth';
import { getClient } from '../db/client';
import { createError } from '../middleware/errorHandler';
import { logAuditEvent } from '../services/auditService';

const router = express.Router();
router.use(requireAuth);

const DecisionSchema = z.object({
  decision: z.enum(['resolved', 'rejected']),
  explanation: z.string().min(10, 'Explanation must be at least 10 characters'),
});

router.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const status = req.query.status as string;
    let query = db.from('review_cases').select('*').eq('user_id', req.userId)
      .order('created_at', { ascending: false }).limit(100);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return next(createError(500, error.message));
    res.json({ review_cases: data || [] });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data, error } = await db.from('review_cases').select('*')
      .eq('id', req.params.id).eq('user_id', req.userId).single();
    if (error || !data) return next(createError(404, 'Review case not found'));

    const { data: trip }       = await db.from('trips').select('*').eq('id', data.trip_id).single();
    const { data: assessment } = await db.from('risk_assessments').select('*').eq('id', data.assessment_id).single();

    res.json({ review_case: data, trip: trip || null, assessment: assessment || null });
  } catch (err) { next(err); }
});

router.post('/:id/decision', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = DecisionSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    const { decision, explanation } = parsed.data;

    const db = getClient();
    const { data: reviewCase, error } = await db.from('review_cases').select('*')
      .eq('id', req.params.id).eq('user_id', req.userId).single();

    if (error || !reviewCase) return next(createError(404, 'Review case not found'));
    if (reviewCase.status === 'resolved' || reviewCase.status === 'rejected') {
      return next(createError(409, 'Review case is already closed'));
    }

    const now = new Date().toISOString();
    const { data: updated } = await db.from('review_cases').update({
      status: decision,
      reviewer_decision: decision,
      reviewer_explanation: explanation,
      reviewed_at: now,
      reviewer_id: req.userId,
      updated_at: now,
    }).eq('id', req.params.id);

    await logAuditEvent(req.userId, 'review_decision_recorded', {
      review_case_id: req.params.id,
      decision,
      trip_id: reviewCase.trip_id,
    });

    res.json({
      review_case: updated?.[0] || { ...reviewCase, status: decision, reviewer_decision: decision, reviewer_explanation: explanation },
      message: `Review case ${decision}.`,
    });
  } catch (err) { next(err); }
});

export default router;
