/**
 * Accident & Claims Records API
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  getAccidentHistory,
  recordAccident,
  clearAccidents,
  seedScenarioAccidents,
} from '../services/accidentService';
import { createError } from '../middleware/errorHandler';

const router = express.Router();
router.use(requireAuth);

const AccidentSchema = z.object({
  driver_name: z.string().optional(),
  accident_date: z.string().optional(),
  fault_status: z.enum(['driver_fault', 'third_party_fault', 'no_fault_weather', 'unknown']).default('unknown'),
  claim_frequency: z.number().int().min(1).default(1),
  claim_severity: z.enum(['minor', 'moderate', 'severe']).default('minor'),
  claim_amount: z.number().min(0).default(0.00),
  is_verified: z.boolean().default(true),
  description: z.string().min(3),
});

router.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const history = await getAccidentHistory(req.userId);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = AccidentSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }
    const created = await recordAccident(req.userId, parsed.data);
    res.status(201).json({
      message: 'Accident record stored separately from driving telemetry.',
      record: created,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    await clearAccidents(req.userId);
    res.json({ message: 'Accident history reset successfully for user.' });
  } catch (err) {
    next(err);
  }
});

router.post('/seed', async (req: any, res: Response, next: NextFunction) => {
  try {
    const scenario = req.body.scenario || 'scenario_a_safe';
    await seedScenarioAccidents(req.userId, scenario);
    const history = await getAccidentHistory(req.userId);
    res.json({
      message: `Accidents seeded for scenario "${scenario}".`,
      history,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
