/**
 * INSURE — Authentication & Access Control Service
 *
 * Implements:
 *  - Secure customer registration with SHA-256 hashed 6-digit OTPs
 *  - Email verification workflow via Brevo SMTP
 *  - Resend OTP with 60-second cooldown and 10-minute expiry
 *  - Credential verification with bcrypt password hashing
 *  - Generic password reset workflow with single-use authorization tokens
 *  - Strict role assignment (public signup is always 'customer')
 *  - Audit event logging for all authentication actions
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AuthPayload, UserRole } from '../types/auth';

const { getClient } = require('../db/client');
const { logAuditEvent } = require('./auditService');
const {
  sendSignupVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} = require('./emailService');

export const JWT_SECRET = process.env.JWT_SECRET || 'insure-secure-jwt-production-secret-token-key-2026';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const OTP_SALT = process.env.OTP_SALT || 'insure-otp-salt-production';

let lastGeneratedOtpForTesting: Record<string, string> = {};

export function authError(status: number, message: string, extra: any = {}): Error {
  const err: any = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) {
    return `${user[0]}*@${domain}`;
  }
  const maskedUser = user[0] + '*'.repeat(Math.max(1, user.length - 2)) + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

export function generateSixDigitOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp + OTP_SALT).digest('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token + JWT_SECRET).digest('hex');
}

export function signToken(user: any): string {
  return jwt.sign(
    {
      userId: user.id || user.userId,
      email: user.email,
      role: user.role || 'customer',
      fullName: user.full_name || user.fullName || 'Driver',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as any
  );
}

export const generateToken = signToken;

export async function signup({ fullName, email, password, telematicsConsent = true }: any): Promise<any> {
  const db = getClient();
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const { data: existingUsers } = await db
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .limit(1);

  const existingUser = existingUsers?.[0];

  if (existingUser && existingUser.is_email_verified) {
    throw new Error('An account with this email address already exists. Please sign in or reset your password.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    await db.from('users').update({
      full_name: fullName.trim(),
      password_hash: passwordHash,
      status: 'pending_verification',
      updated_at: now.toISOString(),
    }).eq('id', userId);
  } else {
    userId = uuidv4();
    const newUser = {
      id: userId,
      email: normalizedEmail,
      full_name: fullName.trim(),
      password_hash: passwordHash,
      role: 'customer',
      status: 'pending_verification',
      is_email_verified: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    const { error: insertErr } = await db.from('users').insert(newUser);
    if (insertErr) throw new Error(`Could not create user: ${insertErr.message}`);
  }

  if (telematicsConsent) {
    const consentRecord = {
      id: uuidv4(),
      user_id: userId,
      purpose: 'telematics_processing',
      version: 'v2.0',
      status: 'granted',
      granted_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    await db.from('consents').insert(consentRecord);
  }

  await db.from('otp_challenges').update({
    used_at: now.toISOString(),
  }).eq('email', normalizedEmail).eq('purpose', 'SIGNUP_VERIFICATION');

  const otp = generateSixDigitOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const resendAvailableAt = new Date(now.getTime() + 60 * 1000);

  const challenge = {
    id: uuidv4(),
    user_id: userId,
    email: normalizedEmail,
    purpose: 'SIGNUP_VERIFICATION',
    otp_hash: otpHash,
    expires_at: expiresAt.toISOString(),
    attempt_count: 0,
    max_attempts: 5,
    resend_available_at: resendAvailableAt.toISOString(),
    created_at: now.toISOString(),
  };

  await db.from('otp_challenges').insert(challenge);

  if (process.env.NODE_ENV === 'test') {
    lastGeneratedOtpForTesting[normalizedEmail] = otp;
  }

  try {
    await sendSignupVerificationEmail(normalizedEmail, fullName, otp);
  } catch (emailErr: any) {
    console.error('[AUTH] Failed to send signup verification email:', emailErr.message);
    throw new Error(`Account created, but verification email could not be sent: ${emailErr.message}`);
  }

  await logAuditEvent(userId, 'user_signup_initiated', { email: normalizedEmail, role: 'customer' });

  return {
    message: 'Verification code sent to your email address.',
    email: normalizedEmail,
    maskedEmail: maskEmail(normalizedEmail),
    expiresInMinutes: 10,
    resendCooldownSeconds: 60,
  };
}

export async function verifySignupOtp({ email, otp }: any): Promise<any> {
  const db = getClient();
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const { data: challenges } = await db
    .from('otp_challenges')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('purpose', 'SIGNUP_VERIFICATION')
    .order('created_at', { ascending: false })
    .limit(1);

  const challenge = challenges?.[0];

  if (!challenge || challenge.used_at) {
    throw new Error('No active verification code found for this email. Please request a new code.');
  }

  if (new Date(challenge.expires_at) < now) {
    throw new Error('Verification code has expired. Please request a new code.');
  }

  if (challenge.attempt_count >= challenge.max_attempts) {
    throw new Error('Maximum verification attempts exceeded. Please request a new code.');
  }

  const incomingHash = hashOtp(otp.trim());
  if (incomingHash !== challenge.otp_hash) {
    const updatedAttempts = challenge.attempt_count + 1;
    await db.from('otp_challenges').update({
      attempt_count: updatedAttempts,
    }).eq('id', challenge.id);

    const remaining = Math.max(0, challenge.max_attempts - updatedAttempts);
    throw new Error(`Incorrect verification code. ${remaining} attempts remaining.`);
  }

  await db.from('otp_challenges').update({
    used_at: now.toISOString(),
  }).eq('id', challenge.id);

  const { data: users } = await db
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .limit(1);

  const user = users?.[0];
  if (!user) throw new Error('User record not found.');

  await db.from('users').update({
    is_email_verified: true,
    email_verified_at: now.toISOString(),
    status: 'active',
    updated_at: now.toISOString(),
  }).eq('id', user.id);

  await logAuditEvent(user.id, 'user_email_verified', { email: normalizedEmail });

  const activeUser = { ...user, is_email_verified: true, status: 'active' };
  const token = signToken(activeUser);

  return {
    message: 'Email verified successfully. Welcome to INSURE!',
    token,
    user: {
      id: activeUser.id,
      email: activeUser.email,
      fullName: activeUser.full_name,
      role: activeUser.role,
      status: activeUser.status,
    },
  };
}

export async function resendSignupOtp({ email }: any): Promise<any> {
  const db = getClient();
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const { data: users } = await db
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .limit(1);

  const user = users?.[0];
  if (!user) {
    throw new Error('Account not found. Please sign up first.');
  }

  if (user.is_email_verified) {
    throw new Error('This account is already verified. Please log in.');
  }

  const { data: challenges } = await db
    .from('otp_challenges')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('purpose', 'SIGNUP_VERIFICATION')
    .order('created_at', { ascending: false })
    .limit(1);

  const latest = challenges?.[0];
  if (latest && new Date(latest.resend_available_at) > now) {
    const waitSeconds = Math.ceil((new Date(latest.resend_available_at).getTime() - now.getTime()) / 1000);
    throw new Error(`Please wait ${waitSeconds} seconds before requesting a new code.`);
  }

  await db.from('otp_challenges').update({
    used_at: now.toISOString(),
  }).eq('email', normalizedEmail).eq('purpose', 'SIGNUP_VERIFICATION');

  const otp = generateSixDigitOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const resendAvailableAt = new Date(now.getTime() + 60 * 1000);

  const newChallenge = {
    id: uuidv4(),
    user_id: user.id,
    email: normalizedEmail,
    purpose: 'SIGNUP_VERIFICATION',
    otp_hash: otpHash,
    expires_at: expiresAt.toISOString(),
    attempt_count: 0,
    max_attempts: 5,
    resend_available_at: resendAvailableAt.toISOString(),
    created_at: now.toISOString(),
  };

  await db.from('otp_challenges').insert(newChallenge);

  if (process.env.NODE_ENV === 'test') {
    lastGeneratedOtpForTesting[normalizedEmail] = otp;
  }

  await sendSignupVerificationEmail(normalizedEmail, user.full_name, otp);
  await logAuditEvent(user.id, 'otp_resend_requested', { purpose: 'SIGNUP_VERIFICATION' });

  return {
    message: 'A new verification code has been sent.',
    email: normalizedEmail,
    maskedEmail: maskEmail(normalizedEmail),
    resendCooldownSeconds: 60,
  };
}

export async function login({ email, password }: any): Promise<any> {
  const db = getClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: users } = await db
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .limit(1);

  const user = users?.[0];

  if (!user || !user.password_hash) {
    await bcrypt.compare(password, '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890123456789012345678');
    throw new Error('Invalid email or password.');
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password.');
  }

  if (!user.is_email_verified || user.status === 'pending_verification') {
    const error: any = new Error('Please verify your email address before logging in.');
    error.status = 403;
    error.requiresVerification = true;
    error.email = user.email;
    error.maskedEmail = maskEmail(user.email);
    throw error;
  }

  if (user.status === 'suspended') {
    const error: any = new Error('Your account has been suspended. Please contact support.');
    error.status = 403;
    throw error;
  }

  await logAuditEvent(user.id, 'user_login_success', { role: user.role });

  const token = signToken(user);

  return {
    message: 'Login successful.',
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      status: user.status,
    },
  };
}

export async function forgotPassword({ email }: any): Promise<any> {
  const db = getClient();
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const genericResponse = {
    message: 'If an active account exists for that email address, a password reset code has been sent.',
    email: normalizedEmail,
    maskedEmail: maskEmail(normalizedEmail),
  };

  const { data: users } = await db
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .limit(1);

  const user = users?.[0];

  if (!user || !user.is_email_verified || user.status !== 'active') {
    return genericResponse;
  }

  const { data: challenges } = await db
    .from('otp_challenges')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('purpose', 'PASSWORD_RESET')
    .order('created_at', { ascending: false })
    .limit(1);

  const latest = challenges?.[0];
  if (latest && new Date(latest.resend_available_at) > now) {
    return genericResponse;
  }

  await db.from('otp_challenges').update({
    used_at: now.toISOString(),
  }).eq('email', normalizedEmail).eq('purpose', 'PASSWORD_RESET');

  const otp = generateSixDigitOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const resendAvailableAt = new Date(now.getTime() + 60 * 1000);

  const challenge = {
    id: uuidv4(),
    user_id: user.id,
    email: normalizedEmail,
    purpose: 'PASSWORD_RESET',
    otp_hash: otpHash,
    expires_at: expiresAt.toISOString(),
    attempt_count: 0,
    max_attempts: 5,
    resend_available_at: resendAvailableAt.toISOString(),
    created_at: now.toISOString(),
  };

  await db.from('otp_challenges').insert(challenge);

  if (process.env.NODE_ENV === 'test') {
    lastGeneratedOtpForTesting[normalizedEmail] = otp;
  }

  try {
    await sendPasswordResetEmail(normalizedEmail, user.full_name, otp);
  } catch (err: any) {
    console.error('[AUTH] Failed delivering password reset email:', err.message);
  }

  await logAuditEvent(user.id, 'password_reset_requested', { email: normalizedEmail });

  return genericResponse;
}

export async function verifyResetOtp({ email, otp }: any): Promise<any> {
  const db = getClient();
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const { data: challenges } = await db
    .from('otp_challenges')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('purpose', 'PASSWORD_RESET')
    .order('created_at', { ascending: false })
    .limit(1);

  const challenge = challenges?.[0];

  if (!challenge || challenge.used_at) {
    throw new Error('Invalid or expired password reset code. Please request a new code.');
  }

  if (new Date(challenge.expires_at) < now) {
    throw new Error('Password reset code has expired. Please request a new code.');
  }

  if (challenge.attempt_count >= challenge.max_attempts) {
    throw new Error('Too many incorrect attempts. Please request a new reset code.');
  }

  const incomingHash = hashOtp(otp.trim());
  if (incomingHash !== challenge.otp_hash) {
    const updatedAttempts = challenge.attempt_count + 1;
    await db.from('otp_challenges').update({
      attempt_count: updatedAttempts,
    }).eq('id', challenge.id);

    const remaining = Math.max(0, challenge.max_attempts - updatedAttempts);
    throw new Error(`Incorrect password reset code. ${remaining} attempts remaining.`);
  }

  await db.from('otp_challenges').update({
    used_at: now.toISOString(),
  }).eq('id', challenge.id);

  const rawResetToken = crypto.randomBytes(32).toString('hex');
  const tokenDigest = hashToken(rawResetToken);
  const authExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  const authRecord = {
    id: uuidv4(),
    user_id: challenge.user_id,
    email: normalizedEmail,
    token_hash: tokenDigest,
    expires_at: authExpiresAt.toISOString(),
    created_at: now.toISOString(),
  };

  await db.from('password_reset_authorizations').insert(authRecord);
  await logAuditEvent(challenge.user_id, 'password_reset_otp_verified', { email: normalizedEmail });

  return {
    message: 'Reset code verified successfully. Please enter your new password.',
    resetToken: rawResetToken,
    expiresInMinutes: 15,
  };
}

export async function resetPassword({ resetToken, newPassword }: any): Promise<any> {
  const db = getClient();
  const now = new Date();
  const tokenDigest = hashToken(resetToken);

  const { data: authRecords } = await db
    .from('password_reset_authorizations')
    .select('*')
    .eq('token_hash', tokenDigest)
    .limit(1);

  const authRecord = authRecords?.[0];

  if (!authRecord || authRecord.consumed_at) {
    throw new Error('Invalid or already consumed password reset authorization. Please request a new reset code.');
  }

  if (new Date(authRecord.expires_at) < now) {
    throw new Error('Password reset session has expired. Please request a new code.');
  }

  await db.from('password_reset_authorizations').update({
    consumed_at: now.toISOString(),
  }).eq('id', authRecord.id);

  await db.from('password_reset_authorizations').update({
    consumed_at: now.toISOString(),
  }).eq('user_id', authRecord.user_id);

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await db.from('users').update({
    password_hash: newPasswordHash,
    updated_at: now.toISOString(),
  }).eq('id', authRecord.user_id);

  const { data: users } = await db.from('users').select('*').eq('id', authRecord.user_id).limit(1);
  const user = users?.[0];

  if (user) {
    try {
      await sendPasswordChangedEmail(user.email, user.full_name);
    } catch (emailErr: any) {
      console.warn('[AUTH] Could not send password changed notification:', emailErr.message);
    }
  }

  await logAuditEvent(authRecord.user_id, 'password_reset_completed', { email: authRecord.email });

  return {
    message: 'Your password has been changed successfully. Please log in with your new password.',
  };
}

export async function getMe(userId: string): Promise<any> {
  const db = getClient();
  const { data: users } = await db.from('users').select('*').eq('id', userId).limit(1);
  const user = users?.[0];

  if (!user) {
    throw new Error('User account not found.');
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name || 'Driver',
    role: user.role || 'customer',
    status: user.status || 'active',
    isEmailVerified: Boolean(user.is_email_verified),
    createdAt: user.created_at,
  };
}

export function getLastGeneratedOtpForTesting(email: string): string | undefined {
  return lastGeneratedOtpForTesting[email.trim().toLowerCase()];
}
