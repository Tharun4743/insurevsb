import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signup as apiSignup } from '../api/client';
import { Shield, Eye, EyeOff, ArrowRight, AlertCircle, Check } from 'lucide-react';

export default function SignupPage() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [privacyTermsAcknowledged, setPrivacyTermsAcknowledged] = useState(false);
  const [telematicsConsent, setTelematicsConsent] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Valid email address is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!privacyTermsAcknowledged) {
      setError('You must acknowledge the Privacy Policy and Terms of Service to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiSignup({
        fullName: fullName.trim(),
        email: cleanEmail,
        password,
        confirmPassword,
        privacyTermsAcknowledged,
        telematicsConsent,
      });

      // Navigate to OTP verification page
      navigate('/verify-email', {
        state: {
          email: res.email || cleanEmail,
          maskedEmail: res.maskedEmail,
          message: res.message,
        },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-white font-bold text-lg shadow-sm mb-3">
            IN
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Create Customer Account</h1>
          <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-1">
            Fair, Consented Behavioural Insurance Pricing
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                id="signup-fullname"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Jane Driver"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                A 6-digit verification code will be sent to this email via Brevo SMTP.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 chars"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <input
                  id="signup-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Password Policy hints */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
              <p className="font-semibold text-slate-600">Password Requirements:</p>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <span className={password.length >= 8 ? 'text-emerald-600 font-semibold' : ''}>
                  • Min 8 characters
                </span>
                <span className={/[A-Z]/.test(password) ? 'text-emerald-600 font-semibold' : ''}>
                  • 1 uppercase letter
                </span>
                <span className={/[a-z]/.test(password) ? 'text-emerald-600 font-semibold' : ''}>
                  • 1 lowercase letter
                </span>
                <span className={/[0-9]/.test(password) ? 'text-emerald-600 font-semibold' : ''}>
                  • 1 numeric digit
                </span>
              </div>
            </div>

            {/* Terms and Consent Checkboxes */}
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="signup-privacy-terms"
                  type="checkbox"
                  checked={privacyTermsAcknowledged}
                  onChange={e => setPrivacyTermsAcknowledged(e.target.checked)}
                  required
                  className="mt-1 w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs text-slate-600">
                  I acknowledge and accept the <strong className="text-slate-800">Privacy Policy</strong> and{' '}
                  <strong className="text-slate-800">Terms of Service</strong>. I understand that my data is protected and
                  never shared without explicit consent.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="signup-telematics-consent"
                  type="checkbox"
                  checked={telematicsConsent}
                  onChange={e => setTelematicsConsent(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">(Optional) Telematics Consent:</span> I consent to the collection
                  of simulated driving telematics to unlock fair, dynamic pricing discounts. I can withdraw this consent at any
                  time.
                </span>
              </label>
            </div>

            <button
              id="signup-submit-btn"
              type="submit"
              disabled={submitting}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all text-sm cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sending Verification Code...</span>
                </>
              ) : (
                <>
                  <span>Create Account & Send Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
