-- =============================================================================
-- INSURE — MIGRATION 005: IoT Telematics & Collision Alert Extensions
-- =============================================================================

-- 1. Additive columns for telemetry_readings
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS helmet_detected BOOLEAN DEFAULT true;
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS alcohol_ppm NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS impact_magnitude_g NUMERIC(5, 2) DEFAULT 1.00;
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_time ON telemetry_readings(vehicle_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_id ON telemetry_readings(event_id);

-- 2. Additive columns for accident_records (Provisional Collision Alerts)
ALTER TABLE accident_records ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE accident_records ADD COLUMN IF NOT EXISTS vehicle_id TEXT;
ALTER TABLE accident_records ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE accident_records ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 6);
ALTER TABLE accident_records ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 6);
ALTER TABLE accident_records ADD COLUMN IF NOT EXISTS impact_magnitude_g NUMERIC(5, 2);
ALTER TABLE accident_records ADD COLUMN IF NOT EXISTS synthetic BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_accidents_event_id ON accident_records(event_id);
CREATE INDEX IF NOT EXISTS idx_accidents_vehicle_id ON accident_records(vehicle_id);

-- 3. Register Virtual IoT Telematics Provider
INSERT INTO provider_configs (provider_id, provider_name, provider_type, auth_type, status, config_metadata)
VALUES (
    'iot_esp32_telematics',
    'INSURE Virtual ESP32 Telematics Unit',
    'simulated',
    'api_key',
    'active',
    '{"protocol": "HTTPS", "auth_header": "X-Device-Key", "firmware_version": "1.0.0-synthetic"}'::jsonb
) ON CONFLICT (provider_id) DO NOTHING;

-- 4. Seed Demo Vehicles
INSERT INTO vehicles (user_id, vehicle_identifier, make, model, year, device_id, provider_id, status)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'INSURE-BIKE-001', 'Ather', '450X Gen 3', 2024, 'ESP32-DEV-001', 'iot_esp32_telematics', 'active'),
    ('00000000-0000-0000-0000-000000000001', 'INSURE-BIKE-002', 'Ola Electric', 'S1 Pro', 2024, 'ESP32-DEV-002', 'iot_esp32_telematics', 'active')
ON CONFLICT DO NOTHING;

-- 5. Record migration in schema_migrations
INSERT INTO schema_migrations (filename) VALUES ('005_iot_telemetry_and_collision_alerts.sql')
ON CONFLICT (filename) DO NOTHING;
