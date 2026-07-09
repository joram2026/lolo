import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, updateDoc, addDoc } from 'firebase/firestore';
import { UserAccount, Transaction, CryptoPrice } from '../types';
import NewsCarousel from './NewsCarousel';
import ActivityLog from './ActivityLog';
import { 
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft, Search, 
  User, LogOut, ArrowRightLeft, ShieldCheck, Activity, Wallet, 
  HelpCircle, RefreshCw, Coins, ArrowRight, MessageSquare, AlertCircle,
  History, ArrowLeft, X
} from 'lucide-react';

interface StandardUserDashboardProps {
  user: any;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
}

const STATIC_CRYPTO: CryptoPrice[] = [
  { name: 'Tether', symbol: 'USDT', price: 1.00, change24h: 0.01 },
  { name: 'USD Coin', symbol: 'USDC', price: 1.00, change24h: -0.02 },
  { name: 'Bitcoin', symbol: 'BTC', price: 94250.30, change24h: 3.45 },
  { name: 'Ethereum', symbol: 'ETH', price: 3480.12, change24h: 1.82 },
  { name: 'Solana', symbol: 'SOL', price: 184.45, change24h: -2.15 },
  { name: 'Binance Coin', symbol: 'BNB', price: 592.20, change24h: 0.95 },
  { name: 'XRP', symbol: 'XRP', price: 2.54, change24h: 4.12 },
  { name: 'World Coin', symbol: 'WLD', price: 2.80, change24h: -1.25 },
  { name: 'Tron', symbol: 'TRX', price: 0.22, change24h: 0.45 },
  { name: 'DOGE Coin', symbol: 'DOGE', price: 0.38, change24h: 2.15 }
];

export const getCoinLogoUrl = (symbol: string): string => {
  const sym = symbol.toUpperCase();
  const mapping: Record<string, string> = {
    BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    USDT: 'https://assets.coingecko.com/coins/images/325/large/tether.png',
    USDC: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
    SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    BNB: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
    XRP: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
    WLD: 'https://assets.coingecko.com/coins/images/31075/large/worldcoin.jpeg',
    TRX: 'https://assets.coingecko.com/coins/images/1094/large/tron.png',
    DOGE: 'https://assets.coingecko.com/coins/images/75/large/dogecoin.png'
  };
  return mapping[sym] || `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${sym.toLowerCase()}.png`;
};

interface CoinIconProps {
  symbol: string;
  className?: string;
}

