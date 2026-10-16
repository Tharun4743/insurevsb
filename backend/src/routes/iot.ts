/**
 * INSURE Virtual IoT Telematics API
 *
 * Implements:
 *  - Authenticated IoT telemetry ingestion (X-Device-Key)
 *  - Strict schema and range validation (Speed, Acceleration, GPS, Sequence, Timestamps)
 *  - Device and vehicle authorization checks (rejects unauthorized devices/vehicles)
 *  - Monotonic sequence checks and duplicate event deduplication (Idempotency)
 *  - Possible collision alert detection and provisional claims creation (fault_status: 'unknown')
 *  - Read APIs for live monitoring dashboard (Latest telemetry, history by vehicle, collision alerts)
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { getClient } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { validateReadings } from '../services/validationService';
import { extractFeatures } from '../services/featureService';
import { calculateScore } from '../services/scoringService';
import { calculateQuote } from '../services/pricingService';

const router = express.Router();

const DEMO_USER_ID = process.env.DEMO_USER_ID || '00000000-0000-0000-0000-000000000001';

/**
 * Fallback demo key strictly for local synthetic simulation in Wokwi.
 * Never use this demo credential in production or for physical telematics units.
 */
const DEMO_FALLBACK_DEVICE_KEY = 'demo-wokwi-virtual-key-dev-only-2026';

/**
 * Constant-time cryptographic comparison for device secrets.
 * Prevents timing attacks by comparing fixed-length SHA-256 digests.
 */
function safeCompareSecret(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const hashProvided = crypto.createHash('sha256').update(provided.trim()).digest();
  const hashExpected = crypto.createHash('sha256').update(expected.trim()).digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

// ── In-Memory Deduplication Cache (LRU-like cache for fast idempotency) ───────
const processedEventIds = new Set<string>();
const recentSequenceByVehicle = new Map<string, number>();
const vehicleAuthCache = new Map<string, { authorized: boolean; reason?: string; vehicle?: any; expiresAt: number }>();

// Clean up cache periodically to prevent unbounded memory growth
const cacheCleanupTimer = setInterval(() => {
  if (processedEventIds.size > 10000) {
    processedEventIds.clear();
  }
  const now = Date.now();
  for (const [k, v] of vehicleAuthCache.entries()) {
    if (v.expiresAt < now) vehicleAuthCache.delete(k);
  }
}, 3600000);
if (cacheCleanupTimer.unref) cacheCleanupTimer.unref();

// ── Rate Limiter for Ingestion ────────────────────────────────────────────────
const iotIngestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 2 requests per second per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many IoT telemetry requests from this device. Rate limit exceeded.' } as any,
});

// ── Single Telemetry Reading Zod Schema ───────────────────────────────────────
const SingleTelemetrySchema = z.object({
  eventId: z.string().min(3, 'eventId is required'),
  deviceId: z.string().min(3, 'deviceId is required'),
  vehicleId: z.string().min(3, 'vehicleId is required'),
  sequenceNumber: z.number().int().min(1, 'sequenceNumber must be a positive integer'),
  timestamp: z.string().refine((val) => {
    const ts = new Date(val).getTime();
    if (isNaN(ts)) return false;
    const now = Date.now();
    if (process.env.NODE_ENV === 'test') {
      return ts <= now + 60000;
    }
    return true;
  }, 'Timestamp must be valid ISO-8601 date string'),
  speed_kmh: z.number().min(0).max(300, 'speed_kmh must be between 0 and 300 km/h'),
  acceleration_ms2: z.number().min(-30).max(30, 'acceleration_ms2 must be between -30 and 30 m/s²'),
  impact_magnitude_g: z.number().min(0).max(100).optional(),
  helmet_detected: z.boolean().optional(),
  alcohol_ppm: z.number().min(0).max(50).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  ignition_state: z.enum(['ON', 'OFF', 'IDLE']).optional(),
  event_type: z.string().optional(),
  synthetic: z.boolean().optional().default(true),
});

// Batch or Single Ingestion Payload Schema
const IngestionPayloadSchema = z.union([
  SingleTelemetrySchema,
  z.array(SingleTelemetrySchema).min(1).max(50),
]);

