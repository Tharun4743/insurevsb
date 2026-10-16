import React, { useEffect, useState, useCallback } from 'react';
import {
  Play, Pause, Square, RotateCcw, CheckCircle, AlertTriangle, XCircle, Zap,
  Shield, Scale, Activity, FileText, AlertCircle, Info, Clock, Cpu
} from 'lucide-react';
import {
  getScenarios,
  runSimulation,
  getConsent,
  startSimulationSession,
  pauseSimulationSession,
  resumeSimulationSession,
  stopSimulationSession,
  resetSimulationSession,
} from '../api/client';
import { SimulationResult } from '../types';
import {
  LoadingSpinner, StatusBadge, ErrorBanner, DisclaimerBanner, ScoreGauge
} from '../components/ui';
import { useNavigate } from 'react-router-dom';
import IotTelematicsMonitor from '../components/IotTelematicsMonitor';

interface Scenario {
  id: string;
  label: string;
  description: string;
  driver_name?: string;
  category?: string;
  expected_score?: string;
  expected_premium?: string;
}

const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  safe:                           <CheckCircle className="w-5 h-5 text-emerald-500" />,
  normal:                         <Activity className="w-5 h-5 text-blue-500" />,
  risky:                          <AlertTriangle className="w-5 h-5 text-amber-500" />,
  night:                          <Clock className="w-5 h-5 text-purple-500" />,
  scenario_a_safe:                <CheckCircle className="w-5 h-5 text-emerald-500" />,
  scenario_b_risky_no_accidents:  <AlertTriangle className="w-5 h-5 text-amber-500" />,
  scenario_c_first_accident_safe: <Shield className="w-5 h-5 text-blue-500" />,
  scenario_d_repeated_accidents_risky: <XCircle className="w-5 h-5 text-red-500" />,
  scenario_e_insufficient_data:   <AlertCircle className="w-5 h-5 text-slate-400" />,
  smooth:                         <CheckCircle className="w-5 h-5 text-emerald-500" />,
  harsh_events:                   <AlertTriangle className="w-5 h-5 text-amber-500" />,
  invalid_data:                   <XCircle className="w-5 h-5 text-red-500" />,
};

