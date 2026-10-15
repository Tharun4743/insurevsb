/**
 * Synthetic Telematics Simulator Service
 *
 * Generates structured, deterministic synthetic vehicle telemetry readings.
 * Supports all 5 fair actuarial scenarios and Driver A vs Driver B comparisons:
 *   1. scenario_a_safe               (Driver A: Consistent safe driving, high confidence, 0 accidents)
 *   2. scenario_b_risky_no_accidents (Driver B: Repeated risky driving, speeding, harsh events, 0 accidents)
 *   3. scenario_c_first_accident_safe(Driver A: Safe telematics, first recorded non-fault accident)
 *   4. scenario_d_repeated_accidents_risky (Driver B: Risky telematics, multiple verified at-fault claims)
 *   5. scenario_e_insufficient_data  (Provisional: Minimal distance/readings, insufficient data confidence)
 *
 * Backward-compatible aliases:
 *   - 'smooth'       -> scenario_a_safe
 *   - 'harsh_events' -> scenario_b_risky_no_accidents
 *   - 'invalid_data' -> simulateInvalidData
 *   - 'driver_a_safe'-> scenario_a_safe
 *   - 'driver_b_risky'-> scenario_b_risky_no_accidents
 *
 * All output is synthetic and clearly labelled.
 */

'use strict';

// ── Seeded LCG pseudo-random generator ───────────────────────────────────────
class SeededRandom {
  constructor(seed = 42) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  between(min, max) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    return Math.floor(this.between(min, max + 1));
  }
}

const SCENARIO_SEEDS = {
  smooth: 1001,
  harsh_events: 2002,
  invalid_data: 3003,
  scenario_a_safe: 1001,
  scenario_b_risky_no_accidents: 2002,
  scenario_c_first_accident_safe: 1001,
  scenario_d_repeated_accidents_risky: 2002,
  scenario_e_insufficient_data: 3003,
  driver_a_safe: 1001,
  driver_b_risky: 2002,
};

/**
 * Simulate Scenario A: Safe Driver (Driver A)
 * Speed remains well within 40–65 km/h, gentle accelerations (-1.2 to +1.2 m/s²).
 * 0 speeding, 0 harsh braking, 0 rapid accel, 0 harsh cornering.
 */
function simulateSafeTrip(count, startTime, scenarioName = 'scenario_a_safe') {
  const rng = new SeededRandom(SCENARIO_SEEDS[scenarioName] || 1001);
  const readings = [];
  let speed = rng.between(45, 55);   // km/h
  let distance = 0;
  let ts = startTime;

  for (let seq = 1; seq <= count; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    const delta = rng.between(-2.0, 2.0); // Gentle gradual speed adjustments
    speed = Math.max(25, Math.min(65, speed + delta));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    const distanceDelta = avgSpeedMs * intervalSec / 1000; // km
    distance += distanceDelta;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec; // m/s²

    readings.push({
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      source: 'simulator',
      scenario: scenarioName,
      driver_profile: 'Driver A (Safe)',
      event_type: null,
      synthetic: true,
    });

    ts += intervalSec * 1000;
  }
  return readings;
}

/**
 * Simulate Scenario B: Dangerous Driver with No Accidents (Driver B)
 * High speeds (90–135 km/h), repeated harsh deceleration (-3.5 to -5.5 m/s²),
 * rapid acceleration (+3.2 to +4.5 m/s²), harsh cornering, and phone distraction.
 */
function simulateRiskyTrip(count, startTime, scenarioName = 'scenario_b_risky_no_accidents') {
  const rng = new SeededRandom(SCENARIO_SEEDS[scenarioName] || 2002);
  const readings = [];
  let speed = rng.between(75, 95);
  let distance = 0;
  let ts = startTime;

  // Harsh indices (~25% of readings contain risky events)
  const eventIndices = new Map();
  const numEvents = Math.max(4, Math.floor(count * 0.25));
  while (eventIndices.size < numEvents) {
    const idx = rng.int(2, count);
    const rType = rng.next();
    let ev;
    if (rType < 0.35) ev = 'harsh_braking';
    else if (rType < 0.65) ev = 'rapid_acceleration';
    else if (rType < 0.85) ev = 'harsh_cornering';
    else ev = 'phone_distraction';
    eventIndices.set(idx, ev);
  }

  for (let seq = 1; seq <= count; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    let eventType = null;
    let delta = 0;

    if (eventIndices.has(seq)) {
      eventType = eventIndices.get(seq);
      if (eventType === 'harsh_braking') {
        delta = rng.between(-38, -25); // Heavy brake spike
      } else if (eventType === 'rapid_acceleration') {
        delta = rng.between(22, 35);   // Aggressive acceleration
      } else if (eventType === 'harsh_cornering') {
        delta = rng.between(-8, 5);    // Lateral centrifugal force
      } else if (eventType === 'phone_distraction') {
        delta = rng.between(-4, 4);
      }
    } else {
      // General elevated cruising speed (85 to 125 km/h)
      delta = rng.between(-5, 6);
    }

    speed = Math.max(15, Math.min(140, speed + delta));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    const distanceDelta = avgSpeedMs * intervalSec / 1000;
    distance += distanceDelta;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec;

    readings.push({
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      source: 'simulator',
      scenario: scenarioName,
      driver_profile: 'Driver B (High Risk)',
      event_type: eventType,
      synthetic: true,
    });

    ts += intervalSec * 1000;
  }
  return readings;
}

