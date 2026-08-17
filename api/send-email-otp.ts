import type { IncomingMessage, ServerResponse } from 'http';
import nodemailer from 'nodemailer';

// In-memory OTP store with 10-minute expiry
interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}
const otpStore = new Map<string, OtpRecord>();

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // use as is
      }
    }

    const email = body?.email?.toString().trim().toLowerCase();
    const displayName = body?.displayName?.toString().trim() || 'User';

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    // Generate 6-digit OTP code
    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email, { code, expiresAt, attempts: 0 });

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"Morex Security" <${smtpUser}>`,
        to: email,
        subject: `Your Morex Verification Code: ${code}`,
        text: `Hello ${displayName},\n\nYour 6-digit email verification code is: ${code}\n\nThis passcode expires in 10 minutes.\n\nBest regards,\nMorex Security Team`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #f3f4f6; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #d97706; margin: 0; font-size: 24px; font-weight: 800;">Morex Holdings</h1>
              <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">Account Security Verification</p>
            </div>
            <p style="color: #374151; font-size: 14px; line-height: 1.5;">Hello <strong>${displayName}</strong>,</p>
            <p style="color: #374151; font-size: 14px; line-height: 1.5;">Please use the following 6-digit confirmation code to complete your registration:</p>
            <div style="text-align: center; margin: 28px 0;">
              <span style="display: inline-block; font-size: 32px; font-weight: 800; font-family: monospace; letter-spacing: 8px; color: #1f2937; background: #fef3c7; border: 1px dashed #f59e0b; padding: 12px 24px; border-radius: 12px;">${code}</span>
            </div>
            <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; text-align: center;">This passcode will expire in 10 minutes. If you did not request this, please ignore this email.</p>
          </div>
        `,
      });

      return res.status(200).json({ success: true, message: 'Verification email sent.' });
    }

    // Preview / Development fallback
    return res.status(200).json({
      success: true,
      previewCode: code,
      message: 'Verification code generated.'
    });
  } catch (err: any) {
    console.error('Serverless send OTP error:', err);
    return res.status(500).json({ error: 'Failed to dispatch verification code.' });
  }
}
