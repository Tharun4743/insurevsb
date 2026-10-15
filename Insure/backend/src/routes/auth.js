/**
 * INSURE — Authentication Routes
 *
 * Provides endpoints for:
 *  - POST /api/auth/signup
 *  - POST /api/auth/verify-signup-otp
 *  - POST /api/auth/resend-signup-otp
 *  - POST /api/auth/login
 *  - POST /api/auth/logout
 *  - GET  /api/auth/me
 *  - POST /api/auth/forgot-password
 *  - POST /api/auth/verify-reset-otp
 *  - POST /api/auth/reset-password
 *  - GET  /api/auth/smtp-health
 */

'use strict';

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const {
  signup,
  verifySignupOtp,
  resendSignupOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getMe,
} = require('../services/authService');
const { verifySmtpConnection } = require('../services/emailService');

const router = express.Router();

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 25, // 25 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification code attempts. Please wait 15 minutes.' },
});

// ── Schemas ───────────────────────────────────────────────────────────────────
const PasswordValidation = z
  .string()
  .min(8, 'Password must be at least 8 characters long.')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.');

const SignupSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.'),
  email: z.string().trim().email('Invalid email address format.').toLowerCase(),
  password: PasswordValidation,
  confirmPassword: z.string(),
  privacyTermsAcknowledged: z.boolean().refine(val => val === true, {
    message: 'You must acknowledge the Privacy Policy and Service Terms to register.',
  }),
  telematicsConsent: z.boolean().optional().default(true),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

const VerifyOtpSchema = z.object({
  email: z.string().trim().email('Invalid email address format.').toLowerCase(),
  otp: z.string().trim().regex(/^\d{6}$/, 'Verification code must be exactly 6 digits.'),
});

const ResendOtpSchema = z.object({
  email: z.string().trim().email('Invalid email address format.').toLowerCase(),
});

const LoginSchema = z.object({
  email: z.string().trim().email('Invalid email address format.').toLowerCase(),
  password: z.string().min(1, 'Password is required.'),
});

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address format.').toLowerCase(),
});

const ResetPasswordSchema = z.object({
  resetToken: z.string().trim().min(10, 'Invalid or missing password reset token.'),
  newPassword: PasswordValidation,
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

// ── 1. POST /api/auth/signup ──────────────────────────────────────────────────
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const parsed = SignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const result = await signup(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ── 2. POST /api/auth/verify-signup-otp ───────────────────────────────────────
router.post('/verify-signup-otp', otpLimiter, async (req, res, next) => {
  try {
    const parsed = VerifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const result = await verifySignupOtp(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ── 3. POST /api/auth/resend-signup-otp ───────────────────────────────────────
router.post('/resend-signup-otp', otpLimiter, async (req, res, next) => {
  try {
    const parsed = ResendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const result = await resendSignupOtp(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ── 4. POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const result = await login(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    if (err.requiresVerification) {
      return res.status(403).json({
        error: err.message,
        requiresVerification: true,
        email: err.email,
        maskedEmail: err.maskedEmail,
      });
    }
    next(err);
  }
});

// ── 5. POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.status(200).json({ message: 'Logged out successfully.' });
});

// ── 6. GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getMe(req.userId);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

// ── 7. POST /api/auth/forgot-password ─────────────────────────────────────────
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const parsed = ForgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const result = await forgotPassword(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ── 8. POST /api/auth/verify-reset-otp ────────────────────────────────────────
router.post('/verify-reset-otp', otpLimiter, async (req, res, next) => {
  try {
    const parsed = VerifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const result = await verifyResetOtp(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ── 9. POST /api/auth/reset-password ──────────────────────────────────────────
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const parsed = ResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const result = await resetPassword(parsed.data);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ── 10. GET /api/auth/smtp-health ─────────────────────────────────────────────
router.get('/smtp-health', async (req, res) => {
  const status = await verifySmtpConnection();
  res.status(status.connected ? 200 : 503).json(status);
});

// ── 11. GET /api/auth/accounts (Live Supabase Accounts for Role Selector) ─────
router.get('/accounts', async (req, res, next) => {
  try {
    const { getClient } = require('../db/client');
    const db = getClient();
    const { data: users, error } = await db
      .from('users')
      .select('id, email, full_name, role, status')
      .eq('status', 'active');

    if (error) return next(createError(500, error.message));

    // Return the prioritized distinct accounts per role
    const activeAccounts = users || [];
    res.json({ accounts: activeAccounts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
