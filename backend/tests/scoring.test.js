'use strict';

const { calculateScore } = require('../src/services/scoringService');

describe('Scoring Service', () => {
  test('returns 100 for a perfect trip without penalties', () => {
    const perfectMetrics = {
      avg_speed_kmh: 50,
      harsh_braking_count: 0,
      rapid_accel_count: 0,
      data_quality_status: 'valid',
    };
    const assessment = calculateScore(perfectMetrics);
    expect(assessment.status).toBe('scored');
    expect(assessment.score).toBe(100);
    expect(assessment.factor_contributions.base_score).toBe(100);
    expect(Math.abs(assessment.factor_contributions.harsh_braking_penalty)).toBe(0);
    expect(Math.abs(assessment.factor_contributions.rapid_accel_penalty)).toBe(0);
    expect(Math.abs(assessment.factor_contributions.speed_penalty)).toBe(0);
    expect(Math.abs(assessment.factor_contributions.data_quality_penalty)).toBe(0);
  });

  test('deducts points for harsh braking and rapid accel events accurately', () => {
    const harshMetrics = {
      avg_speed_kmh: 60,
      harsh_braking_count: 3, // 3 * 3 = 9 pts
      rapid_accel_count: 2,   // 2 * 2 = 4 pts
      data_quality_status: 'valid',
    };
    const assessment = calculateScore(harshMetrics);
    expect(assessment.status).toBe('scored');
    expect(assessment.factor_contributions.harsh_braking_penalty).toBe(-9);
    expect(assessment.factor_contributions.rapid_accel_penalty).toBe(-4);
    expect(assessment.score).toBe(87);
  });

  test('applies data quality penalty for warning status', () => {
    const warningMetrics = {
      avg_speed_kmh: 50,
      harsh_braking_count: 0,
      rapid_accel_count: 0,
      data_quality_status: 'warning',
    };
    const assessment = calculateScore(warningMetrics);
    expect(assessment.status).toBe('scored');
    expect(assessment.factor_contributions.data_quality_penalty).toBe(-5);
    expect(assessment.score).toBe(95);
  });

  test('returns review_required and score null when data quality status is review_required', () => {
    const invalidMetrics = {
      avg_speed_kmh: 50,
      harsh_braking_count: 0,
      rapid_accel_count: 0,
      data_quality_status: 'review_required',
    };
    const assessment = calculateScore(invalidMetrics);
    expect(assessment.status).toBe('review_required');
    expect(assessment.score).toBeNull();
    expect(assessment.factor_contributions).toBeNull();
    expect(assessment.review_reasons.length).toBeGreaterThan(0);
  });
});
