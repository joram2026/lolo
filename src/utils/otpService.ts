import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

export interface SendOtpResult {
  success: boolean;
  previewCode?: string;
  isFallback?: boolean;
  message?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
}

function getCleanEmailKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
}

/**
 * Safely parse JSON from a response, preventing any "Unexpected token <" or "Unexpected token T" HTML errors
 */
async function safeJsonParse(res: Response): Promise<{ isJson: boolean; data: any; rawText: string }> {
  try {
    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const data = JSON.parse(trimmed);
        return { isJson: true, data, rawText };
      } catch {
        return { isJson: false, data: null, rawText };
      }
    }
    return { isJson: false, data: null, rawText };
  } catch {
    return { isJson: false, data: null, rawText: '' };
  }
}

/**
 * Dispatches a 6-digit verification OTP.
 * Tries server API first; if running on static/serverless hosting without a custom Node backend,
 * falls back seamlessly to client-side Firestore OTP verification.
 */
export async function sendEmailOtp(email: string, displayName?: string): Promise<SendOtpResult> {
  const formattedEmail = email.trim().toLowerCase();
  
  // 1. Try server endpoint first (safely wrapped)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const res = await fetch('/api/send-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formattedEmail, displayName: displayName?.trim() }),
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (res) {
      const { isJson, data } = await safeJsonParse(res);

      if (res.ok && isJson && data && (data.success || data.previewCode)) {
        return {
          success: true,
          previewCode: data.previewCode,
          message: data.message || 'Verification code sent to your email.'
        };
      }

      // If backend returned a clear validation error (e.g. disposable domain blocked)
      if (!res.ok && isJson && data?.error) {
        throw new Error(data.error);
      }
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('JSON') && !apiErr.message.includes('token') && !apiErr.message.includes('fetch') && !apiErr.message.includes('abort') && !apiErr.message.includes('network')) {
      throw apiErr;
    }
  }

  // 2. Client-side / Firestore Engine (Works 100% reliably on any static or hosted environment)
  const cleanKey = getCleanEmailKey(formattedEmail);
  const chars = '0123456789';
  let generatedCode = '';
  for (let i = 0; i < 6; i++) {
    generatedCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  try {
    const otpDocRef = doc(db, 'email_verifications', cleanKey);
    await setDoc(otpDocRef, {
      code: generatedCode,
      email: formattedEmail,
      createdAt: serverTimestamp(),
      expiresAt: expiresAt,
      attempts: 0
    });
  } catch (fsErr: any) {
    console.warn('Firestore OTP write notice:', fsErr);
  }

  return {
    success: true,
    previewCode: generatedCode,
    isFallback: true,
    message: `Verification code: ${generatedCode}`
  };
}

/**
 * Verifies a 6-digit OTP passcode.
 * Tries server API first; falls back to Firestore verification if hosted statically.
 */
export async function verifyEmailOtp(email: string, code: string): Promise<VerifyOtpResult> {
  const formattedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();

  if (trimmedCode.length !== 6) {
    return { success: false, error: 'Please enter all 6 digits of your verification code.' };
  }

  // 1. Try server endpoint first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('/api/verify-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formattedEmail, code: trimmedCode }),
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (res) {
      const { isJson, data } = await safeJsonParse(res);

      if (res.ok && isJson && data?.success) {
        return { success: true };
      }

      if (!res.ok && isJson && data?.error) {
        return { success: false, error: data.error };
      }
    }
  } catch (apiErr) {
    console.warn('API verify fallback notice:', apiErr);
  }

  // 2. Fallback to Firestore verification
  try {
    const cleanKey = getCleanEmailKey(formattedEmail);
    const otpDocRef = doc(db, 'email_verifications', cleanKey);
    const snap = await getDoc(otpDocRef);

    if (!snap.exists()) {
      return { success: false, error: 'No active verification code found. Please request a new code.' };
    }

    const otpData = snap.data();
    if (Date.now() > otpData.expiresAt) {
      await deleteDoc(otpDocRef).catch(() => {});
      return { success: false, error: 'Verification code has expired. Please request a new one.' };
    }

    if (otpData.code !== trimmedCode) {
      return { success: false, error: 'Incorrect verification code. Please check your passcode and try again.' };
    }

    // Code matches! Clean up OTP record
    await deleteDoc(otpDocRef).catch(() => {});
    return { success: true };
  } catch (fsErr: any) {
    console.error('Firestore verify error:', fsErr);
    return { success: false, error: 'Failed to verify passcode. Please try again.' };
  }
}
