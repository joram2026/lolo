import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { CryptoNetwork, P2PMerchant, Transaction } from '../types';
import { 
  ArrowLeft, Coins, Users, CreditCard, ChevronRight, Copy, Check, 
  Upload, Sparkles, MessageSquare, AlertCircle, RefreshCw, Star 
} from 'lucide-react';
import { CoinIcon } from './StandardUserDashboard';

interface DepositWorkflowProps {
  user: any;
  onBack: () => void;
  onSuccess: () => void;
}

export default function DepositWorkflow({ user, onBack, onSuccess }: DepositWorkflowProps) {
  const [method, setMethod] = useState<'selection' | 'crypto_coin_select' | 'crypto' | 'crypto_confirm' | 'p2p' | 'p2p_calc' | 'p2p_instructions' | 'p2p_confirm'>('selection');

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
  
  // Crypto States
  const [networks, setNetworks] = useState<CryptoNetwork[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<CryptoNetwork | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [amountUSD, setAmountUSD] = useState<string>('');
  const [evidence, setEvidence] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  
  // P2P States
  const [merchants, setMerchants] = useState<P2PMerchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<P2PMerchant | null>(null);
  const [amountShillings, setAmountShillings] = useState<string>('');
  const [calculatedUSD, setCalculatedUSD] = useState<number>(0);
  const [p2pTxId] = useState<string>(() => 'LOLO-P2P-' + Math.floor(1000000 + Math.random() * 9000000));
  const [p2pMessage, setP2pMessage] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch networks & P2P merchants on load
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
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
        console.error('Error fetching deposit configurations:', err);
        setError('Failed to fetch token networks or merchants.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Recalculate USD based on local currency input for P2P BUY
  useEffect(() => {
    if (selectedMerchant && amountShillings) {
      const shillings = parseFloat(amountShillings) || 0;
      setCalculatedUSD(parseFloat((shillings / selectedMerchant.rate).toFixed(2)));
    } else {
      setCalculatedUSD(0);
    }
  }, [amountShillings, selectedMerchant]);

  // Copy target wallet address to clipboard
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Process uploaded image file to base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEvidence(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Crypto Deposit
  const handleCryptoSubmit = async () => {
    if (!amountUSD || parseFloat(amountUSD) <= 0) {
      setError('Please input a valid deposit amount.');
      return;
    }
    if (!evidence) {
      setError('Please upload an image as evidence of payment.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const txId = 'LOLO-CRYPTO-' + Math.floor(1000000 + Math.random() * 9000000);
      const usdVal = parseFloat(amountUSD);
      
      const newTx: Omit<Transaction, 'id'> = {
        userId: user.uid,
        userEmail: user.email,
        type: 'deposit_crypto',
        amount: usdVal,
        status: 'PENDING APPROVAL',
        createdAt: serverTimestamp(),
        evidence: evidence,
        network: selectedNetwork,
        address: selectedCoin?.addresses[selectedNetwork] || '',
        merchantName: selectedCoin ? formatCoinName(selectedCoin.tokenName) : ''
      };

      await addDoc(collection(db, 'transactions'), newTx);
      onSuccess();
    } catch (err: any) {
      console.error('Crypto deposit error:', err);
      setError(err.message || 'Failed to submit crypto deposit.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit P2P Deposit
  const handleP2PSubmit = async () => {
    if (!p2pMessage.trim()) {
      setError('Please paste your receipt or mobile money message text.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const newTx: Omit<Transaction, 'id'> = {
        userId: user.uid,
        userEmail: user.email,
        type: 'deposit_p2p',
        amount: calculatedUSD,
        localAmount: parseFloat(amountShillings),
        status: 'PENDING APPROVAL',
        createdAt: serverTimestamp(),
        paymentMessage: p2pMessage,
        merchantName: selectedMerchant?.name || '',
        address: selectedMerchant?.paymentNumber || ''
      };

      await addDoc(collection(db, 'transactions'), newTx);
      onSuccess();
    } catch (err: any) {
      console.error('P2P deposit error:', err);
      setError(err.message || 'Failed to submit P2P deposit.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="deposit-workflow-container" className="max-w-md mx-auto p-4 sm:p-5 bg-slate-900 text-zinc-100 min-h-[calc(100vh-140px)]">
      {/* Dynamic Header */}
      <div className="flex items-center gap-3 mb-6">
        <button 
          id="deposit-back-btn"
          onClick={() => {
            if (method === 'selection') onBack();
            else if (method === 'crypto_coin_select') setMethod('selection');
            else if (method === 'crypto') setMethod('crypto_coin_select');
            else if (method === 'crypto_confirm') setMethod('crypto');
            else if (method === 'p2p') setMethod('selection');
            else if (method === 'p2p_calc') setMethod('p2p');
            else if (method === 'p2p_instructions') setMethod('p2p_calc');
            else if (method === 'p2p_confirm') setMethod('p2p_instructions');
          }}
          className="p-2 rounded-full bg-slate-850 border border-slate-700 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-lg font-black tracking-tight">
            {method === 'selection' && 'Add Funds'}
            {method === 'crypto_coin_select' && 'Select Coin'}
            {method === 'crypto' && 'Crypto Deposit Details'}
            {method === 'crypto_confirm' && 'Upload Deposit Proof'}
            {method === 'p2p' && 'P2P Merchant Board'}
            {method === 'p2p_calc' && 'Conversion Calculator'}
            {method === 'p2p_instructions' && 'Complete Merchant Payment'}
            {method === 'p2p_confirm' && 'Paste Receipt Verification'}
          </h2>
          <p className="text-xs text-zinc-500">
            {method === 'selection' && 'Select deposit network'}
            {method === 'crypto_coin_select' && 'Choose a crypto asset to deposit'}
            {method === 'crypto' && `Configure network and transfer details for ${selectedCoin ? formatCoinName(selectedCoin.tokenName) : ''}`}
            {method === 'crypto_confirm' && 'Provide screenshot evidence of asset transfer'}
            {method === 'p2p' && 'Buy USD from active verified agents'}
            {method === 'p2p_calc' && `Calculate conversion rates for ${selectedMerchant?.name}`}
            {method === 'p2p_instructions' && 'Transfer funds to merchant payment details'}
            {method === 'p2p_confirm' && 'Paste raw SMS/receipt for instant escrow check'}
          </p>
        </div>
      </div>

      {error && (
        <div id="deposit-error-banner" className="p-3 mb-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-start gap-2.5">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[250px] gap-3">
          <RefreshCw size={24} className="text-emerald-500 animate-spin" />
          <span className="text-xs text-zinc-500 font-medium">Fetching active integrations...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Method Selection Page */}
          {method === 'selection' && (
            <div className="space-y-4">
              <button
                id="deposit-method-crypto"
                onClick={() => setMethod('crypto_coin_select')}
                className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-750 border border-slate-700/80 rounded-2xl transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <Coins size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-100">Crypto Stablecoin Deposit</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Deposit USDT or USDC on Tron, Ethereum, or Solana</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-500" />
              </button>

              <button
                id="deposit-method-p2p"
                onClick={() => setMethod('p2p')}
                className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-750 border border-slate-700/80 rounded-2xl transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-100">P2P Escrow Deposit (Mobile Money)</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Pay local currency (KES/UGX) to buy USD instantly</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-500" />
              </button>
            </div>
          )}

          {/* Crypto Coin Select Page */}
          {method === 'crypto_coin_select' && (
            <div className="space-y-3">
              {networks.map(net => {
                const formattedName = formatCoinName(net.tokenName);
                return (
                  <button
                    key={net.id}
                    id={`crypto-select-asset-${net.id}`}
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
                        <h4 className="font-bold text-sm text-zinc-100 group-hover:text-emerald-400 transition-colors">
                          {formattedName}
                        </h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Networks: {net.networks.join(', ')}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Crypto Deposit Method */}
          {method === 'crypto' && selectedCoin && (
            <div className="space-y-5">
              {/* Selected Coin Banner */}
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4 flex items-center gap-3.5">
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
                      id={`crypto-network-btn-${net}`}
                      type="button"
                      onClick={() => setSelectedNetwork(net)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all text-center ${
                        selectedNetwork === net
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-zinc-400">Amount (USD)</label>
                  <span className="text-[10px] text-zinc-500 font-semibold">Max: $10,000.00</span>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500 font-bold text-sm">$</span>
                  <input
                    id="crypto-deposit-amount"
                    type="number"
                    required
                    placeholder="100.00"
                    value={amountUSD}
                    onChange={(e) => setAmountUSD(e.target.value)}
                    className="w-full pl-8 pr-16 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setAmountUSD('10000')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <span className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-black text-[10px] px-2.5 py-1 rounded-md border border-emerald-500/30 transition-all cursor-pointer">
                      MAX
                    </span>
                  </button>
                </div>
              </div>

              {/* Wallet Address Display Card */}
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Receiver Address ({selectedNetwork})</span>
                  <button
                    id="crypto-copy-address"
                    onClick={() => handleCopy(selectedCoin.addresses[selectedNetwork] || '')}
                    className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-850 text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-[10px]"
                  >
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl font-mono text-[11px] text-emerald-400 break-all select-all font-semibold leading-relaxed">
                  {selectedCoin.addresses[selectedNetwork] || 'No Address configured'}
                </div>
                <p className="text-[10px] text-zinc-500 text-center">Transfer strictly using the {selectedNetwork} network to avoid assets loss.</p>
              </div>

              {/* Proceed Action */}
              <button
                id="crypto-deposit-proceed"
                onClick={() => {
                  setError(null);
                  const usdVal = parseFloat(amountUSD);
                  if (!amountUSD || isNaN(usdVal) || usdVal <= 0) {
                    setError('Please enter a valid deposit amount.');
                    return;
                  }
                  setMethod('crypto_confirm');
                }}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-bold transition-all shadow-md mt-6 cursor-pointer uppercase tracking-wider"
              >
                <span>Proceed to Evidence Upload</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Crypto Confirm & Upload Proof Page */}
          {method === 'crypto_confirm' && selectedCoin && (
            <div className="space-y-5">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-4">
                <div className="flex flex-col items-center justify-center text-center gap-2 pb-2 border-b border-slate-700/60">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Coins size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-zinc-100">Upload Deposit Proof</h3>
                    <p className="text-[11px] text-zinc-500">Provide evidence of stablecoin transfer</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-700/30">
                    <span className="text-zinc-500">Selected Asset</span>
                    <span className="font-bold text-zinc-200">{formatCoinName(selectedCoin.tokenName)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-700/30">
                    <span className="text-zinc-500">Selected Network</span>
                    <span className="font-mono font-bold text-emerald-400">{selectedNetwork}</span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-slate-700/30">
                    <span className="text-zinc-500">Recipient Address</span>
                    <span className="font-mono font-bold text-zinc-300 break-all max-w-[200px] text-right">{selectedCoin.addresses[selectedNetwork]}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Amount Sent</span>
                    <span className="font-mono font-bold text-emerald-400">${parseFloat(amountUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</span>
                  </div>
                </div>
              </div>

              {/* Evidence Upload */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 block">
                  Evidence of Payment (Upload Screenshot)
                </label>
                <div className="relative border border-dashed border-slate-700 bg-slate-800/40 rounded-2xl p-5 hover:bg-slate-800/80 transition-all text-center flex flex-col items-center justify-center cursor-pointer">
                  <input
                    id="crypto-evidence-upload-final"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {evidence ? (
                    <div className="space-y-2">
                      <img src={evidence} alt="Proof of payment" className="max-h-24 mx-auto rounded-lg border border-slate-700" />
                      <p className="text-[11px] text-emerald-400 font-semibold">Image loaded successfully! Tap to change.</p>
                    </div>
                  ) : (
                    <>
                      <Upload size={24} className="text-zinc-500 mb-2" />
                      <p className="text-xs font-bold text-zinc-300">Drag & Drop or Click to Upload</p>
                      <p className="text-[10px] text-zinc-500 mt-1">Accepts PNG, JPG, JPEG (will be converted to secure proof)</p>
                    </>
                  )}
                </div>
              </div>

              {/* Submit Action */}
              <button
                id="crypto-deposit-submit-final"
                onClick={handleCryptoSubmit}
                disabled={submitting || !evidence}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-black transition-all shadow-md cursor-pointer uppercase tracking-wider"
              >
                {submitting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin text-white" />
                    <span>Submitting to Admin Queue...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    <span>CONFIRM & SUBMIT DEPOSIT</span>
                  </>
                )}
              </button>

              <button
                id="cancel-crypto-confirm-btn"
                onClick={() => {
                  setError(null);
                  setMethod('crypto');
                }}
                className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-zinc-400 hover:text-zinc-300 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
              >
                Cancel & Go Back
              </button>
            </div>
          )}

          {/* P2P Deposit Method (Merchants) */}
          {method === 'p2p' && (() => {
            const buyMerchants = merchants.filter(m => !m.type || m.type === 'buy' || m.type === 'both');
            return (
              <div className="space-y-4">
                {buyMerchants.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-zinc-500 text-xs">No active buy merchants found. Admin can configure P2P merchants in System Settings.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {buyMerchants.map(merch => (
                      <div
                        key={merch.id}
                        id={`p2p-merchant-${merch.id}`}
                        className="bg-slate-800 border border-slate-700/80 rounded-2xl p-4 hover:border-slate-700 transition-all flex flex-col justify-between gap-4"
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
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Conversion Rate</div>
                            <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                              {merch.rate.toLocaleString()} Shs <span className="text-xs text-zinc-400 font-normal">/ 1 USD</span>
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
                            id={`p2p-buy-btn-${merch.id}`}
                            onClick={() => {
                              setSelectedMerchant(merch);
                              setMethod('p2p_calc');
                            }}
                            className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 cursor-pointer"
                          >
                            BUY
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* P2P BUY Calculator */}
          {method === 'p2p_calc' && selectedMerchant && (
            <div className="space-y-5">
              {/* Merchant Details Card */}
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-400 font-bold">{selectedMerchant.name}</span>
                  <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                    <Star size={12} className="fill-emerald-400 text-emerald-400" />
                    <span>{selectedMerchant.rating}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  <span>Merchant Rate: </span>
                  <span className="font-mono font-bold text-zinc-200">{selectedMerchant.rate} Shs = 1.00 USD</span>
                </div>
              </div>

              {/* Calculator input */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-zinc-400">Amount (Local Currency - Shillings)</label>
                    <span className="text-[10px] text-zinc-500 font-semibold">Max Limit: 1,000,000 Shs</span>
                  </div>
                  <div className="relative">
                    <input
                      id="p2p-input-shillings"
                      type="number"
                      required
                      placeholder="e.g. 50000"
                      value={amountShillings}
                      onChange={(e) => setAmountShillings(e.target.value)}
                      className="w-full pl-4 pr-16 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setAmountShillings('1000000')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <span className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-black text-[10px] px-2.5 py-1 rounded-md border border-emerald-500/30 transition-all cursor-pointer">
                        MAX
                      </span>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 flex justify-between items-center">
                  <span className="text-xs text-zinc-500 font-semibold">Live-calculated USD Equivalent</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    $ {calculatedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Proceed to Pay */}
              <button
                id="p2p-proceed-to-pay"
                disabled={calculatedUSD <= 0}
                onClick={() => setMethod('p2p_instructions')}
                className="w-full flex items-center justify-between py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-bold transition-all shadow-md mt-6 cursor-pointer"
              >
                <span>Proceed to Pay</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* P2P Instructions Screen */}
          {method === 'p2p_instructions' && selectedMerchant && (
            <div className="space-y-5">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider text-center">Payment Escrow Instructions</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                    <span className="text-zinc-500">Pay Merchant Name</span>
                    <span className="font-bold text-zinc-100">{selectedMerchant.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                    <span className="text-zinc-500">Merchant Payment Phone</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-emerald-400">{selectedMerchant.paymentNumber}</span>
                      <button 
                        id="copy-merchant-phone"
                        onClick={() => handleCopy(selectedMerchant.paymentNumber)}
                        className="text-zinc-500 hover:text-white p-0.5"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                    <span className="text-zinc-500">Exact Shillings to Transfer</span>
                    <span className="font-mono font-bold text-zinc-100">{parseFloat(amountShillings).toLocaleString()} Shs</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                    <span className="text-zinc-500">Transaction ID (LOLO Ref)</span>
                    <span className="font-mono font-bold text-zinc-400 text-[10px]">{p2pTxId}</span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-xl leading-relaxed">
                  <strong>Notice:</strong> Please send the exact amount of local money. Include the reference <strong>{p2pTxId}</strong> in the payment description if your mobile wallet supports it.
                </div>
              </div>

              {/* Proceed Action */}
              <button
                id="p2p-instructions-proceed"
                onClick={() => {
                  setError(null);
                  setMethod('p2p_confirm');
                }}
                className="w-full flex items-center justify-between py-3.5 px-5 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 rounded-xl text-sm font-bold transition-all shadow-md mt-4 cursor-pointer"
              >
                <span>Proceed to Receipt paste</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* P2P Paste Receipt / Confirm Page */}
          {method === 'p2p_confirm' && selectedMerchant && (
            <div className="space-y-5">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-4">
                <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                  <span className="text-zinc-500">Merchant</span>
                  <span className="font-bold text-zinc-100">{selectedMerchant.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-slate-700/60 pb-2">
                  <span className="text-zinc-500">Exact Amount Paid</span>
                  <span className="font-mono font-bold text-emerald-400">{parseFloat(amountShillings).toLocaleString()} Shs</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Required Reference</span>
                  <span className="font-mono font-bold text-zinc-300">{p2pTxId}</span>
                </div>
              </div>

              {/* Paste Confirmation Text */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-emerald-400" />
                  Paste payment receipt / Mobile Money SMS text
                </label>
                <textarea
                  id="p2p-receipt-message-final"
                  required
                  rows={4}
                  placeholder="Paste the raw M-Pesa / MTN message or reference SMS here as verification."
                  value={p2pMessage}
                  onChange={(e) => setP2pMessage(e.target.value)}
                  className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-white font-mono placeholder-zinc-600 leading-normal"
                />
              </div>

              {/* Submit deposit button */}
              <button
                id="p2p-deposit-submit-final"
                onClick={handleP2PSubmit}
                disabled={submitting || !p2pMessage.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 disabled:bg-slate-800 disabled:text-zinc-500 rounded-xl text-sm font-black transition-all shadow-md mt-4 cursor-pointer uppercase tracking-wider"
              >
                {submitting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin text-white" />
                    <span>Submitting P2P request...</span>
                  </>
                ) : (
                  <span>CONFIRM & SUBMIT DEPOSIT</span>
                )}
              </button>

              <button
                id="cancel-p2p-confirm-btn"
                onClick={() => {
                  setError(null);
                  setMethod('p2p_instructions');
                }}
                className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-zinc-400 hover:text-zinc-300 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
              >
                Cancel & Go Back
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
