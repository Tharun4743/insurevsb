import React from 'react';
import clsx from 'clsx';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  sub?: string;
  trend?: { value: string; positive: boolean };
}

export function StatCard({ label, value, icon, iconBg, sub, trend }: StatCardProps) {
  return (
    <div className="stat-card animate-fadeIn">
      <div className={clsx('stat-icon', iconBg)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        {trend && (
          <p className={clsx('text-xs font-medium mt-0.5', trend.positive ? 'text-emerald-600' : 'text-red-500')}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </p>
        )}
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_MAP: Record<string, string> = {
  valid:            'badge-green',
  scored:           'badge-green',
  generated:        'badge-blue',
  warning:          'badge-yellow',
  review_required:  'badge-red',
  pending:          'badge-yellow',
  in_review:        'badge-blue',
  resolved:         'badge-green',
  rejected:         'badge-gray',
  granted:          'badge-green',
  withdrawn:        'badge-gray',
  smooth:           'badge-blue',
  harsh_events:     'badge-yellow',
  invalid_data:     'badge-red',
  low_risk:         'badge-green',
  moderate_risk:    'badge-yellow',
  high_risk:        'badge-red',
  new_insufficient_data: 'badge-gray',
  scenario_a_safe:  'badge-green',
  scenario_b_risky_no_accidents: 'badge-red',
  scenario_c_first_accident_safe: 'badge-blue',
  scenario_d_repeated_accidents_risky: 'badge-red',
  scenario_e_insufficient_data: 'badge-gray',
  driver_a_safe:    'badge-green',
  driver_b_risky:   'badge-red',
  driver_fault:     'badge-red',
  third_party_fault:'badge-blue',
  no_fault_weather: 'badge-blue',
  unknown:          'badge-gray',
};

const STATUS_LABEL: Record<string, string> = {
  valid:            'Valid',
  scored:           'Scored',
  generated:        'Generated',
  warning:          'Warning',
  review_required:  'Review Required',
  pending:          'Pending',
  in_review:        'In Review',
  resolved:         'Resolved',
  rejected:         'Rejected',
  granted:          'Active',
  withdrawn:        'Withdrawn',
  smooth:           'Smooth',
  harsh_events:     'Harsh Events',
  invalid_data:     'Invalid Data',
  low_risk:         'Low Risk',
  moderate_risk:    'Moderate Risk',
  high_risk:        'High Risk',
  new_insufficient_data: 'Insufficient Data',
  scenario_a_safe:  'Scenario A (Safe)',
  scenario_b_risky_no_accidents: 'Scenario B (Risky)',
  scenario_c_first_accident_safe: 'Scenario C (1st Accident)',
  scenario_d_repeated_accidents_risky: 'Scenario D (Risky + Claims)',
  scenario_e_insufficient_data: 'Scenario E (Insufficient Data)',
  driver_a_safe:    'Driver A (Safe)',
  driver_b_risky:   'Driver B (Risky)',
  driver_fault:     'Driver Fault',
  third_party_fault:'Third-Party Fault',
  no_fault_weather: 'Weather / Road',
  unknown:          'Unknown Fault',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cls = STATUS_MAP[status] ?? 'badge-gray';
  const label = STATUS_LABEL[status] ?? status;
  return <span className={clsx('badge', cls, className)}>{label}</span>;
}

interface LoadingSpinnerProps { size?: 'sm' | 'md' | 'lg'; }
export function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <div className={clsx('border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin', s)} />
  );
}

export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      {icon ?? <div className="text-4xl mb-3">📭</div>}
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-start gap-3">
      <span className="text-lg">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Error</p>
        <p className="text-sm mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold underline flex-shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}

export function DisclaimerBanner({ text }: { text?: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 flex items-start gap-2 text-xs">
      <span>⚠</span>
      <span>
        {text ?? 'PROTOTYPE — Illustrative calculations only. Not an actual insurance product, actuarially validated, or approved by any insurer.'}
      </span>
    </div>
  );
}

export function ScoreGauge({ score }: { score: number | null }) {
  if (score === null) return <div className="text-slate-400 text-sm">Score unavailable — pending review</div>;
  const color = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';
  const bgColor = score >= 80 ? 'bg-emerald-100' : score >= 60 ? 'bg-amber-100' : 'bg-red-100';
  return (
    <div className={clsx('flex flex-col items-center justify-center w-24 h-24 rounded-full', bgColor)}>
      <span className={clsx('text-3xl font-bold', color)}>{score}</span>
      <span className="text-xs text-slate-500">/100</span>
    </div>
  );
}
