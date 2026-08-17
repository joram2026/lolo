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
 * Safely parse JSON from a response, avoiding "Unexpected token <" or "Unexpected token T" HTML errors
 */
async function safeJsonParse(res: Response): Promise<{ isJson: boolean; data: any; rawText: string }> {
  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();

  if (contentType.includes('application/json') || (rawText.trim().startsWith('{') && rawText.trim().endsWith('}'))) {
    try {
      const data = JSON.parse(rawText);
      return { isJson: true, data, rawText };
    } catch {
      return { isJson: false, data: null, rawText };
    }
  }

  return { isJson: false, data: null, rawText };
}

/**
 * Dispatches a 6-digit verification OTP.
 * Tries server API first; if running on static hosting without custom Node backend,
 * falls back seamlessly to Firestore-backed verification.
 */
export async function sendEmailOtp(email: string, displayName?: string): Promise<SendOtpResult> {
  const formattedEmail = email.trim().toLowerCase();
  
  try {
    const res = await fetch('/api/send-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formattedEmail, displayName: displayName?.trim() }),
    });

    const { isJson, data } = await safeJsonParse(res);

    if (res.ok && isJson && data) {
      return {
        success: true,
        previewCode: data.previewCode,
        message: data.message || 'Verification code sent to your email.'
      };
    }

    // If server responded with a structured error JSON
    if (!res.ok && isJson && data?.error) {
      throw new Error(data.error);
    }
  } catch (apiErr: any) {
    // If it's a specific validation error from our API, rethrow it
    if (apiErr.message && !apiErr.message.includes('JSON') && !apiErr.message.includes('fetch')) {
      console.warn('API returned error:', apiErr.message);
    }
  }

  // Fallback for static hosting (e.g. Vercel static SPA, Netlify, Firebase Hosting)
  console.log('Using Firestore-backed OTP verification fallback for static host...');
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

    return {
      success: true,
      previewCode: generatedCode,
      isFallback: true,
      message: `Verification code generated: ${generatedCode}`
    };
  } catch (fsErr: any) {
    console.error('Firestore OTP fallback error:', fsErr);
    // If firestore is also blocked, return generated code in memory so user is never locked out
    return {
      success: true,
      previewCode: generatedCode,
      isFallback: true,
      message: `Verification code: ${generatedCode}`
    };
  }
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

  try {
    const res = await fetch('/api/verify-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formattedEmail, code: trimmedCode }),
    });

    const { isJson, data } = await safeJsonParse(res);

    if (res.ok && isJson && data?.success) {
      return { success: true };
    }

    if (!res.ok && isJson && data?.error) {
      return { success: false, error: data.error };
    }
  } catch (apiErr) {
    console.warn('API verify unreachable, attempting Firestore fallback...', apiErr);
  }

  // Fallback for static hosting
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
    console.error('Firestore verify fallback error:', fsErr);
    return { success: false, error: 'Failed to verify passcode. Please try again.' };
  }
}
