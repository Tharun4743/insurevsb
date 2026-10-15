-- INSURE Database Schema
-- Version: 1.0.0
-- Target: PostgreSQL / Supabase

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'driver',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Consents
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'telematics_insurance_pricing',
    version TEXT NOT NULL DEFAULT '1.0',
    status TEXT NOT NULL CHECK (status IN ('granted', 'withdrawn', 'superseded')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id, status);

-- 3. Trips
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    scenario TEXT NOT NULL CHECK (scenario IN ('smooth', 'harsh_events', 'invalid_data')),
    source TEXT NOT NULL DEFAULT 'synthetic_simulator',
    synthetic BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL CHECK (status IN ('valid', 'warning', 'review_required')),
    reading_count INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id, created_at DESC);

-- 4. Telemetry Readings
CREATE TABLE IF NOT EXISTS telemetry_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    sequence_number INT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    speed_kmh NUMERIC(6, 2),
    distance_km NUMERIC(8, 3),
    acceleration_ms2 NUMERIC(6, 2),
    event_type TEXT DEFAULT 'regular',
    source TEXT NOT NULL DEFAULT 'synthetic_simulator',
    synthetic BOOLEAN NOT NULL DEFAULT true,
    injected_defect TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_readings_trip_seq ON telemetry_readings(trip_id, sequence_number ASC);

-- 5. Trip Metrics
CREATE TABLE IF NOT EXISTS trip_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    total_distance_km NUMERIC(8, 3),
    duration_sec NUMERIC(10, 2),
    avg_speed_kmh NUMERIC(6, 2),
    max_speed_kmh NUMERIC(6, 2),
    harsh_braking_count INT NOT NULL DEFAULT 0,
    rapid_accel_count INT NOT NULL DEFAULT 0,
    invalid_reading_count INT NOT NULL DEFAULT 0,
    data_quality_status TEXT NOT NULL,
    completeness_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_trip ON trip_metrics(trip_id);

-- 6. Risk Assessments
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    score INT,
    status TEXT NOT NULL CHECK (status IN ('scored', 'review_required')),
    factor_contributions JSONB,
    explanation TEXT,
    rule_version TEXT NOT NULL DEFAULT 'v1.0.0',
    review_reasons JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assessments_user ON risk_assessments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_trip ON risk_assessments(trip_id);

-- 7. Quotes
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    assessment_id UUID REFERENCES risk_assessments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    illustrative_estimate NUMERIC(8, 2),
    base_premium NUMERIC(8, 2) NOT NULL DEFAULT 100.00,
    risk_adjustment NUMERIC(8, 2),
    risk_adjustment_pct NUMERIC(5, 2),
    status TEXT NOT NULL CHECK (status IN ('generated', 'review_required')),
    rule_version TEXT NOT NULL DEFAULT 'v1.0.0',
    currency TEXT NOT NULL DEFAULT 'GBP',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id, created_at DESC);

-- 8. Review Cases
CREATE TABLE IF NOT EXISTS review_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    assessment_id UUID,
    user_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_review', 'resolved', 'rejected')),
    reviewer_decision TEXT,
    reviewer_explanation TEXT,
    reviewed_at TIMESTAMPTZ,
    reviewer_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_user ON review_cases(user_id, status);

-- 9. Audit Logs & Events
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id, created_at DESC);

-- Safe column additions for existing installations
ALTER TABLE consents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_scenario_check;
ALTER TABLE trips ADD CONSTRAINT trips_scenario_check CHECK (
  scenario IN (
    'smooth', 'harsh_events', 'invalid_data',
    'scenario_a_safe', 'scenario_b_risky_no_accidents',
    'scenario_c_first_accident_safe', 'scenario_d_repeated_accidents_risky',
    'scenario_e_insufficient_data',
    'driver_a_safe', 'driver_b_risky'
  )
);
ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS harsh_cornering_count INT DEFAULT 0;
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS unsafe_usage_count INT DEFAULT 0;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS safety_score INT;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS risk_category TEXT;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS driving_risk_score NUMERIC(5, 2);
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS data_confidence TEXT;

-- Quotes table additions for transparent behaviour and accident pricing
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS behaviour_adjustment NUMERIC(8, 2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accident_adjustment NUMERIC(8, 2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check CHECK (status IN ('generated', 'review_required', 'provisional_default'));

-- 10. Accident & Claims Records (Separated from driving telematics)
CREATE TABLE IF NOT EXISTS accident_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
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

-- 11. Financial Scenarios (Customer Growth & Underwriting Profitability)
CREATE TABLE IF NOT EXISTS financial_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
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


