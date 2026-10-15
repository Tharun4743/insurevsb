/**
 * Fair Driving Risk Scoring Service
 *
 * Implements the 3 independent risk factors architecture:
 *
 * Factor A: Driving Behaviour Score (0 to 100)
 *   Weights:
 *    - Speeding risk:           30% (0.30)
 *    - Harsh braking:           25% (0.25)
 *    - Rapid acceleration:      15% (0.15)
 *    - Harsh cornering:         15% (0.15)
 *    - Unsafe usage indicators: 15% (0.15)
 *
 * Formula:
 *   Driving Risk Score = (0.30 × Speeding Risk) +
 *                        (0.25 × Braking Risk) +
 *                        (0.15 × Acceleration Risk) +
 *                        (0.15 × Cornering Risk) +
 *                        (0.15 × Unsafe Usage Risk)
 *
 *   Safety Score = 100 − Driving Risk Score (higher = safer driving).
 *
 * Driver Classification:
 *   - 'new_insufficient_data': not enough reliable telematics
 *   - 'low_risk':              Safety Score ≥ 80
 *   - 'moderate_risk':         Safety Score 50 to 79.99
 *   - 'high_risk':             Safety Score < 50
 */

'use strict';

const RULE_VERSION = process.env.SCORE_RULE_VERSION || 'v2.0-fair-pricing';

const WEIGHTS = {
  SPEEDING:       0.30,
  HARSH_BRAKING:  0.25,
  RAPID_ACCEL:    0.15,
  HARSH_CORNERING:0.15,
  UNSAFE_USAGE:   0.15,
};

// Thresholds for sub-indicator 0–100 normalisation
const THRESHOLDS = {
  // Speeding: 10% trip speeding is moderate; 40%+ is max risk
  SPEEDING_SCALE: 2.5,
  // Braking: rate per 100 km (e.g. 10 events/100km = 50 risk, 20+ = 100 risk)
  BRAKING_RATE_SCALE: 5.0,
  // Accel: rate per 100 km
  ACCEL_RATE_SCALE: 5.0,
  // Cornering: rate per 100 km
  CORNERING_RATE_SCALE: 6.0,
  // Unsafe usage / night driving: rate per 100 km
  UNSAFE_USAGE_SCALE: 8.0,
};

/**
 * Calculate driving risk score, safety score, and driver category.
 *
 * @param {Object} metrics  output of extractFeatures()
 * @param {Object} [options] optional overrides or context
 * @returns {Object} assessment record with fair classification
 */
