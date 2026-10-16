import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login as apiLogin, getAuthAccounts } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Shield, Eye, EyeOff, ArrowRight, AlertCircle, Zap, CheckCircle2, UserCheck, ShieldAlert, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
  const [quickLoginRole, setQuickLoginRole] = useState<string | null>(null);

  // Return to location if redirected by protected route
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  useEffect(() => {
    let isMounted = true;
    getAuthAccounts()
      .then((res: any) => {
        if (isMounted && res?.accounts) {
          setAccounts(res.accounts);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingAccounts(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const realAdmin = accounts.find((a: any) => a.role === 'admin');
  const realCompliance = accounts.find((a: any) => a.role === 'compliance_officer');
  const realCustomer =
    accounts.find((a: any) => a.role === 'customer' && a.email?.includes('tharun')) ||
    accounts.find((a: any) => a.role === 'customer');

  const adminEmail = realAdmin?.email || 'tharunkumark42007@gmail.com';
  const complianceEmail = realCompliance?.email || 'vsbecitc2428@gmail.com';
  const customerEmail = realCustomer?.email || 'tharunkumark4743@gmail.com';

  const performLogin = async (targetEmail: string, targetPass: string, defaultRoute?: string) => {
    setError(null);
    setUnverifiedEmail(null);

    const cleanEmail = targetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Email address is required.');
      return;
    }
    if (!targetPass) {
      setError('Password is required.');
      return;
    }

    try {
      const res = await apiLogin({ email: cleanEmail, password: targetPass });
      login(res.token, res.user);

      // Strict role-based route redirection
      if (from && from !== '/login') {
        navigate(from, { replace: true });
      } else if (res.user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (res.user.role === 'compliance_officer') {
        navigate('/compliance', { replace: true });
      } else {
        navigate(defaultRoute || '/', { replace: true });
      }
    } catch (err: any) {
      const msg = err.message || 'Invalid email or password.';
      setError(msg);
      if (err.requiresVerification || msg.toLowerCase().includes('verify your email')) {
        setUnverifiedEmail(cleanEmail);
      }
      throw err;
    }
  };

  const handleQuickLogin = async (roleKey: string, targetEmail: string, defaultRoute: string) => {
    setQuickLoginRole(roleKey);
    setEmail(targetEmail);
    setPassword('123456');
    try {
      await performLogin(targetEmail, '123456', defaultRoute);
    } catch {
      // Handled in performLogin
    } finally {
      setQuickLoginRole(null);
    }
  };

  const handleFill = (targetEmail: string) => {
    setEmail(targetEmail);
    setPassword('123456');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await performLogin(email, password);
    } catch {
      // Handled in performLogin
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <img
            src="/logo-shield.png"
            alt="INSURE Logo"
            className="w-16 h-16 object-contain mx-auto mb-3 drop-shadow-xs"
          />
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">INSURE</h1>
          <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-1">
            Consented Telematics & Fair Pricing Platform
          </p>
        </div>

        {/* ── ⚡ 1-Click Fast Role Sign-In Cards (Real Supabase Accounts) ── */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl border border-indigo-800/80 p-5 mb-5 shadow-md text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                1-Click Fast Sign-In
              </span>
            </div>
            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-700">
              Real Supabase Accounts
            </span>
          </div>
          <p className="text-xs text-slate-300 mb-3.5">
            Single-click access to verified accounts configured in remote Supabase PostgreSQL:
          </p>

          <div className="space-y-2.5">
            {/* Admin */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400 transition-all">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    Insurance Admin
                  </span>
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    /admin
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 truncate mt-0.5">
                  {adminEmail}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleFill(adminEmail)}
                  className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                  title="Fill form"
                >
                  Fill
                </button>
                <button
                  type="button"
                  id="btn-quick-admin"
                  disabled={quickLoginRole !== null}
                  onClick={() => handleQuickLogin('admin', adminEmail, '/admin')}
                  className="px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                >
                  {quickLoginRole === 'admin' ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3 text-amber-300" />
                  )}
                  <span>Sign In</span>
                </button>
              </div>
            </div>

            {/* Compliance Officer */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400 transition-all">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    Compliance Officer
                  </span>
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    /compliance
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 truncate mt-0.5">
                  {complianceEmail}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleFill(complianceEmail)}
                  className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                  title="Fill form"
                >
                  Fill
                </button>
                <button
                  type="button"
                  id="btn-quick-compliance"
                  disabled={quickLoginRole !== null}
                  onClick={() => handleQuickLogin('compliance', complianceEmail, '/compliance')}
                  className="px-3 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                >
                  {quickLoginRole === 'compliance' ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3 text-amber-300" />
                  )}
                  <span>Sign In</span>
                </button>
              </div>
            </div>

            {/* Customer / Policyholder */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400 transition-all">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Customer / Driver
                  </span>
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    /dashboard
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 truncate mt-0.5">
                  {customerEmail}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleFill(customerEmail)}
                  className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                  title="Fill form"
                >
                  Fill
                </button>
                <button
                  type="button"
                  id="btn-quick-customer"
                  disabled={quickLoginRole !== null}
                  onClick={() => handleQuickLogin('customer', customerEmail, '/')}
                  className="px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                >
                  {quickLoginRole === 'customer' ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3 text-amber-300" />
                  )}
                  <span>Sign In</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Credentials Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Sign In to Your Account</h2>
          <p className="text-xs text-slate-500 mb-6">
            Enter your registered email and password to access your role portal.
          </p>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <span>{error}</span>
                {unverifiedEmail && (
                  <div className="mt-2">
                    <Link
                      to="/verify-email"
                      state={{ email: unverifiedEmail }}
                      className="inline-flex items-center gap-1 font-semibold text-rose-800 underline hover:text-rose-900"
                    >
                      Verify your email now →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all pr-10 font-mono"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={submitting}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all text-sm cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing In…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Don't have an account?{' '}
              <Link to="/signup" className="font-semibold text-emerald-600 hover:text-emerald-700">
                Create Customer Account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
