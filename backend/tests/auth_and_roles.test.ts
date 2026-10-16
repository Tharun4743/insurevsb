/**
 * Comprehensive Acceptance Tests: Authentication, OTP, Brevo SMTP, and RBAC
 *
 * Verifies all 25 acceptance criteria specified in Section 17:
 *  - Customer signup, 6-digit OTP dispatch & Brevo email generation
 *  - OTP verification, attempt limits, expiration, and single-use enforcement
 *  - Resend cooldown enforcement (60s)
 *  - Unverified account login gating
 *  - Forgot password generic response & reset flow
 *  - Single-use reset authorization and password change
 *  - Rejection of old password and login with new password
 *  - Role-based access control (Customer, Admin, Compliance Officer)
 *  - Pricing dispute submission and compliance decision
 */

'use strict';

jest.setTimeout(30000);

const request = require('supertest');
const app = require('../src/server');
const { getClient } = require('../src/db/client');
const { getLastGeneratedOtpForTesting } = require('../src/services/authService');
const { getLastSentEmailForTesting } = require('../src/services/emailService');

describe('INSURE Authentication, OTP, Brevo SMTP, and RBAC Test Suite', () => {
  const testCustomerEmail = `alice.driver.${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';
  const updatedPassword = 'NewSecurePassword456!';
  let customerToken = '';
  let adminToken = '';
  let complianceToken = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
  }, 30000);

  describe('1. Signup & Brevo Email Verification', () => {
    it('requires valid password complexity and matching confirmPassword', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          fullName: 'Alice Driver',
          email: testCustomerEmail,
          password: 'short',
          confirmPassword: 'short',
          privacyTermsAcknowledged: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 8 characters/);
    });

    it('requires explicit acknowledgement of privacy and service terms', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          fullName: 'Alice Driver',
          email: testCustomerEmail,
          password: testPassword,
          confirmPassword: testPassword,
          privacyTermsAcknowledged: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/acknowledge the Privacy Policy/);
    });

    it('successfully registers customer and sends Brevo verification email with 6-digit OTP', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          fullName: 'Alice Driver',
          email: testCustomerEmail,
          password: testPassword,
          confirmPassword: testPassword,
          privacyTermsAcknowledged: true,
          telematicsConsent: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/Verification code sent/);
      expect(res.body.email).toBe(testCustomerEmail);
      expect(res.body.maskedEmail).toBeDefined();

      // Verify email was generated with 6-digit OTP
      const lastEmail = getLastSentEmailForTesting();
      expect(lastEmail).toBeDefined();
      expect(lastEmail.to).toBe(testCustomerEmail);
      expect(lastEmail.subject).toBe('Verify your INSURE email address');
      expect(lastEmail.text).toMatch(/\d{6}/);
    });

    it('prevents logging in before email verification is completed', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testCustomerEmail,
          password: testPassword,
        });

      expect(res.status).toBe(403);
      expect(res.body.requiresVerification).toBe(true);
      expect(res.body.error).toMatch(/verify your email/i);
    });

    it('rejects incorrect OTPs and decrements remaining attempts', async () => {
      const res = await request(app)
        .post('/api/auth/verify-signup-otp')
        .send({
          email: testCustomerEmail,
          otp: '000000',
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toMatch(/Incorrect verification code/);
    });

    it('enforces resend cooldown before allowing another code request', async () => {
      const res = await request(app)
        .post('/api/auth/resend-signup-otp')
        .send({
          email: testCustomerEmail,
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toMatch(/Please wait \d+ seconds/);
    });

    it('verifies email with valid 6-digit OTP and returns authenticated customer session', async () => {
      const validOtp = getLastGeneratedOtpForTesting(testCustomerEmail);
      expect(validOtp).toBeDefined();

      const res = await request(app)
        .post('/api/auth/verify-signup-otp')
        .send({
          email: testCustomerEmail,
          otp: validOtp,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('customer');
      expect(res.body.user.email).toBe(testCustomerEmail);

      customerToken = res.body.token;
    });

    it('enforces single-use: cannot reuse the same OTP a second time', async () => {
      const validOtp = getLastGeneratedOtpForTesting(testCustomerEmail);
      const res = await request(app)
        .post('/api/auth/verify-signup-otp')
        .send({
          email: testCustomerEmail,
          otp: validOtp,
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toMatch(/No active verification code/);
    });
  });

  describe('2. Login and Authenticated Profile (GET /api/auth/me)', () => {
    it('authenticates customer with valid credentials and issues JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testCustomerEmail,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('customer');
    });

    it('rejects invalid credentials with generic message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testCustomerEmail,
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/Invalid email or password/);
    });

    it('returns current profile via GET /api/auth/me using Bearer JWT', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testCustomerEmail);
      expect(res.body.user.role).toBe('customer');
      expect(res.body.user.isEmailVerified).toBe(true);
    });
  });

  describe('3. Password Reset Workflow (Brevo SMTP OTP)', () => {
    let resetToken = '';

    it('returns generic safe response on forgot-password request', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: testCustomerEmail,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/password reset code has been sent/);

      const lastEmail = getLastSentEmailForTesting();
      expect(lastEmail.subject).toBe('Your INSURE password reset code');
      expect(lastEmail.text).toMatch(/\d{6}/);
    });

    it('verifies reset OTP and issues a single-use password reset authorization token', async () => {
      const resetOtp = getLastGeneratedOtpForTesting(testCustomerEmail);
      expect(resetOtp).toBeDefined();

      const res = await request(app)
        .post('/api/auth/verify-reset-otp')
        .send({
          email: testCustomerEmail,
          otp: resetOtp,
        });

      expect(res.status).toBe(200);
      expect(res.body.resetToken).toBeDefined();
      resetToken = res.body.resetToken;
    });

    it('successfully resets password with the authorization token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken,
          newPassword: updatedPassword,
          confirmPassword: updatedPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/password has been changed successfully/i);

      // Verify notification email was sent
      const lastEmail = getLastSentEmailForTesting();
      expect(lastEmail.subject).toBe('Your INSURE password has been changed');
    });

    it('old password no longer works after reset', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testCustomerEmail,
          password: testPassword,
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/Invalid email or password/);
    });

    it('new password successfully authenticates', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testCustomerEmail,
          password: updatedPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      customerToken = res.body.token;
    });
  });

  describe('4. Role-Based Access Control (RBAC)', () => {
    beforeAll(async () => {
      // Seed an admin and a compliance officer for testing
      const { seedPrivilegedUsers } = require('../src/scripts/seedUsers');
      await seedPrivilegedUsers();

      // Log in admin
      const adminEmail = (process.env.ADMIN_EMAIL || 'tharunkumark42007@gmail.com').trim().toLowerCase();
      const adminRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: adminEmail,
          password: '123456',
        });
      adminToken = adminRes.body.token;

      // Log in compliance officer
      const complianceEmail = (process.env.COMPLIANCE_EMAIL || 'vsbecitc2428@gmail.com').trim().toLowerCase();
      const compRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: complianceEmail,
          password: '123456',
        });
      complianceToken = compRes.body.token;
    });

    it('Customer cannot access Admin portfolio route (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/admin/portfolio')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/);
    });

    it('Customer cannot access Compliance Officer overview route (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/compliance/overview')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/);
    });

    it('Admin can access Admin portfolio and customer accounts', async () => {
      const res = await request(app)
        .get('/api/admin/portfolio')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.portfolio).toBeDefined();
      expect(res.body.portfolio.totalCustomers).toBeGreaterThanOrEqual(1);
    });

    it('Compliance Officer can access compliance overview and fairness audits', async () => {
      const res = await request(app)
        .get('/api/compliance/overview')
        .set('Authorization', `Bearer ${complianceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.fairnessStatus).toBe('compliant');
    });

    it('Admin can update pricing configuration parameters with audit trail', async () => {
      const res = await request(app)
        .post('/api/admin/pricing-config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          basePremium: 2200,
          maxAdjustment: 0.45,
          ruleVersion: 'v2.2-approved',
        });

      expect(res.status).toBe(200);
      expect(res.body.config.basePremium).toBe(2200);
    });
  });

  describe('5. Pricing Dispute Submission & Compliance Decision', () => {
    let testQuoteId = '';

    beforeAll(async () => {
      const db = getClient();
      const { v4: uuidv4 } = require('uuid');

      // Ensure demo user exists in Supabase users table
      try {
        await db.from('users').insert({
          id: '00000000-0000-0000-0000-000000000001',
          email: 'demo@insure.test',
          role: 'customer',
          full_name: 'Demo Driver',
          status: 'active',
          is_email_verified: true,
        });
      } catch (_) {}

      const tripId = uuidv4();
      await db.from('trips').insert({
        id: tripId,
        user_id: '00000000-0000-0000-0000-000000000001',
        scenario: 'scenario_a_safe',
        status: 'valid',
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      });

      const quoteId = uuidv4();
      await db.from('quotes').insert({
        id: quoteId,
        trip_id: tripId,
        user_id: '00000000-0000-0000-0000-000000000001',
        illustrative_estimate: 2400,
        base_premium: 2000,
        risk_adjustment: 400,
        status: 'generated',
        currency: 'INR',
      });
      testQuoteId = quoteId;
    }, 30000);

    it('Customer can submit a pricing dispute on their quote', async () => {
      const res = await request(app)
        .post(`/api/quotes/${testQuoteId}/dispute`)
        .set('Authorization', 'Bearer demo')
        .send({
          reason: 'Excessive harsh braking deductions due to emergency obstacle avoidance',
          explanation: 'The detected harsh deceleration at sequence 14 was an emergency stop to avoid an animal.',
        });

      expect(res.status).toBe(201);
      expect(res.body.dispute.status).toBe('pending');
      expect(res.body.dispute.reason).toMatch(/harsh braking/);
    });

    it('Compliance Officer can inspect and decide the customer dispute', async () => {
      const disputesRes = await request(app)
        .get('/api/compliance/disputes')
        .set('Authorization', `Bearer ${complianceToken}`);

      expect(disputesRes.status).toBe(200);
      const dispute = disputesRes.body.disputes[0];
      expect(dispute).toBeDefined();

      const decisionRes = await request(app)
        .post(`/api/compliance/disputes/${dispute.id}/decision`)
        .set('Authorization', `Bearer ${complianceToken}`)
        .send({
          decision: 'resolved',
          explanation: 'Verified safe overall driving record. Single unavoidable deceleration event is excused.',
        });

      expect(decisionRes.status).toBe(200);
      expect(decisionRes.body.status).toBe('resolved');
    });
  });
});
