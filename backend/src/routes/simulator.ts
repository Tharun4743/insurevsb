/**
 * Simulator Routes
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth';
import { hasActiveConsent } from '../services/consentService';
import {
  runSimulation,
  SCENARIO_METADATA,
  createSession,
  pauseSession,
  resumeSession,
  stopSession,
  resetSession,
  getSessionStatus,
} from '../services/simulatorService';
import { validateReadings } from '../services/validationService';
import { extractFeatures } from '../services/featureService';
import { calculateScore } from '../services/scoringService';
import { calculateQuote } from '../services/pricingService';
import { getAccidentHistory, seedScenarioAccidents } from '../services/accidentService';
import { getClient } from '../db/client';
import { logAuditEvent } from '../services/auditService';
import { createError } from '../middleware/errorHandler';

const router = express.Router();
router.use(requireAuth);

const RunSchema = z.object({
  scenario: z.enum([
    'safe',
    'normal',
    'risky',
    'night',
    'scenario_a_safe',
    'scenario_b_risky_no_accidents',
    'scenario_c_first_accident_safe',
    'scenario_d_repeated_accidents_risky',
    'scenario_e_insufficient_data',
    'smooth',
    'harsh_events',
    'invalid_data',
    'driver_a_safe',
    'driver_b_risky',
  ]).default('safe'),
  reading_count: z.number().int().min(4).max(500).default(60),
  vehicle_id: z.string().optional().default('KA-01-MJ-5678'),
});

const SessionActionSchema = z.object({
  session_id: z.string().uuid(),
});

router.get('/scenarios', (req: Request, res: Response) => {
  const scenariosList = [
    {
      id: 'safe',
      label: 'SAFE: Smooth & Defensive Driving',
      driver_name: 'Driver A',
      category: 'Low Risk',
      expected_score: '80–100',
      expected_premium: '₹1,800 (−10% discount)',
      description: 'Plausible route and timestamps, smooth speed changes (35–65 km/h), zero speeding breaches. Qualifies for 10% discount (₹1,800 from ₹2,000 base).',
    },
    {
      id: 'normal',
      label: 'NORMAL: Everyday Mixed Traffic',
      driver_name: 'Driver Normal',
      category: 'Moderate Risk',
      expected_score: '65–79',
      expected_premium: '₹2,000 (Standard Base)',
      description: 'Mixed but plausible urban driving conditions, moderate speed changes, occasional mild event. Standard base premium applies (₹2,000).',
    },
    {
      id: 'risky',
      label: 'RISKY: Aggressive Telematics (No Claims)',
      driver_name: 'Driver B',
      category: 'High Risk',
      expected_score: '< 50',
      expected_premium: '₹2,400 (+20% surcharge)',
      description: 'Deliberately simulated speeding (90–135 km/h), harsh braking spikes, and rapid acceleration. High risk surcharge applies (+20%, ₹2,400).',
    },
    {
      id: 'night',
      label: 'NIGHT: Nighttime Driving Journey',
      driver_name: 'Night Driver',
      category: 'Measured Exposure',
      expected_score: 'Exposure Based',
      expected_premium: '₹1,800–₹2,000',
      description: 'A journey occurring during local nighttime hours (23:00 to 05:00). Exposure calculated strictly from valid distance and timestamps.',
    },
    {
      id: 'scenario_a_safe',
      label: 'Scenario A: Safe Driver (No Accidents)',
      driver_name: 'Driver A',
      category: 'Low Risk',
      expected_score: '80–100',
      expected_premium: '₹1,800 (−10% discount)',
      description: 'Consistently safe driving behaviour, verified exposure, 0 accidents. Qualifies for 10% discount (₹1,800 from ₹2,000 base).',
    },
    {
      id: 'scenario_b_risky_no_accidents',
      label: 'Scenario B: Dangerous Driving (No Accidents)',
      driver_name: 'Driver B',
      category: 'High Risk',
      expected_score: '< 50',
      expected_premium: '₹2,400 (+20% surcharge)',
      description: 'High speeding and harsh braking with 0 accidents. Demonstrates no automatic discount without safe driving (+20% surcharge, ₹2,400).',
    },
    {
      id: 'scenario_c_first_accident_safe',
      label: 'Scenario C: First Accident (Otherwise Safe Driver)',
      driver_name: 'Driver A',
      category: 'Low Risk',
      expected_score: '80–100',
      expected_premium: '₹1,800 (Discount preserved)',
      description: 'Previously safe driver experiencing a first non-fault/third-party incident. Reassessed fairly without assuming fault (₹1,800).',
    },
    {
      id: 'scenario_d_repeated_accidents_risky',
      label: 'Scenario D: Repeated Accidents & Risky Behaviour',
      driver_name: 'Driver B',
      category: 'High Risk',
      expected_score: '< 50',
      expected_premium: '₹2,800 (+20% behaviour + +20% claims)',
      description: 'Aggressive driving combined with 2 verified at-fault claims. Fairly assessed with separate adjustments (₹2,800).',
    },
    {
      id: 'scenario_e_insufficient_data',
      label: 'Scenario E: Insufficient Data / New Customer',
      driver_name: 'New Driver',
      category: 'New / Insufficient Data',
      expected_score: 'Provisional (null)',
      expected_premium: '₹2,000 (Default Standard)',
      description: 'Few telemetry points (< 1 km). System indicates insufficient data; approved standard base premium ₹2,000 applies.',
    },
  ];

  res.json({
    scenarios: scenariosList,
    disclaimer: 'All scenarios produce SYNTHETIC data. Not real vehicle telemetry. Clearly labeled for demonstration.',
  });
});

router.post('/run', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = RunSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }
    const { scenario, reading_count, vehicle_id } = parsed.data;

    const consented = await hasActiveConsent(req.userId);
    if (!consented) {
      return next(createError(403, 'Active consent required before processing trip data.'));
    }

    const db = getClient();
    const now = new Date().toISOString();
    const tripId = uuidv4();

    await seedScenarioAccidents(req.userId, scenario);
    const accidentHistory = await getAccidentHistory(req.userId);

    const simulation = runSimulation(scenario, reading_count);
    const validationResult = validateReadings(simulation.readings);
    const metrics = extractFeatures(simulation.readings, validationResult);
    const assessment = calculateScore(metrics);
    const quote = calculateQuote(assessment, accidentHistory);

    const tripRecord = {
      id: tripId,
      user_id: req.userId,
      scenario,
      source: 'simulator',
      synthetic: true,
      status: validationResult.status,
      reading_count: simulation.reading_count,
      started_at: simulation.readings[0]?.timestamp ?? now,
      ended_at: simulation.readings[simulation.readings.length - 1]?.timestamp ?? now,
      created_at: now,
      updated_at: now,
    };
    await db.from('trips').insert(tripRecord);

    const readingRecords = simulation.readings.map((r: any) => ({
      id: uuidv4(),
      trip_id: tripId,
      user_id: req.userId,
      sequence_number: r.sequence_number,
      timestamp: r.timestamp,
      speed_kmh: r.speed_kmh ?? null,
      distance_km: r.distance_km ?? null,
      acceleration_ms2: r.acceleration_ms2 ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      odometer_km: r.odometer_km ?? null,
      ignition_state: r.ignition_state || 'ON',
      provider_id: r.provider_id || 'simulated_telematics_v1',
      device_id: r.device_id || 'SIM-GPS-001',
      vehicle_id: r.vehicle_id || vehicle_id || 'KA-01-MJ-5678',
      driver_id: r.driver_id || null,
      event_type: r.event_type ?? null,
      source: 'simulator',
      provenance: 'simulated',
      synthetic: true,
      injected_defect: r._injected_defect ?? null,
      created_at: now,
    }));
    await db.from('telemetry_readings').insert(readingRecords);

    const metricsRecord = {
      id: uuidv4(),
      trip_id: tripId,
      user_id: req.userId,
      total_distance_km: metrics.total_distance_km,
      duration_sec: metrics.duration_sec,
      avg_speed_kmh: metrics.avg_speed_kmh,
      max_speed_kmh: metrics.max_speed_kmh,
      harsh_braking_count: metrics.harsh_braking_count,
      rapid_accel_count: metrics.rapid_accel_count,
      invalid_reading_count: metrics.invalid_reading_count,
      data_quality_status: metrics.data_quality_status,
      completeness_pct: metrics.completeness_pct,
      night_driving_pct: metrics.night_driving_pct,
      night_driving_distance_km: metrics.night_driving_distance_km,
      night_driving_status: metrics.night_driving_status,
      harsh_cornering_count: metrics.harsh_cornering_count,
      unsafe_usage_count: metrics.unsafe_usage_count,
      distracted_driving_count: metrics.distracted_driving_count,
      created_at: now,
    };
    await db.from('trip_metrics').insert(metricsRecord);

    const assessmentRecord = {
      id: uuidv4(),
      trip_id: tripId,
      user_id: req.userId,
      score: assessment.score,
      status: assessment.status,
      factor_contributions: JSON.stringify(assessment.factor_contributions),
      explanation: assessment.explanation,
      rule_version: assessment.rule_version,
      review_reasons: JSON.stringify(assessment.review_reasons),
      safety_score: assessment.safety_score,
      risk_category: assessment.risk_category,
      driving_risk_score: assessment.driving_risk_score,
      data_confidence: assessment.data_confidence,
      created_at: now,
    };
    await db.from('risk_assessments').insert(assessmentRecord);

    const quoteRecord = {
      id: uuidv4(),
      trip_id: tripId,
      assessment_id: assessmentRecord.id,
      user_id: req.userId,
      illustrative_estimate: quote.illustrative_estimate,
      base_premium: quote.base_premium,
      risk_adjustment: quote.risk_adjustment,
      risk_adjustment_pct: quote.risk_adjustment_pct,
      behaviour_adjustment: quote.behaviour_adjustment,
      behaviour_adjustment_pct: quote.behaviour_adjustment_pct,
      accident_adjustment: quote.accident_adjustment,
      accident_adjustment_pct: quote.accident_adjustment_pct,
      explanation: quote.explanation,
      status: quote.status,
      rule_version: quote.rule_version,
      currency: quote.currency,
      data_quality_state: validationResult.status,
      consent_status: 'acknowledged',
      input_metrics: JSON.stringify(metrics),
      created_at: now,
    };
    await db.from('quotes').insert(quoteRecord);

    let reviewCase: any = null;
    if (assessment.status === 'review_required') {
      const reviewRecord = {
        id: uuidv4(),
        trip_id: tripId,
        assessment_id: assessmentRecord.id,
        user_id: req.userId,
        reason: (assessment.review_reasons || []).join('; ') || 'Data review required',
        status: 'pending',
        created_at: now,
        updated_at: now,
      };
      await db.from('review_cases').insert(reviewRecord);
      reviewCase = reviewRecord;
      await logAuditEvent(req.userId, 'review_case_created', { trip_id: tripId, reason: reviewRecord.reason });
    }

    await logAuditEvent(req.userId, 'trip_submitted', { trip_id: tripId, scenario });
    await logAuditEvent(req.userId, 'validation_completed', { trip_id: tripId, status: validationResult.status });
    await logAuditEvent(req.userId, 'assessment_created', {
      trip_id: tripId,
      safety_score: assessment.safety_score,
      risk_category: assessment.risk_category,
    });
    await logAuditEvent(req.userId, 'quote_generated', {
      trip_id: tripId,
      estimate: quote.illustrative_estimate,
      behaviour_adj: quote.behaviour_adjustment,
      accident_adj: quote.accident_adjustment,
    });

    res.status(201).json({
      trip_id: tripId,
      scenario,
      simulation: {
        reading_count: simulation.reading_count,
        synthetic: true,
        metadata: simulation.metadata,
      },
      validation: validationResult,
      metrics,
      assessment: {
        ...assessmentRecord,
        factor_contributions: assessment.factor_contributions,
        review_reasons: assessment.review_reasons,
      },
      quote: {
        ...quoteRecord,
        accident_notes: quote.accident_notes,
        claims_protection_clause: quote.claims_protection_clause,
      },
      accident_history: accidentHistory,
      review_case: reviewCase,
      disclaimer: 'SYNTHETIC DATA — PROTOTYPE ONLY. Not real insurance. Clearly labeled simulation.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/session/start', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = RunSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const consented = await hasActiveConsent(req.userId);
    if (!consented) {
      return next(createError(403, 'Active consent required before starting simulation session.'));
    }

    const session = createSession(req.userId, {
      scenario: parsed.data.scenario,
      readingCount: parsed.data.reading_count,
      vehicleId: parsed.data.vehicle_id,
    });

    const db = getClient();
    await db.from('simulation_sessions').insert({
      id: session.id,
      user_id: req.userId,
      scenario: session.scenario,
      vehicle_id: session.vehicleId,
      status: 'running',
      reading_count: session.readingCount,
      started_at: session.startedAt,
      created_at: session.startedAt,
      updated_at: session.updatedAt,
    }).catch(() => {});

    await logAuditEvent(req.userId, 'simulation_session_started', {
      session_id: session.id,
      scenario: session.scenario,
    });

    res.status(201).json({
      session_id: session.id,
      status: 'running',
      scenario: session.scenario,
      reading_count: session.readingCount,
      metadata: session.metadata,
      started_at: session.startedAt,
      message: 'Simulation session initiated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/session/pause', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = SessionActionSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(400, 'Valid session_id required.'));

    const session = pauseSession(parsed.data.session_id, req.userId);

    const db = getClient();
    await db.from('simulation_sessions').update({
      status: 'paused',
      paused_at: session.pausedAt,
      updated_at: session.updatedAt,
    }).eq('id', session.id).catch(() => {});

    await logAuditEvent(req.userId, 'simulation_session_paused', { session_id: session.id });

    res.json({
      session_id: session.id,
      status: 'paused',
      message: 'Simulation session paused.',
      updated_at: session.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/session/resume', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = SessionActionSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(400, 'Valid session_id required.'));

    const session = resumeSession(parsed.data.session_id, req.userId);

    const db = getClient();
    await db.from('simulation_sessions').update({
      status: 'running',
      updated_at: session.updatedAt,
    }).eq('id', session.id).catch(() => {});

    await logAuditEvent(req.userId, 'simulation_session_resumed', { session_id: session.id });

    res.json({
      session_id: session.id,
      status: 'running',
      message: 'Simulation session resumed.',
      updated_at: session.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/session/stop', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = SessionActionSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(400, 'Valid session_id required.'));

    const session = stopSession(parsed.data.session_id, req.userId);

    const readings = session.allReadings;
    const validationResult = validateReadings(readings);
    const metrics = extractFeatures(readings, validationResult);
    const assessment = calculateScore(metrics);
    await seedScenarioAccidents(req.userId, session.scenario);
    const accidentHistory = await getAccidentHistory(req.userId);
    const quote = calculateQuote(assessment, accidentHistory);

    const db = getClient();
    const now = new Date().toISOString();
    const tripId = uuidv4();

    await db.from('trips').insert({
      id: tripId,
      user_id: req.userId,
      scenario: session.scenario,
      source: 'simulator',
      synthetic: true,
      status: validationResult.status,
      reading_count: readings.length,
      started_at: readings[0]?.timestamp ?? now,
      ended_at: readings[readings.length - 1]?.timestamp ?? now,
      created_at: now,
      updated_at: now,
    });

    await db.from('simulation_sessions').update({
      status: 'completed',
      trip_id: tripId,
      stopped_at: session.stoppedAt,
      updated_at: now,
    }).eq('id', session.id).catch(() => {});

    await logAuditEvent(req.userId, 'simulation_session_completed', {
      session_id: session.id,
      trip_id: tripId,
      safety_score: assessment.safety_score,
      premium: quote.illustrative_estimate,
    });

    res.json({
      session_id: session.id,
      status: 'completed',
      trip_id: tripId,
      scenario: session.scenario,
      validation: validationResult,
      metrics,
      assessment,
      quote,
      disclaimer: 'SYNTHETIC DATA — PROTOTYPE ONLY. Not real insurance.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/session/reset', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = SessionActionSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(400, 'Valid session_id required.'));

    const session = resetSession(parsed.data.session_id, req.userId);

    const db = getClient();
    await db.from('simulation_sessions').update({
      status: 'reset',
      current_seq: 0,
      updated_at: session.updatedAt,
    }).eq('id', session.id).catch(() => {});

    await logAuditEvent(req.userId, 'simulation_session_reset', { session_id: session.id });

    res.json({
      session_id: session.id,
      status: 'reset',
      message: 'Simulation session reset.',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/session/:id', (req: any, res: Response, next: NextFunction) => {
  const sessionStatus = getSessionStatus(req.params.id, req.userId);
  if (!sessionStatus) return next(createError(404, 'Session not found.'));
  res.json({ session: sessionStatus });
});

export default router;
