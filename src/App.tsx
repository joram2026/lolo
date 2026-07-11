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

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  // Helper to parse clean path from hash
  const getPathFromHash = () => {
    const hash = window.location.hash;
    if (!hash) {
      // Fallback: If there's an existing pathname, migrate/use it
      const pathname = window.location.pathname;
      if (pathname && pathname !== '/') {
        return pathname;
      }
      return '/login'; // Default view
    }
    // Remove leading '#' and optional '/'
    let clean = hash.replace(/^#\/?/, '/');
    if (!clean.startsWith('/')) {
      clean = '/' + clean;
    }
    return clean.split('?')[0];
  };

  // Routing State using hash-based routing to prevent 404 on reload
  const [path, setPath] = useState(getPathFromHash());

  useEffect(() => {
    const handleHashChange = () => {
      setPath(getPathFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    
    // On mount, if they are on a legacy non-hash path, migrate them to hash
    const initialPath = window.location.pathname;
    if (initialPath && initialPath !== '/') {
      window.location.hash = `#${initialPath}`;
      window.history.replaceState(null, '', '/' + window.location.search + window.location.hash);
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  const navigate = (newPath: string, clearSearch = false) => {
    const currentSearch = clearSearch ? '' : window.location.search;
    const cleanPath = newPath.startsWith('/') ? newPath : '/' + newPath;
    
    if (clearSearch && currentSearch) {
      window.history.replaceState(null, '', '/');
    }
    
    window.location.hash = `#${cleanPath}`;
    setPath(cleanPath);
  };

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

  // Sync redirection rules based on authentication state and current path
  useEffect(() => {
    if (initializing) return;

    const params = new URLSearchParams(window.location.search);
    const hasReferral = params.has('ref') || params.has('code');

    if (hasReferral && user && path !== '/signup' && path !== '/login') {
      // If a referral link is opened but a session is active, sign out first
      // so the user is correctly shown the signup page.
      signOut(auth).then(() => {
        navigate('/signup');
      });
      return;
    }

    if (!user) {
      // Unauthenticated state: only allow /login, /signup, /reset
      if (path !== '/login' && path !== '/signup' && path !== '/reset') {
        if (hasReferral) {
          navigate('/signup');
        } else {
          navigate('/login');
        }
      }
    } else if (user.email === 'love@gmail.com') {
      // Admin: only allow /admin
      if (path !== '/admin') {
        navigate('/admin');
      }
    } else {
      // Standard authenticated user paths
      const validPaths = [
        '/dashboard',
        '/wallet',
        '/trade',
        '/history',
        '/profile',
        '/deposit',
        '/withdraw',
        '/tx_success'
      ];
      if (!validPaths.includes(path)) {
        navigate('/dashboard', true);
      }
    }
  }, [user, initializing, path]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleTxSuccess = (msg: string) => {
    setSuccessMessage(msg);
    navigate('/tx_success');
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
    return <AuthPage onSuccess={() => navigate('/dashboard')} path={path} navigate={navigate} />;
  }

  // 2. Admin Authentication Bypass (love@gmail.com)
  if (user.email === 'love@gmail.com') {
    return <AdminPanel onLogout={handleLogout} />;
  }

  // 3. Standard User Account Flows
  const showDashboard = ['/dashboard', '/wallet', '/trade', '/history', '/login', '/signup'].includes(path);

  return (
    <div id="standard-user-app" className="bg-slate-900 min-h-screen">
      
      {showDashboard && (
        <StandardUserDashboard
          user={user}
          onLogout={handleLogout}
          onOpenProfile={() => navigate('/profile')}
          onOpenDeposit={() => navigate('/deposit')}
          onOpenWithdraw={() => navigate('/withdraw')}
          path={path}
          navigate={navigate}
        />
      )}

      {path === '/profile' && (
        <ProfileView
          user={user}
          onBack={() => navigate('/dashboard')}
        />
      )}

      {path === '/deposit' && (
        <DepositWorkflow
          user={user}
          onBack={() => navigate('/dashboard')}
          onSuccess={() => handleTxSuccess('Your deposit request has been submitted to the Admin Escrow Queue for verification.')}
        />
      )}

      {path === '/withdraw' && (
        <WithdrawalWorkflow
          user={user}
          onBack={() => navigate('/dashboard')}
          onSuccess={() => handleTxSuccess('Your withdrawal request has been placed in the queue or processed successfully.')}
        />
      )}

      {path === '/tx_success' && (
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
            onClick={() => navigate('/dashboard')}
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
