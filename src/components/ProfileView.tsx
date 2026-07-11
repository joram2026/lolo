import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { 
  Shield, Key, Sparkles, User, Gift, Check, ArrowLeft, AlertCircle, 
  Smartphone, Copy, CheckCircle2, QrCode, Power, Lock, ShieldAlert,
  ChevronRight, HelpCircle, MessageSquare, Send
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
  const [activeSubPage, setActiveSubPage] = useState<'menu' | 'personal' | 'referral' | 'pin' | '2fa' | 'support'>('menu');

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
              onClick={onBack}
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
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`otpauth://totp/LOLO:${profile?.email || user.email}?secret=${temp2faSecret}&issuer=LOLO%20Crypto%20Escrow`)}`}
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
                LOLO Support agents will never ask for your Google Authenticator 2FA secret, account passwords, or secure wallet PINs. Never share these credentials with anyone.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
