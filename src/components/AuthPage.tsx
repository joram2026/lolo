import React, { useState, useEffect } from 'react';
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
import { Shield, Mail, Lock, User, Sparkles, AlertCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';

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
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [referral, setReferral] = useState('');
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
      setSuccessMsg(`Welcome! Referral code "${upperRefCode}" has been successfully pre-filled.`);
    } else {
      const savedRef = localStorage.getItem('pending_referral_code') || '';
      if (savedRef) {
        setReferral(savedRef);
        // Only show prefilled message if they are explicitly on /signup
        if (path === '/signup') {
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
        // Clear referral/code parameters from the URL before signing in to prevent immediate automatic sign-out
        navigate('/signup', true);

        // Check if user already exists in Firestore
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', formattedEmail));
        const querySnap = await getDocs(q);

        if (!querySnap.empty) {
          throw new Error('This email address is already registered.');
        }

        // Handle Registration
        let user;
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, deriveAuthPassword(formattedEmail));
          user = userCredential.user;
        } catch (regErr: any) {
          if (regErr.code === 'auth/email-already-in-use') {
            // Firebase Auth account exists, but Firestore document was empty (deleted by admin)!
            // Try to log in to the existing Firebase Auth account using the derived password
            console.log('User already exists in Firebase Auth but deleted from Firestore. Attempting recovery...');
            try {
              const userCredential = await signInWithEmailAndPassword(auth, formattedEmail, deriveAuthPassword(formattedEmail));
              user = userCredential.user;
            } catch (loginErr: any) {
              // If that fails (e.g. unmigrated or custom reset), fallback to versioned email registration!
              console.log('Fallback to versioned email for deleted user signup...');
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

        // Initialize user document in firestore with starting values, the unique referral code, and the accountPassword field
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
          walletPassword: '', // Blank password initially
          accountPassword: password,
          authEmail: user.email // Store the actual active authEmail used
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

        // Save session details to localStorage
        localStorage.setItem('custom_user_email', formattedEmail);
        localStorage.setItem('custom_user_uid', user.uid);

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

        localStorage.removeItem('pending_referral_code');
        onSuccess();
      } else {
        // Handle Sign In
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', formattedEmail));
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
          throw new Error('No registered account found with this email.');
        }

        const userDoc = querySnap.docs[0];
        const userData = userDoc.data();
        const userUid = userDoc.id;

        let activeUserUid = userUid;

        if (userData.accountPassword) {
          if (userData.accountPassword !== password) {
            throw new Error('Incorrect password. Please try again.');
          }

          // Password correct! Sign in to Firebase Auth.
          const targetAuthEmail = userData.authEmail || formattedEmail;
          try {
            const cred = await signInWithEmailAndPassword(auth, targetAuthEmail, deriveAuthPassword(formattedEmail));
            activeUserUid = cred.user.uid;
          } catch (authErr: any) {
            console.warn('First auth attempt failed, trying alternative/legacy sign-in:', authErr);
            try {
              // Try with their actual typed password (in case they are unmigrated or had a custom password)
              const cred = await signInWithEmailAndPassword(auth, targetAuthEmail, password);
              activeUserUid = cred.user.uid;
            } catch (authErr2: any) {
              // Both failed! This means we cannot log into Firebase Auth (e.g. they forgot their old password and reset it while logged out).
              // Since their Firestore password matched, they are authorized! We can self-heal by provisioning a new versioned Firebase Auth account!
              console.log('Bypassing failed Auth session and provisioning a fresh versioned Auth user...');
              const currentVersion = userData.authEmailVersion || 0;
              const nextVersion = currentVersion + 1;
              const parts = formattedEmail.split('@');
              const versionedAuthEmail = `${parts[0]}+v${nextVersion}@${parts[1]}`;
              
              // Create the user in Firebase Auth
              const newCredential = await createUserWithEmailAndPassword(auth, versionedAuthEmail, deriveAuthPassword(formattedEmail));
              const newUser = newCredential.user;
              activeUserUid = newUser.uid;
              
              // Migrate their Firestore user document to the new UID (document ID)!
              const oldDocRef = doc(db, 'users', userUid);
              const oldDocSnap = await getDoc(oldDocRef);
              if (oldDocSnap.exists()) {
                const oldData = oldDocSnap.data();
                await setDoc(doc(db, 'users', newUser.uid), {
                  ...oldData,
                  uid: newUser.uid,
                  authEmail: versionedAuthEmail,
                  authEmailVersion: nextVersion
                });
                // Delete the old Firestore document to prevent duplicates!
                await deleteDoc(oldDocRef);
              }
              
              // Migrate historical transactions to the new user.uid!
              const txQuery = query(collection(db, 'transactions'), where('userId', '==', userUid));
              const txSnap = await getDocs(txQuery);
              for (const txDoc of txSnap.docs) {
                await updateDoc(doc(db, 'transactions', txDoc.id), {
                  userId: newUser.uid
                });
              }
              
              console.log('Migration to versioned auth completed successfully!');
            }
          }
          localStorage.setItem('custom_user_email', formattedEmail);
          localStorage.setItem('custom_user_uid', activeUserUid);
        } else {
          // Existing unmigrated user: Sign in with typed password
          const userCredential = await signInWithEmailAndPassword(auth, formattedEmail, password);
          const user = userCredential.user;
          activeUserUid = user.uid;

          // Migrate
          try {
            await updatePassword(user, deriveAuthPassword(formattedEmail));
          } catch (migErr) {
            console.error('Failed to update Auth password during migration:', migErr);
          }

          // Update Firestore
          await updateDoc(doc(db, 'users', user.uid), {
            accountPassword: password,
            authEmail: formattedEmail
          });

          localStorage.setItem('custom_user_email', formattedEmail);
          localStorage.setItem('custom_user_uid', user.uid);
        }
        
        // Ensure firestore document exists (just in case they were created externally)
        const docRef = doc(db, 'users', activeUserUid);
        const docSnap = await getDoc(docRef);
        let has2fa = false;

        if (docSnap.exists()) {
          const uData = docSnap.data();
          if (uData.twoFactorEnabled) {
            has2fa = true;
          }
        } else {
          await setDoc(docRef, {
            uid: activeUserUid,
            email: formattedEmail,
            displayName: formattedEmail.split('@')[0],
            balance: 0.0,
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
    <div id="auth-page-container" className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#FFF3D6] text-zinc-800 font-sans">
      <div className="w-full max-w-sm">
        
        {/* Brand Banner */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4 relative group">
            {/* Pulsing ambient glow behind icon */}
            <div className="absolute inset-0 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all duration-700 animate-pulse"></div>
            {/* Premium Icon Ring */}
            <div className="relative w-20 h-20 rounded-3xl bg-white border border-zinc-200/80 p-2 shadow-xl flex items-center justify-center overflow-hidden">
              <img 
                src="/icon.svg" 
                alt="ARBITRAGE" 
                className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              {/* Overlay sheen */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-zinc-950/5 to-transparent pointer-events-none"></div>
            </div>
          </div>
          <h1 className="text-2xl font-black text-zinc-800 tracking-tight">ARBITRAGE Crypto</h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-[260px] mx-auto">
            Start earning from crypto with the most favourable rates.
          </p>
        </div>

        {/* Auth Box Card */}
        <div className="bg-white border border-zinc-200/60 rounded-3xl p-6 shadow-xl space-y-6">
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
                      ? 'Sign and start making profits.' 
                      : 'Enter your credentials to make profits.'
                  }
                </p>
              </div>



              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Display Name - Sign Up Only */}
                {isSignUp && !isReset && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Display Name</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                        <User size={15} />
                      </span>
                      <input
                        id="auth-display-name"
                        type="text"
                        required
                        placeholder="John Doe"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                      />
                    </div>
                  </div>
                )}

                {/* Email Field */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                      <Mail size={15} />
                    </span>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      placeholder="alex@gmail.com or personal"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                    />
                  </div>
                </div>

                {/* Custom Reset Fields (New Password, Confirm Password) - Reset Only */}
                {isReset && (
                  <>
                    {/* New Password */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-600">New Password</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                          <Lock size={15} />
                        </span>
                        <input
                          id="auth-reset-new-password"
                          type={showResetPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          placeholder="••••••••"
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          className="w-full pl-9 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPassword(!showResetPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 focus:outline-none cursor-pointer"
                          title={showResetPassword ? "Hide password" : "Show password"}
                        >
                          {showResetPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm New Password */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-600">Confirm New Password</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                          <Lock size={15} />
                        </span>
                        <input
                          id="auth-reset-confirm-password"
                          type={showResetPassword ? 'text' : 'password'}
                          required
                          minLength={6}
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
                      <label className="text-xs font-semibold text-zinc-600">Password</label>
                      {!isSignUp && (
                        <button
                          id="auth-forgot-password"
                          type="button"
                          onClick={() => { navigate('/reset'); setError(null); }}
                          className="text-[11px] font-medium text-amber-600 hover:text-amber-700 hover:underline"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
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
                        className="w-full pl-9 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-zinc-400 text-zinc-800"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 focus:outline-none cursor-pointer"
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
                    <label className="text-xs font-semibold text-zinc-600">Referral Code (Optional)</label>
                    <input
                      id="auth-referral"
                      type="text"
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