export function CoinIcon({ symbol, className = "w-9 h-9" }: CoinIconProps) {
  const [failed, setFailed] = useState(false);
  const logoUrl = getCoinLogoUrl(symbol);

  if (failed || !logoUrl) {
    return (
      <div className={`${className} rounded-xl bg-slate-950 flex items-center justify-center text-[10px] font-black text-emerald-400 border border-slate-850 uppercase font-mono shrink-0`}>
        {symbol.slice(0, 3)}
      </div>
    );
  }

  return (
    <div className={`${className} rounded-xl overflow-hidden bg-slate-950 border border-slate-850 flex items-center justify-center shrink-0`}>
      <img
        src={logoUrl}
        alt={symbol}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

const generateChartPoints = (coinPrice: number, change: number, timeframe: string) => {
  const points = [];
  const isUp = change >= 0;
  const startFactor = isUp ? (1 - change / 100) : (1 + Math.abs(change) / 100);
  const startPrice = coinPrice * startFactor;
  
  let variance = 0.015;
  if (timeframe === '1H') variance = 0.003;
  if (timeframe === '1W') variance = 0.045;
  if (timeframe === '1M') variance = 0.12;

  for (let i = 0; i < 12; i++) {
    const progress = i / 11;
    const wave = Math.sin(progress * Math.PI * 1.8) * variance * startPrice * 0.4;
    const randomNoise = (Math.random() - 0.5) * variance * startPrice * 0.15;
    const priceAtPoint = (startPrice + (coinPrice - startPrice) * progress) + wave + randomNoise;
    points.push(Math.max(0.0001, priceAtPoint));
  }
  return points;
};

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

const generateCandleData = (coinPrice: number, change: number, timeframe: string): Candle[] => {
  const count = 16;
  const candles: Candle[] = [];
  
  const isUp = change >= 0;
  const startFactor = isUp ? (1 - change / 100) : (1 + Math.abs(change) / 100);
  const startPrice = coinPrice * startFactor;
  
  let variance = 0.015;
  if (timeframe === '1H') variance = 0.003;
  if (timeframe === '1W') variance = 0.045;
  if (timeframe === '1M') variance = 0.12;

  let currentPrice = startPrice;
  
  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    const wave = Math.sin(progress * Math.PI * 1.5) * variance * startPrice * 0.3;
    const target = (startPrice + (coinPrice - startPrice) * progress) + wave;
    
    const open = currentPrice;
    let close = target + (Math.random() - 0.5) * variance * startPrice * 0.15;
    if (i === count - 1) {
      close = coinPrice;
    }
    
    const safeOpen = Math.max(0.0001, open);
    const safeClose = Math.max(0.0001, close);
    
    const bodyMax = Math.max(safeOpen, safeClose);
    const bodyMin = Math.min(safeOpen, safeClose);
    
    const high = bodyMax + Math.random() * variance * startPrice * 0.2;
    const low = Math.max(0.0001, bodyMin - Math.random() * variance * startPrice * 0.2);
    
    candles.push({
      open: parseFloat(safeOpen.toFixed(4)),
      high: parseFloat(high.toFixed(4)),
      low: parseFloat(low.toFixed(4)),
      close: parseFloat(safeClose.toFixed(4))
    });
    
    currentPrice = safeClose;
  }
  
  return candles;
};

export default function StandardUserDashboard({ 
  user, 
  onLogout, 
  onOpenProfile, 
  onOpenDeposit, 
  onOpenWithdraw 
}: StandardUserDashboardProps) {
  
  // Real-time state
  const [profile, setProfile] = useState<UserAccount | null>(null);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  
  // Live fluctuating crypto prices state
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrice[]>(STATIC_CRYPTO);
  
  // Selected coin for high-fidelity interactive modal/chart details
  const [selectedCoin, setSelectedCoin] = useState<CryptoPrice | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<'1H' | '24H' | '1W' | '1M'>('24H');
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [quickTradeType, setQuickTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [quickTradeAmount, setQuickTradeAmount] = useState<string>('');
  const [tradeMessage, setTradeMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);

  // Bottom Sticky Nav Tab
  const [activeTab, setActiveTab] = useState<'home' | 'wallet' | 'trade' | 'history'>('home');
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Quick Trade state (simulation in trade tab)
  const [tradeFrom, setTradeFrom] = useState('BTC');
  const [tradeTo, setTradeTo] = useState('USDT');
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeResult, setTradeResult] = useState<number | null>(null);

  // Real-time listener for Firestore profile, transactions & crypto prices
  useEffect(() => {
    const userRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        setProfile(snapshot.data() as UserAccount);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error listening to user doc:", err);
      setLoading(false);
    });

    const txCol = collection(db, 'transactions');
    const q = query(txCol, where('userId', '==', user.uid));
    const unsubscribeTx = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      txs.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      setUserTransactions(txs);
    });

    const pricesCol = collection(db, 'crypto_prices');
    const unsubscribePrices = onSnapshot(pricesCol, (snapshot) => {
      if (!snapshot.empty) {
        const fetched = snapshot.docs.map(doc => doc.data() as CryptoPrice);
        const order = ['USDT', 'USDC', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'WLD', 'TRX', 'DOGE'];
        // Sort according to standard order
        fetched.sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));
        setCryptoPrices(fetched);
      }
    }, (err) => {
      console.error("Error listening to crypto prices:", err);
    });

    return () => {
      unsubscribeUser();
      unsubscribeTx();
      unsubscribePrices();
    };
  }, [user.uid]);

  // Fluctuate prices live every 4 seconds to make the app feel real
  useEffect(() => {
    const interval = setInterval(() => {
      setCryptoPrices(prev => prev.map(coin => {
        if (coin.symbol === 'USDT' || coin.symbol === 'USDC') {
          // Keep stablecoins close to 1.00
          const change = (Math.random() - 0.5) * 0.0004;
          const newPrice = Math.max(0.999, Math.min(1.001, coin.price + change));
          return {
            ...coin,
            price: parseFloat(newPrice.toFixed(4)),
            change24h: parseFloat((change * 100).toFixed(2))
          };
        } else {
          // More active, high-fidelity fluctuations for main coins (BTC, ETH, SOL, BNB)
          const percentageChange = (Math.random() - 0.485) * 0.0035; 
          const newPrice = coin.price * (1 + percentageChange);
          const newChange24h = coin.change24h + percentageChange * 100;
          return {
            ...coin,
            price: parseFloat(newPrice.toFixed(2)),
            change24h: parseFloat(Math.max(-15, Math.min(15, newChange24h)).toFixed(2))
          };
        }
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Handle live conversion calculation inside the Trade simulation tab using dynamic cryptoPrices
  useEffect(() => {
    if (tradeAmount) {
      const amt = parseFloat(tradeAmount) || 0;
      const fromCoin = cryptoPrices.find(c => c.symbol === tradeFrom);
      const toCoin = cryptoPrices.find(c => c.symbol === tradeTo);
      if (fromCoin && toCoin) {
        const valueInUSD = amt * fromCoin.price;
        const finalValue = valueInUSD / toCoin.price;
        setTradeResult(parseFloat(finalValue.toFixed(5)));
      }
    } else {
      setTradeResult(null);
    }
  }, [tradeAmount, tradeFrom, tradeTo, cryptoPrices]);

  // Filter dynamic crypto prices based on search bar text
  const filteredCrypto = cryptoPrices.filter(coin => {
    const queryStr = searchQuery.trim().toLowerCase();
    return (
      coin.name.toLowerCase().includes(queryStr) || 
      coin.symbol.toLowerCase().includes(queryStr)
    );
  });

  const getTxTypeBadge = (type: string) => {
    switch (type) {
      case 'deposit_crypto': return 'Crypto Deposit';
      case 'deposit_p2p': return 'P2P Purchase';
      case 'withdraw_crypto': return 'Crypto Out';
      case 'withdraw_p2p': return 'P2P Cashout';
      case 'buy_crypto': return 'Buy Crypto';
      case 'sell_crypto': return 'Sell Crypto';
      case 'swap_crypto': return 'Swap / Convert';
      default: return type;
    }
  };

  const totalBalance = profile?.balance || 0;

  // Real-time helper for standard user's asset holdings
  const getCoinHolding = (symbol: string): number => {
    if (symbol === 'USDT') {
      return profile?.balance || 0;
    }
    if (profile?.holdings && profile.holdings[symbol] !== undefined) {
      return profile.holdings[symbol];
    }
    return 0;
  };

  const ASSET_ALLOCATION_DEFS = [
    { symbol: 'USDT', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    { symbol: 'BTC', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    { symbol: 'ETH', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    { symbol: 'SOL', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    { symbol: 'BNB', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    { symbol: 'USDC', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
    { symbol: 'XRP', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    { symbol: 'WLD', color: 'bg-zinc-500/10 text-zinc-300 border-zinc-700/20' },
    { symbol: 'TRX', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
    { symbol: 'DOGE', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' }
  ];

  // Calculate dynamic userAssets based on getCoinHolding and live price updates
  const userAssets = ASSET_ALLOCATION_DEFS.map(def => {
    const coinInfo = cryptoPrices.find(c => c.symbol === def.symbol);
    const price = coinInfo?.price || 1.00;
    const coinAmount = getCoinHolding(def.symbol);
    const usdValue = coinAmount * price; // Amount * Live Price = USDT equivalent!
    return {
      symbol: def.symbol,
      name: coinInfo?.name || def.symbol,
      colorClass: def.color,
      usdValue,
      coinAmount,
      price
    };
  });

  const totalPortfolioValue = userAssets.reduce((sum, asset) => sum + asset.usdValue, 0);

  // Dynamic buy/sell real transaction execution
  const handleBuySellCrypto = async (symbol: string, type: 'BUY' | 'SELL', amountInput: string) => {
    setTradeMessage(null);
    const amount = parseFloat(amountInput);
    if (!amount || amount <= 0) {
      setTradeMessage({ text: 'Please enter a valid amount greater than 0.', isError: true });
      return;
    }

    const coin = cryptoPrices.find(c => c.symbol === symbol);
    if (!coin) {
      setTradeMessage({ text: 'Invalid token selected.', isError: true });
      return;
    }

    const price = coin.price;
    const cashBalance = profile?.balance || 0;
    const coinHolding = getCoinHolding(symbol);
    setTradeLoading(true);

    if (type === 'BUY') {
      const totalCost = amount * price;
      if (cashBalance < totalCost) {
        setTradeMessage({ 
          text: `Insufficient USD balance. Buying ${amount} ${symbol} requires $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} but you only have $${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`, 
          isError: true 
        });
        setTradeLoading(false);
        return;
      }

      const newCashBalance = cashBalance - totalCost;
      const currentHoldings = profile?.holdings || {};
      const newHoldings = {
        ...currentHoldings,
        [symbol]: (currentHoldings[symbol] || 0) + amount
      };

      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          balance: parseFloat(newCashBalance.toFixed(2)),
          holdings: newHoldings
        });

        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          userEmail: user.email,
          type: 'buy_crypto',
          amount: totalCost,
          status: 'APPROVED',
          createdAt: new Date(),
          paymentMessage: `Crypto Exchange: Purchased ${amount} ${symbol} at $${price.toLocaleString()}`
        });

        setTradeMessage({ 
          text: `Successfully bought ${amount} ${symbol} for $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}!`, 
          isError: false 
        });
        setQuickTradeAmount('');
      } catch (err: any) {
        console.error("Trade error:", err);
        setTradeMessage({ text: `Failed to complete transaction: ${err.message}`, isError: true });
      } finally {
        setTradeLoading(false);
      }
    } else {
      if (coinHolding < amount) {
        setTradeMessage({ 
          text: `Insufficient ${symbol} balance. You hold ${coinHolding} ${symbol} but tried to sell ${amount} ${symbol}.`, 
          isError: true 
        });
        setTradeLoading(false);
        return;
      }

      const totalEarnings = amount * price;
      const newCashBalance = cashBalance + totalEarnings;
      const currentHoldings = profile?.holdings || {};
      const newHoldings = {
        ...currentHoldings,
        [symbol]: Math.max(0, (currentHoldings[symbol] || 0) - amount)
      };

      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          balance: parseFloat(newCashBalance.toFixed(2)),
          holdings: newHoldings
        });

        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          userEmail: user.email,
          type: 'sell_crypto',
          amount: totalEarnings,
          status: 'APPROVED',
          createdAt: new Date(),
          paymentMessage: `Crypto Exchange: Sold ${amount} ${symbol} at $${price.toLocaleString()}`
        });

        setTradeMessage({ 
          text: `Successfully sold ${amount} ${symbol} for $${totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}!`, 
          isError: false 
        });
        setQuickTradeAmount('');
      } catch (err: any) {
        console.error("Trade error:", err);
        setTradeMessage({ text: `Failed to complete transaction: ${err.message}`, isError: true });
      } finally {
        setTradeLoading(false);
      }
    }
  };

  const [swapLoading, setSwapLoading] = useState(false);
  const [swapMessage, setSwapMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleSwapConvert = async () => {
    setSwapMessage(null);
    const amt = parseFloat(tradeAmount);
    if (!amt || amt <= 0) {
      setSwapMessage({ text: 'Please enter a valid amount to convert.', isError: true });
      return;
    }
    if (tradeResult === null || tradeResult <= 0) {
      setSwapMessage({ text: 'Conversion result is invalid.', isError: true });
      return;
    }
    if (tradeFrom === tradeTo) {
      setSwapMessage({ text: 'Cannot exchange a token with itself.', isError: true });
      return;
    }

    setSwapLoading(true);

    const fromCoin = cryptoPrices.find(c => c.symbol === tradeFrom);
    const toCoin = cryptoPrices.find(c => c.symbol === tradeTo);

    const fromHolding = getCoinHolding(tradeFrom);

    if (fromHolding < amt) {
      setSwapMessage({
        text: `Insufficient ${tradeFrom} balance. You hold ${fromHolding} ${tradeFrom} but tried to swap ${amt} ${tradeFrom}.`,
        isError: true
      });
      setSwapLoading(false);
      return;
    }

    const currentHoldings = profile?.holdings || {};
    const newHoldings = { ...currentHoldings };
    let newBalance = profile?.balance || 0;

    // Deduct from source
    if (tradeFrom === 'USDT') {
      newBalance = Math.max(0, newBalance - amt);
    } else {
      newHoldings[tradeFrom] = Math.max(0, (currentHoldings[tradeFrom] || 0) - amt);
    }

    // Add to target
    if (tradeTo === 'USDT') {
      newBalance = newBalance + tradeResult;
    } else {
      newHoldings[tradeTo] = (currentHoldings[tradeTo] || 0) + tradeResult;
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        balance: parseFloat(newBalance.toFixed(2)),
        holdings: newHoldings
      });

      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        userEmail: user.email,
        type: 'swap_crypto', 
        amount: amt * (fromCoin?.price || 1), 
        status: 'APPROVED',
        createdAt: new Date(),
        paymentMessage: `Crypto Exchange Swap: Exchanged ${amt} ${tradeFrom} to ${tradeResult} ${tradeTo}`
      });

      setSwapMessage({
        text: `Successfully swapped ${amt} ${tradeFrom} for ${tradeResult} ${tradeTo}!`,
        isError: false
      });
      setTradeAmount('');
    } catch (err: any) {
      console.error("Swap error:", err);
      setSwapMessage({ text: `Failed to execute swap: ${err.message}`, isError: true });
    } finally {
      setSwapLoading(false);
    }
  };

  if (selectedCoin) {
    const liveCoin = cryptoPrices.find(c => c.symbol === selectedCoin.symbol) || selectedCoin;
    const candles = generateCandleData(liveCoin.price, liveCoin.change24h, chartTimeframe);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const range = max - min || 1;
    
    const getY = (val: number) => {
      return 180 - ((val - min) / range) * 125 - 25; // padding top 25, bottom 25
    };

    const displayedCandle = hoveredCandle || candles[candles.length - 1];
    const holding = getCoinHolding(liveCoin.symbol);
    const usdVal = holding * liveCoin.price;

    return (
      <div id="coin-detail-page-root" className="min-h-screen bg-slate-900 text-zinc-100 font-sans pb-16 animate-fade-in">
        {/* Top Header */}
        <header className="px-4 py-4 border-b border-slate-800 sticky top-0 bg-slate-900/85 backdrop-blur-md z-20 flex items-center gap-3">
          <button 
            id="coin-detail-back-btn"
            onClick={() => {
              setSelectedCoin(null);
              setHoveredCandle(null);
            }}
            className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-lg font-black tracking-tight flex items-center gap-1.5">
              <span>{liveCoin.name}</span>
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1.5 py-0.5 bg-slate-950 rounded">
                {liveCoin.symbol}
              </span>
            </h2>
            <p className="text-[10px] text-zinc-500 font-bold select-none">CRYPTO ASSET DETAILS</p>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 mt-5 space-y-6">
          {/* Price Display */}
          <div className="flex justify-between items-baseline select-none">
            <div>
              <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider">Live Price</span>
              <h3 className="text-3xl font-black text-zinc-100 font-mono tracking-tight mt-0.5">
                ${liveCoin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </h3>
            </div>
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold ${
              liveCoin.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {liveCoin.change24h >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              <span>{liveCoin.change24h >= 0 ? '+' : ''}{liveCoin.change24h.toFixed(2)}%</span>
            </div>
          </div>

          {/* Candlestick OHLC Stat Header */}
          <div className="flex gap-2 text-[9px] font-mono font-bold text-zinc-400 justify-between items-center bg-slate-950 p-2.5 border border-slate-850 rounded-xl select-none">
            <span className="text-[10px] text-zinc-500 font-extrabold tracking-tight">
              {hoveredCandle ? "HOVERED CANDLE:" : "LATEST DATA:"}
            </span>
            <div className="flex gap-2 font-black">
              <span>O: <span className={displayedCandle.close >= displayedCandle.open ? "text-emerald-400" : "text-red-400"}>${displayedCandle.open.toLocaleString()}</span></span>
              <span>H: <span className="text-zinc-200">${displayedCandle.high.toLocaleString()}</span></span>
              <span>L: <span className="text-zinc-200">${displayedCandle.low.toLocaleString()}</span></span>
              <span>C: <span className={displayedCandle.close >= displayedCandle.open ? "text-emerald-400" : "text-red-400"}>${displayedCandle.close.toLocaleString()}</span></span>
            </div>
          </div>

          {/* Vector Candlestick Chart */}
          <div className="bg-slate-950 p-4 border border-slate-850 rounded-2xl space-y-3.5 relative overflow-hidden">
            <div className="flex justify-between items-center select-none">
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Candlestick Trend</span>
              
              {/* Timeframe selector tabs */}
              <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                {(['1H', '24H', '1W', '1M'] as const).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setChartTimeframe(tf)}
                    className={`px-2 py-0.5 text-[9px] font-extrabold rounded-md transition-all ${
                      chartTimeframe === tf 
                        ? 'bg-slate-850 text-emerald-400 shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Chart area */}
            <div className="w-full h-[180px] relative">
              <svg viewBox="0 0 350 180" className="w-full h-full overflow-visible">
                {/* Grid lines */}
                <line x1="0" y1="25" x2="350" y2="25" stroke="#1e293b" strokeOpacity="0.45" strokeDasharray="3 3" />
                <line x1="0" y1="90" x2="350" y2="90" stroke="#1e293b" strokeOpacity="0.45" strokeDasharray="3 3" />
                <line x1="0" y1="155" x2="350" y2="155" stroke="#1e293b" strokeOpacity="0.45" strokeDasharray="3 3" />

                {/* Candlesticks & Volumes */}
                {candles.map((candle, i) => {
                  const cx = 15 + (i / (candles.length - 1)) * 320;
                  const yOpen = getY(candle.open);
                  const yClose = getY(candle.close);
                  const yHigh = getY(candle.high);
                  const yLow = getY(candle.low);
                  const isUp = candle.close >= candle.open;
                  const bodyWidth = 12;

                  // Volume bar height simulation
                  const volHeight = 12 + (Math.sin(i * 1.7) + 1.2) * 8;
                  const volY = 178 - volHeight;

                  return (
                    <g 
                      key={i}
                      className="cursor-crosshair group/candle"
                      onMouseEnter={() => setHoveredCandle(candle)}
                      onMouseLeave={() => setHoveredCandle(null)}
                    >
                      {/* Volume block at bottom */}
                      <rect
                        x={cx - bodyWidth / 2}
                        y={volY}
                        width={bodyWidth}
                        height={volHeight}
                        fill={isUp ? "#10b981" : "#ef4444"}
                        className="opacity-15 group-hover/candle:opacity-40 transition-opacity"
                        rx="1.5"
                      />

                      {/* Wick / Shadow line */}
                      <line
                        x1={cx}
                        y1={yHigh}
                        x2={cx}
                        y2={yLow}
                        stroke={isUp ? "#34d399" : "#f87171"}
                        strokeWidth="1.5"
                        className="group-hover/candle:stroke-white transition-colors"
                      />

                      {/* Candle body rect */}
                      <rect
                        x={cx - bodyWidth / 2}
                        y={Math.min(yOpen, yClose)}
                        width={bodyWidth}
                        height={Math.max(2.5, Math.abs(yOpen - yClose))}
                        fill={isUp ? "#10b981" : "#ef4444"}
                        stroke={isUp ? "#34d399" : "#f87171"}
                        strokeWidth="1"
                        rx="1.5"
                        className="group-hover/candle:brightness-125 group-hover/candle:stroke-white transition-all"
                      />

                      {/* Hover capture block */}
                      <rect
                        x={cx - bodyWidth}
                        y="0"
                        width={bodyWidth * 2}
                        height="180"
                        fill="transparent"
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Chart Labels */}
              <div className="absolute top-1 left-2 text-[9px] text-zinc-600 font-bold font-mono">High: ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              <div className="absolute bottom-1 left-2 text-[9px] text-zinc-600 font-bold font-mono">Low: ${min.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          {/* Holding Information banner */}
          <div className="bg-slate-850/60 border border-slate-750 p-3.5 rounded-2xl flex justify-between items-center select-none">
            <div>
              <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider block">Your Holdings</span>
              <span className="text-xs text-zinc-300 font-bold font-mono mt-0.5 block">
                {holding.toLocaleString(undefined, {
                  minimumFractionDigits: liveCoin.symbol === 'BTC' || liveCoin.symbol === 'ETH' ? 6 : 2,
                  maximumFractionDigits: liveCoin.symbol === 'BTC' || liveCoin.symbol === 'ETH' ? 8 : 4
                })} {liveCoin.symbol}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider block">USDT VALUE</span>
              <span className="text-xs text-emerald-400 font-black font-mono mt-0.5 block">${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* BUY/SELL Interactive Form */}
          <div className="space-y-4 border-t border-slate-800 pt-5">
            <div className="flex justify-between items-center select-none">
              <span className="text-xs font-black text-zinc-300 uppercase tracking-wider">Trading Desk</span>
              <span className="text-[10px] text-zinc-500 font-bold">Cash Balance: ${profile?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</span>
            </div>

            {/* BUY / SELL Switch tabs */}
            <div className="grid grid-cols-2 bg-slate-950 p-1 border border-slate-850 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setQuickTradeType('BUY');
                  setTradeMessage(null);
                }}
                className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  quickTradeType === 'BUY'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                BUY {liveCoin.symbol}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuickTradeType('SELL');
                  setTradeMessage(null);
                }}
                className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  quickTradeType === 'SELL'
                    ? 'bg-red-500 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                SELL {liveCoin.symbol}
              </button>
            </div>

            {/* Input field */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Order Size ({liveCoin.symbol})</label>
                
                {/* Percent shortcuts */}
                <div className="flex gap-1">
                  {([25, 50, 75, 100] as const).map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        if (quickTradeType === 'BUY') {
                          const spend = (profile?.balance || 0) * (pct / 100);
                          setQuickTradeAmount(parseFloat((spend / liveCoin.price).toFixed(6)).toString());
                        } else {
                          const sellAmt = holding * (pct / 100);
                          setQuickTradeAmount(parseFloat(sellAmt.toFixed(6)).toString());
                        }
                        setTradeMessage(null);
                      }}
                      className="px-1.5 py-0.5 text-[8px] font-bold text-zinc-400 bg-slate-950 border border-slate-850 rounded hover:text-white active:scale-95 cursor-pointer"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  placeholder={`0.00 ${liveCoin.symbol}`}
                  value={quickTradeAmount}
                  onChange={(e) => {
                    setQuickTradeAmount(e.target.value);
                    setTradeMessage(null);
                  }}
                  className="w-full p-3.5 pr-20 bg-slate-950 border border-slate-800 rounded-2xl text-xs focus:outline-none focus:border-emerald-500 text-white font-mono"
                />
                <span className="absolute right-4 top-3.5 text-xs text-zinc-500 font-bold font-mono uppercase">{liveCoin.symbol}</span>
              </div>

              {/* Calculated estimated value subtext */}
              {quickTradeAmount && parseFloat(quickTradeAmount) > 0 && (
                <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono px-1">
                  <span>Estimated Value:</span>
                  <span className="font-bold text-zinc-300">
                    $ {((parseFloat(quickTradeAmount) || 0) * liveCoin.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>
              )}
            </div>

            {/* Response alerts */}
            {tradeMessage && (
              <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                tradeMessage.isError 
                  ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}>
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span className="leading-relaxed font-medium">{tradeMessage.text}</span>
              </div>
            )}

            {/* Submission Button */}
            <button
              type="button"
              disabled={tradeLoading || !quickTradeAmount || parseFloat(quickTradeAmount) <= 0}
              onClick={() => handleBuySellCrypto(liveCoin.symbol, quickTradeType, quickTradeAmount)}
              className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-lg active:scale-[0.985] disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${
                quickTradeType === 'BUY' 
                  ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 shadow-emerald-500/10' 
                  : 'bg-gradient-to-tr from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white shadow-rose-500/10'
              }`}
            >
              {tradeLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  <span>Executing Order...</span>
                </>
              ) : (
                <span>Place {quickTradeType} Order</span>
              )}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div id="user-dashboard-root" className="min-h-screen bg-slate-900 text-zinc-100 font-sans pb-28">
      {/* Top Header */}
      <header className="px-4 py-4 border-b border-slate-800 sticky top-0 bg-slate-900/85 backdrop-blur-md z-20 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button 
            id="profile-toggle-btn"
            onClick={onOpenProfile}
            className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors flex items-center justify-center text-zinc-300 hover:text-white"
          >
            <User size={18} />
          </button>
          <div>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Logged In</span>
            <span className="text-xs font-black tracking-tight text-zinc-200">
              {profile?.displayName || user.displayName || user.email.split('@')[0]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Secured network icon */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-[10px] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Sim-Net
          </div>
          
          <button
            id="dashboard-logout-btn"
            onClick={onLogout}
            className="p-2 rounded-full bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
          <RefreshCw size={28} className="text-emerald-500 animate-spin" />
          <span className="text-xs text-zinc-500 font-semibold">Decrypting wallet keys...</span>
        </div>
      ) : (
        <main className="max-w-md mx-auto px-4 mt-5 space-y-6">
          
          {/* TAB 1: HOME */}
          {activeTab === 'home' && (
            <>
              {/* Search Bar */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500">
                  <Search size={14} />
                </span>
                <input
                  id="crypto-search-bar"
                  type="text"
                  placeholder="Search supported crypto tokens... (Press Enter to open)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (filteredCrypto.length > 0) {
                        const firstMatch = filteredCrypto[0];
                        setSelectedCoin(firstMatch);
                        setTradeMessage(null);
                        setQuickTradeAmount('');
                        setQuickTradeType('BUY');
                      }
                    }
                  }}
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-800 border border-slate-700/80 rounded-xl text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 text-white placeholder-zinc-600"
                />
                {searchQuery && (
                  <button
                    id="clear-search-btn"
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 hover:text-white cursor-pointer"
                    title="Clear Search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Wallet Card */}
              <div id="wallet-balance-card" className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-400 p-6 text-white shadow-xl shadow-emerald-500/10">
                {/* Micro Ambient Details */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -ml-10 -mb-10" />

                <div className="flex justify-between items-start select-none">
                  <div>
                    <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Wallet Balance</span>
                    <h2 className="text-3xl font-black tracking-tight font-mono mt-1">
                      $ {totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h2>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-black/15 border border-white/10 text-[9px] font-black uppercase tracking-wider text-white">
                    USDT WALLET
                  </div>
                </div>

                {/* Deposit & Withdraw Prominent Buttons */}
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button
                    id="add-funds-btn"
                    onClick={onOpenDeposit}
                    className="flex items-center justify-center gap-2 py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-white font-bold text-xs rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <ArrowDownLeft size={16} className="text-emerald-400" />
                    <span>Add Funds</span>
                  </button>

                  <button
                    id="withdraw-funds-btn"
                    onClick={onOpenWithdraw}
                    className="flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-xs rounded-2xl transition-all active:scale-95 cursor-pointer"
                  >
                    <ArrowUpRight size={16} className="text-white" />
                    <span>Withdraw</span>
                  </button>
                </div>
              </div>

              {/* News slideshow */}
              <NewsCarousel />

              {/* Live Crypto Prices container with search bar */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">CRYPTO MARKET</h3>
                  <span className="text-[10px] text-zinc-500 font-semibold">Live Feed</span>
                </div>

                {/* Token grid list */}
                <div id="live-crypto-list" className="grid grid-cols-2 gap-3">
                  {filteredCrypto.map(coin => (
                    <div 
                      key={coin.symbol} 
                      onClick={() => {
                        setSelectedCoin(coin);
                        setTradeMessage(null);
                        setQuickTradeAmount('');
                        setQuickTradeType('BUY');
                      }}
                      className="bg-slate-800/60 border border-slate-750 rounded-2xl p-3.5 hover:bg-slate-800/90 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer group flex flex-col justify-between gap-3 min-h-[105px]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CoinIcon symbol={coin.symbol} className="w-8 h-8" />
                          <div className="min-w-0">
                            <span className="font-bold text-xs text-zinc-200 block truncate group-hover:text-white transition-colors">{coin.name}</span>
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">{coin.symbol}</span>
                          </div>
                        </div>
                        <div className="text-zinc-600 group-hover:text-emerald-400 transition-colors shrink-0">
                          <ArrowRight size={13} className="transform group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>

                      <div className="flex items-end justify-between">
                        <div>
                          <span className="font-bold text-xs font-mono block text-zinc-200">
                            ${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className={`flex items-center gap-0.5 text-[10px] font-bold shrink-0 ${
                          coin.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {coin.change24h >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          <span>{coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredCrypto.length === 0 && (
                    <div className="col-span-2 p-6 text-center bg-slate-800/60 border border-slate-750 rounded-2xl">
                      <p className="text-zinc-500 text-xs font-medium">No supported token matched your query.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: DETAILED WALLET TRANSACTIONS */}
          {activeTab === 'wallet' && (
            <div className="space-y-5 animate-fade-in">
              {/* Wallet Card */}
              <div id="wallet-tab-balance-card" className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-400 p-6 text-white shadow-xl shadow-emerald-500/10">
                {/* Micro Ambient Details */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -ml-10 -mb-10" />

                <div className="flex justify-between items-start select-none">
                  <div>
                    <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Wallet Balance</span>
                    <h2 className="text-3xl font-black tracking-tight font-mono mt-1">
                      $ {totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h2>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-black/15 border border-white/10 text-[9px] font-black uppercase tracking-wider text-white">
                    USDT WALLET
                  </div>
                </div>

                {/* Deposit & Withdraw Prominent Buttons */}
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button
                    id="add-funds-btn-wallet-tab"
                    onClick={onOpenDeposit}
                    className="flex items-center justify-center gap-2 py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-white font-bold text-xs rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <ArrowDownLeft size={16} className="text-emerald-400" />
                    <span>Add Funds</span>
                  </button>

                  <button
                    id="withdraw-funds-btn-wallet-tab"
                    onClick={onOpenWithdraw}
                    className="flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-xs rounded-2xl transition-all active:scale-95 cursor-pointer"
                  >
                    <ArrowUpRight size={16} className="text-white" />
                    <span>Withdraw</span>
                  </button>
                </div>
              </div>

               {/* Asset Holdings Section */}
              <div id="wallet-assets-holdings" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-black text-zinc-400 uppercase tracking-wider">Asset Holdings</h3>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                    {userAssets.filter(a => a.coinAmount > 0).length || 0} Assets
                  </span>
                </div>

                {/* Visual Distribution Bar */}
                <div id="assets-distribution-bar" className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex">
                  {userAssets.map(asset => {
                    const pct = totalPortfolioValue > 0 ? (asset.usdValue / totalPortfolioValue) * 100 : 0;
                    if (pct === 0) return null;
                    
                    let barColor = 'bg-emerald-400';
                    if (asset.symbol === 'BTC') barColor = 'bg-amber-500';
                    if (asset.symbol === 'ETH') barColor = 'bg-indigo-400';
                    if (asset.symbol === 'USDC') barColor = 'bg-cyan-400';
                    if (asset.symbol === 'SOL') barColor = 'bg-purple-400';
                    if (asset.symbol === 'BNB') barColor = 'bg-yellow-400';

                    return (
                      <div 
                        key={asset.symbol} 
                        style={{ width: `${pct}%` }} 
                        className={`${barColor} h-full transition-all duration-500`}
                        title={`${asset.symbol}: ${pct.toFixed(1)}%`}
                      />
                    );
                  })}
                  {totalPortfolioValue === 0 && (
                    <div className="w-full h-full bg-slate-800" />
                  )}
                </div>

                {/* Assets Grid/List */}
                <div className="grid grid-cols-1 gap-2.5">
                  {userAssets.filter(asset => asset.coinAmount > 0).map(asset => {
                    const assetPct = totalPortfolioValue > 0 ? (asset.usdValue / totalPortfolioValue) * 100 : 0;
                    return (
                      <div 
                        key={asset.symbol}
                        id={`asset-card-${asset.symbol.toLowerCase()}`}
                        onClick={() => {
                          const originalCoin = cryptoPrices.find(c => c.symbol === asset.symbol);
                          if (originalCoin) {
                            setSelectedCoin(originalCoin);
                            setTradeMessage(null);
                            setQuickTradeAmount('');
                            setQuickTradeType('BUY');
                          }
                        }}
                        className="flex justify-between items-center p-4 bg-slate-800/80 border border-slate-700/65 rounded-2xl hover:border-slate-500 hover:bg-slate-800/95 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <CoinIcon symbol={asset.symbol} className="w-10 h-10" />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-zinc-200 group-hover:text-white transition-colors">{asset.name}</span>
                              <span className="text-[9px] text-zinc-400 font-bold px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded">
                                {assetPct.toFixed(1)}%
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                              1 {asset.symbol} ≈ ${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="font-extrabold text-xs text-zinc-100 block font-mono">
                              {asset.coinAmount.toLocaleString(undefined, {
                                minimumFractionDigits: asset.symbol === 'BTC' || asset.symbol === 'ETH' ? 6 : 2,
                                maximumFractionDigits: asset.symbol === 'BTC' || asset.symbol === 'ETH' ? 8 : 4
                              })} {asset.symbol}
                            </span>
                            <span className="text-[10px] font-extrabold text-emerald-400 font-mono block mt-0.5">
                              $ {asset.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <div className="text-zinc-600 group-hover:text-emerald-400 transition-colors">
                            <ArrowRight size={14} className="transform group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {userAssets.filter(asset => asset.coinAmount > 0).length === 0 && (
                    <div className="text-center py-8 px-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl select-none">
                      <p className="text-zinc-500 text-xs font-semibold">Your asset holdings list is currently empty.</p>
                      <p className="text-zinc-600 text-[10px] mt-1.5 leading-relaxed max-w-[280px] mx-auto">
                        Please convert your available USD wallet balance, or choose a coin from the Market list on the home screen to buy it.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TRADE SIMULATOR */}
          {activeTab === 'trade' && (
            <div className="bg-slate-800 border border-slate-700/80 rounded-3xl p-5 space-y-5 animate-fade-in">
              <div>
                <h3 className="text-sm font-black text-zinc-300 tracking-tight flex items-center gap-1.5">
                  <ArrowRightLeft size={16} className="text-emerald-400" />
                  Quick Converter Simulator
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Learn stablecoin rates and instantly swap between token balances.</p>
              </div>

              <div className="space-y-4">
                {/* From Asset */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center select-none">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">From Asset</label>
                    <span className="text-[10px] text-zinc-400 font-bold font-mono">
                      Balance: {getCoinHolding(tradeFrom)} {tradeFrom}
                    </span>
                  </div>
                  <select
                    id="trade-from-picker"
                    value={tradeFrom}
                    onChange={(e) => {
                      setTradeFrom(e.target.value);
                      setSwapMessage(null);
                    }}
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-white font-bold cursor-pointer"
                  >
                    {cryptoPrices.map(c => (
                      <option key={c.symbol} value={c.symbol}>{c.symbol} - {c.name} (${c.price.toLocaleString()})</option>
                    ))}
                  </select>
                </div>

                {/* To Asset */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center select-none">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">To Asset</label>
                    <span className="text-[10px] text-zinc-400 font-bold font-mono">
                      Balance: {getCoinHolding(tradeTo)} {tradeTo}
                    </span>
                  </div>
                  <select
                    id="trade-to-picker"
                    value={tradeTo}
                    onChange={(e) => {
                      setTradeTo(e.target.value);
                      setSwapMessage(null);
                    }}
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-white font-bold cursor-pointer"
                  >
                    {cryptoPrices.map(c => (
                      <option key={c.symbol} value={c.symbol}>{c.symbol} - {c.name} (${c.price.toLocaleString()})</option>
                    ))}
                  </select>
                </div>

                {/* Amount to convert */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Amount to convert</label>
                  <div className="relative">
                    <input
                      id="trade-amount-input"
                      type="number"
                      placeholder="e.g. 0.5"
                      value={tradeAmount}
                      onChange={(e) => {
                        setTradeAmount(e.target.value);
                        setSwapMessage(null);
                      }}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setTradeAmount(getCoinHolding(tradeFrom).toString())}
                      className="absolute right-2.5 top-2 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 cursor-pointer"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                {/* Output conversion */}
                {tradeResult !== null && (
                  <div className="bg-slate-950 p-4 border border-slate-850 rounded-2xl flex flex-col gap-1 items-center justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl" />
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider select-none">Live Conversion Value</span>
                    <span className="text-xl font-black text-emerald-400 font-mono">
                      {tradeResult} <span className="text-xs text-zinc-400 font-normal">{tradeTo}</span>
                    </span>
                    <span className="text-[9px] text-zinc-600 font-semibold mt-0.5 select-none">Dynamic rate applied</span>
                  </div>
                )}

                {/* Messages feedback */}
                {swapMessage && (
                  <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    swapMessage.isError 
                      ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  }`}>
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span className="leading-relaxed font-medium">{swapMessage.text}</span>
                  </div>
                )}

                {/* Execution Button */}
                <button
                  type="button"
                  disabled={swapLoading || !tradeAmount || parseFloat(tradeAmount) <= 0}
                  onClick={handleSwapConvert}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/10 active:scale-[0.985] transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {swapLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                      <span>Processing Conversion...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft size={14} />
                      <span>Execute Instant Swap</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}          {/* TAB 4: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-fade-in">
              <ActivityLog userId={user.uid} />
            </div>
          )}

        </main>
      )}

      {/* STICKY BOTTOM NAVIGATION */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900 border-t border-slate-800/80 px-4 py-2 flex justify-around max-w-md mx-auto">
        {([
          { id: 'home', label: 'Home', icon: Coins },
          { id: 'wallet', label: 'Wallet', icon: Wallet },
          { id: 'trade', label: 'Trade', icon: ArrowRightLeft },
          { id: 'history', label: 'History', icon: History }
        ] as const).map(tab => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-tab-btn-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all cursor-pointer ${
                isSelected ? 'text-emerald-400 bg-emerald-500/5' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={18} className={isSelected ? 'scale-110 transition-transform' : ''} />
              <span className="text-[10px] font-bold tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </footer>



    </div>
  );
}
