import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login as apiLogin, getAuthAccounts } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Shield, Eye, EyeOff, ArrowRight, AlertCircle,
  UserCheck, ShieldAlert, Car, CheckCircle2, Zap
} from 'lucide-react';

interface SupabaseAccount {
  id: string;
  email: string;
  full_name: string;
  role: 'customer' | 'admin' | 'compliance_officer';
  status: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quickLoggingIn, setQuickLoggingIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // Live Supabase Accounts loaded directly from database
  const [liveAccounts, setLiveAccounts] = useState<SupabaseAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Return to location if redirected by protected route
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  useEffect(() => {
    let isMounted = true;
    getAuthAccounts()
      .then(res => {
        if (isMounted && res?.accounts) {
          setLiveAccounts(res.accounts);
        }
      })
      .catch(err => {
        console.warn('Failed to fetch accounts from Supabase:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingAccounts(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

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

  // Dynamic Role Cards derived strictly from Supabase users
  const quickRoles = liveAccounts.map(account => {
    const isCustomer = account.role === 'customer';
    const isAdmin = account.role === 'admin';
    const isCompliance = account.role === 'compliance_officer';

    return {
      key: account.id || account.email,
      role: account.role,
      title: isAdmin ? 'Insurance Admin' : isCompliance ? 'Compliance Officer' : 'Customer',
      badge: isAdmin ? 'Executive' : isCompliance ? 'Auditor' : 'Policyholder',
      email: account.email,
      fullName: account.full_name || account.email,
      route: isAdmin ? '/admin' : isCompliance ? '/compliance' : '/',
      icon: isAdmin ? UserCheck : isCompliance ? ShieldAlert : Car,
      color: isAdmin
        ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70'
        : isCompliance
        ? 'text-purple-800 bg-purple-50 border-purple-200 hover:bg-purple-100/70'
        : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100/70',
      iconBg: isAdmin ? 'bg-emerald-600 text-white' : isCompliance ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white',
    };
  });

  const handleQuickSelect = async (roleObj: (typeof quickRoles)[0]) => {
    setEmail(roleObj.email);
    setPassword('123456');
    setQuickLoggingIn(roleObj.key);
    try {
      await performLogin(roleObj.email, '123456', roleObj.route);
    } catch {
      // Handled in performLogin
    } finally {
      setQuickLoggingIn(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-white font-bold text-lg shadow-sm mb-3">
            IT
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">IT Vault — INSURE</h1>
          <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-1">
            Consented Telematics & Fair Pricing Platform
          </p>
        </div>

        {/* ── EASY ONE-CLICK QUICK ROLE LOGIN (Loaded live from Supabase) ── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Easy Role Selection & Login (Password: 123456)
            </span>
            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              Live from Supabase
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {quickRoles.map(r => {
              const Icon = r.icon;
              const isSelected = quickLoggingIn === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => handleQuickSelect(r)}
                  disabled={submitting || quickLoggingIn !== null}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${r.color} ${
                    isSelected ? 'ring-2 ring-emerald-500 scale-95 opacity-80' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-2xs ${r.iconBg}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-white/80">
                      {r.badge}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 leading-tight">{r.title}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5" title={r.email}>
                      {r.email}
                    </p>
                    <p className="text-[10px] font-semibold text-emerald-600 mt-1">
                      {isSelected ? 'Authenticating…' : 'One-Click Login →'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Credentials Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Sign In to Your Account</h2>
          <p className="text-xs text-slate-500 mb-6">
            Enter your credentials or choose a quick role button above.
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
              disabled={submitting || quickLoggingIn !== null}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all text-sm cursor-pointer"
            >
              {submitting || quickLoggingIn ? (
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
