import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDoc, getDocs, doc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { CryptoNetwork, P2PMerchant, UserAccount, Transaction } from '../types';
import { 
  ArrowLeft, Send, Users, ShieldAlert, ChevronRight, Check, 
  HelpCircle, AlertCircle, RefreshCw, Star, ArrowUpRight, DollarSign, Lock
} from 'lucide-react';
import { CoinIcon } from './StandardUserDashboard';

interface WithdrawalWorkflowProps {
  user: any;
  onBack: () => void;
  onSuccess: () => void;
}

export default function WithdrawalWorkflow({ user, onBack, onSuccess }: WithdrawalWorkflowProps) {
  const [method, setMethod] = useState<'selection' | 'crypto_coin_select' | 'crypto' | 'p2p' | 'p2p_calc' | 'p2p_instructions' | 'p2p_pin_confirm' | 'crypto_pin_confirm'>('selection');

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
  const [p2pTxId] = useState<string>(() => 'ARBITRAGE-SELL-' + Math.floor(1000000 + Math.random() * 9000000));

  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');

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
        const merchList = merchSnap.docs.map(doc => doc.data() as P2PMerchant);
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

  // Submit Crypto Withdrawal (Locks request into Pending Queue, does not deduct balance yet as instructed)
  const handleCryptoWithdrawSubmit = async () => {
    if (!amountUSD || parseFloat(amountUSD) <= 0) {
      setError('Please enter a valid amount to withdraw.');
      return;
    }
    const usdVal = parseFloat(amountUSD);
    if (usdVal > (profile?.balance || 0)) {
      setError('Insufficient available balance.');
      return;
    }
    if (!destAddress.trim()) {
      setError('Please provide a valid destination wallet address.');
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
      setError('Your withdrawal permission has been disabled by Admin.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const newTx: Omit<Transaction, 'id'> = {
        userId: user.uid,
        userEmail: user.email,
        type: 'withdraw_crypto',
        amount: usdVal,
        status: 'PENDING APPROVAL',
        createdAt: serverTimestamp(),
        network: selectedNetwork,
        address: destAddress,
        merchantName: selectedCoin ? formatCoinName(selectedCoin.tokenName) : ''
      };

      await addDoc(collection(db, 'transactions'), newTx);
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
      setError('Your withdrawal permission has been disabled by Admin.');
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
        if (usdVal > currentBalance) {
          throw new Error("Insufficient balance during transaction execution.");
        }

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
    <div id="withdraw-workflow-container" className="max-w-md mx-auto p-4 sm:p-5 bg-slate-900 text-zinc-100 min-h-[calc(100vh-140px)]">
      {/* Dynamic Header */}
      <div className="flex items-center gap-3 mb-6">
        <button 
          id="withdraw-back-btn"
          onClick={() => {
            if (method === 'selection') onBack();
            else if (method === 'crypto_coin_select') setMethod('selection');
            else if (method === 'crypto') setMethod('crypto_coin_select');
            else if (method === 'crypto_pin_confirm') setMethod('crypto');
            else if (method === 'p2p') setMethod('selection');
            else if (method === 'p2p_calc') setMethod('p2p');
            else if (method === 'p2p_instructions') setMethod('p2p_calc');
            else if (method === 'p2p_pin_confirm') setMethod('p2p_instructions');
          }}
          className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-lg font-black tracking-tight">
            {method === 'selection' && 'Withdraw Funds'}
            {method === 'crypto_coin_select' && 'Select Coin'}
            {method === 'crypto' && 'Crypto Withdrawal Details'}
            {method === 'crypto_pin_confirm' && 'Verify Security PIN'}
            {method === 'p2p' && 'P2P Sell Board'}
            {method === 'p2p_calc' && 'P2P Conversion'}
            {method === 'p2p_instructions' && 'Awaiting P2P Escrow Release'}
            {method === 'p2p_pin_confirm' && 'Verify Security PIN'}
          </h2>
          <p className="text-xs text-zinc-500">
            {method === 'selection' && `Available Balance: $${profile?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}`}
            {method === 'crypto_coin_select' && 'Choose a crypto asset to withdraw'}
            {method === 'crypto' && `Configure network and destination for ${selectedCoin ? formatCoinName(selectedCoin.tokenName) : ''}`}
            {method === 'crypto_pin_confirm' && 'Enter your 4-digit PIN to authorize withdrawal'}
            {method === 'p2p' && 'Sell USD directly for local shillings'}
            {method === 'p2p_calc' && `Sell parameters with ${selectedMerchant?.name}`}
            {method === 'p2p_instructions' && 'Verify payment receipt before releasing escrow'}
            {method === 'p2p_pin_confirm' && 'Enter your 4-digit PIN to release funds'}
          </p>
        </div>
      </div>

      {profile && !profile.withdrawalEnabled && (
        <div id="withdrawal-disabled-alert" className="p-3.5 mb-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-start gap-2.5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" strokeWidth={2.5} />
          <span>
            <strong>Withdrawal Restricted:</strong> The Administrator has currently suspended withdrawal permissions for your account. Please contact support.
          </span>
        </div>
      )}

      {error && (
        <div id="withdraw-error-banner" className="p-3 mb-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-start gap-2.5">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[250px] gap-3">
          <RefreshCw size={24} className="text-red-500 animate-spin" />
          <span className="text-xs text-zinc-500">Loading settings...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Withdrawal selection */}
          {method === 'selection' && (
            <div className="space-y-4">
              <button
                id="withdraw-method-crypto"
                onClick={() => setMethod('crypto_coin_select')}
                disabled={profile && !profile.withdrawalEnabled}
                className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 disabled:pointer-events-none border border-slate-700/80 rounded-2xl transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                    <Send size={20} className="rotate-[-45deg]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-100">Withdraw to External Crypto Wallet</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Submit to admin queue for direct stablecoin payouts</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-500" />
              </button>

              <button
                id="withdraw-method-p2p"
                onClick={() => setMethod('p2p')}
                disabled={profile && !profile.withdrawalEnabled}
                className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 disabled:pointer-events-none border border-slate-700/80 rounded-2xl transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-100">Sell USD to Local P2P Merchants</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Cash out USD directly for local shillings (Instant Release)</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-500" />
              </button>
            </div>
          )}

          {/* Crypto Coin Select Panel */}
          {method === 'crypto_coin_select' && (
            <div className="space-y-3">
              {networks.map(net => {
                const formattedName = formatCoinName(net.tokenName);
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
                    className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-750 border border-slate-700/80 rounded-2xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-3.5">
                      <CoinIcon symbol={net.id.toUpperCase()} className="w-10 h-10" />
                      <div>
                        <h4 className="font-bold text-sm text-zinc-100 group-hover:text-red-400 transition-colors">
                          {formattedName}
                        </h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Supported Networks: {net.networks.join(', ')}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Crypto Withdrawal Panel */}
          {method === 'crypto' && selectedCoin && (
            <div className="space-y-4">
              {/* Selected Coin Banner */}
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4 flex items-center gap-3.5 mb-2">
                <CoinIcon symbol={selectedCoin.id.toUpperCase()} className="w-11 h-11 rounded-xl" />
                <div>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Selected Asset</span>
                  <span className="text-sm font-black text-white">{formatCoinName(selectedCoin.tokenName)}</span>
                </div>
              </div>

              {/* Network Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400">Select Network</label>
                <div className="grid grid-cols-3 gap-2">
                  {selectedCoin.networks.map(net => (
                    <button
                      key={net}
                      id={`withdraw-network-btn-${net}`}
                      type="button"
                      onClick={() => setSelectedNetwork(net)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all text-center ${
                        selectedNetwork === net
                          ? 'bg-red-500/10 border-red-500 text-red-400'
                          : 'bg-slate-800 border-slate-700 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              {/* Destination Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400">External Destination Wallet Address ({selectedNetwork})</label>
                <input
                  id="withdraw-crypto-address"
                  type="text"
                  required
                  placeholder={`Paste external ${selectedNetwork} wallet address`}
                  value={destAddress}
                  onChange={(e) => setDestAddress(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-white font-mono"
                />
              </div>

              {/* Amount USD */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-zinc-400">Amount (USD)</label>
                  <span className="text-[10px] text-zinc-500 font-semibold">
                    Available: ${(profile?.balance || 0).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500 font-bold text-sm">$</span>
                  <input
                    id="withdraw-crypto-amount"
                    type="number"
                    required
                    placeholder="100.00"
                    value={amountUSD}
                    onChange={(e) => setAmountUSD(e.target.value)}
                    className="w-full pl-8 pr-16 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setAmountUSD((profile?.balance || 0).toString())}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <span className="bg-red-500/15 hover:bg-red-500/25 text-red-400 font-black text-[10px] px-2.5 py-1 rounded-md border border-red-500/30 transition-all cursor-pointer">
                      MAX
                    </span>
                  </button>
                </div>
              </div>

              {/* Proceed Button */}
              <button
                id="withdraw-crypto-proceed"
                onClick={() => {
                  setError(null);
                  const usdVal = parseFloat(amountUSD);
                  if (!amountUSD || isNaN(usdVal) || usdVal <= 0) {
                    setError('Please enter a valid withdrawal amount.');
                    return;
                  }
                  if (usdVal > (profile?.balance || 0)) {
                    setError('Insufficient available balance.');
                    return;
                  }
                  if (!destAddress.trim()) {
                    setError('Please provide a valid destination wallet address.');
                    return;
                  }
                  if (!profile?.walletPassword) {
                    setError('Please configure a 4-digit Wallet Security PIN in your Profile settings before withdrawing.');
                    return;
                  }
                  setMethod('crypto_pin_confirm');
                }}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-red-600 to-rose-500 text-white hover:from-red-500 hover:to-rose-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-bold transition-all shadow-md mt-6 cursor-pointer uppercase tracking-wider"
              >
                <span>Proceed to Secure Confirmation</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Crypto Enter PIN Final Confirm Screen */}
          {method === 'crypto_pin_confirm' && selectedCoin && (
            <div className="space-y-5 text-left">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col items-center justify-center text-center gap-2.5 pb-2 border-b border-slate-700/60">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                    <Lock size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-zinc-100">Confirm Crypto Withdrawal</h3>
                    <p className="text-[11px] text-zinc-500">Authorize transfer of assets to your destination address</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-700/30">
                    <span className="text-zinc-500">Asset</span>
                    <span className="font-mono font-bold text-zinc-200">{formatCoinName(selectedCoin.tokenName)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-700/30">
                    <span className="text-zinc-500">Network</span>
                    <span className="font-mono font-bold text-red-400">{selectedNetwork}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-700/30">
                    <span className="text-zinc-500">Destination Address</span>
                    <span className="font-mono font-bold text-zinc-300 break-all max-w-[180px] text-right">{destAddress}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-500">Amount to Withdraw</span>
                    <span className="font-mono font-bold text-red-400">${parseFloat(amountUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</span>
                  </div>
                </div>

                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] rounded-xl leading-relaxed text-center">
                  <strong>Caution:</strong> Ensure the wallet address is correct. Crypto transfers are irreversible.
                </div>
              </div>

              {/* Wallet PIN Form */}
              <div className="space-y-4 bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4">
                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-semibold text-zinc-400 block">
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
                    className="w-32 mx-auto px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white block"
                  />
                </div>

                <button
                  id="confirm-crypto-release-btn"
                  onClick={handleCryptoWithdrawSubmit}
                  disabled={submitting || !walletPIN || walletPIN.length !== 4}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-red-600 to-rose-500 text-white hover:from-red-500 hover:to-rose-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-black transition-all shadow-md cursor-pointer uppercase tracking-wider"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting to Queue...</span>
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
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-zinc-400 hover:text-zinc-300 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                >
                  Cancel & Go Back
                </button>
              </div>
            </div>
          )}

          {/* P2P Sell Board (Merchants) */}
          {method === 'p2p' && (() => {
            const sellMerchants = merchants.filter(m => !m.type || m.type === 'sell' || m.type === 'both');
            return (
              <div className="space-y-4">
                {sellMerchants.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-zinc-500 text-xs">No active sell merchants found. Admin can configure P2P merchants in System Settings.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sellMerchants.map(merch => (
                      <div
                         key={merch.id}
                         id={`p2p-sell-merchant-${merch.id}`}
                         className="bg-slate-800 border border-slate-700/80 rounded-2xl p-4 hover:border-slate-600 transition-all flex flex-col justify-between gap-4"
                      >
                        <div className="flex justify-between items-start">
                          {/* Rating top-left */}
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                            <Star size={10} className="fill-emerald-400 text-emerald-400" />
                            <span>{merch.rating.toFixed(2)} Rating</span>
                          </div>
                          {/* Merchant Name top-right */}
                          <span className="text-xs font-black text-zinc-300 tracking-tight">{merch.name}</span>
                        </div>

                        <div className="flex justify-between items-end">
                          <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Payout Rate</div>
                            <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                              {(merch.rate - 1.5).toLocaleString()} Shs <span className="text-xs text-zinc-400 font-normal">/ 1 USD</span>
                            </div>
                            <div className="flex gap-1.5 mt-1.5">
                              {merch.providers.map(prov => (
                                <span key={prov} className="text-[9px] px-2 py-0.5 bg-slate-950 border border-slate-800 text-zinc-400 rounded-md font-semibold">
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
                            className="px-5 py-2 bg-gradient-to-r from-red-600 to-rose-500 text-white hover:from-red-500 hover:to-rose-400 rounded-xl text-xs font-bold shadow-md shadow-red-500/5 cursor-pointer"
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
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-400 font-bold">{selectedMerchant.name}</span>
                  <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                    <Star size={12} className="fill-emerald-400" />
                    <span>{selectedMerchant.rating}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  <span>Merchant Payout Rate: </span>
                  <span className="font-mono font-bold text-zinc-200">{(selectedMerchant.rate - 1.5).toFixed(2)} Shs = 1.00 USD</span>
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-zinc-400">Amount (USD to Sell)</label>
                    <span className="text-[10px] text-zinc-500 font-semibold">
                      Available: ${(profile?.balance || 0).toLocaleString()}
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
                      className="w-full pl-8 pr-16 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setP2pUSDAmount((profile?.balance || 0).toString())}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <span className="bg-red-500/15 hover:bg-red-500/25 text-red-400 font-black text-[10px] px-2.5 py-1 rounded-md border border-red-500/30 transition-all cursor-pointer">
                        MAX
                      </span>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 flex justify-between items-center">
                  <span className="text-xs text-zinc-500 font-semibold">Exact Shillings you will receive</span>
                  <span className="text-lg font-black text-red-400 font-mono">
                    {p2pUSDAmount && parseFloat(p2pUSDAmount) > 0 
                      ? (parseFloat(p2pUSDAmount) * (selectedMerchant.rate - 1.5)).toLocaleString(undefined, { maximumFractionDigits: 2 }) 
                      : '0.00'
                    } Shs
                  </span>
                </div>
              </div>

              {/* Proceed to Sell */}
              <button
                id="p2p-sell-proceed"
                disabled={!p2pUSDAmount || parseFloat(p2pUSDAmount) <= 0 || parseFloat(p2pUSDAmount) > (profile?.balance || 0)}
                onClick={() => setMethod('p2p_instructions')}
                className="w-full flex items-center justify-between py-3 px-5 bg-gradient-to-r from-red-600 to-rose-500 text-white hover:from-red-500 hover:to-rose-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-bold transition-all shadow-md mt-6 cursor-pointer"
              >
                <span>Proceed to Sell</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* P2P Awaiting Release Confirmation */}
          {method === 'p2p_instructions' && selectedMerchant && (
            <div className="space-y-5">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider text-center">Payout Details</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                    <span className="text-zinc-500">Merchant Name</span>
                    <span className="font-bold text-zinc-100">{selectedMerchant.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                    <span className="text-zinc-500">Expected Local Shillings</span>
                    <span className="font-mono font-bold text-red-400">
                      {(parseFloat(p2pUSDAmount) * (selectedMerchant.rate - 1.5)).toLocaleString()} Shs
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                    <span className="text-zinc-500">Merchant Payment Number</span>
                    <span className="font-mono font-bold text-zinc-100">{selectedMerchant.paymentNumber}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                    <span className="text-zinc-500">Reference Sell ID</span>
                    <span className="font-mono font-bold text-zinc-400 text-[10px]">{p2pTxId}</span>
                  </div>
                </div>
 
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] rounded-xl leading-relaxed">
                  <strong>P2P Escrow Protection Notice:</strong> The merchant has been pinged. Once you verify that you have successfully received mobile money of <strong>{(parseFloat(p2pUSDAmount) * (selectedMerchant.rate - 1.5)).toLocaleString()} Shs</strong>, click the confirmation button below to proceed to the secure release screen.
                </div>
              </div>
 
              {/* Proceed Button */}
              <div className="space-y-3 pt-2">
                <p className="text-xs text-zinc-400 text-center font-bold flex items-center justify-center gap-1">
                  <HelpCircle size={14} className="text-red-400" />
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
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-black transition-all shadow-md cursor-pointer uppercase tracking-wider"
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
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col items-center justify-center text-center gap-2.5 pb-2 border-b border-slate-700/60">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                    <Lock size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-zinc-100">Release Escrow USD</h3>
                    <p className="text-[11px] text-zinc-500">Authorize final transfer to {selectedMerchant.name}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs pb-1">
                    <span className="text-zinc-500">Releasing Escrow</span>
                    <span className="font-mono font-bold text-zinc-200">${parseFloat(p2pUSDAmount).toLocaleString()} USD</span>
                  </div>
                  <div className="flex justify-between items-center text-xs pb-1">
                    <span className="text-zinc-500">Amount Received</span>
                    <span className="font-mono font-bold text-red-400">
                      {(parseFloat(p2pUSDAmount) * (selectedMerchant.rate - 1.5)).toLocaleString()} Shs
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] rounded-xl leading-relaxed text-center">
                  <strong>Caution:</strong> Releasing escrow is final and cannot be reversed. Only input your PIN if you have verified the funds are in your mobile wallet.
                </div>
              </div>

              {/* Wallet PIN Form */}
              <div className="space-y-4 bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4">
                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-semibold text-zinc-400 block">
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
                    className="w-32 mx-auto px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white block"
                  />
                </div>

                <button
                  id="confirm-release-pin-btn"
                  onClick={handleP2PSellRelease}
                  disabled={submitting || !walletPIN || walletPIN.length !== 4}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-red-600 to-rose-500 text-white hover:from-red-500 hover:to-rose-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-black transition-all shadow-md cursor-pointer animate-pulse"
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
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-zinc-400 hover:text-zinc-300 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
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
