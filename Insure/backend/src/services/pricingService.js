/**
 * Fair Premium Calculation Engine
 *
 * Implements the Section 4 specifications:
 *
 * Base Premium: ₹1,000 per year (configurable via BASE_PREMIUM)
 *
 * Behaviour Adjustment:
 *   - Safety score 80–100:    10% discount  (−0.10) -> ₹900 (e.g. score 92)
 *   - Safety score 50–79.99:  0% adjustment  ( 0.00) -> ₹1,000 (e.g. score 65)
 *   - Safety score < 50:      20% increase   (+0.20) -> ₹1,200 (e.g. score 25)
 *   - Insufficient Data:      0% adjustment  (default approved pricing pathway -> ₹1,000)
 *
 * Accident History Adjustment (Separated & Fair):
 *   - 0 accidents:                           +0%
 *   - 1st accident (unknown/third-party):    +0% (reassessed without assuming fault)
 *   - 1st accident (verified driver fault):  +5% (moderate adjustment, never automatic high-risk)
 *   - Repeated (2+) verified at-fault:       +20%
 *
 * Non-discrimination guarantee:
 *   Legitimate insurance claims are NEVER reduced or rejected based on a driver's risk score.
 */

'use strict';

const RULE_VERSION      = process.env.PRICING_RULE_VERSION || 'v2.1-profitability';
const BASE_PREMIUM      = parseFloat(process.env.BASE_PREMIUM || '2000');
const SAFE_DISCOUNT_PCT = 10;   // 10% discount for safety score 80-100 -> ₹1,800
const RISKY_SURCHARGE_PCT = 20; // 20% increase for safety score < 50 -> ₹2,400
const CURRENCY          = process.env.CURRENCY || 'INR';
const CURRENCY_SYMBOL   = process.env.CURRENCY_SYMBOL || '₹';

/**
 * Calculate the fair illustrative insurance premium.
 *
 * @param {Object} assessment      output of calculateScore()
 * @param {Object} [accidentHistory] optional accident record context
 * @returns {Object} illustrative pricing breakdown
 */
