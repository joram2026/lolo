import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { db } from '../firebase';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { UserAccount, Transaction, CryptoPrice, ArbitrageConfig } from '../types';
import { useToast } from '../context/ToastContext';
import NewsCarousel from './NewsCarousel';
import ActivityLog from './ActivityLog';
import { 
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft, Search, 
  User, LogOut, ArrowRightLeft, ShieldCheck, Activity, Wallet, 
  HelpCircle, RefreshCw, Coins, ArrowRight, MessageSquare, AlertCircle,
  History, ArrowLeft, X, ChevronDown, Check, Lock, Unlock, Eye, EyeOff, Sparkles, BookOpen, Zap, Send,
  Cpu, Play, Pause, Bot, Crown, Gift, ListFilter, CheckCircle2
} from 'lucide-react';
import { RunningBotView } from './RunningBotView';
import { getTradingPairConfig, TradingPairBadge, DEFAULT_BOT_TRADING_PAIRS } from '../utils/pairUtils';
import { syncLiveCryptoPrices } from '../utils/cryptoApi';

interface StandardUserDashboardProps {
  user: any;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenDeposit: (coinSymbol?: string) => void;
  onOpenSend: () => void;
  onOpenWithdraw: () => void;
  path: string;
  navigate: (path: string) => void;
}

const STATIC_CRYPTO: CryptoPrice[] = [
  { name: 'Tether', symbol: 'USDT', price: 1.00, change24h: 0.01, investmentRate: 2.5, winRate: 99.2 },
  { name: 'USD Coin', symbol: 'USDC', price: 1.00, change24h: -0.02, investmentRate: 2.5, winRate: 99.1 },
  { name: 'Bitcoin', symbol: 'BTC', price: 94250.30, change24h: 3.45, investmentRate: 3.5, winRate: 97.8 },
  { name: 'Ethereum', symbol: 'ETH', price: 3480.12, change24h: 1.82, investmentRate: 4.0, winRate: 96.5 },
  { name: 'Solana', symbol: 'SOL', price: 184.45, change24h: -2.15, investmentRate: 6.0, winRate: 95.8 },
  { name: 'Binance Coin', symbol: 'BNB', price: 592.20, change24h: 0.95, investmentRate: 4.5, winRate: 96.2 },
  { name: 'XRP', symbol: 'XRP', price: 2.54, change24h: 4.12, investmentRate: 3.0, winRate: 94.5 },
  { name: 'World Coin', symbol: 'WLD', price: 2.80, change24h: -1.25, investmentRate: 5.0, winRate: 93.8 },
  { name: 'Tron', symbol: 'TRX', price: 0.22, change24h: 0.45, investmentRate: 3.5, winRate: 95.2 },
  { name: 'DOGE Coin', symbol: 'DOGE', price: 0.38, change24h: 2.15, investmentRate: 7.0, winRate: 92.4 }
];

export const mergeWithDefaultRates = (rawPrices: CryptoPrice[]): CryptoPrice[] => {
  const defaultRates: Record<string, number> = {
    USDT: 2.5, USDC: 2.5, BTC: 3.5, ETH: 4.0, SOL: 6.0, BNB: 4.5, XRP: 3.0, WLD: 5.0, TRX: 3.5, DOGE: 7.0
  };
  const defaultWinRates: Record<string, number> = {
    USDT: 99.2, USDC: 99.1, BTC: 97.8, ETH: 96.5, SOL: 95.8, BNB: 96.2, XRP: 94.5, WLD: 93.8, TRX: 95.2, DOGE: 92.4
  };
  const order = ['USDT', 'USDC', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'WLD', 'TRX', 'DOGE'];

  const map = new Map<string, CryptoPrice>();
  STATIC_CRYPTO.forEach(item => map.set(item.symbol, { ...item }));

  if (Array.isArray(rawPrices) && rawPrices.length > 0) {
    rawPrices.forEach(item => {
      if (item && item.symbol) {
        const existing = map.get(item.symbol) || item;
        map.set(item.symbol, {
          ...existing,
          ...item,
          price: item.price !== undefined && item.price !== 0 ? item.price : (existing.price || 1.0),
          investmentRate: item.investmentRate ?? existing.investmentRate ?? defaultRates[item.symbol] ?? 5.0,
          winRate: item.winRate ?? existing.winRate ?? defaultWinRates[item.symbol] ?? 96.0,
        });
      }
    });
  }

  const result = Array.from(map.values());
  result.sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));
  return result;
};

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
    TRX: 'https://cryptologos.cc/logos/tron-trx-logo.png',
    DOGE: 'https://cryptologos.cc/logos/dogecoin-doge-logo.png'
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

interface CustomCoinSelectProps {
  value: string;
  onChange: (value: string) => void;
  coins: CryptoPrice[];
  isLightTheme?: boolean;
}

