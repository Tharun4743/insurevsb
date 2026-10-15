/**
 * Trips Routes
 * GET  /api/trips           — list trips for current user
 * GET  /api/trips/:id       — get trip details
 * GET  /api/trips/:id/readings — get telemetry readings for trip
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
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);

    const { data: trips, error } = await db
      .from('trips')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return next(createError(500, error.message));

    const enriched = await Promise.all((trips || []).map(async (trip: any) => {
      const { data: assessments } = await db.from('risk_assessments').select('*')
        .eq('trip_id', trip.id).order('created_at', { ascending: false }).limit(1);
      const { data: quotes } = await db.from('quotes').select('*')
        .eq('trip_id', trip.id).order('created_at', { ascending: false }).limit(1);
      const { data: reviews } = await db.from('review_cases').select('*')
        .eq('trip_id', trip.id).order('created_at', { ascending: false }).limit(1);

      return {
        ...trip,
        latest_assessment: assessments?.[0] || null,
        latest_quote: quotes?.[0] || null,
        review_case: reviews?.[0] || null,
      };
    }));

    res.json({ trips: enriched, total: enriched.length });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data: trip, error } = await db.from('trips').select('*')
      .eq('id', req.params.id).eq('user_id', req.userId).single();

    if (error || !trip) return next(createError(404, 'Trip not found'));

    const { data: metrics }     = await db.from('trip_metrics').select('*').eq('trip_id', trip.id).limit(1);
    const { data: assessments } = await db.from('risk_assessments').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false }).limit(1);
    const { data: quotes }      = await db.from('quotes').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false }).limit(1);
    const { data: reviews }     = await db.from('review_cases').select('*').eq('trip_id', trip.id).limit(1);
    const { data: accidents }   = await db.from('accident_records').select('*').eq('user_id', req.userId).order('accident_date', { ascending: false });

    const assessment = assessments?.[0];
    res.json({
      trip,
      metrics: metrics?.[0] || null,
      assessment: assessment ? {
        ...assessment,
        factor_contributions: safeParseJson(assessment.factor_contributions),
        review_reasons:       safeParseJson(assessment.review_reasons),
      } : null,
      quote: quotes?.[0] || null,
      review_case: reviews?.[0] || null,
      accidents: accidents || [],
    });
  } catch (err) { next(err); }
});

router.get('/:id/readings', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data: trip } = await db.from('trips').select('id').eq('id', req.params.id).eq('user_id', req.userId).single();
    if (!trip) return next(createError(404, 'Trip not found'));

    const { data: readings, error } = await db.from('telemetry_readings').select('*')
      .eq('trip_id', req.params.id).order('sequence_number', { ascending: true });

    if (error) return next(createError(500, error.message));
    res.json({ readings: readings || [], count: (readings || []).length });
  } catch (err) { next(err); }
});

function safeParseJson(val: any): any {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

export default router;