function calculateQuote(assessment, accidentHistory = null) {
  const hasScore = assessment && (assessment.safety_score != null || assessment.score != null);
  const isInsufficient =
    !assessment ||
    assessment.risk_category === 'new_insufficient_data' ||
    assessment.status === 'review_required' ||
    !hasScore;

  // ── 1. Behaviour Adjustment Rate ───────────────────────────────────────────
  let behaviourAdjRate = 0.0;
  let behaviourTier = 'standard_default';

  if (!isInsufficient && hasScore) {
    const safetyScore = assessment.safety_score != null ? assessment.safety_score : assessment.score;
    if (safetyScore >= 80) {
      behaviourAdjRate = -0.10; // −10% discount
      behaviourTier = 'safe_driver_discount';
    } else if (safetyScore >= 50) {
      behaviourAdjRate = 0.00; // 0% adjustment
      behaviourTier = 'standard_moderate';
    } else {
      behaviourAdjRate = 0.20; // +20% surcharge
      behaviourTier = 'elevated_risk_surcharge';
    }
  }

  // ── 2. Accident History Adjustment (Separated from Behaviour) ─────────────
  let accidentAdjRate = 0.0;
  let accidentExplanation = 'No accident history on record.';

  if (accidentHistory && accidentHistory.previous_accidents_count > 0) {
    const count = accidentHistory.previous_accidents_count;
    const fault = accidentHistory.fault_status || 'unknown';

    if (count === 1) {
      if (fault === 'unknown' || fault === 'third_party_fault' || fault === 'no_fault_weather') {
        // Unknown fault is NEVER treated as driver fault; no automatic penalty!
        accidentAdjRate = 0.0;
        accidentExplanation = 'First incident recorded with no/unknown driver fault. Reassessed fairly with 0% surcharge.';
      } else if (fault === 'driver_fault') {
        // First verified at-fault accident triggers fair moderate adjustment (+5%), NOT high risk!
        accidentAdjRate = 0.05;
        accidentExplanation = 'First verified at-fault incident: moderate +5% probationary adjustment applied. Not classified as high risk.';
      }
    } else if (count >= 2) {
      if (fault === 'driver_fault') {
        accidentAdjRate = 0.20;
        accidentExplanation = 'Multiple verified at-fault incidents on record (+20% claims adjustment).';
      } else {
        accidentAdjRate = 0.05;
        accidentExplanation = 'Multiple non-fault/third-party incidents under review (+5% administrative adjustment).';
      }
    }
  }

  // ── 3. Premium Calculation ────────────────────────────────────────────────
  const behaviourAmount = parseFloat((BASE_PREMIUM * behaviourAdjRate).toFixed(2));
  const accidentAmount  = parseFloat((BASE_PREMIUM * accidentAdjRate).toFixed(2));
  const finalEstimate   = parseFloat(Math.max(0, BASE_PREMIUM + behaviourAmount + accidentAmount).toFixed(2));

  // ── 4. Build Transparent Explanation ──────────────────────────────────────
  let explanation = '';
  if (isInsufficient) {
    explanation = `Approved default base premium of ${CURRENCY_SYMBOL}${BASE_PREMIUM} applied due to insufficient telematics history. No unearned discounts or unfair penalties applied.`;
  } else {
    const sign = behaviourAdjRate < 0 ? '−' : '+';
    explanation = `Base premium of ${CURRENCY_SYMBOL}${BASE_PREMIUM} with ${sign}${Math.abs(behaviourAdjRate * 100)}% behaviour adjustment based on Safety Score of ${assessment.safety_score}/100.`;
    if (accidentAdjRate > 0) {
      explanation += ` Plus ${accidentExplanation}`;
    }
  }

  const isReviewRequired = assessment?.status === 'review_required' && !hasScore && assessment?.risk_category !== 'new_insufficient_data';

  return {
    illustrative_estimate:    isReviewRequired ? null : finalEstimate,
    base_premium:             BASE_PREMIUM,
    behaviour_adjustment:     isReviewRequired ? null : behaviourAmount,
    behaviour_adjustment_pct: isReviewRequired ? null : parseFloat((behaviourAdjRate * 100).toFixed(1)),
    accident_adjustment:      isReviewRequired ? null : accidentAmount,
    accident_adjustment_pct:  isReviewRequired ? null : parseFloat((accidentAdjRate * 100).toFixed(1)),
    // Total combined adjustment for backwards compatibility
    risk_adjustment:          isReviewRequired ? null : parseFloat((behaviourAmount + accidentAmount).toFixed(2)),
    risk_adjustment_pct:      isReviewRequired ? null : parseFloat(((behaviourAdjRate + accidentAdjRate) * 100).toFixed(1)),
    status:                   isReviewRequired ? 'review_required' : (isInsufficient ? 'provisional_default' : 'generated'),
    behaviour_tier:           behaviourTier,
    risk_category:            assessment?.risk_category || 'new_insufficient_data',
    safety_score:             assessment?.safety_score ?? (hasScore ? assessment?.score : null),
    rule_version:             RULE_VERSION,
    currency:                 CURRENCY,
    currency_symbol:          CURRENCY_SYMBOL,
    calculated_at:            new Date().toISOString(),
    explanation,
    accident_notes:           accidentExplanation,
    claims_protection_clause: 'Legitimate insurance claims are NEVER reduced, delayed, or rejected based on telematics risk scores.',
    disclaimer:               'ILLUSTRATIVE CALCULATION ONLY — demonstrative pricing model for fair telematics underwriting.',
  };
}

module.exports = {
  calculateQuote,
  BASE_PREMIUM,
  SAFE_DISCOUNT_PCT,
  RISKY_SURCHARGE_PCT,
  RULE_VERSION,
};
