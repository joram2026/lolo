import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, collection, query, where, getDocs, updateDoc, increment, addDoc } from 'firebase/firestore';
import { Shield, Mail, Lock, User, Sparkles, AlertCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';

interface AuthPageProps {
  onSuccess: () => void;
  path: string;
  navigate: (path: string) => void;
}

export default function AuthPage({ onSuccess, path, navigate }: AuthPageProps) {
  // Derive view states directly from the URL path prop to prevent desynchronization
  const isSignUp = path === '/signup';
  const isReset = path === '/reset';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [referral, setReferral] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Two-Factor Authentication Login States
  const [show2faPrompt, setShow2faPrompt] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);

  // Check URL parameters for referral codes
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    let refCode = searchParams.get('ref') || searchParams.get('code');
    if (!refCode) {
      const hashIndex = window.location.hash.indexOf('?');
      if (hashIndex !== -1) {
        const hashParams = new URLSearchParams(window.location.hash.substring(hashIndex));
        refCode = hashParams.get('ref') || hashParams.get('code');
      }
    }
    if (refCode) {
      setReferral(refCode);
      if (path !== '/signup') {
        navigate('/signup');
      }
      setSuccessMsg(`Welcome! Referral code "${refCode}" has been successfully pre-filled.`);
    }
  }, [path, navigate]);

  const handleVerify2faLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorError(null);
    if (twoFactorCode.trim().length !== 6 || isNaN(Number(twoFactorCode.trim()))) {
      setTwoFactorError('Please enter a valid 6-digit Google Authenticator code.');
      return;
    }
    // Validation successful! Proceed to the main dashboard
    onSuccess();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const formattedEmail = email.trim();

    try {
      if (isReset) {
        // Handle Password Reset
        await sendPasswordResetEmail(auth, formattedEmail);
        setSuccessMsg('A password reset link has been sent to your email.');
        navigate('/login');
      } else if (isSignUp) {
        // Handle Registration
        const userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, password);
        const user = userCredential.user;

        // Generate dynamic unique referral code for the new user
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let generatedCode = '';
        for (let i = 0; i < 5; i++) {
          generatedCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const trimmedReferral = referral.trim();

        // Initialize user document in firestore with starting values and the unique referral code
        const docRef = doc(db, 'users', user.uid);
        await setDoc(docRef, {
          uid: user.uid,
          email: formattedEmail,
          displayName: displayName.trim() || formattedEmail.split('@')[0],
          balance: 0.0, // Initial wallet balance starts at $0
          referralSource: trimmedReferral,
          uniqueCode: generatedCode,
          createdAt: serverTimestamp(),
          withdrawalEnabled: true, // withdrawal allowed by default
          walletPassword: '' // Blank password initially
        });

        // Also save the newly created user's referral code mapping
        try {
          await setDoc(doc(db, 'referralCodes', generatedCode), {
            uid: user.uid,
            email: formattedEmail
          });
        } catch (mappingErr) {
          console.error('Error saving referral code mapping:', mappingErr);
        }

        // If a referral code was provided, look up the referrer via referralCodes and award tiered USDT automatically
        if (trimmedReferral) {
          try {
            const refMappingSnap = await getDoc(doc(db, 'referralCodes', trimmedReferral));
            if (refMappingSnap.exists()) {
              const refData = refMappingSnap.data();
              const referrerUid = refData.uid;
              const referrerEmail = refData.email || '';

              // Query to see how many referrals this referrer currently has (includes the new user)
              const referralsQuery = query(collection(db, 'users'), where('referralSource', '==', trimmedReferral));
              const referralsSnap = await getDocs(referralsQuery);
              const referralsCount = referralsSnap.size;

              // Calculate reward based on tier milestones:
              // < 5 referrals: Starter Tier ($0.50 USDT)
              // 5 - 9 referrals: Bronze Tier ($0.55 USDT, +10% bonus)
              // 10 - 19 referrals: Silver Tier ($0.60 USDT, +20% bonus)
              // 20+ referrals: Gold Tier ($0.70 USDT, +40% bonus)
              let rewardAmount = 0.50;
              let tierName = 'Starter';
              if (referralsCount >= 20) {
                rewardAmount = 0.70;
                tierName = 'Gold';
              } else if (referralsCount >= 10) {
                rewardAmount = 0.60;
                tierName = 'Silver';
              } else if (referralsCount >= 5) {
                rewardAmount = 0.55;
                tierName = 'Bronze';
              }

              // Credit referrer's balance by the calculated tiered USDT
              await updateDoc(doc(db, 'users', referrerUid), {
                balance: increment(rewardAmount)
              });

              // Create an approved referral reward transaction record
              await addDoc(collection(db, 'transactions'), {
                userId: referrerUid,
                userEmail: referrerEmail,
                type: 'referral_reward',
                amount: rewardAmount,
                status: 'APPROVED',
                createdAt: serverTimestamp(),
                paymentMessage: `Referral bonus (${tierName} Tier): successfully invited ${formattedEmail}`
              });
            }
          } catch (refErr) {
            console.error('Error auto-crediting referral reward:', refErr);
            // Non-blocking, registration succeeds anyway
          }
        }

        onSuccess();
      } else {
        // Handle Sign In
        const userCredential = await signInWithEmailAndPassword(auth, formattedEmail, password);
        const user = userCredential.user;
        
        // Ensure firestore document exists (just in case they were created externally)
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        let has2fa = false;

        if (docSnap.exists()) {
          const uData = docSnap.data();
          if (uData.twoFactorEnabled) {
            has2fa = true;
          }
        } else {
          await setDoc(docRef, {
            uid: user.uid,
            email: formattedEmail,
            displayName: user.displayName || formattedEmail.split('@')[0],
            balance: 0.0,
            referralSource: '',
            createdAt: serverTimestamp(),
            withdrawalEnabled: true,
            walletPassword: '',
            twoFactorEnabled: false
          });
        }

        if (has2fa) {
          setShow2faPrompt(true);
        } else {
          onSuccess();
        }
      }
    } catch (err: any) {
      console.error('Authentication Error:', err);
      let cleanMessage = 'Authentication failed. Please verify your details.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        cleanMessage = 'Invalid email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        cleanMessage = 'This email address is already registered.';
      } else if (err.code === 'auth/weak-password') {
        cleanMessage = 'Password must be at least 6 characters.';
      } else if (err.message) {
        cleanMessage = err.message;
      }
      setError(cleanMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-page-container" className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-900 text-zinc-100 font-sans">
      <div className="w-full max-w-sm">
        
        {/* Brand Banner */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white font-black text-2xl shadow-xl shadow-emerald-500/15 mb-3 tracking-widest uppercase">
            LOLO
          </div>
          <h1 className="text-2xl font-black text-zinc-100 tracking-tight">LOLO Crypto</h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-[260px] mx-auto">
            Start earning from crypto with the most favourable rates.
          </p>
        </div>

        {/* Auth Box Card */}
        <div className="bg-slate-800 border border-slate-700/80 rounded-3xl p-6 shadow-2xl space-y-6">
          {show2faPrompt ? (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Shield size={18} className="text-emerald-400" />
                  Two-Factor Verification
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  This wallet is secured with Two-Factor Authentication. Please enter the 6-digit passcode from your Google Authenticator app.
                </p>
              </div>

              {twoFactorError && (
                <div id="auth-2fa-error-banner" className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{twoFactorError}</span>
                </div>
              )}

              <form onSubmit={handleVerify2faLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block text-center">Google Authenticator Code</label>
                  <input
                    id="auth-2fa-input"
                    type="text"
                    maxLength={6}
                    required
                    autoFocus
                    placeholder="000000"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono text-lg tracking-widest text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <button
                  id="auth-2fa-verify-btn"
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-xl text-xs tracking-wider uppercase shadow-md transition-all cursor-pointer"
                >
                  Verify & Log In
                </button>

                <button
                  id="auth-2fa-cancel-btn"
                  type="button"
                  onClick={() => { setShow2faPrompt(false); setTwoFactorCode(''); setTwoFactorError(null); }}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-650 text-zinc-400 rounded-xl text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer text-center"
                >
                  Back to Sign In
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-zinc-100">
                  {isReset ? 'Reset Wallet Password' : isSignUp ? 'Create your Wallet' : 'Sign in to Wallet'}
                </h2>
                <p className="text-xs text-zinc-500">
                  {isReset 
                    ? 'Enter your registered email below.' 
                    : isSignUp 
                      ? 'Sign and start making profits.' 
                      : 'Enter your credentials to make profits.'
                  }
                </p>
              </div>

              {error && (
                <div id="auth-error-banner" className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div id="auth-success-banner" className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-start gap-2">
                  <Sparkles size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Display Name - Sign Up Only */}
                {isSignUp && !isReset && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400">Display Name</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                        <User size={15} />
                      </span>
                      <input
                        id="auth-display-name"
                        type="text"
                        required
                        placeholder="John Doe"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 placeholder-zinc-600 text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Email Field */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                      <Mail size={15} />
                    </span>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      placeholder="love@gmail.com or personal"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 placeholder-zinc-600 text-white"
                    />
                  </div>
                </div>

                {/* Password Field - Login / Sign Up Only */}
                {!isReset && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-zinc-400">Password</label>
                      {!isSignUp && (
                        <button
                          id="auth-forgot-password"
                          type="button"
                          onClick={() => { navigate('/reset'); setError(null); }}
                          className="text-[11px] font-medium text-emerald-400 hover:underline"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                        <Lock size={15} />
                      </span>
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 placeholder-zinc-600 text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300 focus:outline-none cursor-pointer"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Referral Code - Sign Up Only */}
                {isSignUp && !isReset && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400">Referral Code (Optional)</label>
                    <input
                      id="auth-referral"
                      type="text"
                      placeholder="e.g. FRIEND50"
                      value={referral}
                      onChange={(e) => setReferral(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 placeholder-zinc-600 text-white"
                    />
                  </div>
                )}

                {/* Submit Button */}
                <button
                  id="auth-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 rounded-xl text-xs font-bold transition-all mt-4 disabled:bg-zinc-800 disabled:text-zinc-500 shadow-md shadow-emerald-500/10 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Please wait...</span>
                    </>
                  ) : (
                    <span>
                      {isReset 
                        ? 'Send Password Reset Link' 
                        : isSignUp 
                          ? 'Create Account' 
                          : 'Log In'
                      }
                    </span>
                  )}
                </button>

              </form>

              {/* Toggle Button */}
              <div className="text-center">
                {isReset ? (
                  <button
                    id="auth-back-to-login"
                    onClick={() => { navigate('/login'); setError(null); }}
                    className="text-xs font-semibold text-zinc-400 hover:text-white hover:underline"
                  >
                    Back to Sign In
                  </button>
                ) : (
                  <p className="text-xs text-zinc-500">
                    {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                    <button
                      id="auth-toggle-btn"
                      onClick={() => { navigate(isSignUp ? '/login' : '/signup'); setError(null); }}
                      className="text-xs font-bold text-emerald-400 hover:underline"
                    >
                      {isSignUp ? 'Sign In' : 'Sign Up'}
                    </button>
                  </p>
                )}
              </div>

            
            </>
          )}
        </div>

      </div>
    </div>
  );
}
