// Shared TypeScript types for INSURE frontend

export type ScenarioType =
  | 'scenario_a_safe'
  | 'scenario_b_risky_no_accidents'
  | 'scenario_c_first_accident_safe'
  | 'scenario_d_repeated_accidents_risky'
  | 'scenario_e_insufficient_data'
  | 'smooth'
  | 'harsh_events'
  | 'invalid_data'
  | 'driver_a_safe'
  | 'driver_b_risky';

export type RiskCategory =
  | 'new_insufficient_data'
  | 'low_risk'
  | 'moderate_risk'
  | 'high_risk';

export interface Trip {
  id: string;
  user_id: string;
  scenario: string;
  source: string;
  synthetic: boolean;
  status: 'valid' | 'warning' | 'review_required';
  reading_count: number;
  started_at: string;
  ended_at: string;
  created_at: string;
  latest_assessment?: Assessment | null;
  latest_quote?: Quote | null;
  review_case?: ReviewCase | null;
}

export interface TelemetryReading {
  id: string;
  trip_id: string;
  sequence_number: number;
  timestamp: string;
  speed_kmh: number | null;
  distance_km: number | null;
  acceleration_ms2: number | null;
  event_type: string | null;
  source: string;
  synthetic: boolean;
  injected_defect?: string | null;
}

export interface TripMetrics {
  id: string;
  trip_id: string;
  total_distance_km: number | null;
  duration_sec: number | null;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  harsh_braking_count: number;
  rapid_accel_count: number;
  harsh_cornering_count?: number;
  unsafe_usage_count?: number;
  invalid_reading_count: number;
  data_quality_status: string;
  completeness_pct: number;
  harsh_braking_rate_per_100km?: number;
  rapid_accel_rate_per_100km?: number;
  cornering_rate_per_100km?: number;
  unsafe_usage_rate_per_100km?: number;
  speeding_pct?: number;
  data_confidence?: string;
}

export interface FactorContributions {
  base_score?: number;
  speeding_risk?: number;
  braking_risk?: number;
  acceleration_risk?: number;
  cornering_risk?: number;
  unsafe_usage_risk?: number;
  speeding_penalty?: number;
  braking_penalty?: number;
  acceleration_penalty?: number;
  cornering_penalty?: number;
  unsafe_usage_penalty?: number;
  driving_risk_score?: number;
  safety_score?: number;
  final_score?: number;
  // Legacy & dynamic factor indicators
  harsh_braking?: number;
  speed_variance?: number;
  night_driving?: number;
  rapid_accel?: number;
  harsh_braking_penalty?: number;
  rapid_accel_penalty?: number;
  speed_penalty?: number;
  data_quality_penalty?: number;
  [key: string]: any;
}

export interface Assessment {
  id: string;
  trip_id: string;
  score: number | null;
  safety_score?: number | null;
  driving_risk_score?: number | null;
  risk_category?: RiskCategory | string;
  data_confidence?: string;
  status: 'scored' | 'review_required';
  factor_contributions: FactorContributions | null;
  explanation: string | null;
  rule_version: string;
  review_reasons: string[];
  created_at: string;
}

export interface Quote {
  id: string;
  trip_id: string;
  assessment_id: string;
  illustrative_estimate: number | null;
  base_premium: number;
  risk_adjustment: number | null;
  risk_adjustment_pct: number | null;
  behaviour_adjustment?: number;
  behaviour_adjustment_pct?: number;
  accident_adjustment?: number;
  accident_adjustment_pct?: number;
  status: 'generated' | 'review_required' | 'provisional_default';
  rule_version: string;
  currency: string;
  created_at: string;
  explanation?: string;
  accident_notes?: string;
  claims_protection_clause?: string;
}

export interface AccidentRecord {
  id: string;
  user_id: string;
  driver_name?: string;
  accident_date: string;
  fault_status: 'driver_fault' | 'third_party_fault' | 'no_fault_weather' | 'unknown';
  claim_frequency: number;
  claim_severity: 'minor' | 'moderate' | 'severe';
  claim_amount: number | string;
  is_verified: boolean;
  description: string;
  created_at: string;
  updated_at?: string;
}

