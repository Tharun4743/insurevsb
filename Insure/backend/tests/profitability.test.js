/**
 * Customer Growth & Profitability Optimization Test Suite
 *
 * Verifies all 12 Testing Requirements specified in Section 12:
 * 1. Premium calculations with and without discounts.
 * 2. Customer growth that increases profit.
 * 3. Customer growth that decreases profit.
 * 4. Lower premiums without customer growth.
 * 5. Higher claims costs.
 * 6. Increased acquisition and platform expenses.
 * 7. First-accident handling.
 * 8. Insufficient customer or risk data.
 * 9. Break-even calculations.
 * 10. Scenarios where no available pricing strategy meets the target profit.
 * 11. Zero customers and invalid financial inputs.
 * 12. Consistency between backend results and dashboard values.
 */

'use strict';

const {
  calculateFinancials,
  simulateStrategy,
  optimizePricingStrategies,
  evaluateSafeguards,
  BASELINE_PRESET,
  DEFAULT_PRESETS,
} = require('../src/services/profitabilityService');

const { calculateQuote, BASE_PREMIUM } = require('../src/services/pricingService');
const { calculateScore } = require('../src/services/scoringService');

describe('Customer Growth & Underwriting Profitability Engine (Section 12)', () => {

  // ── 1. Premium calculations with and without discounts ────────────────────────
  describe('Requirement 1: Premium calculations with and without discounts', () => {
    test('calculates standard base premium of ₹2,000 without discount (0% adjustment)', () => {
      const assessment = { score: 65, safety_score: 65, risk_category: 'moderate_risk', status: 'scored' };
      const quote = calculateQuote(assessment);

      expect(quote.base_premium).toBe(2000);
      expect(quote.behaviour_adjustment_pct).toBe(0);
      expect(quote.behaviour_adjustment).toBe(0);
      expect(quote.illustrative_estimate).toBe(2000);
      expect(quote.currency).toBe('INR');
    });

    test('calculates eligible 10% safe driver discount resulting in ₹1,800 premium', () => {
      const assessment = { score: 92, safety_score: 92, risk_category: 'low_risk', status: 'scored' };
      const quote = calculateQuote(assessment);

      expect(quote.base_premium).toBe(2000);
      expect(quote.behaviour_adjustment_pct).toBe(-10);
      expect(quote.behaviour_adjustment).toBe(-200);
      expect(quote.illustrative_estimate).toBe(1800);
    });

    test('calculates portfolio premium revenue as Customer Count × Average Earned Premium', () => {
      // 1,000 customers at ₹2,000 = ₹20,00,000
      const baselineFinancials = calculateFinancials({ customer_count: 1000, avg_annual_premium: 2000 });
      expect(baselineFinancials.premium_revenue).toBe(2000000);

      // 1,300 customers at ₹1,800 = ₹23,40,000
      const discountedFinancials = calculateFinancials({ customer_count: 1300, avg_annual_premium: 1800 });
      expect(discountedFinancials.premium_revenue).toBe(2340000);
    });
  });

  // ── 2. Customer growth that increases profit ─────────────────────────────────
  describe('Requirement 2: Customer growth that increases profit', () => {
    test('1,300 customers at ₹1,800 increases underwriting profit from ₹3,00,000 to ₹4,90,000', () => {
      const result = simulateStrategy(DEFAULT_PRESETS.expected, BASELINE_PRESET);

      expect(result.baseline.customer_count).toBe(1000);
      expect(result.baseline.avg_annual_premium).toBe(2000);
      expect(result.baseline.premium_revenue).toBe(2000000);
      expect(result.baseline.underwriting_profit).toBe(300000);

      expect(result.outcome.customer_count).toBe(1300);
      expect(result.outcome.avg_annual_premium).toBe(1800);
      expect(result.outcome.premium_revenue).toBe(2340000);
      expect(result.outcome.claims_incurred).toBe(1300000);
      expect(result.outcome.total_expenses).toBe(550000);
      expect(result.outcome.underwriting_profit).toBe(490000);

      // Net profit difference = +₹1,90,000 (+63.33%)
      expect(result.comparison.profit_difference).toBe(190000);
      expect(result.comparison.profit_growth_pct).toBe(63.33);
      expect(result.safeguards.is_eligible).toBe(true);
    });
  });

  // ── 3. Customer growth that decreases profit ─────────────────────────────────
  describe('Requirement 3: Customer growth that decreases profit', () => {
    test('customer growth with excessive acquisition costs or claims reduces underwriting profit', () => {
      const unprofitableGrowthInput = {
        name: 'Aggressive Customer Push',
        customer_count: 1600, // +60% customers
        avg_annual_premium: 1700, // steep discount
        claims_incurred: 1700000, // claims surge
        operating_expenses: 500000,
        platform_costs: 60000,
        acquisition_cost: 600000, // very high CAC
        other_expenses: 0,
      };

      const result = simulateStrategy(unprofitableGrowthInput, BASELINE_PRESET);

      // Revenue = 1,600 * 1,700 = 27,20,000
      expect(result.outcome.premium_revenue).toBe(2720000);
      // Total expenses = 500000 + 60000 + 600000 = 11,60,000
      expect(result.outcome.total_expenses).toBe(1160000);
      // Underwriting profit = 27,20,000 - 17,00,000 - 11,60,000 = -1,40,000 (Loss!)
      expect(result.outcome.underwriting_profit).toBe(-140000);
      expect(result.comparison.profit_difference).toBe(-440000);

      // Safeguard must detect unprofitable growth and underwriting loss
      expect(result.safeguards.is_eligible).toBe(false);
      const lossFlag = result.safeguards.flags.find(f => f.code === 'UNDERWRITING_LOSS');
      expect(lossFlag).toBeDefined();
    });

    test('customer growth with moderate profit reduction triggers warning', () => {
      const moderateGrowthInput = {
        name: 'Growth with High Churn Replacement Cost',
        customer_count: 1200,
        avg_annual_premium: 1850,
        claims_incurred: 1350000,
        operating_expenses: 500000,
        platform_costs: 50000,
        acquisition_cost: 150000, // total costs = 700000, claims = 1350000, total = 2050000
        // Revenue = 1200 * 1850 = 22,20,000 -> Profit = 1,70,000 vs baseline 3,00,000
      };

      const result = simulateStrategy(moderateGrowthInput, BASELINE_PRESET);
      expect(result.outcome.customer_count).toBe(1200);
      expect(result.outcome.underwriting_profit).toBe(170000); // lower than baseline 300000
      const warningFlag = result.safeguards.flags.find(f => f.code === 'UNPROFITABLE_GROWTH');
      expect(warningFlag).toBeDefined();
      expect(warningFlag.message).toMatch(/lower total underwriting profit/i);
    });
  });

  // ── 4. Lower premiums without customer growth ────────────────────────────────
  describe('Requirement 4: Lower premiums without customer growth', () => {
    test('reducing premium from ₹2,000 to ₹1,800 without customer expansion erodes profit by ₹2,00,000', () => {
      const lowerPriceNoGrowth = {
        name: 'Discount Without New Acquisition',
        customer_count: 1000, // unchanged customers
        avg_annual_premium: 1800, // 10% discount
        claims_incurred: 1200000, // unchanged claims
        operating_expenses: 500000,
        platform_costs: 0,
        acquisition_cost: 0,
      };

      const result = simulateStrategy(lowerPriceNoGrowth, BASELINE_PRESET);

      // Revenue drops to 1000 * 1800 = 18,00,000 (was 20,00,000)
      expect(result.outcome.premium_revenue).toBe(1800000);
      // Profit drops to 18,00,000 - 12,00,000 - 5,00,000 = 1,00,000 (was 3,00,000)
      expect(result.outcome.underwriting_profit).toBe(100000);
      expect(result.comparison.profit_difference).toBe(-200000);
      expect(result.comparison.profit_growth_pct).toBe(-66.67);
    });
  });

  // ── 5. Higher claims costs ───────────────────────────────────────────────────
  describe('Requirement 5: Higher claims costs', () => {
    test('claims surge from ₹12,00,000 to ₹16,00,000 results in underwriting loss', () => {
      const higherClaimsInput = {
        name: 'Elevated Catastrophic / Claim Frequency',
        customer_count: 1000,
        avg_annual_premium: 2000,
        claims_incurred: 1600000, // +₹4,00,000 claims
        operating_expenses: 500000,
        platform_costs: 0,
      };

      const outcome = calculateFinancials(higherClaimsInput);

      // Revenue: 20,00,000. Expenses: 5,00,000. Claims: 16,00,000.
      // Underwriting profit = 20,00,000 - 16,00,000 - 5,00,000 = -1,00,000
      expect(outcome.underwriting_profit).toBe(-100000);
      expect(outcome.claims_ratio_pct).toBe(80.0);
      expect(outcome.combined_ratio_pct).toBe(105.0); // 80% claims + 25% expenses

      const safeguards = evaluateSafeguards(outcome, BASELINE_PRESET, higherClaimsInput);
      expect(safeguards.is_eligible).toBe(false);
      expect(safeguards.flags.some(f => f.code === 'UNDERWRITING_LOSS')).toBe(true);
      expect(safeguards.flags.some(f => f.code === 'COMBINED_RATIO_EXCEEDED')).toBe(true);
    });
  });

  // ── 6. Increased acquisition and platform expenses ───────────────────────────
  describe('Requirement 6: Increased acquisition and platform expenses', () => {
    test('expense increases reduce underwriting profit rupee-for-rupee', () => {
      const standard = calculateFinancials({
        customer_count: 1300,
        avg_annual_premium: 1800,
        claims_incurred: 1300000,
        operating_expenses: 500000,
        platform_costs: 50000,
        acquisition_cost: 0,
      });

      const elevatedExpenses = calculateFinancials({
        customer_count: 1300,
        avg_annual_premium: 1800,
        claims_incurred: 1300000,
        operating_expenses: 500000,
        platform_costs: 150000, // +100,000 platform
        acquisition_cost: 100000, // +100,000 acquisition
      });

      expect(standard.underwriting_profit).toBe(490000);
      // 490,000 - 100,000 - 100,000 = 290,000
      expect(elevatedExpenses.underwriting_profit).toBe(290000);
      expect(elevatedExpenses.total_expenses).toBe(750000);
      expect(elevatedExpenses.total_expenses - standard.total_expenses).toBe(200000);
    });
  });

  // ── 7. First-accident handling ───────────────────────────────────────────────
  describe('Requirement 7: First-accident handling', () => {
    test('first accident does not automatically assign high-risk category or maximum surcharge', () => {
      // Driver with safe telematics (safety score 88) experiencing a first accident
      const assessment = {
        score: 88,
        safety_score: 88,
        risk_category: 'low_risk',
        status: 'scored',
      };

      const quote = calculateQuote(assessment, {
        previous_accidents_count: 1, // First accident
        accident_fault: 'unknown',
      });

      // Behaviour discount remains based on driving behaviour (-10% = -₹200)
      expect(quote.behaviour_adjustment).toBe(-200);
      // Accident adjustment: moderate provisional surcharge (+₹100) or zero, not high-risk (+₹400)
      expect(quote.accident_adjustment).toBeLessThanOrEqual(150);
      // Final premium is far below high-risk premium of ₹2,400
      expect(quote.illustrative_estimate).toBeLessThan(2200);
      expect(quote.risk_category).toBe('low_risk');
    });
  });

  // ── 8. Insufficient customer or risk data ────────────────────────────────────
  describe('Requirement 8: Insufficient customer or risk data', () => {
    test('insufficient telematics routes to approved default pricing (₹2,000) without arbitrary penalty or discount', () => {
      const emptyMetrics = {
        data_confidence: 'insufficient',
        data_quality_status: 'review_required',
        total_distance_km: 0.2,
        valid_reading_count: 2,
      };

      const assessment = calculateScore(emptyMetrics);
      expect(assessment.risk_category).toBe('new_insufficient_data');
      expect(assessment.safety_score).toBeNull();
      expect(assessment.status).toBe('review_required');

      const quote = calculateQuote(assessment);
      expect(quote.status).toBe('provisional_default');
      expect(quote.base_premium).toBe(2000);
      expect(quote.explanation).toMatch(/default base premium/i);
    });
  });

  // ── 9. Break-even calculations ───────────────────────────────────────────────
  describe('Requirement 9: Break-even calculations', () => {
    test('calculates correct break-even customer count and break-even premium', () => {
      // Total expenses = 5,00,000 + 50,000 = 5,50,000; Claims = 13,00,000. Total costs = 18,50,000.
      const financials = calculateFinancials({
        customer_count: 1300,
        avg_annual_premium: 1800,
        claims_incurred: 1300000,
        operating_expenses: 500000,
        platform_costs: 50000,
      });

      // Break-even customers = ceil(18,50,000 / 1800) = ceil(1027.77) = 1,028
      expect(financials.break_even_customers).toBe(1028);

      // Break-even premium = 18,50,000 / 1300 = ₹1,423.08
      expect(financials.break_even_premium).toBe(1423.08);

      // Verify at break-even customers, underwriting profit is non-negative
      const atBreakEven = calculateFinancials({
        customer_count: financials.break_even_customers,
        avg_annual_premium: 1800,
        claims_incurred: 1300000,
        operating_expenses: 500000,
        platform_costs: 50000,
      });
      expect(atBreakEven.underwriting_profit).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 10. Scenarios where no available pricing strategy meets target profit ────
  describe('Requirement 10: Scenarios where no strategy meets target profit', () => {
    test('optimizer correctly identifies when target profit of ₹6,00,000 is not met by any candidate', () => {
      const candidates = [
        {
          name: 'Conservative Candidate',
          customer_count: 1100,
          avg_annual_premium: 1800,
          claims_incurred: 1250000,
          operating_expenses: 510000,
          platform_costs: 40000,
          target_underwriting_profit: 600000, // high target
        },
        {
          name: 'Expected Candidate',
          customer_count: 1300,
          avg_annual_premium: 1800,
          claims_incurred: 1300000,
          operating_expenses: 500000,
          platform_costs: 50000,
          target_underwriting_profit: 600000, // high target
        },
      ];

      const optimization = optimizePricingStrategies(candidates, BASELINE_PRESET);

      expect(optimization.eligible_count).toBe(2);
      // Both candidates fail to hit ₹6,00,000
      expect(optimization.strategies[0].comparison.meets_target_profit).toBe(false);
      expect(optimization.strategies[1].comparison.meets_target_profit).toBe(false);

      // Optimizer still selects the HIGHEST PROFIT strategy (₹4,90,000) rather than failing silently
      expect(optimization.selected_strategy.scenario_name).toBe('Expected Candidate');
      expect(optimization.selected_strategy.outcome.underwriting_profit).toBe(490000);
      expect(optimization.selected_strategy.comparison.meets_target_profit).toBe(false);
    });
  });

  // ── 11. Zero customers and invalid financial inputs ───────────────────────────
  describe('Requirement 11: Zero customers and invalid financial inputs', () => {
    test('handles zero customers gracefully without NaN or division by zero errors', () => {
      const zeroCustomers = calculateFinancials({
        customer_count: 0,
        avg_annual_premium: 1800,
        claims_incurred: 100000,
        operating_expenses: 50000,
      });

      expect(zeroCustomers.premium_revenue).toBe(0);
      expect(zeroCustomers.underwriting_profit).toBe(-150000);
      expect(zeroCustomers.profit_margin_pct).toBe(0);
      expect(zeroCustomers.claims_ratio_pct).toBe(0);
      expect(zeroCustomers.break_even_premium).toBe(0);
      expect(Number.isFinite(zeroCustomers.break_even_customers)).toBe(true);

      const safeguards = evaluateSafeguards(zeroCustomers, BASELINE_PRESET, {});
      expect(safeguards.is_eligible).toBe(false);
      expect(safeguards.flags.some(f => f.code === 'ZERO_CUSTOMERS')).toBe(true);
    });

    test('handles negative and null inputs safely by clamping to zero', () => {
      const invalidInputs = calculateFinancials({
        customer_count: -50,
        avg_annual_premium: -1800,
        claims_incurred: null,
        operating_expenses: undefined,
      });

      expect(invalidInputs.customer_count).toBe(0);
      expect(invalidInputs.avg_annual_premium).toBe(0);
      expect(invalidInputs.claims_incurred).toBe(0);
      expect(invalidInputs.operating_expenses).toBe(0);
      expect(invalidInputs.premium_revenue).toBe(0);
      expect(invalidInputs.underwriting_profit).toBe(0);
    });

    test('rejects candidate strategy that violates 25% regulatory discount cap', () => {
      const excessiveDiscount = {
        name: 'Excessive 35% Discount Strategy',
        customer_count: 1400,
        avg_annual_premium: 1300, // 35% discount from ₹2,000 baseline
        claims_incurred: 1100000,
        operating_expenses: 400000,
      };

      const result = simulateStrategy(excessiveDiscount, BASELINE_PRESET);
      expect(result.safeguards.is_eligible).toBe(false);
      expect(result.safeguards.evaluated_discount_pct).toBe(35.0);
      const capFlag = result.safeguards.flags.find(f => f.code === 'DISCOUNT_CAP_EXCEEDED');
      expect(capFlag).toBeDefined();
      expect(capFlag.message).toMatch(/exceeds the insurer's approved regulatory discount limit/i);
    });
  });

  // ── 12. Consistency between backend results and dashboard values ──────────────
  describe('Requirement 12: Consistency between backend results and dashboard values', () => {
    test('BEFORE INSURE and WITH INSURE values match Section 8 illustrative specifications exactly', () => {
      const baseline = calculateFinancials(BASELINE_PRESET);
      // BEFORE INSURE: 1,000 customers, ₹2,000 avg premium, ₹20,00,000 revenue, ₹12,00,000 claims, ₹5,00,000 expenses, ₹3,00,000 profit
      expect(baseline.customer_count).toBe(1000);
      expect(baseline.avg_annual_premium).toBe(2000);
      expect(baseline.premium_revenue).toBe(2000000);
      expect(baseline.claims_incurred).toBe(1200000);
      expect(baseline.total_expenses).toBe(500000);
      expect(baseline.underwriting_profit).toBe(300000);
      expect(baseline.profit_margin_pct).toBe(15.0);

      // WITH INSURE (Expected): 1,300 customers, ₹1,800 avg premium, ₹23,40,000 revenue, ₹13,00,000 claims, ₹5,50,000 expenses, ₹4,90,000 profit
      const expectedSimulation = simulateStrategy(DEFAULT_PRESETS.expected, BASELINE_PRESET);
      const outcome = expectedSimulation.outcome;
      expect(outcome.customer_count).toBe(1300);
      expect(outcome.avg_annual_premium).toBe(1800);
      expect(outcome.premium_revenue).toBe(2340000);
      expect(outcome.claims_incurred).toBe(1300000);
      expect(outcome.total_expenses).toBe(550000);
      expect(outcome.underwriting_profit).toBe(490000);
      expect(outcome.profit_margin_pct).toBe(20.94);

      // Comparison metrics
      expect(expectedSimulation.comparison.profit_difference).toBe(190000);
      expect(expectedSimulation.comparison.customer_difference).toBe(300);
      expect(expectedSimulation.comparison.revenue_difference).toBe(340000);
    });

    test('optimizer chooses the highest profit strategy and rejects lower profit or loss-making strategies', () => {
      const candidates = [
        {
          name: 'Conservative',
          customer_count: 1100,
          avg_annual_premium: 1800,
          claims_incurred: 1250000,
          operating_expenses: 510000,
          platform_costs: 40000,
          acquisition_cost: 0,
        }, // revenue 19,80,000 - 12,50,000 - 5,50,000 = 1,80,000 profit
        {
          name: 'Expected',
          customer_count: 1300,
          avg_annual_premium: 1800,
          claims_incurred: 1300000,
          operating_expenses: 500000,
          platform_costs: 50000,
          acquisition_cost: 0,
        }, // profit = 4,90,000
        {
          name: 'Lowest Price Loss Leader',
          customer_count: 1500,
          avg_annual_premium: 1400, // 30% discount -> rejected by cap & low profit
          claims_incurred: 1400000,
          operating_expenses: 550000,
          platform_costs: 50000,
        },
      ];

      const optimization = optimizePricingStrategies(candidates, BASELINE_PRESET);

      // Optimizer selects 'Expected' because it has the highest underwriting profit (₹4,90,000)
      // NOT 'Lowest Price Loss Leader' despite having more customers (1,500 vs 1,300)
      expect(optimization.selected_strategy.scenario_name).toBe('Expected');
      expect(optimization.selected_strategy.outcome.underwriting_profit).toBe(490000);

      // Verify Lowest Price Loss Leader was disqualified due to discount cap (30% > 25%)
      const lossLeader = optimization.strategies.find(s => s.scenario_name === 'Lowest Price Loss Leader');
      expect(lossLeader.safeguards.is_eligible).toBe(false);
    });
  });
});
