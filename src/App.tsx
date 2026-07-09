import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import AuthPage from './components/AuthPage';
import AdminPanel from './components/AdminPanel';
import StandardUserDashboard from './components/StandardUserDashboard';
import ProfileView from './components/ProfileView';
import DepositWorkflow from './components/DepositWorkflow';
import WithdrawalWorkflow from './components/WithdrawalWorkflow';
import { seedFirestoreIfNeeded } from './seedData';
import { Sparkles, ArrowLeft, CheckCircle2, ShieldCheck, Heart } from 'lucide-react';

type UserView = 'dashboard' | 'profile' | 'deposit' | 'withdraw' | 'tx_success';

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [currentView, setCurrentView] = useState<UserView>('dashboard');
  const [successMessage, setSuccessMessage] = useState('');

  // Track Firebase Auth State changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email === 'love@gmail.com') {
        // Automatically seed the starter crypto networks & merchants into Firestore if they are empty
        await seedFirestoreIfNeeded();
      }
      setInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentView('dashboard');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleTxSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setCurrentView('tx_success');
  };

  if (initializing) {
    return (
      <div id="app-loading-screen" className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-zinc-100 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-slate-950 font-black text-lg flex items-center justify-center animate-bounce shadow-xl shadow-emerald-500/10 tracking-widest">
          LOLO
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-zinc-500 font-semibold tracking-wide">Syncing Wallet Nodes...</p>
        </div>
      </div>
    );
  }

  // 1. Unauthenticated State
  if (!user) {
    return <AuthPage onSuccess={() => setCurrentView('dashboard')} />;
  }

  // 2. Admin Authentication Bypass (love@gmail.com)
  if (user.email === 'love@gmail.com') {
    return <AdminPanel onLogout={handleLogout} />;
  }

  // 3. Standard User Account Flows
  return (
    <div id="standard-user-app" className="bg-slate-900 min-h-screen">
      
      {currentView === 'dashboard' && (
        <StandardUserDashboard
          user={user}
          onLogout={handleLogout}
          onOpenProfile={() => setCurrentView('profile')}
          onOpenDeposit={() => setCurrentView('deposit')}
          onOpenWithdraw={() => setCurrentView('withdraw')}
        />
      )}

      {currentView === 'profile' && (
        <ProfileView
          user={user}
          onBack={() => setCurrentView('dashboard')}
        />
      )}

      {currentView === 'deposit' && (
        <DepositWorkflow
          user={user}
          onBack={() => setCurrentView('dashboard')}
          onSuccess={() => handleTxSuccess('Your deposit request has been submitted to the Admin Escrow Queue for verification.')}
        />
      )}

      {currentView === 'withdraw' && (
        <WithdrawalWorkflow
          user={user}
          onBack={() => setCurrentView('dashboard')}
          onSuccess={() => handleTxSuccess('Your withdrawal request has been placed in the queue or processed successfully.')}
        />
      )}

      {currentView === 'tx_success' && (
        <div id="success-screen-container" className="min-h-screen max-w-sm mx-auto flex flex-col items-center justify-center p-6 bg-slate-900 text-center font-sans">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/5">
            <CheckCircle2 size={36} />
          </div>

          <h2 className="text-xl font-black text-zinc-100 tracking-tight">Request Submitted</h2>
          <p className="text-xs text-zinc-500 mt-2.5 leading-relaxed">
            {successMessage}
          </p>

          <div className="w-full bg-slate-800 border border-slate-700/80 p-4 rounded-2xl text-left space-y-3 mt-6">
            <div className="flex items-start gap-2.5 text-[11px] text-zinc-400 leading-normal">
              <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Under Escrow:</strong> Status can be monitored in your <strong>Wallet</strong> tab history. Standard approvals take between 1 to 5 minutes during trading windows.
              </span>
            </div>
          </div>

          <button
            id="back-to-wallet-dashboard"
            onClick={() => setCurrentView('dashboard')}
            className="w-full flex items-center justify-center gap-1.5 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 rounded-xl text-xs font-bold transition-all shadow-md mt-8 cursor-pointer font-sans"
          >
            <ArrowLeft size={14} />
            <span>Back to Wallet Dashboard</span>
          </button>
        </div>
      )}

    </div>
  );
}
