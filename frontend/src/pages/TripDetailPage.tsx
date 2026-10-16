import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Car, ShieldAlert, Award, FileText,
  AlertTriangle, CheckCircle2, Clock, Gauge, Activity, Database,
  Shield, Scale, AlertCircle, Info
} from 'lucide-react';
import { getTrip, getTripReadings } from '../api/client';
import { Trip, TripMetrics, Assessment, Quote, ReviewCase, TelemetryReading, AccidentRecord } from '../types';
import {
  StatusBadge, LoadingSpinner, EmptyState,
  ErrorBanner, DisclaimerBanner, ScoreGauge
} from '../components/ui';

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [trip, setTrip]             = useState<Trip | null>(null);
  const [metrics, setMetrics]       = useState<TripMetrics | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [quote, setQuote]           = useState<Quote | null>(null);
  const [reviewCase, setReviewCase] = useState<ReviewCase | null>(null);
  const [accidents, setAccidents]   = useState<AccidentRecord[]>([]);
  const [readings, setReadings]     = useState<TelemetryReading[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Pagination / filter for readings
  const [page, setPage] = useState(1);
  const [filterDefectsOnly, setFilterDefectsOnly] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    if (!id) return;
    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const [tripData, readingsData] = await Promise.all([
          getTrip(id),
          getTripReadings(id),
        ]);
        setTrip(tripData.trip);
        setMetrics(tripData.metrics);
        setAssessment(tripData.assessment);
        setQuote(tripData.quote);
        setReviewCase(tripData.review_case);
        setAccidents(tripData.accidents || []);
        setReadings(readingsData.readings || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load trip details');
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/trips')} className="btn-secondary text-sm flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back to Trips
        </button>
        <ErrorBanner message={error || 'Trip not found'} />
      </div>
    );
  }

  const filteredReadings = filterDefectsOnly
    ? readings.filter(r => r.injected_defect || (r.event_type && r.event_type !== 'regular'))
    : readings;

  const totalPages = Math.ceil(filteredReadings.length / pageSize) || 1;
  const paginatedReadings = filteredReadings.slice((page - 1) * pageSize, page * pageSize);

  const safetyScore = assessment?.safety_score != null ? assessment.safety_score : (assessment?.score ?? null);
  const drivingRiskScore = assessment?.driving_risk_score ?? (safetyScore != null ? 100 - safetyScore : null);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/trips')}
            className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600"
            title="Back to Trips"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-800">Trip Analysis & Risk Evaluation</h2>
              <StatusBadge status={trip.scenario} />
              <StatusBadge status={trip.status} />
              {assessment?.risk_category && (
                <StatusBadge status={assessment.risk_category} />
              )}
              {trip.synthetic && (
                <span className="text-xs bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded border border-slate-200">
                  Synthetic Telematics
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {trip.id}</p>
          </div>
        </div>
        <div className="text-xs text-slate-500 sm:text-right">
          <p>Recorded: {new Date(trip.created_at).toLocaleString('en-GB')}</p>
          <p className="text-slate-400">Total Stream Points: {trip.reading_count}</p>
        </div>
      </div>

      <DisclaimerBanner />

      {/* Review Case Warning Box */}
      {reviewCase && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Flagged for Human Review: <StatusBadge status={reviewCase.status} />
              </p>
              <p className="text-xs text-amber-800 mt-0.5">{reviewCase.reason}</p>
              {reviewCase.reviewer_explanation && (
                <p className="text-xs text-slate-600 mt-1 italic bg-white/70 p-2 rounded border border-amber-200">
                  Decision note: {reviewCase.reviewer_explanation}
                </p>
              )}
            </div>
          </div>
          <Link
            to="/review"
            className="btn-primary text-xs whitespace-nowrap self-start md:self-center"
          >
            Go to Review Center
          </Link>
        </div>
      )}

      {/* Factor C: Driving Exposure Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card p-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Distance</p>
            <p className="text-lg font-bold text-slate-800">
              {metrics.total_distance_km ? `${metrics.total_distance_km.toFixed(2)} km` : '—'}
            </p>
            <span className="text-[10px] text-slate-400">Exposure denominator</span>
          </div>
          <div className="card p-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Duration</p>
            <p className="text-lg font-bold text-slate-800">
              {metrics.duration_sec ? `${Math.round(metrics.duration_sec)}s` : '—'}
            </p>
            <span className="text-[10px] text-slate-400">Recorded trip time</span>
          </div>
          <div className="card p-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Avg / Max Speed</p>
            <p className="text-lg font-bold text-slate-800">
              {metrics.avg_speed_kmh ? `${Math.round(metrics.avg_speed_kmh)}` : '0'} / {metrics.max_speed_kmh ? `${Math.round(metrics.max_speed_kmh)}` : '0'} <span className="text-xs text-slate-400 font-normal">km/h</span>
            </p>
            <span className="text-[10px] text-slate-400">Speeding: {metrics.speeding_pct ? `${metrics.speeding_pct.toFixed(1)}%` : '0%'}</span>
          </div>
          <div className="card p-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Harsh Braking</p>
            <p className={`text-lg font-bold ${metrics.harsh_braking_count > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {metrics.harsh_braking_count}
            </p>
            <span className="text-[10px] text-slate-400">Rate: {metrics.harsh_braking_rate_per_100km ?? 0}/100km</span>
          </div>
          <div className="card p-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Rapid Accel</p>
            <p className={`text-lg font-bold ${metrics.rapid_accel_count > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {metrics.rapid_accel_count}
            </p>
            <span className="text-[10px] text-slate-400">Rate: {metrics.rapid_accel_rate_per_100km ?? 0}/100km</span>
          </div>
          <div className="card p-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Data Confidence</p>
            <div className="mt-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${metrics.data_quality_status === 'review_required' || metrics.completeness_pct < 70 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {assessment?.data_confidence || 'High'} ({metrics.completeness_pct}%)
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Quality: {metrics.data_quality_status}</span>
          </div>
        </div>
      )}

      {/* Assessment and Quote Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Factor A: Driving Risk Assessment */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-brand-600" />
              <h3 className="text-sm font-bold text-slate-800">Factor A: Driving Behaviour Risk Assessment</h3>
            </div>
            {assessment && <span className="text-xs text-slate-400 font-mono">{assessment.rule_version}</span>}
          </div>
          <div className="card-body space-y-4">
            {assessment ? (
              <>
                <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-xl">
                  <ScoreGauge score={safetyScore} />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800">Safety Score: {safetyScore != null ? `${safetyScore}/100` : 'Provisional'}</p>
                      {assessment.risk_category && <StatusBadge status={assessment.risk_category} />}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Driving Risk Score: <strong>{drivingRiskScore ?? '—'} / 100</strong> (Calculated from 5 weighted telematics indicators normalized per distance).
                    </p>
                    {assessment.explanation && (
                      <p className="text-xs text-slate-700 bg-white p-2 rounded border border-slate-200 mt-2">
                        {assessment.explanation}
                      </p>
                    )}
                    {assessment.review_reasons && assessment.review_reasons.length > 0 && (
                      <div className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                        <strong>Review Note:</strong>
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                          {assessment.review_reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {assessment.factor_contributions && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      5-Factor Sub-Indicator Breakdown
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-center">
                      <div className="p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="text-[10px] text-slate-500 uppercase">Speeding (30%)</span>
                        <p className="font-bold text-slate-800 mt-0.5">{assessment.factor_contributions.speeding_risk ?? 0}/100</p>
                        <p className="text-[10px] text-red-500 font-mono">+{assessment.factor_contributions.speeding_penalty ?? 0} pts</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="text-[10px] text-slate-500 uppercase">Braking (25%)</span>
                        <p className="font-bold text-slate-800 mt-0.5">{assessment.factor_contributions.braking_risk ?? 0}/100</p>
                        <p className="text-[10px] text-red-500 font-mono">+{assessment.factor_contributions.braking_penalty ?? 0} pts</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="text-[10px] text-slate-500 uppercase">Accel (15%)</span>
                        <p className="font-bold text-slate-800 mt-0.5">{assessment.factor_contributions.acceleration_risk ?? 0}/100</p>
                        <p className="text-[10px] text-red-500 font-mono">+{assessment.factor_contributions.acceleration_penalty ?? 0} pts</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="text-[10px] text-slate-500 uppercase">Cornering (15%)</span>
                        <p className="font-bold text-slate-800 mt-0.5">{assessment.factor_contributions.cornering_risk ?? 0}/100</p>
                        <p className="text-[10px] text-red-500 font-mono">+{assessment.factor_contributions.cornering_penalty ?? 0} pts</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="text-[10px] text-slate-500 uppercase">Usage (15%)</span>
                        <p className="font-bold text-slate-800 mt-0.5">{assessment.factor_contributions.unsafe_usage_risk ?? 0}/100</p>
                        <p className="text-[10px] text-red-500 font-mono">+{assessment.factor_contributions.unsafe_usage_penalty ?? 0} pts</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState message="No assessment recorded for this trip." />
            )}
          </div>
        </div>

        {/* Dynamic Insurance Premium Quote */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">Dynamic Insurance Premium Calculation</h3>
            </div>
            {quote && <StatusBadge status={quote.status} />}
          </div>
          <div className="card-body space-y-4">
            {quote ? (
              <>
                <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-xl text-center">
                  <p className="text-xs uppercase font-semibold text-emerald-700 tracking-wide">Illustrative Premium</p>
                  <p className="text-4xl font-extrabold text-emerald-700 mt-2">
                    {quote.illustrative_estimate !== null ? `₹${quote.illustrative_estimate.toFixed(2)}` : 'Pending Review'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Configurable simulation engine (Base: ₹{quote.base_premium})</p>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                  <p className="font-bold text-slate-700 uppercase tracking-wide">Actuarial Formula Breakdown</p>
                  <div className="space-y-1.5 font-mono">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-600 font-sans">Base Premium:</span>
                      <span className="font-semibold text-slate-800">₹{quote.base_premium.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-600 font-sans">Driving Behaviour Adjustment:</span>
                      <span className={`font-semibold ${quote.behaviour_adjustment && quote.behaviour_adjustment < 0 ? 'text-emerald-600' : quote.behaviour_adjustment && quote.behaviour_adjustment > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        {quote.behaviour_adjustment ? (quote.behaviour_adjustment > 0 ? `+₹${quote.behaviour_adjustment.toFixed(2)}` : `-₹${Math.abs(quote.behaviour_adjustment).toFixed(2)}`) : '₹0.00'}
                        {quote.behaviour_adjustment_pct ? ` (${quote.behaviour_adjustment_pct > 0 ? '+' : ''}${quote.behaviour_adjustment_pct}%)` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-600 font-sans">Accident History Adjustment:</span>
                      <span className={`font-semibold ${quote.accident_adjustment && quote.accident_adjustment > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        {quote.accident_adjustment ? `+₹${quote.accident_adjustment.toFixed(2)}` : '₹0.00 (0%)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 font-sans">
                      <span className="text-slate-600">Pricing Model Version:</span>
                      <span className="font-mono text-slate-700">{quote.rule_version}</span>
                    </div>
                  </div>
                  {quote.explanation && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 mt-2 italic">
                      {quote.explanation}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <EmptyState message="No insurance quote generated for this trip." />
            )}
          </div>
        </div>
      </div>

      {/* Factor B: Accident & Claims History (Dedicated Separate Section) */}
      <div className="card p-5 border-l-4 border-l-indigo-600">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Factor B: Accident & Claims History (Separated from Driving Behaviour)
              </h3>
              <p className="text-xs text-slate-500">
                Accidents are never equated to driver fault without verified responsibility. Claims decisions remain strictly independent.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded border border-indigo-200 font-semibold">
            {accidents.length} Incident{accidents.length === 1 ? '' : 's'} on File
          </span>
        </div>

        {accidents.length > 0 ? (
          <div className="space-y-3">
            {accidents.map((acc, idx) => (
              <div key={acc.id || idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 text-sm">{acc.driver_name || 'Driver Incident'}</span>
                    <StatusBadge status={acc.fault_status} />
                    <span className="text-slate-500 font-mono">Date: {new Date(acc.accident_date).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-700 mt-1">{acc.description}</p>
                  <div className="flex items-center gap-4 text-slate-500 mt-1 font-mono text-[11px]">
                    <span>Severity: <strong className="text-slate-700">{acc.claim_severity}</strong></span>
                    <span>Claim: <strong className="text-slate-700">₹{parseFloat(acc.claim_amount as string || '0').toLocaleString()}</strong></span>
                    <span>Frequency: <strong className="text-slate-700">{acc.claim_frequency}</strong></span>
                  </div>
                </div>
                <div className="sm:text-right flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${acc.is_verified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {acc.is_verified ? '✓ Verified Incident' : 'Under Investigation'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-xl text-xs text-emerald-800 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-bold">No Accident History on Record</p>
              <p className="text-emerald-700 mt-0.5">Customer currently maintains a clean claims record with zero recorded loss events.</p>
            </div>
          </div>
        )}

        <div className="mt-4 p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center gap-2.5">
          <Info className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <span>
            <strong>Claims Protection Guarantee:</strong> Legitimate insurance claims are NEVER reduced, delayed, or rejected based on telematics risk scores. Accident records and observed driving behaviour are assessed independently.
          </span>
        </div>
      </div>

      {/* Telemetry Readings Table */}
      <div className="card">
        <div className="card-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-600" />
              Raw Telemetry Stream ({readings.length} total points)
            </h3>
            <p className="text-xs text-slate-500">Validated sequence points ingested during this trip</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterDefectsOnly}
                onChange={e => {
                  setFilterDefectsOnly(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Show Events & Defects Only
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          {paginatedReadings.length === 0 ? (
            <EmptyState message="No readings match your filter criteria." />
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Timestamp</th>
                  <th className="table-th">Speed (km/h)</th>
                  <th className="table-th">Distance (km)</th>
                  <th className="table-th">Accel (m/s²)</th>
                  <th className="table-th">Event</th>
                  <th className="table-th">Quality / Defect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono">
                {paginatedReadings.map(r => (
                  <tr key={r.id || r.sequence_number} className={r.injected_defect ? 'bg-red-50/60' : 'hover:bg-slate-50/70'}>
                    <td className="table-td text-slate-500">{r.sequence_number}</td>
                    <td className="table-td text-slate-700">{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td className="table-td font-semibold text-slate-800">
                      {r.speed_kmh !== null ? `${Math.round(r.speed_kmh)}` : <span className="text-red-500">null</span>}
                    </td>
                    <td className="table-td text-slate-600">
                      {r.distance_km !== null && !isNaN(Number(r.distance_km)) ? Number(r.distance_km).toFixed(2) : '—'}
                    </td>
                    <td className="table-td">
                      {r.acceleration_ms2 !== null && !isNaN(Number(r.acceleration_ms2)) ? (
                        <span className={Number(r.acceleration_ms2) < -3.5 ? 'text-red-600 font-bold' : Number(r.acceleration_ms2) > 3.0 ? 'text-amber-600 font-bold' : 'text-slate-600'}>
                          {Number(r.acceleration_ms2).toFixed(2)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="table-td font-sans">
                      {r.event_type && r.event_type !== 'regular' ? (
                        <span className="badge badge-yellow">{r.event_type}</span>
                      ) : (
                        <span className="text-slate-400">regular</span>
                      )}
                    </td>
                    <td className="table-td font-sans">
                      {r.injected_defect ? (
                        <span className="badge badge-red font-bold">
                          {r.injected_defect}
                        </span>
                      ) : (
                        <span className="text-emerald-600 flex items-center gap-1 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="card-footer flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing page {page} of {totalPages} ({filteredReadings.length} readings)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
