-- INSURE Migration 004: GPS Telemetry, Provider Adapters, Simulation Sessions & Vehicle Registration
-- Version: 4.0.0
-- Target: PostgreSQL / Supabase

-- 1. Extend telemetry_readings with standard provider GPS fields
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 6);
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 6);
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS odometer_km NUMERIC(10, 3);
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS ignition_state TEXT DEFAULT 'ON';
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS provider_id TEXT DEFAULT 'simulated_telematics_v1';
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS vehicle_id TEXT;
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS driver_id TEXT;
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS reading_id UUID;
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS provenance TEXT DEFAULT 'simulated';
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'valid';
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS ingestion_timestamp TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_readings_device ON telemetry_readings(device_id);
CREATE INDEX IF NOT EXISTS idx_readings_provider ON telemetry_readings(provider_id);

-- 2. Registered Vehicles & Authorized Telematics Tracking
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_identifier TEXT NOT NULL,
    make TEXT,
    model TEXT,
    year INT,
    vin TEXT,
    device_id TEXT,
    provider_id TEXT DEFAULT 'simulated_telematics_v1',
    authorized_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'decommissioned')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);

-- 3. Telematics Provider Configurations (Adapter boundary for future physical IoT/GPS providers)
CREATE TABLE IF NOT EXISTS provider_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id TEXT NOT NULL UNIQUE,
    provider_name TEXT NOT NULL,
    provider_type TEXT NOT NULL CHECK (provider_type IN ('simulated', 'api_polling', 'webhook', 'batch_export')),
    auth_type TEXT NOT NULL CHECK (auth_type IN ('none', 'api_key', 'oauth2', 'mtls')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'testing')),
    config_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default simulated provider
INSERT INTO provider_configs (provider_id, provider_name, provider_type, auth_type, status, config_metadata)
VALUES (
    'simulated_telematics_v1',
    'INSURE Software GPS Telematics Simulator',
    'simulated',
    'none',
    'active',
    '{"description": "Deterministic software telemetry simulation pipeline for testing and verification without physical sensors"}'::jsonb
) ON CONFLICT (provider_id) DO NOTHING;

-- 4. Interactive Simulation Sessions (Start, Pause, Resume, Stop, Reset lifecycle)
CREATE TABLE IF NOT EXISTS simulation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario TEXT NOT NULL,
    vehicle_id TEXT,
    device_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'paused', 'stopped', 'completed', 'reset')),
    current_seq INT NOT NULL DEFAULT 0,
    reading_count INT NOT NULL DEFAULT 60,
    current_speed NUMERIC(5, 2) DEFAULT 0,
    current_odometer NUMERIC(10, 3) DEFAULT 12000.000,
    current_lat NUMERIC(10, 6) DEFAULT 12.9716,
    current_lng NUMERIC(10, 6) DEFAULT 77.5946,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sim_sessions_user ON simulation_sessions(user_id, status);
