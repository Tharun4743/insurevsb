/**
 * Fair Risk Scoring & Dynamic Premium Algorithm Acceptance Test Suite
 *
 * Verifies all 10 Acceptance Criteria specified in Section 9:
 * 1. A safe driver with no accidents can qualify for the configured discount.
 * 2. A driver with no accidents but repeated risky behaviour is not automatically assigned the lowest risk.
 * 3. A first accident does not automatically trigger the highest-risk category.
 * 4. Unknown fault or responsibility is not silently treated as driver fault.
 * 5. Insufficient data does not produce an unjustified safety discount.
 * 6. Driving-event rates account for distance travelled.
 * 7. Identical inputs and configuration produce identical results.
 * 8. Premium adjustments follow the configured thresholds exactly.
 * 9. Claims are not automatically reduced or rejected based on a driving-risk score.
 * 10. Existing project functionality continues to work after the changes.
 */

'use strict';

const { calculateScore } = require('../src/services/scoringService');
const { calculateQuote, BASE_PREMIUM } = require('../src/services/pricingService');
const { runSimulation, SeededRandom } = require('../src/services/simulatorService');
const { extractFeatures } = require('../src/services/featureService');
const { validateReadings } = require('../src/services/validationService');

describe('Fair Telematics & Pricing Acceptance Criteria (Section 9)', () => {

  // Criterion 1: Safe driver with no accidents can qualify for the configured discount
  test('Criterion 1: Safe driver with no accidents qualifies for 10% discount (₹1,800 from ₹2,000 base)', () => {
    const sim = runSimulation('scenario_a_safe', 50);
    const val = validateReadings(sim.readings);
    const metrics = extractFeatures(sim.readings, val);
    const assessment = calculateScore(metrics);
    const quote = calculateQuote(assessment, { previous_accidents_count: 0 });

    expect(assessment.safety_score).toBeGreaterThanOrEqual(80);
    expect(assessment.risk_category).toBe('low_risk');
    expect(quote.base_premium).toBe(2000);
    expect(quote.behaviour_adjustment).toBe(-200); // 10% discount
    expect(quote.illustrative_estimate).toBe(1800);
  });

  // Criterion 2: Driver with no accidents but repeated risky behaviour is not automatically assigned lowest risk
  test('Criterion 2: Driver with no accidents but repeated risky behaviour receives High Risk assessment (+20% surcharge, ₹2,400)', () => {
    const sim = runSimulation('scenario_b_risky_no_accidents', 60);
    const val = validateReadings(sim.readings);
    const metrics = extractFeatures(sim.readings, val);
    const assessment = calculateScore(metrics);
    // Explicitly 0 accidents
    const quote = calculateQuote(assessment, { previous_accidents_count: 0 });

    expect(assessment.safety_score).toBeLessThan(50);
    expect(assessment.risk_category).toBe('high_risk');
    expect(quote.behaviour_adjustment).toBe(400); // +20% surcharge
    expect(quote.illustrative_estimate).toBe(2400);
    expect(quote.accident_adjustment).toBe(0);
  });

  // Criterion 3: A first accident does not automatically trigger the highest-risk category
  test('Criterion 3: A first accident for an otherwise safe driver does not trigger High Risk or strip safe status', () => {
    const sim = runSimulation('scenario_c_first_accident_safe', 50);
    const val = validateReadings(sim.readings);
    const metrics = extractFeatures(sim.readings, val);
    const assessment = calculateScore(metrics);
    const accidentHistory = {
      previous_accidents_count: 1,
      fault_status: 'third_party_fault',
      is_verified: true,
      description: 'Rear-ended at traffic signal while stationary.',
    };
    const quote = calculateQuote(assessment, accidentHistory);

    expect(assessment.safety_score).toBeGreaterThanOrEqual(80);
    expect(assessment.risk_category).toBe('low_risk'); // Not moved to high risk!
    expect(quote.behaviour_adjustment).toBe(-200);
    expect(quote.illustrative_estimate).toBe(1800);
  });

  // Criterion 4: Unknown fault or responsibility is not silently treated as driver fault
  test('Criterion 4: Unknown fault or third-party responsibility is not treated as driver fault', () => {
    const assessment = {
      safety_score: 90,
      risk_category: 'low_risk',
      status: 'scored',
    };
    const unknownFaultHistory = {
      previous_accidents_count: 1,
      fault_status: 'unknown',
    };
    const quote = calculateQuote(assessment, unknownFaultHistory);

    expect(quote.accident_adjustment).toBe(0); // 0% surcharge for unknown fault
    expect(quote.accident_notes).toMatch(/no\/unknown driver fault/i);
  });

  // Criterion 5: Insufficient data does not produce an unjustified safety discount
  test('Criterion 5: Insufficient data produces standard default base premium (₹2,000) without unearned discount', () => {
    const sim = runSimulation('scenario_e_insufficient_data', 4);
    const val = validateReadings(sim.readings);
    const metrics = extractFeatures(sim.readings, val);
    const assessment = calculateScore(metrics);
    const quote = calculateQuote(assessment);

    expect(assessment.risk_category).toBe('new_insufficient_data');
    expect(assessment.safety_score).toBeNull(); // Did not fabricate a score
    expect(quote.status).toBe('provisional_default');
    expect(quote.illustrative_estimate).toBe(2000); // Base default, no 10% discount
    expect(quote.behaviour_adjustment).toBe(0);
  });

  // Criterion 6: Driving-event rates account for distance travelled (normalised per 100 km)
  test('Criterion 6: Event rates are normalised per distance travelled so long vs short trips are compared fairly', () => {
    // 5 harsh braking events in 100 km vs 5 harsh braking events in 5 km
    const longTripMetrics = {
      total_distance_km: 100.0,
      harsh_braking_count: 5,
      data_confidence: 'high',
      harsh_braking_rate_per_100km: 5.0, // (5 / 100) * 100 = 5 / 100km
    };
    const shortTripMetrics = {
      total_distance_km: 5.0,
      harsh_braking_count: 5,
      data_confidence: 'high',
      harsh_braking_rate_per_100km: 100.0, // (5 / 5) * 100 = 100 / 100km
    };

    const longAssessment = calculateScore(longTripMetrics);
    const shortAssessment = calculateScore(shortTripMetrics);

    // The short trip has a much higher rate per 100 km and thus higher risk
    expect(longAssessment.driving_risk_score).toBeLessThan(shortAssessment.driving_risk_score);
    expect(longAssessment.safety_score).toBeGreaterThan(shortAssessment.safety_score);
  });

  // Criterion 7: Identical inputs and configuration produce identical results
  test('Criterion 7: Pure deterministic algorithm produces identical outputs for identical inputs', () => {
    const fixedTime = 1700000000000;
    const sim1 = runSimulation('scenario_a_safe', 50, fixedTime);
    const sim2 = runSimulation('scenario_a_safe', 50, fixedTime);
    expect(sim1.readings).toEqual(sim2.readings);

    const metrics1 = extractFeatures(sim1.readings, validateReadings(sim1.readings));
    const metrics2 = extractFeatures(sim2.readings, validateReadings(sim2.readings));
    expect(metrics1.total_distance_km).toEqual(metrics2.total_distance_km);
    expect(metrics1.harsh_braking_rate_per_100km).toEqual(metrics2.harsh_braking_rate_per_100km);
    expect(metrics1.speeding_pct).toEqual(metrics2.speeding_pct);

    const score1 = calculateScore(metrics1);
    const score2 = calculateScore(metrics2);
    expect(score1.safety_score).toBe(score2.safety_score);
    expect(score1.driving_risk_score).toBe(score2.driving_risk_score);
    expect(score1.risk_category).toBe(score2.risk_category);
  });

  // Criterion 8: Premium adjustments follow the configured thresholds exactly
  test('Criterion 8: Premium adjustments follow the exact configured tiers (80-100: -10%, 50-79.99: 0%, <50: +20%)', () => {
    const safeTier = calculateQuote({ safety_score: 80, status: 'scored' });
    expect(safeTier.illustrative_estimate).toBe(1800); // 2000 * 0.90
    expect(safeTier.behaviour_adjustment).toBe(-200);

    const moderateTier = calculateQuote({ safety_score: 79.9, status: 'scored' });
    expect(moderateTier.illustrative_estimate).toBe(2000); // 2000 * 1.00
    expect(moderateTier.behaviour_adjustment).toBe(0);

    const riskyTier = calculateQuote({ safety_score: 49.9, status: 'scored' });
    expect(riskyTier.illustrative_estimate).toBe(2400); // 2000 * 1.20
    expect(riskyTier.behaviour_adjustment).toBe(400);
  });

  // Criterion 9: Claims are not automatically reduced or rejected based on a driving-risk score
  test('Criterion 9: Legitimate claims protection guarantee is strictly enforced', () => {
    // Risky driver with low safety score
    const quote = calculateQuote({ safety_score: 20, status: 'scored' });
    expect(quote.claims_protection_clause).toBeDefined();
    expect(quote.claims_protection_clause).toContain('NEVER reduced, delayed, or rejected based on telematics risk scores');
  });

  // Criterion 10: Existing project functionality continues to work after the changes
  test('Criterion 10: Validation, feature extraction, scoring, and pricing execute seamlessly as an end-to-end pipeline', () => {
    const sim = runSimulation('smooth', 60);
    const val = validateReadings(sim.readings);
    expect(val.status).toBe('valid');

    const metrics = extractFeatures(sim.readings, val);
    expect(metrics.total_distance_km).toBeGreaterThan(0);

    const assessment = calculateScore(metrics);
    expect(assessment.status).toBe('scored');

    const quote = calculateQuote(assessment);
    expect(quote.status).toBe('generated');
    expect(quote.illustrative_estimate).toBeGreaterThan(0);
  });
});
