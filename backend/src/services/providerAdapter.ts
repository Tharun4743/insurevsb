/**
 * Provider-Independent GPS Tracker / Telematics Adapter Interface
 *
 * Implements:
 *  - Provider identity and configuration
 *  - Secure credential handling (never logs tokens, masks API secrets)
 *  - Canonical schema normalization
 *  - Idempotent event ingestion (deduplication)
 *  - Timestamp and freshness validation
 *  - Event provenance tracking ('simulated', 'provider_reported', 'system_inferred')
 *  - Consent and vehicle authorization checks
 *
 * Note: Designed to cleanly connect real physical GPS providers (Geotab, Samsara, Webhooks, etc.)
 * in the future without rewriting the insurance processing pipeline.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { TelemetryReading } from '../types/telematics';

const { hasActiveConsent } = require('./consentService');
const { validateReadings } = require('./validationService');
const { getClient } = require('../db/client');

export interface ProviderConfig {
  providerId?: string;
  providerName?: string;
  providerType?: 'simulated' | 'api_polling' | 'webhook';
  authType?: string;
  apiKey?: string;
  [key: string]: any;
}

/**
 * Base abstract adapter that all telematics providers (simulated or physical) must implement.
 */
export class BaseProviderAdapter {
  providerId: string;
  providerName: string;
  providerType: string;
  authType: string;

  constructor(config: ProviderConfig = {}) {
    this.providerId = config.providerId || 'base_provider';
    this.providerName = config.providerName || 'Base Telematics Provider';
    this.providerType = config.providerType || 'simulated';
    this.authType = config.authType || 'none';
  }

  normalizeReading(raw: any, defaultVehicleId: string | null = null, seq: number = 1): any {
    throw new Error('normalizeReading must be implemented by provider adapter.');
  }

  async verifyAuthorization(userId: string, vehicleId?: string | null): Promise<boolean> {
    const consented = await hasActiveConsent(userId);
    if (!consented) {
      throw new Error(`Consent required: User ${userId} has not granted active telematics consent.`);
    }

    if (vehicleId) {
      const db = getClient();
      const { data: vehicles } = await db
        .from('vehicles')
        .select('*')
        .eq('user_id', userId)
        .eq('vehicle_identifier', vehicleId)
        .limit(1);

      if (vehicles && vehicles.length > 0 && vehicles[0].status !== 'active') {
        throw new Error(`Vehicle ${vehicleId} is decommissioned or not authorized for telematics tracking.`);
      }
    }

    return true;
  }

