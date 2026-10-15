'use strict';

const { validateReadings, validateReading, RULES } = require('../src/services/validationService');
const { runSimulation } = require('../src/services/simulatorService');

describe('Validation Service', () => {
  test('validates smooth scenario with status valid', () => {
    const sim = runSimulation('smooth', 20);
    const result = validateReadings(sim.readings);
    expect(result.status).toBe('valid');
    expect(result.valid_count).toBe(20);
    expect(result.error_count).toBe(0);
    expect(result.completeness_pct).toBe(100);
  });

  test('flags invalid_data scenario as warning or review_required with issues detected', () => {
    const sim = runSimulation('invalid_data', 40);
    const result = validateReadings(sim.readings);
    expect(['warning', 'review_required']).toContain(result.status);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('catches out of range speeds', () => {
    const reading = {
      sequence_number: 1,
      timestamp: new Date().toISOString(),
      speed_kmh: 350, // exceeds max speed 300
      distance_km: 1.0,
      acceleration_ms2: 0,
    };
    const issues = validateReading(reading, new Set(), 0, 0);
    expect(issues.some(i => i.code === 'OUT_OF_RANGE' && i.field === 'speed_kmh')).toBe(true);
  });

  test('catches duplicate sequence numbers', () => {
    const seen = new Set([1]);
    const reading = {
      sequence_number: 1,
      timestamp: new Date().toISOString(),
      speed_kmh: 50,
      distance_km: 1.0,
      acceleration_ms2: 0,
    };
    const issues = validateReading(reading, seen, 0, 0);
    expect(issues.some(i => i.code === 'DUPLICATE_SEQUENCE')).toBe(true);
  });

  test('requires minimum reading count', () => {
    const fewReadings = [
      { sequence_number: 1, timestamp: new Date().toISOString(), speed_kmh: 30, distance_km: 0.1, acceleration_ms2: 0 },
      { sequence_number: 2, timestamp: new Date(Date.now() + 5000).toISOString(), speed_kmh: 35, distance_km: 0.2, acceleration_ms2: 0 },
    ];
    const result = validateReadings(fewReadings);
    expect(result.status).toBe('review_required');
    expect(result.review_reasons.some(r => r.includes('Insufficient readings'))).toBe(true);
  });
});