export default function SimulatorPage() {
  const navigate = useNavigate();
  const [scenarios, setScenarios]     = useState<Scenario[]>([]);
  const [selected, setSelected]       = useState('safe');
  const [count, setCount]             = useState(60);
  const [running, setRunning]         = useState(false);
  const [result, setResult]           = useState<SimulationResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [consented, setConsented]     = useState(true);
  const [loadingPage, setLoadingPage] = useState(true);

  // Interactive Session State (Phase 3.B Lifecycle)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<'idle' | 'running' | 'paused' | 'stopped' | 'completed'>('idle');
  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [mode, setMode] = useState<'iot_live' | 'software_sim'>('iot_live');

  const init = useCallback(async () => {
    setLoadingPage(true);
    try {
      const [sd, cd] = await Promise.all([getScenarios(), getConsent()]);
      setScenarios(sd.scenarios || []);
      setConsented(cd.has_active_consent);
      if (sd.scenarios?.length > 0) {
        setSelected(sd.scenarios[0].id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingPage(false);
    }
  }, []);

  useEffect(() => { init(); }, [init]);

  const handleRun = async () => {
    if (!consented) {
      setError('Grant consent first (Privacy & Consent page).');
      return;
    }
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await runSimulation(selected, count);
      setResult(res);
      setSessionState('completed');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleStartSession = async () => {
    if (!consented) {
      setError('Grant consent first (Privacy & Consent page).');
      return;
    }
    setSessionActionLoading(true);
    setError(null);
    try {
      const res = await startSimulationSession(selected, count);
      setSessionId(res.session_id);
      setSessionState('running');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handlePauseSession = async () => {
    if (!sessionId) return;
    setSessionActionLoading(true);
    try {
      await pauseSimulationSession(sessionId);
      setSessionState('paused');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleResumeSession = async () => {
    if (!sessionId) return;
    setSessionActionLoading(true);
    try {
      await resumeSimulationSession(sessionId);
      setSessionState('running');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (!sessionId) return;
    setSessionActionLoading(true);
    try {
      const res = await stopSimulationSession(sessionId);
      setSessionState('completed');
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleResetSession = async () => {
    if (sessionId) {
      await resetSimulationSession(sessionId).catch(() => {});
    }
    setSessionId(null);
    setSessionState('idle');
    setResult(null);
    setError(null);
  };

  const handleReset = () => {
    handleResetSession();
  };

  if (loadingPage) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const selectedScenarioMeta = scenarios.find(s => s.id === selected);

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fadeIn pb-12">
      {/* Clean Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Telematics Simulator & Live Monitor</h2>
          <p className="text-xs text-slate-500">Live hardware telemetry streaming & fair actuarial pricing evaluations</p>
        </div>
      </div>

      {!consented && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
          <p className="text-xs text-amber-800 font-semibold">Active consent required before running trips.</p>
          <button onClick={() => navigate('/consent')} className="btn-primary text-xs py-1 px-3">
            Grant Consent
          </button>
        </div>
      )}

      {/* Mode Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          id="btn-tab-iot-live"
          onClick={() => setMode('iot_live')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            mode === 'iot_live'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Virtual IoT Telematics (Wokwi ESP32 Live Stream)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </button>

        <button
          id="btn-tab-software-sim"
          onClick={() => setMode('software_sim')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            mode === 'software_sim'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Batch Software Scenarios & Sessions</span>
        </button>
      </div>

      {mode === 'iot_live' ? (
        <IotTelematicsMonitor />
      ) : (
        /* Config panel */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Scenario Selector */}
        <div className="lg:col-span-5 card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">1. Select Test Scenario</h3>
            <span className="text-xs text-slate-500 font-mono">5 Presets</span>
          </div>
          <div className="card-body space-y-4">
            <div className="space-y-2">
              {scenarios.map(s => {
                const isCurrent = selected === s.id;
                return (
                  <button
                    key={s.id}
                    id={`btn-scenario-${s.id}`}
                    onClick={() => setSelected(s.id)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      isCurrent
                        ? 'border-brand-500 bg-brand-50/80 ring-2 ring-brand-400 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="mt-0.5 flex-shrink-0">
                      {SCENARIO_ICONS[s.id] || <Activity className="w-5 h-5 text-slate-400" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{s.label}</p>
                        {s.expected_premium && (
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {s.expected_premium}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{s.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Run Actuarial Evaluation Button */}
            <div className="border-t border-slate-100 pt-3 flex gap-2">
              <button
                id="btn-run-simulation"
                onClick={handleRun}
                disabled={running || !consented}
                className="btn-primary flex-1 py-2.5 justify-center shadow-xs text-xs font-bold gap-2 cursor-pointer"
              >
                {running ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Evaluating Scenario…</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 text-white fill-white" />
                    <span>Run Actuarial Pricing Evaluation</span>
                  </>
                )}
              </button>
              <button
                onClick={handleReset}
                className="btn-secondary px-3"
                id="btn-reset-simulation"
                title="Reset result"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Results panel */}
        <div className="lg:col-span-7 space-y-4">
          {error && <ErrorBanner message={error} />}

          {running && (
            <div className="card flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="p-4 bg-brand-50 rounded-full animate-pulse">
                <LoadingSpinner size="lg" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-base">Running Actuarial Pipeline…</p>
                <p className="text-xs text-slate-500 mt-1">
                  1. Telematics Generation → 2. Exposure & Quality Validation → 3. 5-Factor Score → 4. Accident Separation → 5. Dynamic Quote
                </p>
              </div>
            </div>
          )}

          {result && !running && (
            <div className="space-y-4">
              {/* Top Banner: Risk Category & Safety Score */}
              <div className="card bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-xl border border-indigo-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center justify-center w-20 h-20 rounded-full bg-slate-800 border-2 border-indigo-400">
                      <span className="text-2xl font-black text-white">
                        {result.assessment.safety_score != null ? result.assessment.safety_score : '—'}
                      </span>
                      <span className="text-[10px] text-slate-300 font-mono">/ 100</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          Safety Score: {result.assessment.safety_score != null ? `${result.assessment.safety_score}/100` : 'Provisional'}
                        </span>
                        <StatusBadge status={result.assessment.risk_category || 'moderate_risk'} />
                      </div>
                      <p className="text-xs text-indigo-200 mt-1">
                        Driving Risk Score: <strong className="text-amber-300">{result.assessment.driving_risk_score ?? '—'}/100</strong> · Data Confidence: <strong className="text-indigo-300">{result.assessment.data_confidence || 'High'}</strong>
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                        {result.assessment.explanation}
                      </p>
                    </div>
                  </div>
                  <div className="text-right sm:border-l sm:border-indigo-800 sm:pl-4">
                    <p className="text-[11px] uppercase tracking-wider text-indigo-300">Illustrative Premium</p>
                    <p className="text-3xl font-black text-emerald-400">
                      ₹{result.quote.illustrative_estimate}
                    </p>
                    <p className="text-[10px] text-indigo-200">Base: ₹{result.quote.base_premium}</p>
                  </div>
                </div>
              </div>

              {/* 5 Independent Driving Behaviour Factors */}
              {result.assessment.factor_contributions && (
                <div className="card p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                    <Scale className="w-4 h-4 text-brand-600" />
                    Factor A: Driving Behaviour Risk Score (5 Weighted Indicators)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                      <p className="text-slate-500 text-[10px] uppercase font-semibold">Speeding (30%)</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">{result.assessment.factor_contributions.speeding_risk ?? 0}/100</p>
                      <p className="text-[10px] text-red-500 font-mono mt-0.5">+{result.assessment.factor_contributions.speeding_penalty ?? 0} pts</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                      <p className="text-slate-500 text-[10px] uppercase font-semibold">Braking (25%)</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">{result.assessment.factor_contributions.braking_risk ?? 0}/100</p>
                      <p className="text-[10px] text-red-500 font-mono mt-0.5">+{result.assessment.factor_contributions.braking_penalty ?? 0} pts</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                      <p className="text-slate-500 text-[10px] uppercase font-semibold">Accel (15%)</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">{result.assessment.factor_contributions.acceleration_risk ?? 0}/100</p>
                      <p className="text-[10px] text-red-500 font-mono mt-0.5">+{result.assessment.factor_contributions.acceleration_penalty ?? 0} pts</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                      <p className="text-slate-500 text-[10px] uppercase font-semibold">Cornering (15%)</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">{result.assessment.factor_contributions.cornering_risk ?? 0}/100</p>
                      <p className="text-[10px] text-red-500 font-mono mt-0.5">+{result.assessment.factor_contributions.cornering_penalty ?? 0} pts</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                      <p className="text-slate-500 text-[10px] uppercase font-semibold">Usage (15%)</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">{result.assessment.factor_contributions.unsafe_usage_risk ?? 0}/100</p>
                      <p className="text-[10px] text-red-500 font-mono mt-0.5">+{result.assessment.factor_contributions.unsafe_usage_penalty ?? 0} pts</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Factor B: Accident & Claims History (Separated Section) */}
              <div className="card p-4 border-l-4 border-l-indigo-500">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    Factor B: Accident & Claims History (Strictly Separated)
                  </h4>
                  <span className="text-xs font-mono text-slate-500">
                    {result.accident_history?.previous_accidents_count ?? 0} recorded incidents
                  </span>
                </div>

                {result.accident_history && result.accident_history.records.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {result.accident_history.records.map((acc, i) => (
                      <div key={acc.id || i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{acc.driver_name || 'Driver Incident'}</span>
                            <StatusBadge status={acc.fault_status} />
                            <span className="text-[11px] text-slate-400 font-mono">
                              {new Date(acc.accident_date).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-0.5">{acc.description}</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Severity: <strong className="text-slate-600">{acc.claim_severity}</strong> · Claim Amount: <strong className="text-slate-600">₹{parseFloat(acc.claim_amount as string || '0').toLocaleString()}</strong>
                          </p>
                        </div>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 whitespace-nowrap">
                          {acc.is_verified ? 'Verified Police/Claim' : 'Pending Verification'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>0 Accidents Recorded on File. Clean claims record.</span>
                  </div>
                )}

                <div className="mt-3 p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  <span>
                    <strong>Non-Discrimination Rule:</strong> Legitimate claims are never reduced or rejected due to risk scores. Accidents without proven fault do NOT trigger high-risk surcharges.
                  </span>
                </div>
              </div>

              {/* Factor C: Driving Exposure & Dynamic Premium Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Exposure & Rates */}
                <div className="card p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-brand-600" />
                    Factor C: Exposure & Normalized Rates
                  </h4>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-slate-50"><td className="py-1 text-slate-500">Trip Distance</td><td className="py-1 font-semibold text-right">{result.metrics.total_distance_km ? `${result.metrics.total_distance_km} km` : '—'}</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-1 text-slate-500">Speeding Events</td><td className="py-1 font-semibold text-right">{result.metrics.speeding_pct ? `${result.metrics.speeding_pct.toFixed(1)}% of trip` : '0%'}</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-1 text-slate-500">Harsh Braking Rate</td><td className="py-1 font-semibold text-right">{result.metrics.harsh_braking_rate_per_100km ?? 0} / 100km</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-1 text-slate-500">Rapid Accel Rate</td><td className="py-1 font-semibold text-right">{result.metrics.rapid_accel_rate_per_100km ?? 0} / 100km</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-1 text-slate-500">Harsh Cornering Rate</td><td className="py-1 font-semibold text-right">{result.metrics.cornering_rate_per_100km ?? 0} / 100km</td></tr>
                      <tr><td className="py-1 text-slate-500">Data Completeness</td><td className="py-1 font-semibold text-emerald-600 text-right">{result.metrics.completeness_pct}%</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* Premium Formula Breakdown */}
                <div className="card p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    Actuarial Premium Breakdown
                  </h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Base Premium:</span>
                      <span className="font-semibold text-slate-800">₹{result.quote.base_premium}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Behaviour Adjustment:</span>
                      <span className={`font-semibold ${result.quote.behaviour_adjustment && result.quote.behaviour_adjustment < 0 ? 'text-emerald-600' : result.quote.behaviour_adjustment && result.quote.behaviour_adjustment > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        {result.quote.behaviour_adjustment ? (result.quote.behaviour_adjustment > 0 ? `+₹${result.quote.behaviour_adjustment}` : `-₹${Math.abs(result.quote.behaviour_adjustment)}`) : '₹0'}
                        {result.quote.behaviour_adjustment_pct ? ` (${result.quote.behaviour_adjustment_pct > 0 ? '+' : ''}${result.quote.behaviour_adjustment_pct}%)` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Accident History Adj:</span>
                      <span className={`font-semibold ${result.quote.accident_adjustment && result.quote.accident_adjustment > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        {result.quote.accident_adjustment ? `+₹${result.quote.accident_adjustment}` : '₹0 (0%)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 font-bold text-sm text-slate-900 border-t border-slate-200">
                      <span>Total Illustrative Premium:</span>
                      <span className="text-emerald-700 font-extrabold text-base">₹{result.quote.illustrative_estimate}</span>
                    </div>
                  </div>
                  {result.quote.accident_notes && (
                    <p className="text-[11px] text-slate-500 italic mt-2 border-t border-slate-100 pt-1">
                      {result.quote.accident_notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Review case alert if generated */}
              {result.review_case && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-amber-800">⚠ Review case created</p>
                    <p className="text-xs text-amber-700 mt-0.5">{result.review_case.reason}</p>
                  </div>
                  <button onClick={() => navigate('/review')} className="btn-primary text-xs py-1.5 px-3">
                    Open Review Center
                  </button>
                </div>
              )}

              <button
                onClick={() => navigate(`/trips/${result.trip_id}`)}
                className="btn-secondary w-full justify-center py-2 text-xs font-semibold"
                id="btn-view-full-trip"
              >
                Inspect Telemetry Stream & Audited Trip Record →
              </button>
            </div>
          )}

          {!result && !running && !error && (
            <div className="card flex flex-col items-center justify-center py-20 text-slate-400 text-center">
              <Zap className="w-12 h-12 mb-3 opacity-30 text-brand-600" />
              <p className="text-sm font-bold text-slate-600">Select any scenario on the left and click "Run Simulation"</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Each simulation executes all 3 independent risk factors, validates telemetry quality, calculates fair scores, and persists to Supabase PostgreSQL.
              </p>
            </div>
          )}
        </div>
      </div>
      )}

      <DisclaimerBanner />
    </div>
  );
}