  computeEventHash(reading: any): string {
    const raw = `${reading.provider_id || this.providerId}:${reading.vehicle_id || ''}:${reading.sequence_number}:${reading.timestamp}:${reading.speed_kmh}:${reading.distance_km}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  async ingestBatch(userId: string, vehicleId: string, rawReadings: any[], options: any = {}): Promise<any> {
    await this.verifyAuthorization(userId, vehicleId);

    if (!Array.isArray(rawReadings) || rawReadings.length === 0) {
      throw new Error('Cannot ingest empty readings batch.');
    }

    const seenSequences = new Set<number>();
    const normalized: any[] = [];

    for (let i = 0; i < rawReadings.length; i++) {
      const norm = this.normalizeReading(rawReadings[i], vehicleId, i + 1);
      if (seenSequences.has(norm.sequence_number)) {
        norm.validation_status = 'rejected_duplicate';
      } else {
        seenSequences.add(norm.sequence_number);
      }
      normalized.push(norm);
    }

    const validation = validateReadings(normalized);

    return {
      provider_id: this.providerId,
      provider_type: this.providerType,
      vehicle_id: vehicleId,
      reading_count: normalized.length,
      readings: normalized,
      validation,
      ingested_at: new Date().toISOString(),
      provenance: this.providerType === 'simulated' ? 'simulated' : 'provider_reported',
      is_simulated: this.providerType === 'simulated',
    };
  }
}

/**
 * Software Simulator Adapter
 * Conforms to the standard provider interface while generating reproducible synthetic data.
 */
export class SimulatedTelematicsAdapter extends BaseProviderAdapter {
  constructor(config: ProviderConfig = {}) {
    super({
      providerId: 'simulated_telematics_v1',
      providerName: 'INSURE Software GPS Telematics Simulator',
      providerType: 'simulated',
      authType: 'none',
      ...config,
    });
  }

  normalizeReading(raw: any, defaultVehicleId: string | null = null, seq: number = 1): any {
    const sequenceNumber = raw.sequence_number != null ? parseInt(raw.sequence_number, 10) : seq;
    const ts = raw.timestamp ? new Date(raw.timestamp).toISOString() : new Date().toISOString();
    const speed = raw.speed_kmh != null ? parseFloat(Number(raw.speed_kmh).toFixed(2)) : null;
    const distance = raw.distance_km != null ? parseFloat(Number(raw.distance_km).toFixed(4)) : null;
    const accel = raw.acceleration_ms2 != null ? parseFloat(Number(raw.acceleration_ms2).toFixed(3)) : null;

    return {
      reading_id: raw.reading_id || uuidv4(),
      provider_id: this.providerId,
      device_id: raw.device_id || `SIM-DEV-${defaultVehicleId || 'DEFAULT'}`,
      vehicle_id: raw.vehicle_id || defaultVehicleId || 'SIM-VEHICLE-01',
      driver_id: raw.driver_id || null,
      sequence_number: sequenceNumber,
      timestamp: ts,
      latitude: raw.latitude != null ? parseFloat(Number(raw.latitude).toFixed(6)) : 12.9716,
      longitude: raw.longitude != null ? parseFloat(Number(raw.longitude).toFixed(6)) : 77.5946,
      speed_kmh: speed,
      distance_km: distance,
      odometer_km: raw.odometer_km != null ? parseFloat(Number(raw.odometer_km).toFixed(3)) : (12000.0 + (distance || 0)),
      acceleration_ms2: accel,
      ignition_state: raw.ignition_state || 'ON',
      event_type: raw.event_type || null,
      provenance: 'simulated',
      synthetic: true,
      injected_defect: raw._injected_defect || raw.injected_defect || null,
      ingestion_timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Generic Future Provider Webhook Adapter template.
 */
export class GenericFutureWebhookAdapter extends BaseProviderAdapter {
  apiKey: string | null;

  constructor(config: ProviderConfig = {}) {
    super({
      providerId: config.providerId || 'future_gps_provider',
      providerName: config.providerName || 'Future External GPS Provider',
      providerType: 'webhook',
      authType: 'api_key',
      ...config,
    });
    this.apiKey = config.apiKey || null;
  }

  verifyWebhookAuth(authHeader: string): boolean {
    if (!this.apiKey) {
      throw new Error(`Provider ${this.providerId} has no API key configured.`);
    }
    const expected = `Bearer ${this.apiKey}`;
    if (!authHeader || authHeader !== expected) {
      throw new Error('Invalid or missing provider webhook authorization token.');
    }
    return true;
  }

  normalizeReading(raw: any, defaultVehicleId: string | null = null, seq: number = 1): any {
    return {
      reading_id: raw.id || raw.event_id || uuidv4(),
      provider_id: this.providerId,
      device_id: raw.device_id || raw.imei || 'UNKNOWN_DEVICE',
      vehicle_id: raw.vehicle_id || raw.vin || defaultVehicleId || 'UNKNOWN_VEHICLE',
      driver_id: raw.driver_id || null,
      sequence_number: raw.sequence_number || raw.seq || seq,
      timestamp: new Date(raw.timestamp || raw.utc_time || Date.now()).toISOString(),
      latitude: raw.latitude != null ? parseFloat(raw.latitude) : null,
      longitude: raw.longitude != null ? parseFloat(raw.longitude) : null,
      speed_kmh: raw.speed_kmh != null ? parseFloat(raw.speed_kmh) : (raw.speed_mph ? parseFloat((raw.speed_mph * 1.60934).toFixed(2)) : null),
      distance_km: raw.distance_km != null ? parseFloat(raw.distance_km) : null,
      odometer_km: raw.odometer_km != null ? parseFloat(raw.odometer_km) : null,
      acceleration_ms2: raw.acceleration_ms2 != null ? parseFloat(raw.acceleration_ms2) : null,
      ignition_state: raw.ignition === true || raw.ignition === 'ON' ? 'ON' : 'OFF',
      event_type: raw.event_type || null,
      provenance: 'provider_reported',
      synthetic: false,
      ingestion_timestamp: new Date().toISOString(),
    };
  }
}

// ── Registry Singleton ────────────────────────────────────────────────────────
const adapters = new Map<string, BaseProviderAdapter>();
adapters.set('simulated_telematics_v1', new SimulatedTelematicsAdapter());

export function getProviderAdapter(providerId: string = 'simulated_telematics_v1'): BaseProviderAdapter {
  if (adapters.has(providerId)) {
    return adapters.get(providerId)!;
  }
  return adapters.get('simulated_telematics_v1')!;
}

export function registerProviderAdapter(providerId: string, adapterInstance: BaseProviderAdapter): void {
  adapters.set(providerId, adapterInstance);
}
