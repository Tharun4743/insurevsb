import React, { useEffect, useState } from 'react';
import {
  getAdminPortfolio, getAdminCustomers,
  updateAdminCustomerStatus, updateAdminPricingConfig
} from '../api/client';
import {
  ShieldCheck, Users, TrendingUp, Sliders,
  CheckCircle, AlertTriangle, Building, UserCheck,
  GraduationCap, ClipboardCheck, ArrowUpRight
} from 'lucide-react';
import { LoadingSpinner, ErrorBanner } from '../components/ui';

export default function AdminDashboard() {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pricing Parameter Form (Strictly populated from Supabase)
  const [basePremium, setBasePremium] = useState<number>(0);
  const [maxAdjustment, setMaxAdjustment] = useState<number>(0);
  const [ruleVersion, setRuleVersion] = useState<string>('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [portRes, custRes] = await Promise.all([
        getAdminPortfolio(),
        getAdminCustomers(),
      ]);
      setPortfolio(portRes.portfolio || {});
      setCustomers(custRes.customers || []);
      const cfg = portRes.pricingConfig || portRes.portfolio?.currentConfig;
      if (cfg) {
        setBasePremium(cfg.basePremium ?? 0);
        setMaxAdjustment(cfg.maxAdjustment ?? 0);
        setRuleVersion(cfg.ruleVersion ?? '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load administrator dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await updateAdminCustomerStatus(userId, nextStatus);
      setCustomers(prev =>
        prev.map(c => (c.id === userId ? { ...c, status: nextStatus } : c))
      );
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(null);
    try {
      const res = await updateAdminPricingConfig({
        basePremium: Number(basePremium),
        maxAdjustment: Number(maxAdjustment),
        ruleVersion,
      });
      setConfigSuccess(`Pricing configuration ${res.config.ruleVersion} activated with audit logging.`);
      setTimeout(() => setConfigSuccess(null), 4000);
    } catch (err: any) {
      alert(`Failed to save config: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── TOP 5 STAT CARDS (Matching Screenshot Visuals) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              PORTFOLIO CUSTOMERS
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {portfolio?.totalCustomers ?? customers.length}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Building className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              ACTIVE TRIPS
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {portfolio?.totalTrips ?? 0}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              TOTAL QUOTES
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {portfolio?.totalQuotes ?? 0}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              AVG ANNUAL PREMIUM
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              ₹{(portfolio?.avgAnnualPremium ?? 1800).toLocaleString('en-IN')}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              ACTIVE DISPUTES
            </p>
            <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {portfolio?.activeDisputes ?? 0}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {/* ── PRICING RULE CONFIGURATION & ACTIVATION ── */}
      <div id="pricing" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-7">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              Actuarial Pricing Parameters & Rule Governance
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Approved parameters apply atomically to all future behavioural pricing calculations.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
            Active: {ruleVersion}
          </span>
        </div>

        {configSuccess && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>{configSuccess}</span>
          </div>
        )}

        <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Base Premium (INR)
            </label>
            <input
              type="number"
              min={500}
              max={20000}
              value={basePremium}
              onChange={e => setBasePremium(Number(e.target.value))}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Max Adjustment Cap (0.10 - 0.90)
            </label>
            <input
              type="number"
              step="0.05"
              min={0.1}
              max={0.9}
              value={maxAdjustment}
              onChange={e => setMaxAdjustment(Number(e.target.value))}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Approved Rule Version Tag
            </label>
            <input
              type="text"
              value={ruleVersion}
              onChange={e => setRuleVersion(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={savingConfig}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {savingConfig ? 'Saving Configuration…' : 'Save & Publish Pricing Rule'}
            </button>
          </div>
        </form>
      </div>

      {/* ── CUSTOMER ACCOUNTS TABLE ── */}
      <div id="customers" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 lg:p-7">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              Customer Accounts & Verification Status
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review registered customer accounts, email verification states, and access permissions.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            {customers.length} Accounts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="pb-3">Customer / Email</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Email Verified</th>
                <th className="pb-3">Account Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {customers.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="py-3">
                    <p className="font-bold text-slate-800">{c.full_name || 'Driver'}</p>
                    <p className="text-slate-400 text-[11px]">{c.email}</p>
                  </td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 font-semibold text-[10px] uppercase">
                      {c.role}
                    </span>
                  </td>
                  <td className="py-3">
                    {c.is_email_verified ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="text-amber-600 font-semibold">Pending OTP</span>
                    )}
                  </td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        c.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {c.status || 'active'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => handleToggleStatus(c.id, c.status || 'active')}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold text-[11px] transition-colors"
                    >
                      {c.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
