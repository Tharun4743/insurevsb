/**
 * INSURE — Authentication Routes
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import {
  signup,
  verifySignupOtp,
  resendSignupOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getMe,
} from '../services/authService';
import { verifySmtpConnection } from '../services/emailService';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' } as any,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification code attempts. Please wait 15 minutes.' } as any,
});

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

router.post('/signup', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

router.post('/verify-signup-otp', otpLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

router.post('/resend-signup-otp', otpLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const result = await login(parsed.data);
    res.status(200).json(result);
  } catch (err: any) {
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

router.post('/logout', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Logged out successfully.' });
});

router.get('/me', requireAuth, async (req: any, res: Response, next: NextFunction) => {
  try {
    const user = await getMe(req.userId);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

router.post('/verify-reset-otp', otpLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

router.post('/reset-password', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

router.get('/smtp-health', async (req: Request, res: Response) => {
  const status = await verifySmtpConnection();
  res.status(status.connected ? 200 : 503).json(status);
});

router.get('/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { getClient } = require('../db/client');
    const db = getClient();
    const { data: users, error } = await db
      .from('users')
      .select('id, email, full_name, role, status')
      .eq('status', 'active');

    if (error) return next(createError(500, error.message));

    const activeAccounts = users || [];
    res.json({ accounts: activeAccounts });
  } catch (err) {
    next(err);
  }
});

export default router;
