'use strict';

const { calculateQuote, BASE_PREMIUM } = require('../src/services/pricingService');

describe('Fair Premium Calculation Engine (Section 4 & Acceptance Criteria)', () => {
  test('calculates 10% safe driver discount for score 92 (₹1,800 from ₹2,000 base)', () => {
    const assessment = {
      score: 92,
      safety_score: 92,
      risk_category: 'low_risk',
      status: 'scored',
      rule_version: 'v2.1-profitability',
    };
    const quote = calculateQuote(assessment);
    expect(quote.status).toBe('generated');
    expect(quote.base_premium).toBe(2000);
    expect(quote.behaviour_adjustment).toBe(-200);
    expect(quote.behaviour_adjustment_pct).toBe(-10);
    expect(quote.illustrative_estimate).toBe(1800);
    expect(quote.currency).toBe('INR');
  });

  test('calculates 0% adjustment for moderate score 65 (₹2,000 from ₹2,000 base)', () => {
    const assessment = {
      score: 65,
      safety_score: 65,
      risk_category: 'moderate_risk',
      status: 'scored',
      rule_version: 'v2.1-profitability',
    };
    const quote = calculateQuote(assessment);
    expect(quote.status).toBe('generated');
    expect(quote.base_premium).toBe(2000);
    expect(quote.behaviour_adjustment).toBe(0);
    expect(quote.behaviour_adjustment_pct).toBe(0);
    expect(quote.illustrative_estimate).toBe(2000);
  });

  test('calculates +20% surcharge for risky score 25 (₹2,400 from ₹2,000 base)', () => {
    const assessment = {
      score: 25,
      safety_score: 25,
      risk_category: 'high_risk',
      status: 'scored',
      rule_version: 'v2.1-profitability',
    };
    const quote = calculateQuote(assessment);
    expect(quote.status).toBe('generated');
    expect(quote.base_premium).toBe(2000);
    expect(quote.behaviour_adjustment).toBe(400);
    expect(quote.behaviour_adjustment_pct).toBe(20);
    expect(quote.illustrative_estimate).toBe(2400);
  });

  test('applies approved default pricing (₹2,000) for new_insufficient_data without unjustified discount or penalty', () => {
    const assessment = {
      score: null,
      safety_score: null,
      risk_category: 'new_insufficient_data',
      status: 'review_required',
      rule_version: 'v2.1-profitability',
    };
    const quote = calculateQuote(assessment);
    expect(quote.status).toBe('provisional_default');
    expect(quote.base_premium).toBe(2000);
    expect(quote.behaviour_adjustment).toBe(0);
    expect(quote.illustrative_estimate).toBe(2000);
  });

  test('withholds quote calculation if assessment status is review_required without score', () => {
    const assessment = {
      score: null,
      status: 'review_required',
      rule_version: 'v1.0',
    };
    const quote = calculateQuote(assessment);
    expect(quote.status).toBe('review_required');
    expect(quote.illustrative_estimate).toBeNull();
    expect(quote.risk_adjustment).toBeNull();
  });

  test('ensures claims protection clause is explicitly stated', () => {
    const assessment = { score: 90, safety_score: 90, status: 'scored' };
    const quote = calculateQuote(assessment);
    expect(quote.claims_protection_clause).toMatch(/claims are NEVER reduced/i);
  });
});
