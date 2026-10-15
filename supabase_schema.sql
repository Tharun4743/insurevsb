-- =============================================================================
-- INSURE — COMPLETE CONSOLIDATED SUPABASE POSTGRESQL SCHEMA
-- =============================================================================
-- Description:
--   Single unified, idempotent SQL query file for Supabase PostgreSQL.
--   Sets up all extensions, tables, constraints, indexes, and seed accounts.
--
-- How to Use:
--   1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
--   2. Navigate to "SQL Editor"
--   3. Create a new query, paste this entire file, and click "Run"
-- =============================================================================

-- ── 0. EXTENSIONS ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. MIGRATION TRACKING (Idempotency Guard) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. USERS TABLE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'compliance_officer', 'driver')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending_verification', 'active', 'suspended')),
    is_email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ── 3. CONSENTS TABLE ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL DEFAULT 'telematics_processing',
    version TEXT NOT NULL DEFAULT 'v1.0',
    status TEXT NOT NULL CHECK (status IN ('granted', 'withdrawn', 'superseded')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id, status);

-- ── 4. REGISTERED VEHICLES TABLE ──────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_vehicles_identifier ON vehicles(vehicle_identifier);

-- ── 5. TELEMATICS PROVIDER CONFIGURATIONS ──────────────────────────────────────
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

-- ── 6. TRIPS TABLE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario TEXT NOT NULL CHECK (
        scenario IN (
            'safe', 'normal', 'risky', 'night',
            'scenario_a_safe', 'scenario_b_risky_no_accidents',
            'scenario_c_first_accident_safe', 'scenario_d_repeated_accidents_risky',
            'scenario_e_insufficient_data',
            'smooth', 'harsh_events', 'invalid_data',
            'driver_a_safe', 'driver_b_risky'
        )
    ),
    source TEXT NOT NULL DEFAULT 'simulator',
    synthetic BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL CHECK (status IN ('valid', 'warning', 'review_required')),
    reading_count INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);

-- ── 7. SIMULATION SESSIONS TABLE ──────────────────────────────────────────────
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

-- ── 8. TELEMETRY READINGS TABLE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reading_id UUID,
    sequence_number INT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    speed_kmh NUMERIC(6, 2),
    distance_km NUMERIC(8, 4),
    odometer_km NUMERIC(10, 3),
    acceleration_ms2 NUMERIC(6, 3),
    latitude NUMERIC(10, 6),
    longitude NUMERIC(10, 6),
    ignition_state TEXT DEFAULT 'ON',
    provider_id TEXT DEFAULT 'simulated_telematics_v1',
    device_id TEXT,
    vehicle_id TEXT,
    driver_id TEXT,
    event_type TEXT DEFAULT 'regular',
    source TEXT NOT NULL DEFAULT 'simulator',
    provenance TEXT DEFAULT 'simulated',
    synthetic BOOLEAN NOT NULL DEFAULT true,
    injected_defect TEXT,
    validation_status TEXT DEFAULT 'valid',
    ingestion_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_trip_seq ON telemetry_readings(trip_id, sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_readings_device ON telemetry_readings(device_id);
CREATE INDEX IF NOT EXISTS idx_readings_provider ON telemetry_readings(provider_id);

-- ── 9. TRIP METRICS TABLE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    total_distance_km NUMERIC(8, 3),
    duration_sec NUMERIC(10, 2),
    avg_speed_kmh NUMERIC(6, 2),
    max_speed_kmh NUMERIC(6, 2),
    harsh_braking_count INT NOT NULL DEFAULT 0,
    rapid_accel_count INT NOT NULL DEFAULT 0,
    harsh_cornering_count INT DEFAULT 0,
    unsafe_usage_count INT DEFAULT 0,
    distracted_driving_count INT DEFAULT 0,
    invalid_reading_count INT NOT NULL DEFAULT 0,
    data_quality_status TEXT NOT NULL,
    completeness_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.0,
    night_driving_pct NUMERIC(5, 2),
    night_driving_distance_km NUMERIC(8, 3),
    night_driving_status TEXT DEFAULT 'calculated',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_trip ON trip_metrics(trip_id);

-- ── 10. RISK ASSESSMENTS TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INT,
    safety_score INT,
    driving_risk_score NUMERIC(5, 2),
    risk_category TEXT,
    data_confidence TEXT DEFAULT 'high',
    status TEXT NOT NULL CHECK (status IN ('scored', 'review_required')),
    factor_contributions JSONB,
    explanation TEXT,
    rule_version TEXT NOT NULL DEFAULT 'v2.2-telematics-corrected',
    review_reasons JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessments_user ON risk_assessments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_trip ON risk_assessments(trip_id);

-- ── 11. QUOTES TABLE ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    assessment_id UUID REFERENCES risk_assessments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    illustrative_estimate NUMERIC(8, 2),
    base_premium NUMERIC(8, 2) NOT NULL DEFAULT 2000.00,
    risk_adjustment NUMERIC(8, 2),
    risk_adjustment_pct NUMERIC(5, 2),
    behaviour_adjustment NUMERIC(8, 2),
    behaviour_adjustment_pct NUMERIC(5, 2),
    accident_adjustment NUMERIC(8, 2),
    accident_adjustment_pct NUMERIC(5, 2),
    explanation TEXT,
    status TEXT NOT NULL CHECK (status IN ('generated', 'review_required', 'provisional_default', 'dispute_resolved')),
    rule_version TEXT NOT NULL DEFAULT 'v2.1-profitability',
    currency TEXT NOT NULL DEFAULT 'INR',
    data_quality_state TEXT DEFAULT 'valid',
    consent_status TEXT DEFAULT 'acknowledged',
    input_metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_currency ON quotes(currency);

-- ── 12. PRICING DISPUTES TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    explanation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'rejected')),
    officer_decision TEXT,
    officer_explanation TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_user ON pricing_disputes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON pricing_disputes(status, created_at DESC);

