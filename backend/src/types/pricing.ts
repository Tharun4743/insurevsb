export interface PricingBreakdown {
  base_premium: number;
  behaviour_adjustment: number;
  accident_adjustment: number;
  final_premium: number;
}

export interface PricingQuote {
  base_premium: number;
  final_premium: number;
  currency: string;
  currency_symbol: string;
  behaviour_adjustment_pct: number;
  behaviour_adjustment_amount: number;
  accident_adjustment_pct: number;
  accident_adjustment_amount: number;
  total_adjustment_pct: number;
  safety_score: number | null;
  risk_category: string;
  rule_version: string;
  calculated_at: string;
  explanation: string;
  pricing_pathway: string;
  non_discrimination_notice: string;
  model_type: string;
  breakdown: PricingBreakdown;
}

export interface AccidentHistory {
  total_accidents?: number;
  at_fault_count?: number;
  not_at_fault_count?: number;
  pending_count?: number;
}
