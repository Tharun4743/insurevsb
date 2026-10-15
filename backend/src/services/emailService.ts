/**
 * INSURE — Brevo SMTP Email Service
 *
 * Provides production-ready email delivery via Brevo SMTP (smtp-relay.brevo.com:587)
 * with STARTTLS, responsive HTML email templates, plain-text alternatives,
 * safe connection diagnostics, and strict error handling.
 */

import nodemailer from 'nodemailer';

let transporter: any = null;
let lastSentEmailForTesting: any = null;

export function getTransporter(): any {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10) || 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const isConfigured = Boolean(
    user &&
    pass &&
    user !== 'YOUR_BREVO_SMTP_LOGIN' &&
    pass !== 'YOUR_BREVO_SMTP_KEY'
  );

  if (!isConfigured) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[EMAIL] Brevo SMTP credentials not set. Email delivery will simulate or fail safely.');
    }
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: isConfigured ? { user, pass } : undefined,
    tls: {
      rejectUnauthorized: true,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  } as any);

  return transporter;
}

export async function verifySmtpConnection(): Promise<any> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const isConfigured = Boolean(
    user &&
    pass &&
    user !== 'YOUR_BREVO_SMTP_LOGIN' &&
    pass !== 'YOUR_BREVO_SMTP_KEY'
  );

  if (!isConfigured) {
    return {
      configured: false,
      connected: false,
      message: 'SMTP credentials (SMTP_USER / SMTP_PASS) are not configured in environment variables.',
    };
  }

  try {
    const t = getTransporter();
    await t.verify();
    return {
      configured: true,
      connected: true,
      host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
      message: 'Brevo SMTP connection verified successfully.',
    };
  } catch (err: any) {
    console.error('[EMAIL] Brevo SMTP verification failed:', err.message);
    return {
      configured: true,
      connected: false,
      message: `Brevo SMTP connection failed: ${err.message}`,
    };
  }
}

export function getFromHeader(): string {
  const email = process.env.SMTP_FROM_EMAIL || 'no-reply@insure-telematics.com';
  const name = process.env.SMTP_FROM_NAME || 'INSURE';
  return `"${name}" <${email}>`;
}