export interface AccidentHistory {
  records: AccidentRecord[];
  previous_accidents_count: number;
  claim_frequency: number;
  total_claim_amount: number;
  fault_status: string;
  most_recent_incident: AccidentRecord | null;
  claims_non_discrimination_statement: string;
}

export interface ReviewCase {
  id: string;
  trip_id: string;
  assessment_id: string;
  reason: string;
  status: 'pending' | 'in_review' | 'resolved' | 'rejected';
  reviewer_decision?: string | null;
  reviewer_explanation?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Consent {
  id: string;
  user_id: string;
  purpose: string;
  version: string;
  status: 'granted' | 'withdrawn' | 'superseded';
  granted_at: string;
  withdrawn_at?: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  user_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SimulationResult {
  trip_id: string;
  scenario: string;
  simulation: {
    reading_count: number;
    synthetic: boolean;
    metadata?: Record<string, unknown>;
  };
  validation: ValidationResult;
  metrics: TripMetrics;
  assessment: Assessment;
  quote: Quote;
  accident_history?: AccidentHistory;
  review_case: ReviewCase | null;
  disclaimer: string;
}

export interface ValidationResult {
  status: 'valid' | 'warning' | 'review_required';
  valid_count: number;
  total_count: number;
  error_count: number;
  warning_count: number;
  completeness_pct: number;
  review_reasons: string[];
}

export interface DashboardStats {
  total_trips: number;
  recent_trips: Trip[];
  latest_assessment: Assessment | null;
  latest_quote: Quote | null;
  pending_reviews: number;
  data_quality_warnings: number;
}

// ── Customer Growth & Underwriting Profitability Types ─────────────────────────
export interface FinancialOutcome {
  customer_count: number;
  avg_annual_premium: number;
  premium_revenue: number;
  claims_incurred: number;
  operating_expenses: number;
  platform_costs: number;
  acquisition_cost: number;
  other_expenses: number;
  total_expenses: number;
  underwriting_profit: number;
  profit_margin_pct: number;
  claims_ratio_pct: number;
  expense_ratio_pct: number;
  combined_ratio_pct: number;
  break_even_customers: number;
  break_even_premium: number;
  currency: string;
  currency_symbol: string;
}

export interface FinancialComparison {
  profit_difference: number;
  profit_growth_pct: number;
  customer_difference: number;
  customer_growth_pct: number;
  revenue_difference: number;
  meets_target_profit: boolean;
  target_profit: number;
}

export interface FinancialSafeguardFlag {
  type: 'violation' | 'warning';
  code: string;
  message: string;
}

export interface FinancialSafeguards {
  is_eligible: boolean;
  flags: FinancialSafeguardFlag[];
  regulatory_discount_cap_pct: number;
  evaluated_discount_pct: number;
  claims_non_discrimination_guarantee: string;
}

export interface ProfitabilitySimulationResult {
  id?: string;
  scenario_name: string;
  strategy_type: string;
  outcome: FinancialOutcome;
  baseline: FinancialOutcome;
  comparison: FinancialComparison;
  safeguards: FinancialSafeguards;
  rule_version: string;
  assumptions_statement: string;
  calculated_at: string;
}

export interface ProfitabilityOptimizationResult {
  selected_strategy: ProfitabilitySimulationResult | null;
  evaluated_count: number;
  eligible_count: number;
  strategies: ProfitabilitySimulationResult[];
  baseline: FinancialOutcome;
  optimizer_criteria: string;
  rule_version: string;
  disclaimer: string;
}

export interface ProfitabilityPresetsResponse {
  baseline: FinancialOutcome;
  presets: Record<string, Record<string, unknown>>;
  default_baseline_raw: Record<string, unknown>;
  rule_version: string;
  assumptions_disclaimer: string;
}

