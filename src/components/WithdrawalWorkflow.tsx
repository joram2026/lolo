import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDoc, getDocs, doc, updateDoc, runTransaction, serverTimestamp, query, where } from 'firebase/firestore';
import { CryptoNetwork, P2PMerchant, UserAccount, Transaction, CryptoPrice } from '../types';
import { DEFAULT_MERCHANTS } from '../seedData';
import { 
  ArrowLeft, Send, Users, ShieldAlert, ChevronRight, Check, 
  HelpCircle, AlertCircle, RefreshCw, Star, ArrowUpRight, DollarSign, Lock,
  Key, ArrowRight, X
} from 'lucide-react';
import { CoinIcon } from './StandardUserDashboard';
import { useToast } from '../context/ToastContext';

const getNetworkMetadata = (networkName: string) => {
  const norm = (networkName || '').toUpperCase().trim();
  if (norm.includes('TRC20') || norm.includes('TRON') || norm === 'TRX') {
    return { fullName: 'Tron', badge: 'TRC-20' };
  }
  if (norm.includes('ERC20') || norm.includes('ETH') || norm.includes('ETHEREUM')) {
    return { fullName: 'Ethereum', badge: 'ERC-20' };
  }
  if (norm.includes('BEP20') || norm.includes('BSC') || norm.includes('BINANCE')) {
    return { fullName: 'BNB Chain', badge: 'BEP-20' };
  }
  if (norm.includes('SOL') || norm.includes('SPL') || norm.includes('SOLANA')) {
    return { fullName: 'Solana', badge: 'SPL' };
  }
  if (norm.includes('BTC') || norm.includes('BITCOIN')) {
    return { fullName: 'Bitcoin', badge: 'Native' };
  }
  if (norm.includes('POLYGON') || norm.includes('MATIC')) {
    return { fullName: 'Polygon', badge: 'MATIC' };
  }
  if (norm.includes('ARBITRUM') || norm.includes('ARB')) {
    return { fullName: 'Arbitrum', badge: 'ARB' };
  }
  if (norm.includes('OPTIMISM') || norm.includes('OP')) {
    return { fullName: 'Optimism', badge: 'OP' };
  }
  if (norm.includes('AVAX') || norm.includes('AVALANCHE')) {
    return { fullName: 'Avalanche', badge: 'C-Chain' };
  }
  return { fullName: networkName, badge: '' };
};

interface WithdrawalWorkflowProps {
  user: any;
  onBack: () => void;
  onSuccess: () => void;
  onGoToProfile?: () => void;
}

