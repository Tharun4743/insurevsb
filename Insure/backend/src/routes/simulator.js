/**
 * Simulator Routes
 * POST /api/simulator/run       — generate synthetic trip and persist it end-to-end
 * GET  /api/simulator/scenarios — list available scenarios
 */
'use strict';

const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { hasActiveConsent } = require('../services/consentService');
const { runSimulation, SCENARIO_METADATA } = require('../services/simulatorService');
const { validateReadings } = require('../services/validationService');
const { extractFeatures } = require('../services/featureService');
const { calculateScore } = require('../services/scoringService');
const { calculateQuote } = require('../services/pricingService');
const { getAccidentHistory, seedScenarioAccidents } = require('../services/accidentService');
const { getClient } = require('../db/client');
const { logAuditEvent } = require('../services/auditService');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

const RunSchema = z.object({
  scenario: z.enum([
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
  ]).default('scenario_a_safe'),
  reading_count: z.number().int().min(4).max(500).default(60),
});

router.get('/scenarios', (req, res) => {
  const scenariosList = [
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
    disclaimer: 'All scenarios produce SYNTHETIC data. Not real vehicle telemetry.',
  });
});

router.post('/run', async (req, res, next) => {
  try {
    // Validate request body
    const parsed = RunSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }
    const { scenario, reading_count } = parsed.data;

    // Enforce consent
    const consented = await hasActiveConsent(req.userId);
    if (!consented) {
      return next(createError(403, 'Active consent required before processing trip data.'));
    }

    const db = getClient();
    const now = new Date().toISOString();
    const tripId = uuidv4();

    // 0. Seed or align accident records for the selected scenario
    await seedScenarioAccidents(req.userId, scenario);
    const accidentHistory = await getAccidentHistory(req.userId);

    // 1. Generate synthetic readings
    const simulation = runSimulation(scenario, reading_count);

    // 2. Validate data quality
    const validationResult = validateReadings(simulation.readings);

    // 3. Extract features (normalised by driving exposure per 100 km)
    const metrics = extractFeatures(simulation.readings, validationResult);

    // 4. Score driving behaviour (5 weighted indicators, 0-100 scale)
    const assessment = calculateScore(metrics);

    // 5. Quote (fair premium engine, separated behaviour & claims adjustment)
    const quote = calculateQuote(assessment, accidentHistory);

    // 6. Persist trip
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

    // 7. Persist readings (batch)
    const readingRecords = simulation.readings.map(r => ({
      id: uuidv4(),
      trip_id: tripId,
      user_id: req.userId,
      sequence_number: r.sequence_number,
      timestamp: r.timestamp,
      speed_kmh: r.speed_kmh ?? null,
      distance_km: r.distance_km ?? null,
      acceleration_ms2: r.acceleration_ms2 ?? null,
      event_type: r.event_type ?? null,
      source: 'simulator',
      synthetic: true,
      injected_defect: r._injected_defect ?? null,
      created_at: now,
    }));
    await db.from('telemetry_readings').insert(readingRecords);

    // 8. Persist metrics
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
      created_at: now,
    };
    await db.from('trip_metrics').insert(metricsRecord);

    // 9. Persist assessment (with fair safety score & driver classification)
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

    // 10. Persist quote (with separate behaviour and accident adjustments)
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
      accident_adjustment: quote.accident_adjustment,
      explanation: quote.explanation,
      status: quote.status,
      rule_version: quote.rule_version,
      currency: quote.currency,
      created_at: now,
    };
    await db.from('quotes').insert(quoteRecord);

    // 11. Create review case if needed
    let reviewCase = null;
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

    // 12. Audit
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
      disclaimer: 'SYNTHETIC DATA — PROTOTYPE ONLY. Not real insurance.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
