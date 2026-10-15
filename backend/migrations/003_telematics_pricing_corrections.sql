-- INSURE Migration 003: Correct Telematics Schema, Pricing Defaults, and Constraints
-- Version: 3.0.0
-- Target: PostgreSQL / Supabase
--
-- Corrects table defaults and constraints:
-- 1. Sets quotes.base_premium DEFAULT to 2000.00 (aligning with configured BASE_PREMIUM)
-- 2. Sets quotes.currency DEFAULT to 'INR' (aligning with intended INR / ₹ currency)
-- 3. Updates quotes_status_check to allow 'provisional_default' and 'dispute_resolved'
-- 4. Extends quotes table with explicit breakdown columns (behaviour_adjustment, accident_adjustment, explanation, data_quality_state)
-- 5. Extends trip_metrics with night_driving_pct, night_driving_distance_km, night_driving_status, and distracted_driving_count
-- Note: Does NOT silently rewrite existing historical records.

-- 1. Correct quotes table defaults
ALTER TABLE quotes ALTER COLUMN base_premium SET DEFAULT 2000.00;
ALTER TABLE quotes ALTER COLUMN currency SET DEFAULT 'INR';

-- 2. Expand status constraint on quotes table
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check CHECK (
    status IN ('generated', 'review_required', 'provisional_default', 'dispute_resolved')
);

-- 3. Add explicit quote calculation breakdown columns if not already present
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS behaviour_adjustment NUMERIC(8, 2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS behaviour_adjustment_pct NUMERIC(5, 2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accident_adjustment NUMERIC(8, 2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accident_adjustment_pct NUMERIC(5, 2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS data_quality_state TEXT DEFAULT 'valid';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS consent_status TEXT DEFAULT 'acknowledged';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS input_metrics JSONB;

-- 4. Extend trip_metrics with night driving exposure and distraction metrics
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS night_driving_pct NUMERIC(5, 2);
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS night_driving_distance_km NUMERIC(8, 3);
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS night_driving_status TEXT DEFAULT 'calculated';
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS harsh_cornering_count INT DEFAULT 0;
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS unsafe_usage_count INT DEFAULT 0;
ALTER TABLE trip_metrics ADD COLUMN IF NOT EXISTS distracted_driving_count INT DEFAULT 0;

-- 5. Indexing for compliance audit and cohort analysis
CREATE INDEX IF NOT EXISTS idx_quotes_currency ON quotes(currency);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
