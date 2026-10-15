/**
 * Audit Routes
 * GET /api/audit — get audit history for current user
 */

import express, { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { getAuditHistory } from '../services/auditService';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '100', 10), 500);
    const events = await getAuditHistory(req.userId, limit);
    res.json({ events, total: events.length });
  } catch (err) { next(err); }
});

export default router;
