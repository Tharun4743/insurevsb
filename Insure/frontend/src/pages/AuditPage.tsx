import React, { useEffect, useState, useMemo } from 'react';
import {
  FileText, ShieldCheck, Play, Award,
  UserCheck, AlertTriangle, Clock, Search, ChevronDown, ChevronRight
} from 'lucide-react';
import { getAuditHistory } from '../api/client';
import { AuditEvent } from '../types';
import {
  StatCard, LoadingSpinner, EmptyState,
  ErrorBanner, DisclaimerBanner
} from '../components/ui';

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditHistory(200);
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  const eventTypes = useMemo(() => {
    const types = new Set(events.map(e => e.event_type));
    return ['all', ...Array.from(types)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesType = typeFilter === 'all' || e.event_type === typeFilter;
      const matchesSearch = search === '' ||
        e.event_type.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(e.metadata).toLowerCase().includes(search.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [events, typeFilter, search]);

  const consentCount = events.filter(e => e.event_type.includes('consent')).length;
  const simCount = events.filter(e => e.event_type.includes('trip') || e.event_type.includes('simulat')).length;
  const reviewCount = events.filter(e => e.event_type.includes('review')).length;

  const getEventIcon = (type: string) => {
    if (type.includes('consent')) return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    if (type.includes('trip') || type.includes('simulat')) return <Play className="w-4 h-4 text-brand-600" />;
    if (type.includes('assessment') || type.includes('quote')) return <Award className="w-4 h-4 text-amber-600" />;
    if (type.includes('review')) return <UserCheck className="w-4 h-4 text-purple-600" />;
    return <FileText className="w-4 h-4 text-slate-500" />;
  };

  const getEventBadgeClass = (type: string) => {
    if (type.includes('consent_granted')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (type.includes('consent_withdrawn')) return 'bg-red-50 text-red-700 border-red-200';
    if (type.includes('simulat') || type.includes('trip')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (type.includes('review')) return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Audit Trail & Compliance Log</h2>
          <p className="text-sm text-slate-500">Immutable chronological event log for privacy, telemetry and review actions</p>
        </div>
        <button onClick={fetchAudit} className="btn-secondary text-xs">
          Refresh Log
        </button>
      </div>

      <DisclaimerBanner text="PROTOTYPE AUDIT LOG — Captures compliance-relevant events for verification and traceability." />

      {error && <ErrorBanner message={error} onRetry={fetchAudit} />}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Logged Events"
          value={events.length}
          icon={<FileText className="w-6 h-6 text-brand-600" />}
          iconBg="bg-brand-50"
        />
        <StatCard
          label="Consent Events"
          value={consentCount}
          icon={<ShieldCheck className="w-6 h-6 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <StatCard
          label="Trip Pipelines"
          value={simCount}
          icon={<Play className="w-6 h-6 text-blue-600" />}
          iconBg="bg-blue-50"
        />
        <StatCard
          label="Review Actions"
          value={reviewCount}
          icon={<UserCheck className="w-6 h-6 text-purple-600" />}
          iconBg="bg-purple-50"
        />
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {eventTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                typeFilter === type
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {type === 'all' ? 'All Types' : type.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search events or metadata..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Events Table / Timeline */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600" />
            Audit Records ({filteredEvents.length})
          </h3>
          <span className="text-xs text-slate-400">Ordered newest first</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <EmptyState message="No audit events matched your search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs">
                <tr>
                  <th className="table-th w-10"></th>
                  <th className="table-th">Timestamp</th>
                  <th className="table-th">Event Type</th>
                  <th className="table-th">User ID</th>
                  <th className="table-th">Summary Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredEvents.map(event => {
                  const isExpanded = expandedId === event.id;
                  const metaKeys = Object.keys(event.metadata || {});
                  return (
                    <React.Fragment key={event.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : event.id)}
                        className="hover:bg-slate-50/80 cursor-pointer transition"
                      >
                        <td className="table-td text-center text-slate-400">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="table-td font-mono text-slate-600 whitespace-nowrap">
                          {new Date(event.created_at).toLocaleString('en-GB')}
                        </td>
                        <td className="table-td">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getEventBadgeClass(event.event_type)}`}>
                            {getEventIcon(event.event_type)}
                            <span>{event.event_type}</span>
                          </span>
                        </td>
                        <td className="table-td font-mono text-slate-500">
                          {event.user_id ? `${event.user_id.slice(0, 8)}...` : 'system'}
                        </td>
                        <td className="table-td text-slate-600 max-w-xs truncate">
                          {metaKeys.length > 0 ? (
                            <span>
                              {metaKeys.map(k => `${k}: ${JSON.stringify(event.metadata[k])}`).slice(0, 3).join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No extra metadata</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="p-4 pl-12">
                            <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs font-mono space-y-2">
                              <div className="flex justify-between border-b border-slate-100 pb-2">
                                <span className="font-bold text-slate-700">Full Event Record</span>
                                <span className="text-slate-400">ID: {event.id}</span>
                              </div>
                              <pre className="text-slate-800 overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(event.metadata, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
