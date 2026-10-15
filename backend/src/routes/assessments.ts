/**
 * Assessments Routes
 * GET /api/assessments        — list assessments for user
 * GET /api/assessments/:id    — get single assessment
 */

import express, { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { getClient } from '../db/client';
import { createError } from '../middleware/errorHandler';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data, error } = await db.from('risk_assessments').select('*')
      .eq('user_id', req.userId).order('created_at', { ascending: false }).limit(50);
    if (error) return next(createError(500, error.message));
    res.json({ assessments: (data || []).map(parseAssessment) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data, error } = await db.from('risk_assessments').select('*')
      .eq('id', req.params.id).eq('user_id', req.userId).single();
    if (error || !data) return next(createError(404, 'Assessment not found'));
    res.json({ assessment: parseAssessment(data) });
  } catch (err) { next(err); }
});

function parseAssessment(a: any): any {
  return {
    ...a,
    factor_contributions: safeJson(a.factor_contributions),
    review_reasons: safeJson(a.review_reasons),
  };
}

function safeJson(v: any): any {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

export default router;