function calculateScore(metrics, options = {}) {
  // ── Data Quality & Confidence Gate ─────────────────────────────────────────
  const isInsufficient =
    metrics.data_confidence === 'insufficient' ||
    metrics.data_quality_status === 'review_required' ||
    (metrics.total_distance_km != null && metrics.total_distance_km < 1.0) ||
    (metrics.valid_reading_count != null && metrics.valid_reading_count < 5);

  if (isInsufficient) {
    return {
      score: null, // Legacy score field
      safety_score: null,
      driving_risk_score: null,
      risk_category: 'new_insufficient_data',
      data_confidence: 'insufficient',
      status: 'review_required',
      review_reasons: [
        'Insufficient reliable driving data to compute a confident safety score. Default pricing pathway applies.',
      ],
      factor_contributions: null,
      input_metrics: metrics,
      rule_version: RULE_VERSION,
      calculated_at: new Date().toISOString(),
      explanation: 'New / Insufficient Data: Telematics volume or data quality is insufficient to award an empirical safety discount. Standard default pricing applies without unfair penalties.',
      disclaimer: 'FAIR PRICING PROTOTYPE — insufficient data does not penalise the driver.',
    };
  }

  // ── Normalise 5 Risk Sub-Indicators (0 to 100 scale) ─────────────────────────
  // 1. Speeding Risk (0-100)
  const speedingPct = metrics.speeding_pct || 0;
  const severeSpeedCount = metrics.severe_speeding_count || 0;
  const speedingRisk = Math.min(
    100,
    parseFloat((speedingPct * THRESHOLDS.SPEEDING_SCALE + severeSpeedCount * 10).toFixed(1))
  );

  // 2. Braking Risk (0-100, normalised per 100 km)
  const brakingRate = metrics.harsh_braking_rate_per_100km != null
    ? metrics.harsh_braking_rate_per_100km
    : ((metrics.harsh_braking_count || 0) * 1.5);
  const brakingRisk = Math.min(100, parseFloat((brakingRate * THRESHOLDS.BRAKING_RATE_SCALE).toFixed(1)));

  // 3. Acceleration Risk (0-100, normalised per 100 km)
  const accelRate = metrics.rapid_accel_rate_per_100km != null
    ? metrics.rapid_accel_rate_per_100km
    : ((metrics.rapid_accel_count || 0) * 1.5);
  const accelerationRisk = Math.min(100, parseFloat((accelRate * THRESHOLDS.ACCEL_RATE_SCALE).toFixed(1)));

  // 4. Cornering Risk (0-100, normalised per 100 km)
  const corneringRate = metrics.cornering_rate_per_100km || 0;
  const corneringRisk = Math.min(100, parseFloat((corneringRate * THRESHOLDS.CORNERING_RATE_SCALE).toFixed(1)));

  // 5. Unsafe Usage Risk (0-100, normalised per 100 km)
  const unsafeRate = metrics.unsafe_usage_rate_per_100km || 0;
  const unsafeUsageRisk = Math.min(100, parseFloat((unsafeRate * THRESHOLDS.UNSAFE_USAGE_SCALE).toFixed(1)));

  // ── Combined Driving Risk Score (0-100) ────────────────────────────────────
  const rawDrivingRiskScore =
    WEIGHTS.SPEEDING        * speedingRisk +
    WEIGHTS.HARSH_BRAKING   * brakingRisk +
    WEIGHTS.RAPID_ACCEL     * accelerationRisk +
    WEIGHTS.HARSH_CORNERING * corneringRisk +
    WEIGHTS.UNSAFE_USAGE    * unsafeUsageRisk;

  const drivingRiskScore = parseFloat(Math.min(100, Math.max(0, rawDrivingRiskScore)).toFixed(1));

  // ── Safety Score (100 - Driving Risk Score) ────────────────────────────────
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
    unsafe_usage_risk:        unsafeUsageRisk,
    // Weighted point impacts
    speeding_penalty:         parseFloat((WEIGHTS.SPEEDING * speedingRisk).toFixed(1)),
    braking_penalty:          parseFloat((WEIGHTS.HARSH_BRAKING * brakingRisk).toFixed(1)),
    acceleration_penalty:     parseFloat((WEIGHTS.RAPID_ACCEL * accelerationRisk).toFixed(1)),
    cornering_penalty:        parseFloat((WEIGHTS.HARSH_CORNERING * corneringRisk).toFixed(1)),
    unsafe_usage_penalty:     parseFloat((WEIGHTS.UNSAFE_USAGE * unsafeUsageRisk).toFixed(1)),
    // Legacy backward-compatibility aliases
    harsh_braking_penalty:    legacyBrakingPenalty,
    rapid_accel_penalty:      legacyAccelPenalty,
    speed_penalty:            -parseFloat((WEIGHTS.SPEEDING * speedingRisk).toFixed(1)),
    data_quality_penalty:     metrics.data_quality_status === 'warning' ? -5 : 0,
    // Totals
    driving_risk_score:       drivingRiskScore,
    safety_score:             safetyScore,
    final_score:              metrics.harsh_braking_count != null && metrics.harsh_braking_rate_per_100km == null
      ? 100 + legacyBrakingPenalty + legacyAccelPenalty + (metrics.data_quality_status === 'warning' ? -5 : 0)
      : safetyScore,
  };

  const explanation = buildExplanation(safetyScore, drivingRiskScore, riskCategory, factorContributions, metrics);

  return {
    score: factorContributions.final_score, // Mapped for backward compatibility
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
    disclaimer: 'FAIR BEHAVIOUR ASSESSMENT — calculated strictly from validated exposure and driving dynamics.',
  };
}

function buildExplanation(safetyScore, riskScore, category, factors, metrics) {
  const categoryLabels = {
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
    lines.push(`Braking events (${metrics.harsh_braking_rate_per_100km}/100km) contributed +${factors.braking_penalty} risk pts.`);
  }
  if (factors.cornering_penalty > 3) {
    lines.push(`Harsh cornering contributed +${factors.cornering_penalty} risk pts.`);
  }
  if (factors.acceleration_penalty > 3) {
    lines.push(`Rapid acceleration contributed +${factors.acceleration_penalty} risk pts.`);
  }
  if (factors.unsafe_usage_penalty > 3) {
    lines.push(`Unsafe usage (night/distraction) contributed +${factors.unsafe_usage_penalty} risk pts.`);
  }

  if (safetyScore >= 80) {
    lines.push('Consistent safe driving observed across verified distance.');
  }

  return lines.join(' ');
}

module.exports = {
  calculateScore,
  WEIGHTS,
  THRESHOLDS,
  RULE_VERSION,
};
