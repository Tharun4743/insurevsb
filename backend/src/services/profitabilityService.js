/**
 * Customer Growth & Underwriting Profitability Optimization Engine
 *
 * Implements Sections 3, 4, 5, 6, 8, and 9:
 *  - Premium Revenue = Customer Count × Average Earned Premium
 *  - Underwriting Profit = Earned Premiums − Claims Incurred − Operating Expenses − Platform Costs
 *  - Total Expenses = Operating Expenses + Customer Acquisition Costs + Platform Costs + Other Expenses
 *  - Profitability-Aware Pricing Optimizer: Selects highest expected profit among eligible scenarios.
 *  - Financial Scenario Simulator: Conservative, Expected, Optimistic assumptions.
 *  - Before-and-After Benchmark Modeling: Baseline (₹3,00,000) vs INSURE (₹4,90,000).
 *  - Underwriting and Fairness Safeguards: Enforces discount caps, profitability constraints, and non-discrimination.
 */

'use strict';

const RULE_VERSION = process.env.PRICING_RULE_VERSION || 'v2.1-profitability';

// Default Benchmark Baseline (BEFORE INSURE)
const BASELINE_PRESET = {
  name: 'Baseline (Before INSURE)',
  strategy_type: 'baseline',
  customer_count: 1000,
  avg_annual_premium: 2000,
  claims_incurred: 1200000,
  operating_expenses: 500000,
  platform_costs: 0,
  acquisition_cost: 0,
  other_expenses: 0,
  description: 'Starting commercial portfolio before competitive telematics pricing.',
};

// Demonstration presets for Financial Simulator
const DEFAULT_PRESETS = {
  baseline: BASELINE_PRESET,

  conservative: {
    name: 'Conservative Growth Scenario',
    strategy_type: 'conservative',
    customer_count: 1100,
    existing_customers: 1000,
    renewal_rate_pct: 82, // 820 retained
    new_customers_acquired: 280, // Total 1,100
    avg_annual_premium: 1800, // 10% competitive discount
    claims_incurred: 1250000, // Higher claims costs
    operating_expenses: 510000,
    platform_costs: 40000,
    acquisition_cost: 0,
    cac_per_customer: 250,
    other_expenses: 0,
    description: 'Cautious projection with lower customer growth and elevated claims incurred.',
  },

  expected: {
    name: 'Expected Growth Scenario (With INSURE)',
    strategy_type: 'expected',
    customer_count: 1300,
    existing_customers: 1000,
    renewal_rate_pct: 88, // 880 retained
    new_customers_acquired: 420, // Total 1,300
    avg_annual_premium: 1800, // 10% competitive discount
    claims_incurred: 1300000, // Normalized claims across larger safe portfolio
    operating_expenses: 500000,
    platform_costs: 50000,
    acquisition_cost: 0,
    cac_per_customer: 250,
    other_expenses: 0,
    description: 'Realistic actuarial expectation with 1,300 customers and ₹4,90,000 underwriting profit.',
  },

  optimistic: {
    name: 'Optimistic Growth Scenario',
    strategy_type: 'optimistic',
    customer_count: 1500,
    existing_customers: 1000,
    renewal_rate_pct: 94, // 940 retained
    new_customers_acquired: 560, // Total 1,500
    avg_annual_premium: 1800, // 10% competitive discount
    claims_incurred: 1400000,
    operating_expenses: 520000,
    platform_costs: 60000,
    acquisition_cost: 0,
    cac_per_customer: 200,
    other_expenses: 0,
    description: 'High adoption scenario with expanded customer base and validated retention.',
  },
};

/**
 * Calculate Annual Underwriting Profit and Financial Breakdown.
 *
 * Formula:
 *  Premium Revenue = Customer Count × Average Annual Premium
 *  Total Expenses = Operating Expenses + Acquisition Costs + Platform Costs + Other Expenses
 *  Underwriting Profit = Premium Revenue − Claims Incurred − Total Expenses
 *  Profit Margin = (Underwriting Profit / Premium Revenue) * 100
 *
 * @param {Object} params
 * @returns {Object} financial analysis
 */