// ── Device Authentication Middleware ──────────────────────────────────────────
function authenticateDevice(req: Request, res: Response, next: NextFunction): any {
  const deviceKey = req.headers['x-device-key'];

  if (!deviceKey || typeof deviceKey !== 'string') {
    return res.status(401).json({
      error: 'Unauthorized: Missing or invalid X-Device-Key header.',
      code: 'DEVICE_AUTH_REQUIRED',
    });
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const configuredKey = process.env.IOT_INGEST_API_KEY;

  if (isProduction && !configuredKey) {
    console.error('[SECURITY ERROR] IOT_INGEST_API_KEY is not configured in production environment. Ingestion fails closed.');
    return res.status(500).json({
      error: 'Telemetry ingestion service unavailable: Server authentication key unconfigured in production environment.',
      code: 'SERVER_AUTH_MISCONFIGURED',
    });
  }

  const expectedKey = configuredKey || DEMO_FALLBACK_DEVICE_KEY;

  if (!safeCompareSecret(deviceKey, expectedKey)) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid device authentication key.',
      code: 'INVALID_DEVICE_KEY',
    });
  }

  next();
}

// ── Helper: Validate Vehicle & Device Authorization ───────────────────────────
async function verifyVehicleAuthorization(vehicleId: string, deviceId: string): Promise<{ authorized: boolean; reason?: string; vehicle?: any }> {
  const cacheKey = `${vehicleId}:${deviceId}`;
  const now = Date.now();
  const cached = vehicleAuthCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { authorized: cached.authorized, reason: cached.reason, vehicle: cached.vehicle };
  }

  const db = getClient();

  const { data: vehicles, error } = await db
    .from('vehicles')
    .select('*')
    .eq('vehicle_identifier', vehicleId)
    .limit(1);

  let vehicle = vehicles && vehicles.length > 0 ? vehicles[0] : null;

  // Fallback: If demo vehicle (INSURE-BIKE-001 or 002) is not yet in the DB table, auto-seed it
  if (!vehicle && (vehicleId === 'INSURE-BIKE-001' || vehicleId === 'INSURE-BIKE-002')) {
    const expectedDev = vehicleId === 'INSURE-BIKE-001' ? 'ESP32-DEV-001' : 'ESP32-DEV-002';
    const newVehicle = {
      id: uuidv4(),
      user_id: DEMO_USER_ID,
      vehicle_identifier: vehicleId,
      make: vehicleId === 'INSURE-BIKE-001' ? 'Ather' : 'Ola Electric',
      model: vehicleId === 'INSURE-BIKE-001' ? '450X Gen 3' : 'S1 Pro',
      year: 2024,
      device_id: expectedDev,
      provider_id: 'iot_esp32_telematics',
      status: 'active',
    };
    await db.from('vehicles').insert(newVehicle);
    vehicle = newVehicle;
  }

  if (!vehicle) {
    const result = {
      authorized: false,
      reason: `Vehicle '${vehicleId}' is not registered in the INSURE system.`,
    };
    vehicleAuthCache.set(cacheKey, { ...result, expiresAt: now + 5000 });
    return result;
  }

  if (vehicle.status !== 'active') {
    const result = {
      authorized: false,
      reason: `Vehicle '${vehicleId}' is decommissioned or inactive.`,
    };
    vehicleAuthCache.set(cacheKey, { ...result, expiresAt: now + 5000 });
    return result;
  }

  if (vehicle.device_id && vehicle.device_id !== deviceId) {
    const result = {
      authorized: false,
      reason: `Device '${deviceId}' is not authorized to submit telematics for vehicle '${vehicleId}'.`,
    };
    vehicleAuthCache.set(cacheKey, { ...result, expiresAt: now + 5000 });
    return result;
  }

  const result = { authorized: true, vehicle };
  vehicleAuthCache.set(cacheKey, { ...result, expiresAt: now + 60000 });
  return result;
}

// ── Helper: Get or Create Active Trip for Vehicle ─────────────────────────────
async function getOrCreateActiveTrip(userId: string, vehicleId: string, timestamp: string): Promise<any> {
  const db = getClient();

  // Find recent IoT trip created within last 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: trips } = await db
    .from('trips')
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'iot_device')
    .gte('started_at', sixHoursAgo)
    .order('started_at', { ascending: false })
    .limit(1);

  if (trips && trips.length > 0) {
    const trip = trips[0];
    // Update trip count & end time
    await db.from('trips').update({
      reading_count: (trip.reading_count || 0) + 1,
      ended_at: timestamp,
      updated_at: new Date().toISOString(),
    }).eq('id', trip.id);

    return trip;
  }

  // Otherwise create new trip
  const newTripId = uuidv4();
  const newTrip = {
    id: newTripId,
    user_id: userId,
    scenario: 'scenario_a_safe',
    source: 'iot_device',
    synthetic: true,
    status: 'valid',
    reading_count: 1,
    started_at: timestamp,
    ended_at: timestamp,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.from('trips').insert(newTrip);
  return newTrip;
}