/**
 * Simulate Scenario E: Insufficient Data
 * Generates only 4 brief readings (total distance < 0.5 km).
 * System must identify this as insufficient data confidence.
 */
function simulateInsufficientData(count = 4, startTime) {
  const rng = new SeededRandom(SCENARIO_SEEDS.scenario_e_insufficient_data);
  const actualCount = Math.min(count, 5); // Ensure very few readings
  const readings = [];
  let speed = 25;
  let distance = 0;
  let ts = startTime;

  for (let seq = 1; seq <= actualCount; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    speed = Math.max(10, speed + rng.between(-3, 3));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    distance += avgSpeedMs * intervalSec / 1000;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec;

    readings.push({
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      source: 'simulator',
      scenario: 'scenario_e_insufficient_data',
      driver_profile: 'New Customer (Provisional)',
      event_type: null,
      synthetic: true,
    });

    ts += intervalSec * 1000;
  }
  return readings;
}

/**
 * Simulate invalid/unreliable telemetry (data quality errors).
 */
function simulateInvalidData(count, startTime) {
  const rng = new SeededRandom(SCENARIO_SEEDS.invalid_data);
  const readings = [];
  let speed = rng.between(30, 60);
  let distance = 0;
  let ts = startTime;

  for (let seq = 1; seq <= count; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    speed = Math.max(0, Math.min(120, speed + rng.between(-5, 5)));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    distance += avgSpeedMs * intervalSec / 1000;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec;

    const reading = {
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      source: 'simulator',
      scenario: 'invalid_data',
      event_type: null,
      synthetic: true,
    };

    // Introduce defects deterministically
    const defect = rng.int(0, 9);
    if (seq % 7 === 0) {
      reading._injected_defect = 'duplicate_sequence';
      reading.sequence_number = seq - 1;
    } else if (defect === 0) {
      reading._injected_defect = 'missing_speed';
      delete reading.speed_kmh;
    } else if (defect === 1) {
      reading._injected_defect = 'out_of_range_speed';
      reading.speed_kmh = 350;
    } else if (defect === 2) {
      reading._injected_defect = 'stale_timestamp';
      reading.timestamp = new Date(ts - 3600000).toISOString();
    } else if (defect === 3) {
      reading._injected_defect = 'missing_distance';
      delete reading.distance_km;
    } else if (defect === 4) {
      reading._injected_defect = 'extreme_acceleration';
      reading.acceleration_ms2 = 45;
    }

    readings.push(reading);
    ts += intervalSec * 1000;
  }
  return readings;
}

// ── Public API ─────────────────────────────────────────────────────────────────