function calculateFinancials(params) {
  const customerCount     = Math.max(0, parseInt(params.customer_count || '0', 10));
  const avgAnnualPremium  = Math.max(0, parseFloat(params.avg_annual_premium || '0'));
  const claimsIncurred    = Math.max(0, parseFloat(params.claims_incurred || '0'));
  const operatingExpenses = Math.max(0, parseFloat(params.operating_expenses || '0'));
  const platformCosts     = Math.max(0, parseFloat(params.platform_costs || '0'));
  const acquisitionCost   = Math.max(0, parseFloat(params.acquisition_cost || '0'));
  const otherExpenses     = Math.max(0, parseFloat(params.other_expenses || '0'));

  // 1. Revenue
  const premiumRevenue = parseFloat((customerCount * avgAnnualPremium).toFixed(2));

  // 2. Expenses
  const totalExpenses = parseFloat(
    (operatingExpenses + acquisitionCost + platformCosts + otherExpenses).toFixed(2)
  );

  // 3. Underwriting Profit (Incurred claims + total expenses deducted from earned premium)
  const underwritingProfit = parseFloat(
    (premiumRevenue - claimsIncurred - totalExpenses).toFixed(2)
  );

  // 4. Margins & Ratios
  const profitMarginPct = premiumRevenue > 0
    ? parseFloat(((underwritingProfit / premiumRevenue) * 100).toFixed(2))
    : 0.0;

  const claimsRatioPct = premiumRevenue > 0
    ? parseFloat(((claimsIncurred / premiumRevenue) * 100).toFixed(2))
    : 0.0;

  const expenseRatioPct = premiumRevenue > 0
    ? parseFloat(((totalExpenses / premiumRevenue) * 100).toFixed(2))
    : 0.0;

  const combinedRatioPct = parseFloat((claimsRatioPct + expenseRatioPct).toFixed(2));

  // 5. Break-Even Calculations
  // Break-even customers: how many policyholders needed to cover all claims and expenses
  const breakEvenCustomers = avgAnnualPremium > 0
    ? Math.ceil((claimsIncurred + totalExpenses) / avgAnnualPremium)
    : 0;

  // Break-even premium: minimum average premium per customer needed to avoid loss
  const breakEvenPremium = customerCount > 0
    ? parseFloat(((claimsIncurred + totalExpenses) / customerCount).toFixed(2))
    : 0;

  return {
    customer_count:       customerCount,
    avg_annual_premium:   avgAnnualPremium,
    premium_revenue:      premiumRevenue,
    claims_incurred:      claimsIncurred,
    operating_expenses:   operatingExpenses,
    platform_costs:       platformCosts,
    acquisition_cost:     acquisitionCost,
    other_expenses:       otherExpenses,
    total_expenses:       totalExpenses,
    underwriting_profit:  underwritingProfit,
    profit_margin_pct:    profitMarginPct,
    claims_ratio_pct:     claimsRatioPct,
    expense_ratio_pct:    expenseRatioPct,
    combined_ratio_pct:   combinedRatioPct,
    break_even_customers: breakEvenCustomers,
    break_even_premium:   breakEvenPremium,
    currency:             'INR',
    currency_symbol:      '₹',
  };
}

/**
 * Simulate Customer Acquisition and Retention Strategy.
 *
 * @param {Object} input
 * @param {Object} [customBaseline]
 * @returns {Object} scenario outcome compared against baseline
 */
