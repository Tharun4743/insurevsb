import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Car, ShieldCheck, Star, AlertTriangle,
  Play, TrendingUp, Clock, CheckCircle,
  ArrowRight, Activity, BarChart2, Zap, Scale,
  AlertCircle, ChevronDown, CheckSquare, GraduationCap,
  ClipboardCheck, Building, UserCheck, ShieldAlert
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import {
  getTrips, getReviewCases, getConsent,
  getAssessments, runSimulation,
  getQuotes, submitQuoteDispute
} from '../api/client';
import { Trip, ReviewCase, Assessment } from '../types';
import { LoadingSpinner, ErrorBanner } from '../components/ui';

export default function Dashboard() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [reviews, setReviews] = useState<ReviewCase[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [quotesList, setQuotesList] = useState<any[]>([]);
  const [consent, setConsent] = useState<{ has_active_consent: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulatingDriver, setSimulatingDriver] = useState<string | null>(null);

  // Dynamic Filters populated from Supabase
  const [filterScenario, setFilterScenario] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // Dispute Modal State
  const [disputeQuoteId, setDisputeQuoteId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('Excessive harsh braking deduction');
  const [disputeExplanation, setDisputeExplanation] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState<string | null>(null);
  const [disputeError, setDisputeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [td, rd, ad, cd, qd] = await Promise.all([
        getTrips(50),
        getReviewCases('pending'),
        getAssessments(),
        getConsent(),
        getQuotes().catch(() => ({ quotes: [] })),
      ]);
      setTrips(td.trips || []);
      setReviews(rd.review_cases || []);
      setAssessments(ad.assessments || []);
      setConsent(cd);
      setQuotesList(qd?.quotes || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleQuickRun = async (scenario: string, label: string) => {
    setSimulatingDriver(label);
    try {
      await runSimulation(scenario, 50);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSimulatingDriver(null);
    }
  };

  const handleOpenDispute = (quoteId: string) => {
    setDisputeQuoteId(quoteId);
    setDisputeReason('Excessive harsh braking deduction');
    setDisputeExplanation('');
    setDisputeError(null);
    setDisputeSuccess(null);
  };

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeQuoteId) return;
    setSubmittingDispute(true);
    setDisputeError(null);
    try {
      await submitQuoteDispute(disputeQuoteId, {
        reason: disputeReason,
        explanation: disputeExplanation,
      });
      setDisputeSuccess('Your pricing dispute has been submitted to the Compliance Officer for review.');
      setTimeout(() => {
        setDisputeQuoteId(null);
        setDisputeSuccess(null);
        load();
      }, 2000);
    } catch (err: any) {
      setDisputeError(err.message || 'Failed to submit pricing dispute.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  // ── STRICT SUPABASE DERIVED METRICS (Zero Hardcoded Constants) ──────────────
  const totalTripsCount = trips.length;
  const distinctScenarios = useMemo(() => Array.from(new Set(trips.map(t => t.scenario))), [trips]);
  const activeScenariosCount = distinctScenarios.length;
  const registeredUsersCount = useMemo(() => new Set(trips.map(t => t.user_id)).size, [trips]);

  // Aggregate actual readings count strictly from Supabase trips table
  const totalTelemetryCount = useMemo(() => {
    return trips.reduce((acc, t) => acc + (t.reading_count || 0), 0);
  }, [trips]);

  const pendingDisputesCount = reviews.filter(r => r.status === 'pending').length;
  const resolvedDisputesCount = reviews.filter(r => r.status === 'resolved').length;
  const activeQuotesCount = quotesList.length;

  const validTrips = useMemo(() => trips.filter(t => t.status === 'valid'), [trips]);
  const warningTrips = useMemo(() => trips.filter(t => t.status === 'warning' || t.status === 'review_required'), [trips]);
  const safeScenarios = useMemo(() => trips.filter(t => t.scenario.includes('safe') || t.scenario.includes('smooth')), [trips]);
  const riskyScenarios = useMemo(() => trips.filter(t => t.scenario.includes('risky') || t.scenario.includes('harsh')), [trips]);

  // Dynamic Chart Events computed strictly from actual Supabase assessment records
  const chartData = useMemo(() => {
    let harshBraking = 0;
    let speeding = 0;
    let nightDriving = 0;
    let rapidAccel = 0;

    assessments.forEach(a => {
      const fc = a.factor_contributions || {};
      if (Number(fc.braking_penalty || fc.harsh_braking_penalty || fc.harsh_braking || 0) > 0) harshBraking += 1;
      if (Number(fc.speeding_penalty || fc.speed_penalty || fc.speed_variance || 0) > 0) speeding += 1;
      if (Number(fc.night_driving || 0) > 0) nightDriving += 1;
      if (Number(fc.acceleration_penalty || fc.rapid_accel_penalty || fc.rapid_accel || 0) > 0) rapidAccel += 1;
    });

    return [
      { event: 'Harsh Braking', count: harshBraking, color: '#3b82f6' },
      { event: 'Speeding >80',  count: speeding,     color: '#10b981' },
      { event: 'Night Driving', count: nightDriving, color: '#6366f1' },
      { event: 'Rapid Accel',   count: rapidAccel,   color: '#f59e0b' },
      { event: 'Valid Drives',  count: validTrips.length, color: '#059669' },
    ];
  }, [assessments, validTrips]);

  // Filtered trips list
  const filteredTrips = useMemo(() => {
    return trips.filter(t => {
      if (filterScenario !== 'All' && t.scenario !== filterScenario) return false;
      if (filterStatus !== 'All' && t.status !== filterStatus) return false;
      return true;
    });
  }, [trips, filterScenario, filterStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── TOP 5 STAT / KPI CARDS (Calculated from Supabase Data) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: ACTIVE SCENARIOS */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              ACTIVE SCENARIOS
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {activeScenariosCount}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
            <Building className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: REGISTERED DRIVERS */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              FLEET COHORTS
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {registeredUsersCount}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: TOTAL TELEMETRY */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              TOTAL TELEMETRY
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {totalTelemetryCount}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: PENDING DISPUTES */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              DISPUTES QUEUE
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {pendingDisputesCount}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs flex-shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Card 5: ACTIVE QUOTES */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              ACTIVE QUOTES
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {activeQuotesCount}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-xs flex-shrink-0">
            <ClipboardCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* ── MAIN CLASS ANALYZER CARD ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-7">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">
              Pricing & Telematics Analyzer
            </h2>
            <p className="text-xs font-medium text-slate-400 mt-1">
              Real-time behavioural measurements directly loaded from Supabase PostgreSQL
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
            Live Database Persistence
          </span>
        </div>

        {/* Dynamic Filter Dropdowns Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-7">
          {/* Scenario Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              SCENARIO
            </label>
            <div className="relative">
              <select
                value={filterScenario}
                onChange={e => setFilterScenario(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl px-3.5 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
              >
                <option value="All">All Scenarios ({trips.length})</option>
                {distinctScenarios.map(sc => (
                  <option key={sc} value={sc}>{sc}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              STATUS
            </label>
            <div className="relative">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl px-3.5 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="valid">Valid / Compliant ({validTrips.length})</option>
                <option value="warning">Warning / Review ({warningTrips.length})</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Consent Status */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              CONSENT STATUS
            </label>
            <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-emerald-700 flex items-center justify-between">
              <span>{consent?.has_active_consent ? 'Active Consent Granted' : 'Consent Pending'}</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
          </div>

          {/* Trips Loaded */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              FILTERED RECORDS
            </label>
            <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Showing {filteredTrips.length} of {trips.length} trips</span>
              <Car className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>

        {/* ── 4 SUMMARY BREAKDOWN PILL BLOCKS (Derived dynamically from Supabase) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Block 1: TOTAL READINGS */}
          <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                TOTAL TELEMETRY
              </p>
              <p className="text-2xl font-black text-slate-800 mt-1">{totalTelemetryCount}</p>
            </div>
            <div className="space-y-1 text-right">
              <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                Valid: {validTrips.length}
              </span>
              <br />
              <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-semibold">
                Warnings: {warningTrips.length}
              </span>
            </div>
          </div>

          {/* Block 2: EVALUATED TRIPS */}
          <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex items-center justify-between border-l-4 border-l-blue-500">
            <div>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                EVALUATED RUNS
              </p>
              <p className="text-2xl font-black text-blue-600 mt-1">{totalTripsCount}</p>
              <p className="text-[9px] text-slate-400 font-medium">Recorded in DB</p>
            </div>
            <div className="space-y-1 text-right">
              <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold">
                Safe: {safeScenarios.length}
              </span>
              <br />
              <span className="inline-block px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-xs font-semibold">
                Risky: {riskyScenarios.length}
              </span>
            </div>
          </div>

          {/* Block 3: ACTIVE QUOTES */}
          <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                ACTIVE QUOTES
              </p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{activeQuotesCount}</p>
            </div>
            <div className="space-y-1 text-right">
              <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold">
                Base: ₹{quotesList[0]?.base_premium ?? 0}
              </span>
              <br />
              <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold">
                Rule: {quotesList[0]?.rule_version ?? 'Live'}
              </span>
            </div>
          </div>

          {/* Block 4: DISPUTES QUEUE */}
          <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">
                DISPUTES QUEUE
              </p>
              <p className="text-2xl font-black text-orange-600 mt-1">{pendingDisputesCount}</p>
            </div>
            <div className="space-y-1 text-right">
              <span className="inline-block px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-xs font-semibold">
                Pending: {pendingDisputesCount}
              </span>
              <br />
              <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold">
                Resolved: {resolvedDisputesCount}
              </span>
            </div>
          </div>
        </div>

        {/* ── Event-Wise Performance Bar Chart ── */}
        <div className="border-t border-slate-100 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              EVENT-WISE PERFORMANCE (DERIVED FROM SUPABASE DATA)
            </h4>
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              Real-time DB Ingestion
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="event" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── DRIVER BENCHMARK SIMULATION ACTIONS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Driver A (Safe) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                Driver A · Safe Driver
              </span>
              <span className="text-xs font-semibold text-slate-400">Zero Violations</span>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              Gentle deceleration, consistent speed compliance, verified telematics readings.
            </p>
            <div className="space-y-1.5 text-xs border-t border-slate-100 pt-2 font-mono">
              <div className="flex justify-between"><span className="text-slate-400">Score:</span><span className="text-emerald-600 font-bold">100 / 100</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Adjustment:</span><span className="text-emerald-600 font-bold">−10% (−₹200)</span></div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-100 pt-1 text-slate-800">
                <span>Illustrative Premium:</span>
                <span className="text-emerald-600">₹1,800</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleQuickRun('scenario_a_safe', 'Driver A')}
            disabled={simulatingDriver !== null}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            {simulatingDriver === 'Driver A' ? 'Simulating…' : 'Simulate Driver A (Safe)'}
          </button>
        </div>

        {/* Driver B (Risky) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                Driver B · Risky Driver
              </span>
              <span className="text-xs font-semibold text-slate-400">High Risk Exposure</span>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              Rapid acceleration bursts, frequent hard braking events (&gt;0.4g), speeding exposure.
            </p>
            <div className="space-y-1.5 text-xs border-t border-slate-100 pt-2 font-mono">
              <div className="flex justify-between"><span className="text-slate-400">Score:</span><span className="text-rose-600 font-bold">&lt; 50 / 100</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Adjustment:</span><span className="text-rose-600 font-bold">+20% (+₹400)</span></div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-100 pt-1 text-slate-800">
                <span>Illustrative Premium:</span>
                <span className="text-amber-600">₹2,400</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleQuickRun('scenario_b_risky_no_accidents', 'Driver B')}
            disabled={simulatingDriver !== null}
            className="mt-4 w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            {simulatingDriver === 'Driver B' ? 'Simulating…' : 'Simulate Driver B (Risky)'}
          </button>
        </div>
      </div>

      {/* ── CUSTOMER QUOTES & DISPUTES LIST (Loaded directly from Supabase) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">My Insurance Quotes & Pricing Explanations</h3>
            <p className="text-xs text-slate-400">
              Computed from persisted Supabase records. You can raise a pricing dispute for compliance review.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {quotesList.length} Quotes in Database
          </span>
        </div>

        {quotesList.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            No quotes generated yet. Run a simulation to produce your first behavioural quote.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {quotesList.slice(0, 5).map((q: any) => (
              <div key={q.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">
                      ₹{q.illustrative_estimate ?? q.premium_estimate ?? 0}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      {q.status || 'Active'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Base: ₹{q.base_premium ?? 0} | Adj: {q.risk_adjustment >= 0 ? `+₹${q.risk_adjustment}` : `−₹${Math.abs(q.risk_adjustment)}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Quote ID: <span className="font-mono text-slate-600">{q.id.slice(0, 8)}...</span> · Rule Version: {q.rule_version || 'Live'}
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => handleOpenDispute(q.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Dispute Quote</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PRICING DISPUTE MODAL ── */}
      {disputeQuoteId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Raise a Pricing Dispute</h3>
            <p className="text-xs text-slate-500 mb-4">
              Submit your dispute for independent review by the Pricing & Compliance Officer.
            </p>

            {disputeSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{disputeSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmitDispute} className="space-y-4">
                {disputeError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {disputeError}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Dispute Reason
                  </label>
                  <select
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option>Excessive harsh braking deduction</option>
                    <option>Speed sensor anomaly / false positive</option>
                    <option>Emergency obstacle avoidance maneuver</option>
                    <option>Unexplained premium surcharge</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Detailed Explanation (Min 5 chars)
                  </label>
                  <textarea
                    rows={4}
                    value={disputeExplanation}
                    onChange={e => setDisputeExplanation(e.target.value)}
                    placeholder="Describe what occurred (e.g. avoided pedestrian, GPS inaccuracy in tunnel)..."
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDisputeQuoteId(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDispute || disputeExplanation.trim().length < 5}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold shadow-xs"
                  >
                    {submittingDispute ? 'Submitting…' : 'Submit Dispute'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
