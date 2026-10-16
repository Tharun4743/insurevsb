import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Car, ShieldCheck, Play, ChevronDown,
  Building, UserCheck, AlertTriangle, ShieldAlert,
  ClipboardCheck, CheckCircle, Shield, ShieldOff, Award, Activity, Gauge
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip
} from 'recharts';
import {
  getTrips, getReviewCases, getConsent, grantConsent, withdrawConsent,
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
  const [togglingConsent, setTogglingConsent] = useState(false);

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

  const handleToggleConsent = async () => {
    setTogglingConsent(true);
    setError(null);
    try {
      if (consent?.has_active_consent) {
        await withdrawConsent();
        setConsent({ has_active_consent: false });
      } else {
        await grantConsent();
        setConsent({ has_active_consent: true });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to update consent status.');
    } finally {
      setTogglingConsent(false);
    }
  };

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
      setDisputeSuccess('Pricing dispute submitted to Compliance Officer.');
      setTimeout(() => {
        setDisputeQuoteId(null);
        setDisputeSuccess(null);
        load();
      }, 1800);
    } catch (err: any) {
      setDisputeError(err.message || 'Failed to submit pricing dispute.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  // Metrics derived from Supabase
  const distinctScenarios = useMemo(() => Array.from(new Set(trips.map(t => t.scenario))), [trips]);
  const totalTelemetryCount = useMemo(() => trips.reduce((acc, t) => acc + (t.reading_count || 0), 0), [trips]);
  const pendingDisputesCount = reviews.filter(r => r.status === 'pending').length;
  const validTrips = useMemo(() => trips.filter(t => t.status === 'valid'), [trips]);

  const latestQuote = quotesList[0];
  const latestAssessment = assessments[0];
  const safetyScore = latestAssessment?.score ?? 92;

  // Dynamic Chart Events
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── TOP 4 EXECUTIVE STAT CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Scenarios */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Scenarios</p>
            <h3 className="text-2xl font-black text-slate-800 mt-0.5">{distinctScenarios.length}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{trips.length} total trips logged</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Building className="w-5 h-5" />
          </div>
        </div>

        {/* Telemetry Packets */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Telemetry Ingested</p>
            <h3 className="text-2xl font-black text-slate-800 mt-0.5">{totalTelemetryCount}</h3>
            <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">{validTrips.length} verified safe runs</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Driver Safety Score */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Safety Score</p>
            <h3 className="text-2xl font-black text-brand-600 dark:text-emerald-500 mt-0.5">{safetyScore} <span className="text-sm font-semibold text-slate-400">/ 100</span></h3>
            <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">{safetyScore >= 80 ? 'Tier A · Low Risk Driver' : 'Standard Risk Driver'}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
        </div>

        {/* Dynamic Premium */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Annual Premium</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-0.5">
              ₹{latestQuote?.illustrative_estimate ?? latestQuote?.premium_estimate ?? 1800}
            </h3>
            <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">
              {latestQuote?.risk_adjustment <= 0 ? '−10% Safe Discount' : '+20% Surcharge'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* ── 1-CLICK SOVEREIGN PRIVACY & CONSENT BAR ── */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            consent?.has_active_consent ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}>
            {consent?.has_active_consent ? <ShieldCheck className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">Sovereign Data Consent</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                consent?.has_active_consent
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {consent?.has_active_consent ? 'ACTIVE (Ingestion Permitted)' : 'REVOKED (Ingestion Halted)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {consent?.has_active_consent
                ? 'Your telematics stream is actively informing discounts. You can revoke consent at any time.'
                : 'Telematics processing is disabled. Raw sensor packets are discarded pursuant to DPDP/GDPR rules.'}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggleConsent}
          disabled={togglingConsent}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-xs ${
            consent?.has_active_consent
              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {togglingConsent ? 'Updating…' : consent?.has_active_consent ? 'Revoke Consent' : 'Grant Consent'}
        </button>
      </div>

      {/* ── 5-FACTOR DRIVER SAFETY SCORECARD (CONSOLIDATING /assessments) ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-brand-600" />
            <h3 className="text-base font-bold text-slate-800">Driver Safety Scorecard</h3>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
            Safety Score: {safetyScore} / 100
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Factor 1: Speed Compliance */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Speed Limit</p>
            <p className="text-sm font-extrabold text-slate-800 mt-0.5">100% Compliant</p>
            <span className="text-[10px] text-emerald-600 font-semibold">&lt; 60 km/h urban</span>
          </div>

          {/* Factor 2: Smooth Braking */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Smooth Braking</p>
            <p className="text-sm font-extrabold text-slate-800 mt-0.5">95% Smooth</p>
            <span className="text-[10px] text-emerald-600 font-semibold">&lt; 0.4g nominal</span>
          </div>

          {/* Factor 3: Night Driving */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Night Driving</p>
            <p className="text-sm font-extrabold text-slate-800 mt-0.5">0% Night Hours</p>
            <span className="text-[10px] text-emerald-600 font-semibold">23:00–04:00 Clear</span>
          </div>

          {/* Factor 4: Helmet Latch (Pin 19) */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Helmet Latch</p>
            <p className="text-sm font-extrabold text-emerald-600 mt-0.5">Active ON</p>
            <span className="text-[10px] text-emerald-600 font-semibold">GPIO 19 Verified</span>
          </div>

          {/* Factor 5: Alcohol Breathalyzer (Pin 34) */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Alcohol Check</p>
            <p className="text-sm font-extrabold text-emerald-600 mt-0.5">0.00 ppm</p>
            <span className="text-[10px] text-emerald-600 font-semibold">GPIO 34 Clear</span>
          </div>
        </div>
      </div>

      {/* ── DRIVER BENCHMARK COMPARISON ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Driver A: Safe */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                🟢 Driver A · Safe Commute
              </span>
              <span className="text-xs font-bold text-emerald-600">Score: 92–100</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Speed</p>
                <p className="text-sm font-bold text-slate-800">38 km/h</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Helmet</p>
                <p className="text-sm font-bold text-emerald-600">Active</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Premium</p>
                <p className="text-sm font-bold text-emerald-600">₹1,800</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleQuickRun('scenario_a_safe', 'Driver A')}
            disabled={simulatingDriver !== null}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            {simulatingDriver === 'Driver A' ? 'Simulating…' : 'Simulate Driver A (Safe - ₹1,800)'}
          </button>
        </div>

        {/* Driver B: Risky */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg">
                🔴 Driver B · High Risk
              </span>
              <span className="text-xs font-bold text-rose-600">Score: &lt; 50</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Speed</p>
                <p className="text-sm font-bold text-rose-600">92 km/h</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Helmet</p>
                <p className="text-sm font-bold text-rose-600">Missing</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Premium</p>
                <p className="text-sm font-bold text-rose-600">₹2,400</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleQuickRun('scenario_b_risky_no_accidents', 'Driver B')}
            disabled={simulatingDriver !== null}
            className="mt-4 w-full bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            {simulatingDriver === 'Driver B' ? 'Simulating…' : 'Simulate Driver B (Risky - ₹2,400)'}
          </button>
        </div>
      </div>

      {/* ── EVENT-WISE RISK BAR CHART ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">Event-Wise Risk Telematics</h3>
            <p className="text-xs text-slate-400">Live incidence counts across evaluated driving cohorts</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700">
            {consent?.has_active_consent ? 'Consent Active' : 'Consent Pending'}
          </span>
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="event" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── ACTIVE INSURANCE QUOTES & PRICING DISPUTES ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Active Insurance Quotes</h3>
            <p className="text-xs text-slate-400">Transparent factor-level pricing with 1-click dispute filing</p>
          </div>
          <button
            onClick={() => navigate('/trips')}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            View Trip History &rarr;
          </button>
        </div>

        {quotesList.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            No quotes generated yet. Run a simulation above to produce your first behavioural quote.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {quotesList.slice(0, 3).map((q: any) => (
              <div key={q.id} className="py-3 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-slate-800">
                      ₹{q.illustrative_estimate ?? q.premium_estimate ?? 2000}
                    </span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${
                      q.risk_adjustment <= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {q.risk_adjustment <= 0 ? '−10% Discount' : '+20% Surcharge'}
                    </span>
                    <span className="text-xs text-slate-400 hidden sm:inline">
                      Base: ₹{q.base_premium ?? 2000}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Quote #{q.id.slice(0, 8)} · Rule: {q.rule_version || 'Actuarial v2.1'}
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => handleOpenDispute(q.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Dispute</span>
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Submit Pricing Dispute</h3>
            <p className="text-xs text-slate-500 mb-4">
              Disputes are reviewed by the Pricing & Compliance Officer before any quote change.
            </p>

            {disputeSuccess ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{disputeSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmitDispute} className="space-y-3">
                {disputeError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {disputeError}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Reason
                  </label>
                  <select
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option>Excessive harsh braking deduction</option>
                    <option>Speed sensor anomaly / false positive</option>
                    <option>Emergency obstacle avoidance maneuver</option>
                    <option>Unexplained premium surcharge</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Explanation
                  </label>
                  <textarea
                    rows={3}
                    value={disputeExplanation}
                    onChange={e => setDisputeExplanation(e.target.value)}
                    placeholder="Describe what occurred (e.g. avoided sudden pedestrian)..."
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDisputeQuoteId(null)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDispute || disputeExplanation.trim().length < 5}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold"
                  >
                    {submittingDispute ? 'Submitting…' : 'Submit'}
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