function CustomCoinSelect({ value, onChange, coins, isLightTheme = false }: CustomCoinSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedCoin = coins.find(c => c.symbol === value) || coins[0];

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = () => {
      setIsOpen(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isOpen]);

  return (
    <div className="relative select-none" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-3.5 border rounded-2xl text-xs font-bold cursor-pointer transition-all focus:outline-none ${
          isLightTheme 
            ? 'bg-zinc-50/50 border-zinc-200 text-zinc-800 hover:border-amber-500/50 hover:bg-zinc-100/50 focus:border-amber-500'
            : 'bg-slate-950 border-slate-850 text-white hover:border-emerald-500/50 hover:bg-slate-900/40 focus:border-emerald-500'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <CoinIcon symbol={selectedCoin.symbol} className="w-5 h-5 rounded-md" />
          <div className="flex flex-col items-start leading-none gap-1">
            <span className={`font-extrabold text-xs ${isLightTheme ? 'text-zinc-800' : 'text-zinc-100'}`}>{selectedCoin.symbol}</span>
            <span className="text-[9px] text-zinc-500 font-bold">{selectedCoin.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs ${isLightTheme ? 'text-zinc-600' : 'text-zinc-400'}`}>
            ${selectedCoin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
          <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${isOpen ? (isLightTheme ? 'rotate-180 text-amber-500' : 'rotate-180 text-emerald-400') : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className={`absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto border rounded-2xl shadow-2xl z-50 scrollbar-thin scrollbar-track-transparent animate-fade-in ${
          isLightTheme 
            ? 'bg-white border-zinc-200 scrollbar-thumb-zinc-200' 
            : 'bg-slate-950 border-slate-850 scrollbar-thumb-slate-800'
        }`}>
          <div className="p-1.5 space-y-1">
            {coins.map((coin) => {
              const isSelected = coin.symbol === value;
              return (
                <button
                  key={coin.symbol}
                  type="button"
                  onClick={() => {
                    onChange(coin.symbol);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                    isSelected 
                      ? (isLightTheme ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20') 
                      : (isLightTheme ? 'text-zinc-700 hover:bg-zinc-100/80 hover:text-zinc-900' : 'text-zinc-300 hover:bg-slate-900/60 hover:text-white')
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CoinIcon symbol={coin.symbol} className="w-5 h-5 rounded-md" />
                    <div className="flex flex-col leading-none gap-1">
                      <span className={isSelected ? (isLightTheme ? "text-amber-600 font-extrabold" : "text-emerald-400") : (isLightTheme ? "text-zinc-800" : "text-zinc-200")}>{coin.symbol}</span>
                      <span className="text-[9px] text-zinc-500 font-bold">{coin.name}</span>
                    </div>
                  </div>
                  <span className={`font-mono text-xs ${isLightTheme ? 'text-zinc-500 font-medium' : 'text-zinc-400'}`}>
                    ${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
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
  timestamp: number;
  volume?: number;
}

const TIMEFRAME_DURATIONS: Record<string, number> = {
  '1m': 60000,
  '5m': 300000,
  '1h': 3600000,
  '4h': 14400000
};

const generateCandleData = (coinPrice: number, change: number, timeframe: string): Candle[] => {
  const count = 24;
  const candles: Candle[] = [];
  const duration = TIMEFRAME_DURATIONS[timeframe] || 300000;
  const currentPeriodStart = Math.floor(Date.now() / duration) * duration;
  
  const isUp = change >= 0;
  const startFactor = isUp ? (1 - change / 100) : (1 + Math.abs(change) / 100);
  const startPrice = coinPrice * startFactor;
  
  let variance = 0.015;
  if (timeframe === '1m') variance = 0.002;
  if (timeframe === '5m') variance = 0.006;
  if (timeframe === '1h') variance = 0.02;
  if (timeframe === '4h') variance = 0.045;

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
      close: parseFloat(safeClose.toFixed(4)),
      timestamp: currentPeriodStart - (count - 1 - i) * duration,
      volume: Math.floor(50 + Math.random() * 150)
    });
    
    currentPrice = safeClose;
  }
  
  return candles;
};

const formatCandleTime = (timestamp: number, tf: string): string => {
  const date = new Date(timestamp);
  const pad = (num: number) => num.toString().padStart(2, '0');
  if (tf === '1m' || tf === '5m') {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } else {
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
};

export default function StandardUserDashboard({ 
  user, 
  onLogout, 
  onOpenProfile, 
  onOpenDeposit, 
  onOpenSend,
  onOpenWithdraw,
  path,
  navigate
}: StandardUserDashboardProps) {
  
  // Toast Hook
  const toast = useToast();

  // Real-time state
  const [profile, setProfile] = useState<UserAccount | null>(null);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);

  // Crypto MMF Investment states
  const [activeInvestments, setActiveInvestments] = useState<any[]>([]);
  const processingInvestmentsRef = useRef<Set<string>>(new Set());
  const [tradeMode, setTradeMode] = useState<'swap' | 'mmf'>('swap');
  const [tradeSubTab, setTradeSubTab] = useState<'arbitrage' | 'converter'>('arbitrage');
  const [tradeSubSection, setTradeSubSection] = useState<'bots' | 'converter'>('bots');
  const [botHubView, setBotHubView] = useState<'menu' | 'PREMIUM' | 'FREE' | 'HISTORY' | 'MY_BOTS'>('menu');
  const [userBots, setUserBots] = useState<any[]>([]);
  const [botTemplates, setBotTemplates] = useState<any[]>([]);
  const [selectedBotTemplate, setSelectedBotTemplate] = useState<any | null>(null);
  const [botCapitalInput, setBotCapitalInput] = useState<string>('');
  const [botCoinInput, setBotCoinInput] = useState<string>('USDT');
  const [botSelectedPair, setBotSelectedPair] = useState<string>('');
  const [isPairDropdownOpen, setIsPairDropdownOpen] = useState<boolean>(false);
  const [botDurationSeconds, setBotDurationSeconds] = useState<number>(60);
  const [botDeployLoading, setBotDeployLoading] = useState<boolean>(false);
  const [activeRunningBot, setActiveRunningBot] = useState<any | null>(null);
  const [mmfSubView, setMmfSubView] = useState<'main' | 'list' | 'form'>('main');
  const [selectedCoinForInvestment, setSelectedCoinForInvestment] = useState<CryptoPrice | null>(null);
  const [investmentAmount, setInvestmentAmount] = useState<string>('');
  const [investmentDays, setInvestmentDays] = useState<string>('24');
  const [investmentLoading, setInvestmentLoading] = useState<boolean>(false);
  const [investmentErrorState, setInvestmentErrorState] = useState<string | null>(null);
  const [investmentSuccessState, setInvestmentSuccessState] = useState<string | null>(null);

  const setInvestmentError = (msg: string | null) => {
    setInvestmentErrorState(msg);
    if (msg) toast.error(msg, 'Investment Error');
  };
  const setInvestmentSuccess = (msg: string | null) => {
    setInvestmentSuccessState(msg);
    if (msg) toast.success(msg, 'Investment Success');
  };
  const investmentError = investmentErrorState;
  const investmentSuccess = investmentSuccessState;
  
  // Live fluctuating crypto prices state
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrice[]>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return STATIC_CRYPTO.map(c => ({ ...c, price: 0, change24h: 0 }));
    }
    return STATIC_CRYPTO;
  });
  
  // Selected coin for high-fidelity interactive modal/chart details
  const [selectedCoin, setSelectedCoin] = useState<CryptoPrice | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<'1m' | '5m' | '1h' | '4h'>('5m');
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [isBalanceBlurred, setIsBalanceBlurred] = useState<boolean>(false);
  const [isEarnBalanceBlurred, setIsEarnBalanceBlurred] = useState<boolean>(false);
  const [earnDisplayMode, setEarnDisplayMode] = useState<'USD' | 'CRYPTO'>('USD');

  // Active Coin for Dedicated Quick Arbitrage Guide Page
  const [arbitrageGuideCoin, setArbitrageGuideCoin] = useState<{
    symbol: string;
    name: string;
    price: number;
    spreadPct: number;
    extMin: number;
    extMax: number;
    platforms: string[];
  } | null>(null);

  // Live Persistent Candlestick Engine
  const [candlesCache, setCandlesCache] = useState<Record<string, Candle[]>>({});

  // Initialize cache if missing
  useEffect(() => {
    if (!selectedCoin) return;
    const liveCoin = cryptoPrices.find(c => c.symbol === selectedCoin.symbol) || selectedCoin;
    const tf = chartTimeframe;
    const cacheKey = `${liveCoin.symbol}-${tf}`;

    setCandlesCache(prev => {
      if (prev[cacheKey]) return prev;
      const baseCandles = generateCandleData(liveCoin.price, liveCoin.change24h, tf);
      return {
        ...prev,
        [cacheKey]: baseCandles
      };
    });
  }, [selectedCoin?.symbol, chartTimeframe]);

  // Real-time wall-clock precision candlestick tracker and ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (!selectedCoin) return;
      const liveCoin = cryptoPrices.find(c => c.symbol === selectedCoin.symbol) || selectedCoin;
      const tf = chartTimeframe;
      const cacheKey = `${liveCoin.symbol}-${tf}`;
      const duration = TIMEFRAME_DURATIONS[tf] || 300000;
      const now = Date.now();
      const currentPeriodStart = Math.floor(now / duration) * duration;

      setCandlesCache(prev => {
        const existing = prev[cacheKey];
        if (!existing) {
          const baseCandles = generateCandleData(liveCoin.price, liveCoin.change24h, tf);
          return {
            ...prev,
            [cacheKey]: baseCandles
          };
        }

        const updated = [...existing];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0) {
          const last = updated[lastIdx];
          
          if (last.timestamp < currentPeriodStart) {
            // Timeframes rule: Once time expires, the active candle closes, and we open a new one
            const prevClose = last.close;
            const newCandle: Candle = {
              open: prevClose,
              high: Math.max(prevClose, liveCoin.price),
              low: Math.min(prevClose, liveCoin.price),
              close: liveCoin.price,
              timestamp: currentPeriodStart,
              volume: Math.floor(50 + Math.random() * 150)
            };
            updated.push(newCandle);
            if (updated.length > 24) {
              updated.shift();
            }
          } else {
            // Live feedback: update high, low, close of the active candle in real-time
            const newClose = liveCoin.price;
            const newHigh = Math.max(last.high, newClose);
            const newLow = Math.min(last.low, newClose);
            updated[lastIdx] = {
              ...last,
              high: parseFloat(newHigh.toFixed(4)),
              low: parseFloat(newLow.toFixed(4)),
              close: parseFloat(newClose.toFixed(4))
            };
          }
        }
        return {
          ...prev,
          [cacheKey]: updated
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedCoin?.symbol, chartTimeframe, cryptoPrices]);
  const [quickTradeType, setQuickTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [quickTradeAmount, setQuickTradeAmount] = useState<string>('');
  const [tradeMessageState, setTradeMessageState] = useState<{ text: string; isError: boolean } | null>(null);
  const setTradeMessage = (msg: { text: string; isError: boolean } | null) => {
    setTradeMessageState(msg);
    if (msg) {
      if (msg.isError) toast.error(msg.text, 'Trade Error');
      else toast.success(msg.text, 'Trade Executed');
    }
  };
  const tradeMessage = tradeMessageState;
  const [tradeLoading, setTradeLoading] = useState(false);

  // Bottom Sticky Nav Tab
  const [activeTab, setActiveTab] = useState<'home' | 'wallet' | 'trade' | 'history' | 'earn'>('home');
  
  // Sync bottom tab selection with current path
  useEffect(() => {
    if (path === '/wallet') {
      setActiveTab('wallet');
    } else if (path === '/trade') {
      setActiveTab('trade');
    } else if (path === '/earn') {
      setActiveTab('earn');
    } else if (path === '/history') {
      setActiveTab('history');
    } else {
      setActiveTab('home');
    }
  }, [path]);

  const handleTabChange = (tabId: 'home' | 'wallet' | 'trade' | 'history' | 'earn') => {
    setActiveTab(tabId);
    setArbitrageGuideCoin(null);
    if (tabId === 'home') {
      navigate('/dashboard');
    } else {
      navigate(`/${tabId}`);
    }
  };
  
  // UI States
  const isLightTheme = true;
  const [searchQuery, setSearchQuery] = useState('');
  const [userLoaded, setUserLoaded] = useState(false);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [isUsingFallbackPrices, setIsUsingFallbackPrices] = useState(false);
  const [pricesLoadError, setPricesLoadError] = useState<string | null>(null);

  const loading = !userLoaded || (!pricesLoaded && !isUsingFallbackPrices);

  // Helper to re-fetch crypto prices from Firestore backend & trigger sync
  const refetchPricesFromBackend = async () => {
    try {
      const pricesCol = collection(db, 'crypto_prices');
      const snap = await getDocs(pricesCol);
      if (!snap.empty) {
        const fetched = snap.docs.map(doc => doc.data() as CryptoPrice);
        setCryptoPrices(mergeWithDefaultRates(fetched));
        setPricesLoaded(true);
        setIsUsingFallbackPrices(false);
        setPricesLoadError(null);
      }
      syncLiveCryptoPrices(db).catch(console.error);
    } catch (err) {
      console.warn("Failed to refetch prices on network recovery:", err);
    }
  };

  // Re-fetch prices when entering the SIGNALS / earn tab
  useEffect(() => {
    if (activeTab === 'earn') {
      refetchPricesFromBackend();
    }
  }, [activeTab]);

  // Safety timeout to avoid getting stuck if Firestore prices fetch is slow or blocked
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!pricesLoaded) {
        console.warn("Crypto prices fetch timed out. Falling back to default offline prices.");
        setIsUsingFallbackPrices(true);
        setPricesLoadError("Network latency detected. Displaying offline rates.");
        setCryptoPrices(mergeWithDefaultRates(STATIC_CRYPTO));
      }
    }, 10000); // 10 seconds timeout

    return () => clearTimeout(timer);
  }, [pricesLoaded]);

  // Listen to network status (online/offline)
  useEffect(() => {
    const handleOnline = () => {
      refetchPricesFromBackend();
      toast.success('Connection restored! Re-synced live rates from server.', 'Online');
    };
    const handleOffline = () => {
      setIsUsingFallbackPrices(true);
      toast.warning('No internet connection. Offline mode activated.', 'Offline');
      setCryptoPrices(mergeWithDefaultRates(STATIC_CRYPTO));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('focus', handleOnline);
      if (!navigator.onLine) {
        handleOffline();
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('focus', handleOnline);
      }
    };
  }, []);

  // Arbitrage Config State
  const [arbitrageConfig, setArbitrageConfig] = useState<ArbitrageConfig | null>(null);

  // Arbitrage Calculator input states
  const [arbAmount1, setArbAmount1] = useState('0.5');
  const [arbAmount2, setArbAmount2] = useState('5.0');

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
      setUserLoaded(true);
    }, (err) => {
      console.error("Error listening to user doc:", err);
      setUserLoaded(true);
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
        setCryptoPrices(mergeWithDefaultRates(fetched));
        setPricesLoaded(true);
        setIsUsingFallbackPrices(false);
        setPricesLoadError(null);
      } else {
        setIsUsingFallbackPrices(true);
        setPricesLoadError("No live prices found in database. Using default rates.");
        setCryptoPrices(mergeWithDefaultRates(STATIC_CRYPTO));
      }
    }, (err) => {
      console.error("Error listening to crypto prices:", err);
      setIsUsingFallbackPrices(true);
      setPricesLoadError("Failed to fetch live prices from server. Using default rates.");
      setCryptoPrices(mergeWithDefaultRates(STATIC_CRYPTO));
    });

    const invCol = collection(db, 'investments');
    const invQuery = query(invCol, where('userId', '==', user.uid));
    const unsubscribeInvestments = onSnapshot(invQuery, (snapshot) => {
      const invs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      // Sort MMF investments by creation date (newest/recently done first)
      invs.sort((a, b) => {
        const aTime = a.createdAt?.seconds 
          ? a.createdAt.seconds * 1000 
          : a.createdAt?.toDate 
            ? a.createdAt.toDate().getTime() 
            : new Date(a.createdAt || 0).getTime();
        const bTime = b.createdAt?.seconds 
          ? b.createdAt.seconds * 1000 
          : b.createdAt?.toDate 
            ? b.createdAt.toDate().getTime() 
            : new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setActiveInvestments(invs);
    });

    // Real-time listener for Arbitrage config
    const arbDocRef = doc(db, 'settings', 'arbitrage_config');
    const unsubscribeArbitrage = onSnapshot(arbDocRef, (snapshot) => {
      if (snapshot.exists()) {
        setArbitrageConfig(snapshot.data() as ArbitrageConfig);
      } else {
        setArbitrageConfig({
          coin1Symbol: 'BTC',
          coin1ExternalMin: 91500,
          coin1ExternalMax: 92500,
          coin1UseLiveOffset: true,
          coin1OffsetPercentage: 2.5,
          coin2Symbol: 'ETH',
          coin2ExternalMin: 3350,
          coin2ExternalMax: 3410,
          coin2UseLiveOffset: true,
          coin2OffsetPercentage: 2.8,
          platformsList: ['Binance', 'Bybit', 'OKX', 'Coinbase']
        });
      }
    }, (err) => {
      console.error("Error listening to arbitrage config:", err);
    });

    const botsCol = collection(db, 'user_bots');
    const botsQuery = query(botsCol, where('userId', '==', user.uid));
    const unsubscribeBots = onSnapshot(botsQuery, (snapshot) => {
      const bots = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      bots.sort((a, b) => {
        const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setUserBots(bots);
    });

    const unsubscribeTemplates = onSnapshot(collection(db, 'bot_templates'), (snapshot) => {
      const tpls = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      tpls.sort((a, b) => {
        const capA = Number(a.minCapital ?? a.min_capital ?? a.minDeposit ?? a.capital ?? 0);
        const capB = Number(b.minCapital ?? b.min_capital ?? b.minDeposit ?? b.capital ?? 0);
        return capA - capB;
      });
      setBotTemplates(tpls);
    });

    return () => {
      unsubscribeUser();
      unsubscribeTx();
      unsubscribePrices();
      unsubscribeInvestments();
      unsubscribeArbitrage();
      unsubscribeBots();
      unsubscribeTemplates();
    };
  }, [user.uid]);

  // Fluctuate prices live every 4 seconds to make the app feel real
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      setCryptoPrices(prev => prev.map(coin => {
        if (coin.price === 0) return coin;
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
          // More active, high-fidelity fluctuations for main coins (BTC, ETH, SOL, BNB, etc.)
          const percentageChange = (Math.random() - 0.485) * 0.0035; 
          const newPrice = coin.price * (1 + percentageChange);
          const newChange24h = coin.change24h + percentageChange * 100;
          
          // Dynamically check if the previous price was defined with more than 2 decimal places, 
          // or if the coin is a low-priced asset (under $5) where 4-decimal precision is necessary.
          const priceStr = coin.price.toString();
          const hasMoreThan2Decimals = priceStr.includes('.') && priceStr.split('.')[1].length > 2;
          const decimals = (hasMoreThan2Decimals || coin.price < 5) ? 4 : 2;

          return {
            ...coin,
            price: parseFloat(newPrice.toFixed(decimals)),
            change24h: parseFloat(Math.max(-15, Math.min(15, newChange24h)).toFixed(2))
          };
        }
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, [isUsingFallbackPrices]);

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
      case 'internal_send': return 'Internal Send';
      case 'internal_receive': return 'Internal Receive';
      case 'invested': return 'Trade Signal';
      case 'investment_earning': return 'Signal Earning';
      default: return type;
    }
  };

  const totalBalance = profile?.balance || 0;

  // Real-time helper for standard user's asset holdings
  const getCoinHolding = (symbol: string): number => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (symbol === 'USDT' || symbol === 'USDC') {
        return 0;
      }
    }
    if (symbol === 'USDT') {
      return profile?.balance || 0;
    }
    if (profile?.holdings && profile.holdings[symbol] !== undefined) {
      return profile.holdings[symbol];
    }
    return 0;
  };

  const getLockedAmount = (symbol: string): number => {
    return activeInvestments
      .filter(inv => inv.coinSymbol === symbol && inv.status === 'active')
      .reduce((sum, inv) => sum + inv.amount, 0);
  };

  const handleInitiateInvestment = async () => {
    if (!selectedCoinForInvestment) return;
    setInvestmentError(null);
    setInvestmentSuccess(null);

    const amountVal = parseFloat(investmentAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setInvestmentError("Please enter a valid trade amount.");
      return;
    }

    const daysVal = parseInt(investmentDays);
    if (isNaN(daysVal) || daysVal < 24) {
      setInvestmentError("Minimum signal trade duration is 24 days.");
      return;
    }

    const currentHolding = getCoinHolding(selectedCoinForInvestment.symbol);
    const lockedAmount = getLockedAmount(selectedCoinForInvestment.symbol);
    const unlockedHolding = currentHolding - lockedAmount;

    const minLimit = selectedCoinForInvestment.minInvestment ?? 10.0;
    if (unlockedHolding < minLimit) {
      setInvestmentError(`Your available balance of ${unlockedHolding.toFixed(4)} ${selectedCoinForInvestment.symbol} is below the minimum required trade amount of ${minLimit} ${selectedCoinForInvestment.symbol}. Please go to the deposit page to add deposit.`);
      return;
    }

    if (amountVal < minLimit) {
      setInvestmentError(`The minimum trade amount allowed for ${selectedCoinForInvestment.symbol} is ${minLimit} ${selectedCoinForInvestment.symbol}. Please enter at least ${minLimit} ${selectedCoinForInvestment.symbol}.`);
      return;
    }

    if (unlockedHolding < amountVal) {
      setInvestmentError(`Insufficient available ${selectedCoinForInvestment.symbol} balance. You hold ${currentHolding} but ${lockedAmount} is already allocated to active trades.`);
      return;
    }

    setInvestmentLoading(true);

    try {
      const unlockTime = new Date();
      unlockTime.setDate(unlockTime.getDate() + daysVal);

      // Create investment document with totalDays and daysPaid tracking
      await addDoc(collection(db, 'investments'), {
        userId: user.uid,
        userEmail: user.email,
        coinSymbol: selectedCoinForInvestment.symbol,
        amount: amountVal,
        dailyRate: selectedCoinForInvestment.investmentRate ?? 5.0,
        status: 'active',
        totalDays: daysVal,
        daysPaid: 0,
        createdAt: new Date(),
        unlockAt: unlockTime
      });

      // Create transaction record: invested
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        userEmail: user.email,
        type: 'invested',
        amount: parseFloat((amountVal * selectedCoinForInvestment.price).toFixed(2)),
        coinSymbol: selectedCoinForInvestment.symbol,
        coinAmount: amountVal,
        status: 'APPROVED',
        createdAt: new Date(),
        paymentMessage: `Signal Trade Executed: Allocated ${amountVal} ${selectedCoinForInvestment.symbol} for ${daysVal} days at ${selectedCoinForInvestment.investmentRate ?? 5.0}% daily yield.`
      });

      setInvestmentSuccess(`Successfully executed trading signal for ${amountVal} ${selectedCoinForInvestment.symbol}!`);
      setInvestmentAmount('');
      setInvestmentDays('24');
      setMmfSubView('main');
    } catch (err: any) {
      console.error(err);
      setInvestmentError("Failed to execute trade signal: " + err.message);
    } finally {
      setInvestmentLoading(false);
    }
  };

  // Check and auto-matured active investments in real-time based on real clock passing
  useEffect(() => {
    if (!profile || activeInvestments.length === 0) return;

    const checkMaturity = async () => {
      const now = new Date();

      const getKenyanDaysSinceEpoch = (d: Date): number => {
        // Kenya is UTC+3
        const eatMs = d.getTime() + 3 * 3600 * 1000;
        return Math.floor(eatMs / (1000 * 60 * 60 * 24));
      };

      const nowDayEpoch = getKenyanDaysSinceEpoch(now);

      // Filter active investments that need payments based on EAT calendar day boundary rollover (midnight)
      const needingPayment = activeInvestments.filter(inv => {
        if (inv.status !== 'active') return false;
        if (processingInvestmentsRef.current.has(inv.id)) return false;

        const created = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt);
        const createdDayEpoch = getKenyanDaysSinceEpoch(created);
        const daysElapsed = Math.max(0, nowDayEpoch - createdDayEpoch);

        const totalDays = inv.totalDays ?? 24;
        const daysPaid = inv.daysPaid ?? 0;

        // We owe payments if more calendar days have elapsed than what we have paid
        return daysElapsed > daysPaid && daysPaid < totalDays;
      });

      if (needingPayment.length === 0) return;

      // Mark as processing instantly to prevent duplicate runs
      needingPayment.forEach(inv => processingInvestmentsRef.current.add(inv.id));

      try {
        let runningBalance = profile.balance || 0;
        const runningHoldings = { ...(profile.holdings || {}) };

        for (const inv of needingPayment) {
          const coinInfo = cryptoPrices.find(c => c.symbol === inv.coinSymbol);
          const coinPrice = coinInfo ? coinInfo.price : 0;

          const created = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt);
          const createdDayEpoch = getKenyanDaysSinceEpoch(created);
          const daysElapsed = Math.max(0, nowDayEpoch - createdDayEpoch);

          const totalDays = inv.totalDays ?? 24;
          const daysPaid = inv.daysPaid ?? 0;

          // Number of payouts to apply in this batch
          const payoutsToApply = Math.min(daysElapsed, totalDays) - daysPaid;
          if (payoutsToApply <= 0) continue;

          // Profit calculation for the payouts in this batch
          const singleDayProfit = inv.amount * (inv.dailyRate / 100);
          const totalProfitInBatch = singleDayProfit * payoutsToApply;

          if (inv.coinSymbol === 'USDT') {
            runningBalance += totalProfitInBatch;
          } else {
            runningHoldings[inv.coinSymbol] = (runningHoldings[inv.coinSymbol] || 0) + totalProfitInBatch;
          }

          const nextDaysPaid = daysPaid + payoutsToApply;
          const isCompleted = nextDaysPaid >= totalDays;

          // 1. Update the investment progress
          const oldInvRef = doc(db, 'investments', inv.id);
          await updateDoc(oldInvRef, {
            daysPaid: nextDaysPaid,
            status: isCompleted ? 'completed' : 'active'
          });

          // 2. Update the user profile with the accumulated running balance & holdings
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, {
            balance: parseFloat(runningBalance.toFixed(2)),
            holdings: runningHoldings
          });

          // 3. Document the earning payouts in transactions
          await addDoc(collection(db, 'transactions'), {
            userId: user.uid,
            userEmail: user.email,
            type: 'investment_earning',
            amount: parseFloat((totalProfitInBatch * coinPrice).toFixed(2)),
            coinSymbol: inv.coinSymbol,
            coinAmount: parseFloat(totalProfitInBatch.toFixed(6)),
            status: 'APPROVED',
            createdAt: new Date(),
            paymentMessage: `Trade Signal Yield: Received +${parseFloat(totalProfitInBatch.toFixed(6))} ${inv.coinSymbol} daily profit yield (Days ${daysPaid + 1} to ${nextDaysPaid}).`
          });
        }
      } catch (err) {
        console.error("Auto maturity execution error:", err);
      } finally {
        // Clean up from the ref after updates are complete
        needingPayment.forEach(inv => processingInvestmentsRef.current.delete(inv.id));
      }
    };

    checkMaturity();
  }, [activeInvestments, profile, cryptoPrices]);

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
    const price = coinInfo ? coinInfo.price : 0;
    const coinAmount = getCoinHolding(def.symbol);
    const lockedAmount = getLockedAmount(def.symbol);
    const unlockedAmount = Math.max(0, coinAmount - lockedAmount);
    const usdValue = coinAmount * price; // Amount * Live Price = USDT equivalent!
    return {
      symbol: def.symbol,
      name: coinInfo?.name || def.symbol,
      colorClass: def.color,
      usdValue,
      coinAmount,
      price,
      lockedAmount,
      unlockedAmount
    };
  });

  const totalPortfolioValue = userAssets.reduce((sum, asset) => sum + asset.usdValue, 0);

  // Calculate portfolio 24-hour change (increase or decrease) based on dynamic holdings & price shifts
  const portfolioDailyChange = useMemo(() => {
    let originalValue = 0;
    let currentValue = 0;

    userAssets.forEach(asset => {
      const coinInfo = cryptoPrices.find(c => c.symbol === asset.symbol);
      const change24h = coinInfo?.change24h || 0;
      const currentPrice = coinInfo ? coinInfo.price : 0;
      
      // price_now = price_then * (1 + change24h/100) => price_then = price_now / (1 + change24h/100)
      const divider = 1 + (change24h / 100);
      const price24hAgo = divider > 0 ? (currentPrice / divider) : currentPrice;
      
      const valNow = asset.coinAmount * currentPrice;
      const valThen = asset.coinAmount * price24hAgo;
      
      currentValue += valNow;
      originalValue += valThen;
    });

    const diffUSD = currentValue - originalValue;
    const pctChange = originalValue > 0 ? (diffUSD / originalValue) * 100 : 0;
    
    return {
      diffUSD,
      pctChange,
      isPositive: diffUSD >= 0
    };
  }, [userAssets, cryptoPrices]);

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
    const lockedUSDT = getLockedAmount('USDT');
    const unlockedCashBalance = Math.max(0, cashBalance - lockedUSDT);
    const coinHolding = getCoinHolding(symbol);
    setTradeLoading(true);

    if (type === 'BUY') {
      const totalCost = amount * price;
      if (unlockedCashBalance < totalCost) {
        setTradeMessage({ 
          text: `Insufficient available cash balance. Buying ${amount} ${symbol} requires $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} but you only have $${unlockedCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} available ($${lockedUSDT.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT is currently locked in Crypto MMF Investments).`, 
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
          paymentMessage: `Crypto Exchange: Purchased ${amount} ${symbol} at $${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
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
      const lockedAmount = getLockedAmount(symbol);
      const unlockedHolding = coinHolding - lockedAmount;
      if (unlockedHolding < amount) {
        setTradeMessage({ 
          text: `Insufficient unlocked ${symbol} balance. You hold ${coinHolding} ${symbol} (${lockedAmount} ${symbol} is currently locked in Crypto MMF Investments) but tried to sell ${amount} ${symbol}.`, 
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
          paymentMessage: `Crypto Exchange: Sold ${amount} ${symbol} at $${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
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
  const [swapMessageState, setSwapMessageState] = useState<{ text: string; isError: boolean } | null>(null);
  const setSwapMessage = (msg: { text: string; isError: boolean } | null) => {
    setSwapMessageState(msg);
    if (msg) {
      if (msg.isError) toast.error(msg.text, 'Swap Error');
      else toast.success(msg.text, 'Swap Successful');
    }
  };
  const swapMessage = swapMessageState;

  const BOT_TEMPLATES = [
    {
      id: 'dca_accumulator',
      name: 'DCA Smart Accumulator',
      category: 'FREE',
      winRatioRange: '98%',
      winProfitRange: '1.0% - 1.8%',
      lossPercentRange: '0.3% - 0.8%',
      riskLevel: 'Very Low Risk',
      minCapital: 25,
      tradingPairs: DEFAULT_BOT_TRADING_PAIRS,
      color: 'from-blue-500 to-indigo-500'
    },
    {
      id: 'arb_sniper',
      name: 'Arbitrage Flash-Loan Sniper',
      category: 'PREMIUM',
      winRatioRange: '95%',
      winProfitRange: '1.5% - 2.5%',
      lossPercentRange: '0.4% - 1.4%',
      riskLevel: 'Low Risk',
      minCapital: 50,
      tradingPairs: DEFAULT_BOT_TRADING_PAIRS,
      color: 'from-amber-500 to-yellow-500'
    },
    {
      id: 'grid_scalper',
      name: 'AI Grid Scalper Pro',
      category: 'PREMIUM',
      winRatioRange: '90%',
      winProfitRange: '1.2% - 2.0%',
      lossPercentRange: '0.5% - 1.2%',
      riskLevel: 'Medium Risk',
      minCapital: 100,
      tradingPairs: DEFAULT_BOT_TRADING_PAIRS,
      color: 'from-emerald-500 to-teal-500'
    },
    {
      id: 'quantum_momentum',
      name: 'Quantum Momentum Scalper',
      category: 'FREE',
      winRatioRange: '85%',
      winProfitRange: '2.0% - 4.5%',
      lossPercentRange: '1.0% - 2.5%',
      riskLevel: 'High Risk',
      minCapital: 250,
      tradingPairs: DEFAULT_BOT_TRADING_PAIRS,
      color: 'from-purple-500 to-pink-500'
    }
  ];

  const getTemplateMinCapital = (tmpl: any): number => {
    if (!tmpl) return 25;
    const val = tmpl.minCapital ?? tmpl.min_capital ?? tmpl.minDeposit ?? tmpl.minimumCapital ?? tmpl.min_deposit ?? tmpl.capital ?? tmpl.minCapitalAmount;
    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val);
      if (!isNaN(num) && num > 0) return num;
    }
    if ((tmpl.category || '').toUpperCase() === 'PREMIUM') return 50;
    return 25;
  };

  const handleDeployBot = async () => {
    if (!selectedBotTemplate) return;
    const capital = parseFloat(botCapitalInput);
    const minRequired = getTemplateMinCapital(selectedBotTemplate);
    if (isNaN(capital) || capital < minRequired) {
      toast.error(`Minimum capital requirement for ${selectedBotTemplate.name} is $${minRequired}`, 'Invalid Capital');
      return;
    }
    const currentBalance = profile?.balance || 0;
    if (capital > currentBalance) {
      toast.error(`Insufficient USD wallet balance ($${currentBalance.toFixed(2)} available). Please deposit funds first.`, 'Insufficient Funds');
      return;
    }

    setBotDeployLoading(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const newBalance = currentBalance - capital;
      await updateDoc(userRef, { balance: newBalance });

      const winRatioRange = selectedBotTemplate.winRatioRange || '95%';
      const winProfitRange = selectedBotTemplate.winProfitRange || '1.5% - 2.5%';
      const lossPercentRange = selectedBotTemplate.lossPercentRange || '0.4% - 1.4%';

      const docRef = await addDoc(collection(db, 'user_bots'), {
        userId: user.uid,
        userEmail: user.email,
        templateId: selectedBotTemplate.id,
        name: selectedBotTemplate.name,
        category: selectedBotTemplate.category || 'Trading Bot',
        tradingPair: botSelectedPair || (selectedBotTemplate.tradingPairs?.[0] || 'BTC/USDT'),
        durationSeconds: botDurationSeconds,
        durationMinutes: parseFloat((botDurationSeconds / 60).toFixed(2)),
        capital: capital,
        coinSymbol: botCoinInput || 'USDT',
        accruedProfit: 0,
        status: 'RUNNING',
        winRatioRange,
        winProfitRange,
        lossPercentRange,
        wins: 0,
        losses: 0,
        totalTrades: 0,
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        userEmail: user.email,
        type: 'bot_capital_deployment',
        title: 'Bot Capital Allocation',
        amount: capital,
        status: 'APPROVED',
        coinSymbol: botCoinInput,
        paymentMessage: `Auto Bot trade: Deployed ${selectedBotTemplate.name} with $${capital}`,
        createdAt: serverTimestamp()
      });

      const newlyDeployedBot = {
        id: docRef.id,
        userId: user.uid,
        userEmail: user.email,
        templateId: selectedBotTemplate.id,
        name: selectedBotTemplate.name,
        category: selectedBotTemplate.category || 'Trading Bot',
        tradingPair: botSelectedPair || (selectedBotTemplate.tradingPairs?.[0] || 'BTC/USDT'),
        durationSeconds: botDurationSeconds,
        durationMinutes: parseFloat((botDurationSeconds / 60).toFixed(2)),
        capital: capital,
        coinSymbol: botCoinInput || 'USDT',
        accruedProfit: 0,
        status: 'RUNNING',
        winRatioRange,
        winProfitRange,
        lossPercentRange,
        wins: 0,
        losses: 0,
        totalTrades: 0,
        createdAt: new Date()
      };

      toast.success(`Successfully deployed ${selectedBotTemplate.name} with $${capital}!`, 'Bot Deployed');
      setSelectedBotTemplate(null);
      setBotCapitalInput('');
      setBotDeployLoading(false);
      setActiveRunningBot(newlyDeployedBot);
    } catch (err: any) {
      console.error("Error deploying bot:", err);
      toast.error(err.message || 'Failed to deploy bot', 'Deployment Error');
      setBotDeployLoading(false);
    }
  };

  const handleHarvestBotProfit = async (bot: any) => {
    const profitEarned = Math.max(1.5, parseFloat((bot.capital * 0.02 * (Math.random() * 0.8 + 0.6)).toFixed(2)));
    try {
      const userRef = doc(db, 'users', user.uid);
      const currentBalance = profile?.balance || 0;
      await updateDoc(userRef, { balance: currentBalance + profitEarned });

      const botRef = doc(db, 'user_bots', bot.id);
      await updateDoc(botRef, { accruedProfit: (bot.accruedProfit || 0) + profitEarned });

      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        userEmail: user.email,
        type: 'investment_earning',
        amount: profitEarned,
        status: 'APPROVED',
        coinSymbol: bot.coinSymbol || 'USDT',
        paymentMessage: `Harvested profit from ${bot.name}`,
        createdAt: serverTimestamp()
      });

      toast.success(`Successfully harvested $${profitEarned.toFixed(2)} profit to your wallet!`, 'Profit Harvested');
    } catch (err: any) {
      console.error("Error harvesting bot profit:", err);
      toast.error('Failed to harvest profit', 'Error');
    }
  };

  const handleToggleBotStatus = async (bot: any) => {
    try {
      const newStatus = bot.status === 'RUNNING' ? 'PAUSED' : 'RUNNING';
      const botRef = doc(db, 'user_bots', bot.id);
      await updateDoc(botRef, { status: newStatus });
      toast.success(`Bot status updated to ${newStatus}`, 'Bot Updated');
    } catch (err: any) {
      console.error("Error updating bot status:", err);
      toast.error('Failed to update bot status', 'Error');
    }
  };

  const handleStopBot = async (bot: any) => {
    const capital = bot.capital || 0;
    const accruedProfit = bot.accruedProfit || 0;
    const totalReturnAmount = capital + accruedProfit;
    try {
      const userRef = doc(db, 'users', user.uid);
      const currentBalance = profile?.balance || 0;
      await updateDoc(userRef, { balance: currentBalance + totalReturnAmount });

      const botRef = doc(db, 'user_bots', bot.id);
      await updateDoc(botRef, { status: 'STOPPED', capital: 0, accruedProfit: 0 });

      if (accruedProfit !== 0) {
        const isProfit = accruedProfit > 0;
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          userEmail: user.email,
          type: 'bot_harvest',
          title: `${bot.name} ${isProfit ? 'Profit Harvest' : 'Loss Deduction'}`,
          tradingPair: bot.tradingPair || 'BTC/USDT',
          botName: bot.name,
          amount: Math.abs(accruedProfit),
          profitDelta: accruedProfit,
          isWin: isProfit,
          status: isProfit ? 'WIN' : 'LOSS',
          paymentMessage: `Bot ${bot.name} stopped: ${isProfit ? `Harvested +$${accruedProfit.toFixed(2)} USDT profit` : `Net loss -$${Math.abs(accruedProfit).toFixed(2)} USDT`}`,
          createdAt: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        userEmail: user.email,
        type: 'bot_capital_return',
        title: 'Bot Capital Return',
        amount: capital,
        status: 'APPROVED',
        coinSymbol: bot.coinSymbol || 'USDT',
        paymentMessage: `Auto Bot trade: Stopped ${bot.name} & returned $${capital.toFixed(2)} capital`,
        createdAt: serverTimestamp()
      });

      toast.success(`Bot stopped. $${totalReturnAmount.toFixed(2)} returned to your wallet.`, 'Bot Stopped');
    } catch (err: any) {
      console.error("Error stopping bot:", err);
      toast.error('Failed to stop bot', 'Error');
    }
  };

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
    const lockedAmount = getLockedAmount(tradeFrom);
    const unlockedHolding = fromHolding - lockedAmount;

    if (unlockedHolding < amt) {
      setSwapMessage({
        text: `Insufficient unlocked ${tradeFrom} balance. You hold ${fromHolding} ${tradeFrom} (${lockedAmount} ${tradeFrom} is currently locked in Crypto MMF Investments) but tried to swap ${amt} ${tradeFrom}.`,
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
        amount: amt * (fromCoin ? fromCoin.price : 0), 
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
    const cacheKey = `${liveCoin.symbol}-${chartTimeframe}`;
    const candles = candlesCache[cacheKey] || generateCandleData(liveCoin.price, liveCoin.change24h, chartTimeframe);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const range = max - min || 1;
    
    // We increase chart SVG height to 200 for a much more premium look and feel
    const getY = (val: number) => {
      return 200 - ((val - min) / range) * 145 - 25; // padding top 25, bottom 25
    };

    const displayedCandle = hoveredCandle || candles[candles.length - 1];
    const holding = getCoinHolding(liveCoin.symbol);
    const usdVal = holding * liveCoin.price;

    // High fidelity financial stats simulation based on the active live price
    const getSimulatedStats = (symbol: string, price: number) => {
      const sym = symbol.toUpperCase();
      let volume = "";
      let mcap = "";
      
      if (sym === 'BTC') {
        volume = "$32.48B";
        mcap = "$1.85T";
      } else if (sym === 'ETH') {
        volume = "$15.82B";
        mcap = "$417.6B";
      } else if (sym === 'SOL') {
        volume = "$4.12B";
        mcap = "$86.3B";
      } else if (sym === 'BNB') {
        volume = "$1.65B";
        mcap = "$88.1B";
      } else if (sym === 'USDT' || sym === 'USDC') {
        volume = "$52.10B";
        mcap = sym === 'USDT' ? "$114.5B" : "$32.2B";
      } else if (sym === 'XRP') {
        volume = "$2.95B";
        mcap = "$144.2B";
      } else if (sym === 'WLD') {
        volume = "$340.5M";
        mcap = "$1.12B";
      } else if (sym === 'TRX') {
        volume = "$210.8M";
        mcap = "$19.4B";
      } else if (sym === 'DOGE') {
        volume = "$1.45B";
        mcap = "$54.8B";
      } else {
        const seed = sym.charCodeAt(0) + sym.charCodeAt(sym.length - 1);
        const volVal = (price * 12000000) * (0.85 + (seed % 10) / 20);
        const mcapVal = (price * 450000000) * (0.9 + (seed % 7) / 15);
        
        if (volVal >= 1e9) volume = `$${(volVal / 1e9).toFixed(2)}B`;
        else if (volVal >= 1e6) volume = `$${(volVal / 1e6).toFixed(2)}M`;
        else volume = `$${volVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

        if (mcapVal >= 1e9) mcap = `$${(mcapVal / 1e9).toFixed(2)}B`;
        else if (mcapVal >= 1e6) mcap = `$${(mcapVal / 1e6).toFixed(2)}M`;
        else mcap = `$${mcapVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      }
      return { volume, mcap };
    };

    const { volume: vol24h, mcap: mcap24h } = getSimulatedStats(liveCoin.symbol, liveCoin.price);

    return (
      <div 
        id="coin-detail-page-root" 
        className={`min-h-screen font-sans pb-16 animate-fade-in ${
          isLightTheme ? 'bg-[#FFF3D6] text-zinc-800' : 'bg-slate-900 text-zinc-100'
        }`}
      >
        {/* Top Header */}
        <header className={`px-4 py-4 border-b sticky top-0 backdrop-blur-md z-20 flex items-center gap-3 ${
          isLightTheme ? 'bg-[#FFF3D6]/85 border-zinc-200/80' : 'bg-slate-900/85 border-slate-800'
        }`}>
          <button 
            id="coin-detail-back-btn"
            onClick={() => {
              setSelectedCoin(null);
              setHoveredCandle(null);
            }}
            className={`p-2.5 rounded-full transition-all cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 ${
              isLightTheme 
                ? 'bg-[#FFF8E1] border border-amber-300/80 text-amber-600 hover:text-amber-700 hover:border-amber-400' 
                : 'bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white'
            }`}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center border ${
              isLightTheme ? 'bg-[#FFF8E1] border-amber-300/80' : 'bg-slate-800 border border-slate-700'
            }`}>
              <CoinIcon symbol={liveCoin.symbol} className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight flex items-center gap-1.5">
                <span className={isLightTheme ? 'text-zinc-800' : 'text-zinc-100'}>{liveCoin.name}</span>
                <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                  isLightTheme 
                    ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                    : 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50'
                }`}>
                  {liveCoin.symbol}
                </span>
              </h2>
              <p className="text-[9px] text-zinc-500 font-extrabold tracking-widest uppercase mt-0.5 select-none">REAL-TIME TRADING PAIR</p>
            </div>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 mt-5 space-y-5">
          {/* Price Display */}
          <div className={`flex justify-between items-center select-none p-4 rounded-2xl border ${
            isLightTheme 
              ? 'bg-[#FFF8E1] border-amber-300/90 shadow-[0_0_10px_rgba(245,158,11,0.08)]' 
              : 'bg-slate-950/40 border-slate-850'
          }`}>
            <div>
              <span className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-widest block">LAST TRADED PRICE</span>
              <h3 className={`text-3xl font-black font-mono tracking-tight mt-1 flex items-baseline gap-1 ${
                isLightTheme ? 'text-zinc-800' : 'text-zinc-100'
              }`}>
                <span>${liveCoin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                <span className="text-xs text-zinc-500 font-bold uppercase font-mono">USDT</span>
              </h3>
            </div>
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black ${
              liveCoin.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {liveCoin.change24h >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{liveCoin.change24h >= 0 ? '+' : ''}{liveCoin.change24h.toFixed(2)}%</span>
            </div>
          </div>

          {/* Candlestick OHLC Stat Header */}
          <div className={`grid grid-cols-4 gap-1.5 p-2.5 border rounded-xl select-none text-center ${
            isLightTheme 
              ? 'bg-[#FFF8E1] border-amber-300/90 shadow-[0_0_10px_rgba(245,158,11,0.08)]' 
              : 'bg-slate-950 border-slate-850'
          }`}>
            <div className={`p-1.5 rounded-lg border ${
              isLightTheme ? 'bg-[#FFF8E1]/80 border-amber-200/60' : 'bg-slate-900/40 border-slate-850/50'
            }`}>
              <span className="text-[8px] text-zinc-500 font-extrabold uppercase tracking-wider block">Open</span>
              <span className={`text-[10px] font-mono font-bold block mt-0.5 leading-none ${displayedCandle.close >= displayedCandle.open ? "text-emerald-400" : "text-red-400"}`}>
                ${displayedCandle.open.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
            </div>
            <div className={`p-1.5 rounded-lg border ${
              isLightTheme ? 'bg-[#FFF8E1]/80 border-amber-200/60' : 'bg-slate-900/40 border-slate-850/50'
            }`}>
              <span className="text-[8px] text-zinc-500 font-extrabold uppercase tracking-wider block">High</span>
              <span className={`text-[10px] font-mono font-bold block mt-0.5 leading-none ${
                isLightTheme ? 'text-zinc-800' : 'text-zinc-200'
              }`}>
                ${displayedCandle.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
            </div>
            <div className={`p-1.5 rounded-lg border ${
              isLightTheme ? 'bg-[#FFF8E1]/80 border-amber-200/60' : 'bg-slate-900/40 border-slate-850/50'
            }`}>
              <span className="text-[8px] text-zinc-500 font-extrabold uppercase tracking-wider block">Low</span>
              <span className={`text-[10px] font-mono font-bold block mt-0.5 leading-none ${
                isLightTheme ? 'text-zinc-800' : 'text-zinc-200'
              }`}>
                ${displayedCandle.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
            </div>
            <div className={`p-1.5 rounded-lg border ${
              isLightTheme ? 'bg-[#FFF8E1]/80 border-amber-200/60' : 'bg-slate-900/40 border-slate-850/50'
            }`}>
              <span className="text-[8px] text-zinc-500 font-extrabold uppercase tracking-wider block">Close</span>
              <span className={`text-[10px] font-mono font-bold block mt-0.5 leading-none ${displayedCandle.close >= displayedCandle.open ? "text-emerald-400" : "text-red-400"}`}>
                ${displayedCandle.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
            </div>
          </div>

          {/* Vector Candlestick Chart */}
          <div className={`p-4 border rounded-2xl space-y-4 relative overflow-hidden ${
            isLightTheme 
              ? 'bg-[#FFF8E1] border-amber-300/90 shadow-[0_0_10px_rgba(245,158,11,0.08)]' 
              : 'bg-slate-950 border-slate-850'
          }`}>
            <div className="flex justify-between items-center select-none">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider">Live Candlestick Trend</span>
              </div>
              
              {/* Timeframe selector tabs */}
              <div className={`flex gap-1 p-0.5 rounded-lg border ${
                isLightTheme ? 'bg-[#FFF8E1]/80 border-amber-200' : 'bg-slate-900 border-slate-800'
              }`}>
                {(['1m', '5m', '1h', '4h'] as const).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setChartTimeframe(tf)}
                    className={`px-2 py-0.5 text-[9px] font-extrabold rounded-md transition-all uppercase cursor-pointer ${
                      chartTimeframe === tf 
                        ? (isLightTheme ? 'bg-amber-100 text-amber-800 shadow-xs border border-amber-200' : 'bg-slate-850 text-emerald-400 shadow-sm border border-slate-700/50') 
                        : (isLightTheme ? 'text-zinc-500 hover:text-zinc-700' : 'text-zinc-500 hover:text-zinc-300')
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Chart area */}
            <div className="w-full h-[200px] relative">
              <svg viewBox="0 0 350 200" className="w-full h-full overflow-visible">
                {/* Horizontal Grid lines */}
                <line x1="0" y1="25" x2="350" y2="25" stroke={isLightTheme ? "#fcd34d" : "#1e293b"} strokeOpacity={isLightTheme ? "0.35" : "0.5"} strokeDasharray="3 3" />
                <line x1="0" y1="100" x2="350" y2="100" stroke={isLightTheme ? "#fcd34d" : "#1e293b"} strokeOpacity={isLightTheme ? "0.35" : "0.5"} strokeDasharray="3 3" />
                <line x1="0" y1="175" x2="350" y2="175" stroke={isLightTheme ? "#fcd34d" : "#1e293b"} strokeOpacity={isLightTheme ? "0.35" : "0.5"} strokeDasharray="3 3" />

                {/* SVG Definitions for Gradients & Glow Filters */}
                <defs>
                  <linearGradient id="upCandleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#047857" />
                  </linearGradient>
                  <linearGradient id="downCandleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#b91c1c" />
                  </linearGradient>
                  <filter id="activeGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Horizontal Grid lines with price labels */}
                <g opacity="0.6">
                  <line x1="0" y1="25" x2="305" y2="25" stroke={isLightTheme ? "#d97706" : "#334155"} strokeOpacity={isLightTheme ? "0.2" : "0.35"} strokeDasharray="3 3" />
                  <text x="310" y="28" fill={isLightTheme ? "#b45309" : "#64748b"} fontSize="7" fontFamily="monospace" fontWeight="bold">
                    ${(min + ((200 - 25 - 25) / 145) * range).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                  </text>

                  <line x1="0" y1="100" x2="305" y2="100" stroke={isLightTheme ? "#d97706" : "#334155"} strokeOpacity={isLightTheme ? "0.2" : "0.35"} strokeDasharray="3 3" />
                  <text x="310" y="103" fill={isLightTheme ? "#b45309" : "#64748b"} fontSize="7" fontFamily="monospace" fontWeight="bold">
                    ${(min + ((200 - 100 - 25) / 145) * range).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                  </text>

                  <line x1="0" y1="175" x2="305" y2="175" stroke={isLightTheme ? "#d97706" : "#334155"} strokeOpacity={isLightTheme ? "0.2" : "0.35"} strokeDasharray="3 3" />
                  <text x="310" y="178" fill={isLightTheme ? "#b45309" : "#64748b"} fontSize="7" fontFamily="monospace" fontWeight="bold">
                    ${(min + ((200 - 175 - 25) / 145) * range).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                  </text>
                </g>

                {/* Vertical tracking crosshair line when hovering */}
                {hoveredCandle && (
                  <line
                    x1={15 + (candles.indexOf(hoveredCandle) / (candles.length - 1)) * 290}
                    y1="10"
                    x2={15 + (candles.indexOf(hoveredCandle) / (candles.length - 1)) * 290}
                    y2="190"
                    stroke="#475569"
                    strokeOpacity="0.7"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    pointerEvents="none"
                  />
                )}

                {/* Horizontal tracking intersection line when hovering */}
                {hoveredCandle && (
                  <line
                    x1="0"
                    y1={getY(hoveredCandle.close)}
                    x2="305"
                    y2={getY(hoveredCandle.close)}
                    stroke="#475569"
                    strokeOpacity="0.5"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    pointerEvents="none"
                  />
                )}

                {/* Live Real-time Price Horizontal Indicator Line (The requested Price Line) */}
                <line
                  x1="0"
                  y1={getY(liveCoin.price)}
                  x2="305"
                  y2={getY(liveCoin.price)}
                  stroke={liveCoin.change24h >= 0 ? "rgba(16, 185, 129, 0.65)" : "rgba(239, 68, 68, 0.65)"}
                  strokeWidth="1.25"
                  strokeDasharray="3 3"
                  className="animate-pulse"
                  pointerEvents="none"
                />

                {/* Pulsing target coordinate dot on live price line */}
                <circle
                  cx="305"
                  cy={getY(liveCoin.price)}
                  r="4"
                  fill={liveCoin.change24h >= 0 ? "#10b981" : "#ef4444"}
                  className="animate-ping"
                  pointerEvents="none"
                />
                <circle
                  cx="305"
                  cy={getY(liveCoin.price)}
                  r="2"
                  fill={liveCoin.change24h >= 0 ? "#34d399" : "#f87171"}
                  pointerEvents="none"
                />

                {/* Candlesticks & Volumes */}
                {candles.map((candle, i) => {
                  const cx = 15 + (i / (candles.length - 1)) * 290;
                  const yOpen = getY(candle.open);
                  const yClose = getY(candle.close);
                  const yHigh = getY(candle.high);
                  const yLow = getY(candle.low);
                  const isUp = candle.close >= candle.open;
                  const bodyWidth = 8;
                  const isActive = i === candles.length - 1;

                  // Volume bar height simulation
                  const volHeight = 10 + (Math.sin(i * 1.5) + 1.2) * 6;
                  const volY = 198 - volHeight;

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
                        fillOpacity={isUp ? 0.2 : 0.25}
                        className="hover:fill-opacity-40 transition-all duration-150"
                        rx="1"
                      />

                      {/* Wick / Shadow line */}
                      <line
                        x1={cx}
                        y1={yHigh}
                        x2={cx}
                        y2={yLow}
                        stroke={isUp ? "#10b981" : "#ef4444"}
                        strokeWidth="1.5"
                        className="group-hover/candle:stroke-white transition-colors"
                      />

                      {/* Candle body rect */}
                      <rect
                        x={cx - bodyWidth / 2}
                        y={Math.min(yOpen, yClose)}
                        width={bodyWidth}
                        height={Math.max(2.5, Math.abs(yOpen - yClose))}
                        fill={isUp ? "url(#upCandleGrad)" : "url(#downCandleGrad)"}
                        stroke={isUp ? "#059669" : "#b91c1c"}
                        strokeWidth="0.75"
                        rx="1.5"
                        filter={isActive ? "url(#activeGlow)" : undefined}
                        className={`transition-all duration-150 group-hover/candle:stroke-white group-hover/candle:brightness-110 ${isActive ? 'animate-pulse' : ''}`}
                      />

                      {/* Hover capture block */}
                      <rect
                        x={cx - bodyWidth}
                        y="0"
                        width={bodyWidth * 2}
                        height="200"
                        fill="transparent"
                      />
                    </g>
                  );
                })}

                {/* Interactive Tooltip showing exact OHLC values on hover */}
                {hoveredCandle && (() => {
                  const hIndex = candles.indexOf(hoveredCandle);
                  const cx = 15 + (hIndex / (candles.length - 1)) * 290;
                  const isLeftHalf = hIndex < candles.length / 2;
                  
                  // Position tooltip box horizontally. If left half, show on right; if right half, show on left.
                  const tx = isLeftHalf ? cx + 12 : cx - 127;
                  
                  // Position tooltip box vertically, bounding it within safe limits of the SVG canvas height.
                  const cy = getY(hoveredCandle.close);
                  const ty = Math.max(10, Math.min(105, cy - 42));
                  
                  const isUp = hoveredCandle.close >= hoveredCandle.open;
                  
                  return (
                    <g transform={`translate(${tx}, ${ty})`} pointerEvents="none" className="transition-all duration-75">
                      {/* Tooltip Background Card with rounded corners, backdrop feel, and color-coded indicator border */}
                      <rect 
                        width="115" 
                        height="84" 
                        rx="8" 
                        fill="#090d16" 
                        fillOpacity="0.96" 
                        stroke={isUp ? "#10b981" : "#ef4444"} 
                        strokeWidth="1.25" 
                      />
                      
                      {/* Header text */}
                      <text x="8" y="14" fill="#64748b" fontSize="7" fontWeight="900" fontFamily="monospace" letterSpacing="0.5">
                        CANDLE DETAILS
                      </text>
                      <text x="107" y="14" fill={isUp ? "#34d399" : "#f87171"} fontSize="7" fontWeight="900" fontFamily="monospace" textAnchor="end">
                        {isUp ? "▲ BULLISH" : "▼ BEARISH"}
                      </text>
                      
                      {/* Divider */}
                      <line x1="8" y1="18" x2="107" y2="18" stroke="#1e293b" strokeWidth="1" />
                      
                      {/* Open Row */}
                      <text x="8" y="28" fill="#94a3b8" fontSize="7" fontFamily="monospace" fontWeight="bold">OPEN:</text>
                      <text x="107" y="28" fill="#f1f5f9" fontSize="7" fontFamily="monospace" fontWeight="900" textAnchor="end">
                        ${hoveredCandle.open.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </text>

                      {/* High Row */}
                      <text x="8" y="38" fill="#94a3b8" fontSize="7" fontFamily="monospace" fontWeight="bold">HIGH:</text>
                      <text x="107" y="38" fill="#34d399" fontSize="7" fontFamily="monospace" fontWeight="900" textAnchor="end">
                        ${hoveredCandle.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </text>

                      {/* Low Row */}
                      <text x="8" y="48" fill="#94a3b8" fontSize="7" fontFamily="monospace" fontWeight="bold">LOW:</text>
                      <text x="107" y="48" fill="#f87171" fontSize="7" fontFamily="monospace" fontWeight="900" textAnchor="end">
                        ${hoveredCandle.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </text>

                      {/* Close Row */}
                      <text x="8" y="58" fill="#94a3b8" fontSize="7" fontFamily="monospace" fontWeight="bold">CLOSE:</text>
                      <text x="107" y="58" fill="#f1f5f9" fontSize="7" fontFamily="monospace" fontWeight="900" textAnchor="end">
                        ${hoveredCandle.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </text>

                      {/* Actual Candle Time Row */}
                      <text x="8" y="68" fill="#94a3b8" fontSize="7" fontFamily="monospace" fontWeight="bold">TIME:</text>
                      <text x="107" y="68" fill="#a7f3d0" fontSize="7" fontFamily="monospace" fontWeight="900" textAnchor="end">
                        {formatCandleTime(hoveredCandle.timestamp, chartTimeframe)}
                      </text>

                      {/* Simulated Volume Row */}
                      <text x="8" y="78" fill="#64748b" fontSize="6.5" fontFamily="monospace" fontWeight="bold">VOLUME:</text>
                      <text x="107" y="78" fill="#94a3b8" fontSize="6.5" fontFamily="monospace" fontWeight="bold" textAnchor="end">
                        {(hoveredCandle.volume || 100).toFixed(0)}k USDT
                      </text>
                    </g>
                  );
                })()}
              </svg>

              {/* Dynamic Floating Price Tag Bubble on right aligned with the live price line */}
              <div 
                className="absolute text-[8px] font-mono font-bold select-none pointer-events-none transition-all duration-300 px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1 border border-slate-700/50"
                style={{ 
                  right: '44px',
                  top: `${getY(liveCoin.price)}px`, 
                  transform: 'translateY(-50%)',
                  backgroundColor: liveCoin.change24h >= 0 ? 'rgba(6, 78, 59, 0.95)' : 'rgba(127, 29, 29, 0.95)',
                  borderColor: liveCoin.change24h >= 0 ? '#10b981' : '#ef4444',
                  color: '#ffffff'
                }}
              >
                <span className="relative flex h-1 w-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1 w-1 bg-white"></span>
                </span>
                <span>${liveCoin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
              </div>

              {/* Chart Labels */}
              <div className={`absolute top-1 left-2 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                isLightTheme 
                  ? 'text-zinc-600 bg-[#FFF8E1] border-amber-300/80' 
                  : 'text-zinc-500 bg-slate-950/80 border-slate-900'
              }`}>
                High: ${max.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={`absolute bottom-1 left-2 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                isLightTheme 
                  ? 'text-zinc-600 bg-[#FFF8E1] border-amber-300/80' 
                  : 'text-zinc-500 bg-slate-950/80 border-slate-900'
              }`}>
                Low: ${min.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* High Fidelity Financial Statistics Grid Card */}
          <div className="grid grid-cols-2 gap-2.5 select-none">
            <div className={`p-3.5 rounded-2xl flex flex-col justify-between border ${
              isLightTheme 
                ? 'bg-[#FFF8E1] border-amber-300/90 shadow-[0_0_10px_rgba(245,158,11,0.08)]' 
                : 'bg-slate-950/50 border-slate-850'
            }`}>
              <span className="text-[8px] text-zinc-500 font-extrabold uppercase tracking-wider block">24h Volume</span>
              <span className={`text-sm font-mono font-bold mt-1 block ${
                isLightTheme ? 'text-zinc-800' : 'text-zinc-200'
              }`}>
                {vol24h}
              </span>
            </div>
            <div className={`p-3.5 rounded-2xl flex flex-col justify-between border ${
              isLightTheme 
                ? 'bg-[#FFF8E1] border-amber-300/90 shadow-[0_0_10px_rgba(245,158,11,0.08)]' 
                : 'bg-slate-950/50 border-slate-850'
            }`}>
              <span className="text-[8px] text-zinc-500 font-extrabold uppercase tracking-wider block">Market Capitalization</span>
              <span className={`text-sm font-mono font-bold mt-1 block ${
                isLightTheme ? 'text-zinc-800' : 'text-zinc-200'
              }`}>
                {mcap24h}
              </span>
            </div>
          </div>

          {/* Holding Information banner */}
          <div className={`p-3.5 rounded-2xl flex justify-between items-center select-none border ${
            isLightTheme 
              ? 'bg-[#FFF8E1] border-amber-300/90 shadow-[0_0_10px_rgba(245,158,11,0.08)]' 
              : 'bg-slate-850/60 border-slate-750'
          }`}>
            <div>
              <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider block">Your Holdings</span>
              <span className={`text-xs font-bold font-mono mt-0.5 block ${
                isLightTheme ? 'text-zinc-700' : 'text-zinc-300'
              }`}>
                {holding.toLocaleString(undefined, {
                  minimumFractionDigits: liveCoin.symbol === 'BTC' || liveCoin.symbol === 'ETH' ? 6 : 2,
                  maximumFractionDigits: liveCoin.symbol === 'BTC' || liveCoin.symbol === 'ETH' ? 8 : 4
                })} {liveCoin.symbol}
                {getLockedAmount(liveCoin.symbol) > 0 && (
                  <span className="text-[9px] text-amber-600 block font-bold mt-1">
                    Available: {(holding - getLockedAmount(liveCoin.symbol)).toLocaleString(undefined, {
                      minimumFractionDigits: liveCoin.symbol === 'BTC' || liveCoin.symbol === 'ETH' ? 6 : 2,
                      maximumFractionDigits: liveCoin.symbol === 'BTC' || liveCoin.symbol === 'ETH' ? 8 : 4
                    })} {liveCoin.symbol} (Locked: {getLockedAmount(liveCoin.symbol).toLocaleString(undefined, {
                      minimumFractionDigits: liveCoin.symbol === 'BTC' || liveCoin.symbol === 'ETH' ? 6 : 2,
                      maximumFractionDigits: liveCoin.symbol === 'BTC' || liveCoin.symbol === 'ETH' ? 8 : 4
                    })})
                  </span>
                )}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider block">USDT VALUE</span>
              <span className="text-xs text-emerald-400 font-black font-mono mt-0.5 block">${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* BUY/SELL Interactive Form */}
          <div className={`space-y-4 pt-5 border-t ${
            isLightTheme ? 'border-amber-200/80' : 'border-slate-800'
          }`}>
            <div className="flex justify-between items-center select-none">
              <span className={`text-xs font-black uppercase tracking-wider ${
                isLightTheme ? 'text-zinc-700' : 'text-zinc-300'
              }`}>Trading Desk</span>
              <span className="text-[10px] text-zinc-500 font-bold">
                Available: ${Math.max(0, getCoinHolding('USDT') - getLockedAmount('USDT')).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT
                {getLockedAmount('USDT') > 0 && ` ($${getCoinHolding('USDT').toLocaleString(undefined, { minimumFractionDigits: 2 })} total)`}
              </span>
            </div>

            {/* BUY / SELL Switch tabs */}
            <div className={`grid grid-cols-2 p-1 border rounded-xl gap-1 ${
              isLightTheme ? 'bg-[#FFF8E1] border-amber-300/90 shadow-[0_0_10px_rgba(245,158,11,0.08)]' : 'bg-slate-950 border-slate-850'
            }`}>
              <button
                type="button"
                onClick={() => {
                  setQuickTradeType('BUY');
                  setTradeMessage(null);
                }}
                className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  quickTradeType === 'BUY'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                    : isLightTheme
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50 hover:bg-emerald-100 hover:text-emerald-700'
                      : 'bg-emerald-950/20 text-emerald-400 border border-emerald-900/10 hover:bg-emerald-900/20 hover:text-emerald-300'
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
                    ? 'bg-red-500 text-white shadow-md shadow-red-500/10'
                    : isLightTheme
                      ? 'bg-red-50 text-red-600 border border-red-200/50 hover:bg-red-100 hover:text-red-700'
                      : 'bg-red-950/20 text-red-400 border border-red-900/10 hover:bg-red-900/20 hover:text-red-300'
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
                          const availableSpend = Math.max(0, getCoinHolding('USDT') - getLockedAmount('USDT'));
                          const spend = availableSpend * (pct / 100);
                          setQuickTradeAmount(parseFloat((spend / liveCoin.price).toFixed(6)).toString());
                        } else {
                          const lockedCoin = getLockedAmount(liveCoin.symbol);
                          const unlockedHolding = Math.max(0, holding - lockedCoin);
                          const sellAmt = unlockedHolding * (pct / 100);
                          setQuickTradeAmount(parseFloat(sellAmt.toFixed(6)).toString());
                        }
                        setTradeMessage(null);
                      }}
                      className={`px-1.5 py-0.5 text-[8px] font-bold rounded active:scale-95 cursor-pointer border ${
                        isLightTheme 
                          ? 'text-zinc-600 bg-[#FFF8E1] border-amber-300/80 hover:text-amber-700 hover:bg-amber-100' 
                          : 'text-zinc-400 bg-slate-950 border border-slate-850 hover:text-white'
                      }`}
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
                  className={`w-full p-3.5 pr-20 border rounded-2xl text-xs focus:outline-none font-mono transition-all ${
                    isLightTheme ? 'bg-[#FFF8E1] text-zinc-800' : 'bg-slate-950 text-white'
                  } ${
                    quickTradeType === 'BUY'
                      ? isLightTheme
                        ? 'border-amber-300/90 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/10'
                        : 'border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20'
                      : isLightTheme
                        ? 'border-amber-300/90 focus:border-red-500 focus:ring-1 focus:ring-red-500/10'
                        : 'border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
                  }`}
                />
                <span className="absolute right-4 top-3.5 text-xs text-zinc-500 font-bold font-mono uppercase">{liveCoin.symbol}</span>
              </div>

              {/* Calculated estimated value subtext */}
              {quickTradeAmount && parseFloat(quickTradeAmount) > 0 && (
                <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono px-1">
                  <span>Estimated Value:</span>
                  <span className={`font-bold ${isLightTheme ? 'text-zinc-700' : 'text-zinc-300'}`}>
                    $ {((parseFloat(quickTradeAmount) || 0) * liveCoin.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>
              )}
            </div>



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

  // Calculate MMF Earn totals
  const activeInvs = activeInvestments.filter((inv: any) => inv.status === 'active');
  const totalInvestedUSD = activeInvs.reduce((sum: number, inv: any) => {
    const liveCoin = cryptoPrices.find((c: any) => c.symbol === inv.coinSymbol);
    return sum + inv.amount * (liveCoin ? liveCoin.price : 0);
  }, 0);

  const totalDailyProfitUSD = activeInvs.reduce((sum: number, inv: any) => {
    const liveCoin = cryptoPrices.find((c: any) => c.symbol === inv.coinSymbol);
    const dailyEarningCoin = inv.amount * (inv.dailyRate / 100);
    return sum + dailyEarningCoin * (liveCoin ? liveCoin.price : 0);
  }, 0);

  const isHideHeader = 
    Boolean(arbitrageGuideCoin) || 
    Boolean(activeRunningBot) || 
    (activeTab === 'trade' && botHubView !== 'menu');

  const isHideFooter = 
    isHideHeader || 
    (activeTab === 'earn' && mmfSubView === 'form');

  return (
    <div 
      id="user-dashboard-root" 
      className={`min-h-screen font-sans transition-colors duration-300 ${
        isHideFooter ? 'pb-10' : 'pb-28'
      } ${
        isLightTheme ? 'bg-[#FFF3D6] text-zinc-800' : 'bg-slate-900 text-zinc-100'
      }`}
    >
      {/* Top Header */}
      {!isHideHeader && (
        <header className={`px-4 py-4 border-b sticky top-0 backdrop-blur-md z-20 flex justify-between items-center transition-colors duration-300 ${
          isLightTheme 
            ? 'bg-[#FFF3D6]/85 border-zinc-200/80' 
            : 'bg-slate-900/85 border-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <button 
              id="profile-toggle-btn"
              onClick={onOpenProfile}
              className={`w-12 h-12 rounded-full p-[1.5px] hover:scale-105 active:scale-95 transition-all duration-300 group cursor-pointer relative ${
                isLightTheme
                  ? 'bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-500 shadow-[0_0_12px_rgba(245,158,11,0.15)] hover:shadow-[0_0_16px_rgba(245,158,11,0.3)]'
                  : 'bg-gradient-to-tr from-emerald-400 via-teal-500 to-indigo-500 shadow-[0_0_12px_rgba(16,185,129,0.15)] hover:shadow-[0_0_16px_rgba(16,185,129,0.3)]'
              }`}
            >
              <div className={`w-full h-full rounded-full flex items-center justify-center transition-all relative overflow-hidden ${
                isLightTheme ? 'bg-white text-amber-500 group-hover:text-amber-600' : 'bg-slate-900 text-emerald-400 group-hover:text-white'
              }`}>
                <div className="absolute z-10">
                  <User size={14} className="group-hover:scale-110 transition-transform duration-300" />
                </div>
                <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-[spin_12s_linear_infinite] group-hover:animate-[spin_6s_linear_infinite] transition-all duration-500 pointer-events-none">
                  <defs>
                    <path
                      id="dashboardHeaderProfileCirclePath"
                      d="M 50,50 m -36,0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0"
                    />
                  </defs>
                  <text className={`text-[9.5px] font-black uppercase tracking-[0.16em] transition-colors duration-300 ${
                    isLightTheme ? 'fill-amber-500/70 group-hover:fill-amber-600' : 'fill-emerald-400/70 group-hover:fill-emerald-300'
                  }`}>
                    <textPath href="#dashboardHeaderProfileCirclePath" startOffset="0%">
                      PROFILE • PROFILE • PROFILE 
                    </textPath>
                  </text>
                </svg>
              </div>
            </button>
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLightTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>Logged In</span>
              <span className={`text-xs font-black tracking-tight transition-colors duration-300 ${isLightTheme ? 'text-zinc-800' : 'text-zinc-200'}`}>
                {profile?.displayName || user.displayName || user.email.split('@')[0]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="dashboard-logout-btn"
              onClick={onLogout}
              className={`px-3 py-1.5 border text-[10px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                isLightTheme
                  ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600'
                  : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/25 text-rose-400 hover:text-rose-300'
              }`}
              title="Log Out"
            >
              <LogOut size={11} />
              <span>LOG OUT</span>
            </button>
          </div>
        </header>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
          <RefreshCw size={28} className={`${isLightTheme ? 'text-amber-500' : 'text-emerald-500'} animate-spin`} />
          <span className="text-xs text-zinc-500 font-semibold">Decrypting wallet keys...</span>
        </div>
      ) : (
        <main className={`max-w-4xl mx-auto px-4 space-y-6 ${arbitrageGuideCoin || activeRunningBot ? 'pt-4' : 'mt-5'}`}>
          {activeRunningBot ? (
            <RunningBotView
              bot={activeRunningBot}
              user={user}
              userBalance={profile?.balance || 0}
              isLightTheme={isLightTheme}
              isOffline={isUsingFallbackPrices || Boolean(pricesLoadError) || (typeof navigator !== 'undefined' && !navigator.onLine)}
              onBack={() => setActiveRunningBot(null)}
              onTradeAgain={(botToRestart) => {
                setActiveRunningBot(null);
                const matchedTemplate = botTemplates.find((t: any) => t.id === botToRestart?.templateId) || {
                  id: botToRestart?.templateId || 'bot-template',
                  name: botToRestart?.name || 'Trading Bot',
                  category: botToRestart?.category || 'Trading Bot',
                  minCapital: botToRestart?.capital || 20,
                  tradingPairs: [botToRestart?.tradingPair || 'BTC/USDT'],
                  winRatioRange: '80% - 95%',
                  riskLevel: 'Moderate'
                };
                setSelectedBotTemplate(matchedTemplate);
                setBotCapitalInput((botToRestart?.capital || matchedTemplate.minCapital || 20).toString());
                setBotSelectedPair(botToRestart?.tradingPair || matchedTemplate.tradingPairs[0] || 'BTC/USDT');
                setBotDurationSeconds(botToRestart?.durationSeconds || 60);
              }}
              onGoToHistory={() => {
                setActiveRunningBot(null);
                setActiveTab('history');
              }}
            />
          ) : (
            <>
          {pricesLoadError && (
            <div className={`flex items-start gap-2.5 p-3.5 border rounded-2xl text-[11px] font-medium leading-relaxed shadow-lg animate-fade-in transition-colors duration-300 ${
              isLightTheme
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
              <AlertCircle size={15} className={`shrink-0 mt-0.5 ${activeTab === 'home' ? 'text-amber-600' : 'text-amber-400'}`} />
              <div className="flex-1">
                <span className="font-bold">Offline Rates Active: </span>
                {pricesLoadError}
              </div>
            </div>
          )}
          
          {arbitrageGuideCoin ? (() => {
            const liveGuideCoin = cryptoPrices.find(c => c.symbol === arbitrageGuideCoin.symbol);
            const currentGuidePrice = liveGuideCoin ? liveGuideCoin.price : arbitrageGuideCoin.price;
            const guidePriceRatio = arbitrageGuideCoin.price > 0 ? currentGuidePrice / arbitrageGuideCoin.price : 1;
            const currentExtMin = arbitrageGuideCoin.extMin * guidePriceRatio;
            const currentExtMax = arbitrageGuideCoin.extMax * guidePriceRatio;
            const currentAvgExt = (currentExtMin + currentExtMax) / 2;
            const currentSpread = Math.max(0, currentGuidePrice - currentAvgExt);
            const currentSpreadPct = currentAvgExt > 0 ? (currentSpread / currentAvgExt) * 100 : arbitrageGuideCoin.spreadPct;

            return (
              <div className="space-y-6 animate-fade-in pb-10">
                {/* Top Navigation / Back Header */}
                <div className="flex items-center gap-3 border-b pb-4 border-zinc-200/80 dark:border-zinc-700/80">
                  <button
                    onClick={() => setArbitrageGuideCoin(null)}
                    className={`p-2.5 rounded-xl font-black transition-all cursor-pointer shadow-xs flex items-center justify-center ${
                      isLightTheme 
                        ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-200/80' 
                        : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                    }`}
                    title="Back to Dashboard"
                  >
                    <ArrowLeft size={18} />
                  </button>

                  <h2 className={`text-sm sm:text-base font-black uppercase tracking-wider ${
                    isLightTheme ? 'text-zinc-900' : 'text-white'
                  }`}>
                    ⚡ {arbitrageGuideCoin.symbol} ARBITRAGE GUIDE
                  </h2>
                </div>

                {/* Coin Dedicated Header - Matches Arbitrage Card Theme */}
                <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${
                  isLightTheme 
                    ? 'bg-[#FFF8E1] border-amber-300/90 shadow-md' 
                    : 'bg-slate-900/40 border-slate-850/70'
                }`}>
                  <div className="flex items-center gap-4">
                    <CoinIcon symbol={arbitrageGuideCoin.symbol} className="w-12 h-12 rounded-full shrink-0 shadow-xs" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className={`text-lg sm:text-xl font-black tracking-tight ${isLightTheme ? 'text-zinc-900' : 'text-white'}`}>
                          {arbitrageGuideCoin.name} ({arbitrageGuideCoin.symbol})
                        </h1>
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          isLightTheme ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        }`}>
                          +{currentSpreadPct.toFixed(2)}% Spread
                        </span>
                      </div>
                      <p className={`text-xs font-medium mt-0.5 ${isLightTheme ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        Dedicated Arbitrage Trading Tutorial & Market Rate Spread
                      </p>
                    </div>
                  </div>

                  {/* Price badges comparison row */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
                      isLightTheme ? 'bg-rose-500/10 border-rose-200' : 'bg-rose-500/10 border-rose-500/20'
                    }`}>
                      <span className={`block text-[9px] font-extrabold uppercase tracking-wider mb-1 ${
                        isLightTheme ? 'text-black' : 'text-black font-extrabold bg-white/90 px-1 rounded-[3px] inline-block w-fit'
                      }`}>
                        Price in Binance, OKX, Bybit
                      </span>
                      <span className={`font-black font-mono text-xs ${isLightTheme ? 'text-rose-700' : 'text-rose-300'}`}>
                        ${currentExtMin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} - ${currentExtMax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </span>
                    </div>

                    <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
                      isLightTheme ? 'bg-emerald-500/10 border-emerald-300' : 'bg-emerald-500/10 border-emerald-500/20'
                    }`}>
                      <span className={`block text-[9px] font-extrabold uppercase tracking-wider mb-1 ${
                        isLightTheme ? 'text-black' : 'text-black font-extrabold bg-white/90 px-1 rounded-[3px] inline-block w-fit'
                      }`}>
                        Price here
                      </span>
                      <span className={`font-black font-mono text-xs ${isLightTheme ? 'text-emerald-700' : 'text-emerald-300'}`}>
                        ${currentGuidePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Step-by-Step Tutorial Guide */}
                <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${
                  isLightTheme ? 'bg-white border-zinc-200/80 shadow-md' : 'bg-slate-800 border-slate-700/80'
                }`}>
                  <div className="flex items-center gap-2 border-b pb-3 border-zinc-200/60 dark:border-zinc-700/60">
                    <BookOpen className="text-amber-500 shrink-0" size={18} />
                    <div>
                      <h2 className={`text-sm sm:text-base font-black uppercase tracking-wide ${isLightTheme ? 'text-zinc-900' : 'text-white'}`}>
                        STEPS TO FOLLOW
                      </h2>
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    {/* Step 1 */}
                    <div className={`p-3.5 rounded-2xl border space-y-1.5 ${
                      isLightTheme ? 'bg-zinc-50 border-zinc-200/80' : 'bg-slate-900/60 border-slate-700/60'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          isLightTheme ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-slate-950'
                        }`}>1</span>
                        <h3 className={`text-xs font-black ${isLightTheme ? 'text-zinc-900' : 'text-white'}`}>
                          Acquire {arbitrageGuideCoin.symbol} on External Exchanges
                        </h3>
                      </div>
                      <p className={`text-xs leading-relaxed pl-8 ${isLightTheme ? 'text-zinc-600' : 'text-zinc-300'}`}>
                        Purchase <strong className="font-bold">{arbitrageGuideCoin.name} ({arbitrageGuideCoin.symbol})</strong> on major exchanges like <strong className="font-bold">{arbitrageGuideCoin.platforms.join(', ')}</strong> where it trades lower at <strong className="font-bold">${currentExtMin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} – ${currentExtMax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong>.
                      </p>
                    </div>

                    {/* Step 2 */}
                    <div className={`p-3.5 rounded-2xl border space-y-1.5 ${
                      isLightTheme ? 'bg-zinc-50 border-zinc-200/80' : 'bg-slate-900/60 border-slate-700/60'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          isLightTheme ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-slate-950'
                        }`}>2</span>
                        <h3 className={`text-xs font-black ${isLightTheme ? 'text-zinc-900' : 'text-white'}`}>
                          Transfer {arbitrageGuideCoin.symbol} to Platform Wallet
                        </h3>
                      </div>
                      <p className={`text-xs leading-relaxed pl-8 ${isLightTheme ? 'text-zinc-600' : 'text-zinc-300'}`}>
                        Navigate to <strong className="font-bold">Wallet &gt; Deposit</strong> on this platform, choose <strong className="font-bold">{arbitrageGuideCoin.symbol}</strong>, copy your address, and transfer your tokens from your exchange account.
                      </p>
                    </div>

                    {/* Step 3 */}
                    <div className={`p-3.5 rounded-2xl border space-y-1.5 ${
                      isLightTheme ? 'bg-zinc-50 border-zinc-200/80' : 'bg-slate-900/60 border-slate-700/60'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          isLightTheme ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-slate-950'
                        }`}>3</span>
                        <h3 className={`text-xs font-black ${isLightTheme ? 'text-zinc-900' : 'text-white'}`}>
                          Sell at Premium Rate (${currentGuidePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })})
                        </h3>
                      </div>
                      <p className={`text-xs leading-relaxed pl-8 ${isLightTheme ? 'text-zinc-600' : 'text-zinc-300'}`}>
                        Once your deposit confirms, swap your <strong className="font-bold">{arbitrageGuideCoin.symbol}</strong> at our elevated platform rate of <strong className="font-bold text-emerald-600 dark:text-emerald-400">${currentGuidePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong> to capture your <strong className="font-bold text-amber-600 dark:text-amber-400">+{currentSpreadPct.toFixed(2)}% profit margin</strong>.
                      </p>
                    </div>

                    {/* Step 4 */}
                    <div className={`p-3.5 rounded-2xl border space-y-1.5 ${
                      isLightTheme ? 'bg-zinc-50 border-zinc-200/80' : 'bg-slate-900/60 border-slate-700/60'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          isLightTheme ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-slate-950'
                        }`}>4</span>
                        <h3 className={`text-xs font-black ${isLightTheme ? 'text-zinc-900' : 'text-white'}`}>
                          Instant Profit Settlement
                        </h3>
                      </div>
                      <p className={`text-xs leading-relaxed pl-8 ${isLightTheme ? 'text-zinc-600' : 'text-zinc-300'}`}>
                        Your profits are instantly credited to your wallet balance. Withdraw anytime or repeat the arbitrage sequence.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Floating Draggable Deposit Button */}
                <motion.button
                  drag
                  dragMomentum={false}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const sym = arbitrageGuideCoin?.symbol;
                    if (sym) {
                      sessionStorage.setItem('preselected_deposit_coin', sym);
                      localStorage.setItem('preselected_deposit_coin', sym);
                    }
                    setArbitrageGuideCoin(null);
                    onOpenDeposit(sym);
                  }}
                  className={`fixed bottom-8 right-6 z-50 px-5 py-3.5 rounded-2xl font-black text-xs sm:text-sm shadow-2xl flex items-center gap-2.5 cursor-grab active:cursor-grabbing border select-none ${
                    isLightTheme 
                      ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-400/80 shadow-amber-500/30' 
                      : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 border-emerald-400/80 shadow-emerald-500/30'
                  }`}
                >
                  <Sparkles size={16} className="animate-pulse shrink-0" />
                  <span>Deposit {arbitrageGuideCoin.symbol} Now</span>
                </motion.button>
              </div>
            );
          })() : (
            <>
              {/* TAB 1: HOME */}
          {activeTab === 'home' && (
            <>
              {/* Search Bar */}
              <div className="relative">
                <span className={`absolute inset-y-0 left-0 flex items-center pl-3.5 transition-colors ${activeTab === 'home' ? 'text-zinc-400' : 'text-zinc-500'}`}>
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
                        setSearchQuery('');
                      }
                    }
                  }}
                  className={`w-full pl-9 pr-10 py-2.5 border rounded-xl text-xs focus:outline-none transition-all duration-300 ${
                    activeTab === 'home' 
                      ? 'bg-white border-zinc-200/80 text-zinc-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/25 placeholder-zinc-400 shadow-xs' 
                      : 'bg-slate-800 border-slate-700/80 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 placeholder-zinc-600'
                  }`}
                />
                {searchQuery && (
                  <button
                    id="clear-search-btn"
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className={`absolute inset-y-0 right-0 flex items-center pr-3.5 cursor-pointer transition-colors ${
                      activeTab === 'home' ? 'text-zinc-400 hover:text-zinc-700' : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Clear Search"
                  >
                    <X size={14} />
                  </button>
                )}

                {/* Floating Search Dropdown overlay */}
                {searchQuery.trim() !== '' && (
                  <div className={`absolute left-0 right-0 mt-1.5 rounded-2xl border shadow-2xl z-50 max-h-72 overflow-y-auto ${
                    isLightTheme
                      ? 'bg-white border-zinc-200/95 text-zinc-800 shadow-amber-500/10'
                      : 'bg-slate-900 border-slate-750 text-white shadow-black/40'
                  }`}>
                    {filteredCrypto.length > 0 ? (
                      <div className="p-1.5 flex flex-col gap-0.5">
                        <div className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 ${
                          isLightTheme ? 'text-zinc-400 border-b border-zinc-100' : 'text-zinc-500 border-b border-slate-800/80'
                        }`}>
                          Search Results ({filteredCrypto.length})
                        </div>
                        {filteredCrypto.map(coin => (
                          <div
                            key={coin.symbol}
                            onClick={() => {
                              setSelectedCoin(coin);
                              setTradeMessage(null);
                              setQuickTradeAmount('');
                              setQuickTradeType('BUY');
                              setSearchQuery('');
                            }}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                              isLightTheme
                                ? 'hover:bg-amber-500/10 text-zinc-800 hover:text-amber-900'
                                : 'hover:bg-slate-850 text-zinc-200 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <CoinIcon symbol={coin.symbol} className="w-7 h-7 shrink-0" />
                              <div className="min-w-0">
                                <span className="font-bold text-xs block truncate leading-tight">{coin.name}</span>
                                <span className={`text-[9px] font-extrabold uppercase tracking-wider block mt-0.5 ${
                                  isLightTheme ? 'text-zinc-400' : 'text-zinc-500'
                                }`}>{coin.symbol}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-xs font-mono block leading-tight">
                                ${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </span>
                              <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold mt-0.5 ${
                                coin.change24h >= 0 
                                  ? (isLightTheme ? 'text-emerald-600' : 'text-emerald-400') 
                                  : (isLightTheme ? 'text-rose-600' : 'text-rose-400')
                              }`}>
                                {coin.change24h >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                <span>{coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-5 text-center flex flex-col items-center justify-center gap-1">
                        <span className={`text-xs font-bold ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>No tokens found</span>
                        <span className={`text-[10px] ${isLightTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>Try searching for Bitcoin, Ethereum, Tether, etc.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Wallet Card */}
              <div id="wallet-balance-card" className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-500 p-6 text-white shadow-xl shadow-amber-500/10">
                {/* Micro Ambient Details */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -ml-10 -mb-10" />

                <div className="flex justify-between items-start select-none">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Wallet Balance</span>
                      <button
                        onClick={() => setIsBalanceBlurred(!isBalanceBlurred)}
                        className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
                        title={isBalanceBlurred ? "Reveal balance" : "Hide balance"}
                      >
                        {isBalanceBlurred ? <EyeOff size={13} strokeWidth={2.5} /> : <Eye size={13} strokeWidth={2.5} />}
                      </button>
                    </div>
                    <h2 className={`text-3xl font-black tracking-tight font-mono mt-1 transition-all duration-300 ${
                      isBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                    }`}>
                      $ {totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h2>
                    <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-bold transition-all duration-300 ${
                      isBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                    }`}>
                      {portfolioDailyChange.isPositive ? (
                        <span className="flex items-center gap-1 text-amber-100 bg-amber-700/30 px-2 py-0.5 rounded-full border border-amber-400/20 shadow-sm">
                          <TrendingUp size={11} className="text-amber-300 shrink-0" />
                          <span>+${Math.abs(portfolioDailyChange.diffUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[9px] opacity-85 font-medium shrink-0">({portfolioDailyChange.pctChange.toFixed(2)}% today)</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-100 bg-rose-700/30 px-2 py-0.5 rounded-full border border-rose-400/20 shadow-sm">
                          <TrendingDown size={11} className="text-rose-300 shrink-0" />
                          <span>-${Math.abs(portfolioDailyChange.diffUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[9px] opacity-85 font-medium shrink-0">({portfolioDailyChange.pctChange.toFixed(2)}% today)</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-white border border-white/20 text-[9px] font-black uppercase tracking-wider text-black shadow-sm">
                    USDT WALLET
                  </div>
                </div>

                {/* Deposit & Withdraw Prominent Buttons */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-6">
                  <button
                    id="add-funds-btn"
                    onClick={onOpenDeposit}
                    className="flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-2 sm:px-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-white font-extrabold text-[11px] sm:text-xs rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer min-w-0"
                  >
                    <ArrowDownLeft size={15} strokeWidth={3} className="text-white shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="whitespace-nowrap truncate">Add Funds</span>
                  </button>

                  <button
                    id="withdraw-funds-btn"
                    onClick={onOpenWithdraw}
                    className="flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-2 sm:px-4 bg-white hover:bg-zinc-100 border border-white/20 text-slate-950 font-extrabold text-[11px] sm:text-xs rounded-2xl transition-all shadow-sm active:scale-95 cursor-pointer min-w-0"
                  >
                    <ArrowUpRight size={15} strokeWidth={3} className="text-slate-950 shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="whitespace-nowrap truncate">Withdraw</span>
                  </button>
                </div>
              </div>

              {/* News slideshow */}
              <NewsCarousel cryptoPrices={cryptoPrices} />

              {/* Live Crypto Prices container with search bar */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className={`text-xs font-black uppercase tracking-wider transition-colors duration-300 ${activeTab === 'home' ? 'text-zinc-500' : 'text-zinc-400'}`}>CRYPTO MARKET</h3>
                  <span className={`text-[10px] font-semibold transition-colors duration-300 ${activeTab === 'home' ? 'text-zinc-400' : 'text-zinc-500'}`}>Live Feed</span>
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
                      className={`border rounded-2xl p-3.5 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 cursor-pointer group flex flex-col justify-between gap-3 min-h-[105px] ${
                        activeTab === 'home'
                          ? 'bg-[#FFF8E1] border-amber-300/90 hover:border-amber-400 hover:bg-[#FFF8E1]/80 shadow-[0_0_10px_rgba(245,158,11,0.08)]'
                          : 'bg-slate-800/60 border-slate-750 hover:bg-slate-800/90'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CoinIcon symbol={coin.symbol} className="w-8 h-8" />
                          <div className="min-w-0">
                            <span className={`font-bold text-xs block truncate transition-colors duration-300 ${
                              activeTab === 'home' ? 'text-zinc-800 group-hover:text-amber-500' : 'text-zinc-200 group-hover:text-white'
                            }`}>{coin.name}</span>
                            <span className={`text-[10px] uppercase tracking-wider font-semibold block transition-colors duration-300 ${
                              activeTab === 'home' ? 'text-zinc-400' : 'text-zinc-500'
                            }`}>{coin.symbol}</span>
                          </div>
                        </div>
                        <div className={`transition-colors duration-300 shrink-0 ${
                          activeTab === 'home' ? 'text-zinc-300 group-hover:text-amber-500' : 'text-zinc-600 group-hover:text-emerald-400'
                        }`}>
                          <ArrowRight size={13} className="transform group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>

                      <div className="flex items-end justify-between">
                        <div>
                          <span className={`font-bold text-xs font-mono block transition-colors duration-300 ${
                            activeTab === 'home' ? 'text-zinc-800' : 'text-zinc-200'
                          }`}>
                            ${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </span>
                        </div>
                        <div className={`flex items-center gap-0.5 text-[10px] font-bold shrink-0 transition-colors duration-300 ${
                          coin.change24h >= 0 
                            ? (activeTab === 'home' ? 'text-emerald-600' : 'text-emerald-400') 
                            : (activeTab === 'home' ? 'text-rose-600' : 'text-rose-400')
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
              <div id="wallet-tab-balance-card" className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-500 p-6 text-white shadow-xl shadow-amber-500/10">
                {/* Micro Ambient Details */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -ml-10 -mb-10" />

                <div className="flex justify-between items-start select-none">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Wallet Balance</span>
                      <button
                        onClick={() => setIsBalanceBlurred(!isBalanceBlurred)}
                        className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
                        title={isBalanceBlurred ? "Reveal balance" : "Hide balance"}
                      >
                        {isBalanceBlurred ? <EyeOff size={13} strokeWidth={2.5} /> : <Eye size={13} strokeWidth={2.5} />}
                      </button>
                    </div>
                    <h2 className={`text-3xl font-black tracking-tight font-mono mt-1 transition-all duration-300 ${
                      isBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                    }`}>
                      $ {totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h2>
                    <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-bold transition-all duration-300 ${
                      isBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                    }`}>
                      {portfolioDailyChange.isPositive ? (
                        <span className="flex items-center gap-1 text-amber-100 bg-amber-700/30 px-2 py-0.5 rounded-full border border-amber-400/20 shadow-sm">
                          <TrendingUp size={11} className="text-amber-300 shrink-0" />
                          <span>+${Math.abs(portfolioDailyChange.diffUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[9px] opacity-85 font-medium shrink-0">({portfolioDailyChange.pctChange.toFixed(2)}% today)</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-100 bg-rose-700/30 px-2 py-0.5 rounded-full border border-rose-400/20 shadow-sm">
                          <TrendingDown size={11} className="text-rose-300 shrink-0" />
                          <span>-${Math.abs(portfolioDailyChange.diffUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[9px] opacity-85 font-medium shrink-0">({portfolioDailyChange.pctChange.toFixed(2)}% today)</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-white border border-white/20 text-[9px] font-black uppercase tracking-wider text-black shadow-sm">
                    USDT WALLET
                  </div>
                </div>

                {/* Deposit, SEND & Withdraw Prominent Buttons */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3 mt-6">
                  <button
                    id="add-funds-btn-wallet-tab"
                    onClick={onOpenDeposit}
                    className="flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3 px-1.5 sm:px-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-white font-extrabold text-[10.5px] sm:text-xs rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer min-w-0 tracking-tight"
                  >
                    <ArrowDownLeft strokeWidth={3} className="text-white shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="whitespace-nowrap truncate">Add Funds</span>
                  </button>

                  <button
                    id="send-funds-btn-wallet-tab"
                    onClick={onOpenSend}
                    className="flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3 px-1.5 sm:px-3 bg-amber-500 hover:bg-amber-600 border border-amber-400 text-white font-extrabold text-[10.5px] sm:text-xs rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer min-w-0 tracking-tight"
                  >
                    <Send strokeWidth={2.5} className="text-white shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="whitespace-nowrap truncate">SEND</span>
                  </button>

                  <button
                    id="withdraw-funds-btn-wallet-tab"
                    onClick={onOpenWithdraw}
                    className="flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3 px-1.5 sm:px-3 bg-white hover:bg-zinc-100 border border-white/20 text-slate-950 font-extrabold text-[10.5px] sm:text-xs rounded-2xl transition-all shadow-sm active:scale-95 cursor-pointer min-w-0 tracking-tight"
                  >
                    <ArrowUpRight strokeWidth={3} className="text-slate-950 shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="whitespace-nowrap truncate">Withdraw</span>
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
                    <div className={`w-full h-full ${isLightTheme ? 'bg-zinc-200' : 'bg-slate-800'}`} />
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
                        className={`flex flex-col p-4 border rounded-2xl hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer group ${
                          isLightTheme 
                            ? 'bg-[#FFF8E1] border-amber-300/90 hover:border-amber-400 hover:bg-[#FFF8E1]/80 shadow-[0_0_10px_rgba(245,158,11,0.08)]' 
                            : 'bg-slate-800/80 border-slate-700/65 hover:border-slate-500 hover:bg-slate-800/95'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <CoinIcon symbol={asset.symbol} className="w-10 h-10" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold text-xs transition-colors ${isLightTheme ? 'text-zinc-800 group-hover:text-amber-500' : 'text-zinc-200 group-hover:text-white'}`}>{asset.name}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                  isLightTheme 
                                    ? 'text-zinc-600 bg-zinc-100 border-zinc-200' 
                                    : 'text-zinc-400 bg-slate-900 border-slate-800'
                                }`}>
                                  {assetPct.toFixed(1)}%
                                </span>
                              </div>
                              <span className={`text-[10px] font-mono mt-0.5 block ${isLightTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                1 {asset.symbol} ≈ ${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className={`font-extrabold text-xs block font-mono ${isLightTheme ? 'text-zinc-800' : 'text-zinc-100'}`}>
                                {asset.coinAmount.toLocaleString(undefined, {
                                  minimumFractionDigits: asset.symbol === 'BTC' || asset.symbol === 'ETH' ? 6 : 2,
                                  maximumFractionDigits: asset.symbol === 'BTC' || asset.symbol === 'ETH' ? 8 : 4
                                })} {asset.symbol}
                              </span>
                              <span className="text-[10px] font-extrabold text-emerald-600 font-mono block mt-0.5">
                                $ {asset.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            <div className={`transition-colors ${isLightTheme ? 'text-zinc-300 group-hover:text-amber-500' : 'text-zinc-600 group-hover:text-emerald-400'}`}>
                              <ArrowRight size={14} className="transform group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        </div>

                        {asset.lockedAmount > 0 && (
                          <div className={`mt-3 pt-2.5 border-t flex justify-between items-center text-[10px] font-mono ${isLightTheme ? 'border-zinc-200/60' : 'border-slate-700/40'}`}>
                            <div className={`flex items-center gap-1 font-bold ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              <Unlock size={11} className={`${isLightTheme ? 'text-emerald-600' : 'text-emerald-400'} shrink-0`} />
                              <span>Free:</span>
                              <span className={`${isLightTheme ? 'text-emerald-600' : 'text-emerald-400'} font-extrabold`}>
                                {asset.unlockedAmount.toLocaleString(undefined, {
                                  minimumFractionDigits: asset.symbol === 'BTC' || asset.symbol === 'ETH' ? 4 : 2,
                                  maximumFractionDigits: 6
                                })} {asset.symbol}
                              </span>
                            </div>
                            <div className={`flex items-center gap-1 font-bold ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              <Lock size={11} className={`${isLightTheme ? 'text-amber-600' : 'text-amber-400'} shrink-0`} />
                              <span>Invested:</span>
                              <span className={`${isLightTheme ? 'text-amber-600' : 'text-amber-400'} font-extrabold`}>
                                {asset.lockedAmount.toLocaleString(undefined, {
                                  minimumFractionDigits: asset.symbol === 'BTC' || asset.symbol === 'ETH' ? 4 : 2,
                                  maximumFractionDigits: 6
                                })} {asset.symbol}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {userAssets.filter(asset => asset.coinAmount > 0).length === 0 && (
                    <div className={`text-center py-8 px-4 border rounded-2xl select-none ${
                      isLightTheme ? 'bg-zinc-50/50 border-zinc-200/60' : 'bg-slate-900/40 border-slate-800/80'
                    }`}>
                      <p className="text-zinc-500 text-xs font-semibold">Your asset holdings list is currently empty.</p>
                      <p className="text-zinc-400 text-[10px] mt-1.5 leading-relaxed max-w-[280px] mx-auto">
                        Please convert your available USD wallet balance, or choose a coin from the Market list on the home screen to buy it.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BOTS HUB */}
          {activeTab === 'trade' && (
            <div className="space-y-6 animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between pb-1 select-none">
                <div>
                  <h2 className={`text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2 ${
                    isLightTheme ? 'text-zinc-900' : 'text-white'
                  }`}>
                    <Bot className={isLightTheme ? 'text-amber-500' : 'text-emerald-400'} size={24} />
                    BOTS
                  </h2>
                  <p className={`text-xs mt-0.5 ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Automated trading bots & yield harvesting strategies
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {/* MAIN HUB MENU: 4 CARDS (Matching Blueprint Layout) */}
                  {botHubView === 'menu' && (
                    <div className="space-y-6 animate-fade-in">
                      {/* 2x2 Grid of 4 Cards */}
                      <div className="grid grid-cols-2 gap-3 sm:gap-4 select-none">
                        {/* 1. PREMIUM BOTS */}
                        <button
                          type="button"
                          onClick={() => setBotHubView('PREMIUM')}
                          className={`p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between group min-h-[155px] sm:min-h-[185px] select-none ${
                            isLightTheme 
                              ? 'bg-white border-amber-200/90 shadow-xs hover:shadow-xl hover:border-amber-400 hover:-translate-y-0.5' 
                              : 'bg-slate-800/95 border-slate-700 hover:border-amber-400/60 shadow-xs hover:-translate-y-0.5'
                          }`}
                        >
                          <div className="space-y-2 sm:space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-white flex items-center justify-center shadow-md shadow-amber-500/30 group-hover:scale-105 transition-transform duration-200">
                                <Crown size={18} className="sm:w-5 sm:h-5 drop-shadow-xs" />
                              </div>
                              <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border ${
                                isLightTheme ? 'bg-amber-100/90 text-amber-950 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}>
                                PRO
                              </span>
                            </div>

                            <div>
                              <h4 className={`text-xs sm:text-base font-black tracking-tight leading-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors ${
                                isLightTheme ? 'text-zinc-900' : 'text-white'
                              }`}>
                                Premium BOTS
                              </h4>
                              <p className={`text-[10px] sm:text-xs mt-0.5 font-medium line-clamp-1 ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                High-yield automated strategies
                              </p>
                            </div>
                          </div>

                          <div className={`pt-2.5 sm:pt-3 border-t flex items-center justify-between text-[10px] sm:text-xs font-bold gap-1 ${
                            isLightTheme ? 'border-zinc-100 text-amber-700' : 'border-slate-700/80 text-amber-400'
                          }`}>
                            <span className="truncate">
                              {(botTemplates.length > 0 ? botTemplates : BOT_TEMPLATES).filter(t => (t.category || '').toUpperCase() === 'PREMIUM' || (!t.category || t.category.toUpperCase() !== 'FREE')).length} Available
                            </span>
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                              isLightTheme 
                                ? 'bg-amber-100/80 text-amber-800 group-hover:bg-amber-500 group-hover:text-white shadow-xs' 
                                : 'bg-amber-500/20 text-amber-300 group-hover:bg-amber-500 group-hover:text-white'
                            }`}>
                              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        </button>

                        {/* 2. FREE BOTS */}
                        <button
                          type="button"
                          onClick={() => setBotHubView('FREE')}
                          className={`p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between group min-h-[155px] sm:min-h-[185px] select-none ${
                            isLightTheme 
                              ? 'bg-white border-emerald-200/90 shadow-xs hover:shadow-xl hover:border-emerald-400 hover:-translate-y-0.5' 
                              : 'bg-slate-800/95 border-slate-700 hover:border-emerald-400/60 shadow-xs hover:-translate-y-0.5'
                          }`}
                        >
                          <div className="space-y-2 sm:space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-emerald-500 to-emerald-400 text-white flex items-center justify-center shadow-md shadow-emerald-500/30 group-hover:scale-105 transition-transform duration-200">
                                <Gift size={18} className="sm:w-5 sm:h-5 drop-shadow-xs" />
                              </div>
                              <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border ${
                                isLightTheme ? 'bg-emerald-100/90 text-emerald-950 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}>
                                FREE
                              </span>
                            </div>

                            <div>
                              <h4 className={`text-xs sm:text-base font-black tracking-tight leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors ${
                                isLightTheme ? 'text-zinc-900' : 'text-white'
                              }`}>
                                Free BOTS
                              </h4>
                              <p className={`text-[10px] sm:text-xs mt-0.5 font-medium line-clamp-1 ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                Starter trading algorithms
                              </p>
                            </div>
                          </div>

                          <div className={`pt-2.5 sm:pt-3 border-t flex items-center justify-between text-[10px] sm:text-xs font-bold gap-1 ${
                            isLightTheme ? 'border-zinc-100 text-emerald-700' : 'border-slate-700/80 text-emerald-400'
                          }`}>
                            <span className="truncate">
                              {(botTemplates.length > 0 ? botTemplates : BOT_TEMPLATES).filter(t => (t.category || '').toUpperCase() === 'FREE').length} Available
                            </span>
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                              isLightTheme 
                                ? 'bg-emerald-100/80 text-emerald-800 group-hover:bg-emerald-500 group-hover:text-white shadow-xs' 
                                : 'bg-emerald-500/20 text-emerald-300 group-hover:bg-emerald-500 group-hover:text-white'
                            }`}>
                              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        </button>

                        {/* 3. HISTORY */}
                        <button
                          type="button"
                          onClick={() => setBotHubView('HISTORY')}
                          className={`p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between group min-h-[155px] sm:min-h-[185px] select-none ${
                            isLightTheme 
                              ? 'bg-white border-indigo-200/90 shadow-xs hover:shadow-xl hover:border-indigo-400 hover:-translate-y-0.5' 
                              : 'bg-slate-800/95 border-slate-700 hover:border-indigo-400/60 shadow-xs hover:-translate-y-0.5'
                          }`}
                        >
                          <div className="space-y-2 sm:space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-400 text-white flex items-center justify-center shadow-md shadow-indigo-500/30 group-hover:scale-105 transition-transform duration-200">
                                <History size={18} className="sm:w-5 sm:h-5 drop-shadow-xs" />
                              </div>
                              <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border ${
                                isLightTheme ? 'bg-indigo-100/90 text-indigo-950 border-indigo-300' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                              }`}>
                                LOGS
                              </span>
                            </div>

                            <div>
                              <h4 className={`text-xs sm:text-base font-black tracking-tight leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors ${
                                isLightTheme ? 'text-zinc-900' : 'text-white'
                              }`}>
                                Bot History
                              </h4>
                              <p className={`text-[10px] sm:text-xs mt-0.5 font-medium line-clamp-1 ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                Profit & execution records
                              </p>
                            </div>
                          </div>

                          <div className={`pt-2.5 sm:pt-3 border-t flex items-center justify-between text-[10px] sm:text-xs font-bold gap-1 ${
                            isLightTheme ? 'border-zinc-100 text-indigo-700' : 'border-slate-700/80 text-indigo-400'
                          }`}>
                            <span className="truncate">
                              {userTransactions.filter(tx => tx.type === 'Auto Bot trade' || tx.type === 'bot_harvest' || tx.type === 'bot_trade' || (tx.type && tx.type.toLowerCase().includes('bot')) || (tx.title && tx.title.toLowerCase().includes('bot'))).length} Logs<span className="hidden sm:inline"> Recorded</span>
                            </span>
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                              isLightTheme 
                                ? 'bg-indigo-100/80 text-indigo-800 group-hover:bg-indigo-500 group-hover:text-white shadow-xs' 
                                : 'bg-indigo-500/20 text-indigo-300 group-hover:bg-indigo-500 group-hover:text-white'
                            }`}>
                              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        </button>

                        {/* 4. MY BOTS */}
                        <button
                          type="button"
                          onClick={() => setBotHubView('MY_BOTS')}
                          className={`p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between group min-h-[155px] sm:min-h-[185px] select-none ${
                            isLightTheme 
                              ? 'bg-white border-blue-200/90 shadow-xs hover:shadow-xl hover:border-blue-400 hover:-translate-y-0.5' 
                              : 'bg-slate-800/95 border-slate-700 hover:border-blue-400/60 shadow-xs hover:-translate-y-0.5'
                          }`}
                        >
                          <div className="space-y-2 sm:space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-blue-500 to-blue-400 text-white flex items-center justify-center shadow-md shadow-blue-500/30 group-hover:scale-105 transition-transform duration-200">
                                <Bot size={18} className="sm:w-5 sm:h-5 drop-shadow-xs" />
                              </div>
                              <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border ${
                                isLightTheme ? 'bg-blue-100/90 text-blue-950 border-blue-300' : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              }`}>
                                ACTIVE
                              </span>
                            </div>

                            <div>
                              <h4 className={`text-xs sm:text-base font-black tracking-tight leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${
                                isLightTheme ? 'text-zinc-900' : 'text-white'
                              }`}>
                                My Active Bots
                              </h4>
                              <p className={`text-[10px] sm:text-xs mt-0.5 font-medium line-clamp-1 ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                Running bot instances
                              </p>
                            </div>
                          </div>

                          <div className={`pt-2.5 sm:pt-3 border-t flex items-center justify-between text-[10px] sm:text-xs font-bold gap-1 ${
                            isLightTheme ? 'border-zinc-100 text-blue-700' : 'border-slate-700/80 text-blue-400'
                          }`}>
                            <span className="truncate">{userBots.filter(b => b.status !== 'STOPPED').length} Active</span>
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                              isLightTheme 
                                ? 'bg-blue-100/80 text-blue-800 group-hover:bg-blue-500 group-hover:text-white shadow-xs' 
                                : 'bg-blue-500/20 text-blue-300 group-hover:bg-blue-500 group-hover:text-white'
                            }`}>
                              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUB-PAGE VIEWS */}
                  {botHubView !== 'menu' && (
                    <div className="space-y-5 animate-fade-in">
                      {/* Top Bar with Back Button & Category Badge */}
                      <div className="flex items-center justify-between select-none">
                        <button
                          type="button"
                          onClick={() => setBotHubView('menu')}
                          className={`group px-3.5 py-2 rounded-full border text-xs font-bold transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 ${
                            isLightTheme 
                              ? 'bg-white border-zinc-200/90 text-zinc-800 hover:bg-zinc-50 hover:border-amber-400/50' 
                              : 'bg-slate-900 border-slate-700/80 text-zinc-100 hover:bg-slate-850 hover:border-slate-600'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform group-hover:-translate-x-0.5 ${
                            isLightTheme ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/15 text-emerald-400'
                          }`}>
                            <ArrowLeft size={12} strokeWidth={2.5} />
                          </div>
                          <span>Back to Bots</span>
                        </button>

                        {botHubView === 'PREMIUM' && (
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-2xs transition-all ${
                            isLightTheme 
                              ? 'bg-gradient-to-r from-amber-500/10 via-amber-400/15 to-amber-500/10 text-amber-900 border-amber-300/80' 
                              : 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-300 border-amber-500/30'
                          }`}>
                            <Crown size={13} className={isLightTheme ? 'text-amber-600' : 'text-amber-400'} />
                            <span>Premium Category</span>
                          </div>
                        )}

                        {botHubView === 'FREE' && (
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-2xs transition-all ${
                            isLightTheme 
                              ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/80 text-emerald-900 border-emerald-300/80' 
                              : 'bg-gradient-to-r from-emerald-500/20 to-teal-600/10 text-emerald-300 border-emerald-500/30'
                          }`}>
                            <Gift size={13} className={isLightTheme ? 'text-emerald-600' : 'text-emerald-400'} />
                            <span>Free Category</span>
                          </div>
                        )}

                        {botHubView === 'HISTORY' && (
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-2xs transition-all ${
                            isLightTheme 
                              ? 'bg-gradient-to-r from-indigo-50 to-indigo-100/80 text-indigo-900 border-indigo-300/80' 
                              : 'bg-gradient-to-r from-indigo-500/20 to-violet-600/10 text-indigo-300 border-indigo-500/30'
                          }`}>
                            <History size={13} className={isLightTheme ? 'text-indigo-600' : 'text-indigo-400'} />
                            <span>Trade Logs</span>
                          </div>
                        )}

                        {botHubView === 'MY_BOTS' && (
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-2xs transition-all ${
                            isLightTheme 
                              ? 'bg-gradient-to-r from-blue-50 to-blue-100/80 text-blue-900 border-blue-300/80' 
                              : 'bg-gradient-to-r from-blue-500/20 to-cyan-600/10 text-blue-300 border-blue-500/30'
                          }`}>
                            <Bot size={13} className={isLightTheme ? 'text-blue-600' : 'text-blue-400'} />
                            <span>User Bots</span>
                          </div>
                        )}
                      </div>

                      {/* PAGE 1: PREMIUM BOTS */}
                      {botHubView === 'PREMIUM' && (
                        <div className={`border rounded-3xl p-5 space-y-4 ${
                          isLightTheme ? 'bg-white border-zinc-200/80 shadow-xs' : 'bg-slate-800 border-slate-700/80'
                        }`}>
                          <div className="flex justify-between items-center select-none">
                            <div>
                              <h3 className={`text-sm font-black tracking-tight flex items-center gap-1.5 ${isLightTheme ? 'text-zinc-800' : 'text-zinc-200'}`}>
                                <Crown size={18} className="text-amber-500" />
                                PREMIUM BOTS
                              </h3>
                              <p className={`text-xs mt-0.5 ${isLightTheme ? 'text-zinc-400' : 'text-zinc-400'}`}>
                                Exclusive high-yield algorithmic trading bots configured by admin.
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            {[...(botTemplates.length > 0 ? botTemplates : BOT_TEMPLATES)]
                              .sort((a, b) => getTemplateMinCapital(a) - getTemplateMinCapital(b))
                              .filter(tmpl => (tmpl.category || '').toUpperCase() === 'PREMIUM' || (!tmpl.category || tmpl.category.toUpperCase() !== 'FREE'))
                              .map((tmpl) => (
                                <div 
                                  key={tmpl.id}
                                  className={`p-4 sm:p-5 rounded-3xl border flex flex-col justify-between transition-all duration-300 space-y-4 relative overflow-hidden group ${
                                    isLightTheme 
                                      ? 'bg-gradient-to-br from-white via-amber-50/20 to-orange-50/30 border-amber-200/90 hover:border-amber-400 hover:shadow-xl hover:shadow-amber-500/10' 
                                      : 'bg-gradient-to-br from-slate-900/90 via-slate-850 to-slate-900 border-slate-700/80 hover:border-amber-500/60 hover:shadow-xl'
                                  }`}
                                >
                                  {/* Top accent shine line */}
                                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 opacity-80" />

                                  <div className="space-y-3.5">
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between gap-3 pt-1">
                                      <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/25 group-hover:scale-105 transition-transform duration-200">
                                          <Crown size={20} className="drop-shadow-xs" />
                                        </div>
                                        <div>
                                          <h4 className={`text-sm sm:text-base font-black tracking-tight leading-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors ${
                                            isLightTheme ? 'text-zinc-900' : 'text-white'
                                          }`}>
                                            {tmpl.name}
                                          </h4>
                                          <p className={`text-[10px] sm:text-xs mt-0.5 font-medium line-clamp-1 ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                            {tmpl.description || 'High-yield algorithmic flash-loan & scalp strategy'}
                                          </p>
                                        </div>
                                      </div>

                                      <span className={`px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-mono font-black uppercase tracking-wider shrink-0 border flex items-center gap-1 ${
                                        isLightTheme ? 'bg-amber-100/90 text-amber-950 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      }`}>
                                        <Crown size={10} className="text-amber-600" />
                                        PREMIUM
                                      </span>
                                    </div>

                                    {/* 2-Column Key Metrics Grid */}
                                    <div className="grid grid-cols-2 gap-2.5">
                                      <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
                                        isLightTheme ? 'bg-white/90 border-amber-100/80 shadow-2xs' : 'bg-slate-950/70 border-slate-800'
                                      }`}>
                                        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400">
                                          <TrendingUp size={13} className="text-emerald-500 shrink-0" />
                                          <span>Win Ratio</span>
                                        </div>
                                        <div className="mt-1 flex items-baseline gap-1">
                                          <span className="text-sm sm:text-base font-mono font-black text-emerald-600 dark:text-emerald-400">
                                            {tmpl.winRatioRange || '92-98%'}
                                          </span>
                                        </div>
                                      </div>

                                      <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
                                        isLightTheme ? 'bg-white/90 border-amber-100/80 shadow-2xs' : 'bg-slate-950/70 border-slate-800'
                                      }`}>
                                        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400">
                                          <Coins size={13} className="text-amber-500 shrink-0" />
                                          <span>Min Capital</span>
                                        </div>
                                        <div className="mt-1 flex items-baseline gap-1">
                                          <span className={`text-base sm:text-lg font-mono font-black ${
                                            isLightTheme ? 'text-zinc-950' : 'text-white'
                                          }`}>
                                            {getTemplateMinCapital(tmpl)}
                                          </span>
                                          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">USDT</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Risk & Execution Bar */}
                                    <div className={`px-3 py-2 rounded-xl border flex items-center justify-between text-[11px] font-bold ${
                                      isLightTheme ? 'bg-amber-50/50 border-amber-200/50 text-zinc-700' : 'bg-slate-900/50 border-slate-800 text-zinc-300'
                                    }`}>
                                      <div className="flex items-center gap-1.5">
                                        <ShieldCheck size={13} className="text-amber-500" />
                                        <span className="text-zinc-400 font-normal">Risk Profile:</span>
                                        <span className="font-mono font-black text-amber-700 dark:text-amber-300">
                                          {tmpl.riskLevel || 'Low Risk'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                                        <Zap size={11} className="text-amber-500 fill-amber-500/20" />
                                        <span>Auto Scalp</span>
                                      </div>
                                    </div>

                                    {/* Supported Trading Pairs Badges */}
                                    <div className="space-y-1.5 pt-1">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                        Trading Pairs
                                      </span>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {(tmpl.tradingPairs && tmpl.tradingPairs.length > 0 ? tmpl.tradingPairs : DEFAULT_BOT_TRADING_PAIRS).map((pairKey: string) => (
                                          <TradingPairBadge key={pairKey} pair={pairKey} isLightTheme={isLightTheme} size="sm" />
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedBotTemplate(tmpl);
                                        setBotCapitalInput(getTemplateMinCapital(tmpl).toString());
                                        const pairs = tmpl.tradingPairs || DEFAULT_BOT_TRADING_PAIRS;
                                        const defaultPair = pairs.find((p: string) => p.includes('XAU') || p.includes('Gold')) || 'XAU/USD';
                                        setBotSelectedPair(defaultPair);
                                        setBotDurationSeconds(60);
                                      }}
                                      className="w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2 shadow-md bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-amber-950 font-black shadow-amber-500/25 active:scale-[0.98]"
                                    >
                                      <Zap size={16} className="fill-current" />
                                      SET UP & RUN
                                    </button>
                                  </div>
                                </div>
                              ))}

                            {(botTemplates.length > 0 ? botTemplates : BOT_TEMPLATES)
                              .filter(tmpl => (tmpl.category || '').toUpperCase() === 'PREMIUM' || (!tmpl.category || tmpl.category.toUpperCase() !== 'FREE')).length === 0 && (
                                <div className="text-center py-12 px-4 border rounded-3xl select-none text-zinc-400 text-xs">
                                  No Premium category bots found.
                                </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* PAGE 2: FREE BOTS */}
                      {botHubView === 'FREE' && (
                        <div className={`border rounded-3xl p-5 space-y-4 ${
                          isLightTheme ? 'bg-white border-zinc-200/80 shadow-xs' : 'bg-slate-800 border-slate-700/80'
                        }`}>
                          <div className="flex justify-between items-center select-none">
                            <div>
                              <h3 className={`text-sm font-black tracking-tight flex items-center gap-1.5 ${isLightTheme ? 'text-zinc-800' : 'text-zinc-200'}`}>
                                <Gift size={18} className="text-emerald-500" />
                                FREE BOTS
                              </h3>
                              <p className={`text-xs mt-0.5 ${isLightTheme ? 'text-zinc-400' : 'text-zinc-400'}`}>
                                Free algorithmic trading bots available to all account tiers.
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            {[...(botTemplates.length > 0 ? botTemplates : BOT_TEMPLATES)]
                              .sort((a, b) => getTemplateMinCapital(a) - getTemplateMinCapital(b))
                              .filter(tmpl => (tmpl.category || '').toUpperCase() === 'FREE')
                              .map((tmpl) => (
                                <div 
                                  key={tmpl.id}
                                  className={`p-4 sm:p-5 rounded-3xl border flex flex-col justify-between transition-all duration-300 space-y-4 relative overflow-hidden group ${
                                    isLightTheme 
                                      ? 'bg-gradient-to-br from-white via-emerald-50/20 to-teal-50/30 border-emerald-200/90 hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/10' 
                                      : 'bg-gradient-to-br from-slate-900/90 via-slate-850 to-slate-900 border-slate-700/80 hover:border-emerald-500/60 hover:shadow-xl'
                                  }`}
                                >
                                  {/* Top accent shine line */}
                                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 opacity-80" />

                                  <div className="space-y-3.5">
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between gap-3 pt-1">
                                      <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 via-emerald-400 to-teal-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25 group-hover:scale-105 transition-transform duration-200">
                                          <Gift size={20} className="drop-shadow-xs" />
                                        </div>
                                        <div>
                                          <h4 className={`text-sm sm:text-base font-black tracking-tight leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors ${
                                            isLightTheme ? 'text-zinc-900' : 'text-white'
                                          }`}>
                                            {tmpl.name}
                                          </h4>
                                          <p className={`text-[10px] sm:text-xs mt-0.5 font-medium line-clamp-1 ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                            {tmpl.description || 'Automated low-risk Dollar-Cost Averaging strategy'}
                                          </p>
                                        </div>
                                      </div>

                                      <span className={`px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-mono font-black uppercase tracking-wider shrink-0 border flex items-center gap-1 ${
                                        isLightTheme ? 'bg-emerald-100/90 text-emerald-950 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      }`}>
                                        <Gift size={10} className="text-emerald-600" />
                                        FREE
                                      </span>
                                    </div>

                                    {/* 2-Column Key Metrics Grid */}
                                    <div className="grid grid-cols-2 gap-2.5">
                                      <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
                                        isLightTheme ? 'bg-white/90 border-emerald-100/80 shadow-2xs' : 'bg-slate-950/70 border-slate-800'
                                      }`}>
                                        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400">
                                          <TrendingUp size={13} className="text-emerald-500 shrink-0" />
                                          <span>Win Ratio</span>
                                        </div>
                                        <div className="mt-1 flex items-baseline gap-1">
                                          <span className="text-sm sm:text-base font-mono font-black text-emerald-600 dark:text-emerald-400">
                                            {tmpl.winRatioRange || '94-99%'}
                                          </span>
                                        </div>
                                      </div>

                                      <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
                                        isLightTheme ? 'bg-white/90 border-emerald-100/80 shadow-2xs' : 'bg-slate-950/70 border-slate-800'
                                      }`}>
                                        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400">
                                          <Coins size={13} className="text-amber-500 shrink-0" />
                                          <span>Min Capital</span>
                                        </div>
                                        <div className="mt-1 flex items-baseline gap-1">
                                          <span className={`text-base sm:text-lg font-mono font-black ${
                                            isLightTheme ? 'text-zinc-950' : 'text-white'
                                          }`}>
                                            {getTemplateMinCapital(tmpl)}
                                          </span>
                                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">USDT</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Risk & Execution Bar */}
                                    <div className={`px-3 py-2 rounded-xl border flex items-center justify-between text-[11px] font-bold ${
                                      isLightTheme ? 'bg-emerald-50/50 border-emerald-200/50 text-zinc-700' : 'bg-slate-900/50 border-slate-800 text-zinc-300'
                                    }`}>
                                      <div className="flex items-center gap-1.5">
                                        <ShieldCheck size={13} className="text-emerald-500" />
                                        <span className="text-zinc-400 font-normal">Risk Profile:</span>
                                        <span className="font-mono font-black text-emerald-700 dark:text-emerald-300">
                                          {tmpl.riskLevel || 'Very Low Risk'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                                        <Zap size={11} className="text-emerald-500 fill-emerald-500/20" />
                                        <span>Auto DCA</span>
                                      </div>
                                    </div>

                                    {/* Supported Trading Pairs Badges */}
                                    <div className="space-y-1.5 pt-1">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                        Trading Pairs
                                      </span>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {(tmpl.tradingPairs && tmpl.tradingPairs.length > 0 ? tmpl.tradingPairs : DEFAULT_BOT_TRADING_PAIRS).map((pairKey: string) => (
                                          <TradingPairBadge key={pairKey} pair={pairKey} isLightTheme={isLightTheme} size="sm" />
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedBotTemplate(tmpl);
                                        setBotCapitalInput(getTemplateMinCapital(tmpl).toString());
                                        const pairs = tmpl.tradingPairs || DEFAULT_BOT_TRADING_PAIRS;
                                        const defaultPair = pairs.find((p: string) => p.includes('XAU') || p.includes('Gold')) || 'XAU/USD';
                                        setBotSelectedPair(defaultPair);
                                        setBotDurationSeconds(60);
                                      }}
                                      className="w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2 shadow-md bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black shadow-emerald-500/25 active:scale-[0.98]"
                                    >
                                      <Zap size={16} className="fill-current" />
                                      SET UP & RUN
                                    </button>
                                  </div>
                                </div>
                              ))}

                            {(botTemplates.length > 0 ? botTemplates : BOT_TEMPLATES)
                              .filter(tmpl => (tmpl.category || '').toUpperCase() === 'FREE').length === 0 && (
                                <div className="text-center py-12 px-4 border rounded-3xl select-none text-zinc-400 text-xs">
                                  No Free category bots found.
                                </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* PAGE 3: HISTORY */}
                      {botHubView === 'HISTORY' && (() => {
                        // 1. Filter transactions to only trade profit/loss & harvest records
                        const explicitBotTrades = userTransactions.filter(tx => 
                          tx.type === 'bot_trade' || 
                          tx.type === 'bot_harvest' || 
                          (tx.profitDelta !== undefined) || 
                          (tx.isWin !== undefined)
                        ).map(tx => {
                          const isWin = tx.isWin !== undefined ? tx.isWin : (tx.status === 'WIN' || tx.amount >= 0);
                          const amt = tx.profitDelta !== undefined ? tx.profitDelta : tx.amount;
                          return {
                            id: tx.id,
                            botName: tx.botName || tx.title || 'Trading Bot',
                            tradingPair: tx.tradingPair || 'BTC/USDT',
                            amount: amt,
                            isWin: isWin,
                            status: isWin ? 'WIN' : 'LOSS',
                            profitPercent: tx.profitPercent || (isWin ? 1.8 : -0.8),
                            timestamp: tx.createdAt?.seconds 
                              ? new Date(tx.createdAt.seconds * 1000).toLocaleString() 
                              : typeof tx.createdAt === 'string' 
                                ? new Date(tx.createdAt).toLocaleString() 
                                : 'Recently executed',
                            rawDate: tx.createdAt?.seconds ? tx.createdAt.seconds * 1000 : Date.now()
                          };
                        });

                        // 2. Sort and slice to only the latest 5 trade logs
                        let botHistoryItems = explicitBotTrades.sort((a, b) => b.rawDate - a.rawDate);
                        if (botHistoryItems.length === 0 && userBots.length > 0) {
                          const derivedItems: any[] = [];
                          userBots.forEach(bot => {
                            const total = bot.totalTrades || (bot.accruedProfit !== undefined && bot.accruedProfit !== 0 ? 3 : 0);
                            const winsCount = bot.wins !== undefined ? bot.wins : Math.ceil(total * 0.75);
                            const capital = bot.capital || 50;
                            
                            for (let i = 0; i < total; i++) {
                              const isWin = i < winsCount;
                              const rate = isWin ? 0.018 : -0.008;
                              const delta = parseFloat((capital * rate).toFixed(2));
                              derivedItems.push({
                                id: `derived-${bot.id}-${i}`,
                                botName: bot.name || 'Trading Bot',
                                tradingPair: bot.tradingPair || 'BTC/USDT',
                                amount: isWin ? Math.abs(delta) : -Math.abs(delta),
                                isWin: isWin,
                                status: isWin ? 'WIN' : 'LOSS',
                                profitPercent: isWin ? 1.8 : -0.8,
                                timestamp: bot.createdAt?.seconds 
                                  ? new Date((bot.createdAt.seconds + i * 60) * 1000).toLocaleString() 
                                  : 'Recently executed',
                                rawDate: bot.createdAt?.seconds ? (bot.createdAt.seconds + i * 60) * 1000 : Date.now() - (total - i) * 60000
                              });
                            }
                          });
                          botHistoryItems = derivedItems.sort((a, b) => b.rawDate - a.rawDate);
                        }

                        // Summary metrics based on all trade logs
                        const totalNetPnL = botHistoryItems.reduce((acc, item) => acc + item.amount, 0);
                        const winCount = botHistoryItems.filter(item => item.isWin).length;
                        const winRate = botHistoryItems.length > 0 ? ((winCount / botHistoryItems.length) * 100).toFixed(1) : '0.0';

                        return (
                          <div className={`border rounded-3xl p-5 sm:p-6 space-y-5 shadow-md relative overflow-hidden transition-all ${
                            isLightTheme ? 'bg-white/95 border-zinc-200/90 shadow-zinc-200/50' : 'bg-slate-800/95 border-slate-700/80 shadow-slate-950/40'
                          }`}>
                            {/* Decorative background glow */}
                            <div className="absolute -top-20 -right-20 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

                            {/* Header Row */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none pb-1 relative z-10">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm shrink-0 ${
                                  isLightTheme ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-indigo-500/20' : 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-indigo-900/40'
                                }`}>
                                  <History size={20} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className={`text-base font-black tracking-tight ${isLightTheme ? 'text-zinc-900' : 'text-zinc-100'}`}>
                                      BOT TRADE HISTORY
                                    </h3>
                                  </div>
                                  <p className={`text-xs mt-0.5 font-medium ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                    Real-time execution log of trading bot profits & losses
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-start sm:self-auto">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                  isLightTheme ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                                }`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Live Ticker
                                </span>
                              </div>
                            </div>

                            {/* Summary Performance Cards */}
                            {botHistoryItems.length > 0 && (
                              <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 relative z-10">
                                {/* Net P&L Card */}
                                <div className={`p-3 sm:p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                                  isLightTheme 
                                    ? totalNetPnL >= 0 
                                      ? 'bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white border-emerald-200/90 shadow-xs' 
                                      : 'bg-gradient-to-br from-rose-50/80 via-pink-50/40 to-white border-rose-200/90 shadow-xs'
                                    : totalNetPnL >= 0 
                                      ? 'bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border-emerald-500/30 shadow-xs' 
                                      : 'bg-gradient-to-br from-rose-950/30 via-slate-900 to-slate-900 border-rose-500/30 shadow-xs'
                                }`}>
                                  <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider truncate block ${
                                    isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                                  }`}>
                                    NET P&L
                                  </span>
                                  <div className="mt-1 flex items-baseline gap-1 flex-wrap">
                                    <span className={`text-sm sm:text-lg font-black font-mono tracking-tight ${
                                      totalNetPnL >= 0 
                                        ? isLightTheme ? 'text-emerald-700' : 'text-emerald-400' 
                                        : isLightTheme ? 'text-rose-700' : 'text-rose-400'
                                    }`}>
                                      {totalNetPnL >= 0 ? '+' : ''}${totalNetPnL.toFixed(2)}
                                    </span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                      totalNetPnL >= 0
                                        ? isLightTheme ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-900/50 text-emerald-300'
                                        : isLightTheme ? 'bg-rose-100 text-rose-800' : 'bg-rose-900/50 text-rose-300'
                                    }`}>
                                      USDT
                                    </span>
                                  </div>
                                </div>

                                {/* Win Rate Card */}
                                <div className={`p-3 sm:p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                                  isLightTheme 
                                    ? 'bg-gradient-to-br from-indigo-50/80 via-violet-50/40 to-white border-indigo-200/90 shadow-xs' 
                                    : 'bg-gradient-to-br from-indigo-950/30 via-slate-900 to-slate-900 border-indigo-500/30 shadow-xs'
                                }`}>
                                  <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider truncate block ${
                                    isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                                  }`}>
                                    WIN RATE
                                  </span>
                                  <div className="mt-1 flex items-baseline justify-between gap-1">
                                    <span className={`text-sm sm:text-lg font-black font-mono tracking-tight ${
                                      isLightTheme ? 'text-indigo-700' : 'text-indigo-400'
                                    }`}>
                                      {winRate}%
                                    </span>
                                    <span className={`text-[9px] font-bold font-mono ${isLightTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                      {winCount}/{botHistoryItems.length}
                                    </span>
                                  </div>
                                </div>

                                {/* Executions Card */}
                                <div className={`p-3 sm:p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                                  isLightTheme 
                                    ? 'bg-gradient-to-br from-zinc-50 via-slate-50 to-white border-zinc-200/90 shadow-xs' 
                                    : 'bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-slate-700/80 shadow-xs'
                                }`}>
                                  <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider truncate block ${
                                    isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                                  }`}>
                                    LOGS
                                  </span>
                                  <div className="mt-1 flex items-baseline gap-1">
                                    <span className={`text-sm sm:text-lg font-black font-mono tracking-tight ${
                                      isLightTheme ? 'text-zinc-900' : 'text-white'
                                    }`}>
                                      {botHistoryItems.length}
                                    </span>
                                    <span className={`text-[9px] font-bold ${isLightTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                      trades
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Section Header for Executions */}
                            <div className="flex items-center justify-between pt-1 select-none relative z-10">
                              <span className={`text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                                isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                              }`}>
                                <Activity size={13} className="text-indigo-500" />
                                Execution History
                              </span>
                            </div>

                            {/* Trade Log Items */}
                            <div className="space-y-2.5 relative z-10">
                              {botHistoryItems.map(item => {
                                const isWin = item.isWin;
                                const amt = item.amount;

                                return (
                                  <div 
                                    key={item.id}
                                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 relative overflow-hidden group ${
                                      isLightTheme 
                                        ? 'bg-zinc-50/90 border-zinc-200/80 hover:bg-white hover:border-indigo-300 hover:shadow-md' 
                                        : 'bg-slate-900/70 border-slate-700/70 hover:bg-slate-900 hover:border-indigo-500/50 hover:shadow-lg'
                                    }`}
                                  >
                                    {/* Left Status Stripe */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                      isWin ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`} />

                                    <div className="flex items-center gap-3 pl-1">
                                      {/* Icon Container */}
                                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ${
                                        isWin 
                                          ? isLightTheme ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/80' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                          : isLightTheme ? 'bg-rose-100 text-rose-800 border border-rose-300/80' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                      }`}>
                                        {isWin ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                      </div>

                                      {/* Pair & Status Badge */}
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5">
                                        <TradingPairBadge pair={item.tradingPair} isLightTheme={isLightTheme} size="sm" showName />
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider border w-fit flex items-center gap-1 ${
                                          isWin
                                            ? isLightTheme ? 'bg-emerald-100/90 text-emerald-900 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                            : isLightTheme ? 'bg-rose-100/90 text-rose-900 border-rose-300' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                        }`}>
                                          <span className={`w-1 h-1 rounded-full ${isWin ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                          {isWin ? 'WIN' : 'LOSS'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Amount */}
                                    <div className="text-right shrink-0">
                                      <span className={`text-sm sm:text-base font-black font-mono block ${
                                        isWin 
                                          ? isLightTheme ? 'text-emerald-600' : 'text-emerald-400' 
                                          : isLightTheme ? 'text-rose-600' : 'text-rose-400'
                                      }`}>
                                        {isWin ? '+' : ''}${amt.toFixed(2)} <span className="text-[10px] font-bold text-zinc-400 font-sans">USDT</span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}

                              {botHistoryItems.length === 0 && (
                                <div className={`text-center py-12 px-4 border rounded-2xl select-none relative overflow-hidden ${
                                  isLightTheme ? 'bg-zinc-50/50 border-zinc-200/60' : 'bg-slate-900/40 border-slate-800/80'
                                }`}>
                                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-3">
                                    <History size={24} />
                                  </div>
                                  <p className={`text-xs font-black ${isLightTheme ? 'text-zinc-800' : 'text-zinc-200'}`}>No bot trade executions recorded yet.</p>
                                  <p className={`text-[11px] mt-1 max-w-[280px] mx-auto ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                    Run a bot strategy to track your profits and losses on each trade execution here.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* PAGE 4: MY BOTS */}
                      {botHubView === 'MY_BOTS' && (
                        <div className={`border rounded-3xl p-5 space-y-4 ${
                          isLightTheme ? 'bg-white border-zinc-200/80 shadow-xs' : 'bg-slate-800 border-slate-700/80'
                        }`}>
                          <div className="flex justify-between items-center select-none">
                            <div>
                              <h3 className={`text-sm font-black tracking-tight flex items-center gap-1.5 ${isLightTheme ? 'text-zinc-800' : 'text-zinc-200'}`}>
                                <Bot size={18} className="text-blue-500" />
                                MY BOTS ({userBots.filter(b => b.status !== 'STOPPED').length})
                              </h3>
                              <p className={`text-xs mt-0.5 ${isLightTheme ? 'text-zinc-400' : 'text-zinc-400'}`}>
                                Manage your active trading bots, monitor live profits, and harvest or withdraw anytime.
                              </p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {userBots.filter(b => b.status !== 'STOPPED').map((bot) => {
                              const isOfflineActive = isUsingFallbackPrices || Boolean(pricesLoadError) || (typeof navigator !== 'undefined' && !navigator.onLine);
                              return (
                              <div 
                                key={bot.id} 
                                className={`p-4 sm:p-5 rounded-3xl border transition-all duration-300 relative overflow-hidden space-y-3.5 ${
                                  isLightTheme 
                                    ? 'bg-gradient-to-br from-white via-blue-50/15 to-indigo-50/20 border-zinc-200/90 hover:border-blue-400 hover:shadow-lg' 
                                    : 'bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border-slate-700/80 hover:border-blue-500/50 hover:shadow-lg'
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                                      isOfflineActive
                                        ? 'bg-gradient-to-tr from-rose-600 to-pink-600 text-white shadow-rose-500/25'
                                        : bot.status === 'RUNNING'
                                          ? 'bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-blue-500/25'
                                          : 'bg-gradient-to-tr from-amber-500 to-yellow-500 text-white shadow-amber-500/25'
                                    }`}>
                                      <Bot size={20} className="drop-shadow-xs" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className={`text-sm font-black tracking-tight ${isLightTheme ? 'text-zinc-900' : 'text-white'}`}>
                                          {bot.name}
                                        </h4>
                                        <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-mono font-black uppercase tracking-wider border flex items-center gap-1 ${
                                          isOfflineActive
                                            ? isLightTheme ? 'bg-rose-100/90 border-rose-300 text-rose-900' : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                            : bot.status === 'RUNNING'
                                              ? isLightTheme ? 'bg-emerald-100/90 border-emerald-300 text-emerald-900' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                              : isLightTheme ? 'bg-amber-100/90 border-amber-300 text-amber-900' : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                        }`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${isOfflineActive ? 'bg-rose-500' : bot.status === 'RUNNING' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                                          {isOfflineActive ? 'OFFLINE' : bot.status}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`text-[11px] font-mono font-bold ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                          Capital: <strong className="text-zinc-900 dark:text-white font-black">${isOfflineActive ? 0 : bot.capital.toLocaleString()}</strong> ({bot.coinSymbol || 'USDT'})
                                        </span>
                                        <span className="text-zinc-300 dark:text-zinc-700">•</span>
                                        <TradingPairBadge pair={bot.tradingPair || 'XAUUSD'} isLightTheme={isLightTheme} size="sm" />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-slate-800">
                                    <div className="text-left sm:text-right">
                                      <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">
                                        {(isOfflineActive ? 0 : (bot.accruedProfit || 0)) < 0 ? 'Accrued Loss' : 'Accrued Profit'}
                                      </span>
                                      <span className={`text-base font-black font-mono ${
                                        (isOfflineActive ? 0 : (bot.accruedProfit || 0)) >= 0 
                                          ? (isLightTheme ? 'text-emerald-600' : 'text-emerald-400')
                                          : (isLightTheme ? 'text-rose-600' : 'text-rose-400')
                                      }`}>
                                        {isOfflineActive ? '+$0.00' : `${(bot.accruedProfit || 0) >= 0 ? '+' : ''}$${(bot.accruedProfit || 0).toFixed(2)}`}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className={`pt-3 border-t flex flex-wrap items-center justify-between gap-2 ${
                                  isLightTheme ? 'border-zinc-200/60' : 'border-slate-800'
                                }`}>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setActiveRunningBot(bot)}
                                      className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xs"
                                    >
                                      <Activity size={12} />
                                      View Live Bot
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleBotStatus(bot)}
                                      className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer border transition-all ${
                                        isLightTheme 
                                          ? 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100' 
                                          : 'bg-slate-800 border-slate-700 text-zinc-300 hover:bg-slate-750'
                                      }`}
                                    >
                                      {bot.status === 'RUNNING' ? <Pause size={11} /> : <Play size={11} />}
                                      {bot.status === 'RUNNING' ? 'Pause' : 'Resume'}
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleStopBot(bot)}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer border transition-all ${
                                      isLightTheme 
                                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100' 
                                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                                    }`}
                                  >
                                    Stop & Withdraw Capital
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                            {userBots.filter(b => b.status !== 'STOPPED').length === 0 && (
                              <div className={`text-center py-10 px-4 border rounded-2xl select-none ${
                                isLightTheme ? 'bg-zinc-50/50 border-zinc-200/60' : 'bg-slate-900/40 border-slate-800/80'
                              }`}>
                                <div className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-3 ${
                                  isLightTheme ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/10 text-blue-400'
                                }`}>
                                  <Bot size={22} />
                                </div>
                                <p className={`text-xs font-bold ${isLightTheme ? 'text-zinc-700' : 'text-zinc-300'}`}>You have no active automated bots.</p>
                                <p className={`text-[10px] mt-1 max-w-[280px] mx-auto ${isLightTheme ? 'text-zinc-400' : 'text-zinc-400'}`}>
                                  Explore Premium or Free bot categories to deploy your capital and start earning automated returns.
                                </p>
                                <div className="flex items-center justify-center gap-3 mt-4">
                                  <button
                                    type="button"
                                    onClick={() => setBotHubView('PREMIUM')}
                                    className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-400 transition-all cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Crown size={14} />
                                    Premium Bots
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setBotHubView('FREE')}
                                    className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-400 transition-all cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Gift size={14} />
                                    Free Bots
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
            </div>
          )}

          {/* DEPLOY BOT MODAL */}
          {selectedBotTemplate && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
              <div className={`w-full max-w-md rounded-3xl border p-6 space-y-6 shadow-2xl ${
                isLightTheme ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-slate-900 border-slate-800 text-white'
              }`}>
                {/* Header: < Set UP & Run Bot */}
                <div className="flex justify-between items-center pb-3 border-b border-zinc-200/60 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedBotTemplate(null)}
                      className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                        isLightTheme ? 'hover:bg-zinc-100 text-zinc-700' : 'hover:bg-slate-800 text-zinc-200'
                      }`}
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-lg font-black tracking-tight">Set UP & Run Bot</h3>
                      <p className={`text-[11px] font-bold ${isLightTheme ? 'text-amber-600' : 'text-emerald-400'}`}>
                        {selectedBotTemplate.name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedBotTemplate(null)}
                    className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                      isLightTheme ? 'hover:bg-zinc-100 text-zinc-500' : 'hover:bg-slate-800 text-zinc-400'
                    }`}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Field 1: Choose trading pair */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold block">Choose Trading Pair</label>
                      <span className={`text-[10px] font-mono font-bold ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        Selected: <strong className={isLightTheme ? 'text-amber-600 font-extrabold' : 'text-emerald-400 font-extrabold'}>{getTradingPairConfig(botSelectedPair).displayCode}</strong>
                      </span>
                    </div>

                    <div className="relative">
                      {/* Backdrop overlay to close dropdown on click outside */}
                      {isPairDropdownOpen && (
                        <div 
                          className="fixed inset-0 z-30" 
                          onClick={() => setIsPairDropdownOpen(false)} 
                        />
                      )}

                      {/* Dropdown Trigger Button */}
                      <button
                        type="button"
                        onClick={() => setIsPairDropdownOpen(!isPairDropdownOpen)}
                        className={`w-full p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center justify-between relative z-30 select-none shadow-xs ${
                          isPairDropdownOpen
                            ? isLightTheme
                              ? 'bg-white border-amber-500 ring-2 ring-amber-500/30 shadow-md'
                              : 'bg-slate-900 border-emerald-500 ring-2 ring-emerald-500/30 shadow-md'
                            : isLightTheme
                              ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300'
                              : 'bg-slate-950 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                            isLightTheme ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'
                          }`}>
                            {getTradingPairConfig(botSelectedPair).symbol}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-black tracking-tight">
                                {getTradingPairConfig(botSelectedPair).displayCode}
                              </span>
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md border uppercase ${
                                isLightTheme ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-slate-900 text-zinc-400 border-slate-800'
                              }`}>
                                {getTradingPairConfig(botSelectedPair).assetType}
                              </span>
                            </div>
                            <span className={`text-[11px] font-medium block ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              {getTradingPairConfig(botSelectedPair).name}
                            </span>
                          </div>
                        </div>

                        <div className={`p-1.5 rounded-lg transition-transform duration-200 ${
                          isPairDropdownOpen ? 'rotate-180 ' + (isLightTheme ? 'text-amber-600' : 'text-emerald-400') : 'text-zinc-400'
                        }`}>
                          <ChevronDown size={18} />
                        </div>
                      </button>

                      {/* Custom Floating Popover Menu */}
                      {isPairDropdownOpen && (
                        <div className={`absolute left-0 right-0 top-full mt-2 z-50 p-1.5 rounded-2xl border shadow-2xl space-y-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 ${
                          isLightTheme 
                            ? 'bg-white/95 border-zinc-200 text-zinc-900 shadow-amber-500/10' 
                            : 'bg-slate-900/95 border-slate-700 text-white shadow-black/60'
                        }`}>
                          {(selectedBotTemplate.tradingPairs && selectedBotTemplate.tradingPairs.length > 0 
                            ? selectedBotTemplate.tradingPairs 
                            : DEFAULT_BOT_TRADING_PAIRS
                          ).map((pairKey: string) => {
                            const cfg = getTradingPairConfig(pairKey);
                            const selectedClean = (botSelectedPair || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                            const pairClean = pairKey.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                            const cfgClean = cfg.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                            const isSelected = selectedClean === pairClean || selectedClean === cfgClean || botSelectedPair === pairKey || botSelectedPair === cfg.code;

                            return (
                              <button
                                key={pairKey}
                                type="button"
                                onClick={() => {
                                  setBotSelectedPair(pairKey);
                                  setIsPairDropdownOpen(false);
                                }}
                                className={`w-full p-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer flex items-center justify-between border ${
                                  isSelected
                                    ? isLightTheme
                                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-950 font-bold'
                                      : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                                    : isLightTheme
                                      ? 'border-transparent hover:bg-zinc-100/80 text-zinc-800'
                                      : 'border-transparent hover:bg-slate-800/80 text-zinc-200'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-lg w-6 text-center">{cfg.symbol}</span>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono font-extrabold tracking-tight">
                                        {cfg.displayCode}
                                      </span>
                                    </div>
                                    <span className={`text-[10px] font-medium block ${
                                      isSelected
                                        ? isLightTheme ? 'text-amber-800' : 'text-emerald-400'
                                        : isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                                    }`}>
                                      {cfg.name}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md border uppercase ${
                                    isLightTheme ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-slate-950 text-zinc-400 border-slate-800'
                                  }`}>
                                    {cfg.assetType}
                                  </span>
                                  {isSelected && (
                                    <div className={`p-0.5 rounded-full ${isLightTheme ? 'bg-amber-500 text-amber-950' : 'bg-emerald-500 text-slate-950'}`}>
                                      <CheckCircle2 size={13} className="stroke-[3]" />
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Field 2: Investment amount */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold block">Investment amount</label>
                      <span className={`text-[10px] font-mono font-bold ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        Available: ${(profile?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-zinc-400 font-bold font-mono text-xs">$</span>
                      <input
                        type="number"
                        placeholder={`Min ${getTemplateMinCapital(selectedBotTemplate)} USDT`}
                        value={botCapitalInput}
                        onChange={(e) => setBotCapitalInput(e.target.value)}
                        className={`w-full pl-8 pr-4 py-3 rounded-2xl border text-xs font-mono font-bold focus:outline-none ${
                          isLightTheme 
                            ? 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-amber-500' 
                            : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                        }`}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono font-bold block">
                      Minimum capital: ${getTemplateMinCapital(selectedBotTemplate)} USDT
                    </span>
                  </div>

                  {/* Field 3: Trade duration */}
                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold block">Trade duration :</label>
                      <span className={`px-3 py-1 rounded-xl text-xs font-mono font-black border ${
                        isLightTheme 
                          ? 'bg-amber-50 border-amber-200 text-amber-800' 
                          : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                      }`}>
                        {botDurationSeconds} seconds
                      </span>
                    </div>
                    
                    {/* Duration Slider Bar */}
                    <div className="space-y-1 pt-1">
                      <input
                        type="range"
                        min={60}
                        max={120}
                        step={1}
                        value={botDurationSeconds}
                        onChange={(e) => setBotDurationSeconds(parseInt(e.target.value) || 60)}
                        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                          isLightTheme ? 'bg-zinc-200 accent-amber-500' : 'bg-slate-800 accent-emerald-500'
                        }`}
                      />
                      <div className="flex justify-between text-[11px] font-mono font-bold text-zinc-400">
                        <span>60 seconds</span>
                        <span>120 seconds</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons: CANCEL & RUN */}
                <div className="flex items-center gap-3 pt-4 border-t border-zinc-200/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedBotTemplate(null)}
                    className={`flex-1 py-3.5 rounded-2xl text-xs font-bold uppercase tracking-wider cursor-pointer border transition-all ${
                      isLightTheme 
                        ? 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200' 
                        : 'bg-slate-800 border-slate-700 text-zinc-300 hover:bg-slate-750'
                    }`}
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    disabled={botDeployLoading || !botCapitalInput || parseFloat(botCapitalInput) < selectedBotTemplate.minCapital}
                    onClick={handleDeployBot}
                    className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-sm ${
                      isLightTheme 
                        ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-amber-500/20' 
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                    }`}
                  >
                    {botDeployLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin"></div>
                        <span>Deploying...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={16} />
                        <span>RUN</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EARN (VERIFIED TRADING SIGNALS) */}
          {activeTab === 'earn' && (
            <div className="space-y-5 animate-fade-in">
              {/* Earn Specific Interactive Wallet Card */}
              {mmfSubView !== 'form' && (
                <div 
                  id="earn-investment-wallet-card" 
                  className={`relative overflow-hidden rounded-3xl p-6 border transition-all duration-300 ${
                    isLightTheme 
                      ? 'bg-[#FFF8E1] border-amber-300/90 text-zinc-800 shadow-md shadow-amber-500/5' 
                      : 'bg-slate-900/40 border-slate-850/70 text-white shadow-md shadow-emerald-950/5'
                  }`}
                >
                  {/* Micro Ambient Details */}
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse duration-4000 ${
                    isLightTheme ? 'bg-amber-500/5' : 'bg-white/5'
                  }`} />
                  <div className={`absolute bottom-0 left-0 w-24 h-24 rounded-full blur-2xl -ml-10 -mb-10 ${
                    isLightTheme ? 'bg-amber-500/5' : 'bg-white/5'
                  }`} />

                  <div className="flex justify-between items-start select-none">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${
                          isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                        }`}>Total Amount Traded</span>
                        <button
                          onClick={() => setIsEarnBalanceBlurred(!isEarnBalanceBlurred)}
                          className={`p-1 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center shrink-0 ${
                            isLightTheme ? 'hover:bg-amber-500/10 text-zinc-500 hover:text-zinc-700' : 'hover:bg-white/10 text-white/80 hover:text-white'
                          }`}
                          title={isEarnBalanceBlurred ? "Reveal trading data" : "Hide trading data"}
                        >
                          {isEarnBalanceBlurred ? <EyeOff size={13} strokeWidth={2.5} /> : <Eye size={13} strokeWidth={2.5} />}
                        </button>
                      </div>
                      <h2 className={`text-3xl font-black tracking-tight font-mono mt-1 transition-all duration-300 ${
                        isEarnBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                      } ${isLightTheme ? 'text-amber-900' : 'text-zinc-100'}`}>
                        $ {totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </h2>
                      <div className={`flex items-center gap-1.5 mt-2 transition-all duration-300 ${
                        isEarnBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                      }`}>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 border ${
                          isLightTheme 
                            ? 'bg-amber-100/60 border-amber-200 text-amber-800' 
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        }`}>
                          <Sparkles size={10} className={`animate-spin ${isLightTheme ? 'text-amber-600' : 'text-emerald-300'}`} />
                          {activeInvs.length} Active Trading {activeInvs.length === 1 ? 'Signal' : 'Signals'}
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Daily Profit */}
                    <div className="text-right flex flex-col items-end">
                      <span className={`text-[11px] font-bold uppercase tracking-wider block ${
                        isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
                      }`}>Today's Profit</span>
                      <div className={`flex items-center justify-end gap-1.5 mt-1 transition-all duration-300 ${
                        isEarnBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                      }`}>
                        <span className={`text-2xl font-black font-mono ${
                          isLightTheme ? 'text-emerald-600' : 'text-emerald-400'
                        }`}>
                          +$ {totalDailyProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <span className={`text-[9px] font-semibold block transition-all duration-300 ${
                        isEarnBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                      } ${isLightTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Daily Distribution
                      </span>
                      
                      <button 
                        onClick={() => setEarnDisplayMode(earnDisplayMode === 'USD' ? 'CRYPTO' : 'USD')}
                        className={`mt-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer text-[10px] font-bold select-none ${
                          isEarnBalanceBlurred ? 'filter blur-md select-none pointer-events-none' : ''
                        } ${
                          isLightTheme 
                            ? 'bg-amber-100/80 border-amber-200 hover:bg-amber-100 text-amber-800' 
                            : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                        }`}
                      >
                        <TrendingUp size={11} className={isLightTheme ? 'text-amber-600' : 'text-teal-200'} />
                        <span>{earnDisplayMode === 'USD' ? 'Show Coins' : 'Show USD'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Expanded Coin Breakdown Drawer inside the Card */}
                  {earnDisplayMode === 'CRYPTO' && activeInvs.length > 0 && (
                    <div className={`mt-4 pt-3 border-t space-y-2 animate-fade-in select-none ${
                      isLightTheme ? 'border-amber-200' : 'border-slate-800'
                    }`}>
                      <span className={`text-[9px] font-black uppercase tracking-wider block mb-1 ${
                        isLightTheme ? 'text-amber-800' : 'text-teal-300'
                      }`}>Your Portfolio Breakdown</span>
                      <div className="grid grid-cols-2 gap-2 max-h-[100px] overflow-y-auto pr-1">
                        {cryptoPrices.map(coin => {
                          const coinInvs = activeInvs.filter((inv: any) => inv.coinSymbol === coin.symbol);
                          if (coinInvs.length === 0) return null;
                          const coinSum = coinInvs.reduce((sum: number, inv: any) => sum + inv.amount, 0);
                          const coinDailyProfitSum = coinInvs.reduce((sum: number, inv: any) => sum + (inv.amount * (inv.dailyRate / 100)), 0);
                          return (
                            <div 
                              key={coin.symbol} 
                              className={`p-2 rounded-xl border flex justify-between items-center font-mono ${
                                isLightTheme 
                                  ? 'bg-amber-50/50 border-amber-200/50' 
                                  : 'bg-black/20 border-white/5'
                              }`}
                            >
                              <div>
                                <span className={`text-[10px] font-black ${isLightTheme ? 'text-zinc-800' : 'text-white'}`}>{coin.symbol}</span>
                                <span className={`text-[9px] block ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>{coinSum.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400">+{coinDailyProfitSum.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                <span className={`text-[8px] block ${isLightTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>/day</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* trading signals mode */}
              <div className={`border rounded-3xl p-5 space-y-5 animate-fade-in ${
                isLightTheme ? 'bg-white border-zinc-200/80 shadow-xs' : 'bg-slate-800 border-slate-700/80'
              }`}>
                {mmfSubView === 'main' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className={`text-sm font-black tracking-tight flex items-center gap-1.5 ${isLightTheme ? 'text-zinc-800' : 'text-zinc-300'}`}>
                        <Coins size={16} className={isLightTheme ? 'text-amber-500' : 'text-emerald-400'} />
                        VERIFIED TRADING SIGNALS
                      </h3>
                      <p className={`text-[11px] mt-0.5 ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>Copy verified trading signals from experienced professionals with great win ratio</p>
                    </div>



                    {/* Coins Cards List - Single Column Layout (Blueprint Design) */}
                    <div className="flex flex-col gap-3">
                      {cryptoPrices.map(coin => {
                        const userHolding = getCoinHolding(coin.symbol);
                        const locked = getLockedAmount(coin.symbol);
                        const unlocked = Math.max(0, userHolding - locked);
                        const dailyRate = coin.investmentRate ?? 5.0;
                        const winRate = coin.winRate ?? 96.0;

                        return (
                          <div 
                            key={coin.symbol}
                            onClick={() => {
                              setSelectedCoinForInvestment(coin);
                              setInvestmentAmount('');
                              setMmfSubView('form');
                              setInvestmentError(null);
                              setInvestmentSuccess(null);
                            }}
                            className={`border p-3 sm:p-4 rounded-2xl flex items-center justify-between gap-2 sm:gap-4 transition-all duration-300 group hover:shadow-md cursor-pointer active:scale-[0.99] relative overflow-hidden ${
                              isLightTheme 
                                ? 'bg-[#FFF8E1] border-amber-300/90 hover:border-amber-400 hover:shadow-amber-500/10' 
                                : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900/90 hover:border-emerald-500/30'
                            }`}
                          >
                            {/* Subtle top hover accent line */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                            {/* Left Side: Circular Logo + (Coin Name / Symbol stacked above Badges) */}
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              {/* Circular Logo */}
                              <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border flex items-center justify-center p-1 sm:p-1.5 shadow-xs shrink-0 ${
                                isLightTheme ? 'bg-white border-amber-200' : 'bg-slate-950 border-slate-800'
                              }`}>
                                <img 
                                  src={getCoinLogoUrl(coin.symbol)} 
                                  alt={coin.name} 
                                  className="w-full h-full object-contain rounded-full"
                                  referrerPolicy="no-referrer"
                                />
                              </div>

                              {/* Coin Name & Badges stacked vertically */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className={`font-black text-xs sm:text-base tracking-tight truncate ${isLightTheme ? 'text-zinc-900' : 'text-zinc-100'}`}>
                                    {coin.name}
                                  </span>
                                  <span className={`text-[9px] sm:text-[10px] font-bold font-mono shrink-0 ${isLightTheme ? 'text-amber-900/60' : 'text-zinc-400'}`}>
                                    {coin.symbol}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md font-black text-[9px] sm:text-[10px] font-mono tracking-wide whitespace-nowrap ${
                                    isLightTheme 
                                      ? 'bg-emerald-100/90 text-emerald-800 border border-emerald-300/60' 
                                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  }`}>
                                    {dailyRate}% daily profit
                                  </span>
                                  <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md font-black text-[9px] sm:text-[10px] font-mono tracking-wide whitespace-nowrap ${
                                    isLightTheme 
                                      ? 'bg-teal-100/90 text-teal-900 border border-teal-300/60' 
                                      : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                  }`}>
                                    <Sparkles size={10} className={isLightTheme ? 'text-teal-700' : 'text-teal-300'} />
                                    {winRate}% Win Ratio
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Right Side: Available balance (top right) & TRADE button (bottom right) */}
                            <div className="flex flex-col items-end gap-1 sm:gap-1.5 text-right shrink-0">
                              <div>
                                <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-tight sm:tracking-wider block whitespace-nowrap ${
                                  isLightTheme ? 'text-amber-900/60' : 'text-zinc-400'
                                }`}>
                                  Available balance
                                </span>
                                <span className={`text-xs sm:text-sm font-black font-mono tracking-tight block whitespace-nowrap ${
                                  isLightTheme ? 'text-zinc-900' : 'text-zinc-100'
                                }`}>
                                  {unlocked.toFixed(4)} <span className={`text-[9px] sm:text-[10px] font-bold ${isLightTheme ? 'text-amber-800/80' : 'text-zinc-400'}`}>{coin.symbol}</span>
                                </span>
                                {locked > 0 && (
                                  <span className={`inline-flex items-center gap-1 mt-0.5 text-[8px] sm:text-[9px] font-extrabold block whitespace-nowrap ${
                                    isLightTheme ? 'text-amber-800/90' : 'text-amber-400'
                                  }`}>
                                    ({locked.toFixed(2)} {coin.symbol} Traded)
                                  </span>
                                )}
                              </div>

                              {/* TRADE Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCoinForInvestment(coin);
                                  setInvestmentAmount('');
                                  setMmfSubView('form');
                                  setInvestmentError(null);
                                  setInvestmentSuccess(null);
                                }}
                                className={`px-3.5 sm:px-5 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-md active:scale-95 transition-all cursor-pointer text-center whitespace-nowrap ${
                                  isLightTheme 
                                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-white shadow-amber-500/20' 
                                    : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 shadow-emerald-500/20'
                                }`}
                              >
                                TRADE
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Display Active/Completed Signal Trades */}
                    {activeInvestments.length > 0 && (
                      <div className={`space-y-3 pt-4 border-t ${isLightTheme ? 'border-zinc-200/60' : 'border-slate-850'}`}>
                        <div className="flex justify-between items-center select-none">
                          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                            <History size={12} className="text-zinc-400" />
                            Verified Signal History
                          </h4>
                        </div>
                        <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                          {activeInvestments.map((inv: any) => {
                            const createdDate = inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString() : new Date(inv.createdAt).toLocaleDateString();
                            const unlockDate = inv.unlockAt?.toDate ? inv.unlockAt.toDate().toLocaleDateString() : new Date(inv.unlockAt).toLocaleDateString();
                            const isCompleted = inv.status === 'completed';
                            const progressPercentage = Math.min(100, (((inv.daysPaid ?? 0) / (inv.totalDays ?? 24)) * 100));
                            const dailyEarning = inv.amount * (inv.dailyRate / 100);
                            const totalEarned = (inv.daysPaid ?? 0) * dailyEarning;
                            const targetYield = dailyEarning * (inv.totalDays ?? 24);

                            return (
                              <div 
                                key={inv.id} 
                                className={`group p-4 sm:p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden select-none ${
                                  isCompleted 
                                    ? isLightTheme
                                      ? 'bg-zinc-50/70 border-zinc-200/80 hover:border-zinc-300'
                                      : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-800' 
                                    : isLightTheme
                                      ? 'bg-white border-amber-300/80 shadow-[0_4px_20px_rgba(245,158,11,0.06)] hover:border-amber-400'
                                      : 'bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border-teal-500/20 hover:border-teal-500/40 hover:shadow-lg hover:shadow-teal-950/20'
                                }`}
                              >
                                {/* Active subtle glowing indicator bar on left side */}
                                <div className={`absolute top-0 left-0 w-1.5 h-full ${
                                  isCompleted 
                                    ? (isLightTheme ? 'bg-zinc-300' : 'bg-zinc-700')
                                    : 'bg-gradient-to-b from-emerald-400 via-teal-500 to-emerald-600'
                                }`} />

                                <div className="space-y-3 pl-1 sm:pl-1.5">
                                  {/* Top Row: Coin Logo & Amount + Badges */}
                                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                                    <div className="flex items-center gap-2.5">
                                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center p-1.5 shrink-0 border ${
                                        isLightTheme 
                                          ? 'bg-zinc-100/90 border-zinc-200/80 shadow-2xs' 
                                          : 'bg-zinc-800/80 border-zinc-700/80 shadow-2xs'
                                      }`}>
                                        <img 
                                          src={getCoinLogoUrl(inv.coinSymbol)} 
                                          alt={inv.coinSymbol} 
                                          className="w-full h-full object-contain"
                                          onError={(e) => {
                                            (e.target as HTMLElement).style.display = 'none';
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className={`font-black text-sm sm:text-base tracking-tight font-mono ${isLightTheme ? 'text-zinc-900' : 'text-zinc-100'}`}>
                                            {inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                                          </span>
                                          <span className="text-xs font-black text-zinc-500">{inv.coinSymbol}</span>
                                        </div>
                                        <span className={`text-[10px] font-semibold block ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                          Start: {createdDate} • End: {unlockDate}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-md font-black font-mono tracking-wide border shadow-2xs ${
                                        isLightTheme 
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                          : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                                      }`}>
                                        {inv.dailyRate}% Daily Profit
                                      </span>
                                      {isCompleted ? (
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                                          isLightTheme 
                                            ? 'bg-zinc-100 text-zinc-500 border-zinc-200' 
                                            : 'bg-zinc-800/50 text-zinc-400 border-zinc-800'
                                        }`}>
                                          Completed
                                        </span>
                                      ) : (
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1.5 border shadow-2xs ${
                                          isLightTheme 
                                            ? 'bg-teal-50 text-teal-800 border-teal-200' 
                                            : 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                                        }`}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                                          Active Signal
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Middle Row: Earnings Breakdown Box */}
                                  <div className={`p-2.5 sm:p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs font-mono ${
                                    isLightTheme 
                                      ? 'bg-zinc-50/90 border-zinc-200/80' 
                                      : 'bg-zinc-950/60 border-zinc-800/80'
                                  }`}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Daily Profit:</span>
                                      <span className={`font-bold ${isLightTheme ? 'text-zinc-800' : 'text-zinc-200'}`}>
                                        +{dailyEarning.toFixed(4)} {inv.coinSymbol}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Est. Total Profit:</span>
                                      <span className={`px-2 py-0.5 rounded-md font-extrabold border ${
                                        isLightTheme 
                                          ? 'bg-amber-100/90 border-amber-300/80 text-amber-900' 
                                          : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                                      }`}>
                                        +{targetYield.toFixed(4)} {inv.coinSymbol}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Earned:</span>
                                      <span className={`px-2 py-0.5 rounded-md font-extrabold border ${
                                        isLightTheme 
                                          ? 'bg-emerald-100/90 border-emerald-300/80 text-emerald-900' 
                                          : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                                      }`}>
                                        +{totalEarned.toFixed(4)} {inv.coinSymbol}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Bottom Row: Duration Progress Bar */}
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between items-center text-[10px] font-bold select-none font-mono">
                                      <span className={isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}>Signal Duration Progress</span>
                                      <span className={isLightTheme ? 'text-zinc-800' : 'text-zinc-200'}>{inv.daysPaid ?? 0} / {inv.totalDays ?? 24} Days ({Math.round(progressPercentage)}%)</span>
                                    </div>
                                    <div className={`w-full h-2 rounded-full overflow-hidden p-[1px] border ${
                                      isLightTheme ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-950 border-zinc-800'
                                    }`}>
                                      <div 
                                        className={`h-full rounded-full transition-all duration-500 ${
                                          isCompleted 
                                            ? 'bg-zinc-400' 
                                            : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                        }`}
                                        style={{ width: `${progressPercentage}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {mmfSubView === 'form' && selectedCoinForInvestment && (
                  <div className="space-y-5 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMmfSubView('main')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer border ${
                          isLightTheme 
                            ? 'bg-amber-100/80 hover:bg-amber-200 border-amber-200/50 text-amber-800 hover:text-amber-900' 
                            : 'hover:bg-slate-900 border border-transparent hover:border-slate-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <div>
                        <h4 className={`text-xs font-black uppercase tracking-wider ${
                          isLightTheme ? 'text-zinc-800' : 'text-zinc-300'
                        }`}>Execute Trading Signal</h4>
                        <p className={`text-[10px] mt-0.5 ${
                          isLightTheme ? 'text-zinc-500' : 'text-zinc-500'
                        }`}>Allocate capital to execute verified automated trading signals</p>
                      </div>
                    </div>

                    {/* Chosen Coin Summary Card */}
                    <div className={`p-4 rounded-2xl flex justify-between items-center border ${
                      isLightTheme 
                        ? 'bg-[#FFF8E1] border-amber-300/90 shadow-[0_0_10px_rgba(245,158,11,0.06)]' 
                        : 'bg-slate-950/60 border-slate-850'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center p-1.5 border ${
                          isLightTheme ? 'bg-[#FFF3D6] border-amber-200/80' : 'bg-slate-900 border-slate-850'
                        }`}>
                          <img 
                            src={getCoinLogoUrl(selectedCoinForInvestment.symbol)} 
                            alt={selectedCoinForInvestment.name} 
                            className="w-full h-full object-contain rounded-full"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <span className={`font-bold text-xs block ${
                            isLightTheme ? 'text-zinc-800' : 'text-zinc-200'
                          }`}>{selectedCoinForInvestment.name} Trading Signal</span>
                          <span className={`text-[10px] font-extrabold block mt-0.5 ${
                            isLightTheme ? 'text-emerald-700' : 'text-emerald-400'
                          }`}>
                            Rate: {selectedCoinForInvestment.investmentRate ?? 5.0}% daily profit
                          </span>
                          <span className={`text-[9px] font-bold block mt-1 ${
                            isLightTheme ? 'text-amber-700/95' : 'text-teal-400'
                          }`}>
                            Minimum Trade Amount: {selectedCoinForInvestment.minInvestment ?? 10.0} {selectedCoinForInvestment.symbol}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[9px] font-black uppercase tracking-wider block ${
                          isLightTheme ? 'text-amber-900/60' : 'text-zinc-500'
                        }`}>Available Balance</span>
                        <span className={`text-xs font-black font-mono tracking-tight mt-0.5 block ${
                          isLightTheme ? 'text-zinc-900' : 'text-zinc-200'
                        }`}>
                          {(getCoinHolding(selectedCoinForInvestment.symbol) - getLockedAmount(selectedCoinForInvestment.symbol)).toFixed(4)} <span className={`text-[9px] font-extrabold ${isLightTheme ? 'text-amber-800/75' : 'text-zinc-400'}`}>{selectedCoinForInvestment.symbol}</span>
                        </span>
                      </div>
                    </div>

                    {/* Form Controls */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Trade Amount</label>
                        <div className="relative">
                          <input
                            id="investment-amount-input"
                            type="number"
                            placeholder="e.g. 50"
                            value={investmentAmount}
                            onChange={(e) => {
                                setInvestmentAmount(e.target.value);
                                setInvestmentError(null);
                                setInvestmentSuccess(null);
                            }}
                            className={`w-full p-3 border rounded-xl text-xs focus:outline-none font-mono ${
                              isLightTheme 
                                ? 'bg-[#FFF8E1]/80 border-amber-200 focus:border-amber-500 text-zinc-800 placeholder-amber-600/50' 
                                : 'bg-slate-950 border-slate-800 focus:border-emerald-500 text-white'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const maxVal = Math.max(0, getCoinHolding(selectedCoinForInvestment.symbol) - getLockedAmount(selectedCoinForInvestment.symbol));
                              setInvestmentAmount(maxVal.toString());
                            }}
                            className={`absolute right-2.5 top-2 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-lg cursor-pointer ${
                              isLightTheme 
                                ? 'text-amber-700 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20' 
                                : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20'
                            }`}
                          >
                            MAX
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Signal Duration (Days)</label>
                        <input
                          id="investment-days-input"
                          type="number"
                          min="24"
                          placeholder="Minimum 24 days"
                          value={investmentDays}
                          onChange={(e) => {
                            setInvestmentDays(e.target.value);
                            setInvestmentError(null);
                            setInvestmentSuccess(null);
                          }}
                          className={`w-full p-3 border rounded-xl text-xs focus:outline-none font-mono ${
                            isLightTheme 
                              ? 'bg-[#FFF8E1]/80 border-amber-200 focus:border-amber-500 text-zinc-800 placeholder-amber-600/50' 
                              : 'bg-slate-950 border-slate-800 focus:border-emerald-500 text-white'
                          }`}
                        />
                        <p className={`text-[9px] ${isLightTheme ? 'text-zinc-600' : 'text-zinc-500'}`}>Minimum duration is 24 days. Daily signal profits accrue instantly to your main account.</p>
                      </div>

                      {/* Profit preview calculator */}
                      {parseFloat(investmentAmount) > 0 && (
                        <div className={`border p-3 rounded-xl flex flex-col gap-2 select-none ${
                          isLightTheme 
                            ? 'bg-[#FFF8E1] border-amber-300/80 shadow-[0_0_10px_rgba(245,158,11,0.06)]' 
                            : 'bg-slate-950/40 border-slate-850'
                        }`}>
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-zinc-500 font-bold uppercase tracking-wider">Daily Yield</span>
                            <span className={`font-bold font-mono ${isLightTheme ? 'text-emerald-700 font-extrabold' : 'text-emerald-400'}`}>
                              +{(parseFloat(investmentAmount) * ((selectedCoinForInvestment.investmentRate ?? 5.0) / 100)).toFixed(4)} {selectedCoinForInvestment.symbol}
                            </span>
                          </div>
                          <div className={`flex justify-between items-center text-[10px] border-t pt-2 ${
                            isLightTheme ? 'border-amber-200/60' : 'border-slate-850/60'
                          }`}>
                            <span className="text-zinc-500 font-bold uppercase tracking-wider">Total {parseInt(investmentDays) || 24} Days Yield</span>
                            <span className={`font-bold font-mono ${isLightTheme ? 'text-emerald-700 font-extrabold' : 'text-emerald-400'}`}>
                              +{(parseFloat(investmentAmount) * ((selectedCoinForInvestment.investmentRate ?? 5.0) / 100) * (parseInt(investmentDays) || 24)).toFixed(4)} {selectedCoinForInvestment.symbol}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Feedback messages */}
                      {investmentError && (
                        <div className={`p-3.5 border rounded-xl text-xs flex flex-col gap-2 ${
                          isLightTheme ? 'bg-red-50 border-red-200 text-red-800' : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                          <div className="flex gap-2">
                            <AlertCircle size={15} className="shrink-0 mt-0.5" />
                            <span>{investmentError}</span>
                          </div>
                          {investmentError.includes("deposit") && (
                            <button
                              type="button"
                              onClick={() => {
                                const sym = selectedCoinForInvestment?.symbol;
                                if (sym) {
                                  sessionStorage.setItem('preselected_deposit_coin', sym);
                                  localStorage.setItem('preselected_deposit_coin', sym);
                                }
                                onOpenDeposit(sym);
                              }}
                              className={`mt-1 w-full py-1.5 border text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer ${
                                isLightTheme 
                                  ? 'bg-amber-550/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-850' 
                                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-200'
                              }`}
                            >
                              Go to Deposit Page
                            </button>
                          )}
                        </div>
                      )}

                      {/* Trade Submit button */}
                      <button
                        type="button"
                        disabled={investmentLoading || !investmentAmount || parseFloat(investmentAmount) <= 0}
                        onClick={handleInitiateInvestment}
                        className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider active:scale-[0.985] transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5 cursor-pointer ${
                          isLightTheme 
                            ? 'bg-gradient-to-tr from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-white shadow-md shadow-amber-500/10' 
                            : 'bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/10'
                        }`}
                      >
                        {investmentLoading ? (
                          <>
                            <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${isLightTheme ? 'border-white' : 'border-slate-950'}`}></div>
                            <span>Executing Signal...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={14} />
                            <span>Execute Signal Trade</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-fade-in">
              <ActivityLog userId={user.uid} isLightTheme={isLightTheme} />
            </div>
          )}
            </>
          )}
        </>
      )}
        </main>
      )}

      {/* STICKY BOTTOM NAVIGATION */}
      {!isHideFooter && (
        <footer className={`fixed bottom-0 left-0 right-0 z-30 px-4 py-2 flex justify-around max-w-md mx-auto border-t ${
          isLightTheme 
            ? 'bg-[#FFF3D6] border-zinc-200/80 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]' 
            : 'bg-slate-900 border-slate-800/80'
        }`}>
          {([
            { id: 'home', label: 'Home', icon: Coins },
            { id: 'wallet', label: 'Wallet', icon: Wallet },
            { id: 'trade', label: 'Bot', icon: Bot },
            { id: 'earn', label: 'Signals', icon: TrendingUp },
            { id: 'history', label: 'History', icon: History }
          ] as const).map(tab => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`nav-tab-btn-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all cursor-pointer ${
                  isSelected 
                    ? (isLightTheme ? 'text-amber-700 bg-amber-500/10 font-black' : 'text-amber-400 bg-amber-500/10 font-black') 
                    : (isLightTheme ? 'text-zinc-700 hover:text-zinc-950' : 'text-white hover:text-zinc-300')
                }`}
              >
                <Icon size={18} className={isSelected ? 'scale-110 transition-transform' : ''} />
                <span className="text-[10px] font-bold tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </footer>
      )}



    </div>
  );
}
