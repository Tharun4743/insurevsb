/**
 * Assessments Routes
 * GET /api/assessments        — list assessments for user
 * GET /api/assessments/:id    — get single assessment
 */
'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getClient } = require('../db/client');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const db = getClient();
    const { data, error } = await db.from('risk_assessments').select('*')
      .eq('user_id', req.userId).order('created_at', { ascending: false }).limit(50);
    if (error) return next(createError(500, error.message));
    res.json({ assessments: (data || []).map(parseAssessment) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = getClient();
    const { data, error } = await db.from('risk_assessments').select('*')
      .eq('id', req.params.id).eq('user_id', req.userId).single();
    if (error || !data) return next(createError(404, 'Assessment not found'));
    res.json({ assessment: parseAssessment(data) });
  } catch (err) { next(err); }
});

function parseAssessment(a) {
  return {
    ...a,
    factor_contributions: safeJson(a.factor_contributions),
    review_reasons: safeJson(a.review_reasons),
  };
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

module.exports = router;
