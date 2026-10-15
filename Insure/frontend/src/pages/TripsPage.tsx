import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Filter } from 'lucide-react';
import { getTrips } from '../api/client';
import { Trip } from '../types';
import {
  LoadingSpinner, EmptyState, ErrorBanner,
  StatusBadge, DisclaimerBanner
} from '../components/ui';

function fmt(dt: string) {
  return new Date(dt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips]     = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await getTrips(100);
      setTrips(d.trips || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = trips.filter(t => {
    if (filter === 'all')    return true;
    if (filter === 'review') return t.status === 'review_required';
    return t.scenario === filter;
  });

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-brand-500" /> Trip History
          </h2>
          <p className="text-xs text-slate-500">{trips.length} trips — all synthetic data</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            className="select w-auto text-xs"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            id="select-trip-filter"
          >
            <option value="all">All Trips</option>
            <option value="smooth">Smooth</option>
            <option value="harsh_events">Harsh Events</option>
            <option value="invalid_data">Invalid Data</option>
            <option value="review">Needs Review</option>
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message={filter === 'all' ? 'No trips yet. Go to the Simulator to run your first trip.' : 'No trips match this filter.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="table-th">Date / Time</th>
                  <th className="table-th">Scenario</th>
                  <th className="table-th">Readings</th>
                  <th className="table-th">Data Status</th>
                  <th className="table-th">Score</th>
                  <th className="table-th">Estimate</th>
                  <th className="table-th">Review</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(trip => (
                  <tr key={trip.id} className="table-tr cursor-pointer" onClick={() => navigate(`/trips/${trip.id}`)}>
                    <td className="table-td font-medium">{fmt(trip.created_at)}</td>
                    <td className="table-td"><StatusBadge status={trip.scenario} /></td>
                    <td className="table-td text-slate-500">{trip.reading_count}</td>
                    <td className="table-td"><StatusBadge status={trip.status} /></td>
                    <td className="table-td font-bold text-brand-700">
                      {trip.latest_assessment?.score != null ? `${trip.latest_assessment.score}/100` : '—'}
                    </td>
                    <td className="table-td text-emerald-700 font-semibold">
                      {trip.latest_quote?.illustrative_estimate ? `£${trip.latest_quote.illustrative_estimate}` : '—'}
                    </td>
                    <td className="table-td">
                      {trip.review_case ? <StatusBadge status={trip.review_case.status} /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="table-td text-brand-600 font-semibold text-xs">View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DisclaimerBanner />
    </div>
  );
}
