'use strict';

const { runSimulation, SeededRandom } = require('../src/services/simulatorService');

describe('Simulator Service', () => {
  test('SeededRandom produces deterministic pseudo-random sequences', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);
    const seq1 = [rng1.next(), rng1.next(), rng1.next()];
    const seq2 = [rng2.next(), rng2.next(), rng2.next()];
    expect(seq1).toEqual(seq2);
  });

  test('generates smooth scenario readings with realistic values', () => {
    const sim = runSimulation('smooth', 20);
    expect(sim.scenario).toBe('smooth');
    expect(sim.readings.length).toBe(20);
    expect(sim.synthetic).toBe(true);
    expect(sim.disclaimer).toMatch(/SYNTHETIC DATA/i);

    sim.readings.forEach((r, idx) => {
      expect(r.sequence_number).toBe(idx + 1);
      expect(r.speed_kmh).toBeGreaterThanOrEqual(0);
      expect(r.speed_kmh).toBeLessThanOrEqual(130);
      expect(r.synthetic).toBe(true);
    });
  });

  test('generates harsh_events scenario with braking and rapid accel events', () => {
    const sim = runSimulation('harsh_events', 40);
    expect(sim.scenario).toBe('harsh_events');
    const harshEvents = sim.readings.filter(r => r.event_type === 'harsh_braking' || r.event_type === 'rapid_accel');
    expect(harshEvents.length).toBeGreaterThan(0);
  });

  test('generates invalid_data scenario with injected defects', () => {
    const sim = runSimulation('invalid_data', 30);
    expect(sim.scenario).toBe('invalid_data');
    const defectReadings = sim.readings.filter(r => r._injected_defect != null || r.injected_defect != null);
    expect(defectReadings.length).toBeGreaterThan(0);
  });

  test('rejects invalid scenario names', () => {
    expect(() => runSimulation('invalid_unknown_scenario', 20)).toThrow(/Unknown scenario/i);
  });

  test('clamps reading count within acceptable bounds (10-500)', () => {
    const minSim = runSimulation('smooth', 2);
    expect(minSim.readings.length).toBe(10);

    const maxSim = runSimulation('smooth', 9999);
    expect(maxSim.readings.length).toBe(500);
  });
});
