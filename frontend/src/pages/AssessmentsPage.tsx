import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, ShieldAlert, CheckCircle, ArrowRight,
  TrendingDown, Info, Sliders, ExternalLink
} from 'lucide-react';
import { getAssessments } from '../api/client';
import { Assessment } from '../types';
import {
  StatCard, StatusBadge, LoadingSpinner, EmptyState,
  ErrorBanner, DisclaimerBanner, ScoreGauge
} from '../components/ui';

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'scored' | 'review_required'>('all');
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);

  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAssessments();
      setAssessments(data.assessments || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return assessments;
    return assessments.filter(a => a.status === filter);
  }, [assessments, filter]);

  const scoredAssessments = assessments.filter(a => a.score !== null);
  const avgScore = scoredAssessments.length > 0
    ? Math.round(scoredAssessments.reduce((sum, a) => sum + (a.score || 0), 0) / scoredAssessments.length)
    : '—';
  const flaggedCount = assessments.filter(a => a.status === 'review_required').length;
  const highRiskCount = scoredAssessments.filter(a => (a.score ?? 100) < 60).length;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Driving Risk Assessments</h2>
          <p className="text-sm text-slate-500">Deterministic scoring engine based on verified telemetry factors</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAssessments}
            className="btn-secondary text-xs"
          >
            Refresh
          </button>
        </div>
      </div>

      <DisclaimerBanner />

      {error && <ErrorBanner message={error} onRetry={fetchAssessments} />}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Assessed"
          value={assessments.length}
          icon={<Award className="w-6 h-6 text-brand-600" />}
          iconBg="bg-brand-50"
        />
        <StatCard
          label="Average Score"
          value={avgScore}
          sub="/ 100 benchmark"
          icon={<Award className="w-6 h-6 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <StatCard
          label="High Risk Trips"
          value={highRiskCount}
          sub="Score < 60"
          icon={<TrendingDown className="w-6 h-6 text-amber-500" />}
          iconBg="bg-amber-50"
        />
        <StatCard
          label="Review Flagged"
          value={flaggedCount}
          sub="Requires human signoff"
          icon={<ShieldAlert className="w-6 h-6 text-red-500" />}
          iconBg="bg-red-50"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(['all', 'scored', 'review_required'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
              filter === tab
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab === 'all' ? 'All Assessments' : tab === 'scored' ? 'Scored' : 'Review Required'}
            <span className="ml-1.5 text-[11px] opacity-80">
              ({tab === 'all' ? assessments.length : assessments.filter(a => a.status === tab).length})
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <LoadingSpinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="No assessments found for this filter." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List of Assessments */}
          <div className="lg:col-span-2 space-y-3">
            {filtered.map(assmt => {
              const isSelected = selectedAssessment?.id === assmt.id;
              return (
                <div
                  key={assmt.id}
                  onClick={() => setSelectedAssessment(assmt)}
                  className={`card p-4 cursor-pointer transition border-2 ${
                    isSelected ? 'border-brand-500 bg-brand-50/20' : 'border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <ScoreGauge score={assmt.score} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={assmt.status} />
                          <span className="text-xs font-mono text-slate-400">Rule: {assmt.rule_version}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mt-1 line-clamp-1">
                          {assmt.explanation || 'Deterministic assessment calculated.'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Assessed: {new Date(assmt.created_at).toLocaleString('en-GB')}
                        </p>
                        <div className="mt-2 flex items-center gap-3">
                          <Link
                            to={`/trips/${assmt.trip_id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-brand-600 hover:underline flex items-center gap-1 font-medium"
                          >
                            View Trip <ExternalLink className="w-3 h-3" />
                          </Link>
                          {assmt.status === 'review_required' && (
                            <Link
                              to="/review"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-red-600 hover:underline flex items-center gap-1 font-medium"
                            >
                              Review Queue <ArrowRight className="w-3 h-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Factor Breakdown for Selected or Default */}
          <div className="card p-5 sticky top-6 h-fit">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Sliders className="w-4 h-4 text-brand-600" />
              Factor Weight Breakdown
            </h3>
            {(() => {
              const active = selectedAssessment || filtered[0];
              if (!active) return <EmptyState message="Select an assessment to view breakdown" />;

              const fc = active.factor_contributions;
              return (
                <div className="space-y-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Trip ID:</span>
                      <span className="font-mono text-slate-800">{active.trip_id.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Status:</span>
                      <StatusBadge status={active.status} />
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Score:</span>
                      <span className="font-bold text-slate-900 text-sm">{active.score !== null ? `${active.score}/100` : 'Unavailable'}</span>
                    </div>
                  </div>

                  {fc ? (
                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      <p className="font-bold text-slate-700 uppercase tracking-wide">Deduction Formulas</p>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Base Score</span>
                        <span className="font-semibold text-slate-800">{fc.base_score} pts</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Harsh Braking Penalty</span>
                        <span className="font-semibold text-red-600">-{fc.harsh_braking_penalty} pts</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Rapid Accel Penalty</span>
                        <span className="font-semibold text-red-600">-{fc.rapid_accel_penalty} pts</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Speed Variance Penalty</span>
                        <span className="font-semibold text-red-600">-{fc.speed_penalty} pts</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Data Quality Penalty</span>
                        <span className="font-semibold text-red-600">-{fc.data_quality_penalty} pts</span>
                      </div>
                      <div className="flex justify-between py-2 border-t-2 border-slate-200 text-sm font-bold">
                        <span className="text-slate-800">Final Calculated Score</span>
                        <span className="text-brand-700">{fc.final_score} / 100</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">Factor details pending review or data quality validation.</p>
                  )}

                  {active.review_reasons && active.review_reasons.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-700 space-y-1">
                      <p className="font-bold">Human Review Triggers:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {active.review_reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-2">
                    <Link
                      to={`/trips/${active.trip_id}`}
                      className="btn-primary w-full text-xs justify-center flex items-center gap-1.5"
                    >
                      Inspect Full Telemetry Data <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
