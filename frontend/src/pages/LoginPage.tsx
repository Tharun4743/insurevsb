import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login as apiLogin, getAuthAccounts } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Shield, Eye, EyeOff, ArrowRight, AlertCircle, Zap, UserCheck, ShieldAlert, Sparkles } from 'lucide-react';

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
      .catch(() => {});
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
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <img
            src="/logo-shield.png"
            alt="INSURE Logo"
            className="w-14 h-14 object-contain mx-auto mb-2.5 drop-shadow-xs"
          />
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">INSURE</h1>
          <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-0.5">
            Consented Telematics & Fair Pricing Platform
          </p>
        </div>

        {/* Credentials Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 sm:p-7">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Sign In</h2>
          <p className="text-xs text-slate-500 mb-5">
            Enter your credentials to access your portal.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <span>{error}</span>
                {unverifiedEmail && (
                  <div className="mt-1.5">
                    <Link
                      to="/verify-email"
                      state={{ email: unverifiedEmail }}
                      className="inline-flex items-center gap-1 font-semibold text-rose-800 underline hover:text-rose-900"
                    >
                      Verify email now →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
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
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  Forgot?
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all pr-10 font-mono"
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
              className="w-full mt-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all text-sm cursor-pointer"
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

          {/* ── ⚡ COMPACT 1-CLICK FAST SIGN-IN AT BOTTOM ── */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> 1-Click Fast Sign-In
              </span>
              <span className="text-[10px] text-slate-400">Demo Accounts</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Admin */}
              <button
                type="button"
                id="btn-quick-admin"
                disabled={quickLoginRole !== null}
                onClick={() => handleQuickLogin('admin', adminEmail, '/admin')}
                className="p-2 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 text-center transition-all cursor-pointer group"
              >
                <div className="text-xs font-bold text-slate-800 flex items-center justify-center gap-1 group-hover:text-blue-600">
                  <Shield className="w-3.5 h-3.5 text-blue-500" />
                  <span>Admin</span>
                </div>
                <p className="text-[9px] text-slate-400 mt-0.5 font-mono">/admin</p>
              </button>

              {/* Compliance */}
              <button
                type="button"
                id="btn-quick-compliance"
                disabled={quickLoginRole !== null}
                onClick={() => handleQuickLogin('compliance', complianceEmail, '/compliance')}
                className="p-2 rounded-xl bg-slate-50 hover:bg-amber-50/60 border border-slate-200 hover:border-amber-300 text-center transition-all cursor-pointer group"
              >
                <div className="text-xs font-bold text-slate-800 flex items-center justify-center gap-1 group-hover:text-amber-600">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span>Officer</span>
                </div>
                <p className="text-[9px] text-slate-400 mt-0.5 font-mono">/compliance</p>
              </button>

              {/* Driver */}
              <button
                type="button"
                id="btn-quick-customer"
                disabled={quickLoginRole !== null}
                onClick={() => handleQuickLogin('customer', customerEmail, '/')}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 hover:border-emerald-300 text-center transition-all cursor-pointer group"
              >
                <div className="text-xs font-bold text-slate-800 flex items-center justify-center gap-1 group-hover:text-emerald-600">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Driver</span>
                </div>
                <p className="text-[9px] text-slate-400 mt-0.5 font-mono">/dashboard</p>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Need an account?{' '}
              <Link to="/signup" className="font-semibold text-emerald-600 hover:text-emerald-700">
                Register
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
