import React, { useEffect, useState } from 'react';
import {
  getComplianceOverview, getComplianceDisputes,
  getComplianceFairness, submitComplianceDecision
} from '../api/client';
import {
  ShieldAlert, Scale, CheckCircle2, XCircle,
  Clock, AlertTriangle, FileText, CheckCircle,
  Building, UserCheck, GraduationCap, ClipboardCheck
} from 'lucide-react';
import { LoadingSpinner, ErrorBanner } from '../components/ui';

export default function ComplianceDashboard() {
  const [overview, setOverview] = useState<any>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [fairnessData, setFairnessData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision Modal
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [decision, setDecision] = useState<'resolved' | 'rejected' | 'under_investigation'>('resolved');
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, dispRes, fairRes] = await Promise.all([
        getComplianceOverview(),
        getComplianceDisputes(),
        getComplianceFairness().catch(() => null),
      ]);
      setOverview(ovRes || {});
      setDisputes(dispRes?.disputes || []);
      setFairnessData(fairRes || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load compliance officer dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenDecision = (disp: any) => {
    setSelectedDispute(disp);
    setDecision('resolved');
    setExplanation('');
    setActionSuccess(null);
  };

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;

    if (!explanation.trim() || explanation.trim().length < 10) {
      alert('A detailed explanation (min 10 characters) is required for compliance audit trails.');
      return;
    }

    setSubmitting(true);
    try {
      await submitComplianceDecision(selectedDispute.id, {
        decision,
        explanation: explanation.trim(),
      });
      setActionSuccess(`Dispute decision (${decision.toUpperCase()}) recorded and audited.`);
      setTimeout(() => {
        setSelectedDispute(null);
        setActionSuccess(null);
        loadData();
      }, 1500);
    } catch (err: any) {
      alert(`Decision recording failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const pendingDisputesCount = disputes.filter(d => d.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* ── TOP 5 KPI CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              DISPUTES QUEUE
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {pendingDisputesCount}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              FAIRNESS STATUS
            </p>
            <h3 className="text-xl font-extrabold text-emerald-600 tracking-tight uppercase">
              {overview?.fairnessStatus ?? 'COMPLIANT'}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Scale className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              DATA ANOMALIES
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {overview?.anomaliesCount ?? 0}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              EXCLUDED EVENTS
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {overview?.excludedEventsCount ?? 0}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              RESOLVED CASES
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {disputes.filter(d => d.status === 'resolved').length}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
            <ClipboardCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {/* ── CUSTOMER DISPUTES QUEUE ── */}
      <div id="disputes" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-7">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              Customer Pricing Disputes & Review Queue
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review contested telematics deductions, verify obstacle avoidance claims, and record binding decisions.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            {disputes.length} Total Disputes
          </span>
        </div>

        {disputes.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            No pricing disputes currently submitted.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Dispute ID / Date</th>
                  <th className="pb-3">Reason</th>
                  <th className="pb-3">Explanation</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Review Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {disputes.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/50">
                    <td className="py-3">
                      <p className="font-mono font-bold text-slate-800">{d.id.slice(0, 8)}...</p>
                      <p className="text-slate-400 text-[10px]">
                        {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="py-3 font-semibold text-slate-800">{d.reason}</td>
                    <td className="py-3 text-slate-600 max-w-xs truncate" title={d.explanation}>
                      {d.explanation}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          d.status === 'resolved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : d.status === 'rejected'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {d.status === 'pending' ? (
                        <button
                          onClick={() => handleOpenDecision(d)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
                        >
                          Decide Case
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium italic">
                          Decided
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── FAIRNESS & COHORT BENCHMARK AUDIT (Live from Supabase) ── */}
      <div id="fairness" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              Descriptive Cohort & Model Transparency Audit
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Empirical comparison of driving behaviour cohorts based strictly on persisted database records.
            </p>
          </div>
          <div>
            {fairnessData?.status === 'calculated' ? (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Empirical Cohorts Calculated ({fairnessData.sampleSize} trips)
              </span>
            ) : (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Insufficient Data ({fairnessData?.sampleSize ?? 0} trips)
              </span>
            )}
          </div>
        </div>

        {fairnessData?.status === 'insufficient_data' ? (
          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 text-amber-900 text-xs">
            <p className="font-bold text-amber-800 mb-1">Insufficient Data for Statistical Parity</p>
            <p className="text-amber-700 mb-2">
              {fairnessData.explanation || 'Live trip records do not yet have sufficient sample sizes across safe and elevated-risk cohorts to support defensible statistical parity tests.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-amber-200/60 text-slate-700">
              <div className="bg-white/80 p-3 rounded-lg border border-amber-100">
                <span className="font-semibold block text-slate-800">Cohort A (Safe Driver Patterns):</span>
                <span className="text-slate-600">{fairnessData.cohortA?.sampleSize ?? 0} trips recorded (minimum 3 required)</span>
              </div>
              <div className="bg-white/80 p-3 rounded-lg border border-amber-100">
                <span className="font-semibold block text-slate-800">Cohort B (Elevated Risk Patterns):</span>
                <span className="text-slate-600">{fairnessData.cohortB?.sampleSize ?? 0} trips recorded (minimum 3 required)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="font-bold text-slate-800 mb-1">{fairnessData?.cohortA?.title ?? 'Cohort A (Safe Driving Patterns)'}</p>
              <p className="text-slate-500 mb-2">
                {fairnessData?.cohortA?.description ?? `Evaluated against ${fairnessData?.cohortA?.sampleSize ?? 0} live safe trips.`}
              </p>
              <div className="space-y-1 font-mono text-slate-600">
                <div className="flex justify-between">
                  <span>Mean Safety Score:</span>
                  <span className="font-bold text-emerald-600">
                    {fairnessData?.cohortA?.meanSafetyScore != null ? `${fairnessData.cohortA.meanSafetyScore} / 100` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Mean Behaviour Adjustment:</span>
                  <span className="font-bold text-emerald-600">
                    {fairnessData?.cohortA?.averageAdjustmentPct != null ? `${fairnessData.cohortA.averageAdjustmentPct}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Sample Size:</span>
                  <span className="font-bold text-slate-800">
                    {fairnessData?.cohortA?.sampleSize ?? 0} verified trips
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="font-bold text-slate-800 mb-1">{fairnessData?.cohortB?.title ?? 'Cohort B (Elevated Risk Driving Patterns)'}</p>
              <p className="text-slate-500 mb-2">
                {fairnessData?.cohortB?.description ?? `Evaluated against ${fairnessData?.cohortB?.sampleSize ?? 0} live elevated-risk trips.`}
              </p>
              <div className="space-y-1 font-mono text-slate-600">
                <div className="flex justify-between">
                  <span>Mean Safety Score:</span>
                  <span className="font-bold text-rose-600">
                    {fairnessData?.cohortB?.meanSafetyScore != null ? `${fairnessData.cohortB.meanSafetyScore} / 100` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Mean Behaviour Adjustment:</span>
                  <span className="font-bold text-rose-600">
                    {fairnessData?.cohortB?.averageAdjustmentPct != null ? `+${fairnessData.cohortB.averageAdjustmentPct}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Sample Size:</span>
                  <span className="font-bold text-slate-800">
                    {fairnessData?.cohortB?.sampleSize ?? 0} verified trips
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── DECISION MODAL ── */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Compliance Dispute Review</h3>
            <p className="text-xs text-slate-500 mb-4">
              Dispute ID: <span className="font-mono text-slate-700">{selectedDispute.id}</span>
            </p>

            {actionSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{actionSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmitDecision} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                  <p className="font-bold text-slate-800">Reason: {selectedDispute.reason}</p>
                  <p className="mt-1 text-slate-600 italic">"{selectedDispute.explanation}"</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Compliance Decision
                  </label>
                  <select
                    value={decision}
                    onChange={e => setDecision(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="resolved">Resolved (Accept Dispute & Excuse Event)</option>
                    <option value="rejected">Rejected (Uphold Algorithmic Pricing Deduction)</option>
                    <option value="under_investigation">Under Investigation (Request Device Diagnostics)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Official Decision Explanation (Mandatory Audit Trail)
                  </label>
                  <textarea
                    rows={4}
                    value={explanation}
                    onChange={e => setExplanation(e.target.value)}
                    placeholder="Provide justification based on telematics sensor data or external evidence..."
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDispute(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || explanation.trim().length < 10}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold shadow-xs"
                  >
                    {submitting ? 'Recording…' : 'Record Official Decision'}
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