-- ── 13. REVIEW CASES TABLE (Human Review Center) ──────────────────────────────
CREATE TABLE IF NOT EXISTS review_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    assessment_id UUID REFERENCES risk_assessments(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_review', 'resolved', 'rejected')),
    reviewer_decision TEXT,
    reviewer_explanation TEXT,
    reviewed_at TIMESTAMPTZ,
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_user ON review_cases(user_id, status);

-- ── 14. AUDIT EVENTS & LOGS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id, created_at DESC);

-- ── 15. ACCIDENT & CLAIMS RECORDS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accident_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_name TEXT DEFAULT 'Demo Driver',
    accident_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fault_status TEXT NOT NULL DEFAULT 'unknown' CHECK (fault_status IN ('driver_fault', 'third_party_fault', 'no_fault_weather', 'unknown')),
    claim_frequency INT NOT NULL DEFAULT 1,
    claim_severity TEXT NOT NULL DEFAULT 'minor' CHECK (claim_severity IN ('minor', 'moderate', 'severe')),
    claim_amount NUMERIC(10, 2) DEFAULT 0.00,
    is_verified BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accidents_user ON accident_records(user_id, accident_date DESC);

-- ── 16. FINANCIAL SCENARIOS TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_name TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    customer_count INT NOT NULL,
    avg_annual_premium NUMERIC(10, 2) NOT NULL,
    premium_revenue NUMERIC(12, 2) NOT NULL,
    claims_incurred NUMERIC(12, 2) NOT NULL,
    operating_expenses NUMERIC(12, 2) NOT NULL,
    platform_costs NUMERIC(12, 2) NOT NULL,
    acquisition_cost NUMERIC(12, 2) NOT NULL,
    total_expenses NUMERIC(12, 2) NOT NULL,
    underwriting_profit NUMERIC(12, 2) NOT NULL,
    profit_margin_pct NUMERIC(6, 2) NOT NULL,
    model_assumptions JSONB,
    rule_version TEXT DEFAULT 'v2.1-profitability',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_scenarios_user ON financial_scenarios(user_id, created_at DESC);