export function renderEmailLayout({ title, previewText, contentHtml }: { title: string; previewText: string; contentHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0B132B; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E0E7FF; }
    .container { max-width: 600px; margin: 40px auto; background: #1C2541; border: 1px solid #3A506B; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
    .header { background: linear-gradient(135deg, #0B132B 0%, #1C2541 100%); padding: 32px 40px; text-align: center; border-bottom: 1px solid #3A506B; }
    .logo { font-size: 26px; font-weight: 800; color: #48E5C2; letter-spacing: 2px; text-decoration: none; }
    .subtitle { font-size: 13px; color: #8D99AE; margin-top: 6px; letter-spacing: 0.5px; }
    .content { padding: 40px; }
    .otp-card { background: #0B132B; border: 1px dashed #48E5C2; border-radius: 8px; padding: 20px; text-align: center; margin: 28px 0; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 700; color: #48E5C2; letter-spacing: 8px; margin: 0; }
    .expiry { font-size: 13px; color: #F26419; margin-top: 8px; }
    .notice { font-size: 13px; line-height: 1.6; color: #8D99AE; border-top: 1px solid #3A506B; padding-top: 20px; margin-top: 30px; }
    .footer { background: #0B132B; padding: 24px 40px; text-align: center; font-size: 12px; color: #5C677D; }
    .footer a { color: #48E5C2; text-decoration: none; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText}
  </div>
  <div class="container">
    <div class="header">
      <div class="logo">INSURE</div>
      <div class="subtitle">Smarter Driving. Fairer Insurance.</div>
    </div>
    <div class="content">
      ${contentHtml}
      <div class="notice">
        <strong>Security Notice:</strong> INSURE team members will never ask for your verification code or password. If you did not initiate this request, you can safely ignore this email.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} INSURE Telematics Platform. Privacy-first, behavior-based vehicle insurance.<br>
      Automated transactional notification. Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>`;
}

export async function sendSignupVerificationEmail(email: string, fullName: string, otp: string): Promise<any> {
  const firstName = fullName ? fullName.split(' ')[0] : 'Driver';
  const subject = 'Verify your INSURE email address';
  const previewText = `Your INSURE email verification code is ${otp}. Valid for 10 minutes.`;

  const contentHtml = `
    <h2 style="margin-top:0; color:#FFFFFF; font-size:22px;">Welcome to INSURE, ${firstName}!</h2>
    <p style="color:#C5D1EB; font-size:15px; line-height:1.6;">
      Thank you for creating an account. To complete your registration and activate your policyholder profile, please verify your email address using the one-time verification code below:
    </p>
    <div class="otp-card">
      <div class="otp-code">${otp}</div>
      <div class="expiry">Expires in 10 minutes (One-Time Use)</div>
    </div>
    <p style="color:#C5D1EB; font-size:14px; line-height:1.6;">
      Enter this 6-digit code on the verification screen to activate your secure telematics dashboard.
    </p>
  `;

  const text = `Welcome to INSURE, ${firstName}!\n\nYour 6-digit verification code is: ${otp}\n\nThis code will expire in 10 minutes. Please enter it on the verification screen to activate your account.\n\nSecurity Notice: Never share this code with anyone. INSURE representatives will never ask for your verification code.`;

  return deliverEmail({ to: email, subject, html: renderEmailLayout({ title: subject, previewText, contentHtml }), text });
}

export async function sendPasswordResetEmail(email: string, fullName: string, otp: string): Promise<any> {
  const firstName = fullName ? fullName.split(' ')[0] : 'Driver';
  const subject = 'Your INSURE password reset code';
  const previewText = `Your INSURE password reset code is ${otp}. Valid for 10 minutes.`;

  const contentHtml = `
    <h2 style="margin-top:0; color:#FFFFFF; font-size:22px;">Password Reset Request</h2>
    <p style="color:#C5D1EB; font-size:15px; line-height:1.6;">
      Hello ${firstName}, we received a request to reset the password for your INSURE account. Use the one-time authorization code below to verify your identity:
    </p>
    <div class="otp-card">
      <div class="otp-code">${otp}</div>
      <div class="expiry">Expires in 10 minutes (One-Time Use)</div>
    </div>
    <p style="color:#C5D1EB; font-size:14px; line-height:1.6;">
      If you did not request a password reset, please ensure your account credentials remain secure. No changes have been made to your account.
    </p>
  `;

  const text = `Hello ${firstName},\n\nWe received a request to reset the password for your INSURE account.\n\nYour 6-digit password reset code is: ${otp}\n\nThis code is valid for 10 minutes.\n\nIf you did not request this reset, you can safely disregard this message. Your password has not been changed.`;

  return deliverEmail({ to: email, subject, html: renderEmailLayout({ title: subject, previewText, contentHtml }), text });
}

export async function sendPasswordChangedEmail(email: string, fullName: string): Promise<any> {
  const firstName = fullName ? fullName.split(' ')[0] : 'Driver';
  const subject = 'Your INSURE password has been changed';
  const eventTime = new Date().toUTCString();
  const previewText = `Your INSURE account password was successfully updated on ${eventTime}.`;

  const contentHtml = `
    <h2 style="margin-top:0; color:#FFFFFF; font-size:22px;">Password Updated Successfully</h2>
    <p style="color:#C5D1EB; font-size:15px; line-height:1.6;">
      Hello ${firstName}, this email confirms that your INSURE account password was successfully updated on <strong>${eventTime}</strong>.
    </p>
    <p style="color:#C5D1EB; font-size:14px; line-height:1.6;">
      All previous password reset sessions have been cleared. You can now log in using your new credentials.
    </p>
    <div style="background:#2A1B1B; border-left:4px solid #F26419; padding:12px 16px; border-radius:4px; margin:20px 0;">
      <p style="color:#F9A03F; font-size:13px; margin:0;">
        <strong>Did not make this change?</strong> If you did not update your password, please contact our security team immediately to protect your telematics profile and quotes.
      </p>
    </div>
  `;

  const text = `Hello ${firstName},\n\nThis email confirms that your INSURE account password was successfully updated on ${eventTime}.\n\nIf you did not make this change, please contact our support team immediately.\n\nINSURE Telematics Platform`;

  return deliverEmail({ to: email, subject, html: renderEmailLayout({ title: subject, previewText, contentHtml }), text });
}

export async function deliverEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }): Promise<any> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const isConfigured = Boolean(
    user &&
    pass &&
    user !== 'YOUR_BREVO_SMTP_LOGIN' &&
    pass !== 'YOUR_BREVO_SMTP_KEY'
  );

  lastSentEmailForTesting = { to, subject, html, text, timestamp: new Date().toISOString() };

  if (!isConfigured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Brevo SMTP is not configured. Please set SMTP_USER and SMTP_PASS in your environment.');
    }
    console.log(`[EMAIL DEV SIMULATION] To: ${to} | Subject: ${subject}`);
    const otpMatch = text.match(/\b\d{6}\b/);
    if (otpMatch) {
      console.log(`[EMAIL DEV OTP CODE] >>> ${otpMatch[0]} <<<`);
    }
    return {
      success: true,
      mode: process.env.NODE_ENV === 'test' ? 'test_simulation' : 'dev_simulation',
      to,
      subject,
      messageId: `simulated-${Date.now()}`,
    };
  }

  const t = getTransporter();
  const mailOptions = {
    from: getFromHeader(),
    to,
    subject,
    html,
    text,
  };

  try {
    const info = await t.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      response: info.response,
    };
  } catch (err: any) {
    console.error(`[EMAIL] Failed delivering email to ${to}:`, err.message);
    throw new Error(`Email delivery failed via Brevo SMTP: ${err.message}`);
  }
}

export function getLastSentEmailForTesting(): any {
  return lastSentEmailForTesting;
}