export default function WithdrawalWorkflow({ user, onBack, onSuccess, onGoToProfile }: WithdrawalWorkflowProps) {
  const [method, setMethod] = useState<'selection' | 'crypto_coin_select' | 'crypto' | 'p2p' | 'p2p_calc' | 'p2p_instructions' | 'p2p_pin_confirm' | 'crypto_pin_confirm'>('crypto_coin_select');

  const handleGoToPinSettings = () => {
    localStorage.setItem('profile_subpage', 'pin');
    if (onGoToProfile) {
      onGoToProfile();
    } else {
      onBack();
    }
  };

  const formatCoinName = (tokenName: string) => {
    if (!tokenName) return '';
    const match = tokenName.match(/^([^(]+)\s*\(([^)]+)\)$/);
    if (match) {
      const fullName = match[1].trim();
      const symbol = match[2].trim();
      return `${symbol} (${fullName})`;
    }
    return tokenName;
  };

  const [profile, setProfile] = useState<UserAccount | null>(null);
  const [lockedUSDT, setLockedUSDT] = useState<number>(0);
  const [activeInvestments, setActiveInvestments] = useState<any[]>([]);
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, CryptoPrice>>({});
  
  // Asset holding helpers
  const getCoinHolding = (symbol: string): number => {
    const symUpper = symbol.toUpperCase();
    if (symUpper === 'USDT') {
      return profile?.balance || 0;
    }
    if (profile?.holdings && profile.holdings[symUpper] !== undefined) {
      return profile.holdings[symUpper];
    }
    return 0;
  };

  const getLockedAmount = (symbol: string): number => {
    const symUpper = symbol.toUpperCase();
    if (symUpper === 'USDT') {
      return lockedUSDT;
    }
    return activeInvestments
      .filter((inv: any) => inv.coinSymbol === symUpper && inv.status === 'active')
      .reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
  };

  const getUnlockedCoinHolding = (symbol: string): number => {
    const symUpper = symbol.toUpperCase();
    const rawHolding = getCoinHolding(symUpper);
    const locked = getLockedAmount(symUpper);
    return Math.max(0, rawHolding - locked);
  };

  const getCoinPrice = (symbol: string): number => {
    const symUpper = symbol.toUpperCase();
    if (symUpper === 'USDT' || symUpper === 'USDC') return 1;
    return cryptoPrices[symUpper]?.price || 0;
  };
  
  // Crypto States
  const [networks, setNetworks] = useState<CryptoNetwork[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<CryptoNetwork | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [destAddress, setDestAddress] = useState<string>('');
  const [amountUSD, setAmountUSD] = useState<string>('');
  const [walletPIN, setWalletPIN] = useState<string>('');
  
  // P2P States
  const [merchants, setMerchants] = useState<P2PMerchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<P2PMerchant | null>(null);
  const [p2pUSDAmount, setP2pUSDAmount] = useState<string>('');
  const [p2pTxId] = useState<string>(() => 'MOREX-SELL-' + Math.floor(1000000 + Math.random() * 9000000));

  const toast = useToast();
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  const setError = (msg: string | null) => {
    setErrorState(msg);
    if (msg) {
      toast.error(msg, 'Withdrawal Error');
    }
  };
  const error = errorState;
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');

  // Auto-clear error when user switches navigation step, merchant, coin, or input amounts
  useEffect(() => {
    setErrorState(null);
  }, [method, selectedMerchant?.id, selectedCoin?.id, p2pUSDAmount, amountUSD]);

  // Fetch latest balance, networks & merchants
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setProfile(userSnap.data() as UserAccount);
        }

        // Fetch user's locked USDT amount from active investments
        const invCol = collection(db, 'investments');
        const invQuery = query(invCol, where('userId', '==', user.uid));
        const invSnap = await getDocs(invQuery);
        const invList = invSnap.docs.map(d => d.data());
        const userActiveInvs = invList.filter((inv: any) => inv.status === 'active');
        setActiveInvestments(userActiveInvs);
        const lockedSum = userActiveInvs
          .filter((inv: any) => inv.coinSymbol === 'USDT')
          .reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
        setLockedUSDT(lockedSum);

        // Fetch crypto prices
        const pricesCol = collection(db, 'crypto_prices');
        const pricesSnap = await getDocs(pricesCol);
        const pricesMap: Record<string, CryptoPrice> = {};
        pricesSnap.docs.forEach(docSnap => {
          const data = docSnap.data() as CryptoPrice;
          if (data && data.symbol) {
            pricesMap[data.symbol.toUpperCase()] = data;
          }
        });
        setCryptoPrices(pricesMap);

        const netCol = collection(db, 'crypto_networks');
        const netSnap = await getDocs(netCol);
        const netList = netSnap.docs.map(doc => doc.data() as CryptoNetwork);
        const order = ['usdt', 'usdc', 'btc', 'eth', 'sol', 'bnb', 'xrp', 'wld', 'trx', 'doge'];
        netList.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        setNetworks(netList);
        if (netList.length > 0) {
          setSelectedCoin(netList[0]);
          if (netList[0].networks.length > 0) {
            setSelectedNetwork(netList[0].networks[0]);
          }
        }

        const merchCol = collection(db, 'p2p_merchants');
        const merchSnap = await getDocs(merchCol);
        let merchList = merchSnap.docs.map(doc => doc.data() as P2PMerchant);
        if (merchList.length === 0) {
          merchList = DEFAULT_MERCHANTS;
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          merchList = merchList.map(m => ({
            ...m,
            rate: 0,
            completionRate: 0,
            completedOrders: 0,
            minLimit: 0,
            maxLimit: 0,
            rating: 0,
          }));
        }
        setMerchants(merchList);
      } catch (err) {
        console.error('Error fetching details:', err);
        setError('Failed to fetch details.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user]);

  // Handle offline mode for P2P merchants
  useEffect(() => {
    const applyOfflineMerchants = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setMerchants(prev => prev.map(m => ({
          ...m,
          rate: 0,
          completionRate: 0,
          completedOrders: 0,
          minLimit: 0,
          maxLimit: 0,
          rating: 0,
        })));
        setSelectedMerchant(prev => prev ? {
          ...prev,
          rate: 0,
          completionRate: 0,
          completedOrders: 0,
          minLimit: 0,
          maxLimit: 0,
          rating: 0,
        } : null);
      }
    };

    window.addEventListener('offline', applyOfflineMerchants);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      applyOfflineMerchants();
    }
    return () => {
      window.removeEventListener('offline', applyOfflineMerchants);
    };
  }, []);

  // Helper regex validator for destination crypto addresses based on selected network
  const validateCryptoAddress = (address: string, networkName: string): boolean => {
    const trimmed = address.trim();
    if (!trimmed) return false;

    const upperNet = networkName.toUpperCase();
    if (upperNet.includes('TRC20') || upperNet.includes('TRON')) {
      return /^T[a-zA-HJ-NP-Z0-9]{33}$/.test(trimmed);
    }
    if (upperNet.includes('ERC20') || upperNet.includes('BEP20') || upperNet.includes('POLYGON') || upperNet.includes('BASE') || upperNet.includes('ARBITRUM') || upperNet.includes('OPTIMISM') || upperNet.includes('AVALANCHE') || upperNet.includes('BNB')) {
      return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
    }
    if (upperNet.includes('BTC') || upperNet.includes('BITCOIN')) {
      return /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed);
    }
    if (upperNet.includes('SOL') || upperNet.includes('SOLANA')) {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
    }
    // Generic check for other blockchains (at least 20 non-whitespace chars)
    return trimmed.length >= 10;
  };

  // Submit Crypto Withdrawal (Deducts balance immediately & stores 10% fee breakdown)
  const handleCryptoWithdrawSubmit = async () => {
    if (!amountUSD || parseFloat(amountUSD) <= 0) {
      setError('Please enter a valid amount to withdraw.');
      return;
    }
    const usdVal = parseFloat(amountUSD);
    const coinSym = selectedCoin ? selectedCoin.id.toUpperCase() : 'USDT';
    const unlockedHolding = getUnlockedCoinHolding(coinSym);
    const price = getCoinPrice(coinSym);
    const availableUSD = coinSym === 'USDT' ? Math.max(0, (profile?.balance || 0) - lockedUSDT) : unlockedHolding * price;
    const minLimitUSD = selectedCoin?.minWithdrawalUSD ?? 10;

    if (usdVal < minLimitUSD) {
      setError(`Minimum withdrawal amount for ${formatCoinName(selectedCoin?.tokenName || '')} is $${minLimitUSD.toFixed(2)} USD.`);
      return;
    }

    if (usdVal > availableUSD + 0.0001) {
      if (coinSym === 'USDT') {
        setError(`Insufficient available balance. You have $${availableUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} available ($${lockedUSDT.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT is locked in MMF).`);
      } else {
        setError(`Insufficient ${coinSym} balance. You have ${unlockedHolding.toFixed(6)} ${coinSym} (≈ $${availableUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD) available.`);
      }
      return;
    }
    if (!validateCryptoAddress(destAddress, selectedNetwork)) {
      setError(`Invalid ${selectedNetwork} address format. Please check and enter a valid ${selectedNetwork} destination address.`);
      return;
    }
    if (!profile?.walletPassword) {
      setError('Please configure a 4-digit Wallet Security PIN in your Profile settings before withdrawing.');
      return;
    }
    if (walletPIN !== profile.walletPassword) {
      setError('Incorrect Wallet Security PIN. Please verify your PIN.');
      return;
    }
    if (profile && !profile.withdrawalEnabled) {
      setError('Your withdrawal permission is currently suspended.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const coinAmt = price > 0 ? parseFloat((usdVal / price).toFixed(8)) : usdVal;
      const feePercent = 10;
      const feeAmount = parseFloat((usdVal * 0.10).toFixed(2));
      const netAmount = parseFloat((usdVal * 0.90).toFixed(2));

      // Run transaction to immediately deduct balance and record withdrawal request with 10% fee breakdown
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
          throw new Error('User record does not exist.');
        }

        const userData = userSnap.data();

        if (coinSym === 'USDT') {
          const currentBal = userData.balance || 0;
          const currentAvailable = Math.max(0, currentBal - lockedUSDT);
          if (usdVal > currentAvailable + 0.0001) {
            throw new Error(`Insufficient available balance during execution. You have $${currentAvailable.toFixed(2)} available.`);
          }
          transaction.update(userRef, {
            balance: parseFloat((currentBal - usdVal).toFixed(2))
          });
        } else {
          const currentHoldings = userData.holdings || {};
          const currentCoinBal = currentHoldings[coinSym] || 0;
          if (coinAmt > currentCoinBal + 0.000001) {
            throw new Error(`Insufficient ${coinSym} balance. You have ${currentCoinBal.toFixed(6)} ${coinSym}.`);
          }
          transaction.update(userRef, {
            holdings: {
              ...currentHoldings,
              [coinSym]: Math.max(0, currentCoinBal - coinAmt)
            }
          });
        }

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          id: txRef.id,
          userId: user.uid,
          userEmail: user.email,
          type: 'withdraw_crypto',
          amount: usdVal,
          feePercent: feePercent,
          feeAmount: feeAmount,
          netAmount: netAmount,
          coinSymbol: coinSym,
          coinAmount: coinAmt,
          status: 'PENDING APPROVAL',
          createdAt: serverTimestamp(),
          network: selectedNetwork,
          address: destAddress,
          merchantName: selectedCoin ? formatCoinName(selectedCoin.tokenName) : ''
        });
      });

      onSuccess();
    } catch (err: any) {
      console.error('Crypto withdrawal error:', err);
      setError(err.message || 'Failed to initialize crypto withdrawal.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit P2P Withdrawal (User releases Escrow upon receiving payment, instantly deducting USD)
  const handleP2PSellRelease = async () => {
    if (profile && !profile.withdrawalEnabled) {
      setError('Your withdrawal permission is currently suspended.');
      return;
    }
    if (!profile?.walletPassword) {
      setError('Please configure a 4-digit Wallet Security PIN in your Profile settings before withdrawing.');
      return;
    }
    if (walletPIN !== profile.walletPassword) {
      setError('Incorrect Wallet Security PIN. Please verify your PIN.');
      return;
    }
    
    setSubmitting(true);
    setError(null);

    try {
      const usdVal = parseFloat(p2pUSDAmount);
      const localShillings = usdVal * (selectedMerchant?.rate || 0);

      // Perform transaction to safely deduct balance and create transaction
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists()) {
          throw new Error("User record doesn't exist!");
        }

        const currentBalance = userDoc.data().balance || 0;
        const availableBalance = Math.max(0, currentBalance - lockedUSDT);
        if (usdVal > availableBalance) {
          throw new Error(`Insufficient available balance during transaction execution. You have $${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} available ($${lockedUSDT.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT is locked in MMF).`);
        }

        const feePercent = 10;
        const feeAmount = parseFloat((usdVal * 0.10).toFixed(2));
        const netAmount = parseFloat((usdVal * 0.90).toFixed(2));

        // Deduct balance instantly
        transaction.update(userRef, {
          balance: parseFloat((currentBalance - usdVal).toFixed(2))
        });

        // Add transaction marked as APPROVED
        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          id: txRef.id,
          userId: user.uid,
          userEmail: user.email,
          type: 'withdraw_p2p',
          amount: usdVal,
          feePercent: feePercent,
          feeAmount: feeAmount,
          netAmount: netAmount,
          localAmount: localShillings,
          status: 'APPROVED', // Marked approved instantly because client released it!
          createdAt: serverTimestamp(),
          merchantName: selectedMerchant?.name || '',
          address: selectedMerchant?.paymentNumber || '',
          paymentMessage: `Released by Client: Received local payment of ${localShillings.toLocaleString()} Shs.`
        });
      });

      onSuccess();
    } catch (err: any) {
      console.error('P2P release error:', err);
      setError(err.message || 'Failed to release P2P payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="withdraw-workflow-container" className="max-w-md mx-auto p-4 sm:p-5 bg-[#FFF3D6] text-zinc-800 min-h-[calc(100vh-140px)]">
      {/* Dynamic Header */}
      <div className="flex items-center gap-3 mb-6">
        <button 
          id="withdraw-back-btn"
          onClick={() => {
            if (method === 'selection' || method === 'crypto_coin_select') onBack();
            else if (method === 'crypto') setMethod('crypto_coin_select');
            else if (method === 'crypto_pin_confirm') setMethod('crypto');
            else onBack();
          }}
          className="p-2 rounded-full bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-lg font-black tracking-tight text-zinc-800">
            {(method === 'selection' || method === 'crypto_coin_select') && 'Select Coin to Withdraw'}
            {method === 'crypto' && 'Crypto Withdrawal Details'}
            {method === 'crypto_pin_confirm' && 'Verify Security PIN'}
          </h2>
          <p className="text-xs text-zinc-500">
            {(method === 'selection' || method === 'crypto_coin_select') && 'Select a coin from your available asset holdings to withdraw'}
            {method === 'crypto' && `Configure network and destination for ${selectedCoin ? formatCoinName(selectedCoin.tokenName) : ''}`}
            {method === 'crypto_pin_confirm' && 'Enter your 4-digit PIN to authorize withdrawal'}
          </p>
        </div>
      </div>

      {profile && !profile.withdrawalEnabled && (
        <div id="withdrawal-disabled-alert" className="p-3.5 mb-5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-start gap-2.5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" strokeWidth={2.5} />
          <span>
            <strong>Withdrawal Restricted:</strong> Withdrawal permissions are currently suspended for your account. Please contact support.
          </span>
        </div>
      )}

      {/* Alert banner if user has NOT configured a Wallet Security PIN */}
      {profile && !profile.walletPassword && (
        <div id="missing-pin-top-banner" className="p-4 mb-5 bg-amber-50 border border-amber-200 text-zinc-800 rounded-2xl text-xs space-y-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 shrink-0">
              <Key size={18} />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-zinc-900">Security PIN Not Set</h4>
              <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
                You must set up a 4-digit Wallet Security PIN before you can perform any withdrawals.
              </p>
            </div>
          </div>
          <button
            type="button"
            id="setup-pin-top-btn"
            onClick={handleGoToPinSettings}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/10 hover:from-amber-600 hover:to-orange-600 cursor-pointer"
          >
            <Key size={14} />
            <span>Set Up Security PIN Now</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Inline error callout with direct PIN action buttons */}
      {error && (
        <div id="withdrawal-error-banner" className="p-3.5 mb-5 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs space-y-2.5 shadow-sm relative">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 pr-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
              <span className="font-semibold text-xs leading-snug">{error}</span>
            </div>
            <button
              type="button"
              id="dismiss-withdrawal-error-btn"
              onClick={() => setErrorState(null)}
              className="p-1 hover:bg-red-100 rounded-lg text-red-600 transition-colors cursor-pointer shrink-0"
              title="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>

          {!profile?.walletPassword && (
            <button
              type="button"
              id="error-setup-pin-redirect-btn"
              onClick={handleGoToPinSettings}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all cursor-pointer shadow-sm"
            >
              <Key size={13} />
              <span>Set Up Security PIN in Settings</span>
              <ArrowRight size={13} />
            </button>
          )}

          {profile?.walletPassword && (error.toLowerCase().includes('pin') || error.toLowerCase().includes('incorrect')) && (
            <button
              type="button"
              id="error-change-pin-redirect-btn"
              onClick={handleGoToPinSettings}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-all cursor-pointer shadow-sm"
            >
              <Key size={13} />
              <span>Change or Reset Your Security PIN</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}



      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[250px] gap-3">
          <RefreshCw size={24} className="text-amber-500 animate-spin" />
          <span className="text-xs text-zinc-500 font-medium">Loading settings...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Crypto Coin Select Panel (Default Withdrawal Screen - filtered by user asset holdings) */}
          {(method === 'selection' || method === 'crypto_coin_select') && (() => {
            const userNetworks = networks.filter(net => {
              const sym = net.id.toUpperCase();
              return getUnlockedCoinHolding(sym) > 0;
            });

            if (userNetworks.length === 0) {
              return (
                <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertCircle size={24} />
                  </div>
                  <h3 className="font-extrabold text-sm text-zinc-800">No Crypto Holdings Available</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-xs mx-auto">
                    You currently do not have any unlocked crypto holdings available for withdrawal. Please deposit or trade to acquire assets.
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {userNetworks.map(net => {
                  const formattedName = formatCoinName(net.tokenName);
                  const sym = net.id.toUpperCase();
                  const unlocked = getUnlockedCoinHolding(sym);
                  const price = getCoinPrice(sym);
                  const estUSD = sym === 'USDT' ? unlocked : unlocked * price;

                  return (
                    <button
                      key={net.id}
                      id={`crypto-withdraw-select-asset-${net.id}`}
                      onClick={() => {
                        setSelectedCoin(net);
                        if (net.networks.length > 0) {
                          setSelectedNetwork(net.networks[0]);
                        } else {
                          setSelectedNetwork('');
                        }
                        setMethod('crypto');
                      }}
                      className="w-full flex items-center justify-between p-4 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-2xl transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <CoinIcon symbol={sym} className="w-10 h-10 shrink-0" />
                        <div>
                          <h4 className="font-bold text-sm text-zinc-800 group-hover:text-amber-600 transition-colors">
                            {formattedName}
                          </h4>
                          <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                            Available: {unlocked < 1 && sym !== 'USDT' && sym !== 'USDC' ? unlocked.toFixed(6) : unlocked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {sym}
                            {sym !== 'USDT' && sym !== 'USDC' && estUSD > 0 && ` (≈ $${estUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
                          </p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            Supported Networks: {net.networks.join(', ')}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Crypto Withdrawal Panel */}
          {method === 'crypto' && selectedCoin && (() => {
            const sym = selectedCoin.id.toUpperCase();
            const unlocked = getUnlockedCoinHolding(sym);
            const price = getCoinPrice(sym);
            const availableUSD = sym === 'USDT' ? Math.max(0, (profile?.balance || 0) - lockedUSDT) : unlocked * price;
            const currentNumVal = parseFloat(amountUSD || '0');
            const coinEquivalent = price > 0 ? (currentNumVal / price) : 0;

            return (
              <div className="space-y-4">
                {/* Selected Coin Banner */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center justify-between gap-3.5 mb-2">
                  <div className="flex items-center gap-3.5">
                    <CoinIcon symbol={sym} className="w-11 h-11 rounded-xl shrink-0" />
                    <div>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Selected Asset</span>
                      <span className="text-sm font-black text-zinc-800">{formatCoinName(selectedCoin.tokenName)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Asset Holding</span>
                    <span className="text-xs font-black text-emerald-600">
                      {unlocked < 1 && sym !== 'USDT' && sym !== 'USDC' ? unlocked.toFixed(6) : unlocked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {sym}
                    </span>
                    {sym !== 'USDT' && sym !== 'USDC' && (
                      <span className="text-[10px] text-zinc-500 block">≈ ${availableUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</span>
                    )}
                  </div>
                </div>

                {/* Clean Noticeable Network Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                      Select Network
                    </label>
                    {selectedNetwork && (
                      <span className="text-xs font-black font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        {selectedNetwork}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {selectedCoin.networks.map(net => {
                      const isSelected = selectedNetwork === net;
                      const netInfo = getNetworkMetadata(net);

                      return (
                        <button
                          key={net}
                          id={`withdraw-network-btn-${net}`}
                          type="button"
                          onClick={() => setSelectedNetwork(net)}
                          className={`py-2 px-3 rounded-xl border-2 transition-all flex items-center justify-between gap-2 cursor-pointer text-left ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                              : 'bg-white border-zinc-200 text-zinc-800 hover:border-amber-400 hover:bg-amber-50/20 shadow-2xs'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-mono font-black text-xs tracking-tight ${
                                isSelected ? 'text-white' : 'text-zinc-900'
                              }`}>
                                {net}
                              </span>
                              {netInfo.badge && (
                                <span className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded leading-none uppercase ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'
                                }`}>
                                  {netInfo.badge}
                                </span>
                              )}
                            </div>
                            <p className={`text-[10px] font-medium truncate mt-0.5 leading-tight ${
                              isSelected ? 'text-amber-100' : 'text-zinc-500'
                            }`}>
                              {netInfo.fullName}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {isSelected ? (
                              <div className="w-4 h-4 rounded-full bg-white text-amber-600 flex items-center justify-center shadow-2xs">
                                <Check size={11} strokeWidth={3.5} />
                              </div>
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-300" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Destination Address */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500">External Destination Wallet Address ({selectedNetwork})</label>
                  <input
                    id="withdraw-crypto-address"
                    type="text"
                    required
                    placeholder={`Paste external ${selectedNetwork} wallet address`}
                    value={destAddress}
                    onChange={(e) => setDestAddress(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 text-zinc-800 font-mono"
                  />
                </div>

                {/* Amount USD */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-zinc-500">Amount (USD)</label>
                    <span className="text-[10px] text-zinc-500 font-semibold">
                      Available: {sym === 'USDT' ? `$${availableUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${unlocked.toFixed(6)} ${sym} ($${availableUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })})`}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500 font-bold text-sm">$</span>
                    <input
                      id="withdraw-crypto-amount"
                      type="number"
                      required
                      placeholder="0.00"
                      value={amountUSD}
                      onChange={(e) => setAmountUSD(e.target.value)}
                      className="w-full pl-8 pr-16 py-3 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 text-zinc-800 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setAmountUSD(availableUSD.toFixed(2))}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <span className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 font-black text-[10px] px-2.5 py-1 rounded-md border border-amber-500/30 transition-all cursor-pointer">
                        MAX
                      </span>
                    </button>
                  </div>
                  {(() => {
                    const minLimitUSD = selectedCoin.minWithdrawalUSD ?? 10;
                    const minCoinEquivalent = price > 0 ? (minLimitUSD / price) : 0;
                    return (
                      <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-500 pt-1 px-1">
                        <span>Min. Withdrawal:</span>
                        <span className="text-amber-700 font-bold font-mono">
                          ${minLimitUSD.toFixed(2)} USD
                          {sym !== 'USDT' && sym !== 'USDC' && price > 0 && ` (≈ ${minCoinEquivalent.toFixed(6)} ${sym})`}
                        </span>
                      </div>
                    );
                  })()}
                  {currentNumVal > 0 && price > 0 && sym !== 'USDT' && (
                    <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 p-2 rounded-lg">
                      Withdrawal Asset Value: <span className="font-bold text-zinc-900">{coinEquivalent.toFixed(6)} {sym}</span>
                    </p>
                  )}
                </div>

                {/* Proceed Button */}
                <button
                  id="withdraw-crypto-proceed"
                  onClick={() => {
                    setError(null);
                    const usdVal = parseFloat(amountUSD);
                    const minLimitUSD = selectedCoin.minWithdrawalUSD ?? 10;
                    if (!amountUSD || isNaN(usdVal) || usdVal <= 0) {
                      setError('Please enter a valid withdrawal amount.');
                      return;
                    }
                    if (usdVal < minLimitUSD) {
                      setError(`Minimum withdrawal amount for ${formatCoinName(selectedCoin.tokenName)} is $${minLimitUSD.toFixed(2)} USD.`);
                      return;
                    }
                    if (usdVal > availableUSD + 0.0001) {
                      if (sym === 'USDT') {
                        setError(`Insufficient available balance. You have $${availableUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} available.`);
                      } else {
                        setError(`Insufficient ${sym} balance. You have ${unlocked.toFixed(6)} ${sym} (≈ $${availableUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD) available.`);
                      }
                      return;
                    }
                    if (!destAddress.trim()) {
                      setError('Please provide a valid destination wallet address.');
                      return;
                    }
                    if (!validateCryptoAddress(destAddress, selectedNetwork)) {
                      setError(`Invalid ${selectedNetwork} address format. Please check and enter a valid ${selectedNetwork} destination address.`);
                      return;
                    }
                    if (!profile?.walletPassword) {
                      setError('Please configure a 4-digit Wallet Security PIN in your Profile settings before withdrawing.');
                      return;
                    }
                    setMethod('crypto_pin_confirm');
                  }}
                  className="w-full flex items-center justify-between py-3 px-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 rounded-xl text-sm font-bold transition-all shadow-md mt-6 cursor-pointer"
                >
                  <span>Proceed to Secure Confirmation</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            );
          })()}

          {/* Crypto Enter PIN Final Confirm Screen */}
          {method === 'crypto_pin_confirm' && selectedCoin && (() => {
            const grossVal = parseFloat(amountUSD) || 0;
            const feeVal = grossVal * 0.10;
            const netVal = grossVal * 0.90;
            const coinSym = selectedCoin.id.toUpperCase();
            const price = getCoinPrice(coinSym);
            const netCoinVal = price > 0 ? (netVal / price) : netVal;

            return (
              <div className="space-y-5 text-left">
                <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col items-center justify-center text-center gap-2.5 pb-2 border-b border-zinc-200/60">
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <Lock size={22} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-zinc-800">Confirm Crypto Withdrawal</h3>
                      <p className="text-[11px] text-zinc-500">Authorize transfer of assets to your destination address</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center pb-1 border-b border-zinc-100">
                      <span className="text-zinc-500">Asset</span>
                      <span className="font-mono font-bold text-zinc-800">{formatCoinName(selectedCoin.tokenName)}</span>
                    </div>
                    <div className="flex justify-between items-center pb-1 border-b border-zinc-100">
                      <span className="text-zinc-500">Network</span>
                      <span className="font-mono font-bold text-amber-600">{selectedNetwork}</span>
                    </div>
                    <div className="flex justify-between items-center pb-1 border-b border-zinc-100">
                      <span className="text-zinc-500">Destination Address</span>
                      <span className="font-mono font-bold text-zinc-600 break-all max-w-[180px] text-right">{destAddress}</span>
                    </div>
                    <div className="flex justify-between items-center pb-1 border-b border-zinc-100">
                      <span className="text-zinc-500">Withdrawal Amount (Gross)</span>
                      <span className="font-mono font-bold text-zinc-800">${grossVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                    </div>
                    <div className="flex justify-between items-center pb-1 border-b border-zinc-100">
                      <span className="text-zinc-500">10% Withdrawal Fee</span>
                      <span className="font-mono font-bold text-red-500">-${feeVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/80">
                      <span className="text-emerald-900 font-bold">You Will Receive (Net)</span>
                      <div className="text-right">
                        <span className="font-mono font-black text-emerald-700 text-sm block">${netVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                        {coinSym !== 'USDT' && (
                          <span className="font-mono font-semibold text-emerald-600 text-[10px] block">≈ {netCoinVal.toFixed(6)} {coinSym}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-red-50 border border-red-100 text-red-800 text-[10px] rounded-xl leading-relaxed text-center">
                    <strong>Caution:</strong> Ensure the wallet address is correct. Crypto transfers are irreversible. A 10% system processing fee is deducted from your requested withdrawal.
                  </div>
                </div>

                {/* Wallet PIN Form */}
              <div className="space-y-4 bg-white border border-zinc-200 rounded-2xl p-4">
                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-semibold text-zinc-500 block">
                    Enter 4-Digit Wallet Security PIN
                  </label>
                  <input
                    id="withdraw-final-crypto-pin"
                    type="password"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={walletPIN}
                    onChange={(e) => setWalletPIN(e.target.value.replace(/\D/g, ''))}
                    className="w-32 mx-auto px-4 py-3 bg-zinc-50 border border-zinc-250 rounded-xl text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 text-zinc-800 block"
                  />
                  <button
                    type="button"
                    id="crypto-forgot-pin-btn"
                    onClick={handleGoToPinSettings}
                    className="mt-2 text-amber-600 hover:text-amber-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer mx-auto"
                  >
                    <Key size={13} />
                    <span>Wrong or forgot PIN? Change PIN in Settings</span>
                  </button>
                </div>

                <button
                  id="confirm-crypto-release-btn"
                  onClick={handleCryptoWithdrawSubmit}
                  disabled={submitting || !walletPIN || walletPIN.length !== 4}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 rounded-xl text-sm font-black transition-all shadow-md cursor-pointer uppercase tracking-wider"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>CONFIRM & SUBMIT WITHDRAWAL</span>
                  )}
                </button>

                <button
                  id="cancel-crypto-pin-confirm-btn"
                  onClick={() => {
                    setError(null);
                    setMethod('crypto');
                  }}
                  className="w-full py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-500 hover:text-zinc-700 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                >
                  Cancel & Go Back
                </button>
              </div>
            </div>
          );
        })()}

          {/* P2P Sell Board (Merchants) */}
          {method === 'p2p' && (() => {
            const sellMerchants = merchants.filter(m => !m.type || m.type === 'sell' || m.type === 'both');
            return (
              <div className="space-y-4">
                {sellMerchants.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-zinc-500 text-xs">No active sell merchants found. Please try another withdrawal method or check back later.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sellMerchants.map(merch => (
                      <div
                         key={merch.id}
                         id={`p2p-sell-merchant-${merch.id}`}
                         className="bg-white border border-zinc-200 rounded-2xl p-4 hover:border-amber-400 transition-all flex flex-col justify-between gap-4"
                      >
                        <div className="flex justify-between items-start">
                          {/* Rating top-left */}
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 font-bold text-[10px]">
                            <Star size={10} className="fill-amber-500 text-amber-500" />
                            <span>{(merch.rating || 0).toFixed(2)} Rating</span>
                          </div>
                          {/* Merchant Name top-right */}
                          <span className="text-xs font-black text-zinc-700 tracking-tight">{merch.name}</span>
                        </div>

                        <div className="flex justify-between items-end">
                          <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Payout Rate</div>
                            <div className="text-base font-black text-amber-600 font-mono mt-0.5">
                              {(merch.rate > 1.5 ? merch.rate - 1.5 : 0).toLocaleString()} Shs <span className="text-xs text-zinc-400 font-normal">/ 1 USD</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 font-medium mt-1">
                              Limits: <span className="font-mono font-bold text-zinc-700">{(merch.minLimit || 500).toLocaleString()} Shs - {(merch.maxLimit || 500000).toLocaleString()} Shs</span>
                            </div>
                            <div className="flex gap-1.5 mt-1.5">
                              {merch.providers.map(prov => (
                                <span key={prov} className="text-[9px] px-2 py-0.5 bg-zinc-50 border border-zinc-200 text-zinc-500 rounded-md font-semibold">
                                  {prov}
                                </span>
                              ))}
                            </div>
                          </div>

                          <button
                            id={`p2p-sell-btn-${merch.id}`}
                            onClick={() => {
                              setSelectedMerchant(merch);
                              setMethod('p2p_calc');
                            }}
                            className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-xl text-xs font-bold shadow-md shadow-amber-500/5 cursor-pointer"
                          >
                            SELL
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* P2P SELL Calculator */}
          {method === 'p2p_calc' && selectedMerchant && (
            <div className="space-y-5">
              <div className="bg-white border border-zinc-200 rounded-2xl p-4">
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500 font-bold">{selectedMerchant.name}</span>
                  <div className="flex items-center gap-1 text-[11px] text-amber-600 font-bold">
                    <Star size={12} className="fill-amber-500 text-amber-500" />
                    <span>{selectedMerchant.rating}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-zinc-500 flex justify-between items-center">
                  <span>Payout Rate: <strong className="font-mono text-zinc-750">{(selectedMerchant.rate > 1.5 ? selectedMerchant.rate - 1.5 : 0).toFixed(2)} Shs = 1.00 USD</strong></span>
                  <span className="text-[10px] font-mono text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Min {(selectedMerchant.minLimit || 500).toLocaleString()} - Max {(selectedMerchant.maxLimit || 500000).toLocaleString()} Shs
                  </span>
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-zinc-500">Amount (USD to Sell)</label>
                    <span className="text-[10px] text-zinc-500 font-semibold">
                      Available: ${Math.max(0, (profile?.balance || 0) - lockedUSDT).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500 font-bold text-sm">$</span>
                    <input
                      id="p2p-sell-usd-input"
                      type="number"
                      required
                      placeholder="100.00"
                      value={p2pUSDAmount}
                      onChange={(e) => setP2pUSDAmount(e.target.value)}
                      className="w-full pl-8 pr-16 py-3 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 text-zinc-800 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setP2pUSDAmount(Math.max(0, (profile?.balance || 0) - lockedUSDT).toString())}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <span className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 font-black text-[10px] px-2.5 py-1 rounded-md border border-amber-500/30 transition-all cursor-pointer">
                        MAX
                      </span>
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex justify-between items-center">
                  <span className="text-xs text-zinc-500 font-semibold">Exact Shillings you will receive</span>
                  <span className="text-lg font-black text-amber-600 font-mono">
                    {p2pUSDAmount && parseFloat(p2pUSDAmount) > 0 
                      ? (parseFloat(p2pUSDAmount) * (selectedMerchant.rate > 1.5 ? selectedMerchant.rate - 1.5 : 0)).toLocaleString(undefined, { maximumFractionDigits: 2 }) 
                      : '0.00'
                    } Shs
                  </span>
                </div>
              </div>

              {/* Proceed to Sell */}
              <button
                id="p2p-sell-proceed"
                disabled={!p2pUSDAmount || parseFloat(p2pUSDAmount) <= 0}
                onClick={() => {
                  setError(null);
                  const usdVal = parseFloat(p2pUSDAmount) || 0;
                  const availableBalance = Math.max(0, (profile?.balance || 0) - lockedUSDT);
                  if (usdVal > availableBalance) {
                    setError('Insufficient funds');
                    return;
                  }
                  const rate = selectedMerchant.rate > 1.5 ? selectedMerchant.rate - 1.5 : 0;
                  const shillings = usdVal * rate;
                  const min = selectedMerchant.minLimit || 500;
                  const max = selectedMerchant.maxLimit || 500000;
                  if (shillings < min) {
                    setError(`Minimum payout for ${selectedMerchant.name} is ${min.toLocaleString()} Shs (approx. $${(min / (rate || 1)).toFixed(2)} USD).`);
                    return;
                  }
                  if (shillings > max) {
                    setError(`Maximum payout for ${selectedMerchant.name} is ${max.toLocaleString()} Shs (approx. $${(max / (rate || 1)).toFixed(2)} USD).`);
                    return;
                  }
                  setMethod('p2p_instructions');
                }}
                className="w-full flex items-center justify-between py-3 px-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 rounded-xl text-sm font-bold transition-all shadow-md mt-6 cursor-pointer"
              >
                <span>Proceed to Sell</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* P2P Awaiting Release Confirmation */}
          {method === 'p2p_instructions' && selectedMerchant && (
            <div className="space-y-5">
              <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider text-center">Payout Details</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs border-b border-zinc-100 pb-2">
                    <span className="text-zinc-500">Merchant Name</span>
                    <span className="font-bold text-zinc-850">{selectedMerchant.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-zinc-100 pb-2">
                    <span className="text-zinc-500">Expected Local Shillings</span>
                    <span className="font-mono font-bold text-amber-600">
                      {(parseFloat(p2pUSDAmount) * (selectedMerchant.rate > 1.5 ? selectedMerchant.rate - 1.5 : 0)).toLocaleString()} Shs
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-zinc-100 pb-2">
                    <span className="text-zinc-500">Merchant Payment Number</span>
                    <span className="font-mono font-bold text-zinc-800">{selectedMerchant.paymentNumber}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-zinc-100 pb-2">
                    <span className="text-zinc-500">Reference Sell ID</span>
                    <span className="font-mono font-bold text-zinc-500 text-[10px]">{p2pTxId}</span>
                  </div>
                </div>
 
                <div className="p-3 bg-amber-50 border border-amber-100 text-amber-800 text-[10px] rounded-xl leading-relaxed">
                  <strong>P2P Escrow Protection Notice:</strong> The merchant has been pinged. Once you verify that you have successfully received mobile money of <strong>{(parseFloat(p2pUSDAmount) * (selectedMerchant.rate > 1.5 ? selectedMerchant.rate - 1.5 : 0)).toLocaleString()} Shs</strong>, click the confirmation button below to proceed to the secure release screen.
                </div>
              </div>
 
              {/* Proceed Button */}
              <div className="space-y-3 pt-2">
                <p className="text-xs text-zinc-500 text-center font-bold flex items-center justify-center gap-1">
                  <HelpCircle size={14} className="text-amber-500" />
                  Have you successfully received the payout?
                </p>
                <button
                  id="p2p-received-funds-btn"
                  onClick={() => {
                    if (!profile?.walletPassword) {
                      setError('Please configure a 4-digit Wallet Security PIN in your Profile settings before withdrawing.');
                      return;
                    }
                    setError(null);
                    setMethod('p2p_pin_confirm');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-xl text-sm font-black transition-all shadow-md cursor-pointer uppercase tracking-wider"
                >
                  <span>YES, I HAVE RECEIVED THE FUNDS</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* P2P Enter PIN Final Release Screen */}
          {method === 'p2p_pin_confirm' && selectedMerchant && (
            <div className="space-y-5">
              <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col items-center justify-center text-center gap-2.5 pb-2 border-b border-zinc-200/60">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Lock size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-zinc-800">Release Escrow USD</h3>
                    <p className="text-[11px] text-zinc-500">Authorize final transfer to {selectedMerchant.name}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs pb-1">
                    <span className="text-zinc-500">Releasing Escrow</span>
                    <span className="font-mono font-bold text-zinc-800">${parseFloat(p2pUSDAmount).toLocaleString()} USD</span>
                  </div>
                  <div className="flex justify-between items-center text-xs pb-1">
                    <span className="text-zinc-500">Amount Received</span>
                    <span className="font-mono font-bold text-amber-600">
                      {(parseFloat(p2pUSDAmount) * (selectedMerchant.rate > 1.5 ? selectedMerchant.rate - 1.5 : 0)).toLocaleString()} Shs
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-red-50 border border-red-100 text-red-800 text-[10px] rounded-xl leading-relaxed text-center">
                  <strong>Caution:</strong> Releasing escrow is final and cannot be reversed. Only input your PIN if you have verified the funds are in your mobile wallet.
                </div>
              </div>

              {/* Wallet PIN Form */}
              <div className="space-y-4 bg-white border border-zinc-200 rounded-2xl p-4">
                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-semibold text-zinc-500 block">
                    Enter 4-Digit Wallet Security PIN
                  </label>
                  <input
                    id="withdraw-final-p2p-pin"
                    type="password"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={walletPIN}
                    onChange={(e) => setWalletPIN(e.target.value.replace(/\D/g, ''))}
                    className="w-32 mx-auto px-4 py-3 bg-zinc-50 border border-zinc-250 rounded-xl text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 text-zinc-800 block"
                  />
                  <button
                    type="button"
                    id="p2p-forgot-pin-btn"
                    onClick={handleGoToPinSettings}
                    className="mt-2 text-amber-600 hover:text-amber-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer mx-auto"
                  >
                    <Key size={13} />
                    <span>Wrong or forgot PIN? Change PIN in Settings</span>
                  </button>
                </div>

                <button
                  id="confirm-release-pin-btn"
                  onClick={handleP2PSellRelease}
                  disabled={submitting || !walletPIN || walletPIN.length !== 4}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 rounded-xl text-sm font-black transition-all shadow-md cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Releasing Escrow...</span>
                    </>
                  ) : (
                    <span>CONFIRM & RELEASE ESCROW</span>
                  )}
                </button>

                <button
                  id="cancel-pin-confirm-btn"
                  onClick={() => {
                    setError(null);
                    setMethod('p2p_instructions');
                  }}
                  className="w-full py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-500 hover:text-zinc-700 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                >
                  Cancel & Go Back
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