const SCENARIO_METADATA = {
  scenario_a_safe: {
    label: 'Scenario A: Safe Driver (No Accidents)',
    driver_name: 'Driver A',
    description: 'Consistently safe driving behaviour, verified exposure, 0 accidents. Qualifies for 10% discount (₹1,800 from ₹2,000 base).',
    accident_scenario: 'none',
  },
  scenario_b_risky_no_accidents: {
    label: 'Scenario B: Dangerous Driving (No Accidents)',
    driver_name: 'Driver B',
    description: 'High speeding, repeated harsh braking and cornering, but 0 accidents on record. Must not get discount merely for no claims (+20% surcharge, ₹2,400).',
    accident_scenario: 'none',
  },
  scenario_c_first_accident_safe: {
    label: 'Scenario C: First Accident (Otherwise Safe Driver)',
    driver_name: 'Driver A',
    description: 'Safe driving telematics with one newly recorded non-fault incident. Reassessed fairly without assuming fault or jumping to high risk (₹1,800).',
    accident_scenario: 'first_accident_third_party',
  },
  scenario_d_repeated_accidents_risky: {
    label: 'Scenario D: Repeated Accidents & Risky Behaviour',
    driver_name: 'Driver B',
    description: 'Repeated risky driving telemetry combined with multiple verified at-fault claims. Fairly assessed with separate behaviour and claims adjustments (₹2,800).',
    accident_scenario: 'multiple_at_fault',
  },
  scenario_e_insufficient_data: {
    label: 'Scenario E: Insufficient Data / New Customer',
    driver_name: 'New Driver',
    description: 'Provisional customer with minimal distance (<1 km) or few telemetry readings. Base premium ₹2,000 applies; no unearned discounts.',
    accident_scenario: 'none',
  },
  // Backward compatibility
  smooth: {
    label: 'Smooth Trip (Driver A)',
    driver_name: 'Driver A',
    description: 'Consistent readings, minimal harsh events.',
    accident_scenario: 'none',
  },
  harsh_events: {
    label: 'Harsh Events Trip (Driver B)',
    driver_name: 'Driver B',
    description: 'Simulated rapid deceleration and acceleration events.',
    accident_scenario: 'none',
  },
  invalid_data: {
    label: 'Invalid Telemetry',
    driver_name: 'Test Vehicle',
    description: 'Missing fields, duplicates, stale timestamps, out-of-range values.',
    accident_scenario: 'none',
  },
  driver_a_safe: {
    label: 'Driver A (Consistent Safe)',
    driver_name: 'Driver A',
    description: 'Driver A profile: gentle braking, zero speeding, qualifies for safe discount.',
    accident_scenario: 'none',
  },
  driver_b_risky: {
    label: 'Driver B (High Risk Behaviour)',
    driver_name: 'Driver B',
    description: 'Driver B profile: aggressive acceleration and speeding, elevated surcharge.',
    accident_scenario: 'none',
  },
};

function runSimulation(scenario = 'scenario_a_safe', count = 60, customStartTime = null) {
  const validScenarios = [
    'scenario_a_safe', 'scenario_b_risky_no_accidents', 'scenario_c_first_accident_safe',
    'scenario_d_repeated_accidents_risky', 'scenario_e_insufficient_data',
    'smooth', 'harsh_events', 'invalid_data', 'driver_a_safe', 'driver_b_risky'
  ];
  if (!validScenarios.includes(scenario)) {
    throw new Error(`Unknown scenario "${scenario}". Must be one of: ${validScenarios.join(', ')}`);
  }

  const isInsufficientScenario = scenario === 'scenario_e_insufficient_data';
  const minCount = isInsufficientScenario ? 4 : 10;
  const readingCount = Math.min(500, Math.max(minCount, parseInt(count, 10)));
  const startTime = customStartTime != null ? customStartTime : (Date.now() - readingCount * 5000);

  let readings;

  switch (scenario) {
    case 'scenario_a_safe':
    case 'driver_a_safe':
    case 'smooth':
      readings = simulateSafeTrip(readingCount, startTime, scenario);
      break;

    case 'scenario_b_risky_no_accidents':
    case 'driver_b_risky':
    case 'harsh_events':
      readings = simulateRiskyTrip(readingCount, startTime, scenario);
      break;

    case 'scenario_c_first_accident_safe':
      readings = simulateSafeTrip(readingCount, startTime, scenario);
      break;

    case 'scenario_d_repeated_accidents_risky':
      readings = simulateRiskyTrip(readingCount, startTime, scenario);
      break;

    case 'scenario_e_insufficient_data':
      readings = simulateInsufficientData(4, startTime);
      break;

    case 'invalid_data':
      readings = simulateInvalidData(readingCount, startTime);
      break;

    default:
      throw new Error(`Unknown scenario "${scenario}"`);
  }

  return {
    scenario,
    reading_count: readings.length,
    readings,
    metadata: SCENARIO_METADATA[scenario] || SCENARIO_METADATA.scenario_a_safe,
    generated_at: new Date().toISOString(),
    synthetic: true,
    disclaimer: 'SYNTHETIC DATA — not real vehicle telemetry. For prototype demonstration only.',
  };
}

module.exports = {
  runSimulation,
  simulateSafeTrip,
  simulateRiskyTrip,
  simulateInsufficientData,
  simulateInvalidData,
  SCENARIO_METADATA,
  SeededRandom,
};
