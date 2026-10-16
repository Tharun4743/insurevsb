import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert, CheckCircle, XCircle, Clock,
  ArrowRight, UserCheck, AlertTriangle, FileText, ExternalLink
} from 'lucide-react';
import { getReviewCases, getReviewCase, submitDecision } from '../api/client';
import { ReviewCase, Trip, Assessment } from '../types';
import {
  StatCard, StatusBadge, LoadingSpinner, EmptyState,
  ErrorBanner, DisclaimerBanner
} from '../components/ui';

export default function ReviewPage() {
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active review case modal / panel
  const [activeCase, setActiveCase] = useState<ReviewCase | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [loadingCase, setLoadingCase] = useState(false);

  // Decision form
  const [decision, setDecision] = useState<'resolved' | 'rejected'>('resolved');
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReviewCases(statusFilter === 'all' ? undefined : statusFilter);
      setCases(data.review_cases || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load review cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [statusFilter]);

  const openReviewDetails = async (caseItem: ReviewCase) => {
    setActiveCase(caseItem);
    setExplanation('');
    setActionSuccess(null);
    setLoadingCase(true);
    try {
      const data = await getReviewCase(caseItem.id);
      setActiveCase(data.review_case);
      setActiveTrip(data.trip);
      setActiveAssessment(data.assessment);
    } catch (err: any) {
      setError(err.message || 'Failed to load case details');
    } finally {
      setLoadingCase(false);
    }
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase) return;
    if (explanation.trim().length < 10) {
      setError('Please provide at least 10 characters explaining your decision.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitDecision(activeCase.id, decision, explanation);
      setActionSuccess(res.message || `Case successfully marked as ${decision}.`);
      setActiveCase(prev => prev ? { ...prev, status: decision, reviewer_decision: decision, reviewer_explanation: explanation } : null);
      // Refresh list
      fetchCases();
    } catch (err: any) {
      setError(err.message || 'Failed to submit review decision');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Underwriting & Compliance Review</h2>
          <p className="text-xs text-slate-500">Human-in-the-loop dispute adjudication & provisional incident queue</p>
        </div>
        <button onClick={fetchCases} className="btn-secondary text-xs py-1.5 px-3">
          Refresh Queue
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(['pending', 'resolved', 'rejected', 'all'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setStatusFilter(tab);
              setActiveCase(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
              statusFilter === tab
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <LoadingSpinner size="lg" />
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          message={
            statusFilter === 'pending'
              ? 'No pending review cases. All trips are validated!'
              : 'No review cases found for this status.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List of cases */}
          <div className="lg:col-span-2 space-y-3">
            {cases.map(c => {
              const isSelected = activeCase?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => openReviewDetails(c)}
                  className={`card p-4 cursor-pointer transition border-2 ${
                    isSelected ? 'border-brand-500 bg-brand-50/20' : 'border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.status} />
                        <span className="text-xs font-mono text-slate-400">ID: {c.id.slice(0, 8)}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{c.reason}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(c.created_at).toLocaleString('en-GB')}
                        </span>
                        <Link
                          to={`/trips/${c.trip_id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-brand-600 hover:underline flex items-center gap-1 font-medium"
                        >
                          Trip Data <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-300 self-center" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Review Details & Decision Form */}
          <div className="card p-5 sticky top-6 h-fit">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
              <UserCheck className="w-4 h-4 text-brand-600" />
              Reviewer Actions
            </h3>

            {loadingCase ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="md" />
              </div>
            ) : !activeCase ? (
              <p className="text-xs text-slate-400 italic">Select a case from the list to review and log a decision.</p>
            ) : (
              <div className="space-y-4 text-xs">
                {actionSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-medium">
                    ✓ {actionSuccess}
                  </div>
                )}

                <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status:</span>
                    <StatusBadge status={activeCase.status} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Trip ID:</span>
                    <span className="font-mono text-slate-700">{activeCase.trip_id.slice(0, 8)}...</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Reason:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{activeCase.reason}</p>
                  </div>
                </div>

                {activeTrip && (
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1 text-slate-600">
                    <p className="font-bold text-slate-700">Trip Context:</p>
                    <div className="flex justify-between">
                      <span>Scenario:</span>
                      <StatusBadge status={activeTrip.scenario} />
                    </div>
                    <div className="flex justify-between">
                      <span>Readings:</span>
                      <span className="font-semibold">{activeTrip.reading_count} pts</span>
                    </div>
                  </div>
                )}

                {/* Already completed case */}
                {activeCase.status === 'resolved' || activeCase.status === 'rejected' ? (
                  <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 space-y-1.5">
                    <p className="font-bold text-slate-700">Final Decision Logged:</p>
                    <p className="text-slate-800">
                      Outcome: <strong className="capitalize">{activeCase.reviewer_decision || activeCase.status}</strong>
                    </p>
                    {activeCase.reviewer_explanation && (
                      <p className="text-slate-600 italic">"{activeCase.reviewer_explanation}"</p>
                    )}
                    {activeCase.reviewed_at && (
                      <p className="text-slate-400 text-[10px]">
                        Recorded at {new Date(activeCase.reviewed_at).toLocaleString('en-GB')}
                      </p>
                    )}
                  </div>
                ) : (
                  /* Decision Form */
                  <form onSubmit={handleDecisionSubmit} className="space-y-3 border-t border-slate-100 pt-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Select Action:</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setDecision('resolved')}
                          className={`p-2 rounded-lg border text-center font-semibold transition ${
                            decision === 'resolved'
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Resolve (Accept)
                        </button>
                        <button
                          type="button"
                          onClick={() => setDecision('rejected')}
                          className={`p-2 rounded-lg border text-center font-semibold transition ${
                            decision === 'rejected'
                              ? 'bg-red-50 border-red-500 text-red-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Reject (Exclude)
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        Reviewer Explanation <span className="text-slate-400 font-normal">(min 10 chars)</span>:
                      </label>
                      <textarea
                        rows={3}
                        value={explanation}
                        onChange={e => setExplanation(e.target.value)}
                        placeholder="State the rationale for resolving or rejecting this telemetry case..."
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || explanation.trim().length < 10}
                      className="btn-primary w-full text-xs py-2 justify-center flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {submitting ? <LoadingSpinner size="sm" /> : <UserCheck className="w-3.5 h-3.5" />}
                      Confirm Decision
                    </button>
                  </form>
                )}

                <div className="pt-1">
                  <Link
                    to={`/trips/${activeCase.trip_id}`}
                    className="btn-secondary w-full text-xs justify-center flex items-center gap-1.5"
                  >
                    View Underlying Trip Telemetry <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