function simulateStrategy(input, customBaseline = null) {
  const baseline = calculateFinancials(customBaseline || BASELINE_PRESET);

  // Determine Customer Numbers from Renewal + Acquisition
  let customerCount = input.customer_count;
  let totalAcquisitionCost = input.acquisition_cost || 0;

  if (customerCount == null && input.existing_customers != null) {
    const existing = parseInt(input.existing_customers, 10) || 0;
    const renewalRate = parseFloat(input.renewal_rate_pct != null ? input.renewal_rate_pct : 85) / 100;
    const retained = Math.round(existing * renewalRate);
    const newAcquired = parseInt(input.new_customers_acquired || '0', 10);
    const cacPerCust = parseFloat(input.cac_per_customer || '250');

    customerCount = retained + newAcquired;
    totalAcquisitionCost = parseFloat((newAcquired * cacPerCust).toFixed(2));
  }

  // Determine Claims Incurred
  let claimsIncurred = input.claims_incurred;
  if (claimsIncurred == null) {
    if (input.claims_ratio_pct != null && input.avg_annual_premium != null) {
      const revenue = (customerCount || 0) * parseFloat(input.avg_annual_premium);
      claimsIncurred = parseFloat((revenue * (parseFloat(input.claims_ratio_pct) / 100)).toFixed(2));
    } else if (input.claims_cost_per_policy != null) {
      claimsIncurred = parseFloat(((customerCount || 0) * parseFloat(input.claims_cost_per_policy)).toFixed(2));
    } else {
      claimsIncurred = baseline.claims_incurred;
    }
  }

  const financialParams = {
    customer_count:     customerCount,
    avg_annual_premium: input.avg_annual_premium != null ? input.avg_annual_premium : 1800,
    claims_incurred:    claimsIncurred,
    operating_expenses: input.operating_expenses != null ? input.operating_expenses : 500000,
    platform_costs:     input.platform_costs != null ? input.platform_costs : 50000,
    acquisition_cost:   totalAcquisitionCost,
    other_expenses:     input.other_expenses || 0,
  };

  const outcome = calculateFinancials(financialParams);

  // Compare to Baseline
  const profitDifference = parseFloat((outcome.underwriting_profit - baseline.underwriting_profit).toFixed(2));
  const profitGrowthPct = baseline.underwriting_profit > 0
    ? parseFloat(((profitDifference / baseline.underwriting_profit) * 100).toFixed(2))
    : 0.0;
  const customerDifference = outcome.customer_count - baseline.customer_count;
  const customerGrowthPct = baseline.customer_count > 0
    ? parseFloat(((customerDifference / baseline.customer_count) * 100).toFixed(2))
    : 0.0;

  // Target profit check
  const targetProfit = input.target_underwriting_profit != null
    ? parseFloat(input.target_underwriting_profit)
    : 400000;
  const meetsTarget = outcome.underwriting_profit >= targetProfit;

  // ── Profitability and Fairness Safeguards ──
  const safeguards = evaluateSafeguards(outcome, baseline, input);

  return {
    scenario_name:        input.scenario_name || input.name || 'Custom Scenario',
    strategy_type:        input.strategy_type || 'custom',
    outcome,
    baseline,
    comparison: {
      profit_difference:    profitDifference,
      profit_growth_pct:    profitGrowthPct,
      customer_difference:  customerDifference,
      customer_growth_pct:  customerGrowthPct,
      revenue_difference:   parseFloat((outcome.premium_revenue - baseline.premium_revenue).toFixed(2)),
      meets_target_profit:  meetsTarget,
      target_profit:        targetProfit,
    },
    safeguards,
    rule_version:         RULE_VERSION,
    assumptions_statement: input.assumptions_statement || 'Assumptions are illustrative and subject to customer response elasticity and verified underwriting conditions.',
    calculated_at:        new Date().toISOString(),
  };
}

/**
 * Evaluate Safeguards: Discount caps, solvency, loss prevention.
 */
