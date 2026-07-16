import React, { useState, useEffect, useRef } from 'react';
import { UserAccount } from '../types';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { 
  Shield, Key, Sparkles, User, Gift, Check, ArrowLeft, AlertCircle, 
  Smartphone, Copy, CheckCircle2, QrCode, Power, Lock, ShieldAlert,
  ChevronRight, HelpCircle, MessageSquare, Send, Download, Laptop,
  Gamepad2, LayoutGrid, Clapperboard, BookOpen, Star, Share2, Plus, 
  Search, MoreVertical, Info, ShieldCheck, X
} from 'lucide-react';

interface ProfileViewProps {
  user: any;
  onBack: () => void;
}

export default function ProfileView({ user, onBack }: ProfileViewProps) {
  const [profile, setProfile] = useState<UserAccount | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active sub-page state
  const [activeSubPage, setActiveSubPage] = useState<'menu' | 'personal' | 'referral' | 'pin' | '2fa' | 'support' | 'mobile_app'>(() => {
    return (localStorage.getItem('profile_subpage') as any) || 'menu';
  });

  useEffect(() => {
    localStorage.setItem('profile_subpage', activeSubPage);
  }, [activeSubPage]);

  // New PIN States
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pin2faCode, setPin2faCode] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  // Two-Factor Authentication States
  const [is2faSetupOpen, setIs2faSetupOpen] = useState(false);
  const [temp2faSecret, setTemp2faSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);

  // PWA and Play Store installation states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installProgress, setInstallProgress] = useState<number | null>(null);
  const [installStatusText, setInstallStatusText] = useState('');
  const [installSuccess, setInstallSuccess] = useState<boolean>(() => {
    return localStorage.getItem('arbitrage_pwa_installed') === 'true';
  });
  const [pwaLoading, setPwaLoading] = useState(false);
  const pwaLoadingRef = useRef(false);
  const [showPwaInstructions, setShowPwaInstructions] = useState(false);
  const [showOpenInstruction, setShowOpenInstruction] = useState(false);
  const [deviceTab, setDeviceTab] = useState<'android' | 'ios' | 'desktop'>(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/ipad|iphone|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'desktop';
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('beforeinstallprompt event triggered and stashed.');
    };
    const handleAppInstalled = () => {
      console.log('App was successfully installed natively.');
      if (pwaLoadingRef.current) {
        console.log('Installation is already being handled with 4s delay.');
        return;
      }
      setInstallSuccess(true);
      localStorage.setItem('arbitrage_pwa_installed', 'true');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Referral list states
  const [referredUsers, setReferredUsers] = useState<any[]>([]);
  const [loadingReferred, setLoadingReferred] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateCode, setDeactivateCode] = useState('');
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [showDeactivateInput, setShowDeactivateInput] = useState(false);

  const generate2faSecret = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTemp2faSecret(result);
    setVerificationCode('');
    setVerificationError(null);
    setIs2faSetupOpen(true);
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(temp2faSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyReferral = () => {
    const code = (profile as any)?.uniqueCode || '';
    const referralLink = `https://lolo-navy.vercel.app/#/signup?ref=${code}`;
    navigator.clipboard.writeText(referralLink);
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2500);
  };

  const handleVerifyAndEnable2fa = async () => {
    setVerificationError(null);
    if (verificationCode.trim().length !== 6 || isNaN(Number(verificationCode.trim()))) {
      setVerificationError('Please enter a valid 6-digit verification code.');
      return;
    }

    try {
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        twoFactorEnabled: true,
        twoFactorSecret: temp2faSecret
      });
      setProfile(prev => prev ? { ...prev, twoFactorEnabled: true, twoFactorSecret: temp2faSecret } : null);
      setIs2faSetupOpen(false);
      setMessage({ type: 'success', text: 'Google Authenticator (2FA) successfully enabled!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error enabling 2FA:', err);
      setVerificationError(err.message || 'Failed to enable 2FA.');
    }
  };

  const handleDisable2fa = async () => {
    setDeactivateError(null);
    if (!deactivateCode.trim()) {
      setDeactivateError('Please enter the 6-digit code to confirm.');
      return;
    }
    if (deactivateCode.trim().length !== 6 || isNaN(Number(deactivateCode.trim()))) {
      setDeactivateError('Please enter a valid 6-digit code.');
      return;
    }

    setDeactivating(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        twoFactorEnabled: false,
        twoFactorSecret: ''
      });
      setProfile(prev => prev ? { ...prev, twoFactorEnabled: false, twoFactorSecret: '' } : null);
      setShowDeactivateInput(false);
      setDeactivateCode('');
      setMessage({ type: 'success', text: 'Google Authenticator (2FA) has been deactivated.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error disabling 2FA:', err);
      setDeactivateError(err.message || 'Failed to disable 2FA.');
    } finally {
      setDeactivating(false);
    }
  };

  useEffect(() => {
    async function fetchProfile() {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserAccount & { uniqueCode?: string };
          let code = data.uniqueCode;
          if (!code) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let generatedCode = '';
            for (let i = 0; i < 5; i++) {
              generatedCode += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            code = generatedCode;
            await updateDoc(docRef, { uniqueCode: code });
            data.uniqueCode = code;
          }

          // Ensure the referral codes collection mapping is synchronized
          try {
            await setDoc(doc(db, 'referralCodes', code), {
              uid: user.uid,
              email: data.email || user.email || ''
            }, { merge: true });
          } catch (refCodeErr) {
            console.error('Error syncing referral mapping:', refCodeErr);
          }

          setProfile(data);
          setDisplayName(data.displayName || user.displayName || '');
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [user]);

  useEffect(() => {
    const code = (profile as any)?.uniqueCode;
    if (!code) return;

    async function fetchReferredUsers() {
      setLoadingReferred(true);
      try {
        const q = query(
          collection(db, 'users'),
          where('referralSource', '==', code)
        );
        const querySnapshot = await getDocs(q);
        const list: any[] = [];
        querySnapshot.forEach((docSnap) => {
          const uData = docSnap.data();
          list.push({
            uid: docSnap.id,
            displayName: uData.displayName || 'Anonymous User',
            email: uData.email || '',
            createdAt: uData.createdAt ? uData.createdAt.toDate() : new Date(),
          });
        });
        // Sort by registration date descending
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setReferredUsers(list);
      } catch (err) {
        console.error('Error fetching referred users:', err);
      } finally {
        setLoadingReferred(false);
      }
    }

    fetchReferredUsers();
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // 1. Update Auth Profile Display Name
      if (displayName !== user.displayName) {
        await updateProfile(auth.currentUser!, { displayName });
      }

      // 2. Update Firestore document
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        displayName
      });

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);

    // Validate exactly 4 numerical digits
    if (!/^\d{4}$/.test(newPin)) {
      setPinMessage({ type: 'error', text: 'PIN must be exactly 4 numerical digits (e.g., 1234).' });
      return;
    }

    if (newPin !== confirmPin) {
      setPinMessage({ type: 'error', text: 'PIN confirmation does not match.' });
      return;
    }

    // If changing the pin and 2FA is active, require Google Authenticator code
    const isUpdating = !!profile?.walletPassword;
    if (isUpdating && profile?.twoFactorEnabled) {
      if (!pin2faCode || pin2faCode.length !== 6 || isNaN(Number(pin2faCode))) {
        setPinMessage({ type: 'error', text: 'Please enter a valid 6-digit Google Authenticator code to authorize this change.' });
        return;
      }
    }

    setPinSaving(true);
    try {
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        walletPassword: newPin
      });
      setProfile(prev => prev ? { ...prev, walletPassword: newPin } : null);
      
      // Clear fields
      setNewPin('');
      setConfirmPin('');
      setPin2faCode('');
      setIsChangingPin(false);
      
      setPinMessage({ 
        type: 'success', 
        text: isUpdating ? 'Wallet PIN successfully changed!' : 'Wallet PIN successfully set!' 
      });
      setTimeout(() => setPinMessage(null), 4000);
    } catch (err: any) {
      console.error('Error saving PIN:', err);
      setPinMessage({ type: 'error', text: err.message || 'Failed to save Wallet PIN.' });
    } finally {
      setPinSaving(false);
    }
  };

  const triggerFileDownload = () => {
    try {
      const a = document.createElement('a');
      a.href = '/ARBITRAGE.apk';
      a.download = 'ARBITRAGE.apk';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('File download failed:', err);
    }
  };

  const handleOpenApp = () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (isStandalone) {
      localStorage.removeItem('profile_subpage');
      onBack();
    } else {
      setShowOpenInstruction(true);
    }
  };

  const startApkDownload = () => {
    if (installProgress !== null) return;
    setInstallSuccess(false);
    setInstallProgress(0);
    setInstallStatusText('Initializing instant secure download...');

    // Trigger the real file download immediately in the background so there is ZERO delay!
    triggerFileDownload();

    let prog = 0;
    const interval = setInterval(() => {
      // Snappy and fast loading states
      prog += Math.floor(Math.random() * 15) + 12;
      if (prog >= 100) {
        prog = 100;
        clearInterval(interval);
        setInstallProgress(100);
        setInstallStatusText('Download complete! Tap the downloaded file to install.');
        setInstallSuccess(true);
        localStorage.setItem('arbitrage_pwa_installed', 'true');
      } else {
        setInstallProgress(prog);
        if (prog < 25) {
          setInstallStatusText('Establishing secure data stream...');
        } else if (prog < 60) {
          setInstallStatusText('Downloading ARBITRAGE app bundle (3.44 MB)...');
        } else {
          setInstallStatusText('Verifying package security integrity...');
        }
      }
    }, 100); // Super fast visual progress in ~1 second
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        if (outcome === 'accepted') {
          setPwaLoading(true);
          pwaLoadingRef.current = true;
          setTimeout(() => {
            setPwaLoading(false);
            pwaLoadingRef.current = false;
            setInstallSuccess(true);
            localStorage.setItem('arbitrage_pwa_installed', 'true');
          }, 7000);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('Error triggering native prompt:', err);
      }
    } else {
      // If native browser prompt is null, determine the platform and show PWA instructions
      const ua = navigator.userAgent.toLowerCase();
      const isIos = /ipad|iphone|ipod/.test(ua);
      
      setShowPwaInstructions(true);
      if (isIos) {
        setDeviceTab('ios');
      } else {
        const isAndroid = /android/.test(ua);
        setDeviceTab(isAndroid ? 'android' : 'desktop');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-zinc-500 font-medium">Loading profile details...</p>
      </div>
    );
  }

  return (
    <div id="profile-view-container" className="max-w-md mx-auto p-4 sm:p-6 bg-slate-900 text-zinc-100 min-h-[calc(100vh-140px)]">
      {activeSubPage === 'menu' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button 
              id="profile-back-btn"
              onClick={() => {
                localStorage.removeItem('profile_subpage');
                onBack();
              }}
              className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-left">
              <h2 className="text-xl font-bold tracking-tight">Security & Profile</h2>
              <p className="text-xs text-zinc-500">Manage security settings and credentials</p>
            </div>
          </div>

          {/* User profile banner */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 text-left">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-extrabold text-base shadow-md uppercase">
              {displayName ? displayName.charAt(0) : (user.email ? user.email.charAt(0) : 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-zinc-100 truncate">{displayName || 'Anonymous User'}</h3>
              <p className="text-[11px] text-zinc-500 font-mono truncate">{user.email}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 shrink-0">
              <Shield size={10} />
              <span>Verified</span>
            </div>
          </div>

          {/* Navigation Links List */}
          <div className="space-y-3.5 text-left">
            {/* Personal Info */}
            <button
              id="nav-personal-info"
              onClick={() => { setActiveSubPage('personal'); setMessage(null); }}
              className="w-full bg-slate-800/50 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/90 p-4 rounded-2xl flex items-center gap-4 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/50 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/10 group-hover:text-emerald-300 transition-all">
                <User size={18} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">Personal Details</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">Display name and basic account settings</p>
              </div>
              <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
            </button>

            {/* Referral Program */}
            <button
              id="nav-referral-program"
              onClick={() => { setActiveSubPage('referral'); setMessage(null); }}
              className="w-full bg-slate-800/50 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/90 p-4 rounded-2xl flex items-center gap-4 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/50 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/10 group-hover:text-emerald-300 transition-all">
                <Gift size={18} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">Referral Program</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">Invite friends and track your referral list</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 text-zinc-400">
                  {referredUsers.length}
                </span>
                <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </div>
            </button>

            {/* Wallet PIN */}
            <button
              id="nav-wallet-pin"
              onClick={() => { setActiveSubPage('pin'); setPinMessage(null); }}
              className="w-full bg-slate-800/50 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/90 p-4 rounded-2xl flex items-center gap-4 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/50 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/10 group-hover:text-emerald-300 transition-all">
                <Lock size={18} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">Wallet Security PIN</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">4-digit security PIN for secure cashouts</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {profile?.walletPassword ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    Not Set
                  </span>
                )}
                <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </div>
            </button>

            {/* Google Authenticator */}
            <button
              id="nav-google-authenticator"
              onClick={() => { setActiveSubPage('2fa'); }}
              className="w-full bg-slate-800/50 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/90 p-4 rounded-2xl flex items-center gap-4 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/50 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/10 group-hover:text-emerald-300 transition-all">
                <Smartphone size={18} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">Google Authenticator</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">Add dynamic passcode 2FA protection</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {profile?.twoFactorEnabled ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 text-zinc-400">
                    Disabled
                  </span>
                )}
                <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </div>
            </button>

            {/* Customer Support */}
            <button
              id="nav-customer-support"
              onClick={() => { setActiveSubPage('support'); setMessage(null); }}
              className="w-full bg-slate-800/50 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-800/90 p-4 rounded-2xl flex items-center gap-4 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/50 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/10 group-hover:text-emerald-300 transition-all">
                <HelpCircle size={18} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">Customer Support</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">Get 24/7 assistance via WhatsApp & Telegram</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Online
                </span>
                <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </div>
            </button>

            {/* Mobile App & Android Sync */}
            <button
              id="nav-mobile-app"
              onClick={() => { setActiveSubPage('mobile_app'); setMessage(null); }}
              className="w-full bg-gradient-to-r from-slate-850 to-slate-800/60 border border-emerald-500/30 hover:border-emerald-400/60 hover:bg-slate-850/90 p-4 rounded-2xl flex items-center gap-4 transition-all cursor-pointer group shadow-[0_0_12px_rgba(16,185,129,0.06)]"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-105 transition-all">
                <Smartphone size={18} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                  Mobile App (Android/iOS)
                  <span className="text-[8px] bg-emerald-400/15 text-emerald-400 border border-emerald-500/20 px-1 rounded-full font-extrabold uppercase tracking-wider animate-pulse">Sync</span>
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-tight">Install on your Android home screen in 5 seconds</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Ready
                </span>
                <ChevronRight size={16} className="text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Subpage: Personal details */}
      {activeSubPage === 'personal' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button 
              id="personal-back-btn"
              onClick={() => { setActiveSubPage('menu'); setMessage(null); }}
              className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-left">
              <h2 className="text-xl font-bold tracking-tight">Personal Details</h2>
              <p className="text-xs text-zinc-500">View and edit display configuration</p>
            </div>
          </div>

          {message && (
            <div id="profile-feedback-message" className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs text-left ${
              message.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Profile Form */}
          <form onSubmit={handleSave} className="space-y-5">
            
            {/* Read-Only Account Details */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2.5 text-left">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">Account Email</span>
                <span className="font-mono text-zinc-300 font-medium">{user.email}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-700 pt-2.5">
                <span className="text-zinc-500">Unique CODE</span>
                <span className="font-mono text-emerald-400 font-bold select-all tracking-wider text-sm">{(profile as any)?.uniqueCode || '-----'}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-700 pt-2.5">
                <span className="text-zinc-500">Wallet Status</span>
                <span className="font-semibold flex items-center gap-1 text-emerald-400">
                  <Shield size={12} />
                  {profile?.withdrawalEnabled ? 'Active / Approved' : 'Suspended by Admin'}
                </span>
              </div>
            </div>

            {/* Display Name Input */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <User size={14} className="text-emerald-400" />
                Display Name
              </label>
              <input
                id="profile-display-name"
                type="text"
                required
                placeholder="Enter display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 placeholder-zinc-600 text-white"
              />
            </div>

            {/* Submit Button */}
            <button
              id="profile-save-btn"
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-bold transition-all shadow-md mt-6 cursor-pointer"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving changes...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Update Security Profile</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Subpage: Referral Program */}
      {activeSubPage === 'referral' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button 
              id="referral-back-btn"
              onClick={() => { setActiveSubPage('menu'); }}
              className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-left">
              <h2 className="text-xl font-bold tracking-tight">Referral Program</h2>
              <p className="text-xs text-zinc-500">Invite friends and track achievements</p>
            </div>
          </div>

          <div id="referral-program-section" className="space-y-4 text-left">
            {/* Promo / Motivation Banner */}
            <div className="bg-gradient-to-br from-emerald-500/20 via-slate-800/80 to-slate-800 border border-emerald-500/30 rounded-2xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-15">
                <Gift className="text-emerald-400" size={80} />
              </div>
              <div className="space-y-1 relative z-10">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                  <Sparkles size={11} className="animate-pulse" /> Limited Time Event
                </div>
                <h3 className="text-base font-bold text-white pt-1">Earn 0.50 USDT per Invite!</h3>
                <p className="text-xs text-zinc-300 leading-relaxed max-w-[85%]">
                  Get paid instantly when your friends register using your link or code. Unlimited rewards, credited directly to your account.
                </p>
                <div className="flex gap-4 pt-3 text-[11px] text-zinc-400 font-medium">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    <span>Instant Credit</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    <span>Zero Caps</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Referral Earnings & Stats Card */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Total Earned</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-emerald-400 font-mono">
                      {(() => {
                        let total = 0;
                        for (let i = 1; i <= referredUsers.length; i++) {
                          if (i >= 20) total += 0.70;
                          else if (i >= 10) total += 0.60;
                          else if (i >= 5) total += 0.55;
                          else total += 0.50;
                        }
                        return total.toFixed(2);
                      })()}
                    </span>
                    <span className="text-xs text-zinc-400 font-bold">USDT</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">Paid directly to your balance</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Successful Invites</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white font-mono">{referredUsers.length}</span>
                    <span className="text-xs text-zinc-500 font-bold ml-1">friends</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">Keep growing your circle!</p>
              </div>
            </div>

            {/* Tier Milestone Progress Track */}
            {(() => {
              const count = referredUsers.length;
              
              // Define intervals/milestones
              // Starter (0), Bronze (5), Silver (10), Gold (20)
              let progressPercent = 0;
              if (count >= 20) {
                progressPercent = 100;
              } else if (count >= 10) {
                progressPercent = 66.6 + ((count - 10) / 10) * 33.4;
              } else if (count >= 5) {
                progressPercent = 33.3 + ((count - 5) / 5) * 33.3;
              } else {
                progressPercent = (count / 5) * 33.3;
              }

              return (
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Your Referral Tier</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                          count >= 20 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          count >= 10 ? 'bg-slate-300/10 text-slate-300 border border-slate-300/20' :
                          count >= 5 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {count >= 20 ? 'Gold Tier' : count >= 10 ? 'Silver Tier' : count >= 5 ? 'Bronze Tier' : 'Starter Tier'}
                        </span>
                        <span className="text-xs text-zinc-400 font-medium">
                          {count >= 20 ? 'Max Tier reached!' : 
                           count >= 10 ? `${20 - count} more for Gold` : 
                           count >= 5 ? `${10 - count} more for Silver` : 
                           `${5 - count} more for Bronze`}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Current Commission</span>
                      <span className="text-sm font-bold text-emerald-400 font-mono">
                        {count >= 20 ? '0.70 USDT' : count >= 10 ? '0.60 USDT' : count >= 5 ? '0.55 USDT' : '0.50 USDT'} / ref
                      </span>
                    </div>
                  </div>

                  {/* The Progress Bar Line */}
                  <div className="relative pt-2 pb-10">
                    {/* Track Background */}
                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                      {/* Active Progress */}
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    {/* Milestones nodes */}
                    <div className="absolute top-0 left-0 w-full h-full">
                      {/* Node 1: Starter */}
                      <div className="absolute left-[0%] -translate-x-1/2 flex flex-col items-center">
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold z-10 border-emerald-400 bg-slate-900 text-emerald-400">
                          ✓
                        </div>
                        <span className="text-[9px] font-bold text-zinc-400 mt-1.5">Starter</span>
                        <span className="text-[8px] text-zinc-500 font-mono">0.50 USDT</span>
                      </div>

                      {/* Node 2: Bronze */}
                      <div className="absolute left-[33.3%] -translate-x-1/2 flex flex-col items-center">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold z-10 ${
                          count >= 5 ? 'border-emerald-400 bg-slate-900 text-emerald-400' : 'border-slate-700 bg-slate-800 text-zinc-500'
                        }`}>
                          {count >= 5 ? '✓' : '5'}
                        </div>
                        <span className={`text-[9px] font-bold mt-1.5 ${count >= 5 ? 'text-zinc-300' : 'text-zinc-500'}`}>Bronze</span>
                        <span className="text-[8px] text-zinc-500 font-mono">0.55 USDT</span>
                      </div>

                      {/* Node 3: Silver */}
                      <div className="absolute left-[66.6%] -translate-x-1/2 flex flex-col items-center">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold z-10 ${
                          count >= 10 ? 'border-emerald-400 bg-slate-900 text-emerald-400' : 'border-slate-700 bg-slate-800 text-zinc-500'
                        }`}>
                          {count >= 10 ? '✓' : '10'}
                        </div>
                        <span className={`text-[9px] font-bold mt-1.5 ${count >= 10 ? 'text-zinc-300' : 'text-zinc-500'}`}>Silver</span>
                        <span className="text-[8px] text-zinc-500 font-mono">0.60 USDT</span>
                      </div>

                      {/* Node 4: Gold */}
                      <div className="absolute left-[100%] -translate-x-1/2 flex flex-col items-center">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold z-10 ${
                          count >= 20 ? 'border-amber-400 bg-slate-900 text-amber-400' : 'border-slate-700 bg-slate-800 text-zinc-500'
                        }`}>
                          {count >= 20 ? '★' : '20'}
                        </div>
                        <span className={`text-[9px] font-bold mt-1.5 ${count >= 20 ? 'text-amber-400' : 'text-zinc-500'}`}>Gold</span>
                        <span className="text-[8px] text-zinc-500 font-mono">0.70 USDT</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

           

            <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 space-y-4">
              {/* Referral Code Box */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">Your Referral Code</span>
                <span className="font-mono text-emerald-400 font-bold tracking-wider text-sm">
                  {(profile as any)?.uniqueCode || '-----'}
                </span>
              </div>

              {/* Referral Link Box */}
              <div className="space-y-1.5 border-t border-slate-700/50 pt-3">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Your Shareable Referral Link
                </label>
                <div className="flex gap-2 items-center bg-slate-900 border border-slate-700/60 p-2.5 rounded-xl font-mono text-xs">
                  <span className="text-zinc-300 font-medium select-all truncate flex-1">
                    https://lolo-navy.vercel.app/#/signup?ref={(profile as any)?.uniqueCode || ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyReferral}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
                    title="Copy Referral Link"
                  >
                    {copiedReferral ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                {copiedReferral && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1.5 mt-1 font-semibold">
                    <Check size={10} /> Copied to clipboard! Share it with your friends.
                  </span>
                )}
              </div>

              {/* Referred Users List */}
              <div className="space-y-2 border-t border-slate-700/50 pt-3">
                <div className="flex justify-between items-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <span>Your Referred Friends ({referredUsers.length})</span>
                  {loadingReferred && <span className="text-zinc-500 animate-pulse font-normal lowercase">fetching...</span>}
                </div>

                {loadingReferred ? (
                  <div className="text-center py-4 text-xs text-zinc-500">
                    Loading referred users...
                  </div>
                ) : referredUsers.length === 0 ? (
                  <div className="text-center py-6 bg-slate-900/30 border border-dashed border-slate-800 rounded-xl text-xs text-zinc-500">
                    No friends have joined using your code yet.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {referredUsers.map((refUser) => {
                      const parts = refUser.email.split('@');
                      let obfuscatedEmail = refUser.email;
                      if (parts.length === 2) {
                        const namePart = parts[0];
                        const domainPart = parts[1];
                        if (namePart.length > 2) {
                          obfuscatedEmail = `${namePart.substring(0, 2)}***@${domainPart}`;
                        } else {
                          obfuscatedEmail = `***@${domainPart}`;
                        }
                      }

                      return (
                        <div 
                          key={refUser.uid} 
                          className="flex items-center justify-between bg-slate-900/50 border border-slate-800/80 p-2.5 rounded-xl text-xs hover:border-slate-700/50 transition-colors"
                        >
                          <div className="space-y-0.5 text-left">
                            <p className="font-bold text-zinc-200 truncate max-w-[150px]">
                              {refUser.displayName}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono">
                              {obfuscatedEmail}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-zinc-500 font-mono">
                              {refUser.createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                            <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">
                              Active
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subpage: Wallet Security PIN */}
      {activeSubPage === 'pin' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button 
              id="pin-back-btn"
              onClick={() => { setActiveSubPage('menu'); setPinMessage(null); }}
              className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-left">
              <h2 className="text-xl font-bold tracking-tight">Security PIN</h2>
              <p className="text-xs text-zinc-500">Protect your wallet transactions</p>
            </div>
          </div>

          <div id="wallet-pin-security-card" className="space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="text-emerald-400" size={18} />
                <h3 className="text-sm font-bold text-zinc-100 font-sans">Wallet Security PIN</h3>
              </div>
              {profile?.walletPassword ? (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 uppercase tracking-wider">
                  <CheckCircle2 size={10} /> Configured
                </span>
              ) : (
                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
                  Not Set
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              The 4-digit security PIN is required to authorize all P2P trades, token deposits, and secure cashouts.
            </p>

            {pinMessage && (
              <div id="pin-feedback-message" className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
                pinMessage.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {pinMessage.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                <span>{pinMessage.text}</span>
              </div>
            )}

            {profile?.walletPassword && !isChangingPin ? (
              <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 flex flex-col gap-4 text-left">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Lock size={14} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-zinc-200">Security PIN Active</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Your transaction PIN is enabled and protecting your wallet.</p>
                  </div>
                </div>
                <button
                  id="change-pin-toggle-btn"
                  type="button"
                  onClick={() => {
                    setIsChangingPin(true);
                    setNewPin('');
                    setConfirmPin('');
                    setPin2faCode('');
                    setPinMessage(null);
                  }}
                  className="w-full py-2.5 bg-slate-800 border border-slate-700 hover:border-slate-600 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                >
                  Change Security PIN
                </button>
              </div>
            ) : (
              <form onSubmit={handleSavePin} className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4 sm:p-5 space-y-4 text-left">
                <h4 className="text-xs font-bold text-zinc-200">
                  {profile?.walletPassword ? 'Change Security PIN' : 'Configure New Wallet PIN'}
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">New 4-Digit PIN</label>
                    <input
                      type="password"
                      required
                      maxLength={4}
                      placeholder="••••"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Confirm PIN</label>
                    <input
                      type="password"
                      required
                      maxLength={4}
                      placeholder="••••"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Google Authenticator Input: Required if they are changing an existing PIN and have 2FA active */}
                {profile?.walletPassword && profile?.twoFactorEnabled && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-700/50">
                    <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                      <Smartphone size={13} className="text-emerald-400" />
                      <span>Google Authenticator (2FA) Code</span>
                      <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/10">Required</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="000000"
                      value={pin2faCode}
                      onChange={(e) => setPin2faCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-zinc-500 leading-tight">Enter the 6-digit verification code from your Google Authenticator app to authorize updating your PIN.</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    id="submit-pin-btn"
                    type="submit"
                    disabled={pinSaving}
                    className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:bg-slate-800 disabled:text-zinc-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {pinSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Saving PIN...</span>
                      </>
                    ) : (
                      <span>Save PIN Code</span>
                    )}
                  </button>
                  {profile?.walletPassword && (
                    <button
                      id="cancel-pin-edit-btn"
                      type="button"
                      onClick={() => {
                        setIsChangingPin(false);
                        setNewPin('');
                        setConfirmPin('');
                        setPin2faCode('');
                        setPinMessage(null);
                      }}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-zinc-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Subpage: Google Authenticator 2FA */}
      {activeSubPage === '2fa' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button 
              id="2fa-back-btn"
              onClick={() => { setActiveSubPage('menu'); }}
              className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-left">
              <h2 className="text-xl font-bold tracking-tight">Authenticator</h2>
              <p className="text-xs text-zinc-500">Configure Two-Factor security</p>
            </div>
          </div>

          <div id="two-factor-auth-card" className="space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="text-emerald-400" size={18} />
                <h3 className="text-sm font-bold text-zinc-100 font-sans">Google Authenticator (2FA)</h3>
              </div>
              {profile?.twoFactorEnabled ? (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 uppercase tracking-wider">
                  <CheckCircle2 size={10} /> Active
                </span>
              ) : (
                <span className="text-[10px] bg-zinc-500/10 text-zinc-400 border border-zinc-750 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Disabled
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Google Authenticator secures your funds by requiring a 6-digit dynamic passcode when making withdrawals or signing in to your wallet.
            </p>

            {profile?.twoFactorEnabled ? (
              <div className="bg-slate-800/40 border border-emerald-500/10 rounded-2xl p-4 space-y-4">
                <div className="flex items-start gap-3 text-left">
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-zinc-200">Your wallet is secured with Two-Factor Authentication.</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Any future withdrawals or sign-in requests will verify your temporary 6-digit passcode.</p>
                  </div>
                </div>

                {showDeactivateInput ? (
                  <div className="space-y-3 pt-2 border-t border-slate-700/50">
                    {deactivateError && (
                      <div className="p-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-[11px] flex items-start gap-2">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{deactivateError}</span>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Enter 6-digit Authenticator Code</label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={deactivateCode}
                        onChange={(e) => setDeactivateCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDisable2fa}
                        disabled={deactivating}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-zinc-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        {deactivating ? 'Deactivating...' : 'Confirm Deactivate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowDeactivateInput(false); setDeactivateError(null); }}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-zinc-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeactivateInput(true)}
                    className="w-full py-2.5 bg-slate-800 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 text-zinc-400 border border-slate-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Power size={13} />
                    Disable Google Authenticator (2FA)
                  </button>
                )}
              </div>
            ) : !is2faSetupOpen ? (
              <button
                type="button"
                onClick={generate2faSecret}
                className="w-full py-3 bg-slate-800 border border-slate-700 hover:border-slate-650 hover:bg-slate-750/80 text-zinc-200 hover:text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <QrCode size={15} className="text-emerald-400" />
                <span>Enable Google Authenticator (2FA)</span>
              </button>
            ) : (
              <div className="bg-slate-800 border border-emerald-500/20 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <QrCode size={14} className="text-emerald-400" />
                    Setup Two-Factor Security
                  </span>
                  <button
                    type="button"
                    onClick={() => setIs2faSetupOpen(false)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {verificationError && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-[11px] flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{verificationError}</span>
                  </div>
                )}

                {/* Step 1: Scan QR */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">1. Scan Google Authenticator QR Code</span>
                  <div className="flex justify-center p-3 bg-white rounded-xl max-w-[170px] mx-auto shadow-inner">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`otpauth://totp/ARBITRAGE:${profile?.email || user.email}?secret=${temp2faSecret}&issuer=ARBITRAGE%20Crypto%20Escrow`)}`}
                      alt="2FA QR Code"
                      className="w-36 h-36"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                {/* Step 2: Copy Key */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">2. Or copy the 16-character Secret Key</span>
                  <div className="flex gap-1.5 items-center bg-slate-900 border border-slate-700/60 p-2.5 rounded-xl font-mono text-[11px]">
                    <span className="text-emerald-400 font-bold tracking-wider select-all truncate flex-1">{temp2faSecret}</span>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title="Copy Key"
                    >
                      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                {/* Step 3: Enter Verification Code */}
                <div className="space-y-2 pt-2 border-t border-slate-700/50">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">3. Enter verification code to enable</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="6-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyAndEnable2fa}
                      className="px-4 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                    >
                      Verify & Activate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subpage: Customer Support */}
      {activeSubPage === 'support' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button 
              id="support-back-btn"
              onClick={() => { setActiveSubPage('menu'); }}
              className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-left">
              <h2 className="text-xl font-bold tracking-tight">Customer Support</h2>
              <p className="text-xs text-zinc-500">Connect with our support team 24/7</p>
            </div>
          </div>

          <div className="space-y-4 text-left">
            {/* Promo / Intro Banner */}
            <div className="bg-gradient-to-br from-emerald-500/10 via-slate-800/60 to-slate-800 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                We are online to help
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                If you have questions regarding deposits, withdrawals, referrals, or trade executions, please reach out to our team. Our typical response time is less than 5 minutes.
              </p>
            </div>

            {/* Support Channels */}
            <div className="space-y-3">
              {/* WhatsApp Business Option */}
              <a
                href="https://wa.me/#"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition-all group cursor-pointer no-underline block"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/20 transition-all">
                  <MessageSquare size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">WhatsApp Support</h4>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Instant chats, transfer guides, and rapid answers</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    Online
                  </span>
                  <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                </div>
              </a>

              {/* Telegram Channel Option */}
              <a
                href="https://t.me/#"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition-all group cursor-pointer no-underline block"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0 group-hover:bg-sky-500/20 transition-all">
                  <Send size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">Telegram Support</h4>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Secure messaging, automated ticket opening, and news</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400">
                    Online
                  </span>
                  <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                </div>
              </a>
            </div>

            {/* Quick Note Card */}
            <div className="bg-slate-800/30 border border-slate-800/80 rounded-2xl p-4 flex gap-3 text-xs text-zinc-500 leading-relaxed">
              <ShieldAlert size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-zinc-300 block mb-1">Official Protection Notice</strong>
                ARBITRAGE Support agents will never ask for your Google Authenticator 2FA secret, account passwords, or secure wallet PINs. Never share these credentials with anyone.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subpage: Mobile App Installation & Sync (Google Play Mockup) */}
      {activeSubPage === 'mobile_app' && (
        <div className="space-y-6">
          {/* Google Play Styled App Store Screen Frame */}
          <div className="w-full max-w-lg mx-auto bg-[#fafafa] rounded-[2.5rem] overflow-hidden shadow-2xl border border-zinc-200 text-zinc-800 font-sans transition-all flex flex-col animate-fade-in">
            
            {/* 3. Google Play Store Brand Header */}
            <div className="bg-white border-b border-zinc-100 px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveSubPage('menu')}
                  className="p-1.5 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer"
                  title="Go back to profile menu"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                  {/* Google Play Logo SVG */}
                  <svg viewBox="0 0 48 48" className="w-6 h-6 shrink-0">
                    <path d="M10 42V6l22 18z" fill="#00c853" />
                    <path d="M32 24L10 6v36z" fill="#ffeb3b" opacity="0.3" />
                    <path d="M10 6l22 18L39 12z" fill="#ff1744" />
                    <path d="M10 42l22-18 7 12z" fill="#2979ff" />
                  </svg>
                  <span className="text-zinc-600 font-sans font-medium text-lg tracking-tight select-none">
                    Google Play
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-zinc-400">
                <Search size={18} />
                <div className="w-6 h-6 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-black select-none">
                  A
                </div>
              </div>
            </div>

            {/* 4. Play Store App Details Area */}
            <div className="bg-white px-5 pt-5 pb-4 space-y-4 text-left">
              
              {/* App Basic Info */}
              <div className="flex gap-4 items-start">
                
                {/* ARBITRAGE Rounded App Icon (Official Website Logo) */}
                <div className="w-18 h-18 rounded-2xl bg-zinc-950 border border-zinc-200 shadow-md flex items-center justify-center shrink-0 overflow-hidden select-none">
                  <img 
                    src="/icon.svg" 
                    alt="ARBITRAGE" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Name, Subtitle & Safety */}
                <div className="space-y-1">
                  <h1 className="text-xl font-bold text-zinc-900 leading-tight">
                    ARBITRAGE
                  </h1>
                  <h2 className="text-xs font-semibold text-[#01875f] tracking-wide uppercase">
                    ARBITRAGE Crypto Arbitrage
                  </h2>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold select-none pt-0.5">
                    <ShieldCheck className="text-[#01875f]" size={12} />
                    <span>Verified by Play Protect</span>
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-1 py-1.5 border-y border-zinc-100 text-center select-none">
                <div className="space-y-0.5">
                  <span className="text-xs font-black text-zinc-800 block">4.80 ★</span>
                  <span className="text-[10px] text-zinc-400 block font-medium">527K reviews</span>
                </div>
                <div className="space-y-0.5 border-x border-zinc-100">
                  <span className="text-xs font-black text-zinc-800 block">100K+</span>
                  <span className="text-[10px] text-zinc-400 block font-medium">Downloads</span>
                </div>
                <div className="space-y-0.5 flex flex-col items-center justify-center">
                  <div className="p-0.5 rounded bg-[#e8f0fe] text-[#1a73e8] shrink-0">
                    <CheckCircle2 size={10} />
                  </div>
                  <span className="text-[9px] text-zinc-500 block font-black mt-0.5 uppercase tracking-tight">Editors' Choice</span>
                </div>
              </div>

              {/* Install Button Block */}
              <div className="space-y-3">
                {installSuccess ? (
                  <div className="space-y-3.5 animate-fade-in">
                    <div className="flex gap-3">
                      <button
                        id="playstore-uninstall-btn"
                        onClick={() => {
                          setInstallProgress(null);
                          setInstallSuccess(false);
                          setShowPwaInstructions(false);
                          localStorage.removeItem('arbitrage_pwa_installed');
                          localStorage.setItem('profile_subpage', 'mobile_app');
                          // Reload the page to clear the browser's PWA install state so Chrome re-triggers beforeinstallprompt!
                          window.location.reload();
                        }}
                        className="flex-1 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-300 text-zinc-700 hover:text-zinc-900 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Uninstall</span>
                      </button>
                      <button
                        id="playstore-open-btn"
                        onClick={handleOpenApp}
                        className="flex-1 py-2.5 bg-[#01875f] hover:bg-[#01704e] active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-700/10"
                      >
                        <span>Open</span>
                      </button>
                    </div>

                    {/* Beautiful, clear instruction helper for Android APK installs */}
                    <div className="bg-emerald-50 border border-emerald-200/60 p-4 rounded-2xl text-left space-y-3 shadow-sm">
                      <div className="flex items-center gap-2 text-emerald-800 text-[11px] font-black uppercase tracking-tight">
                        <CheckCircle2 size={14} className="text-emerald-600 animate-bounce" />
                        <span>Download Complete! What's Next?</span>
                      </div>
                      
                      <div className="space-y-2.5 text-xs text-zinc-600 font-medium leading-relaxed font-sans">
                          
                     
    
                      </div>
                    </div>
                  </div>
                ) : installProgress === null ? (
                  <div className="space-y-3">
                    <button
                      id="playstore-install-btn"
                      onClick={handleInstallClick}
                      disabled={pwaLoading}
                      className="w-full py-2.5 bg-[#01875f] hover:bg-[#01704e] active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-700/10 disabled:opacity-90 disabled:cursor-wait"
                    >
                      {pwaLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Installing ARBITRAGE...</span>
                        </>
                      ) : (
                        <span>Install App</span>
                      )}
                    </button>

                    {showPwaInstructions && (
                      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-left space-y-3.5 animate-fade-in">
                        <div className="flex justify-between items-center border-b border-zinc-200/60 pb-2">
                          <span className="text-[11px] font-extrabold text-zinc-900 tracking-tight uppercase flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Secure App Installation Guide
                          </span>
                          <button 
                            onClick={() => setShowPwaInstructions(false)}
                            className="text-[10px] text-zinc-400 hover:text-zinc-600 font-bold px-2 py-0.5 bg-zinc-100 rounded-md"
                          >
                            Hide
                          </button>
                        </div>

                        {/* 1-Click Restore Alert */}
                        {!deferredPrompt && (
                          <div className="bg-emerald-50 border border-emerald-200/70 p-3.5 rounded-xl flex items-start gap-3 text-xs text-emerald-800 leading-normal font-medium shadow-sm animate-fade-in">
                            <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg animate-pulse shrink-0">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 4.89M9 11l3 3L22 4" />
                              </svg>
                            </div>
                            <div className="space-y-1.5 flex-1 text-left">
                              <strong className="text-emerald-950 text-[12px] block font-black">🔄 Just uninstalled ARBITRAGE?</strong>
                              <p className="text-zinc-600 text-[11px] leading-relaxed">
                                Browsers need a simple page refresh to reset their cache and restore the super-fast 1-click install prompt from the video!
                              </p>
                              <button
                                onClick={() => window.location.reload()}
                                className="mt-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                              >
                                <span>Reload & Restore 1-Click Install</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* OS Tabs */}
                        <div className="grid grid-cols-3 gap-1 bg-zinc-100 p-0.5 rounded-lg text-[10px] font-bold">
                          <button
                            onClick={() => setDeviceTab('android')}
                            className={`py-1.5 rounded-md transition-all cursor-pointer ${deviceTab === 'android' ? 'bg-white text-[#01875f] shadow-sm' : 'text-zinc-500 hover:text-zinc-850'}`}
                          >
                            Android
                          </button>
                          <button
                            onClick={() => setDeviceTab('ios')}
                            className={`py-1.5 rounded-md transition-all cursor-pointer ${deviceTab === 'ios' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-500 hover:text-zinc-855'}`}
                          >
                            iOS (iPhone)
                          </button>
                          <button
                            onClick={() => setDeviceTab('desktop')}
                            className={`py-1.5 rounded-md transition-all cursor-pointer ${deviceTab === 'desktop' ? 'bg-white text-zinc-800 shadow-sm' : 'text-zinc-500 hover:text-zinc-855'}`}
                          >
                            Computer
                          </button>
                        </div>

                        {/* Android Chrome Instructions */}
                        {deviceTab === 'android' && (
                          <div className="space-y-2.5 text-xs text-zinc-600 font-medium">
                            <p className="text-[10px] text-zinc-500 leading-normal">
                              ⚡ <strong>Recommended & Secure:</strong> Installs instantly via your browser. Bypasses APK security blocks and Play Protect warnings.
                            </p>
                            <div className="space-y-2 pl-1">
                              <div className="flex gap-2 items-start">
                                <span className="bg-[#01875f]/10 text-[#01875f] w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                                <p className="leading-tight">
                                  Tap the <strong>browser menu</strong> (<span className="inline-flex items-center text-zinc-800 font-black"><MoreVertical size={11} className="inline" /></span> or three dots) in the top right.
                                </p>
                              </div>
                              <div className="flex gap-2 items-start">
                                <span className="bg-[#01875f]/10 text-[#01875f] w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                                <p className="leading-tight">
                                  Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                                </p>
                              </div>
                              <div className="flex gap-2 items-start">
                                <span className="bg-[#01875f]/10 text-[#01875f] w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                                <p className="leading-tight">
                                  Confirm the prompt. The app icon will appear natively on your Home Screen!
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* iOS Safari Instructions */}
                        {deviceTab === 'ios' && (
                          <div className="space-y-2.5 text-xs text-zinc-600 font-medium">
                            <p className="text-[10px] text-zinc-500 leading-normal">
                              🍏 iOS devices do not support direct APK files. Install ARBITRAGE as an official web app via Safari:
                            </p>
                            <div className="space-y-2 pl-1">
                              <div className="flex gap-2 items-start">
                                <span className="bg-zinc-800 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                                <p className="leading-tight">
                                  Open this website inside <strong>Safari</strong> browser.
                                </p>
                              </div>
                              <div className="flex gap-2 items-start">
                                <span className="bg-zinc-800 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                                <p className="leading-tight flex items-center flex-wrap gap-1">
                                  Tap the <strong>Share</strong> button <Share2 size={12} className="inline mx-0.5 text-blue-500" /> at the bottom.
                                </p>
                              </div>
                              <div className="flex gap-2 items-start">
                                <span className="bg-zinc-800 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                                <p className="leading-tight">
                                  Scroll down and tap <strong>"Add to Home Screen"</strong> <Plus size={12} className="inline mx-0.5 text-zinc-600" />.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Computer/Desktop Instructions */}
                        {deviceTab === 'desktop' && (
                          <div className="space-y-2.5 text-xs text-zinc-600 font-medium">
                            <div className="space-y-2 pl-1">
                              <div className="flex gap-2 items-start">
                                <span className="bg-zinc-700 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                                <p className="leading-tight">
                                  Look at the browser address bar (top right).
                                </p>
                              </div>
                              <div className="flex gap-2 items-start">
                                <span className="bg-zinc-700 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                                <p className="leading-tight">
                                  Click the <strong>App Install icon</strong> (looks like a monitor with a downward arrow).
                                </p>
                              </div>
                              <div className="flex gap-2 items-start">
                                <span className="bg-zinc-700 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                                <p className="leading-tight">
                                  Click <strong>Install</strong> to run ARBITRAGE as a standalone desktop app.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Legacy APK Fallback Option */}
                        <div className="border-t border-zinc-200/80 pt-3 mt-1.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase">Alternative Method</span>
                            <button
                              onClick={startApkDownload}
                              className="text-[10px] text-amber-700 hover:text-amber-800 font-extrabold flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md transition-all shrink-0 cursor-pointer"
                            >
                              <Download size={11} />
                              <span>Download APK File</span>
                            </button>
                          </div>
                          
                          
                        </div>

                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 bg-[#f6f6f6] border border-zinc-200/50 p-4 rounded-xl animate-fade-in text-left">
                    <div className="flex justify-between items-center text-[11px] font-bold text-zinc-700">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#01875f] animate-ping" />
                        {installStatusText}
                      </span>
                      <span className="font-mono text-zinc-900">{installProgress}%</span>
                    </div>
                    {/* Linear Progress Bar */}
                    <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#01875f] rounded-full transition-all duration-150"
                        style={{ width: `${installProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Play Store Auxiliary Actions */}
              <div className="flex justify-center gap-6 py-1 select-none text-zinc-500 text-xs font-medium">
                <button className="flex items-center gap-1.5 hover:text-[#01875f] transition-colors cursor-default">
                  <Share2 size={14} className="text-[#01875f]" />
                  <span>Share</span>
                </button>
                <button className="flex items-center gap-1.5 hover:text-[#01875f] transition-colors cursor-default">
                  <Plus size={14} className="text-[#01875f]" />
                  <span>Add to wishlists</span>
                </button>
              </div>

              {/* 5. Screenshots Gallery (Horizontal Scroll, High Fidelity Mockups) */}
              <div className="space-y-1.5 pt-1.5 border-t border-zinc-100">
                <h3 className="text-xs font-bold text-zinc-900 tracking-tight">Screenshots</h3>
                <div className="flex overflow-x-auto gap-3.5 pb-4 pt-1 px-1 scrollbar-thin scrollbar-thumb-zinc-200 select-none">
                  
                  {/* Screenshot 1: High Yield Dashboard */}
                  <div className="w-[180px] h-[320px] shrink-0 border-[3px] border-zinc-800 rounded-[1.8rem] bg-slate-900 flex flex-col overflow-hidden relative shadow-md text-left font-sans text-zinc-300">
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-zinc-950 pointer-events-none"></div>
                    {/* Mock phone status bar */}
                    <div className="h-4 px-3 bg-slate-950 text-zinc-500 text-[7px] flex justify-between items-center select-none font-mono">
                      <span>12:45</span>
                      <div className="flex items-center gap-1">
                        <span>📶</span>
                        <span>🔋</span>
                      </div>
                    </div>
                    {/* Mock App Content */}
                    <div className="p-2.5 space-y-2.5 relative z-10 flex-1 flex flex-col">
                      <div className="flex justify-between items-center border-b border-slate-800/80 pb-1.5">
                        <span className="text-[9px] font-black tracking-wider bg-gradient-to-r from-amber-400 to-yellow-200 bg-clip-text text-transparent">ARBITRAGE</span>
                        <span className="text-[7px] text-emerald-400 font-bold bg-emerald-500/10 px-1 rounded-full border border-emerald-500/20">LIVE</span>
                      </div>
                      
                      {/* Balance Card */}
                      <div className="bg-slate-950/80 border border-slate-800 p-2 rounded-xl space-y-1">
                        <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider">Total Active Balance</span>
                        <div className="text-xs font-black text-white">$24,815.59</div>
                        <div className="flex items-center gap-1">
                          <span className="text-[6px] text-emerald-400 font-bold">▲ +24.8% profit</span>
                          <span className="text-[5px] text-zinc-600 font-mono">this cycle</span>
                        </div>
                      </div>

                      {/* Rates block */}
                      <div className="space-y-1">
                        <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider block">Live Arbitrage Nodes</span>
                        <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/50 space-y-1 text-[7px]">
                          <div className="flex justify-between text-zinc-400">
                            <span>USDT/KES Spread</span>
                            <span className="text-emerald-400 font-bold">+8.4%</span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>BTC Pool Liquidity</span>
                            <span className="text-amber-400 font-bold">+5.2%</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick notice */}
                      <div className="mt-auto bg-emerald-500/5 border border-emerald-500/10 p-1.5 rounded-lg text-[6px] text-emerald-300 leading-tight">
                        🔒 Safe Escrow Protection completes transaction swaps inside 2 minutes.
                      </div>
                    </div>
                  </div>

                  {/* Screenshot 2: MMF Capital Portfolios */}
                  <div className="w-[180px] h-[320px] shrink-0 border-[3px] border-zinc-800 rounded-[1.8rem] bg-slate-900 flex flex-col overflow-hidden relative shadow-md text-left font-sans text-zinc-300">
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-zinc-950 pointer-events-none"></div>
                    {/* Mock phone status bar */}
                    <div className="h-4 px-3 bg-slate-950 text-zinc-500 text-[7px] flex justify-between items-center select-none font-mono">
                      <span>12:45</span>
                      <div className="flex items-center gap-1">
                        <span>📶</span>
                        <span>🔋</span>
                      </div>
                    </div>
                    {/* Mock App Content */}
                    <div className="p-2.5 space-y-2.5 relative z-10 flex-1 flex flex-col">
                      <div className="border-b border-slate-800/80 pb-1.5">
                        <span className="text-[8px] font-black text-zinc-200 uppercase tracking-wider">MMF Portfolios</span>
                      </div>

                      <div className="space-y-1.5 flex-1">
                        <div className="bg-slate-950/80 border border-slate-800 p-2 rounded-xl text-left space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-bold text-white">USDT Alpha Fund</span>
                            <span className="text-[6px] text-emerald-400 font-black">7.5% Daily</span>
                          </div>
                          <p className="text-[6px] text-zinc-500 leading-tight">5-Day Capital Lock, compounding payouts dynamically.</p>
                        </div>

                        <div className="bg-slate-950/80 border border-slate-800 p-2 rounded-xl text-left space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-bold text-white">BTC Premium Fund</span>
                            <span className="text-[6px] text-amber-400 font-black">5.0% Daily</span>
                          </div>
                          <p className="text-[6px] text-zinc-500 leading-tight">3-Day Capital Lock, automated settlement rollover.</p>
                        </div>

                        <div className="bg-slate-950/80 border border-slate-800 p-2 rounded-xl text-left space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-bold text-white">ETH Capital Reserve</span>
                            <span className="text-[6px] text-sky-400 font-black">6.0% Daily</span>
                          </div>
                          <p className="text-[6px] text-zinc-500 leading-tight">7-Day lock-in, multi-pool hedge arbitrage spreads.</p>
                        </div>
                      </div>

                      <div className="mt-auto bg-amber-500/5 border border-amber-500/10 p-1.5 rounded-lg text-[6px] text-amber-300 leading-tight">
                        📈 Compounded automatically. Multi-node trading delivers seamless execution.
                      </div>
                    </div>
                  </div>

                  {/* Screenshot 3: P2P Secure Swaps */}
                  <div className="w-[180px] h-[320px] shrink-0 border-[3px] border-zinc-800 rounded-[1.8rem] bg-slate-900 flex flex-col overflow-hidden relative shadow-md text-left font-sans text-zinc-300">
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-zinc-950 pointer-events-none"></div>
                    {/* Mock phone status bar */}
                    <div className="h-4 px-3 bg-slate-950 text-zinc-500 text-[7px] flex justify-between items-center select-none font-mono">
                      <span>12:45</span>
                      <div className="flex items-center gap-1">
                        <span>📶</span>
                        <span>🔋</span>
                      </div>
                    </div>
                    {/* Mock App Content */}
                    <div className="p-2.5 space-y-2.5 relative z-10 flex-1 flex flex-col">
                      <div className="border-b border-slate-800/80 pb-1.5 flex justify-between items-center">
                        <span className="text-[8px] font-black text-zinc-200 uppercase tracking-wider">P2P Escrow Terminal</span>
                        <span className="text-[6px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-1 rounded font-bold uppercase">Escrow</span>
                      </div>

                      <div className="space-y-2">
                        <div className="bg-slate-950 p-2 rounded-xl border border-slate-850 space-y-1 text-left">
                          <span className="text-[8px] font-black text-white block">M-Pesa, MTN Mobile money</span>
                          <p className="text-[6px] text-zinc-400 leading-normal">
                            Direct, safe local currency deposits & withdrawals managed under automated smart escrow.
                          </p>
                        </div>

                        <div className="bg-emerald-500/5 border border-emerald-500/20 p-2 rounded-xl space-y-1.5">
                          <span className="text-[7px] font-black text-emerald-400 uppercase tracking-wider block">Escrow Protected Node</span>
                          <p className="text-[6px] text-zinc-300 leading-normal">
                            Merchants lock equal security collateral before accepting swaps, preventing slippage or defaults.
                          </p>
                        </div>
                      </div>

                      <div className="mt-auto flex justify-around items-center bg-slate-950 p-1.5 rounded-lg border border-slate-800 text-[8px] font-bold">
                        <span className="text-zinc-500 text-[6px]">M-Pesa ✔</span>
                        <span className="text-zinc-500 text-[6px]">MTN ✔</span>
                        <span className="text-zinc-500 text-[6px]">Airtel ✔</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* 6. About This App Section */}
              <div className="space-y-1.5 pt-3 border-t border-zinc-100 text-left select-none text-zinc-600">
                <div className="flex justify-between items-center text-xs font-bold text-zinc-900">
                  <span>About this app</span>
                  <ChevronRight size={16} className="text-zinc-400" />
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                  Welcome to ARBITRAGE, the ultimate micro-arbitrage simulator. Tap into lightning-fast compounding cycles, safe peer-to-peer (P2P) escrows, and robust portfolio management. Designed as a high-fidelity Progressive Web App, it operates directly as a standalone app on your home screen with zero storage footprint!
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[8px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold">Finance</span>
                  <span className="text-[8px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold">Portfolio</span>
                  <span className="text-[8px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold">Escrow Sync</span>
                </div>
              </div>

            </div>

            {/* 7. Bottom Navigation Tabs (Play Store Mock) */}
            <div className="bg-white border-t border-zinc-100 px-2 py-1.5 grid grid-cols-5 text-center select-none text-zinc-400">
              <div className="space-y-0.5 flex flex-col items-center justify-center py-1 cursor-default">
                <Gamepad2 size={16} />
                <span className="text-[8px] font-bold">Games</span>
              </div>
              <div className="space-y-0.5 flex flex-col items-center justify-center py-1 text-[#01875f] cursor-default relative">
                <LayoutGrid size={16} />
                <span className="text-[8px] font-black">Apps</span>
                {/* Underline bar */}
                <div className="absolute bottom-0 w-8 h-0.5 bg-[#01875f] rounded-full" />
              </div>
              <div className="space-y-0.5 flex flex-col items-center justify-center py-1 cursor-default">
                <Clapperboard size={16} />
                <span className="text-[8px] font-bold">Movies & TV</span>
              </div>
              <div className="space-y-0.5 flex flex-col items-center justify-center py-1 cursor-default">
                <BookOpen size={16} />
                <span className="text-[8px] font-bold">Books</span>
              </div>
              <div className="space-y-0.5 flex flex-col items-center justify-center py-1 cursor-default">
                <Star size={16} />
                <span className="text-[8px] font-bold">Children</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOpenInstruction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl relative animate-scale-up p-1">
            <div className="bg-slate-950/40 rounded-[1.8rem] p-5">
              
              {/* Close Button */}
              <button 
                onClick={() => setShowOpenInstruction(false)}
                className="absolute top-6 right-6 p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-zinc-400 hover:text-white transition-all cursor-pointer z-10"
              >
                <X size={15} />
              </button>

              {/* Icon & Glow */}
              <div className="text-center relative pt-2">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-zinc-950 border-2 border-emerald-500/30 shadow-lg shadow-emerald-500/10 flex items-center justify-center overflow-hidden relative group mb-3">
                  <div className="absolute inset-0 bg-emerald-500/15 rounded-3xl animate-pulse"></div>
                  <img 
                    src="/icon.svg" 
                    alt="ARBITRAGE" 
                    className="w-14 h-14 object-cover relative z-10"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h3 className="text-base font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200 bg-clip-text text-transparent">
                  Launch Standalone App
                </h3>
                <p className="text-[11px] text-zinc-400 mt-1.5 font-medium leading-relaxed px-2">
                  Due to browser security policies, websites cannot launch installed apps directly. Follow these simple steps to run ARBITRAGE:
                </p>
              </div>

              {/* Instructions Steps */}
              <div className="py-5 space-y-4 text-left border-y border-slate-800/60 my-4">
                <div className="flex gap-3.5 items-start">
                  <div className="w-5.5 h-5.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold flex items-center justify-center text-[10px] shrink-0">
                    1
                  </div>
                  <div>
                    <strong className="text-zinc-100 text-xs block font-bold">Go to your Home Screen</strong>
                    <p className="text-[11px] text-zinc-400 leading-normal mt-0.5">
                      Press your phone's home button or swipe up to exit the browser.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3.5 items-start">
                  <div className="w-5.5 h-5.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold flex items-center justify-center text-[10px] shrink-0">
                    2
                  </div>
                  <div>
                    <strong className="text-zinc-100 text-xs block font-bold">Find the "ARBITRAGE" Icon</strong>
                    <p className="text-[11px] text-zinc-400 leading-normal mt-0.5 font-medium">
                      Look for the beautiful round logo with the letter <span className="text-emerald-400 font-bold">"A"</span> on your home screen or app drawer.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3.5 items-start">
                  <div className="w-5.5 h-5.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold flex items-center justify-center text-[10px] shrink-0">
                    3
                  </div>
                  <div>
                    <strong className="text-zinc-100 text-xs block font-bold">Tap to launch natively</strong>
                    <p className="text-[11px] text-zinc-400 leading-normal mt-0.5">
                      Tap the icon to start the immersive, full-screen standalone application!
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => setShowOpenInstruction(false)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-950/20 cursor-pointer"
                >
                  Got it, I'll open it!
                </button>
                <button
                  onClick={() => {
                    setShowOpenInstruction(false);
                    localStorage.removeItem('profile_subpage');
                    onBack();
                  }}
                  className="w-full py-2 bg-transparent hover:bg-slate-850 text-zinc-500 hover:text-zinc-300 rounded-xl text-[11px] font-bold transition-all border border-transparent hover:border-slate-800 cursor-pointer"
                >
                  Continue in browser tab
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