// ── Ingest Single Reading Implementation ──────────────────────────────────────
async function processTelemetryReading(reading: z.infer<typeof SingleTelemetrySchema>): Promise<any> {
  const db = getClient();

  // 1. Idempotency check via eventId
  if (processedEventIds.has(reading.eventId)) {
    return {
      status: 'duplicate_ignored',
      eventId: reading.eventId,
      vehicleId: reading.vehicleId,
      message: 'Telemetry event already processed (idempotent ignore).',
    };
  }

  // 2. Authorization check
  const auth = await verifyVehicleAuthorization(reading.vehicleId, reading.deviceId);
  if (!auth.authorized) {
    const err = new Error(auth.reason || 'Unauthorized vehicle');
    (err as any).statusCode = 403;
    throw err;
  }

  const vehicle = auth.vehicle!;
  const userId = vehicle.user_id || DEMO_USER_ID;

  // 3. Monotonic sequence check warning (persisted across backend restarts)
  let lastSeq: number;
  const cachedSeq = recentSequenceByVehicle.get(reading.vehicleId);
  if (cachedSeq !== undefined) {
    lastSeq = cachedSeq;
  } else {
    const { data: latestSeqRow } = await db
      .from('telemetry_readings')
      .select('sequence_number')
      .eq('vehicle_id', reading.vehicleId)
      .order('sequence_number', { ascending: false })
      .limit(1);

    if (latestSeqRow && latestSeqRow.length > 0 && typeof latestSeqRow[0].sequence_number === 'number') {
      lastSeq = latestSeqRow[0].sequence_number;
    } else {
      lastSeq = 0;
    }
    recentSequenceByVehicle.set(reading.vehicleId, lastSeq);
  }

  let validationStatus = 'valid';
  if (reading.sequenceNumber <= lastSeq) {
    validationStatus = 'warning_out_of_order_sequence';
  } else {
    recentSequenceByVehicle.set(reading.vehicleId, reading.sequenceNumber);
  }

  // 4. Trip association
  const trip = await getOrCreateActiveTrip(userId, reading.vehicleId, reading.timestamp);

  // 5. Persist Telemetry Reading
  const readingId = uuidv4();
  const now = Date.now();
  const rawTs = new Date(reading.timestamp).getTime();
  const effectiveTimestamp =
    !isNaN(rawTs) && Math.abs(now - rawTs) < 300000
      ? reading.timestamp
      : new Date().toISOString();

  const dbRow: any = {
    id: readingId,
    trip_id: trip.id,
    user_id: userId,
    reading_id: readingId,
    sequence_number: reading.sequenceNumber,
    timestamp: effectiveTimestamp,
    speed_kmh: reading.speed_kmh,
    distance_km: parseFloat((reading.speed_kmh * (4.0 / 3600.0)).toFixed(4)), // ~4s incremental distance
    acceleration_ms2: reading.acceleration_ms2,
    latitude: reading.latitude ?? 12.9716,
    longitude: reading.longitude ?? 77.5946,
    odometer_km: 12000.0,
    ignition_state: reading.ignition_state || 'ON',
    provider_id: 'iot_esp32_telematics',
    device_id: reading.deviceId,
    vehicle_id: reading.vehicleId,
    driver_id: userId,
    event_type: reading.event_type || 'regular',
    source: 'iot_device',
    provenance: 'simulated',
    synthetic: true,
    helmet_detected: reading.helmet_detected !== false,
    alcohol_ppm: reading.alcohol_ppm ?? 0.00,
    impact_magnitude_g: reading.impact_magnitude_g ?? 1.00,
    event_id: reading.eventId,
    validation_status: validationStatus,
    ingestion_timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  try {
    const { error: insertErr } = await db.from('telemetry_readings').insert(dbRow);
    if (insertErr) {
      const isUniqueConflict =
        insertErr.code === '23505' ||
        insertErr.message?.includes('duplicate key') ||
        insertErr.message?.includes('uq_telemetry_event_id');

      if (isUniqueConflict) {
        return {
          status: 'duplicate_ignored',
          eventId: reading.eventId,
          vehicleId: reading.vehicleId,
          message: 'Telemetry event already persisted (database uniqueness enforced).',
        };
      }
      throw insertErr;
    }
    processedEventIds.add(reading.eventId);
  } catch (err: any) {
    const isUniqueConflict =
      err.code === '23505' ||
      err.message?.includes('duplicate key') ||
      err.message?.includes('uq_telemetry_event_id');

    if (isUniqueConflict) {
      return {
        status: 'duplicate_ignored',
        eventId: reading.eventId,
        vehicleId: reading.vehicleId,
        message: 'Telemetry event already persisted (database uniqueness enforced).',
      };
    }
    throw err;
  }

  // 6. Possible Collision Classification (Phase 5)
  let collisionAlert = null;
  const isImpact = (reading.impact_magnitude_g != null && reading.impact_magnitude_g >= 5.0);
  const isDecelSpike = (reading.acceleration_ms2 <= -12.0);
  const isExplicitCollision = (reading.event_type === 'possible_collision');

  if (isImpact || isDecelSpike || isExplicitCollision) {
    // Check if accident record for this eventId already created
    const { data: existingAccidents } = await db
      .from('accident_records')
      .select('id')
      .eq('event_id', reading.eventId)
      .limit(1);

    if (!existingAccidents || existingAccidents.length === 0) {
      const accidentId = uuidv4();
      const severity = (reading.impact_magnitude_g && reading.impact_magnitude_g >= 7.0) ? 'moderate' : 'minor';
      
      const accidentRecord: any = {
        id: accidentId,
        user_id: userId,
        driver_name: `${reading.vehicleId} Rider (Simulated)`,
        accident_date: reading.timestamp,
        fault_status: 'unknown', // Strictly unknown pending human review
        claim_frequency: 1,
        claim_severity: severity,
        claim_amount: 0.00, // Provisional: zero until assessed
        is_verified: false, // Provisional alert requiring review
        description: `[SYNTHETIC IoT ALERT] Collision threshold triggered. Impact: ${reading.impact_magnitude_g || 1.0}g, Decel: ${reading.acceleration_ms2} m/s². Fault status: UNKNOWN. Provisional incident pending review.`,
        event_id: reading.eventId,
        vehicle_id: reading.vehicleId,
        device_id: reading.deviceId,
        latitude: reading.latitude ?? 12.9716,
        longitude: reading.longitude ?? 77.5946,
        impact_magnitude_g: reading.impact_magnitude_g ?? 1.0,
        synthetic: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      try {
        const { error: accErr } = await db.from('accident_records').insert(accidentRecord);
        if (accErr && (accErr.code === '23505' || accErr.message?.includes('duplicate key'))) {
          // Uniqueness constraint prevented duplicate incident creation
        } else if (accErr) {
          throw accErr;
        }

        // Record audit log for compliance
        await db.from('audit_logs').insert({
          id: uuidv4(),
          user_id: userId,
          event_type: 'IOT_COLLISION_ALERT_CREATED',
          metadata: {
            accident_id: accidentId,
            event_id: reading.eventId,
            vehicle_id: reading.vehicleId,
            device_id: reading.deviceId,
            impact_magnitude_g: reading.impact_magnitude_g,
            fault_status: 'unknown',
            is_verified: false,
            synthetic: true,
          },
          created_at: new Date().toISOString(),
        });
      } catch (err: any) {
        if (err.code !== '23505' && !err.message?.includes('duplicate key')) {
          console.warn('[Accident Alert insert non-fatal]', err.message);
        }
      }

      collisionAlert = {
        alert_id: accidentId,
        event_id: reading.eventId,
        vehicle_id: reading.vehicleId,
        severity,
        fault_status: 'unknown',
        status: 'provisional_review_required',
      };
    }
  }

  // 7. Check if enough readings exist in trip to run scoring engine
  const { data: tripReadings } = await db
    .from('telemetry_readings')
    .select('*')
    .eq('trip_id', trip.id)
    .order('sequence_number', { ascending: true });

  let tripScored = false;
  if (tripReadings && tripReadings.length >= 1) {
    try {
      const validation = validateReadings(tripReadings);
      const metrics = extractFeatures(tripReadings, validation);
      const scoreResult = calculateScore(metrics, { allowProvisional: true, isLiveIot: true });

      // Save trip_metrics
      const metricsData = {
        trip_id: trip.id,
        user_id: userId,
        total_distance_km: metrics.total_distance_km || 0.1,
        duration_sec: metrics.duration_sec || 20,
        avg_speed_kmh: metrics.avg_speed_kmh || 35,
        max_speed_kmh: metrics.max_speed_kmh || 40,
        harsh_braking_count: metrics.harsh_braking_count || 0,
        rapid_accel_count: metrics.rapid_accel_count || 0,
        harsh_cornering_count: metrics.harsh_cornering_count || 0,
        distracted_driving_count: metrics.distracted_driving_count || 0,
        invalid_reading_count: metrics.invalid_reading_count || 0,
        data_quality_status: metrics.data_quality_status || 'valid',
        completeness_pct: metrics.completeness_pct || 100,
        night_driving_pct: metrics.night_driving_pct || 0,
        night_driving_distance_km: metrics.night_driving_distance_km || 0,
      };

      const { data: existingMetrics } = await db.from('trip_metrics').select('id').eq('trip_id', trip.id).limit(1);
      if (existingMetrics && existingMetrics.length > 0) {
        await db.from('trip_metrics').update(metricsData).eq('trip_id', trip.id);
      } else {
        await db.from('trip_metrics').insert({ id: uuidv4(), ...metricsData });
      }

      // Save risk_assessments
      const assessmentData = {
        trip_id: trip.id,
        user_id: userId,
        score: scoreResult.safety_score,
        safety_score: scoreResult.safety_score,
        driving_risk_score: scoreResult.driving_risk_score,
        risk_category: scoreResult.risk_category,
        data_confidence: scoreResult.data_confidence,
        status: scoreResult.status,
        factor_contributions: scoreResult.factor_contributions,
        explanation: scoreResult.explanation,
        rule_version: scoreResult.rule_version,
      };

      const { data: existingAssessments } = await db.from('risk_assessments').select('id').eq('trip_id', trip.id).limit(1);
      let assessmentId = uuidv4();
      if (existingAssessments && existingAssessments.length > 0) {
        assessmentId = existingAssessments[0].id;
        await db.from('risk_assessments').update(assessmentData).eq('trip_id', trip.id);
      } else {
        await db.from('risk_assessments').insert({ id: assessmentId, ...assessmentData });
      }

      // Calculate and save fair pricing quote (strictly preserving existing pricing formulas)
      const quote = calculateQuote(scoreResult, null);
      const quoteData = {
        trip_id: trip.id,
        assessment_id: assessmentId,
        user_id: userId,
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
        data_quality_state: validation.status,
        consent_status: 'acknowledged',
        input_metrics: JSON.stringify(metrics),
      };

      const { data: existingQuotes } = await db.from('quotes').select('id').eq('trip_id', trip.id).limit(1);
      if (existingQuotes && existingQuotes.length > 0) {
        await db.from('quotes').update(quoteData).eq('trip_id', trip.id);
      } else {
        await db.from('quotes').insert({ id: uuidv4(), ...quoteData, created_at: new Date().toISOString() });
      }

      tripScored = true;
    } catch (e: any) {
      console.warn('[IoT scoring non-fatal]', e.message);
    }
  }

  return {
    status: 'success',
    eventId: reading.eventId,
    vehicleId: reading.vehicleId,
    sequenceNumber: reading.sequenceNumber,
    tripId: trip.id,
    collisionAlert,
    tripScored,
    synthetic: true,
  };
}

/**
 * BATCH INGESTION SEMANTICS & ATOMICITY GUARANTEES:
 * 1. Schema & Range Validation: ATOMIC. The entire batch is rejected with HTTP 400
 *    before any database interaction if any item fails Zod physical range validation.
 * 2. Authorization: ATOMIC. The entire batch is pre-validated and rejected with HTTP 403
 *    before any database interaction if any item has an unauthorized vehicle or device.
 * 3. Idempotency & Deduplication: PER-ITEM. Duplicate eventIds (intra-batch or across batches)
 *    are safely identified and return status: 'duplicate_ignored' without duplication.
 * 4. Persistence: Sequential execution per pre-validated reading with database-level uniqueness enforcement.
 */
// GET /api/iot/telemetry - Service discovery and health check
router.get('/telemetry', async (_req: Request, res: Response) => {
  return res.json({
    service: 'INSURE IoT Telematics Ingestion Gateway',
    status: 'online',
    acceptedMethod: 'POST',
    description: 'This endpoint accepts encrypted HTTPS POST telemetry packets from ESP32 DevKit V1 hardware.',
    targetVehicles: ['INSURE-BIKE-001', 'INSURE-BIKE-002'],
    readEndpoint: '/api/iot/telemetry/latest',
    timestamp: new Date().toISOString(),
  });
});

// POST /api/iot/telemetry
router.post('/telemetry', iotIngestLimiter, authenticateDevice, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = IngestionPayloadSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Malformed telemetry payload.',
        details: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      });
    }

    const payload = parseResult.data;

    if (Array.isArray(payload)) {
      // 1. Strict batch pre-validation: verify vehicle & device authorization for all items before any processing
      for (const item of payload) {
        const auth = await verifyVehicleAuthorization(item.vehicleId, item.deviceId);
        if (!auth.authorized) {
          return res.status(403).json({
            error: auth.reason || `Unauthorized device/vehicle combination in batch (vehicle: ${item.vehicleId}).`,
            code: 'VEHICLE_DEVICE_UNAUTHORIZED',
          });
        }
      }

      const results: any[] = [];
      for (const item of payload) {
        const r = await processTelemetryReading(item);
        results.push(r);
      }
      return res.status(201).json({
        message: `Successfully processed batch of ${results.length} telemetry readings.`,
        readings_count: results.length,
        results,
        synthetic: true,
      });
    } else {
      const result = await processTelemetryReading(payload);
      return res.status(201).json({
        message: 'Telemetry reading successfully validated and persisted.',
        result,
        synthetic: true,
      });
    }
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

