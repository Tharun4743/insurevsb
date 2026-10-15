import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, DollarSign, Users, ShieldAlert, Award,
  ArrowRight, RefreshCw, CheckCircle, AlertTriangle,
  Sliders, BarChart3, Save, Sparkles, Scale, Info, ChevronRight, Check
} from 'lucide-react';
import {
  getProfitabilityPresets,
  simulateProfitability,
  optimizeProfitability,
  saveFinancialScenario,
  getFinancialScenarios
} from '../api/client';
import {
  ProfitabilitySimulationResult,
  ProfitabilityOptimizationResult,
  FinancialOutcome
} from '../types';
import { StatCard, LoadingSpinner, ErrorBanner } from '../components/ui';

function formatINR(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '₹0';
  return '₹' + Math.round(val).toLocaleString('en-IN');
}

export default function ProfitabilityPage() {
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simulation outcome & baseline from backend
  const [simulation, setSimulation] = useState<ProfitabilitySimulationResult | null>(null);
  const [optimization, setOptimization] = useState<ProfitabilityOptimizationResult | null>(null);
  const [showOptimizerResults, setShowOptimizerResults] = useState(false);
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);

  // Configurable Scenario Form Inputs
  const [scenarioName, setScenarioName] = useState('Expected Growth Scenario (With INSURE)');
  const [activePreset, setActivePreset] = useState<'conservative' | 'expected' | 'optimistic' | 'custom'>('expected');

  const [existingCustomers, setExistingCustomers] = useState(1000);
  const [renewalRatePct, setRenewalRatePct] = useState(88);
  const [newCustomersAcquired, setNewCustomersAcquired] = useState(420);
  const [customerCount, setCustomerCount] = useState(1300);

  const [currentPremium, setCurrentPremium] = useState(2000);
  const [proposedPremium, setProposedPremium] = useState(1800);

  const [claimsIncurred, setClaimsIncurred] = useState(1300000);
  const [cacPerCustomer, setCacPerCustomer] = useState(250);
  const [operatingExpenses, setOperatingExpenses] = useState(500000);
  const [platformCosts, setPlatformCosts] = useState(50000);
  const [targetProfit, setTargetProfit] = useState(400000);

  // Load presets on mount
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [presetsData, scenariosData] = await Promise.all([
        getProfitabilityPresets(),
        getFinancialScenarios().catch(() => ({ scenarios: [] })),
      ]);

      setPresets(presetsData.presets || {});
      setSavedScenarios(scenariosData.scenarios || []);

      // Default run simulation on the expected scenario
      const initialSim = await simulateProfitability({
        scenario_name: 'Expected Growth Scenario (With INSURE)',
        strategy_type: 'expected',
        customer_count: 1300,
        avg_annual_premium: 1800,
        claims_incurred: 1300000,
        operating_expenses: 500000,
        platform_costs: 50000,
        acquisition_cost: 0,
        target_underwriting_profit: 400000,
      });

      setSimulation(initialSim);
    } catch (err: any) {
      setError(err.message || 'Failed to load profitability presets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Recalculate simulation with current inputs
  const runRecalculation = async (overrides: Record<string, any> = {}) => {
    setCalculating(true);
    setError(null);
    try {
      const payload = {
        scenario_name: overrides.scenarioName ?? scenarioName,
        strategy_type: overrides.activePreset ?? activePreset,
        customer_count: overrides.customerCount ?? customerCount,
        existing_customers: overrides.existingCustomers ?? existingCustomers,
        renewal_rate_pct: overrides.renewalRatePct ?? renewalRatePct,
        new_customers_acquired: overrides.newCustomersAcquired ?? newCustomersAcquired,
        avg_annual_premium: overrides.proposedPremium ?? proposedPremium,
        claims_incurred: overrides.claimsIncurred ?? claimsIncurred,
        cac_per_customer: overrides.cacPerCustomer ?? cacPerCustomer,
        operating_expenses: overrides.operatingExpenses ?? operatingExpenses,
        platform_costs: overrides.platformCosts ?? platformCosts,
        target_underwriting_profit: overrides.targetProfit ?? targetProfit,
      };

      const result = await simulateProfitability(payload);
      setSimulation(result);
    } catch (err: any) {
      setError(err.message || 'Recalculation failed');
    } finally {
      setCalculating(false);
    }
  };

  // Switch preset
  const handleSelectPreset = (key: 'conservative' | 'expected' | 'optimistic') => {
    setActivePreset(key);
    const p = presets[key];
    if (!p) return;

    setScenarioName(p.name);
    setExistingCustomers(p.existing_customers ?? 1000);
    setRenewalRatePct(p.renewal_rate_pct ?? 85);
    setNewCustomersAcquired(p.new_customers_acquired ?? 300);
    setCustomerCount(p.customer_count ?? 1300);
    setProposedPremium(p.avg_annual_premium ?? 1800);
    setClaimsIncurred(p.claims_incurred ?? 1300000);
    setOperatingExpenses(p.operating_expenses ?? 500000);
    setPlatformCosts(p.platform_costs ?? 50000);
    setCacPerCustomer(p.cac_per_customer ?? 250);

    runRecalculation({
      scenarioName: p.name,
      activePreset: key,
      customerCount: p.customer_count,
      existingCustomers: p.existing_customers,
      renewalRatePct: p.renewal_rate_pct,
      newCustomersAcquired: p.new_customers_acquired,
      proposedPremium: p.avg_annual_premium,
      claimsIncurred: p.claims_incurred,
      operatingExpenses: p.operating_expenses,
      platformCosts: p.platform_costs,
      cacPerCustomer: p.cac_per_customer,
    });
  };

  // Run Optimizer across candidate strategies
  const handleRunOptimizer = async () => {
    setOptimizing(true);
    setError(null);
    try {
      const candidates = [
        {
          name: 'Conservative Growth (Modest Discount)',
          customer_count: 1100,
          avg_annual_premium: 1800,
          claims_incurred: 1250000,
          operating_expenses: 510000,
          platform_costs: 40000,
          acquisition_cost: 0,
        },
        {
          name: 'Expected Growth (With INSURE Recommended)',
          customer_count: 1300,
          avg_annual_premium: 1800,
          claims_incurred: 1300000,
          operating_expenses: 500000,
          platform_costs: 50000,
          acquisition_cost: 0,
        },
        {
          name: 'Optimistic Growth (Expanded Safe Drivers)',
          customer_count: 1500,
          avg_annual_premium: 1800,
          claims_incurred: 1400000,
          operating_expenses: 520000,
          platform_costs: 60000,
          acquisition_cost: 0,
        },
        {
          name: 'Unregulated Deep Discount (35% Off Base)',
          customer_count: 1600,
          avg_annual_premium: 1300,
          claims_incurred: 1500000,
          operating_expenses: 550000,
          platform_costs: 60000,
        },
        {
          name: 'Aggressive High CAC Acquisition',
          customer_count: 1400,
          avg_annual_premium: 1750,
          claims_incurred: 1450000,
          operating_expenses: 500000,
          platform_costs: 50000,
          acquisition_cost: 450000,
        },
      ];

      const res = await optimizeProfitability({ candidates });
      setOptimization(res);
      setShowOptimizerResults(true);
    } catch (err: any) {
      setError(err.message || 'Optimization failed');
    } finally {
      setOptimizing(false);
    }
  };

  // Save current scenario to Supabase DB
  const handleSaveScenario = async () => {
    if (!simulation) return;
    setSaving(true);
    try {
      await saveFinancialScenario({
        scenario_name: simulation.scenario_name,
        strategy_type: simulation.strategy_type,
        customer_count: simulation.outcome.customer_count,
        avg_annual_premium: simulation.outcome.avg_annual_premium,
        premium_revenue: simulation.outcome.premium_revenue,
        claims_incurred: simulation.outcome.claims_incurred,
        operating_expenses: simulation.outcome.operating_expenses,
        platform_costs: simulation.outcome.platform_costs,
        acquisition_cost: simulation.outcome.acquisition_cost,
        other_expenses: simulation.outcome.other_expenses,
        total_expenses: simulation.outcome.total_expenses,
        underwriting_profit: simulation.outcome.underwriting_profit,
        profit_margin_pct: simulation.outcome.profit_margin_pct,
        model_assumptions: {
          existing_customers: existingCustomers,
          renewal_rate_pct: renewalRatePct,
          new_customers_acquired: newCustomersAcquired,
          target_profit: targetProfit,
        },
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      const updated = await getFinancialScenarios();
      setSavedScenarios(updated.scenarios || []);
    } catch (err: any) {
      setError(err.message || 'Failed to save scenario');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <LoadingSpinner />
        <p className="text-slate-400 text-sm">Loading Underwriting Profitability Engine...</p>
      </div>
    );
  }

  const baseline = simulation?.baseline;
  const outcome = simulation?.outcome;
  const comparison = simulation?.comparison;
  const safeguards = simulation?.safeguards;

  const isProfitable = (outcome?.underwriting_profit ?? 0) >= 0;
  const discountPct = baseline && outcome && baseline.avg_annual_premium > 0
    ? Math.round(((baseline.avg_annual_premium - outcome.avg_annual_premium) / baseline.avg_annual_premium) * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Actuarial Engine v2.1
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Currency: INR (₹)
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
              Trip Distance Decoupled
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1.5 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-brand-400" />
            Customer Growth & Profitability Simulator
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Evaluate competitive premium pricing, customer retention elasticity, and sustainable underwriting profit.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRunOptimizer}
            disabled={optimizing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-brand-600 hover:from-purple-500 hover:to-brand-500 text-white font-medium text-xs shadow-md transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {optimizing ? 'Evaluating Strategies...' : 'Run Pricing Optimizer'}
          </button>

          <button
            onClick={handleSaveScenario}
            disabled={saving}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-medium text-xs transition-all disabled:opacity-50"
          >
            {savedSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
            {savedSuccess ? 'Saved to DB!' : saving ? 'Saving...' : 'Save Scenario'}
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => loadInitialData()} />}

      {/* ── Preset Scenario Selector ───────────────────────────────────────── */}
      <div className="bg-slate-900/60 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block mb-1">
            Actuarial Scenario Presets
          </span>
          <p className="text-slate-300 text-xs">
            Quickly compare pre-configured market projections against the pre-INSURE baseline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSelectPreset('conservative')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activePreset === 'conservative'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30 ring-1 ring-amber-400'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/5'
            }`}
          >
            Conservative (1,100 Cust)
          </button>

          <button
            onClick={() => handleSelectPreset('expected')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activePreset === 'expected'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-900/30 ring-1 ring-brand-400'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/5'
            }`}
          >
            Expected (1,300 Cust — Section 8)
          </button>

          <button
            onClick={() => handleSelectPreset('optimistic')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activePreset === 'optimistic'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30 ring-1 ring-emerald-400'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/5'
            }`}
          >
            Optimistic (1,500 Cust)
          </button>
        </div>
      </div>

      {/* ── Before & After Financial Comparison (Section 8) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Baseline: BEFORE INSURE */}
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-slate-700/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                Section 8 Benchmark
              </span>
              <h2 className="text-lg font-bold text-slate-200 mt-1">BEFORE INSURE (Baseline)</h2>
            </div>
            <span className="text-xs text-slate-400">Starting Portfolio</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Customers</span>
              <p className="text-xl font-bold text-white mt-0.5">
                {baseline?.customer_count.toLocaleString() ?? '1,000'}
              </p>
              <span className="text-[10px] text-slate-500">Commercial baseline</span>
            </div>

            <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Avg Annual Premium</span>
              <p className="text-xl font-bold text-white mt-0.5">
                {formatINR(baseline?.avg_annual_premium ?? 2000)}
              </p>
              <span className="text-[10px] text-slate-500">No safe discount</span>
            </div>

            <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Premium Revenue</span>
              <p className="text-xl font-bold text-blue-400 mt-0.5">
                {formatINR(baseline?.premium_revenue ?? 2000000)}
              </p>
              <span className="text-[10px] text-slate-500">1,000 × ₹2,000</span>
            </div>

            <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Claims Incurred</span>
              <p className="text-xl font-bold text-amber-400 mt-0.5">
                {formatINR(baseline?.claims_incurred ?? 1200000)}
              </p>
              <span className="text-[10px] text-slate-500">60.0% claims ratio</span>
            </div>

            <div className="bg-slate-800/60 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Operating Expenses</span>
              <p className="text-xl font-bold text-slate-300 mt-0.5">
                {formatINR(baseline?.operating_expenses ?? 500000)}
              </p>
              <span className="text-[10px] text-slate-500">25.0% expense ratio</span>
            </div>

            <div className="bg-slate-800/80 rounded-xl p-3 border border-white/10 ring-1 ring-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Underwriting Profit</span>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">
                {formatINR(baseline?.underwriting_profit ?? 300000)}
              </p>
              <span className="text-[10px] text-emerald-400/80">15.0% margin</span>
            </div>
          </div>
        </div>

        {/* Current / Simulated: WITH INSURE */}
        <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-brand-950/40 border border-brand-500/30 rounded-2xl p-5 relative overflow-hidden shadow-xl shadow-brand-950/20">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4 border-b border-brand-500/20 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-300 bg-brand-900/60 px-2 py-0.5 rounded border border-brand-500/30">
                Simulated Strategy
              </span>
              <h2 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
                WITH INSURE — {simulation?.scenario_name ?? 'Expected Scenario'}
              </h2>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                Profit: {formatINR(outcome?.underwriting_profit)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-slate-800/70 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Customers</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl font-bold text-white">
                  {outcome?.customer_count.toLocaleString() ?? '1,300'}
                </p>
                {comparison && (
                  <span className={`text-[10px] font-semibold ${comparison.customer_difference >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {comparison.customer_difference >= 0 ? '+' : ''}{comparison.customer_difference}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                {comparison ? `${comparison.customer_growth_pct >= 0 ? '+' : ''}${comparison.customer_growth_pct}% growth` : 'Growth'}
              </span>
            </div>

            <div className="bg-slate-800/70 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Proposed Avg Premium</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl font-bold text-white">
                  {formatINR(outcome?.avg_annual_premium ?? 1800)}
                </p>
                <span className="text-[10px] font-semibold text-emerald-400">
                  -{discountPct}%
                </span>
              </div>
              <span className="text-[10px] text-slate-500">Competitive rate</span>
            </div>

            <div className="bg-slate-800/70 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Premium Revenue</span>
              <p className="text-xl font-bold text-brand-300 mt-0.5">
                {formatINR(outcome?.premium_revenue ?? 2340000)}
              </p>
              <span className="text-[10px] text-slate-500">
                {outcome?.customer_count} × {formatINR(outcome?.avg_annual_premium)}
              </span>
            </div>

            <div className="bg-slate-800/70 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Claims Incurred</span>
              <p className="text-xl font-bold text-amber-300 mt-0.5">
                {formatINR(outcome?.claims_incurred ?? 1300000)}
              </p>
              <span className="text-[10px] text-slate-500">
                {outcome?.claims_ratio_pct}% claims ratio
              </span>
            </div>

            <div className="bg-slate-800/70 rounded-xl p-3 border border-white/5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">Total Expenses</span>
              <p className="text-xl font-bold text-slate-300 mt-0.5">
                {formatINR(outcome?.total_expenses ?? 550000)}
              </p>
              <span className="text-[10px] text-slate-500">
                Op + Plat + CAC
              </span>
            </div>

            <div className="bg-emerald-950/40 rounded-xl p-3 border border-emerald-500/30 ring-1 ring-emerald-500/20">
              <span className="text-[11px] text-emerald-300 uppercase tracking-wide font-semibold">Underwriting Profit</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl font-bold text-emerald-400">
                  {formatINR(outcome?.underwriting_profit ?? 490000)}
                </p>
              </div>
              <span className="text-[10px] text-emerald-300/80 font-medium">
                {comparison && (
                  <span className="text-emerald-300">
                    +{formatINR(comparison.profit_difference)} (+{comparison.profit_growth_pct}%)
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Profitability Safeguards & Audit Status ─────────────────────────── */}
      {safeguards && (
        <div className="bg-slate-900/60 rounded-xl p-4 border border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${safeguards.is_eligible ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {safeguards.is_eligible ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Underwriting Safeguards Status: {safeguards.is_eligible ? 'APPROVED & COMPLIANT' : 'CONSTRAINTS VIOLATED'}
              </p>
              <p className="text-xs text-slate-400">
                Regulatory Discount Cap: {safeguards.regulatory_discount_cap_pct}% (Current applied: {safeguards.evaluated_discount_pct}%) • {safeguards.claims_non_discrimination_guarantee}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {safeguards.flags.map((flag, idx) => (
              <span
                key={idx}
                className={`text-xs px-2.5 py-1 rounded-md font-medium border ${
                  flag.type === 'violation'
                    ? 'bg-red-950/60 text-red-300 border-red-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}
              >
                {flag.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Interactive Scenario Controls & Live Actuarial Model ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Controls Form */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-white/10 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-brand-400" />
              <h3 className="text-base font-bold text-white">Scenario Assumptions & Model Controls</h3>
            </div>
            <button
              onClick={() => runRecalculation()}
              disabled={calculating}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${calculating ? 'animate-spin' : ''}`} />
              Recalculate
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer Retention & Renewal */}
            <div className="space-y-3 bg-slate-800/40 p-4 rounded-xl border border-white/5">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-brand-400" />
                Customer Base & Retention
              </span>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Existing Customers:</span>
                  <span className="text-white font-semibold">{existingCustomers.toLocaleString()}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={existingCustomers}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    setExistingCustomers(val);
                    const retained = Math.round(val * (renewalRatePct / 100));
                    setCustomerCount(retained + newCustomersAcquired);
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Expected Renewal Rate:</span>
                  <span className="text-brand-300 font-semibold">{renewalRatePct}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={renewalRatePct}
                  onChange={e => {
                    const pct = parseInt(e.target.value);
                    setRenewalRatePct(pct);
                    const retained = Math.round(existingCustomers * (pct / 100));
                    setCustomerCount(retained + newCustomersAcquired);
                  }}
                  className="w-full accent-brand-500"
                />
                <span className="text-[10px] text-slate-500">
                  Retained policyholders: {Math.round(existingCustomers * (renewalRatePct / 100)).toLocaleString()}
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">New Customers Acquired:</span>
                  <span className="text-emerald-400 font-semibold">+{newCustomersAcquired.toLocaleString()}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="20"
                  value={newCustomersAcquired}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    setNewCustomersAcquired(val);
                    const retained = Math.round(existingCustomers * (renewalRatePct / 100));
                    setCustomerCount(retained + val);
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Resulting Customer Count:</span>
                <span className="text-base font-bold text-white">{customerCount.toLocaleString()}</span>
              </div>
            </div>

            {/* Pricing & Premium */}
            <div className="space-y-3 bg-slate-800/40 p-4 rounded-xl border border-white/5">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Premium Pricing Architecture
              </span>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Approved Base Annual Premium:</span>
                  <span className="text-white font-semibold">{formatINR(currentPremium)}</span>
                </div>
                <input
                  type="number"
                  min="500"
                  step="100"
                  value={currentPremium}
                  onChange={e => setCurrentPremium(parseInt(e.target.value) || 2000)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Proposed Average Annual Premium:</span>
                  <span className="text-brand-300 font-semibold">{formatINR(proposedPremium)}</span>
                </div>
                <input
                  type="number"
                  min="500"
                  step="50"
                  value={proposedPremium}
                  onChange={e => setProposedPremium(parseInt(e.target.value) || 1800)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-slate-500">
                  Adjustment: {proposedPremium < currentPremium ? `-${Math.round(((currentPremium - proposedPremium) / currentPremium) * 100)}% discount` : proposedPremium === currentPremium ? '0% standard' : `+${Math.round(((proposedPremium - currentPremium) / currentPremium) * 100)}% surcharge`}
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Target Underwriting Profit:</span>
                  <span className="text-emerald-400 font-semibold">{formatINR(targetProfit)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={targetProfit}
                  onChange={e => setTargetProfit(parseInt(e.target.value) || 400000)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Earned Revenue Formula:</span>
                <span className="text-xs font-mono text-slate-400">Count × Avg Premium</span>
              </div>
            </div>

            {/* Claims Incurred */}
            <div className="space-y-3 bg-slate-800/40 p-4 rounded-xl border border-white/5">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                Claims Costs & Incurred Losses
              </span>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Total Claims Incurred (Portfolio):</span>
                  <span className="text-amber-300 font-semibold">{formatINR(claimsIncurred)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={claimsIncurred}
                  onChange={e => setClaimsIncurred(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-[10px] text-slate-500">
                  Includes both paid claims and outstanding claim reserves.
                </span>
              </div>

              <div className="pt-2 border-t border-white/5 text-xs text-slate-400">
                <p className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Legitimate claims protection guaranteed.
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Claims are never delayed or reduced based on telematics scores.
                </p>
              </div>
            </div>

            {/* Expenses Breakdown */}
            <div className="space-y-3 bg-slate-800/40 p-4 rounded-xl border border-white/5">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                Expenses & Platform Costs
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Operating Exp:</span>
                  <input
                    type="number"
                    min="0"
                    step="25000"
                    value={operatingExpenses}
                    onChange={e => setOperatingExpenses(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Platform Cost:</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={platformCosts}
                    onChange={e => setPlatformCosts(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">CAC per Customer:</span>
                  <span className="text-slate-300 font-semibold">{formatINR(cacPerCustomer)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={cacPerCustomer}
                  onChange={e => setCacPerCustomer(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Total Expenses:</span>
                <span className="text-sm font-bold text-slate-200">
                  {formatINR(operatingExpenses + platformCosts + (newCustomersAcquired * cacPerCustomer))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Key Metrics & Break-Even Ratios */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
              <Scale className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">Actuarial Financial Ratios</h3>
            </div>

            <div className="space-y-4">
              {/* Profit Margin */}
              <div className="bg-slate-800/50 p-3.5 rounded-xl border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Underwriting Profit Margin</span>
                  <span className={`text-base font-bold ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                    {outcome?.profit_margin_pct}%
                  </span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full ${isProfitable ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, (outcome?.profit_margin_pct ?? 0) * 3))}%` }}
                  />
                </div>
              </div>

              {/* Combined Ratio */}
              <div className="bg-slate-800/50 p-3.5 rounded-xl border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Combined Ratio (Claims + Exp)</span>
                  <span className={`text-base font-bold ${(outcome?.combined_ratio_pct ?? 0) <= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {outcome?.combined_ratio_pct}%
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>Claims Ratio: {outcome?.claims_ratio_pct}%</span>
                  <span>Expense Ratio: {outcome?.expense_ratio_pct}%</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {(outcome?.combined_ratio_pct ?? 0) < 100
                    ? '✓ Combined ratio below 100% generates positive underwriting margin.'
                    : '⚠ Combined ratio above 100% indicates underwriting loss.'}
                </p>
              </div>

              {/* Break-even Metrics */}
              <div className="bg-slate-800/50 p-3.5 rounded-xl border border-white/5 space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">Break-Even Analysis</span>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Break-even Policyholders:</span>
                  <span className="font-bold text-white">{outcome?.break_even_customers.toLocaleString()} customers</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Break-even Avg Premium:</span>
                  <span className="font-bold text-white">{formatINR(outcome?.break_even_premium)}</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Minimum customer volume and premium needed to cover total claims incurred and expenses.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-brand-950/40 border border-brand-500/20 rounded-xl">
            <span className="text-[11px] font-semibold text-brand-300 flex items-center gap-1 mb-1">
              <Info className="w-3.5 h-3.5" />
              Transparent Actuarial Disclosure
            </span>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Discounts and customer volume do not automatically create profit. Sustainable underwriting requires verified driver risk separation and strict loss ratio controls.
            </p>
          </div>
        </div>
      </div>

      {/* ── Pricing Optimizer Modal / Ranking View ──────────────────────────── */}
      {showOptimizerResults && optimization && (
        <div className="bg-slate-900 border border-purple-500/40 rounded-2xl p-6 shadow-2xl space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400 bg-purple-950/80 px-2.5 py-0.5 rounded border border-purple-500/30">
                Profitability-Aware Pricing Optimizer
              </span>
              <h3 className="text-lg font-bold text-white mt-1">
                Strategy Optimization Ranking ({optimization.evaluated_count} Scenarios Evaluated)
              </h3>
              <p className="text-xs text-slate-400">
                Criteria: {optimization.optimizer_criteria}
              </p>
            </div>
            <button
              onClick={() => setShowOptimizerResults(false)}
              className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded bg-slate-800"
            >
              Close Optimizer
            </button>
          </div>

          {/* Selected Strategy Banner */}
          {optimization.selected_strategy ? (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-500/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                    Highest Underwriting Profit Strategy Selected
                  </span>
                  <h4 className="text-base font-bold text-white">
                    {optimization.selected_strategy.scenario_name}
                  </h4>
                  <p className="text-xs text-slate-300">
                    Expected Underwriting Profit: <strong className="text-emerald-400">{formatINR(optimization.selected_strategy.outcome.underwriting_profit)}</strong> ({optimization.selected_strategy.outcome.profit_margin_pct}% margin) • {optimization.selected_strategy.outcome.customer_count.toLocaleString()} customers at {formatINR(optimization.selected_strategy.outcome.avg_annual_premium)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const s = optimization.selected_strategy!;
                  setScenarioName(s.scenario_name);
                  setCustomerCount(s.outcome.customer_count);
                  setProposedPremium(s.outcome.avg_annual_premium);
                  setClaimsIncurred(s.outcome.claims_incurred);
                  setOperatingExpenses(s.outcome.operating_expenses);
                  setPlatformCosts(s.outcome.platform_costs);
                  runRecalculation({
                    scenarioName: s.scenario_name,
                    customerCount: s.outcome.customer_count,
                    proposedPremium: s.outcome.avg_annual_premium,
                    claimsIncurred: s.outcome.claims_incurred,
                    operatingExpenses: s.outcome.operating_expenses,
                    platformCosts: s.outcome.platform_costs,
                  });
                  setShowOptimizerResults(false);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all whitespace-nowrap shadow-md shadow-emerald-900/30"
              >
                Apply This Strategy
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-sm">
              No evaluated candidate strategy satisfied all profitability and regulatory safeguards.
            </div>
          )}

          {/* Detailed Ranking Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3">Premium</th>
                  <th className="py-2.5 px-3">Customers</th>
                  <th className="py-2.5 px-3">Revenue</th>
                  <th className="py-2.5 px-3">Claims</th>
                  <th className="py-2.5 px-3">Expenses</th>
                  <th className="py-2.5 px-3">Profit</th>
                  <th className="py-2.5 px-3">Margin</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {optimization.strategies.map((strat, idx) => {
                  const isWinning = optimization.selected_strategy?.scenario_name === strat.scenario_name;
                  return (
                    <tr
                      key={idx}
                      className={isWinning ? 'bg-emerald-950/20 font-semibold' : 'hover:bg-slate-800/40'}
                    >
                      <td className="py-3 px-3 flex items-center gap-2">
                        {isWinning && <Award className="w-3.5 h-3.5 text-emerald-400" />}
                        <span className="text-white">{strat.scenario_name}</span>
                      </td>
                      <td className="py-3 px-3 text-white">{formatINR(strat.outcome.avg_annual_premium)}</td>
                      <td className="py-3 px-3">{strat.outcome.customer_count.toLocaleString()}</td>
                      <td className="py-3 px-3 text-brand-300">{formatINR(strat.outcome.premium_revenue)}</td>
                      <td className="py-3 px-3 text-amber-300">{formatINR(strat.outcome.claims_incurred)}</td>
                      <td className="py-3 px-3 text-slate-400">{formatINR(strat.outcome.total_expenses)}</td>
                      <td className="py-3 px-3 font-bold text-emerald-400">{formatINR(strat.outcome.underwriting_profit)}</td>
                      <td className="py-3 px-3">{strat.outcome.profit_margin_pct}%</td>
                      <td className="py-3 px-3">
                        {strat.safeguards.is_eligible ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Approved
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                            Disqualified
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
