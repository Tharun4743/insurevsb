-- INSURE Migration 002: Complete Authentication, OTP, and Role-Based Access
-- Version: 2.0.0
-- Target: PostgreSQL / Supabase

-- 1. Extend Users table for full authentication and role-based access
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure role constraint allows customer, admin, compliance_officer, and driver
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
    role IN ('customer', 'admin', 'compliance_officer', 'driver')
);

-- Ensure status constraint allows pending_verification, active, suspended
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (
    status IN ('pending_verification', 'active', 'suspended')
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. OTP Challenges table for Signup Verification and Password Reset
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

-- 3. Single-use Password Reset Authorizations
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

-- 4. Pricing Disputes table (For Customer disputes and Compliance Officer reviews)
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

-- 5. Seed default demo user account for testing and prototype demonstrations
INSERT INTO users (id, email, full_name, role, status, is_email_verified)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo.driver@insure.test', 'Demo Driver', 'customer', 'active', true)
ON CONFLICT (id) DO UPDATE SET is_email_verified = true, status = 'active';