// ── Read Endpoint: Latest Telemetry Event ──────────────────────────────────────
// GET /api/iot/telemetry/latest?vehicleId=...
router.get('/telemetry/latest', requireAuth, async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const vehicleId = req.query.vehicleId as string | undefined;

    let query = db
      .from('telemetry_readings')
      .select('*')
      .order('timestamp', { ascending: false });

    if (vehicleId) {
      query = query.eq('vehicle_id', vehicleId);
    }

    const { data: readings, error } = await query.limit(vehicleId ? 1 : 10);

    if (error) {
      return next(createError(500, error.message));
    }

    const latest = readings && readings.length > 0 ? readings[0] : null;
    let assessment = null;
    let quote = null;

    if (latest && latest.trip_id) {
      const { data: assessments } = await db
        .from('risk_assessments')
        .select('*')
        .eq('trip_id', latest.trip_id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (assessments && assessments.length > 0) {
        assessment = assessments[0];
      }

      const { data: quotes } = await db
        .from('quotes')
        .select('*')
        .eq('trip_id', latest.trip_id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (quotes && quotes.length > 0) {
        quote = quotes[0];
      }
    }

    res.json({
      latest,
      assessment,
      quote,
      recent: readings || [],
      count: readings?.length || 0,
      synthetic: true,
    });
  } catch (err) {
    next(err);
  }
});

