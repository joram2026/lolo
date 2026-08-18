import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { useToast } from '../context/ToastContext';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  signOut,
  updatePassword
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, collection, query, where, getDocs, updateDoc, increment, addDoc, deleteDoc } from 'firebase/firestore';
import { Shield, Mail, Lock, User, Phone, Sparkles, AlertCircle, RefreshCw, Eye, EyeOff, Globe, ChevronDown, Check, TrendingUp, Zap, Award, ArrowUpRight, Activity, DollarSign, Users, Percent, CheckCircle, ArrowLeft, KeyRound, CheckCheck } from 'lucide-react';
import { validateEmailAddress } from '../utils/emailValidation';
import { sendEmailOtp, verifyEmailOtp } from '../utils/otpService';

interface AuthPageProps {
  onSuccess: () => void;
  path: string;
  navigate: (path: string, clearSearch?: boolean) => void;
}

function deriveAuthPassword(email: string): string {
  const cleanEmail = email.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  return `LoloAuth_${cleanEmail}_Secure123!`;
}

export default function AuthPage({ onSuccess, path, navigate }: AuthPageProps) {
  // Derive view states directly from the URL path prop to prevent desynchronization
  const isSignUp = path === '/signup';
  const isReset = path === '/reset';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState('Kenya');
  const [isCountryOpen, setIsCountryOpen] = useState(false);

  // Email verification OTP states for Sign Up
  const [signUpStep, setSignUpStep] = useState<'details' | 'otp'>('details');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  const COUNTRIES = [
    { code: 'Kenya', name: 'Kenya', flag: '🇰🇪', dialCode: '+254' },
    { code: 'Uganda', name: 'Uganda', flag: '🇺🇬', dialCode: '+256' },
    { code: 'Nigeria', name: 'Nigeria', flag: '🇳🇬', dialCode: '+234' },
    { code: 'Ghana', name: 'Ghana', flag: '🇬🇭', dialCode: '+233' },
    { code: 'South Africa', name: 'South Africa', flag: '🇿🇦', dialCode: '+27' },
  ];
  const [referral, setReferral] = useState(() => localStorage.getItem('pending_referral_code') || '');
  const referralNotifiedRef = React.useRef(false);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const setError = (msg: string | null) => {
    setErrorState(msg);
    if (msg) toast.error(msg, 'Authentication Error');
  };
  const error = errorState;

  const [successMsgState, setSuccessMsgState] = useState<string | null>(null);
  const setSuccessMsg = (msg: string | null) => {
    setSuccessMsgState(msg);
    if (msg) toast.success(msg, 'Authentication');
  };
  const successMsg = successMsgState;

  // Two-Factor Authentication Login States
  const [show2faPrompt, setShow2faPrompt] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorErrorState, setTwoFactorErrorState] = useState<string | null>(null);
  const setTwoFactorError = (msg: string | null) => {
    setTwoFactorErrorState(msg);
    if (msg) toast.error(msg, '2FA Code Error');
  };
  const twoFactorError = twoFactorErrorState;

  const [showPassword, setShowPassword] = useState(false);

  // Check email for domain suggestions / typos on change
  useEffect(() => {
    if (email && email.includes('@')) {
      const validation = validateEmailAddress(email);
      if (validation.suggestion) {
        setEmailSuggestion(validation.suggestion);
      } else {
        setEmailSuggestion(null);
      }
    } else {
      setEmailSuggestion(null);
    }
  }, [email]);

  // Reset OTP step when switching views
  useEffect(() => {
    if (!isSignUp) {
      setSignUpStep('details');
      setOtpDigits(['', '', '', '', '', '']);
    }
  }, [isSignUp, path]);

  // Resend OTP countdown timer
  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Check URL parameters and localStorage for referral codes
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
      const upperRefCode = refCode.trim().toUpperCase();
      localStorage.setItem('pending_referral_code', upperRefCode);
      setReferral(upperRefCode);
      if (path !== '/signup') {
        navigate('/signup', true); // Navigate and clear search params!
      }
      if (!referralNotifiedRef.current) {
        referralNotifiedRef.current = true;
        setSuccessMsg(`Welcome! Referral code "${upperRefCode}" has been successfully pre-filled.`);
      }
    } else {
      const savedRef = localStorage.getItem('pending_referral_code') || '';
      if (savedRef) {
        setReferral((prev) => (prev ? prev : savedRef));
        // Only show prefilled message if they are explicitly on /signup
        if (path === '/signup' && !referralNotifiedRef.current) {
          referralNotifiedRef.current = true;
          setSuccessMsg(`Welcome! Referral code "${savedRef}" has been successfully pre-filled.`);
        }
      }
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
    localStorage.removeItem('pending_referral_code');
    onSuccess();
  };

  // OTP Input event handlers
  const handleOtpBoxChange = (index: number, val: string) => {
    const numericVal = val.replace(/\D/g, '');
    
    if (numericVal.length > 1) {
      // User pasted or typed multiple digits
      const newDigits = [...otpDigits];
      const chars = numericVal.slice(0, 6).split('');
      chars.forEach((ch, idx) => {
        if (index + idx < 6) {
          newDigits[index + idx] = ch;
        }
      });
      setOtpDigits(newDigits);
      const nextFocus = Math.min(index + chars.length, 5);
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }

    const newDigits = [...otpDigits];
    newDigits[index] = numericVal;
    setOtpDigits(newDigits);

    if (numericVal && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpBoxPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = ['', '', '', '', '', ''];
    pasted.split('').forEach((ch, idx) => {
      newDigits[idx] = ch;
    });
    setOtpDigits(newDigits);
    const lastIdx = Math.min(pasted.length, 5);
    otpInputRefs.current[lastIdx]?.focus();
  };

  // Request/Resend verification code
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    const formattedEmail = email.trim().toLowerCase();
    
    setLoading(true);
    setError(null);
    try {
      await sendEmailOtp(formattedEmail, displayName.trim());

      setResendCooldown(45);
      setSuccessMsg('A new verification code has been dispatched to your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Final account verification and creation with OTP code
  const handleFinalSignUpWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredCode = otpDigits.join('').trim();
    if (enteredCode.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError(null);
    const formattedEmail = email.trim().toLowerCase();

    try {
      // 1. Verify OTP code
      const verifyResult = await verifyEmailOtp(formattedEmail, enteredCode);
      if (!verifyResult.success) {
        throw new Error(verifyResult.error || 'Invalid verification code. Please check your passcode and try again.');
      }

      // 2. Clear referral/code parameters from the URL before signing in
      navigate('/signup', true);

      // 3. Handle Registration in Firebase Auth
      let user;
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, deriveAuthPassword(formattedEmail));
        user = userCredential.user;
      } catch (regErr: any) {
        if (regErr.code === 'auth/email-already-in-use') {
          try {
            const userCredential = await signInWithEmailAndPassword(auth, formattedEmail, deriveAuthPassword(formattedEmail));
            user = userCredential.user;
          } catch (loginErr: any) {
            let version = 1;
            let versionedEmail = '';
            let success = false;
            while (!success && version < 20) {
              const parts = formattedEmail.split('@');
              versionedEmail = `${parts[0]}+v${version}@${parts[1]}`;
              try {
                const userCredential = await createUserWithEmailAndPassword(auth, versionedEmail, deriveAuthPassword(formattedEmail));
                user = userCredential.user;
                success = true;
              } catch (vErr: any) {
                if (vErr.code === 'auth/email-already-in-use') {
                  try {
                    const userCredential = await signInWithEmailAndPassword(auth, versionedEmail, deriveAuthPassword(formattedEmail));
                    user = userCredential.user;
                    success = true;
                  } catch (vLoginErr) {
                    version++;
                  }
                } else {
                  throw vErr;
                }
              }
            }
            if (!success) {
              throw new Error('Could not recreate user account. Please try a different email address.');
            }
          }
        } else {
          throw regErr;
        }
      }

      // Generate dynamic unique referral code for the new user
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let generatedCode = '';
      for (let i = 0; i < 5; i++) {
        generatedCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const trimmedReferral = referral.trim().toUpperCase();
      const selectedCountryObj = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];
      const rawPhone = phone.trim().replace(/^0+/, '');
      const formattedPhone = rawPhone.startsWith('+') ? rawPhone : `${selectedCountryObj.dialCode} ${rawPhone}`;

      // Initialize user document in Firestore
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, {
        uid: user.uid,
        email: formattedEmail,
        displayName: displayName.trim() || formattedEmail.split('@')[0],
        phone: formattedPhone,
        country: country,
        balance: 0.0,
        usdtBalance: 0.0,
        referralSource: trimmedReferral,
        uniqueCode: generatedCode,
        createdAt: serverTimestamp(),
        withdrawalEnabled: true,
        walletPassword: '',
        accountPassword: password,
        authEmail: user.email,
        emailVerified: true
      });

      // Save referral code mapping
      try {
        await setDoc(doc(db, 'referralCodes', generatedCode), {
          uid: user.uid,
          email: formattedEmail
        });
      } catch (mappingErr) {
        console.error('Error saving referral code mapping:', mappingErr);
      }

      // Save session details to localStorage
      localStorage.setItem('custom_user_email', formattedEmail);
      localStorage.setItem('custom_user_uid', user.uid);

      // Auto-credit referrer if referral code was used
      if (trimmedReferral) {
        try {
          const refMappingSnap = await getDoc(doc(db, 'referralCodes', trimmedReferral));
          if (refMappingSnap.exists()) {
            const refData = refMappingSnap.data();
            const referrerUid = refData.uid;
            const referrerEmail = refData.email || '';

            const referralsQuery = query(collection(db, 'users'), where('referralSource', '==', trimmedReferral));
            const referralsSnap = await getDocs(referralsQuery);
            const referralsCount = referralsSnap.size;

            let rewardAmount = 0.10;
            let tierName = 'Starter';
            if (referralsCount >= 40) {
              rewardAmount = 0.40;
              tierName = 'Gold';
            } else if (referralsCount >= 20) {
              rewardAmount = 0.30;
              tierName = 'Silver';
            } else if (referralsCount >= 7) {
              rewardAmount = 0.20;
              tierName = 'Bronze';
            }

            await updateDoc(doc(db, 'users', referrerUid), {
              balance: increment(rewardAmount),
              usdtBalance: increment(rewardAmount)
            });

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
        }
      }

      localStorage.removeItem('pending_referral_code');
      onSuccess();
    } catch (err: any) {
      console.error('Registration OTP verification error:', err);
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const formattedEmail = email.trim().toLowerCase();

    try {
      if (isReset) {
        // Handle custom Password Reset directly in the database
        if (!resetNewPassword || !resetConfirmPassword) {
          throw new Error('Please fill in both password fields.');
        }
        if (resetNewPassword.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (resetNewPassword !== resetConfirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', formattedEmail));
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
          throw new Error('No registered account found with this email.');
        }

        const userDoc = querySnap.docs[0];
        const userUid = userDoc.id;

        // Update custom password in Firestore
        await updateDoc(doc(db, 'users', userUid), {
          accountPassword: resetNewPassword
        });

        setSuccessMsg('Your password has been successfully updated. Redirecting to login page...');
        setResetNewPassword('');
        setResetConfirmPassword('');
        
        setTimeout(() => {
          navigate('/login');
        }, 3000);

      } else if (isSignUp) {
        // Step 1: Pre-flight validation before sending OTP
        if (!displayName.trim()) {
          throw new Error('Please enter your display name.');
        }

        // Email validation & disposable domain check
        const validation = validateEmailAddress(formattedEmail);
        if (!validation.isValid) {
          throw new Error(validation.error || 'Please enter a valid email address.');
        }

        if (!phone.trim()) {
          throw new Error('Please enter your phone number.');
        }

        if (!password || password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match. Please verify that your password confirmation matches.');
        }

        // Check if user is already registered in Firestore
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', formattedEmail));
        const querySnap = await getDocs(q);

        if (!querySnap.empty) {
          throw new Error('This email address is already registered. Please sign in instead.');
        }

        // Request 6-digit OTP verification code
        await sendEmailOtp(formattedEmail, displayName.trim());

        setResendCooldown(45);
        setSignUpStep('otp');
        setOtpDigits(['', '', '', '', '', '']);
        setSuccessMsg(`Verification code sent to ${formattedEmail}`);
        setTimeout(() => {
          otpInputRefs.current[0]?.focus();
        }, 100);

      } else {
        // Handle Sign In
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', formattedEmail));
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
          throw new Error('No account found with this email address.');
        }

        const userDoc = querySnap.docs[0];
        const userData = userDoc.data();
        const activeUserUid = userDoc.id;

        // Verify password against Firestore accountPassword
        const firestorePassword = userData.accountPassword;
        if (!firestorePassword || firestorePassword !== password) {
          throw new Error('Incorrect password. Please verify your credentials or use the reset password option.');
        }

        const authEmailToUse = userData.authEmail || userData.email || formattedEmail;

        try {
          await signInWithEmailAndPassword(auth, authEmailToUse, deriveAuthPassword(formattedEmail));
        } catch (authSignInErr: any) {
          try {
            await signInWithEmailAndPassword(auth, formattedEmail, deriveAuthPassword(formattedEmail));
          } catch (secondAuthErr: any) {
            console.log('Firebase Auth internal credential fallback...');
          }
        }

        localStorage.setItem('custom_user_email', formattedEmail);
        localStorage.setItem('custom_user_uid', activeUserUid);

        let has2fa = false;
        const docRef = doc(db, 'users', activeUserUid);
        const freshSnap = await getDoc(docRef);
        if (freshSnap.exists()) {
          const freshData = freshSnap.data();
          if (freshData.twoFactorEnabled && freshData.twoFactorSecret) {
            has2fa = true;
          }
        } else {
          await setDoc(docRef, {
            uid: activeUserUid,
            email: formattedEmail,
            displayName: formattedEmail.split('@')[0],
            balance: 0.0,
            usdtBalance: 0.0,
            referralSource: '',
            createdAt: serverTimestamp(),
            withdrawalEnabled: true,
            walletPassword: '',
            twoFactorEnabled: false,
            accountPassword: password,
            authEmail: formattedEmail
          });
        }

        if (has2fa) {
          setShow2faPrompt(true);
        } else {
          localStorage.removeItem('pending_referral_code');
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
    <div id="auth-page-container" className="min-h-screen bg-gradient-to-br from-[#FFFBF0] via-[#FFF3D6] to-[#FFEBB5] text-zinc-800 font-sans relative overflow-hidden flex flex-col justify-center items-center py-12">
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(5deg); }
        }
        .animate-float-slow {
          animation: float-slow 8s ease-in-out infinite;
        }
        @keyframes float-fast {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(-3deg); }
        }
        .animate-float-fast {
          animation: float-fast 5s ease-in-out infinite;
        }
      `}</style>

      {/* 1. Floating Forex Background Icons */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        <div className="absolute top-[18%] left-[4%] opacity-[0.08] animate-float-slow text-amber-600">
          <div className="text-6xl sm:text-9xl font-black font-serif">₿</div>
        </div>
        <div className="absolute bottom-[20%] left-[6%] opacity-[0.06] animate-float-fast text-emerald-600">
          <div className="text-7xl sm:text-[10rem] font-black font-sans">$</div>
        </div>
        <div className="absolute top-[25%] right-[6%] opacity-[0.05] animate-float-slow text-blue-600">
          <div className="text-6xl sm:text-9xl font-bold font-sans">€</div>
        </div>
        <div className="absolute bottom-[15%] right-[4%] opacity-[0.07] animate-float-fast text-indigo-600">
          <div className="text-6xl sm:text-9xl font-bold font-sans">£</div>
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(#d97706_0.5px,transparent_0.5px)] [background-size:20px_20px] opacity-[0.04]" />
      </div>

      {/* 2. Centered Auth Container */}
      <div className="w-full max-w-sm px-4 relative z-10 flex flex-col justify-center">
            
            {/* Logo/Banner section */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center mb-3 relative group">
                <div className="absolute inset-0 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all duration-700 animate-pulse"></div>
                <div className="relative w-16 h-16 rounded-2xl bg-white border border-zinc-200/80 p-1.5 shadow-lg flex items-center justify-center overflow-hidden">
                  <img 
                    src="/icon.svg" 
                    alt="Morex" 
                    className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-zinc-950/5 to-transparent pointer-events-none"></div>
                </div>
              </div>
              <h1 className="text-xl font-black text-zinc-900 tracking-tight">Morex Holdings</h1>
              <p className="text-[11px] text-zinc-500 mt-0.5 max-w-[260px] mx-auto leading-normal">
                Start earning from high-yield crypto & forex arbitrage copy trading.
              </p>
            </div>

            {/* Main Auth Form Container Card */}
            <div className="bg-white border border-zinc-200/60 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
              {show2faPrompt ? (
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
                      <Shield size={18} className="text-amber-500" />
                      Two-Factor Verification
                    </h2>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      This wallet is secured with Two-Factor Authentication. Please enter the 6-digit passcode from your Google Authenticator app.
                    </p>
                  </div>

                  <form onSubmit={handleVerify2faLogin} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block text-center">Google Authenticator Code</label>
                      <input
                        id="auth-2fa-input"
                        type="text"
                        maxLength={6}
                        required
                        autoFocus
                        placeholder="000000"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-center font-mono text-lg tracking-widest text-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>

                    <button
                      id="auth-2fa-verify-btn"
                      type="submit"
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl text-xs tracking-wider uppercase shadow-md transition-all cursor-pointer"
                    >
                      Verify & Log In
                    </button>

                    <button
                      id="auth-2fa-cancel-btn"
                      type="button"
                      onClick={() => { setShow2faPrompt(false); setTwoFactorCode(''); setTwoFactorError(null); }}
                      className="w-full py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer text-center"
                    >
                      Back to Sign In
                    </button>
                  </form>
                </div>
              ) : isSignUp && signUpStep === 'otp' ? (
                /* Step 2: 6-Digit Email Verification Code Input Screen */
                <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
                  <div className="text-center space-y-1.5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 mx-auto flex items-center justify-center shadow-xs">
                      <Mail size={22} className="stroke-[2.2]" />
                    </div>
                    <h2 className="text-lg font-bold text-zinc-900">Verify Your Email</h2>
                    <p className="text-xs text-zinc-500 leading-relaxed px-1">
                      We sent a 6-digit confirmation passcode to{' '}
                      <span className="font-semibold text-zinc-800 break-all">{email.trim().toLowerCase()}</span>
                    </p>
                    <button
                      id="auth-edit-email-btn"
                      type="button"
                      onClick={() => setSignUpStep('details')}
                      className="text-[11px] text-amber-600 hover:text-amber-700 font-semibold hover:underline cursor-pointer inline-flex items-center gap-1 mt-0.5"
                    >
                      <ArrowLeft size={11} /> Edit email address
                    </button>
                  </div>

                  <form onSubmit={handleFinalSignUpWithOtp} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block text-center">
                        Enter 6-Digit Passcode
                      </label>
                      <div className="flex justify-between gap-1.5 sm:gap-2">
                        {otpDigits.map((digit, idx) => (
                          <input
                            key={idx}
                            id={`auth-otp-box-${idx}`}
                            ref={(el) => { otpInputRefs.current[idx] = el; }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            autoFocus={idx === 0}
                            value={digit}
                            onChange={(e) => handleOtpBoxChange(idx, e.target.value)}
                            onKeyDown={(e) => handleOtpBoxKeyDown(idx, e)}
                            onPaste={handleOtpBoxPaste}
                            className="w-10 sm:w-11 h-12 text-center text-lg font-bold font-mono bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-zinc-900 shadow-xs transition-all"
                          />
                        ))}
                      </div>
                    </div>

                    {/* Verify & Create Account Button */}
                    <button
                      id="auth-verify-otp-btn"
                      type="submit"
                      disabled={loading || otpDigits.join('').length !== 6}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 rounded-xl text-xs font-bold transition-all disabled:bg-zinc-100 disabled:text-zinc-400 shadow-md shadow-amber-500/10 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Verifying & Creating Account...</span>
                        </>
                      ) : (
                        <>
                          <CheckCheck size={15} />
                          <span>Verify & Create Account</span>
                        </>
                      )}
                    </button>

                    {/* Resend Code & Back Controls */}
                    <div className="flex flex-col items-center gap-2 pt-1">
                      {resendCooldown > 0 ? (
                        <span className="text-xs text-zinc-400 font-medium">
                          Resend code in <strong className="font-mono text-zinc-600">{resendCooldown}s</strong>
                        </span>
                      ) : (
                        <button
                          id="auth-resend-otp-btn"
                          type="button"
                          disabled={loading}
                          onClick={handleResendOtp}
                          className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Resend Verification Code
                        </button>
                      )}

                      <button
                        id="auth-back-to-details-btn"
                        type="button"
                        onClick={() => setSignUpStep('details')}
                        className="text-[11px] text-zinc-500 hover:text-zinc-700 font-medium cursor-pointer"
                      >
                        Back to Registration Details
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-zinc-800">
                      {isReset ? 'Reset Wallet Password' : isSignUp ? 'Create your Wallet' : 'Sign in to Wallet'}
                    </h2>
                    <p className="text-xs text-zinc-400">
                      {isReset 
                        ? 'Enter your email and a new password to reset your account password.' 
                        : isSignUp 
                          ? 'Sign up with email verification and start making profits.' 
                          : 'Enter your credentials to make profits.'
                      }
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Display Name - Sign Up Only */}
                    {isSignUp && !isReset && (
                      <div className="space-y-1">
                        <label htmlFor="auth-display-name" className="text-xs font-semibold text-zinc-600 cursor-pointer">Display Name</label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 pointer-events-none z-10">
                            <User size={15} />
                          </span>
                          <input
                            id="auth-display-name"
                            name="displayName"
                            type="text"
                            required
                            autoComplete="name"
                            autoCapitalize="words"
                            autoCorrect="off"
                            placeholder="John Doe"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                          />
                        </div>
                      </div>
                    )}

                    {/* Country Dropdown - Sign Up Only */}
                    {isSignUp && !isReset && (
                      <div className="space-y-1 relative">
                        <label htmlFor="auth-country-trigger" className="text-xs font-semibold text-zinc-600 cursor-pointer">Country of Residence</label>
                        
                        <button
                          id="auth-country-trigger"
                          type="button"
                          onClick={() => setIsCountryOpen(!isCountryOpen)}
                          className="w-full px-3 py-2.5 bg-zinc-50 hover:bg-zinc-100/90 border border-zinc-200 rounded-xl text-xs flex items-center justify-between transition-all focus:outline-none focus:ring-1 focus:ring-amber-500 text-zinc-800 font-medium cursor-pointer shadow-sm active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-base leading-none shrink-0">{COUNTRIES.find(c => c.code === country)?.flag || '🇰🇪'}</span>
                            <span className="font-semibold text-zinc-800 truncate">{COUNTRIES.find(c => c.code === country)?.name || country}</span>
                            <span className="text-[10px] bg-zinc-200/80 text-zinc-700 font-bold font-mono px-1.5 py-0.5 rounded shrink-0">
                              {COUNTRIES.find(c => c.code === country)?.dialCode || '+254'}
                            </span>
                          </div>
                          <ChevronDown size={15} className={`text-zinc-400 shrink-0 transition-transform duration-200 ${isCountryOpen ? 'rotate-180 text-amber-500' : ''}`} />
                        </button>

                        {/* Custom Modern Dropdown Menu */}
                        {isCountryOpen && (
                          <>
                            <div 
                              className="fixed inset-0 z-40" 
                              onClick={() => setIsCountryOpen(false)} 
                            />
                            
                            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-amber-200/80 rounded-2xl shadow-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                              {COUNTRIES.map((c) => {
                                const isSelected = country === c.code;
                                return (
                                  <button
                                    key={c.code}
                                    id={`auth-country-opt-${c.code.toLowerCase().replace(/\s+/g, '-')}`}
                                    type="button"
                                    onClick={() => {
                                      setCountry(c.code);
                                      setIsCountryOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                                      isSelected 
                                        ? 'bg-amber-500/10 border border-amber-500/30 text-amber-950 font-bold shadow-xs' 
                                        : 'hover:bg-amber-50/60 text-zinc-700 font-medium border border-transparent'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <span className="text-base leading-none">{c.flag}</span>
                                      <span>{c.name}</span>
                                      <span className="text-[10px] font-mono text-zinc-500 font-semibold">
                                        ({c.dialCode})
                                      </span>
                                    </div>
                                    {isSelected && <Check size={14} className="text-amber-600 shrink-0 stroke-[3]" />}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Email Field */}
                    <div className="space-y-1">
                      <label htmlFor="auth-email" className="text-xs font-semibold text-zinc-600 cursor-pointer">Email Address</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 pointer-events-none z-10">
                          <Mail size={15} />
                        </span>
                        <input
                          id="auth-email"
                          name="email"
                          type="email"
                          required
                          autoComplete="email"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder="alex@gmail.com or personal"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                        />
                      </div>

                      {/* Live Typo Auto-Suggestion Banner */}
                      {isSignUp && emailSuggestion && (
                        <div className="flex items-center justify-between bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1 text-[11px] text-amber-900 mt-1">
                          <span>
                            Did you mean <strong className="font-semibold">{emailSuggestion}</strong>?
                          </span>
                          <button
                            id="auth-apply-email-suggestion"
                            type="button"
                            onClick={() => setEmail(emailSuggestion)}
                            className="text-amber-700 font-bold hover:underline ml-2 cursor-pointer shrink-0"
                          >
                            Fix
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Phone Number - Sign Up Only */}
                    {isSignUp && !isReset && (
                      <div className="space-y-1">
                        <label htmlFor="auth-phone" className="text-xs font-semibold text-zinc-600 cursor-pointer">Phone Number</label>
                        <div className="relative flex items-center">
                          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none z-10 gap-1.5">
                            <span className="text-sm leading-none">{COUNTRIES.find(c => c.code === country)?.flag || '🇰🇪'}</span>
                            <span className="text-xs font-bold text-zinc-600 font-mono">{COUNTRIES.find(c => c.code === country)?.dialCode || '+254'}</span>
                            <span className="h-4 w-[1px] bg-zinc-200 ml-0.5" />
                          </div>
                          <input
                            id="auth-phone"
                            name="phone"
                            type="tel"
                            required
                            autoComplete="tel"
                            placeholder="700 000 000"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full pl-24 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800 font-medium"
                          />
                        </div>
                      </div>
                    )}

                    {/* Custom Reset Fields (New Password, Confirm Password) - Reset Only */}
                    {isReset && (
                      <>
                        {/* New Password */}
                        <div className="space-y-1">
                          <label htmlFor="auth-reset-new-password" className="text-xs font-semibold text-zinc-600 cursor-pointer">New Password</label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 pointer-events-none z-10">
                              <Lock size={15} />
                            </span>
                            <input
                              id="auth-reset-new-password"
                              name="newPassword"
                              type={showResetPassword ? 'text' : 'password'}
                              required
                              minLength={6}
                              autoComplete="new-password"
                              placeholder="••••••••"
                              value={resetNewPassword}
                              onChange={(e) => setResetNewPassword(e.target.value)}
                              className="w-full pl-9 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                            />
                            <button
                              type="button"
                              onClick={() => setShowResetPassword(!showResetPassword)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 focus:outline-none cursor-pointer z-10"
                              title={showResetPassword ? "Hide password" : "Show password"}
                            >
                              {showResetPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </div>

                        {/* Confirm New Password */}
                        <div className="space-y-1">
                          <label htmlFor="auth-reset-confirm-password" className="text-xs font-semibold text-zinc-600 cursor-pointer">Confirm New Password</label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 pointer-events-none z-10">
                              <Lock size={15} />
                            </span>
                            <input
                              id="auth-reset-confirm-password"
                              name="confirmPassword"
                              type={showResetPassword ? 'text' : 'password'}
                              required
                              minLength={6}
                              autoComplete="new-password"
                              placeholder="••••••••"
                              value={resetConfirmPassword}
                              onChange={(e) => setResetConfirmPassword(e.target.value)}
                              className="w-full pl-9 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Password Field - Login / Sign Up Only */}
                    {!isReset && (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label htmlFor="auth-password" className="text-xs font-semibold text-zinc-600 cursor-pointer">Password</label>
                          {!isSignUp && (
                            <button
                              id="auth-forgot-password"
                              type="button"
                              onClick={() => { navigate('/reset'); setError(null); }}
                              className="text-[11px] font-medium text-amber-600 hover:text-amber-700 hover:underline cursor-pointer"
                            >
                              Forgot?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 pointer-events-none z-10">
                            <Lock size={15} />
                          </span>
                          <input
                            id="auth-password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            autoComplete={isSignUp ? "new-password" : "current-password"}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-9 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 focus:outline-none cursor-pointer z-10"
                            title={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Confirm Password Field - Sign Up Only */}
                    {isSignUp && !isReset && (
                      <div className="space-y-1">
                        <label htmlFor="auth-confirm-password" className="text-xs font-semibold text-zinc-600 cursor-pointer">Confirm Password</label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 pointer-events-none z-10">
                            <Lock size={15} />
                          </span>
                          <input
                            id="auth-confirm-password"
                            name="confirmPassword"
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full pl-9 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 focus:outline-none cursor-pointer z-10"
                            title={showConfirmPassword ? "Hide password" : "Show password"}
                          >
                            {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Referral Code - Sign Up Only */}
                    {isSignUp && !isReset && (
                      <div className="space-y-1">
                        <label htmlFor="auth-referral" className="text-xs font-semibold text-zinc-600 cursor-pointer">Referral Code (Optional)</label>
                        <input
                          id="auth-referral"
                          name="referral"
                          type="text"
                          autoComplete="off"
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder="e.g. FRIEND50"
                          value={referral}
                          onChange={(e) => setReferral(e.target.value)}
                          className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                        />
                      </div>
                    )}

                    {/* Submit Button */}
                    <button
                      id="auth-submit-btn"
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 rounded-xl text-xs font-bold transition-all mt-4 disabled:bg-zinc-100 disabled:text-zinc-400 shadow-md shadow-amber-500/10 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Please wait...</span>
                        </>
                      ) : (
                        <span>
                          {isReset 
                            ? 'Update Password' 
                            : isSignUp 
                              ? 'Continue & Verify Email' 
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
                        className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 hover:underline"
                      >
                        Back to Sign In
                      </button>
                    ) : (
                      <p className="text-xs text-zinc-550">
                        {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                        <button
                          id="auth-toggle-btn"
                          onClick={() => { navigate(isSignUp ? '/login' : '/signup'); setError(null); }}
                          className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline"
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