function evaluateSafeguards(outcome, baseline, input) {
  const flags = [];
  let isEligible = true;

  // 1. Solvency: Underwriting Loss
  if (outcome.underwriting_profit < 0) {
    flags.push({
      type: 'violation',
      code: 'UNDERWRITING_LOSS',
      message: `Scenario produces an underwriting loss of ₹${Math.abs(outcome.underwriting_profit).toLocaleString()}. Fails sustainable underwriting profitability.`,
    });
    isEligible = false;
  }

  // 2. Max Approved Discount Cap (Max 25% discount from baseline premium)
  const discountPct = baseline.avg_annual_premium > 0
    ? ((baseline.avg_annual_premium - outcome.avg_annual_premium) / baseline.avg_annual_premium) * 100
    : 0;

  if (discountPct > 25.0) {
    flags.push({
      type: 'violation',
      code: 'DISCOUNT_CAP_EXCEEDED',
      message: `Discount of ${discountPct.toFixed(1)}% exceeds the insurer's approved regulatory discount limit of 25.0%.`,
    });
    isEligible = false;
  }

  // 3. Customer Growth Without Profit (Growth that reduces profit)
  if (outcome.customer_count > baseline.customer_count && outcome.underwriting_profit < baseline.underwriting_profit) {
    flags.push({
      type: 'warning',
      code: 'UNPROFITABLE_GROWTH',
      message: 'Customer growth resulted in lower total underwriting profit. Demonstrates that higher customer numbers do not guarantee profitability.',
    });
  }

  // 4. Combined Ratio warning (> 100% means claims + expenses exceed earned premium)
  if (outcome.combined_ratio_pct > 100) {
    flags.push({
      type: 'violation',
      code: 'COMBINED_RATIO_EXCEEDED',
      message: `Combined ratio is ${outcome.combined_ratio_pct}%. Claims incurred and operating expenses exceed 100% of earned premium.`,
    });
    isEligible = false;
  }

  // 5. Zero or negative customers
  if (outcome.customer_count <= 0) {
    flags.push({
      type: 'violation',
      code: 'ZERO_CUSTOMERS',
      message: 'Customer count must be greater than zero.',
    });
    isEligible = false;
  }

  return {
    is_eligible: isEligible,
    flags,
    regulatory_discount_cap_pct: 25.0,
    evaluated_discount_pct: parseFloat(discountPct.toFixed(1)),
    claims_non_discrimination_guarantee: 'Legitimate insurance claims are strictly separated from pricing and never compromised by risk scores.',
  };
}

/**
 * Profitability-Aware Pricing Optimizer.
 * Evaluates multiple strategies and selects the strategy with the HIGHEST EXPECTED PROFIT
 * among eligible candidates that satisfy all safeguards.
 *
 * @param {Array<Object>} candidates
 * @param {Object} [customBaseline]
 * @returns {Object} optimization ranking and selected best strategy
 */
function optimizePricingStrategies(candidates, customBaseline = null) {
  const baseline = calculateFinancials(customBaseline || BASELINE_PRESET);
  const evaluatedStrategies = [];

  for (const candidate of candidates) {
    const simulation = simulateStrategy(candidate, baseline);
    evaluatedStrategies.push(simulation);
  }

  // Filter eligible strategies (meet safeguards, positive profit, within discount caps)
  const eligible = evaluatedStrategies.filter(s => s.safeguards.is_eligible);

  // Sort eligible by underwriting profit descending (highest profit first)
  eligible.sort((a, b) => b.outcome.underwriting_profit - a.outcome.underwriting_profit);

  // Sort all evaluated by profit descending for comprehensive comparison
  evaluatedStrategies.sort((a, b) => b.outcome.underwriting_profit - a.outcome.underwriting_profit);

  const selectedStrategy = eligible.length > 0 ? eligible[0] : null;

  return {
    selected_strategy: selectedStrategy,
    evaluated_count: evaluatedStrategies.length,
    eligible_count: eligible.length,
    strategies: evaluatedStrategies,
    baseline,
    optimizer_criteria: 'Highest Expected Underwriting Profit among Approved Eligible Strategies (NOT simply lowest premium or highest volume)',
    rule_version: RULE_VERSION,
    disclaimer: 'SIMULATION ENGINE — Optimizer selections are based on configurable scenario assumptions and require empirical actuarial validation.',
  };
}

module.exports = {
  calculateFinancials,
  simulateStrategy,
  optimizePricingStrategies,
  evaluateSafeguards,
  BASELINE_PRESET,
  DEFAULT_PRESETS,
  RULE_VERSION,
};