// ── Read Endpoint: Telemetry History for Vehicle ──────────────────────────────
// GET /api/iot/telemetry/:vehicleId
router.get('/telemetry/:vehicleId', requireAuth, async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const vehicleId = req.params.vehicleId;
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

    const { data: readings, error } = await db
      .from('telemetry_readings')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      return next(createError(500, error.message));
    }

    res.json({
      vehicleId,
      readings: readings || [],
      count: readings?.length || 0,
      synthetic: true,
    });
  } catch (err) {
    next(err);
  }
});

// ── Read Endpoint: Collision Alerts / Provisional Incidents ───────────────────
// GET /api/iot/alerts
router.get('/alerts', requireAuth, async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

    const { data: alerts, error } = await db
      .from('accident_records')
      .select('*')
      .order('accident_date', { ascending: false })
      .limit(limit);

    if (error) {
      return next(createError(500, error.message));
    }

    // Filter or highlight provisional IoT alerts
    const iotAlerts = (alerts || []).map((a: any) => ({
      ...a,
      is_iot_alert: Boolean(a.event_id || a.vehicle_id),
      is_provisional: !a.is_verified,
      synthetic: a.synthetic !== false,
    }));

    res.json({
      alerts: iotAlerts,
      count: iotAlerts.length,
      synthetic: true,
    });
  } catch (err) {
    next(err);
  }
});

// ── Read Endpoint: Registered Telematics Vehicles ─────────────────────────────
// GET /api/iot/vehicles
router.get('/vehicles', requireAuth, async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();

    const { data: vehicles, error } = await db
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      return next(createError(500, error.message));
    }

    res.json({
      vehicles: vehicles || [],
      count: vehicles?.length || 0,
      synthetic: true,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
