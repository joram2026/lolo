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
import { useToast } from './context/ToastContext';

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [depositCoin, setDepositCoin] = useState<string | undefined>(undefined);

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
    const cleanPath = newPath.startsWith('/') ? newPath : '/' + newPath;
    const currentSearch = clearSearch ? '' : window.location.search;
    const targetUrl = '/' + currentSearch + `#${cleanPath}`;
    
    if (clearSearch || cleanPath === '/dashboard' || cleanPath === '/login' || cleanPath === '/signup') {
      window.history.replaceState(null, '', targetUrl);
    } else {
      window.history.pushState(null, '', targetUrl);
    }
    setPath(cleanPath);
  };

  // Track Firebase Auth State changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (currentUser.email === 'love@gmail.com') {
          // Automatically seed the starter crypto networks & merchants into Firestore if they are empty
          await seedFirestoreIfNeeded();
        }
      } else {
        setUser(null);
      }
      setInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync redirection rules based on authentication state and current path
  useEffect(() => {
    if (initializing) return;

    // Parse query params checking both search and hash
    const searchParams = new URLSearchParams(window.location.search);
    let refValue = searchParams.get('ref') || searchParams.get('code');
    if (!refValue) {
      const hashIndex = window.location.hash.indexOf('?');
      if (hashIndex !== -1) {
        const hashParams = new URLSearchParams(window.location.hash.substring(hashIndex));
        refValue = hashParams.get('ref') || hashParams.get('code');
      }
    }
    const hasReferral = !!refValue;

    if (hasReferral) {
      // Store uppercase referral code in localStorage and clean the URL immediately to avoid loops
      const upperRef = refValue!.trim().toUpperCase();
      localStorage.setItem('pending_referral_code', upperRef);

      if (user) {
        // If a referral link is opened but a session is active, sign out first
        // so the user is correctly shown the signup page.
        localStorage.removeItem('custom_user_email');
        localStorage.removeItem('custom_user_uid');
        signOut(auth).then(() => {
          navigate('/signup', true); // clearSearch = true strips URL query params!
        });
        return;
      } else {
        // Unauthenticated user opened a referral link: send to signup with clean URL
        navigate('/signup', true);
        return;
      }
    }

    if (!user) {
      // Unauthenticated state: only allow /login, /signup, /reset
      if (path !== '/login' && path !== '/signup' && path !== '/reset') {
        navigate('/login');
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
        '/earn',
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
      localStorage.removeItem('custom_user_email');
      localStorage.removeItem('custom_user_uid');
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const toast = useToast();
  const handleTxSuccess = (msg: string) => {
    toast.success(msg, 'Transaction Request');
    setSuccessMessage(msg);
    navigate('/tx_success');
  };

  if (initializing) {
    return (
      <div id="app-loading-screen" className="min-h-screen bg-[#FFF3D6] flex flex-col items-center justify-center gap-4 text-zinc-800 font-sans">
        <div className="relative w-20 h-20 rounded-3xl bg-white border border-amber-200 p-2.5 flex items-center justify-center overflow-hidden animate-logo-pulse mb-1">
          <img 
            src="/icon.svg" 
            alt="ARBITRAGE" 
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-amber-500/10 to-transparent pointer-events-none"></div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-6 h-6 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-zinc-550 font-bold tracking-wide animate-text-blink">Syncing Wallet Nodes...</p>
        </div>
      </div>
    );
  }

  // 1. Unauthenticated State
  if (!user) {
    return <AuthPage onSuccess={() => navigate('/dashboard', true)} path={path} navigate={navigate} />;
  }

  // 2. Admin Authentication Bypass (love@gmail.com)
  if (user.email === 'love@gmail.com') {
    return <AdminPanel onLogout={handleLogout} />;
  }

  const handleOpenDeposit = (coinSymbol?: any) => {
    if (typeof coinSymbol === 'string' && coinSymbol.trim()) {
      const cleanCoin = coinSymbol.trim();
      setDepositCoin(cleanCoin);
      sessionStorage.setItem('preselected_deposit_coin', cleanCoin);
      localStorage.setItem('preselected_deposit_coin', cleanCoin);
    } else {
      setDepositCoin(undefined);
      sessionStorage.removeItem('preselected_deposit_coin');
      localStorage.removeItem('preselected_deposit_coin');
    }
    navigate('/deposit');
  };

  // 3. Standard User Account Flows
  const showDashboard = ['/dashboard', '/wallet', '/trade', '/earn', '/history'].includes(path);

  return (
    <div id="standard-user-app" className="bg-[#FFF3D6] min-h-screen">
      
      {showDashboard && (
        <StandardUserDashboard
          user={user}
          onLogout={handleLogout}
          onOpenProfile={() => navigate('/profile')}
          onOpenDeposit={handleOpenDeposit}
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
          initialCoinSymbol={depositCoin}
          onBack={() => navigate('/dashboard')}
          onSuccess={() => handleTxSuccess('Your deposit request has been submitted to the Admin Escrow Queue for verification.')}
        />
      )}

      {path === '/withdraw' && (
        <WithdrawalWorkflow
          user={user}
          onBack={() => navigate('/dashboard')}
          onGoToProfile={() => navigate('/profile')}
          onSuccess={() => handleTxSuccess('Your withdrawal request has been placed in the queue or processed successfully.')}
        />
      )}

      {path === '/tx_success' && (
        <div id="success-screen-container" className="min-h-screen max-w-sm mx-auto flex flex-col items-center justify-center p-6 bg-[#FFF3D6] text-center font-sans">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/5">
            <CheckCircle2 size={36} />
          </div>

          <h2 className="text-xl font-black text-zinc-800 tracking-tight">Request Submitted</h2>
          <p className="text-xs text-zinc-600 mt-2.5 leading-relaxed">
            {successMessage}
          </p>

          <div className="w-full bg-white border border-zinc-200/80 p-4 rounded-2xl text-left space-y-3 mt-6">
            <div className="flex items-start gap-2.5 text-[11px] text-zinc-600 leading-normal">
              <ShieldCheck size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>Under Escrow:</strong> Status can be monitored in your <strong>Wallet</strong> tab history. Standard approvals take between 1 to 5 minutes during trading windows.
              </span>
            </div>
          </div>

          <button
            id="back-to-wallet-dashboard"
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-center gap-1.5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-xl text-xs font-bold transition-all shadow-md mt-8 cursor-pointer font-sans"
          >
            <ArrowLeft size={14} />
            <span>Back to Wallet Dashboard</span>
          </button>
        </div>
      )}

    </div>
  );
}
