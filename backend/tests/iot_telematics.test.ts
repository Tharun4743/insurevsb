/**
 * Comprehensive Automated Tests: Virtual IoT Telematics & Embedded Insurance
 *
 * Verifies:
 *  - Device authentication (X-Device-Key header)
 *  - Schema, type, and physical range validation (speed, acceleration, timestamp, coordinates)
 *  - Device-to-vehicle authorization checks
 *  - Duplicate event detection & idempotency
 *  - Telemetry database persistence with synthetic provenance
 *  - Possible collision alert classification & provisional incident workflow
 *  - Two-vehicle correlated incidents without premature fault assumption
 *  - Backend read endpoints (/api/iot/telemetry/latest, /:vehicleId, /alerts, /vehicles)
 */

'use strict';

jest.setTimeout(30000);

const request = require('supertest');
const app = require('../src/server');
const { getClient } = require('../src/db/client');

describe('Virtual IoT Telematics & Collision Workflow Test Suite', () => {
  const VALID_DEVICE_KEY = process.env.IOT_INGEST_API_KEY || 'demo-wokwi-virtual-key-dev-only-2026';
  const INVALID_DEVICE_KEY = 'invalid_unauthorized_key_999';

  const makeValidReading = (overrides = {}) => {
    const r1 = Math.random().toString(36).substring(2, 10);
    return {
      eventId: `evt_test_${r1}`,
      deviceId: 'ESP32-DEV-001',
      vehicleId: 'INSURE-BIKE-001',
      sequenceNumber: Math.floor(Math.random() * 10000) + 1,
      timestamp: new Date().toISOString(),
      speed_kmh: 38.5,
      acceleration_ms2: 0.65,
      impact_magnitude_g: 1.02,
      helmet_detected: true,
      alcohol_ppm: 0.00,
      latitude: 12.9716,
      longitude: 77.5946,
      ignition_state: 'ON',
      event_type: 'regular',
      synthetic: true,
      ...overrides,
    };
  };

  describe('1. Device Authentication (X-Device-Key)', () => {
    it('rejects telemetry ingestion without X-Device-Key header (401)', async () => {
      const payload = makeValidReading();
      const res = await request(app)
        .post('/api/iot/telemetry')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Missing or invalid X-Device-Key/i);
    });

    it('rejects telemetry ingestion with invalid X-Device-Key header (401)', async () => {
      const payload = makeValidReading();
      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', INVALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid device authentication key/i);
    });

    it('accepts telemetry ingestion with valid X-Device-Key header (201)', async () => {
      const payload = makeValidReading();
      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.synthetic).toBe(true);
      expect(res.body.result.status).toBe('success');
      expect(res.body.result.vehicleId).toBe('INSURE-BIKE-001');
    });

    it('fails closed (500) in production environment if IOT_INGEST_API_KEY is missing', async () => {
      const origEnv = process.env.NODE_ENV;
      const origKey = process.env.IOT_INGEST_API_KEY;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.IOT_INGEST_API_KEY;

        const payload = makeValidReading();
        const res = await request(app)
          .post('/api/iot/telemetry')
          .set('X-Device-Key', VALID_DEVICE_KEY)
          .send(payload);

        expect(res.status).toBe(500);
        expect(res.body.code).toBe('SERVER_AUTH_MISCONFIGURED');
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origKey !== undefined) process.env.IOT_INGEST_API_KEY = origKey;
      }
    });
  });

  describe('2. Schema & Physical Range Validation', () => {
    it('rejects missing required fields (e.g. missing speed_kmh)', async () => {
      const payload = makeValidReading();
      delete payload.speed_kmh;

      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Malformed telemetry payload/i);
    });

    it('rejects out-of-range speed (> 300 km/h or < 0)', async () => {
      const payload = makeValidReading({ speed_kmh: 420.0 });
      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.details.some((d: string) => d.includes('speed_kmh'))).toBe(true);
    });

    it('rejects out-of-range acceleration (> 30 m/s² or < -30 m/s²)', async () => {
      const payload = makeValidReading({ acceleration_ms2: 55.0 });
      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.details.some((d: string) => d.includes('acceleration_ms2'))).toBe(true);
    });

    it('rejects future timestamps (> 60s in future)', async () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString();
      const payload = makeValidReading({ timestamp: futureTime });
      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.details.some((d: string) => d.includes('Timestamp'))).toBe(true);
    });

    it('rejects invalid non-positive sequence numbers', async () => {
      const payload = makeValidReading({ sequenceNumber: 0 });
      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.details.some((d: string) => d.includes('sequenceNumber'))).toBe(true);
    });
  });

  describe('3. Vehicle & Device Authorization', () => {
    it('rejects an unregistered or unauthorized vehicle identifier (403)', async () => {
      const payload = makeValidReading({
        vehicleId: 'UNREGISTERED-TRUCK-999',
        deviceId: 'ESP32-DEV-999',
      });
      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not registered in the INSURE system/i);
    });

    it('rejects mismatched device ID for an authorized vehicle (403)', async () => {
      const payload = makeValidReading({
        vehicleId: 'INSURE-BIKE-001',
        deviceId: 'ROGUE-DEVICE-ATTACKER',
      });
      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not authorized to submit telematics for vehicle/i);
    });
  });

  describe('4. Idempotency & Batch Processing', () => {
    it('handles duplicate eventId transmissions idempotently without creating duplicate data', async () => {
      const payload = makeValidReading();

      // First submission
      const res1 = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);
      expect(res1.status).toBe(201);
      expect(res1.body.result.status).toBe('success');

      // Duplicate submission
      const res2 = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(payload);
      expect(res2.status).toBe(201);
      expect(res2.body.result.status).toBe('duplicate_ignored');
    });

    it('accepts a bounded batch of telemetry readings (up to 50 items)', async () => {
      const batch = [
        makeValidReading({ sequenceNumber: 101, speed_kmh: 30.0 }),
        makeValidReading({ sequenceNumber: 102, speed_kmh: 34.0 }),
        makeValidReading({ sequenceNumber: 103, speed_kmh: 38.0 }),
      ];

      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(batch);

      expect(res.status).toBe(201);
      expect(res.body.readings_count).toBe(3);
      expect(res.body.results.length).toBe(3);
    });

    it('handles concurrent duplicate eventId transmissions gracefully (Promise.all)', async () => {
      const payload = makeValidReading();

      // Submit identical event concurrently
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/iot/telemetry')
          .set('X-Device-Key', VALID_DEVICE_KEY)
          .send(payload),
        request(app)
          .post('/api/iot/telemetry')
          .set('X-Device-Key', VALID_DEVICE_KEY)
          .send(payload),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      const statuses = [res1.body.result.status, res2.body.result.status];
      expect(statuses).toContain('success');
      expect(statuses).toContain('duplicate_ignored');
    });

    it('rejects an entire batch if any reading contains an unauthorized vehicle (atomic 403 pre-validation)', async () => {
      const batchWithUnauthorized = [
        makeValidReading({ sequenceNumber: 201 }),
        makeValidReading({ sequenceNumber: 202, vehicleId: 'UNAUTHORIZED-VEHICLE-999' }),
      ];

      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(batchWithUnauthorized);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('VEHICLE_DEVICE_UNAUTHORIZED');
      expect(res.body.error).toMatch(/not registered/i);
    });

    it('rejects an entire batch if any reading fails schema/range validation (atomic 400 rejection)', async () => {
      const mixedBatch = [
        makeValidReading({ sequenceNumber: 301, speed_kmh: 40.0 }),
        makeValidReading({ sequenceNumber: 302, speed_kmh: 450.0 }), // Invalid speed > 300 km/h
      ];

      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(mixedBatch);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Malformed telemetry payload/i);
    });

    it('handles intra-batch duplicate events safely without duplication', async () => {
      const reading = makeValidReading({ sequenceNumber: 401 });
      const duplicateBatch = [reading, reading];

      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(duplicateBatch);

      expect(res.status).toBe(201);
      expect(res.body.results.length).toBe(2);
      expect(res.body.results[0].status).toBe('success');
      expect(res.body.results[1].status).toBe('duplicate_ignored');
    });
  });

  describe('5. Collision Alert & Provisional Incident Creation (Phase 5)', () => {
    it('creates an unverified provisional incident record when severe impact is received', async () => {
      const collisionPayload = makeValidReading({
        speed_kmh: 0.0,
        acceleration_ms2: -18.5,
        impact_magnitude_g: 7.4,
        ignition_state: 'OFF',
        event_type: 'possible_collision',
      });

      const res = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(collisionPayload);

      expect(res.status).toBe(201);
      expect(res.body.result.collisionAlert).toBeDefined();
      expect(res.body.result.collisionAlert.fault_status).toBe('unknown');
      expect(res.body.result.collisionAlert.status).toBe('provisional_review_required');

      // Verify stored incident record in DB
      const db = getClient();
      const { data: accidents } = await db
        .from('accident_records')
        .select('*')
        .eq('event_id', collisionPayload.eventId);

      expect(accidents).toBeDefined();
      expect(accidents.length).toBe(1);
      const acc = accidents[0];
      expect(acc.fault_status).toBe('unknown');
      expect(acc.is_verified).toBe(false);
      expect(acc.synthetic).toBe(true);
      expect(Number(acc.claim_amount)).toBe(0.00);
    });

    it('preserves neutrality in two-vehicle correlated incident without assigning fault', async () => {
      const bike1Crash = makeValidReading({
        vehicleId: 'INSURE-BIKE-001',
        deviceId: 'ESP32-DEV-001',
        speed_kmh: 0.0,
        acceleration_ms2: -17.0,
        impact_magnitude_g: 6.8,
        event_type: 'possible_collision',
      });

      const bike2Crash = makeValidReading({
        vehicleId: 'INSURE-BIKE-002',
        deviceId: 'ESP32-DEV-002',
        speed_kmh: 0.0,
        acceleration_ms2: -16.5,
        impact_magnitude_g: 6.5,
        event_type: 'possible_collision',
      });

      const res1 = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(bike1Crash);

      const res2 = await request(app)
        .post('/api/iot/telemetry')
        .set('X-Device-Key', VALID_DEVICE_KEY)
        .send(bike2Crash);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.result.collisionAlert.fault_status).toBe('unknown');
      expect(res2.body.result.collisionAlert.fault_status).toBe('unknown');
    });
  });

  describe('6. Read APIs & Live Dashboard Endpoints (Phase 7)', () => {
    it('GET /api/iot/telemetry/latest returns latest persisted telemetry', async () => {
      const res = await request(app)
        .get('/api/iot/telemetry/latest?vehicleId=INSURE-BIKE-001')
        .set('Authorization', 'Bearer demo');

      expect(res.status).toBe(200);
      expect(res.body.synthetic).toBe(true);
      if (res.body.latest) {
        expect(res.body.latest.vehicle_id).toBe('INSURE-BIKE-001');
      }
    });

    it('GET /api/iot/telemetry/:vehicleId returns history list', async () => {
      const res = await request(app)
        .get('/api/iot/telemetry/INSURE-BIKE-001?limit=10')
        .set('Authorization', 'Bearer demo');

      expect(res.status).toBe(200);
      expect(res.body.vehicleId).toBe('INSURE-BIKE-001');
      expect(Array.isArray(res.body.readings)).toBe(true);
    });

    it('GET /api/iot/alerts returns collision alerts and provisional incident list', async () => {
      const res = await request(app)
        .get('/api/iot/alerts')
        .set('Authorization', 'Bearer demo');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.alerts)).toBe(true);
    });

    it('GET /api/iot/vehicles returns authorized vehicles', async () => {
      const res = await request(app)
        .get('/api/iot/vehicles')
        .set('Authorization', 'Bearer demo');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.vehicles)).toBe(true);
      const identifiers = res.body.vehicles.map((v: any) => v.vehicle_identifier);
      expect(identifiers).toContain('INSURE-BIKE-001');
      expect(identifiers).toContain('INSURE-BIKE-002');
    });
  });
});
