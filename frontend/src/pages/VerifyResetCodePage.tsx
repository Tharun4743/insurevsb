import React, { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { verifyResetOtp } from '../api/client';
import { ShieldCheck, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function VerifyResetCodePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const email = (location.state as { email?: string })?.email || '';
  const initialMessage = (location.state as { message?: string })?.message;

  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) {
      const cleanDigits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newDigits = [...otpDigits];
      cleanDigits.forEach((digit, i) => {
        newDigits[i] = digit;
      });
      setOtpDigits(newDigits);
      const nextIdx = Math.min(cleanDigits.length, 5);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    const cleanChar = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];
    newDigits[index] = cleanChar;
    setOtpDigits(newDigits);

    if (cleanChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      setError('Please enter the complete 6-digit recovery code.');
      return;
    }

    if (!email) {
      setError('Account email is missing. Please restart recovery.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await verifyResetOtp({ email, otp: fullOtp });
      if (!res.resetToken) {
        throw new Error('Reset authorization token not returned.');
      }
      // Proceed to reset password screen
      navigate('/reset-password', {
        state: {
          email,
          resetToken: res.resetToken,
        },
      });
    } catch (err: any) {
      setError(err.message || 'Invalid or expired recovery code.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <img
            src="/logo-shield.png"
            alt="INSURE Logo"
            className="w-16 h-16 object-contain mx-auto mb-3 drop-shadow-xs"
          />
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Verify Recovery Code</h1>
          <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-1">
            Single-Use Password Reset Challenge
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mb-3">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <p className="text-xs text-slate-500">
              Enter the 6-digit password reset code sent to:
            </p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">
              {email || 'your email'}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <label className="block text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                6-Digit Recovery Code
              </label>
              <div className="flex justify-center gap-2 sm:gap-3">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(idx, e.target.value)}
                    onKeyDown={e => handleKeyDown(idx, e)}
                    className="w-11 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-slate-50 focus:bg-white"
                  />
                ))}
              </div>
            </div>

            <button
              id="verify-reset-code-submit-btn"
              type="submit"
              disabled={submitting || otpDigits.join('').length !== 6}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all text-sm cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Validating Code...</span>
                </>
              ) : (
                <>
                  <span>Authorize Password Reset</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-slate-600">
              ← Request a different code
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
