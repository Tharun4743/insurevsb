/**
 * Synthetic Telematics Simulator Service
 *
 * Generates structured, deterministic synthetic vehicle telemetry readings.
 * Supports all Phase 3 required driving scenarios:
 *   - SAFE: Smooth speed changes, plausible route, zero or minimal unsafe events.
 *   - NORMAL: Mixed but plausible driving conditions, moderate speed changes, occasional events.
 *   - RISKY: Deliberately simulated speeding, harsh braking, rapid acceleration, harsh cornering.
 *   - NIGHT: Journey occurring during local night window (23:00 to 05:00 Asia/Kolkata).
 *
 * Backward-compatible actuarial scenarios:
 *   1. scenario_a_safe / driver_a_safe / smooth
 *   2. scenario_b_risky_no_accidents / driver_b_risky / harsh_events
 *   3. scenario_c_first_accident_safe
 *   4. scenario_d_repeated_accidents_risky
 *   5. scenario_e_insufficient_data
 *   6. invalid_data (Data quality error testing)
 *
 * Interactive Session Lifecycle:
 *   Start, Pause, Resume, Stop, and Reset controls with bounded batching and rate limiting.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function deterministicUuid(seedStr: string | number): string {
  const hash = crypto.createHash('sha256').update(String(seedStr)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(12, 15)}-a${hash.slice(15, 18)}-${hash.slice(18, 30)}`;
}

// ── Seeded LCG pseudo-random generator ───────────────────────────────────────
export class SeededRandom {
  seed: number;

  constructor(seed: number = 42) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  between(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1));
  }
}

export const SCENARIO_SEEDS: Record<string, number> = {
  safe: 1001,
  normal: 1005,
  risky: 2002,
  night: 4004,
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

const BASE_LAT = 12.9716;
const BASE_LNG = 77.5946;
const BASE_ODOMETER_KM = 12450.000;

export function advanceCoordinates(lat: number, lng: number, distanceKm: number, bearingDeg: number): { latitude: number; longitude: number } {
  const R = 6371; // Earth radius in km
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distanceKm / R) +
    Math.cos(latRad) * Math.sin(distanceKm / R) * Math.cos(bearingRad)
  );

  const newLngRad = lngRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distanceKm / R) * Math.cos(latRad),
    Math.cos(distanceKm / R) - Math.sin(latRad) * Math.sin(newLatRad)
  );

  return {
    latitude: parseFloat(((newLatRad * 180) / Math.PI).toFixed(6)),
    longitude: parseFloat(((newLngRad * 180) / Math.PI).toFixed(6)),
  };
}

export function simulateSafeTrip(count: number, startTime: number, scenarioName: string = 'safe'): any[] {
  const rng = new SeededRandom(SCENARIO_SEEDS[scenarioName] || 1001);
  const readings: any[] = [];
  let speed = rng.between(45, 55);
  let distance = 0;
  let lat = BASE_LAT;
  let lng = BASE_LNG;
  let bearing = 45;
  let ts = startTime;

  for (let seq = 1; seq <= count; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    const delta = rng.between(-2.0, 2.0);
    speed = Math.max(25, Math.min(65, speed + delta));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    const distanceDelta = avgSpeedMs * intervalSec / 1000;
    distance += distanceDelta;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec;

    bearing = (bearing + rng.between(-2, 2)) % 360;
    const coords = advanceCoordinates(lat, lng, distanceDelta, bearing);
    lat = coords.latitude;
    lng = coords.longitude;

    readings.push({
      reading_id: deterministicUuid(`${scenarioName}:${startTime}:${seq}`),
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      odometer_km: parseFloat((BASE_ODOMETER_KM + distance).toFixed(3)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      latitude: lat,
      longitude: lng,
      ignition_state: 'ON',
      provider_id: 'simulated_telematics_v1',
      device_id: 'SIM-GPS-001',
      vehicle_id: 'KA-01-MJ-5678',
      driver_id: 'DRIVER-001',
      source: 'simulator',
      scenario: scenarioName,
      driver_profile: 'Safe Driver (Low Risk)',
      event_type: null,
      provenance: 'simulated',
      synthetic: true,
      ingestion_timestamp: new Date(startTime).toISOString(),
    });

    ts += intervalSec * 1000;
  }
  return readings;
}

export function simulateNormalTrip(count: number, startTime: number, scenarioName: string = 'normal'): any[] {
  const rng = new SeededRandom(SCENARIO_SEEDS[scenarioName] || 1005);
  const readings: any[] = [];
  let speed = rng.between(40, 60);
  let distance = 0;
  let lat = BASE_LAT;
  let lng = BASE_LNG;
  let bearing = 90;
  let ts = startTime;

  for (let seq = 1; seq <= count; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    const delta = rng.between(-4.0, 4.5);
    speed = Math.max(20, Math.min(75, speed + delta));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    const distanceDelta = avgSpeedMs * intervalSec / 1000;
    distance += distanceDelta;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec;

    bearing = (bearing + rng.between(-5, 5)) % 360;
    const coords = advanceCoordinates(lat, lng, distanceDelta, bearing);
    lat = coords.latitude;
    lng = coords.longitude;

    let eventType: string | null = null;
    if (seq === Math.floor(count * 0.4)) {
      eventType = 'harsh_braking';
    } else if (seq === Math.floor(count * 0.7)) {
      eventType = 'rapid_acceleration';
    }

    readings.push({
      reading_id: deterministicUuid(`${scenarioName}:${startTime}:${seq}`),
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      odometer_km: parseFloat((BASE_ODOMETER_KM + distance).toFixed(3)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      latitude: lat,
      longitude: lng,
      ignition_state: 'ON',
      provider_id: 'simulated_telematics_v1',
      device_id: 'SIM-GPS-001',
      vehicle_id: 'KA-01-MJ-5678',
      driver_id: 'DRIVER-001',
      source: 'simulator',
      scenario: scenarioName,
      driver_profile: 'Normal Driver (Moderate Risk)',
      event_type: eventType,
      provenance: 'simulated',
      synthetic: true,
      ingestion_timestamp: new Date(startTime).toISOString(),
    });

    ts += intervalSec * 1000;
  }
  return readings;
}

export function simulateRiskyTrip(count: number, startTime: number, scenarioName: string = 'risky'): any[] {
  const rng = new SeededRandom(SCENARIO_SEEDS[scenarioName] || 2002);
  const readings: any[] = [];
  let speed = rng.between(75, 95);
  let distance = 0;
  let lat = BASE_LAT;
  let lng = BASE_LNG;
  let bearing = 180;
  let ts = startTime;

  const eventIndices = new Map<number, string>();
  const numEvents = Math.max(4, Math.floor(count * 0.25));
  while (eventIndices.size < numEvents) {
    const idx = rng.int(2, count);
    const rType = rng.next();
    let ev: string;
    if (rType < 0.35) ev = 'harsh_braking';
    else if (rType < 0.65) ev = 'rapid_acceleration';
    else if (rType < 0.85) ev = 'harsh_cornering';
    else ev = 'phone_distraction';
    eventIndices.set(idx, ev);
  }

  for (let seq = 1; seq <= count; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    let eventType: string | null = null;
    let delta = 0;

    if (eventIndices.has(seq)) {
      eventType = eventIndices.get(seq)!;
      if (eventType === 'harsh_braking') {
        delta = rng.between(-38, -25);
      } else if (eventType === 'rapid_acceleration') {
        delta = rng.between(22, 35);
      } else if (eventType === 'harsh_cornering') {
        delta = rng.between(-8, 5);
      } else if (eventType === 'phone_distraction') {
        delta = rng.between(-4, 4);
      }
    } else {
      delta = rng.between(-5, 6);
    }

    speed = Math.max(15, Math.min(140, speed + delta));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    const distanceDelta = avgSpeedMs * intervalSec / 1000;
    distance += distanceDelta;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec;

    bearing = (bearing + rng.between(-10, 10)) % 360;
    const coords = advanceCoordinates(lat, lng, distanceDelta, bearing);
    lat = coords.latitude;
    lng = coords.longitude;

    readings.push({
      reading_id: deterministicUuid(`${scenarioName}:${startTime}:${seq}`),
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      odometer_km: parseFloat((BASE_ODOMETER_KM + distance).toFixed(3)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      latitude: lat,
      longitude: lng,
      ignition_state: 'ON',
      provider_id: 'simulated_telematics_v1',
      device_id: 'SIM-GPS-001',
      vehicle_id: 'KA-01-MJ-5678',
      driver_id: 'DRIVER-002',
      source: 'simulator',
      scenario: scenarioName,
      driver_profile: 'Risky Driver (High Risk)',
      event_type: eventType,
      provenance: 'simulated',
      synthetic: true,
      ingestion_timestamp: new Date(startTime).toISOString(),
    });

    ts += intervalSec * 1000;
  }
  return readings;
}

export function simulateNightTrip(count: number, customStartTime: number | null = null, scenarioName: string = 'night'): any[] {
  let startTime = customStartTime;
  if (!startTime) {
    const d = new Date();
    d.setUTCHours(18, 0, 0, 0); // 18:00 UTC = 23:30 IST
    startTime = d.getTime();
  }

  const readings = simulateSafeTrip(count, startTime, scenarioName);
  readings.forEach(r => {
    r.scenario = 'night';
    r.driver_profile = 'Night Driver (Verified Exposure)';
  });
  return readings;
}

export function simulateInsufficientData(count: number = 4, startTime: number): any[] {
  const rng = new SeededRandom(SCENARIO_SEEDS.scenario_e_insufficient_data);
  const actualCount = Math.min(count, 5);
  const readings: any[] = [];
  let speed = 25;
  let distance = 0;
  let lat = BASE_LAT;
  let lng = BASE_LNG;
  let ts = startTime;

  for (let seq = 1; seq <= actualCount; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    speed = Math.max(10, speed + rng.between(-3, 3));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    const distanceDelta = avgSpeedMs * intervalSec / 1000;
    distance += distanceDelta;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec;

    const coords = advanceCoordinates(lat, lng, distanceDelta, 90);
    lat = coords.latitude;
    lng = coords.longitude;

    readings.push({
      reading_id: deterministicUuid(`insufficient:${startTime}:${seq}`),
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      odometer_km: parseFloat((BASE_ODOMETER_KM + distance).toFixed(3)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      latitude: lat,
      longitude: lng,
      ignition_state: 'ON',
      provider_id: 'simulated_telematics_v1',
      device_id: 'SIM-GPS-001',
      vehicle_id: 'KA-01-MJ-5678',
      driver_id: 'DRIVER-NEW',
      source: 'simulator',
      scenario: 'scenario_e_insufficient_data',
      driver_profile: 'New Customer (Provisional)',
      event_type: null,
      provenance: 'simulated',
      synthetic: true,
      ingestion_timestamp: new Date(startTime).toISOString(),
    });

    ts += intervalSec * 1000;
  }
  return readings;
}

export function simulateInvalidData(count: number, startTime: number): any[] {
  const rng = new SeededRandom(SCENARIO_SEEDS.invalid_data);
  const readings: any[] = [];
  let speed = rng.between(30, 60);
  let distance = 0;
  let lat = BASE_LAT;
  let lng = BASE_LNG;
  let ts = startTime;

  for (let seq = 1; seq <= count; seq++) {
    const intervalSec = 5;
    const prevSpeed = speed;
    speed = Math.max(0, Math.min(120, speed + rng.between(-5, 5)));
    const avgSpeedMs = ((prevSpeed + speed) / 2) / 3.6;
    const distanceDelta = avgSpeedMs * intervalSec / 1000;
    distance += distanceDelta;
    const accel = (speed - prevSpeed) / 3.6 / intervalSec;

    const coords = advanceCoordinates(lat, lng, distanceDelta, 45);
    lat = coords.latitude;
    lng = coords.longitude;

    const reading: any = {
      reading_id: deterministicUuid(`invalid:${startTime}:${seq}`),
      sequence_number: seq,
      timestamp: new Date(ts).toISOString(),
      speed_kmh: parseFloat(speed.toFixed(2)),
      distance_km: parseFloat(distance.toFixed(4)),
      odometer_km: parseFloat((BASE_ODOMETER_KM + distance).toFixed(3)),
      acceleration_ms2: parseFloat(accel.toFixed(3)),
      latitude: lat,
      longitude: lng,
      ignition_state: 'ON',
      provider_id: 'simulated_telematics_v1',
      device_id: 'SIM-GPS-001',
      vehicle_id: 'KA-01-MJ-5678',
      driver_id: 'DRIVER-TEST',
      source: 'simulator',
      scenario: 'invalid_data',
      event_type: null,
      provenance: 'simulated',
      synthetic: true,
      ingestion_timestamp: new Date(startTime).toISOString(),
    };

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

export const SCENARIO_METADATA: Record<string, any> = {
  safe: {
    label: 'SAFE: Smooth & Defensive Driving',
    driver_name: 'Driver A',
    description: 'Plausible route and timestamps, smooth speed changes (35–65 km/h), zero speeding breaches. Qualifies for 10% discount (₹1,800).',
    accident_scenario: 'none',
  },
  normal: {
    label: 'NORMAL: Everyday Mixed Traffic',
    driver_name: 'Driver Normal',
    description: 'Mixed but plausible urban driving conditions, moderate speed changes, occasional mild event. Standard base premium applies (₹2,000).',
    accident_scenario: 'none',
  },
  risky: {
    label: 'RISKY: Aggressive Telematics (No Claims)',
    driver_name: 'Driver B',
    description: 'Deliberately simulated speeding (90–135 km/h), harsh braking spikes, and rapid acceleration. High risk surcharge applies (+20%, ₹2,400).',
    accident_scenario: 'none',
  },
  night: {
    label: 'NIGHT: Nighttime Driving Journey',
    driver_name: 'Night Driver',
    description: 'A journey occurring during local nighttime hours (23:00 to 05:00). Exposure calculated strictly from valid distance and timestamps.',
    accident_scenario: 'none',
  },
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

export function runSimulation(scenario: string = 'safe', count: number = 60, customStartTime: number | null = null): any {
  const validScenarios = [
    'safe', 'normal', 'risky', 'night',
    'scenario_a_safe', 'scenario_b_risky_no_accidents', 'scenario_c_first_accident_safe',
    'scenario_d_repeated_accidents_risky', 'scenario_e_insufficient_data',
    'smooth', 'harsh_events', 'invalid_data', 'driver_a_safe', 'driver_b_risky'
  ];
  if (!validScenarios.includes(scenario)) {
    throw new Error(`Unknown scenario "${scenario}". Must be one of: ${validScenarios.join(', ')}`);
  }

  const isInsufficientScenario = scenario === 'scenario_e_insufficient_data';
  const minCount = isInsufficientScenario ? 4 : 10;
  const readingCount = Math.min(500, Math.max(minCount, parseInt(String(count), 10)));
  const startTime = customStartTime != null ? customStartTime : (Date.now() - readingCount * 5000);

  let readings: any[];

  switch (scenario) {
    case 'safe':
    case 'scenario_a_safe':
    case 'driver_a_safe':
    case 'smooth':
      readings = simulateSafeTrip(readingCount, startTime, scenario);
      break;

    case 'normal':
      readings = simulateNormalTrip(readingCount, startTime, scenario);
      break;

    case 'risky':
    case 'scenario_b_risky_no_accidents':
    case 'driver_b_risky':
    case 'harsh_events':
      readings = simulateRiskyTrip(readingCount, startTime, scenario);
      break;

    case 'night':
      readings = simulateNightTrip(readingCount, customStartTime, scenario);
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
    metadata: SCENARIO_METADATA[scenario] || SCENARIO_METADATA.safe,
    generated_at: new Date().toISOString(),
    synthetic: true,
    disclaimer: 'SYNTHETIC DATA — not real vehicle telemetry. For prototype demonstration only.',
  };
}

// ── In-Memory Session State Manager ─────────────────────────────────────────
const activeSessions = new Map<string, any>();

export function createSession(userId: string, { scenario = 'safe', readingCount = 60, vehicleId = 'KA-01-MJ-5678' }: any = {}): any {
  const sessionId = uuidv4();
  const session: any = {
    id: sessionId,
    userId,
    scenario,
    vehicleId,
    status: 'running',
    readingCount: Math.min(500, Math.max(10, parseInt(String(readingCount), 10))),
    currentSeq: 0,
    readings: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sim = runSimulation(scenario, session.readingCount);
  session.allReadings = sim.readings;
  session.metadata = sim.metadata;

  activeSessions.set(sessionId, session);
  return session;
}

export function pauseSession(sessionId: string, userId: string): any {
  const session = activeSessions.get(sessionId);
  if (!session || session.userId !== userId) throw new Error('Session not found.');
  if (session.status !== 'running') throw new Error(`Cannot pause session in status '${session.status}'.`);
  session.status = 'paused';
  session.pausedAt = new Date().toISOString();
  session.updatedAt = new Date().toISOString();
  return session;
}

export function resumeSession(sessionId: string, userId: string): any {
  const session = activeSessions.get(sessionId);
  if (!session || session.userId !== userId) throw new Error('Session not found.');
  if (session.status !== 'paused') throw new Error(`Cannot resume session in status '${session.status}'.`);
  session.status = 'running';
  session.resumedAt = new Date().toISOString();
  session.updatedAt = new Date().toISOString();
  return session;
}

export function stopSession(sessionId: string, userId: string): any {
  const session = activeSessions.get(sessionId);
  if (!session || session.userId !== userId) throw new Error('Session not found.');
  session.status = 'stopped';
  session.stoppedAt = new Date().toISOString();
  session.updatedAt = new Date().toISOString();
  return session;
}

export function resetSession(sessionId: string, userId: string): any {
  const session = activeSessions.get(sessionId);
  if (!session || session.userId !== userId) throw new Error('Session not found.');
  session.status = 'reset';
  session.currentSeq = 0;
  session.readings = [];
  session.updatedAt = new Date().toISOString();
  return session;
}

export function getSessionStatus(sessionId: string, userId: string): any {
  const session = activeSessions.get(sessionId);
  if (!session || session.userId !== userId) return null;
  return {
    id: session.id,
    userId: session.userId,
    scenario: session.scenario,
    status: session.status,
    currentSeq: session.currentSeq,
    totalCount: session.readingCount,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    metadata: session.metadata,
  };
}
