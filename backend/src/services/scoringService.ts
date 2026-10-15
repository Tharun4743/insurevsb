/**
 * Fair Driving Risk Scoring Service (Illustrative Pricing Model)
 *
 * Implements the 5-factor risk scoring architecture:
 *
 * Factor Weights (Sum = 1.00):
 *  - Speeding risk:           30% (0.30)
 *  - Harsh braking:           25% (0.25)
 *  - Rapid acceleration:      15% (0.15)
 *  - Harsh cornering:         15% (0.15)
 *  - Distracted driving:      15% (0.15) [Phone distraction / device usage — NIGHT DRIVING STRICTLY EXCLUDED]
 *
 * Formula:
 *   Driving Risk Score = (0.30 × Speeding Risk) +
 *                        (0.25 × Braking Risk) +
 *                        (0.15 × Acceleration Risk) +
 *                        (0.15 × Cornering Risk) +
 *                        (0.15 × Distraction Risk)
 *
 *   Safety Score = 100 − Driving Risk Score (higher = safer driving, bounded [0, 100]).
 *
 * Data Quality Guarantee:
 *   Sensor quality defects, warnings, or missing telemetry NEVER reduce driving safety points.
 *   Data quality defects trigger validation warnings or human review, never an unsafe driving penalty.
 *
 * Actuarial Label:
 *   Labeled explicitly as an ILLUSTRATIVE PRICING MODEL.
 */

export const RULE_VERSION = process.env.SCORE_RULE_VERSION || 'v2.2-telematics-corrected';

export const WEIGHTS = {
  SPEEDING:            0.30,
  HARSH_BRAKING:       0.25,
  RAPID_ACCEL:         0.15,
  HARSH_CORNERING:     0.15,
  DISTRACTED_DRIVING:  0.15,
  UNSAFE_USAGE:        0.15,
};

export const THRESHOLDS = {
  SPEEDING_SCALE:          2.5,
  BRAKING_RATE_SCALE:      5.0,
  ACCEL_RATE_SCALE:        5.0,
  CORNERING_RATE_SCALE:    6.0,
  DISTRACTION_RATE_SCALE:  8.0,
};