-- ── 17. OTP CHALLENGES TABLE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('SIGNUP_VERIFICATION', 'PASSWORD_RESET')),
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    resend_available_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_challenges(email, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_challenges(expires_at);

-- ── 18. PASSWORD RESET AUTHORIZATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_token ON password_reset_authorizations(token_hash);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON password_reset_authorizations(user_id, expires_at);

-- ── 19. SEED BASELINE CONFIGURATIONS & ACCOUNTS ───────────────────────────────

-- A. Record migrations in schema_migrations so backend migrate script is idempotent
INSERT INTO schema_migrations (filename) VALUES
    ('001_initial.sql'),
    ('002_auth_otp_roles.sql'),
    ('003_telematics_pricing_corrections.sql'),
    ('004_gps_provider_simulator_lifecycle.sql')
ON CONFLICT (filename) DO NOTHING;

-- B. Default Simulated Telematics Provider Configuration
INSERT INTO provider_configs (provider_id, provider_name, provider_type, auth_type, status, config_metadata)
VALUES (
    'simulated_telematics_v1',
    'INSURE Software GPS Telematics Simulator',
    'simulated',
    'none',
    'active',
    '{"description": "Deterministic software telemetry simulation pipeline for testing and verification without physical sensors"}'::jsonb
) ON CONFLICT (provider_id) DO NOTHING;

-- C. Seed Demo & Production Role Accounts (Default Password: "123456" hashed with bcrypt $2a$10$)
INSERT INTO users (id, email, full_name, password_hash, role, status, is_email_verified)
VALUES
    -- 1. Default Demo Driver (Used by automated integration tests)
    ('00000000-0000-0000-0000-000000000001', 'demo.driver@insure.test', 'Demo Driver', '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890123456789012345678', 'customer', 'active', true),
    
    -- 2. Owner & Administrator Accounts
    (uuid_generate_v4(), 'tharunkumark42007@gmail.com', 'Tharun Kumar (Admin)', '$2a$10$wK1BfW7a0vW/8wR3c7uUqOF32Qk3e/jX9O9O3I1E5bZ3X9O9O3I1E', 'admin', 'active', true),
    (uuid_generate_v4(), 'admin@insure.test', 'Insurance Administrator', '$2a$10$wK1BfW7a0vW/8wR3c7uUqOF32Qk3e/jX9O9O3I1E5bZ3X9O9O3I1E', 'admin', 'active', true),

    -- 3. Compliance Officer Accounts
    (uuid_generate_v4(), 'vsbecitc2428@gmail.com', 'Compliance Officer (VSBEC IT)', '$2a$10$wK1BfW7a0vW/8wR3c7uUqOF32Qk3e/jX9O9O3I1E5bZ3X9O9O3I1E', 'compliance_officer', 'active', true),
    (uuid_generate_v4(), 'compliance@insure.test', 'Chief Compliance Officer', '$2a$10$wK1BfW7a0vW/8wR3c7uUqOF32Qk3e/jX9O9O3I1E5bZ3X9O9O3I1E', 'compliance_officer', 'active', true),

    -- 4. Customer / Policyholder Accounts
    (uuid_generate_v4(), 'tharunkumark4743@gmail.com', 'Tharun Kumar (Customer)', '$2a$10$wK1BfW7a0vW/8wR3c7uUqOF32Qk3e/jX9O9O3I1E5bZ3X9O9O3I1E', 'customer', 'active', true),
    (uuid_generate_v4(), 'customer@insure.test', 'Alex Driver', '$2a$10$wK1BfW7a0vW/8wR3c7uUqOF32Qk3e/jX9O9O3I1E5bZ3X9O9O3I1E', 'customer', 'active', true),
    (uuid_generate_v4(), 'demo@insure.test', 'Demo Driver', '$2a$10$wK1BfW7a0vW/8wR3c7uUqOF32Qk3e/jX9O9O3I1E5bZ3X9O9O3I1E', 'customer', 'active', true)
ON CONFLICT (email) DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    is_email_verified = true,
    full_name = EXCLUDED.full_name;

-- =============================================================================
-- END OF SUPABASE SQL QUERY SCRIPT
-- =============================================================================
