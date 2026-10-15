/**
 * Consent Routes
 * GET  /api/consent        — get current consent status
 * POST /api/consent/grant  — grant consent
 * POST /api/consent/withdraw — withdraw consent
 */

import express, { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { getConsent, grantConsent, withdrawConsent } from '../services/consentService';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const consent = await getConsent(req.userId);
    res.json({
      consent,
      has_active_consent: consent?.status === 'granted',
      user_id: req.userId,
    });
  } catch (err) { next(err); }
});

router.post('/grant', async (req: any, res: Response, next: NextFunction) => {
  try {
    const consent = await grantConsent(req.userId);
    res.status(201).json({ consent, message: 'Consent granted.' });
  } catch (err) { next(err); }
});

router.post('/withdraw', async (req: any, res: Response, next: NextFunction) => {
  try {
    const result = await withdrawConsent(req.userId);
    res.json({ ...result, message: 'Consent withdrawn. Future processing is paused.' });
  } catch (err) { next(err); }
});

export default router;
