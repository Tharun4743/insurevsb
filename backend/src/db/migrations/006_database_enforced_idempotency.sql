-- =============================================================================
-- INSURE — MIGRATION 006: Database-Enforced Telematics & Collision Idempotency
-- =============================================================================

-- 1. Database-enforced uniqueness on event_id for telemetry_readings
CREATE UNIQUE INDEX IF NOT EXISTS uq_telemetry_event_id 
ON telemetry_readings(event_id) 
WHERE event_id IS NOT NULL;

-- 2. Database-enforced uniqueness on event_id for accident_records
CREATE UNIQUE INDEX IF NOT EXISTS uq_accidents_event_id 
ON accident_records(event_id) 
WHERE event_id IS NOT NULL;

-- 3. Record migration in schema_migrations
INSERT INTO schema_migrations (filename) VALUES ('006_database_enforced_idempotency.sql')
ON CONFLICT (filename) DO NOTHING;
