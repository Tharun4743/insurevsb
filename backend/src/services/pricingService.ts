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

export function getBasePremium(): number {
  return parseFloat(process.env.BASE_PREMIUM || '2000');
}
export function getRuleVersion(): string {
  return process.env.PRICING_RULE_VERSION || 'v2.1-profitability';
}
export function getCurrency(): string {
  return process.env.CURRENCY || 'INR';
}
export function getCurrencySymbol(): string {
  return process.env.CURRENCY_SYMBOL || '₹';
}

export const SAFE_DISCOUNT_PCT = 10;   // 10% discount for safety score 80-100 -> ₹1,800
export const RISKY_SURCHARGE_PCT = 20; // 20% increase for safety score < 50 -> ₹2,400

export function calculateQuote(assessment: any, accidentHistory: any = null, pricingConfig: any = null): any {
  const currentBasePremium = getBasePremium();
  const currentRuleVersion = getRuleVersion();
  const currentCurrency = getCurrency();
  const currentCurrencySymbol = getCurrencySymbol();
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
    const safetyScore = Number(assessment.safety_score != null ? assessment.safety_score : assessment.score);
    const isContinuous = pricingConfig?.continuous === true || assessment?.continuous === true;

    if (isContinuous) {
      // Continuous actuarial formula around benchmark 65
      if (Math.abs(safetyScore - 65) < 0.001) {
        behaviourAdjRate = 0.00;
        behaviourTier = 'standard_moderate';
      } else if (safetyScore > 65) {
        const pct = -((safetyScore - 65) * (10 / 27));
        behaviourAdjRate = parseFloat((pct / 100).toFixed(4));
        behaviourTier = safetyScore >= 80 ? 'safe_driver_discount' : 'moderate_safe_discount';
      } else {
        const pct = (65 - safetyScore) * 0.5;
        behaviourAdjRate = parseFloat((pct / 100).toFixed(4));
        behaviourTier = safetyScore >= 50 ? 'standard_moderate' : 'elevated_risk_surcharge';
      }
    } else {
      // Standard Actuarial Rule Matrix (Section 9 Acceptance Criteria):
      // - Score 80-100: -10% Discount (Safe driver earned discount)
      // - Score 50-79.99: 0.0% Neutral (Standard baseline)
      // - Score < 50: +20% Surcharge (High-risk driver surcharge)
      if (safetyScore >= 80) {
        behaviourAdjRate = -0.10;
        behaviourTier = 'safe_driver_discount';
      } else if (safetyScore >= 50) {
        behaviourAdjRate = 0.00;
        behaviourTier = 'standard_moderate';
      } else {
        behaviourAdjRate = 0.20;
        behaviourTier = 'elevated_risk_surcharge';
      }
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
        accidentAdjRate = 0.0;
        accidentExplanation = 'First incident recorded with no/unknown driver fault. Reassessed fairly with 0% surcharge.';
      } else if (fault === 'driver_fault') {
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
  const behaviourAmount = parseFloat((currentBasePremium * behaviourAdjRate).toFixed(2));
  const accidentAmount  = parseFloat((currentBasePremium * accidentAdjRate).toFixed(2));
  const finalEstimate   = parseFloat(Math.max(0, currentBasePremium + behaviourAmount + accidentAmount).toFixed(2));

  // ── 4. Build Transparent Explanation ──────────────────────────────────────
  let explanation = '';
  if (isInsufficient) {
    explanation = `Approved default base premium of ${currentCurrencySymbol}${currentBasePremium} applied due to insufficient telematics history. No unearned discounts or unfair penalties applied.`;
  } else {
    const sign = behaviourAdjRate < 0 ? '−' : '+';
    explanation = `Base premium of ${currentCurrencySymbol}${currentBasePremium} with ${sign}${Math.abs(behaviourAdjRate * 100)}% behaviour adjustment based on Safety Score of ${assessment.safety_score}/100.`;
    if (accidentAdjRate > 0) {
      explanation += ` Plus ${accidentExplanation}`;
    }
  }

  const isReviewRequired = assessment?.status === 'review_required' && !hasScore && assessment?.risk_category !== 'new_insufficient_data';

  return {
    illustrative_estimate:    isReviewRequired ? null : finalEstimate,
    base_premium:             currentBasePremium,
    behaviour_adjustment:     isReviewRequired ? null : behaviourAmount,
    behaviour_adjustment_pct: isReviewRequired ? null : parseFloat((behaviourAdjRate * 100).toFixed(1)),
    accident_adjustment:      isReviewRequired ? null : accidentAmount,
    accident_adjustment_pct:  isReviewRequired ? null : parseFloat((accidentAdjRate * 100).toFixed(1)),
    risk_adjustment:          isReviewRequired ? null : parseFloat((behaviourAmount + accidentAmount).toFixed(2)),
    risk_adjustment_pct:      isReviewRequired ? null : parseFloat(((behaviourAdjRate + accidentAdjRate) * 100).toFixed(1)),
    status:                   isReviewRequired ? 'review_required' : (isInsufficient ? 'provisional_default' : 'generated'),
    behaviour_tier:           behaviourTier,
    risk_category:            assessment?.risk_category || 'new_insufficient_data',
    safety_score:             assessment?.safety_score ?? (hasScore ? assessment?.score : null),
    rule_version:             currentRuleVersion,
    currency:                 currentCurrency,
    currency_symbol:          currentCurrencySymbol,
    calculated_at:            new Date().toISOString(),
    explanation,
    accident_notes:           accidentExplanation,
    claims_protection_clause: 'Legitimate insurance claims are NEVER reduced, delayed, or rejected based on telematics risk scores.',
    disclaimer:               'ILLUSTRATIVE CALCULATION ONLY — demonstrative pricing model for fair telematics underwriting.',
  };
}

export const BASE_PREMIUM = getBasePremium();
export const RULE_VERSION = getRuleVersion();
