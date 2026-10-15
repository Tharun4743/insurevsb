export interface FactorContributions {
  speeding: number;
  harsh_braking: number;
  rapid_accel: number;
  harsh_cornering: number;
  distracted_driving: number;
  speeding_risk: number;
  braking_risk: number;
  accel_risk: number;
  cornering_risk: number;
  distraction_risk: number;
}

export interface DriverScoreResult {
  score: number | null;
  safety_score: number | null;
  driving_risk_score: number | null;
  risk_category: string;
  data_confidence: string;
  status: string;
  review_reasons?: string[];
  factor_contributions?: FactorContributions | null;
  input_metrics?: any;
  rule_version: string;
  calculated_at: string;
  explanation: string;
  model_type: string;
  disclaimer: string;
}
