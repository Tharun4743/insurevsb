/**
 * Audit Routes
 * GET /api/audit — get audit history for current user
 */
'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getAuditHistory } = require('../services/auditService');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const events = await getAuditHistory(req.userId, limit);
    res.json({ events, total: events.length });
  } catch (err) { next(err); }
});

module.exports = router;
