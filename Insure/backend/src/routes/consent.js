/**
 * Consent Routes
 * GET  /api/consent        — get current consent status
 * POST /api/consent/grant  — grant consent
 * POST /api/consent/withdraw — withdraw consent
 */
'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getConsent, grantConsent, withdrawConsent } = require('../services/consentService');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const consent = await getConsent(req.userId);
    res.json({
      consent,
      has_active_consent: consent?.status === 'granted',
      user_id: req.userId,
    });
  } catch (err) { next(err); }
});

router.post('/grant', async (req, res, next) => {
  try {
    const consent = await grantConsent(req.userId);
    res.status(201).json({ consent, message: 'Consent granted.' });
  } catch (err) { next(err); }
});

router.post('/withdraw', async (req, res, next) => {
  try {
    const result = await withdrawConsent(req.userId);
    res.json({ ...result, message: 'Consent withdrawn. Future processing is paused.' });
  } catch (err) { next(err); }
});

module.exports = router;