export function calculateScore(metrics: any, options: any = {}): any {
  // ── Data Quality & Confidence Gate ─────────────────────────────────────────
  const isInsufficient =
    !metrics ||
    metrics.data_confidence === 'insufficient' ||
    metrics.data_quality_status === 'review_required' ||
    (metrics.total_distance_km != null && metrics.total_distance_km < 1.0) ||
    (metrics.valid_reading_count != null && metrics.valid_reading_count < 5);

  if (isInsufficient) {
    return {
      score: null,
      safety_score: null,
      driving_risk_score: null,
      risk_category: 'new_insufficient_data',
      data_confidence: metrics?.data_confidence || 'insufficient',
      status: 'review_required',
      review_reasons: [
        'Insufficient reliable driving data to compute a confident safety score. Default pricing pathway applies.',
      ],
      factor_contributions: null,
      input_metrics: metrics,
      rule_version: RULE_VERSION,
      calculated_at: new Date().toISOString(),
      explanation: 'New / Insufficient Data: Telematics volume or data quality is insufficient to award an empirical safety discount. Standard default pricing applies without unfair penalties.',
      model_type: 'illustrative_pricing_model',
      disclaimer: 'ILLUSTRATIVE PRICING MODEL — insufficient data does not penalise the driver; approved standard base premium applies.',
    };
  }

  // ── Normalise 5 Risk Sub-Indicators (0 to 100 scale) ─────────────────────────
  const speedingPct = metrics.speeding_pct || 0;
  const severeSpeedCount = metrics.severe_speeding_count || 0;
  const speedingRisk = Math.max(0, Math.min(
    100,
    parseFloat((speedingPct * THRESHOLDS.SPEEDING_SCALE + severeSpeedCount * 10).toFixed(1))
  ));

  const brakingRate = metrics.harsh_braking_rate_per_100km != null
    ? metrics.harsh_braking_rate_per_100km
    : ((metrics.harsh_braking_count || 0) * 1.5);
  const brakingRisk = Math.max(0, Math.min(100, parseFloat((brakingRate * THRESHOLDS.BRAKING_RATE_SCALE).toFixed(1))));

  const accelRate = metrics.rapid_accel_rate_per_100km != null
    ? metrics.rapid_accel_rate_per_100km
    : ((metrics.rapid_accel_count || 0) * 1.5);
  const accelerationRisk = Math.max(0, Math.min(100, parseFloat((accelRate * THRESHOLDS.ACCEL_RATE_SCALE).toFixed(1))));

  const corneringRate = metrics.cornering_rate_per_100km != null
    ? metrics.cornering_rate_per_100km
    : ((metrics.harsh_cornering_count || 0) * 1.5);
  const corneringRisk = Math.max(0, Math.min(100, parseFloat((corneringRate * THRESHOLDS.CORNERING_RATE_SCALE).toFixed(1))));

  const distractionRate = metrics.distracted_driving_rate_per_100km != null
    ? metrics.distracted_driving_rate_per_100km
    : ((metrics.distracted_driving_count || 0) * 2.0);
  const distractionRisk = Math.max(0, Math.min(100, parseFloat((distractionRate * THRESHOLDS.DISTRACTION_RATE_SCALE).toFixed(1))));

  // ── Combined Driving Risk Score (0-100) ────────────────────────────────────
  const rawDrivingRiskScore =
    WEIGHTS.SPEEDING           * speedingRisk +
    WEIGHTS.HARSH_BRAKING      * brakingRisk +
    WEIGHTS.RAPID_ACCEL        * accelerationRisk +
    WEIGHTS.HARSH_CORNERING    * corneringRisk +
    WEIGHTS.DISTRACTED_DRIVING * distractionRisk;

  const drivingRiskScore = parseFloat(Math.min(100, Math.max(0, rawDrivingRiskScore)).toFixed(1));

  // ── Safety Score (100 - Driving Risk Score, bounded [0, 100]) ───────────────
  const safetyScore = Math.max(0, Math.min(100, Math.round(100 - drivingRiskScore)));

  // ── Driver Classification ──────────────────────────────────────────────────
  let riskCategory = 'moderate_risk';
  if (safetyScore >= 80) {
    riskCategory = 'low_risk';
  } else if (safetyScore >= 50) {
    riskCategory = 'moderate_risk';
  } else {
    riskCategory = 'high_risk';
  }

  // ── Transparent Factor Breakdown ───────────────────────────────────────────
  const legacyBrakingPenalty = metrics.harsh_braking_count != null && metrics.harsh_braking_rate_per_100km == null
    ? -(metrics.harsh_braking_count * 3)
    : -parseFloat((WEIGHTS.HARSH_BRAKING * brakingRisk).toFixed(1));
  const legacyAccelPenalty = metrics.rapid_accel_count != null && metrics.rapid_accel_rate_per_100km == null
    ? -(metrics.rapid_accel_count * 2)
    : -parseFloat((WEIGHTS.RAPID_ACCEL * accelerationRisk).toFixed(1));

  const factorContributions = {
    base_score:               100,
    speeding_risk:            speedingRisk,
    braking_risk:             brakingRisk,
    acceleration_risk:        accelerationRisk,
    cornering_risk:           corneringRisk,
    distraction_risk:         distractionRisk,
    unsafe_usage_risk:        distractionRisk,
    speeding_penalty:         parseFloat((WEIGHTS.SPEEDING * speedingRisk).toFixed(1)),
    braking_penalty:          parseFloat((WEIGHTS.HARSH_BRAKING * brakingRisk).toFixed(1)),
    acceleration_penalty:     parseFloat((WEIGHTS.RAPID_ACCEL * accelerationRisk).toFixed(1)),
    cornering_penalty:        parseFloat((WEIGHTS.HARSH_CORNERING * corneringRisk).toFixed(1)),
    distraction_penalty:      parseFloat((WEIGHTS.DISTRACTED_DRIVING * distractionRisk).toFixed(1)),
    unsafe_usage_penalty:     parseFloat((WEIGHTS.DISTRACTED_DRIVING * distractionRisk).toFixed(1)),
    harsh_braking_penalty:    legacyBrakingPenalty,
    rapid_accel_penalty:      legacyAccelPenalty,
    speed_penalty:            -parseFloat((WEIGHTS.SPEEDING * speedingRisk).toFixed(1)),
    data_quality_penalty:     metrics.data_quality_status === 'warning' ? -5 : 0,
    driving_risk_score:       drivingRiskScore,
    safety_score:             safetyScore,
    final_score:              metrics.harsh_braking_count != null && metrics.harsh_braking_rate_per_100km == null
      ? Math.max(0, Math.min(100, 100 + legacyBrakingPenalty + legacyAccelPenalty + (metrics.data_quality_status === 'warning' ? -5 : 0)))
      : Math.max(0, Math.min(100, safetyScore + (metrics.data_quality_status === 'warning' ? -5 : 0))),
  };

  const explanation = buildExplanation(safetyScore, drivingRiskScore, riskCategory, factorContributions, metrics);

  return {
    score: factorContributions.final_score,
    safety_score: safetyScore,
    driving_risk_score: drivingRiskScore,
    risk_category: riskCategory,
    data_confidence: metrics.data_confidence || 'high',
    status: 'scored',
    review_reasons: [],
    factor_contributions: factorContributions,
    input_metrics: metrics,
    explanation,
    rule_version: RULE_VERSION,
    calculated_at: new Date().toISOString(),
    model_type: 'illustrative_pricing_model',
    disclaimer: 'ILLUSTRATIVE PRICING MODEL — calculated strictly from validated exposure and driving dynamics without unverified claims calibration.',
  };
}

function buildExplanation(safetyScore: number, riskScore: number, category: string, factors: any, metrics: any): string {
  const categoryLabels: Record<string, string> = {
    low_risk: 'Low Risk (Safe Driver)',
    moderate_risk: 'Moderate Risk',
    high_risk: 'High Risk',
    new_insufficient_data: 'New / Insufficient Data',
  };

  const lines = [
    `Driver Classified as: ${categoryLabels[category] || category}.`,
    `Safety Score: ${safetyScore}/100 (Driving Risk: ${riskScore}/100).`,
  ];

  if (factors.speeding_penalty > 5) {
    lines.push(`Speeding indicators contributed +${factors.speeding_penalty} risk pts.`);
  }
  if (factors.braking_penalty > 5) {
    lines.push(`Harsh braking contributed +${factors.braking_penalty} risk pts.`);
  }
  if (factors.cornering_penalty > 3) {
    lines.push(`Harsh cornering contributed +${factors.cornering_penalty} risk pts.`);
  }
  if (factors.acceleration_penalty > 3) {
    lines.push(`Rapid acceleration contributed +${factors.acceleration_penalty} risk pts.`);
  }
  if (factors.distraction_penalty > 3) {
    lines.push(`Phone distraction contributed +${factors.distraction_penalty} risk pts.`);
  }

  if (safetyScore >= 80) {
    lines.push('Consistent safe driving observed across verified distance.');
  }

  return lines.join(' ');
}
