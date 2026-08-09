import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '../context/ToastContext';
import { 
  collection, doc, getDocs, updateDoc, deleteDoc, runTransaction, 
  setDoc, query, orderBy, serverTimestamp, writeBatch, getDoc 
} from 'firebase/firestore';
import { UserAccount, Transaction, CryptoNetwork, P2PMerchant, CryptoPrice, ArbitrageConfig, BotTemplate, DepositBonusTier, ReferralDepositConfig, CopyTraderLead } from '../types';
import { DEFAULT_COPY_LEADS } from '../data/copyTraders';
import { fetchLivePriceFromBinance, fetchAllLivePrices, syncLiveCryptoPrices } from '../utils/cryptoApi';
import { 
  Users, CheckCircle2, XCircle, Settings, ShieldAlert, Key, 
  Trash2, ToggleLeft, ToggleRight, Loader, ZoomIn, Plus, Edit, Check, Eye, Star, Mail, RefreshCw, X, FileText, Coins, TrendingUp, Bot, Cpu, Smartphone, Phone, Sparkles, ChevronDown, ChevronUp
} from 'lucide-react';

const STATIC_CRYPTO: Record<string, { name: string; price: number }> = {
  USDT: { name: 'Tether', price: 1.00 },
  USDC: { name: 'USD Coin', price: 1.00 },
  BTC: { name: 'Bitcoin', price: 94250.30 },
  ETH: { name: 'Ethereum', price: 3480.12 },
  SOL: { name: 'Solana', price: 184.45 },
  BNB: { name: 'Binance Coin', price: 592.20 },
  XRP: { name: 'XRP', price: 2.54 },
  WLD: { name: 'World Coin', price: 2.80 },
  TRX: { name: 'Tron', price: 0.22 },
  DOGE: { name: 'DOGE Coin', price: 0.38 }
};

const SUPPORTED_COINS = [
  { id: 'btc', name: 'Bitcoin (BTC)', symbol: 'BTC' },
  { id: 'usdt', name: 'Tether (USDT)', symbol: 'USDT' },
  { id: 'eth', name: 'Ethereum (ETH)', symbol: 'ETH' },
  { id: 'sol', name: 'Solana (SOL)', symbol: 'SOL' },
  { id: 'bnb', name: 'Binance Coin (BNB)', symbol: 'BNB' },
  { id: 'xrp', name: 'XRP (XRP)', symbol: 'XRP' },
  { id: 'wld', name: 'World Coin (WLD)', symbol: 'WLD' },
  { id: 'trx', name: 'Tron (TRX)', symbol: 'TRX' },
  { id: 'usdc', name: 'USD Coin (USDC)', symbol: 'USDC' },
  { id: 'doge', name: 'DOGE Coin (DOGE)', symbol: 'DOGE' }
];

const calculateTotalPortfolio = (u: UserAccount, pricesList?: CryptoPrice[]): number => {
  let total = (u.usdtBalance ?? u.balance ?? 0) + (u.tradeBalance ?? 0);
  if (u.holdings) {
    Object.entries(u.holdings).forEach(([symbol, amount]) => {
      if (symbol === 'USDT') return;
      let price = 0;
      if (pricesList && pricesList.length > 0) {
        const found = pricesList.find(p => p.symbol === symbol);
        if (found) price = found.price;
      }
      if (price === 0) {
        const priceInfo = STATIC_CRYPTO[symbol];
        if (priceInfo) price = priceInfo.price;
      }
      total += (amount || 0) * price;
    });
  }
  return total;
};

interface AdminPanelProps {
  onLogout: () => void;
}

export default function AdminPanel({ onLogout }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'deposits' | 'withdrawals' | 'settings' | 'bot-templates'>('users');
  
  // Data States
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [txList, setTxList] = useState<Transaction[]>([]);
  const [networks, setNetworks] = useState<CryptoNetwork[]>([]);
  const [merchants, setMerchants] = useState<P2PMerchant[]>([]);
  const [cryptoPricesList, setCryptoPricesList] = useState<CryptoPrice[]>([]);
  const [investmentsList, setInvestmentsList] = useState<any[]>([]);
  const [userBotsList, setUserBotsList] = useState<any[]>([]);
  const [botTemplatesList, setBotTemplatesList] = useState<BotTemplate[]>([]);
  const [editingBotTemplate, setEditingBotTemplate] = useState<BotTemplate | null>(null);
  const [isAddingBotTemplate, setIsAddingBotTemplate] = useState(false);
  const [botTemplateForm, setBotTemplateForm] = useState({
    name: '',
    category: 'Cross-Exchange Arbitrage',
    winRatioRange: '95%',
    winProfitRange: '1.5% - 2.5%',
    lossPercentRange: '0.4% - 1.4%',
    minCapital: '50',
    tradingPairs: 'XAUUSD, BTCUSD, EURUSD',
    riskLevel: 'Low Risk',
    color: 'from-amber-500 to-yellow-500'
  });
  const pricesListRef = useRef<CryptoPrice[]>([]);

  // Arbitrage Config States
  const [arbitrageConfig, setArbitrageConfig] = useState<ArbitrageConfig>({
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
  const [isSavingArbitrage, setIsSavingArbitrage] = useState(false);

  // Keep ref in sync to avoid stale closures in the auto-sync interval
  useEffect(() => {
    pricesListRef.current = cryptoPricesList;
  }, [cryptoPricesList]);
  const [editingPriceSymbol, setEditingPriceSymbol] = useState<string | null>(null);
  const [priceForm, setPriceForm] = useState<{ price: string; change24h: string }>({ price: '', change24h: '' });

  // Copy Trading Lead Experts states
  const [copyLeadsList, setCopyLeadsList] = useState<CopyTraderLead[]>([]);
  const [editingLead, setEditingLead] = useState<CopyTraderLead | null>(null);
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    name: '',
    photoUrl: '',
    description: '',
    signalsPerDay: '2 signals/day',
    winRate: '98.5%',
    minCapital: '50',
    maxCapital: '10000',
    analysisCommission: '10',
    dayProfitRate: '2.0',
    contractDurationDays: '30',
    tradingPairs: 'BTC/USDT, ETH/USDT, SOL/USDT, XRP/USDT',
    sig1Time: '13:00',
    sig1Code: 'SIG1300',
    sig2Time: '20:00',
    sig2Code: 'SIG2000',
    riskLevel: 'Low Risk'
  });

  // Referral Deposit Configuration state
  const [referralConfig, setReferralConfig] = useState<ReferralDepositConfig>({
    enabled: true,
    minDepositThresholdUSD: 10,
    tiers: [
      { id: 'tier-1', minAmount: 10, maxAmount: 99.99, referrerPercent: 5, refereePercent: 10 },
      { id: 'tier-2', minAmount: 100, maxAmount: 499.99, referrerPercent: 7, refereePercent: 12 },
      { id: 'tier-3', minAmount: 500, maxAmount: 10000, referrerPercent: 10, refereePercent: 15 },
    ]
  });
  const [isSavingReferralConfig, setIsSavingReferralConfig] = useState(false);

  // Selected details for inspection/modals
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [selectedUserHistory, setSelectedUserHistory] = useState<UserAccount | null>(null);
  const [selectedUserTxs, setSelectedUserTxs] = useState<Transaction[]>([]);

  // Form States for CRUD Crypto Coins & Networks
  const [editingCoin, setEditingCoin] = useState<CryptoNetwork | null>(null);
  const [coinForm, setCoinForm] = useState<{ id: string; tokenName: string; minWithdrawalUSD: number }>({ id: '', tokenName: '', minWithdrawalUSD: 10 });
  const [coinNetworks, setCoinNetworks] = useState<{ network: string; address: string }[]>([]);
  const [newNetworkName, setNewNetworkName] = useState('');
  const [newNetworkAddress, setNewNetworkAddress] = useState('');

  // Form States for CRUD P2P Merchants
  const [editingMerchant, setEditingMerchant] = useState<P2PMerchant | null>(null);
  const [merchantForm, setMerchantForm] = useState({
    id: '',
    name: '',
    paymentNumber: '',
    rating: '5.0',
    providers: 'M-Pesa, MTN Mobile Money',
    rate: '3750.0',
    type: 'both' as 'buy' | 'sell' | 'both',
    minLimit: '500',
    maxLimit: '500000'
  });

  const [editingRateSymbol, setEditingRateSymbol] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState<string>('');
  const [editingWinRateSymbol, setEditingWinRateSymbol] = useState<string | null>(null);
  const [winRateInput, setWinRateInput] = useState<string>('');
  const [editingMinInvestmentSymbol, setEditingMinInvestmentSymbol] = useState<string | null>(null);
  const [minInvestmentInput, setMinInvestmentInput] = useState<string>('');

  const toast = useToast();
  const [customWipeUID, setCustomWipeUID] = useState('');
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    danger: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    danger: false,
    onConfirm: () => {}
  });

  // Fetch all database records
  const loadAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Fetch Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const uList = usersSnap.docs.map(d => d.data() as UserAccount);
      setUsersList(uList);

      // Fetch Transactions
      const txSnap = await getDocs(collection(db, 'transactions'));
      const tList = txSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data
        } as Transaction;
      });
      // Sort transactions descending by date
      tList.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });
      setTxList(tList);

      // Fetch Crypto Networks
      const netSnap = await getDocs(collection(db, 'crypto_networks'));
      let netList = netSnap.docs.map(d => d.data() as CryptoNetwork);

      const requiredCoins = ['usdt', 'usdc', 'btc', 'eth', 'sol', 'bnb', 'xrp', 'wld', 'trx', 'doge'];
      const defaultNetworksInfo: Record<string, CryptoNetwork> = {
        usdt: {
          id: 'usdt',
          tokenName: 'Tether (USDT)',
          networks: ['TRC20', 'ERC20', 'BEP20'],
          addresses: {
            'TRC20': 'TX8v9nJD7uErsFm2kU9vMQ7vGzB7bY93f4',
            'ERC20': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            'BEP20': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
          }
        },
        usdc: {
          id: 'usdc',
          tokenName: 'USD Coin (USDC)',
          networks: ['ERC20', 'SOLANA', 'TRC20'],
          addresses: {
            'ERC20': '0x95F7a1b8D14E5D466f2C09C726f19DE6D178e24C',
            'SOLANA': 'EPjFW3dpCY3UF296M6ac3yvLCFM3TXrSM2tmc5M96fGP',
            'TRC20': 'THP5Y2Z7vT3uQ9vM5Zg7bX99f36r3qJvU8'
          }
        },
        btc: {
          id: 'btc',
          tokenName: 'Bitcoin (BTC)',
          networks: ['BTC', 'BEP20'],
          addresses: {
            'BTC': '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            'BEP20': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
          }
        },
        eth: {
          id: 'eth',
          tokenName: 'Ethereum (ETH)',
          networks: ['ERC20', 'BEP20'],
          addresses: {
            'ERC20': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            'BEP20': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
          }
        },
        sol: {
          id: 'sol',
          tokenName: 'Solana (SOL)',
          networks: ['SOLANA', 'BEP20'],
          addresses: {
            'SOLANA': 'EPjFW3dpCY3UF296M6ac3yvLCFM3TXrSM2tmc5M96fGP',
            'BEP20': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
          }
        },
        bnb: {
          id: 'bnb',
          tokenName: 'Binance Coin (BNB)',
          networks: ['BEP20', 'BSC'],
          addresses: {
            'BEP20': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            'BSC': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
          }
        },
        xrp: {
          id: 'xrp',
          tokenName: 'XRP (XRP)',
          networks: ['XRP'],
          addresses: {
            'XRP': 'rEb8TK3gBgWvdv8KAcrBgv1vt7gBpt7A8y'
          }
        },
        wld: {
          id: 'wld',
          tokenName: 'World Coin (WLD)',
          networks: ['OPTIMISM', 'ERC20'],
          addresses: {
            'OPTIMISM': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            'ERC20': '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
          }
        },
        trx: {
          id: 'trx',
          tokenName: 'Tron (TRX)',
          networks: ['TRC20'],
          addresses: {
            'TRC20': 'TX8v9nJD7uErsFm2kU9vMQ7vGzB7bY93f4'
          }
        },
        doge: {
          id: 'doge',
          tokenName: 'DOGE Coin (DOGE)',
          networks: ['DOGE'],
          addresses: {
            'DOGE': 'DJpx5LhE4W8pksYV1QW9vQYy4W8pksYV1Q'
          }
        }
      };

      const missingCoins = requiredCoins.filter(id => !netList.some(n => n.id === id));
      if (missingCoins.length > 0) {
        const batch = writeBatch(db);
        missingCoins.forEach((id) => {
          const net = defaultNetworksInfo[id];
          batch.set(doc(db, 'crypto_networks', id), net);
          netList.push(net);
        });
        await batch.commit();
      }

      // Filter and sort to only include these 8 supported coins in the networks list
      netList = netList.filter(n => requiredCoins.includes(n.id));
      netList.sort((a, b) => requiredCoins.indexOf(a.id) - requiredCoins.indexOf(b.id));
      setNetworks(netList);

      // Fetch Merchants
      const merchSnap = await getDocs(collection(db, 'p2p_merchants'));
      const merchList = merchSnap.docs.map(d => d.data() as P2PMerchant);
      setMerchants(merchList);

      // Fetch Crypto Prices
      const pricesSnap = await getDocs(collection(db, 'crypto_prices'));
      let prList = pricesSnap.docs.map(d => d.data() as CryptoPrice);

      const requiredSymbols = ['USDT', 'USDC', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'WLD', 'TRX', 'DOGE'];
      const defaultInfo: Record<string, { name: string; price: number; change24h: number }> = {
        USDT: { name: 'Tether', price: 1.00, change24h: 0.01 },
        USDC: { name: 'USD Coin', price: 1.00, change24h: -0.02 },
        BTC: { name: 'Bitcoin', price: 94250.30, change24h: 3.45 },
        ETH: { name: 'Ethereum', price: 3480.12, change24h: 1.82 },
        SOL: { name: 'Solana', price: 184.45, change24h: -2.15 },
        BNB: { name: 'Binance Coin', price: 592.20, change24h: 0.95 },
        XRP: { name: 'XRP', price: 2.54, change24h: 4.12 },
        WLD: { name: 'World Coin', price: 2.80, change24h: -1.25 },
        TRX: { name: 'Tron', price: 0.22, change24h: 0.45 },
        DOGE: { name: 'DOGE Coin', price: 0.38, change24h: 2.15 }
      };

      const defaultRates: Record<string, number> = {
        USDT: 2.5, USDC: 2.5, BTC: 3.5, ETH: 4.0, SOL: 6.0, BNB: 4.5, XRP: 3.0, WLD: 5.0, TRX: 3.5, DOGE: 7.0
      };

      const defaultWinRates: Record<string, number> = {
        USDT: 99.2, USDC: 99.1, BTC: 97.8, ETH: 96.5, SOL: 95.8, BNB: 96.2, XRP: 94.5, WLD: 93.8, TRX: 95.2, DOGE: 92.4
      };

      const missingSymbols = requiredSymbols.filter(sym => !prList.some(cp => cp.symbol === sym));
      if (missingSymbols.length > 0) {
        const batch = writeBatch(db);
        missingSymbols.forEach((sym) => {
          const cp: CryptoPrice = {
            symbol: sym,
            name: defaultInfo[sym].name,
            price: defaultInfo[sym].price,
            change24h: defaultInfo[sym].change24h,
            mode: 'live',
            lastSyncedAt: new Date().toISOString(),
            investmentRate: defaultRates[sym] || 5.0,
            winRate: defaultWinRates[sym] || 96.0
          };
          batch.set(doc(db, 'crypto_prices', sym), cp);
          prList.push(cp);
        });
        await batch.commit();
      }

      // Ensure all loaded prices have a rate and win rate
      prList = prList.map(cp => {
        if (cp.investmentRate === undefined) {
          cp.investmentRate = defaultRates[cp.symbol] || 5.0;
        }
        if (cp.winRate === undefined) {
          cp.winRate = defaultWinRates[cp.symbol] || 96.0;
        }
        return cp;
      });

      // Filter and sort
      prList = prList.filter(cp => requiredSymbols.includes(cp.symbol));
      prList.sort((a, b) => requiredSymbols.indexOf(a.symbol) - requiredSymbols.indexOf(b.symbol));
      setCryptoPricesList(prList);

      // Fetch Investments
      const invSnap = await getDocs(collection(db, 'investments'));
      const invList = invSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setInvestmentsList(invList);

      // Fetch Arbitrage Config Settings
      const arbDocRef = doc(db, 'settings', 'arbitrage_config');
      const arbDocSnap = await getDoc(arbDocRef);
      if (arbDocSnap.exists()) {
        setArbitrageConfig(arbDocSnap.data() as ArbitrageConfig);
      } else {
        const defaultArb: ArbitrageConfig = {
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
        };
        await setDoc(arbDocRef, defaultArb);
        setArbitrageConfig(defaultArb);
      }

      // Fetch Referral Deposit Config Settings
      const refDepDocRef = doc(db, 'settings', 'referral_deposit_config');
      const refDepDocSnap = await getDoc(refDepDocRef);
      if (refDepDocSnap.exists()) {
        setReferralConfig(refDepDocSnap.data() as ReferralDepositConfig);
      } else {
        const defaultRefDep: ReferralDepositConfig = {
          enabled: true,
          minDepositThresholdUSD: 10,
          tiers: [
            { id: 'tier-1', minAmount: 10, maxAmount: 99.99, referrerPercent: 5, refereePercent: 10 },
            { id: 'tier-2', minAmount: 100, maxAmount: 499.99, referrerPercent: 7, refereePercent: 12 },
            { id: 'tier-3', minAmount: 500, maxAmount: 10000, referrerPercent: 10, refereePercent: 15 },
          ]
        };
        await setDoc(refDepDocRef, defaultRefDep);
        setReferralConfig(defaultRefDep);
      }

      // Fetch Bot Templates
      const botTplSnap = await getDocs(collection(db, 'bot_templates'));
      let bTpls = botTplSnap.docs.map(d => ({ ...d.data(), id: d.id } as BotTemplate));
      if (bTpls.length === 0) {
        const defaultBts = [
          {
            id: 'arb_sniper',
            name: 'Arbitrage Flash-Loan Sniper',
            category: 'PREMIUM',
            winRatioRange: '95%',
            winProfitRange: '1.5% - 2.5%',
            lossPercentRange: '0.4% - 1.4%',
            minCapital: 50,
            tradingPairs: ['XAUUSD', 'BTCUSD', 'EURUSD'],
            riskLevel: 'Low Risk',
            color: 'from-amber-500 to-yellow-500'
          },
          {
            id: 'grid_scalper',
            name: 'AI Grid Scalper Pro',
            category: 'PREMIUM',
            winRatioRange: '90%',
            winProfitRange: '1.2% - 2.0%',
            lossPercentRange: '0.5% - 1.2%',
            minCapital: 100,
            tradingPairs: ['XAUUSD', 'BTCUSD', 'EURUSD'],
            riskLevel: 'Medium Risk',
            color: 'from-emerald-500 to-teal-500'
          },
          {
            id: 'dca_accumulator',
            name: 'DCA Smart Accumulator',
            category: 'FREE',
            winRatioRange: '98%',
            winProfitRange: '1.0% - 1.8%',
            lossPercentRange: '0.3% - 0.8%',
            minCapital: 25,
            tradingPairs: ['XAUUSD', 'BTCUSD', 'EURUSD'],
            riskLevel: 'Very Low Risk',
            color: 'from-blue-500 to-indigo-500'
          }
        ];
        const batch = writeBatch(db);
        defaultBts.forEach(bt => {
          batch.set(doc(db, 'bot_templates', bt.id), bt);
        });
        await batch.commit();
        bTpls = defaultBts;
      }
      bTpls.sort((a, b) => Number(a.minCapital ?? 0) - Number(b.minCapital ?? 0));
      setBotTemplatesList(bTpls);

      // Fetch User Trading Bots
      const botsSnap = await getDocs(collection(db, 'user_bots'));
      const uBotsList = botsSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setUserBotsList(uBotsList);

      // Fetch Copy Trader Leads
      const copyLeadsSnap = await getDocs(collection(db, 'copy_trader_leads'));
      let leads = copyLeadsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CopyTraderLead));

      if (leads.length === 0) {
        for (const defaultLead of DEFAULT_COPY_LEADS) {
          try {
            await setDoc(doc(db, 'copy_trader_leads', defaultLead.id), defaultLead);
          } catch (e) {
            console.error("Error seeding copy lead:", e);
          }
        }
        leads = [...DEFAULT_COPY_LEADS];
      }
      setCopyLeadsList(leads);

    } catch (err: any) {
      console.error("Error loading admin data: ", err);
      showFeedback('error', 'Failed to retrieve cloud data snapshots: ' + err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Automatic syncing of live market prices every 15 seconds
  useEffect(() => {
    // Run an initial silent sync on load/mount
    handleSyncAllLivePrices(true);

    const interval = setInterval(() => {
      handleSyncAllLivePrices(true);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const showFeedback = (type: 'success' | 'error' | 'info', text: string) => {
    setFeedbackMsg({ type, text });
    if (type === 'success') {
      toast.success(text, 'Success');
    } else if (type === 'error') {
      toast.error(text, 'Error');
    } else {
      toast.info(text, 'System Notice');
    }
  };

  // Helper date formatter
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // 1. User Management Functions
  const handleToggleWithdrawal = async (u: UserAccount) => {
    setActioning(u.uid);
    try {
      const userRef = doc(db, 'users', u.uid);
      await updateDoc(userRef, {
        withdrawalEnabled: !u.withdrawalEnabled
      });
      showFeedback('success', `User withdrawal permission ${!u.withdrawalEnabled ? 'ENABLED' : 'DISABLED'} successfully.`);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to update withdrawal permission: ' + err.message);
    } finally {
      setActioning(null);
    }
  };

  const handleDeleteUser = (u: UserAccount) => {
    const userTxs = txList.filter(t => t.userId === u.uid);
    const userInvs = investmentsList.filter(inv => inv.userId === u.uid);
    const userBots = userBotsList.filter(bot => bot.userId === u.uid);

    setConfirmModal({
      isOpen: true,
      title: 'Permanently Delete User Account & All Data?',
      message: `CRITICAL WARNING: Are you absolutely sure you want to permanently delete user ${u.email}? This action will permanently remove their Firestore user profile, ${userTxs.length} transaction record(s), ${userInvs.length} investment portfolio(s), and ${userBots.length} trading bot(s). This action is completely irreversible.`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setActioning(u.uid);
        try {
          const batch = writeBatch(db);

          // 1. Delete user profile doc
          batch.delete(doc(db, 'users', u.uid));

          // 2. Delete all user transaction records
          userTxs.forEach(t => {
            batch.delete(doc(db, 'transactions', t.id));
          });

          // 3. Delete all user investment records
          userInvs.forEach(inv => {
            batch.delete(doc(db, 'investments', inv.id));
          });

          // 4. Delete all user bot records
          userBots.forEach(bot => {
            batch.delete(doc(db, 'user_bots', bot.id));
          });

          await batch.commit();

          showFeedback('success', `User account ${u.email} and all associated data (txs: ${userTxs.length}, investments: ${userInvs.length}, bots: ${userBots.length}) were permanently deleted.`);
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Error deleting user: ' + err.message);
        } finally {
          setActioning(null);
        }
      }
    });
  };

  // Dual Password Reset options
  const handleSendResetEmail = async (u: UserAccount) => {
    setActioning(u.uid);
    try {
      await sendPasswordResetEmail(auth, u.email);
      showFeedback('success', `Firebase Authentication reset password email successfully sent to ${u.email}.`);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to dispatch reset email: ' + err.message);
    } finally {
      setActioning(null);
    }
  };

  const handleUpdateLocalPIN = async (u: UserAccount) => {
    const newPIN = prompt(`Enter new secure Local transaction PIN/wallet password for ${u.email}:`);
    if (!newPIN) return;
    setActioning(u.uid);
    try {
      const userRef = doc(db, 'users', u.uid);
      await updateDoc(userRef, { walletPassword: newPIN });
      showFeedback('success', `Local transaction PIN wallet password successfully updated for ${u.email}.`);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to update transaction password: ' + err.message);
    } finally {
      setActioning(null);
    }
  };

  const handleUpdateUserPhone = async (u: UserAccount) => {
    const currentPhone = u.phone || (u as any).phoneNumber || '';
    const newPhone = prompt(`Enter updated Phone Number for user ${u.email}:`, currentPhone);
    if (newPhone === null) return;
    setActioning(u.uid);
    try {
      const userRef = doc(db, 'users', u.uid);
      const cleanPhone = newPhone.trim();
      await updateDoc(userRef, { 
        phone: cleanPhone,
        phoneNumber: cleanPhone 
      });
      showFeedback('success', `Phone number successfully updated for ${u.email}.`);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to update user phone number: ' + err.message);
    } finally {
      setActioning(null);
    }
  };

  const handleOpenUserHistory = (u: UserAccount) => {
    const userTxs = txList.filter(t => t.userId === u.uid);
    setSelectedUserHistory(u);
    setSelectedUserTxs(userTxs);
  };

  const handleDeleteAllTransactions = (uid: string, email: string) => {
    const userTxs = txList.filter(t => t.userId === uid);
    if (userTxs.length === 0) {
      showFeedback('error', `No transactions found to delete for ${email}.`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Delete All Transactions?',
      message: `Are you sure you want to PERMANENTLY DELETE all ${userTxs.length} transaction records for ${email}? This action is irreversible, cannot be undone, and will wipe out their entire history in the database.`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setActioning(uid);
        try {
          const batch = writeBatch(db);
          userTxs.forEach(t => {
            batch.delete(doc(db, 'transactions', t.id));
          });
          await batch.commit();

          showFeedback('success', `Successfully wiped all ${userTxs.length} transaction records for ${email}.`);
          
          // Clear active logs modal view
          setSelectedUserTxs([]);
          
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to delete all transactions: ' + err.message);
        } finally {
          setActioning(null);
        }
      }
    });
  };

  const handleDeleteAllInvestments = (uid: string, email: string) => {
    const userInvs = investmentsList.filter(inv => inv.userId === uid);
    if (userInvs.length === 0) {
      showFeedback('error', `No investment records found to delete for ${email}.`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Delete All Investment Portfolios?',
      message: `Are you sure you want to PERMANENTLY DELETE all ${userInvs.length} investment portfolio records for ${email}? This action is irreversible and cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setActioning(uid);
        try {
          const batch = writeBatch(db);
          userInvs.forEach(inv => {
            batch.delete(doc(db, 'investments', inv.id));
          });
          await batch.commit();

          showFeedback('success', `Successfully wiped all ${userInvs.length} investment records for ${email}.`);
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to delete investments: ' + err.message);
        } finally {
          setActioning(null);
        }
      }
    });
  };

  const handleDeleteAllBots = (uid: string, email: string) => {
    const userBots = userBotsList.filter(bot => bot.userId === uid);
    if (userBots.length === 0) {
      showFeedback('error', `No AI trading bot records found to delete for ${email}.`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Delete All AI Trading Bots?',
      message: `Are you sure you want to PERMANENTLY DELETE all ${userBots.length} trading bot records for ${email}? This action is irreversible and cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setActioning(uid);
        try {
          const batch = writeBatch(db);
          userBots.forEach(bot => {
            batch.delete(doc(db, 'user_bots', bot.id));
          });
          await batch.commit();

          showFeedback('success', `Successfully wiped all ${userBots.length} AI trading bot records for ${email}.`);
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to delete bot records: ' + err.message);
        } finally {
          setActioning(null);
        }
      }
    });
  };

  const handleWipeAllUserData = (uid: string, email: string) => {
    const userTxs = txList.filter(t => t.userId === uid);
    const userInvs = investmentsList.filter(inv => inv.userId === uid);
    const userBots = userBotsList.filter(bot => bot.userId === uid);

    const totalRecords = userTxs.length + userInvs.length + userBots.length;
    if (totalRecords === 0) {
      showFeedback('error', `No transaction, investment, or bot records found for ${email}.`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Wipe All Activity Data for User?',
      message: `Are you sure you want to PERMANENTLY WIPE all ${totalRecords} records (${userTxs.length} transaction(s), ${userInvs.length} investment(s), ${userBots.length} bot(s)) for ${email}? The user's account profile will remain, but all activity history will be cleared.`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setActioning(uid);
        try {
          const batch = writeBatch(db);
          userTxs.forEach(t => batch.delete(doc(db, 'transactions', t.id)));
          userInvs.forEach(inv => batch.delete(doc(db, 'investments', inv.id)));
          userBots.forEach(bot => batch.delete(doc(db, 'user_bots', bot.id)));
          await batch.commit();

          showFeedback('success', `Successfully wiped all ${totalRecords} activity records for ${email}.`);
          setSelectedUserTxs([]);
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to wipe user data: ' + err.message);
        } finally {
          setActioning(null);
        }
      }
    });
  };

  // Save Referral Deposit Config Handler
  const handleSaveReferralConfig = async () => {
    setIsSavingReferralConfig(true);
    try {
      await setDoc(doc(db, 'settings', 'referral_deposit_config'), referralConfig);
      showFeedback('success', 'Referral & Welcome Deposit Bonus settings updated successfully.');
    } catch (err: any) {
      console.error('Error saving referral config:', err);
      showFeedback('error', 'Failed to save referral settings: ' + err.message);
    } finally {
      setIsSavingReferralConfig(false);
    }
  };

  // 2. Deposit Approval Logic
  const handleApproveDeposit = async (tx: Transaction) => {
    setActioning(tx.id);
    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, 'transactions', tx.id);
        const userRef = doc(db, 'users', tx.userId);

        // --- STEP 1: ALL READS FIRST ---
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
          throw new Error('User account does not exist in our systems.');
        }

        const userData = userSnap.data();
        const isFirstDeposit = !userData.hasMadeFirstDeposit;

        // Read referral config
        let config = referralConfig;
        const configDocRef = doc(db, 'settings', 'referral_deposit_config');
        const configSnap = await transaction.get(configDocRef);
        if (configSnap.exists()) {
          config = configSnap.data() as ReferralDepositConfig;
        }

        // Read referrer information if first deposit and referral source exists
        let referrerUid: string | null = null;
        let referrerRef: any = null;
        let referrerData: any = null;

        if (isFirstDeposit && userData.referralSource && userData.referralSource.trim().length > 0) {
          const refCodeStr = userData.referralSource.trim().toUpperCase();
          const refMappingRef = doc(db, 'referralCodes', refCodeStr);
          const refMappingSnap = await transaction.get(refMappingRef);

          if (refMappingSnap.exists()) {
            const mappedUid = refMappingSnap.data().uid;
            if (mappedUid && mappedUid !== tx.userId) {
              const rRef = doc(db, 'users', mappedUid);
              const rSnap = await transaction.get(rRef);
              if (rSnap.exists()) {
                referrerUid = mappedUid;
                referrerRef = rRef;
                referrerData = rSnap.data();
              }
            }
          }
        }

        // --- STEP 2: ALL COMPUTATIONS & WRITES ONLY ---
        const currentBalance = userData.balance || 0;
        const currentHoldings: Record<string, number> = userData.holdings || {};

        const coinSymbol = tx.coinSymbol ? tx.coinSymbol.toUpperCase() : 'USDT';
        const coinAmount = tx.coinAmount !== undefined && tx.coinAmount !== null && tx.coinAmount > 0 
          ? tx.coinAmount 
          : tx.amount;

        const depositAmountUSD = tx.amount || coinAmount || 0;
        let updatedBalance = currentBalance;
        let updatedHoldings: Record<string, number> | null = null;

        if (coinSymbol === 'USDT' || tx.type === 'deposit_p2p' || !tx.coinSymbol) {
          // Permanently credit the user's USDT wallet balance
          updatedBalance = parseFloat((currentBalance + coinAmount).toFixed(2));
        } else {
          // Permanently credit the specific coin into user's holdings
          const currentCoinBalance = currentHoldings[coinSymbol] || 0;
          const newCoinBalance = parseFloat((currentCoinBalance + coinAmount).toFixed(8));
          updatedHoldings = {
            ...currentHoldings,
            [coinSymbol]: newCoinBalance
          };
        }

        // --- FIRST DEPOSIT BONUS & REFERRAL COMMISSION LOGIC ---
        if (isFirstDeposit && config && config.enabled && depositAmountUSD >= (config.minDepositThresholdUSD || 0)) {
          // Determine reward percentages strictly from custom tier ranges
          let referrerPct = 0;
          let refereePct = 0;

          if (config.tiers && config.tiers.length > 0) {
            const matchedTier = config.tiers.find(
              t => depositAmountUSD >= t.minAmount && depositAmountUSD <= t.maxAmount
            );
            if (matchedTier) {
              referrerPct = matchedTier.referrerPercent;
              refereePct = matchedTier.refereePercent;
            }
          }

          // 1. Referee Welcome Bonus
          const welcomeBonusAmount = parseFloat(((depositAmountUSD * refereePct) / 100).toFixed(2));
          if (welcomeBonusAmount > 0) {
            updatedBalance = parseFloat((updatedBalance + welcomeBonusAmount).toFixed(2));

            const welcomeTxRef = doc(collection(db, 'transactions'));
            transaction.set(welcomeTxRef, {
              id: welcomeTxRef.id,
              userId: tx.userId,
              userEmail: tx.userEmail,
              type: 'welcome_bonus',
              amount: welcomeBonusAmount,
              status: 'APPROVED',
              createdAt: serverTimestamp(),
              paymentMessage: `First Deposit Welcome Bonus (${refereePct}% of $${depositAmountUSD.toFixed(2)} deposit)`
            });
          }

          // 2. Referrer First Deposit Commission
          if (referrerUid && referrerRef && referrerData) {
            const commissionAmount = parseFloat(((depositAmountUSD * referrerPct) / 100).toFixed(2));

            if (commissionAmount > 0) {
              const newReferrerBalance = parseFloat(((referrerData.balance || 0) + commissionAmount).toFixed(2));
              transaction.update(referrerRef, { balance: newReferrerBalance });

              const commissionTxRef = doc(collection(db, 'transactions'));
              transaction.set(commissionTxRef, {
                id: commissionTxRef.id,
                userId: referrerUid,
                userEmail: referrerData.email || 'Referrer',
                type: 'first_deposit_commission',
                amount: commissionAmount,
                status: 'APPROVED',
                createdAt: serverTimestamp(),
                paymentMessage: `Referral First Deposit Bonus (${referrerPct}% of $${depositAmountUSD.toFixed(2)} deposit by ${tx.userEmail})`
              });
            }
          }
        }

        // Prepare user updates payload
        const userUpdatePayload: any = {
          balance: updatedBalance,
          hasMadeFirstDeposit: true
        };
        if (updatedHoldings) {
          userUpdatePayload.holdings = updatedHoldings;
        }

        // Update user record with updated balance and set hasMadeFirstDeposit: true
        transaction.update(userRef, userUpdatePayload);

        // Update transaction status to APPROVED
        transaction.update(txRef, {
          status: 'APPROVED'
        });
      });

      const displayAmountStr = tx.coinSymbol && tx.coinSymbol.toUpperCase() !== 'USDT' && tx.coinAmount
        ? `${tx.coinAmount} ${tx.coinSymbol}`
        : `$${tx.amount?.toFixed(2)}`;

      showFeedback('success', `Transaction ${tx.id} approved successfully. Credited ${displayAmountStr} to ${tx.userEmail}.`);
      await loadAllData(true);
    } catch (err: any) {
      console.error("Error approving deposit: ", err);
      showFeedback('error', 'Failed to approve deposit: ' + err.message);
    } finally {
      setActioning(null);
    }
  };

  const handleDeclineDeposit = async (tx: Transaction) => {
    setActioning(tx.id);
    try {
      const txRef = doc(db, 'transactions', tx.id);
      await updateDoc(txRef, {
        status: 'DECLINED'
      });
      showFeedback('success', `Transaction ${tx.id} declined successfully.`);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to decline transaction: ' + err.message);
    } finally {
      setActioning(null);
    }
  };

  // 3. Withdrawal Operations
  const handleApproveWithdrawal = async (tx: Transaction) => {
    setActioning(tx.id);
    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, 'transactions', tx.id);
        // Balance was already deducted upfront upon placing withdrawal request
        transaction.update(txRef, {
          status: 'APPROVED'
        });
      });

      const netAmountDisplay = tx.netAmount !== undefined ? tx.netAmount : parseFloat((tx.amount * 0.90).toFixed(2));
      showFeedback('success', `Withdrawal approved successfully! Net payout amount: $${netAmountDisplay.toFixed(2)} USD.`);
      await loadAllData(true);
    } catch (err: any) {
      console.error("Error approving withdrawal: ", err);
      showFeedback('error', 'Error approving withdrawal: ' + err.message);
    } finally {
      setActioning(null);
    }
  };

  const handleRejectWithdrawal = async (tx: Transaction) => {
    setActioning(tx.id);
    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, 'transactions', tx.id);
        const userRef = doc(db, 'users', tx.userId);

        const userSnap = await transaction.get(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const coinSym = tx.coinSymbol ? tx.coinSymbol.toUpperCase() : 'USDT';

          if (coinSym === 'USDT') {
            const currentBalance = userData.balance || 0;
            transaction.update(userRef, {
              balance: parseFloat((currentBalance + tx.amount).toFixed(2))
            });
          } else {
            const currentHoldings = userData.holdings || {};
            const currentCoinBalance = currentHoldings[coinSym] || 0;
            const coinAmtToRefund = tx.coinAmount || (tx.amount > 0 ? tx.amount : 0);

            transaction.update(userRef, {
              holdings: {
                ...currentHoldings,
                [coinSym]: parseFloat((currentCoinBalance + coinAmtToRefund).toFixed(8))
              }
            });
          }
        }

        // Change status to DECLINED
        transaction.update(txRef, {
          status: 'DECLINED'
        });
      });

      showFeedback('success', `Withdrawal rejected and gross $${tx.amount} refunded back to user's wallet.`);
      await loadAllData(true);
    } catch (err: any) {
      console.error("Error rejecting withdrawal: ", err);
      showFeedback('error', 'Error rejecting withdrawal: ' + err.message);
    } finally {
      setActioning(null);
    }
  };

  const handleDeleteTransaction = (tx: Transaction | string) => {
    const txObj = typeof tx === 'string' ? txList.find(t => t.id === tx) : tx;
    const txId = typeof tx === 'string' ? tx : tx.id;

    setConfirmModal({
      isOpen: true,
      title: 'Delete Transaction Record?',
      message: txObj && txObj.type.startsWith('withdraw') && txObj.status === 'PENDING APPROVAL'
        ? 'Deleting this pending withdrawal will automatically refund the deducted funds back to the user\'s wallet. Proceed?'
        : 'Are you sure you want to PERMANENTLY DELETE this transaction from the records? This cannot be undone.',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setActioning(txId);
        try {
          if (txObj && txObj.type.startsWith('withdraw') && txObj.status === 'PENDING APPROVAL') {
            await runTransaction(db, async (transaction) => {
              const txRef = doc(db, 'transactions', txId);
              const userRef = doc(db, 'users', txObj.userId);
              const userSnap = await transaction.get(userRef);

              if (userSnap.exists()) {
                const userData = userSnap.data();
                const coinSym = txObj.coinSymbol ? txObj.coinSymbol.toUpperCase() : 'USDT';

                if (coinSym === 'USDT') {
                  const currentBalance = userData.balance || 0;
                  transaction.update(userRef, {
                    balance: parseFloat((currentBalance + txObj.amount).toFixed(2))
                  });
                } else {
                  const currentHoldings = userData.holdings || {};
                  const currentCoinBalance = currentHoldings[coinSym] || 0;
                  const coinAmtToRefund = txObj.coinAmount || (txObj.amount > 0 ? txObj.amount : 0);

                  transaction.update(userRef, {
                    holdings: {
                      ...currentHoldings,
                      [coinSym]: parseFloat((currentCoinBalance + coinAmtToRefund).toFixed(8))
                    }
                  });
                }
              }
              transaction.delete(txRef);
            });
            showFeedback('success', 'Pending withdrawal deleted and funds refunded to user.');
          } else {
            await deleteDoc(doc(db, 'transactions', txId));
            showFeedback('success', 'Transaction record deleted permanently.');
          }
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to delete transaction: ' + err.message);
        } finally {
          setActioning(null);
        }
      }
    });
  };

  // 4. Crypto Stablecoins CRUD Management
  const startCoinEdit = (coin: CryptoNetwork) => {
    setEditingCoin(coin);
    setCoinForm({
      id: coin.id,
      tokenName: coin.tokenName,
      minWithdrawalUSD: coin.minWithdrawalUSD ?? 10
    });
    // Convert Record<string, string> addresses to arrays for editing
    const list = coin.networks.map(net => ({
      network: net,
      address: coin.addresses[net] || ''
    }));
    setCoinNetworks(list);
    setNewNetworkName('');
    setNewNetworkAddress('');
  };

  const startNewCoin = () => {
    setEditingCoin(null);
    setCoinForm({ id: '', tokenName: '', minWithdrawalUSD: 10 });
    setCoinNetworks([]);
    setNewNetworkName('');
    setNewNetworkAddress('');
  };

  const handleAddNetworkToCoin = () => {
    if (!newNetworkName.trim() || !newNetworkAddress.trim()) {
      alert('Please fill in both the network name (e.g. TRC20) and the destination address.');
      return;
    }
    const nameUpper = newNetworkName.trim().toUpperCase();
    const existingIndex = coinNetworks.findIndex(n => n.network === nameUpper);
    if (existingIndex !== -1) {
      // Edit mode: replace the address of the existing network pathway
      const updated = [...coinNetworks];
      updated[existingIndex].address = newNetworkAddress.trim();
      setCoinNetworks(updated);
    } else {
      // Add mode: insert a new network pathway
      setCoinNetworks([...coinNetworks, { network: nameUpper, address: newNetworkAddress.trim() }]);
    }
    setNewNetworkName('');
    setNewNetworkAddress('');
  };

  const handleRemoveNetworkFromCoin = (index: number) => {
    setCoinNetworks(coinNetworks.filter((_, i) => i !== index));
  };

  const handleSaveCoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coinForm.id.trim() || !coinForm.tokenName.trim()) {
      alert('Please provide a Coin ID/Symbol and Token Full Name.');
      return;
    }

    const docId = coinForm.id.trim().toLowerCase();
    const finalNetworks = coinNetworks.map(n => n.network);
    const finalAddresses: Record<string, string> = {};
    coinNetworks.forEach(n => {
      finalAddresses[n.network] = n.address;
    });

    try {
      await setDoc(doc(db, 'crypto_networks', docId), {
        id: docId,
        tokenName: coinForm.tokenName.trim(),
        networks: finalNetworks,
        addresses: finalAddresses,
        minWithdrawalUSD: Number(coinForm.minWithdrawalUSD) > 0 ? Number(coinForm.minWithdrawalUSD) : 10
      });

      showFeedback('success', `Crypto coin ${coinForm.tokenName} configuration successfully saved.`);
      setEditingCoin(null);
      startNewCoin();
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to save coin configurations: ' + err.message);
    }
  };

  const handleDeleteCoin = (coinId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Crypto Asset?',
      message: 'Are you absolutely sure you want to delete this coin and all its supporting networks?',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteDoc(doc(db, 'crypto_networks', coinId));
          showFeedback('success', 'Coin configuration removed successfully.');
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to delete coin: ' + err.message);
        }
      }
    });
  };

  // 5. P2P Merchant CRUD Management
  const startMerchantEdit = (m: P2PMerchant) => {
    setEditingMerchant(m);
    setMerchantForm({
      id: m.id,
      name: m.name,
      paymentNumber: m.paymentNumber,
      rating: m.rating.toString(),
      providers: m.providers.join(', '),
      rate: m.rate.toString(),
      type: m.type || 'both',
      minLimit: (m.minLimit !== undefined ? m.minLimit : 500).toString(),
      maxLimit: (m.maxLimit !== undefined ? m.maxLimit : 500000).toString()
    });
  };

  const startNewMerchant = () => {
    setEditingMerchant(null);
    setMerchantForm({
      id: '',
      name: '',
      paymentNumber: '',
      rating: '5.0',
      providers: 'M-Pesa, MTN Mobile Money',
      rate: '3750.0',
      type: 'both',
      minLimit: '500',
      maxLimit: '500000'
    });
  };

  const handleSaveMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantForm.name.trim() || !merchantForm.rate.trim()) {
      alert('Please fill out Name and Conversion Rate.');
      return;
    }

    const docId = merchantForm.id.trim() || 'merch-' + Math.floor(Math.random() * 100000);
    const providersList = merchantForm.providers.split(',').map(s => s.trim()).filter(Boolean);

    try {
      await setDoc(doc(db, 'p2p_merchants', docId), {
        id: docId,
        name: merchantForm.name.trim(),
        paymentNumber: merchantForm.paymentNumber.trim(),
        rating: parseFloat(merchantForm.rating) || 5.0,
        providers: providersList,
        rate: parseFloat(merchantForm.rate) || 1.0,
        type: merchantForm.type,
        minLimit: parseFloat(merchantForm.minLimit) || 0,
        maxLimit: parseFloat(merchantForm.maxLimit) || 0
      });

      showFeedback('success', `P2P Merchant "${merchantForm.name}" successfully saved.`);
      startNewMerchant();
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to save merchant configurations: ' + err.message);
    }
  };

  const handleDeleteMerchant = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete P2P Merchant?',
      message: 'Are you absolutely sure you want to delete this P2P merchant configuration?',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteDoc(doc(db, 'p2p_merchants', id));
          showFeedback('success', 'Merchant configuration removed successfully.');
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to delete merchant: ' + err.message);
        }
      }
    });
  };

  const handleDeleteBotTemplate = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Bot Template?',
      message: 'Are you sure you want to delete this bot template from the marketplace?',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteDoc(doc(db, 'bot_templates', id));
          showFeedback('success', 'Bot template removed successfully.');
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to delete bot template: ' + err.message);
        }
      }
    });
  };

  // 6. Crypto Live Price Management
  const handleSaveCryptoPrice = async (symbol: string, name: string) => {
    const priceVal = parseFloat(priceForm.price);
    const changeVal = parseFloat(priceForm.change24h);
    if (isNaN(priceVal)) {
      alert('Please enter a valid price.');
      return;
    }
    
    try {
      await setDoc(doc(db, 'crypto_prices', symbol), {
        symbol,
        name,
        price: priceVal,
        change24h: isNaN(changeVal) ? 0 : changeVal,
        mode: 'custom',
        lastSyncedAt: new Date().toISOString()
      }, { merge: true });
      showFeedback('success', `Live price of ${symbol} updated to custom $${priceVal.toLocaleString()} (${changeVal || 0}%).`);
      setEditingPriceSymbol(null);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to update coin price: ' + err.message);
    }
  };

  const handleSwitchToLiveMode = async (symbol: string, name: string) => {
    try {
      showFeedback('info', `Fetching live world price for ${symbol}...`);
      const apiResult = await fetchLivePriceFromBinance(symbol);
      await setDoc(doc(db, 'crypto_prices', symbol), {
        symbol,
        name,
        price: apiResult.price,
        change24h: apiResult.change24h,
        mode: 'live',
        lastSyncedAt: new Date().toISOString()
      }, { merge: true });
      showFeedback('success', `Successfully set ${symbol} to Live Market mode: $${apiResult.price.toLocaleString()} (${apiResult.change24h}%).`);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', `Failed to sync live market price for ${symbol}: ` + err.message);
    }
  };

  const handleSwitchToCustomMode = async (symbol: string, name: string, currentPrice: number, currentChange: number) => {
    try {
      await setDoc(doc(db, 'crypto_prices', symbol), {
        symbol,
        name,
        price: currentPrice,
        change24h: currentChange,
        mode: 'custom',
        lastSyncedAt: new Date().toISOString()
      }, { merge: true });
      setEditingPriceSymbol(symbol);
      setPriceForm({ price: currentPrice.toString(), change24h: currentChange.toString() });
      showFeedback('success', `${symbol} switched to Custom Controlled mode. Edit values below.`);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', `Failed to set ${symbol} to Custom mode: ` + err.message);
    }
  };

  const handleSaveInvestmentRate = async (symbol: string) => {
    const rateVal = parseFloat(rateInput);
    if (isNaN(rateVal) || rateVal < 0) {
      alert('Please enter a valid investment rate.');
      return;
    }
    try {
      const coinRef = doc(db, 'crypto_prices', symbol);
      await updateDoc(coinRef, {
        investmentRate: rateVal
      });
      showFeedback('success', `Signal Rate for ${symbol} updated to ${rateVal}%.`);
      setEditingRateSymbol(null);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to update profit rate: ' + err.message);
    }
  };

  const handleSaveWinRate = async (symbol: string) => {
    const winVal = parseFloat(winRateInput);
    if (isNaN(winVal) || winVal < 0 || winVal > 100) {
      alert('Please enter a valid Win Rate percentage (0 - 100%).');
      return;
    }
    try {
      const coinRef = doc(db, 'crypto_prices', symbol);
      await updateDoc(coinRef, {
        winRate: winVal
      });
      showFeedback('success', `Signal Win Rate for ${symbol} updated to ${winVal}%.`);
      setEditingWinRateSymbol(null);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to update signal win rate: ' + err.message);
    }
  };

  const handleSaveMinInvestment = async (symbol: string) => {
    const minVal = parseFloat(minInvestmentInput);
    if (isNaN(minVal) || minVal < 0) {
      alert('Please enter a valid minimum investment amount.');
      return;
    }
    try {
      const coinRef = doc(db, 'crypto_prices', symbol);
      await updateDoc(coinRef, {
        minInvestment: minVal
      });
      showFeedback('success', `Minimum Investment for ${symbol} updated to ${minVal}.`);
      setEditingMinInvestmentSymbol(null);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to update minimum investment amount: ' + err.message);
    }
  };

  // Copy Trader Leads Handlers
  const handleOpenAddLead = () => {
    setEditingLead(null);
    setLeadForm({
      name: '',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
      description: '',
      signalsPerDay: '2 signals/day',
      winRate: '98.5%',
      minCapital: '50',
      maxCapital: '10000',
      analysisCommission: '10',
      dayProfitRate: '2.0',
      contractDurationDays: '30',
      tradingPairs: 'BTC/USDT, ETH/USDT, SOL/USDT, XRP/USDT',
      sig1Time: '13:00',
      sig1Code: 'SIG1300',
      sig2Time: '20:00',
      sig2Code: 'SIG2000',
      riskLevel: 'Low Risk'
    });
    setIsAddLeadModalOpen(true);
  };

  const handleOpenEditLead = (lead: CopyTraderLead) => {
    setEditingLead(lead);
    const sig1 = lead.signals?.[0];
    const sig2 = lead.signals?.[1];

    setLeadForm({
      name: lead.name || '',
      photoUrl: lead.photoUrl || '',
      description: lead.description || '',
      signalsPerDay: lead.signalsPerDay || '2 signals/day',
      winRate: lead.winRate || '98.5%',
      minCapital: (lead.minCapital ?? 50).toString(),
      maxCapital: (lead.maxCapital ?? 10000).toString(),
      analysisCommission: (lead.analysisCommission ?? 10).toString(),
      dayProfitRate: (lead.dayProfitRate ?? 2.0).toString(),
      contractDurationDays: (lead.contractDurationDays ?? 30).toString(),
      tradingPairs: lead.tradingPairs ? lead.tradingPairs.join(', ') : 'BTC/USDT, ETH/USDT, SOL/USDT, XRP/USDT',
      sig1Time: sig1?.time || '13:00',
      sig1Code: sig1?.code || 'SIG1300',
      sig2Time: sig2?.time || '20:00',
      sig2Code: sig2?.code || 'SIG2000',
      riskLevel: lead.riskLevel || 'Low Risk'
    });
    setIsAddLeadModalOpen(true);
  };

  const handleSaveLead = async () => {
    if (!leadForm.name.trim()) {
      showFeedback('error', 'Please enter expert trader name');
      return;
    }
    if (!leadForm.description.trim()) {
      showFeedback('error', 'Please enter professional description');
      return;
    }

    setIsSavingLead(true);
    try {
      const pairs = leadForm.tradingPairs
        ? leadForm.tradingPairs.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        : ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];

      const signalsList = [
        { id: 'sig-1', time: leadForm.sig1Time.trim() || '13:00', code: leadForm.sig1Code.trim() || 'SIG1300' },
        { id: 'sig-2', time: leadForm.sig2Time.trim() || '20:00', code: leadForm.sig2Code.trim() || 'SIG2000' }
      ];

      const leadData: Partial<CopyTraderLead> = {
        name: leadForm.name.trim(),
        photoUrl: leadForm.photoUrl.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
        description: leadForm.description.trim(),
        signalsPerDay: `${signalsList.length} signals/day`,
        winRate: leadForm.winRate.trim() || '98.5%',
        minCapital: parseFloat(leadForm.minCapital) || 50,
        maxCapital: parseFloat(leadForm.maxCapital) || 10000,
        analysisCommission: parseFloat(leadForm.analysisCommission) || 10,
        dayProfitRate: parseFloat(leadForm.dayProfitRate) || 2.0,
        contractDurationDays: parseInt(leadForm.contractDurationDays) || 30,
        tradingPairs: pairs,
        signals: signalsList,
        riskLevel: leadForm.riskLevel || 'Low Risk',
        updatedAt: new Date().toISOString()
      };

      if (editingLead) {
        await updateDoc(doc(db, 'copy_trader_leads', editingLead.id), leadData);
        showFeedback('success', `Copy Trader Lead "${leadForm.name}" updated successfully.`);
      } else {
        const newId = 'lead-' + Date.now();
        await setDoc(doc(db, 'copy_trader_leads', newId), {
          id: newId,
          ...leadData,
          createdAt: new Date().toISOString()
        });
        showFeedback('success', `New Copy Trader Lead "${leadForm.name}" added successfully.`);
      }

      setIsAddLeadModalOpen(false);
      setEditingLead(null);
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to save Copy Trader Lead: ' + err.message);
    } finally {
      setIsSavingLead(false);
    }
  };

  const handleDeleteLead = (lead: CopyTraderLead) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Copy Trader Lead',
      message: `Are you sure you want to delete lead expert "${lead.name}"? Users will no longer see this trader card.`,
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'copy_trader_leads', lead.id));
          showFeedback('success', `Deleted lead trader "${lead.name}".`);
          await loadAllData(true);
        } catch (err: any) {
          console.error(err);
          showFeedback('error', 'Failed to delete lead trader: ' + err.message);
        }
      }
    });
  };

  const handleSaveArbitrageConfig = async () => {
    setIsSavingArbitrage(true);
    try {
      const arbDocRef = doc(db, 'settings', 'arbitrage_config');
      await setDoc(arbDocRef, arbitrageConfig);
      showFeedback('success', 'Arbitrage configuration saved successfully!');
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Failed to save arbitrage configuration: ' + err.message);
    } finally {
      setIsSavingArbitrage(false);
    }
  };

  const handleSyncAllLivePrices = async (silent = false) => {
    try {
      if (!silent) {
        showFeedback('info', 'Synchronizing all live market prices from world exchanges...');
      }
      const syncedCount = await syncLiveCryptoPrices(db);

      if (syncedCount > 0) {
        if (!silent) {
          showFeedback('success', `Successfully synchronized ${syncedCount} coins to the latest world market prices!`);
        }
      } else {
        if (!silent) {
          showFeedback('info', 'No coins are currently configured in Live Market Mode.');
        }
      }
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      if (!silent) {
        showFeedback('error', 'Error syncing live market prices: ' + err.message);
      }
    }
  };

  // Filter Transactions
  const pendingCryptoDeposits = txList.filter(t => t.type === 'deposit_crypto' && t.status === 'PENDING APPROVAL');
  const pendingP2PDeposits = txList.filter(t => t.type === 'deposit_p2p' && t.status === 'PENDING APPROVAL');
  const pendingWithdrawals = txList.filter(t => t.type.startsWith('withdraw') && t.status === 'PENDING APPROVAL');
  const historicalTransactions = txList.filter(t => t.status !== 'PENDING APPROVAL');

  return (
    <div id="admin-panel" className="min-h-screen bg-slate-900 text-zinc-100 font-sans pb-24">
      


      {/* Admin Header */}
      <div className="bg-slate-800 border-b border-slate-700/80 sticky top-0 z-40 px-4 py-3.5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-950 border border-emerald-500/30 p-1 flex items-center justify-center overflow-hidden">
            <img 
              src="/icon.svg" 
              alt="Morex" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5 text-zinc-100">
              Morex Admin Control
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold uppercase">love</span>
            </h1>
            <p className="text-[10px] text-zinc-500 font-medium">Secured Node Sandbox</p>
          </div>
        </div>
        <button
          id="admin-logout-btn"
          onClick={onLogout}
          className="text-xs font-semibold px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-zinc-200 rounded-lg transition-colors border border-slate-600/50 cursor-pointer"
        >
          Sign Out
        </button>
      </div>

      {/* Main Tabs Selection */}
      <div className="grid grid-cols-5 max-w-xl mx-auto bg-slate-800 border-b border-slate-700 p-1 rounded-xl my-4 mx-4">
        {([
          { id: 'users', label: 'Users', icon: Users },
          { id: 'deposits', label: 'Deposits', icon: CheckCircle2 },
          { id: 'withdrawals', label: 'Withdraw', icon: XCircle },
          { id: 'bot-templates', label: 'Bots', icon: Bot },
          { id: 'settings', label: 'System', icon: Settings }
        ] as const).map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              id={`admin-tab-btn-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                loadAllData(true);
              }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                activeTab === tab.id 
                  ? 'bg-emerald-500 text-slate-950 shadow' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
          <Loader size={32} className="text-amber-500 animate-spin" />
          <span className="text-xs text-zinc-500 font-medium">Retrieving database snapshots...</span>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 space-y-6">

          {/* 1. User Management Tab */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider">Morex Accounts Registered ({usersList.length})</h2>
                <button 
                  onClick={() => loadAllData(true)} 
                  className="p-1 text-zinc-400 hover:text-white"
                  title="Reload Accounts List"
                >
                  <RefreshCw size={14} className={actioning ? "animate-spin" : ""} />
                </button>
              </div>
              
              <div className="grid gap-3">
                {usersList.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-900 border border-zinc-800 rounded-3xl">
                    <p className="text-xs text-zinc-500">No registered users in system yet.</p>
                  </div>
                ) : (
                  usersList.map(u => (
                    <div 
                      key={u.uid} 
                      id={`user-item-card-${u.uid}`}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-xs font-black text-zinc-100">{u.displayName || 'No Name'}</span>
                          {u.email === 'love@gmail.com' && (
                            <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1 rounded uppercase font-bold">Admin</span>
                          )}
                          {!u.withdrawalEnabled && (
                            <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 rounded font-semibold uppercase">Withdraw Restricted</span>
                          )}
                          {(() => {
                            const activeUserInvs = investmentsList.filter(inv => inv.userId === u.uid && inv.status === 'active');
                            if (activeUserInvs.length > 0) {
                              return (
                                <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  <span className="w-1.2 h-1.2 rounded-full bg-emerald-400 animate-pulse" />
                                  {activeUserInvs.length} Active MMF
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-zinc-400 font-mono">
                          <div><span className="text-zinc-500 font-sans font-medium">Email:</span> {u.email}</div>
                          <div><span className="text-zinc-500 font-sans font-medium">UID:</span> <span className="select-all">{u.uid}</span></div>
                          <div><span className="text-zinc-500 font-sans font-medium">Phone:</span> <span className="text-emerald-400 font-bold font-mono">{u.phone || (u as any).phoneNumber || 'N/A'}</span></div>
                          <div><span className="text-zinc-500 font-sans font-medium">Country:</span> <span className="text-amber-400 font-bold font-sans">{u.country || 'Kenya'}</span></div>
                          <div><span className="text-zinc-500 font-sans font-medium">Referred By:</span> {u.referralSource || 'None/Direct'}</div>
                          <div><span className="text-zinc-500 font-sans font-medium">Joined:</span> {formatDate(u.createdAt)}</div>
                        </div>
                        {u.walletPassword && (
                          <p className="text-[10px] text-amber-500/80 font-mono mt-1">
                            Local PIN Code: <span className="font-bold border-b border-dashed border-amber-500/30 pb-0.5">{u.walletPassword}</span>
                          </p>
                        )}

                        {/* Holdings Breakdown Display */}
                        {u.holdings && Object.entries(u.holdings).filter(([symbol, amount]) => symbol !== 'USDT' && typeof amount === 'number' && amount > 0).length > 0 && (() => {
                          const validHoldings = Object.entries(u.holdings).filter(([symbol, amount]) => symbol !== 'USDT' && typeof amount === 'number' && amount > 0);
                          const isExpanded = !!expandedSections[`${u.uid}_holdings`];
                          return (
                            <div className="mt-2.5 pt-2 border-t border-zinc-800/60 max-w-xl">
                              <button
                                type="button"
                                onClick={() => toggleSection(`${u.uid}_holdings`)}
                                className="w-full flex items-center justify-between text-[10px] text-zinc-400 font-extrabold uppercase tracking-wider bg-zinc-800/30 hover:bg-zinc-800/70 px-2.5 py-1.5 rounded-lg border border-zinc-800/80 transition-all cursor-pointer"
                              >
                                <span className="flex items-center gap-1.5 text-zinc-300">
                                  <Coins size={12} className="text-amber-400 shrink-0" />
                                  Asset Holdings Breakdown ({validHoldings.length})
                                </span>
                                <span className="flex items-center gap-1 text-zinc-500 font-medium text-[9px] lowercase">
                                  {isExpanded ? 'Hide' : 'Expand'}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </span>
                              </button>

                              {isExpanded && (
                                <div className="flex flex-wrap gap-1.5 mt-2 pl-1">
                                  {validHoldings.map(([symbol, amount]) => {
                                    const dbPrice = cryptoPricesList.find(p => p.symbol === symbol)?.price;
                                    const price = dbPrice !== undefined ? dbPrice : (STATIC_CRYPTO[symbol]?.price || 0);
                                    const coinAmt = amount as number;
                                    const usdValue = coinAmt * price;
                                    return (
                                      <span key={symbol} className="text-[10px] bg-slate-800/40 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 text-zinc-300 px-2.5 py-0.5 rounded-lg font-mono flex items-center gap-1.5 transition-all">
                                        <span className="font-black text-zinc-400">{symbol}</span>
                                        <span className="font-medium text-zinc-200">{coinAmt.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                        <span className="text-zinc-500 text-[9px]">(${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* MMF Investments Display */}
                        {(() => {
                          const userInvestments = investmentsList.filter(inv => inv.userId === u.uid);
                          if (userInvestments.length === 0) return null;
                          const activeInvs = userInvestments.filter(inv => inv.status === 'active');
                          const isExpanded = !!expandedSections[`${u.uid}_mmf`];
                          return (
                            <div className="mt-2.5 pt-2 border-t border-zinc-800/60 max-w-xl">
                              <div className="flex justify-between items-center bg-emerald-950/20 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => toggleSection(`${u.uid}_mmf`)}
                                  className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider hover:text-emerald-300 transition-all cursor-pointer flex-1 text-left"
                                >
                                  <Coins size={12} className="text-emerald-400 shrink-0" />
                                  <span>MMF Portfolios ({userInvestments.length})</span>
                                  <span className="text-[9px] text-emerald-500/80 font-mono font-normal ml-1">
                                    ({activeInvs.length} Active)
                                  </span>
                                  {isExpanded ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
                                </button>
                                <button
                                  id={`user-card-wipe-invs-${u.uid}`}
                                  onClick={() => handleDeleteAllInvestments(u.uid, u.email)}
                                  className="text-[9px] text-red-400 hover:text-red-300 font-mono underline cursor-pointer shrink-0 ml-2"
                                >
                                  Wipe ({userInvestments.length})
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                  {activeInvs.map((inv: any) => {
                                    const unlockDate = inv.unlockAt?.toDate ? inv.unlockAt.toDate().toLocaleDateString() : (inv.unlockAt ? new Date(inv.unlockAt).toLocaleDateString() : 'N/A');
                                    return (
                                      <div 
                                        key={inv.id} 
                                        className="p-2.5 rounded-xl border text-[10px] font-mono flex flex-col justify-between gap-1 bg-emerald-950/15 border-emerald-500/20 text-emerald-300"
                                      >
                                        <div className="flex justify-between items-center">
                                          <span className="font-bold text-zinc-200">{inv.amount} {inv.coinSymbol}</span>
                                          <span className="text-[8px] font-black uppercase tracking-wider px-1 py-0.25 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
                                            {inv.status}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center text-[9px] text-zinc-500 mt-1">
                                          <span>Rate: {inv.dailyRate}% Daily</span>
                                          {inv.autoInvest && (
                                            <span className="text-teal-400 font-bold">Auto-invest</span>
                                          )}
                                        </div>
                                        <div className="text-[8px] text-zinc-600 border-t border-zinc-800/40 pt-1 mt-0.5 flex justify-between">
                                          <span>End Date:</span>
                                          <span>{unlockDate}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* AI Trading Bots Display */}
                        {(() => {
                          const userBots = userBotsList.filter(bot => bot.userId === u.uid);
                          if (userBots.length === 0) return null;
                          const isExpanded = !!expandedSections[`${u.uid}_bots`];
                          return (
                            <div className="mt-2.5 pt-2 border-t border-zinc-800/60 max-w-xl">
                              <div className="flex justify-between items-center bg-cyan-950/20 border border-cyan-500/20 px-2.5 py-1.5 rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => toggleSection(`${u.uid}_bots`)}
                                  className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-extrabold uppercase tracking-wider hover:text-cyan-300 transition-all cursor-pointer flex-1 text-left"
                                >
                                  <Bot size={12} className="text-cyan-400 shrink-0" />
                                  <span>AI Trading Bots ({userBots.length})</span>
                                  {isExpanded ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
                                </button>
                                <button
                                  id={`user-card-wipe-bots-${u.uid}`}
                                  onClick={() => handleDeleteAllBots(u.uid, u.email)}
                                  className="text-[9px] text-red-400 hover:text-red-300 font-mono underline cursor-pointer shrink-0 ml-2"
                                >
                                  Wipe ({userBots.length})
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                  {userBots.map((bot: any) => (
                                    <div 
                                      key={bot.id} 
                                      className="p-2.5 rounded-xl border text-[10px] font-mono flex flex-col justify-between gap-1 bg-cyan-950/15 border-cyan-500/20 text-cyan-300"
                                    >
                                      <div className="flex justify-between items-center">
                                        <span className="font-bold text-zinc-200">{bot.name || 'AI Bot'}</span>
                                        <span className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.25 rounded border ${
                                          bot.status === 'RUNNING' || bot.status === 'ACTIVE'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse'
                                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                        }`}>
                                          {bot.status || 'ACTIVE'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-[9px] text-zinc-500 mt-1">
                                        <span>Capital: ${bot.capitalAllocated || bot.minCapital || 50}</span>
                                        <span>Pairs: {Array.isArray(bot.tradingPairs) ? bot.tradingPairs.join(', ') : (bot.tradingPairs || 'All')}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0 border-t border-zinc-800/80 md:border-0 pt-3 md:pt-0">
                        <div className="flex gap-5 text-right">
                          <div className="border-r border-zinc-800/85 pr-5">
                            <span className="text-[10px] text-zinc-500 block uppercase font-extrabold tracking-wider">USDT Wallet</span>
                            <span className="text-base font-black text-emerald-400 font-mono">${u.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-500 block uppercase font-extrabold tracking-wider">Total Assets</span>
                            <span className="text-base font-black text-cyan-400 font-mono">${calculateTotalPortfolio(u, cryptoPricesList).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1 justify-end">
                          <button
                            id={`user-history-btn-${u.uid}`}
                            onClick={() => handleOpenUserHistory(u)}
                            className="p-1.5 bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-zinc-700/50 flex items-center gap-1 text-[10px] font-bold"
                            title="View transaction log history"
                          >
                            <FileText size={12} />
                            <span>View Tx</span>
                          </button>

                          <button
                            id={`user-withdraw-toggle-${u.uid}`}
                            onClick={() => handleToggleWithdrawal(u)}
                            disabled={actioning === u.uid}
                            className={`p-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border ${
                              u.withdrawalEnabled 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                                : 'bg-slate-800 text-zinc-500 border-slate-700 hover:text-zinc-300'
                            }`}
                            title={u.withdrawalEnabled ? "Disable Withdrawal permissions" : "Enable Withdrawal permissions"}
                          >
                            {u.withdrawalEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            <span>{u.withdrawalEnabled ? 'Withdraw: OK' : 'Withdraw: Lock'}</span>
                          </button>

                          <button
                            id={`user-reset-auth-btn-${u.uid}`}
                            onClick={() => handleSendResetEmail(u)}
                            disabled={actioning === u.uid}
                            className="p-1.5 bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/50 rounded-lg flex items-center gap-1 text-[10px] font-bold"
                            title="Send standard password reset email"
                          >
                            <Mail size={12} />
                            <span>Reset Auth</span>
                          </button>

                          <button
                            id={`user-reset-pin-btn-${u.uid}`}
                            onClick={() => handleUpdateLocalPIN(u)}
                            disabled={actioning === u.uid}
                            className="p-1.5 bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/50 rounded-lg flex items-center gap-1 text-[10px] font-bold"
                            title="Reset Local transaction PIN"
                          >
                            <Key size={12} />
                            <span>Reset PIN</span>
                          </button>

                          <button
                            id={`user-edit-phone-btn-${u.uid}`}
                            onClick={() => handleUpdateUserPhone(u)}
                            disabled={actioning === u.uid}
                            className="p-1.5 bg-zinc-800 text-amber-400 hover:text-amber-300 border border-zinc-700/50 rounded-lg flex items-center gap-1 text-[10px] font-bold"
                            title="Edit user phone number"
                          >
                            <Phone size={12} />
                            <span>Edit Phone</span>
                          </button>

                          <button
                            id={`user-wipe-all-data-btn-${u.uid}`}
                            onClick={() => handleWipeAllUserData(u.uid, u.email)}
                            disabled={actioning === u.uid}
                            className="p-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:text-red-300 border border-red-950/50 rounded-lg flex items-center gap-1 text-[10px] font-bold"
                            title="Wipe all activity history (txs, investments, bots) for this user without deleting account"
                          >
                            <Trash2 size={12} />
                            <span>Wipe All Activity</span>
                          </button>

                          {u.email !== 'love@gmail.com' && (
                            <button
                              id={`user-delete-btn-${u.uid}`}
                              onClick={() => handleDeleteUser(u)}
                              disabled={actioning === u.uid}
                              className="p-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:text-red-300 border border-red-950/50 rounded-lg"
                              title="Delete Account permanently"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 2. Deposits Tab */}
          {activeTab === 'deposits' && (
            <div className="space-y-6">
              
              {/* Crypto Method Deposits Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Section A: Pending Crypto Method Deposits ({pendingCryptoDeposits.length})
                </h3>

                <div className="grid gap-3">
                  {pendingCryptoDeposits.length === 0 ? (
                    <div className="p-6 text-center bg-zinc-900/50 border border-zinc-900 rounded-2xl">
                      <p className="text-xs text-zinc-500 font-medium">No pending crypto deposits waiting for approval.</p>
                    </div>
                  ) : (
                    pendingCryptoDeposits.map(tx => (
                      <div 
                        key={tx.id} 
                        id={`crypto-deposit-card-${tx.id}`}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-zinc-800/80">
                          <div>
                            <span className="text-xs font-black text-amber-400">Crypto Deposit Request</span>
                            <span className="text-[10px] text-zinc-500 font-mono ml-2">ID: {tx.id}</span>
                          </div>
                          <span className="text-[11px] text-zinc-400 font-semibold">{formatDate(tx.createdAt)}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-[11px] text-zinc-400 font-mono">
                          <div><span className="text-zinc-500 font-sans font-medium">USER UID:</span> <span className="select-all">{tx.userId}</span></div>
                          <div><span className="text-zinc-500 font-sans font-medium">EMAIL:</span> {tx.userEmail}</div>
                          <div><span className="text-zinc-500 font-sans font-medium">COIN / NETWORK:</span> {tx.merchantName || 'Stablecoin'} ({tx.network})</div>
                          <div><span className="text-zinc-500 font-sans font-medium">WALLET ADDRESS SENT:</span> <span className="select-all">{tx.address}</span></div>
                        </div>

                        <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900/80 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-zinc-500 uppercase font-black">Amount Claimed</p>
                            <p className="text-lg font-black text-zinc-100 font-mono">
                              {tx.coinAmount && tx.coinSymbol && tx.coinSymbol.toUpperCase() !== 'USDT'
                                ? `${tx.coinAmount} ${tx.coinSymbol}`
                                : `$${tx.amount?.toFixed(2)}`}
                            </p>
                          </div>

                          {/* Evidence Block */}
                          {tx.evidence ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-400 font-semibold">Evidence Receipt:</span>
                              <button
                                id={`view-evidence-btn-${tx.id}`}
                                onClick={() => setSelectedEvidence(tx.evidence || null)}
                                className="px-2 py-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg text-[10px] font-bold text-emerald-400 flex items-center gap-1"
                              >
                                <ZoomIn size={12} />
                                <span>Inspect Receipt</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-red-400 font-bold">No receipt image attached</span>
                          )}
                        </div>

                        {/* Confirmation and Action Block */}
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            id={`decline-crypto-deposit-btn-${tx.id}`}
                            onClick={() => handleDeclineDeposit(tx)}
                            disabled={actioning === tx.id}
                            className="px-4 py-2 bg-red-950/30 hover:bg-red-950/60 text-red-400 rounded-xl text-xs font-bold transition-all border border-red-950/40 cursor-pointer"
                          >
                            DECLINE
                          </button>
                          <button
                            id={`approve-crypto-deposit-btn-${tx.id}`}
                            onClick={() => handleApproveDeposit(tx)}
                            disabled={actioning === tx.id}
                            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
                          >
                            APPROVE DEPOSIT
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* P2P Method Deposits Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Section B: Pending P2P Method Deposits ({pendingP2PDeposits.length})
                </h3>

                <div className="grid gap-3">
                  {pendingP2PDeposits.length === 0 ? (
                    <div className="p-6 text-center bg-zinc-900/50 border border-zinc-900 rounded-2xl">
                      <p className="text-xs text-zinc-500 font-medium">No pending P2P escrow deposit requests waiting.</p>
                    </div>
                  ) : (
                    pendingP2PDeposits.map(tx => (
                      <div 
                        key={tx.id} 
                        id={`p2p-deposit-card-${tx.id}`}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-zinc-800/80">
                          <div>
                            <span className="text-xs font-black text-emerald-400">P2P Escrow Deposit Request</span>
                            <span className="text-[10px] text-zinc-500 font-mono ml-2">ID: {tx.id}</span>
                          </div>
                          <span className="text-[11px] text-zinc-400 font-semibold">{formatDate(tx.createdAt)}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-[11px] text-zinc-400 font-mono">
                          <div><span className="text-zinc-500 font-sans font-medium">USER UID:</span> <span className="select-all">{tx.userId}</span></div>
                          <div><span className="text-zinc-500 font-sans font-medium">EMAIL:</span> {tx.userEmail}</div>
                          <div><span className="text-zinc-500 font-sans font-medium">MERCHANT NAME:</span> {tx.merchantName}</div>
                          <div><span className="text-zinc-500 font-sans font-medium">PAYMENT NUMBER:</span> {tx.address}</div>
                        </div>

                        <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] text-zinc-500 uppercase font-black">Amount in Dollar Form</p>
                            <p className="text-lg font-black text-emerald-400 font-mono">${tx.amount?.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-zinc-500 uppercase font-black">Expected Shillings to Merchant</p>
                            <p className="text-sm font-bold text-zinc-200 font-mono">{tx.localAmount?.toLocaleString()} Shs</p>
                          </div>
                        </div>

                        {tx.paymentMessage && (
                          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-900 text-xs text-zinc-300 italic font-mono">
                            <p className="text-[9px] text-zinc-500 uppercase font-bold not-italic mb-1">Raw Payment Code/Sms Confirmation:</p>
                            {tx.paymentMessage}
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            id={`decline-p2p-deposit-btn-${tx.id}`}
                            onClick={() => handleDeclineDeposit(tx)}
                            disabled={actioning === tx.id}
                            className="px-4 py-2 bg-red-950/30 hover:bg-red-950/60 text-red-400 rounded-xl text-xs font-bold transition-all border border-red-950/40 cursor-pointer"
                          >
                            DECLINE
                          </button>
                          <button
                            id={`approve-p2p-deposit-btn-${tx.id}`}
                            onClick={() => handleApproveDeposit(tx)}
                            disabled={actioning === tx.id}
                            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
                          >
                            APPROVE DEPOSIT
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Approved/Declined Transaction History Log */}
              <div className="space-y-3 pt-4">
                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-wider">Historical Completed Logs ({historicalTransactions.length})</h3>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-h-96 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-zinc-950 text-zinc-500 uppercase text-[9px] font-black tracking-wider">
                      <tr>
                        <th className="p-3">Type</th>
                        <th className="p-3">User Email</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">Completed Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {historicalTransactions.map(h => (
                        <tr key={h.id} className="hover:bg-zinc-850">
                          <td className="p-3 font-semibold text-zinc-300">
                            {h.type === 'deposit_crypto' && 'Crypto Deposit'}
                            {h.type === 'deposit_p2p' && 'P2P Deposit'}
                            {h.type === 'withdraw_crypto' && 'Crypto Withdraw'}
                            {h.type === 'withdraw_p2p' && 'P2P Sell'}
                            {h.type === 'buy_crypto' && 'Buy Crypto'}
                            {h.type === 'sell_crypto' && 'Sell Crypto'}
                            {h.type === 'swap_crypto' && 'Swap/Convert'}
                            {h.type === 'internal_send' && 'Internal Send'}
                            {h.type === 'internal_receive' && 'Internal Receive'}
                          </td>
                          <td className="p-3 text-zinc-400 font-mono">{h.userEmail}</td>
                          <td className="p-3 font-bold font-mono text-zinc-100">
                            {h.coinAmount && h.coinSymbol && h.coinSymbol.toUpperCase() !== 'USDT'
                              ? `${h.coinAmount} ${h.coinSymbol}`
                              : `$${h.amount?.toFixed(2)}`}
                          </td>
                          <td className="p-3 text-zinc-500 font-mono">{formatDate(h.createdAt)}</td>
                          <td className="p-3">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              h.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {h.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              id={`delete-history-tx-${h.id}`}
                              onClick={() => handleDeleteTransaction(h.id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* 3. Withdrawals Tab */}
          {activeTab === 'withdrawals' && (
            <div className="space-y-4">
              <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider">Pending Approvals - Withdrawal Queue ({pendingWithdrawals.length})</h2>

              <div className="grid gap-3">
                {pendingWithdrawals.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-900 border border-zinc-800 rounded-3xl">
                    <p className="text-xs text-zinc-500 font-medium">No pending withdrawal requests in system.</p>
                  </div>
                ) : (
                  pendingWithdrawals.map(tx => (
                    <div 
                      key={tx.id} 
                      id={`withdrawal-request-card-${tx.id}`}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80 text-xs">
                        <div>
                          <span className="font-black text-emerald-400">
                            {tx.type === 'withdraw_crypto' ? 'External Crypto Payout' : 'P2P Merchant Sell Payout'}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono ml-2">ID: {tx.id}</span>
                        </div>
                        <span className="text-zinc-500 font-mono text-[10px]">{formatDate(tx.createdAt)}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6 text-[11px] text-zinc-400 font-mono">
                        <div><span className="text-zinc-500 font-sans font-medium">USER UID:</span> <span className="select-all">{tx.userId}</span></div>
                        <div><span className="text-zinc-500 font-sans font-medium">EMAIL:</span> {tx.userEmail}</div>
                        <div><span className="text-zinc-500 font-sans font-medium">NETWORK/TOKEN:</span> {tx.network || 'USDT'} ({tx.merchantName || 'None'})</div>
                        <div><span className="text-zinc-500 font-sans font-medium">DESTINATION ADDRESS:</span> <span className="select-all">{tx.address}</span></div>
                      </div>

                      {/* Fee and Amount breakdown */}
                      <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900/80 space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-center border-b border-zinc-900/90 pb-2">
                          <div>
                            <span className="text-[9px] text-zinc-500 uppercase font-black block">Gross Requested</span>
                            <span className="text-sm font-bold text-zinc-300 font-mono">${tx.amount?.toFixed(2)} USD</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-zinc-500 uppercase font-black block">10% Fee</span>
                            <span className="text-sm font-bold text-red-400 font-mono">-${(tx.feeAmount !== undefined ? tx.feeAmount : tx.amount * 0.10).toFixed(2)} USD</span>
                          </div>
                          <div className="bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-800/40">
                            <span className="text-[9px] text-emerald-400 uppercase font-black block">Net Payout to Send</span>
                            <span className="text-sm font-black text-emerald-400 font-mono">${(tx.netAmount !== undefined ? tx.netAmount : tx.amount * 0.90).toFixed(2)} USD</span>
                          </div>
                        </div>

                        {tx.localAmount && (
                          <div className="flex justify-between items-center text-[11px] pt-0.5 px-1">
                            <span className="text-zinc-500 font-medium">Local Valuation:</span>
                            <span className="font-bold text-zinc-300 font-mono">{tx.localAmount?.toLocaleString()} Shs</span>
                          </div>
                        )}
                      </div>

                      {/* Administrative Options: REJECT, DELETE, APPROVE */}
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          id={`reject-withdrawal-btn-${tx.id}`}
                          onClick={() => handleRejectWithdrawal(tx)}
                          disabled={actioning === tx.id}
                          className="px-3.5 py-2 bg-amber-950/30 hover:bg-amber-950/60 text-amber-400 border border-amber-900/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          REJECT & REFUND
                        </button>
                        <button
                          id={`delete-withdrawal-btn-${tx.id}`}
                          onClick={() => handleDeleteTransaction(tx)}
                          disabled={actioning === tx.id}
                          className="px-3.5 py-2 bg-red-950/30 hover:bg-red-950/60 text-red-400 border border-red-950/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          DELETE
                        </button>
                        <button
                          id={`approve-withdrawal-btn-${tx.id}`}
                          onClick={() => handleApproveWithdrawal(tx)}
                          disabled={actioning === tx.id}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
                        >
                          APPROVE & RELEASE
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Bot Templates Management Tab */}
          {activeTab === 'bot-templates' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
                <div>
                  <h3 className="text-sm font-black text-zinc-100 flex items-center gap-2">
                    <Bot className="text-emerald-400" size={18} />
                    Trading Bot Templates Marketplace Configuration
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">Configure bot performance ranges, minimum capital, ROI, and supported trading pairs available for users on the BOTS Hub.</p>
                </div>
                <button
                  type="button"
                  id="add-new-bot-template-btn"
                  onClick={() => {
                    setEditingBotTemplate(null);
                    setIsAddingBotTemplate(true);
                    setBotTemplateForm({
                      name: '',
                      category: 'PREMIUM',
                      winRatioRange: '95%',
                      winProfitRange: '1.5% - 2.5%',
                      lossPercentRange: '0.4% - 1.4%',
                      minCapital: '50',
                      tradingPairs: 'BTC/USDT, ETH/USDT, SOL/USDT',
                      riskLevel: 'Low Risk',
                      color: 'from-amber-500 to-yellow-500'
                    });
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus size={14} />
                  <span>New Bot Template</span>
                </button>
              </div>

              {/* Edit / Create Form */}
              {(isAddingBotTemplate || editingBotTemplate !== null) && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                    <h4 className="text-xs font-black text-zinc-200 uppercase tracking-wider">
                      {editingBotTemplate ? 'Edit Bot Template' : 'Create New Bot Template'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBotTemplate(null);
                        setIsAddingBotTemplate(false);
                        setBotTemplateForm({
                          name: '',
                          category: 'PREMIUM',
                          winRatioRange: '95%',
                          winProfitRange: '1.5% - 2.5%',
                          lossPercentRange: '0.4% - 1.4%',
                          minCapital: '50',
                          tradingPairs: 'BTC/USDT, ETH/USDT, SOL/USDT',
                          riskLevel: 'Low Risk',
                          color: 'from-amber-500 to-yellow-500'
                        });
                      }}
                      className="text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const id = editingBotTemplate ? editingBotTemplate.id : `bot_${Date.now()}`;
                      const pairsArr = botTemplateForm.tradingPairs.split(',').map(p => p.trim()).filter(Boolean);
                      const formattedWinRatio = botTemplateForm.winRatioRange.trim() 
                        ? (botTemplateForm.winRatioRange.trim().endsWith('%') 
                            ? botTemplateForm.winRatioRange.trim() 
                            : `${botTemplateForm.winRatioRange.trim()}%`)
                        : '75%';

                      const data: BotTemplate = {
                        id,
                        name: botTemplateForm.name,
                        category: botTemplateForm.category,
                        winRatioRange: formattedWinRatio,
                        winProfitRange: botTemplateForm.winProfitRange.trim() || '1.5% - 2.5%',
                        lossPercentRange: botTemplateForm.lossPercentRange.trim() || '0.4% - 1.4%',
                        minCapital: parseFloat(botTemplateForm.minCapital) || 50,
                        tradingPairs: pairsArr.length > 0 ? pairsArr : ['BTC/USDT', 'ETH/USDT'],
                        riskLevel: botTemplateForm.riskLevel,
                        color: botTemplateForm.color || 'from-amber-500 to-yellow-500'
                      };
                      await setDoc(doc(db, 'bot_templates', id), data);
                      showFeedback('success', editingBotTemplate ? 'Bot template updated!' : 'Bot template created!');
                      setEditingBotTemplate(null);
                      setIsAddingBotTemplate(false);
                      setBotTemplateForm({
                        name: '',
                        category: 'PREMIUM',
                        winRatioRange: '95%',
                        winProfitRange: '1.5% - 2.5%',
                        lossPercentRange: '0.4% - 1.4%',
                        minCapital: '50',
                        tradingPairs: 'BTC/USDT, ETH/USDT, SOL/USDT',
                        riskLevel: 'Low Risk',
                        color: 'from-amber-500 to-yellow-500'
                      });
                      loadAllData(true);
                    } catch (err: any) {
                      showFeedback('error', err.message || 'Failed to save bot template');
                    }
                  }} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1 block">Bot Name</label>
                        <input
                          type="text"
                          required
                          value={botTemplateForm.name}
                          onChange={e => setBotTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. Arbitrage Flash-Loan Sniper"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1 block">Category</label>
                        <select
                          value={botTemplateForm.category}
                          onChange={e => setBotTemplateForm(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                        >
                          <option value="PREMIUM">PREMIUM</option>
                          <option value="FREE">FREE</option>
                          <option value="Cross-Exchange Arbitrage">Cross-Exchange Arbitrage</option>
                          <option value="AI High Frequency">AI High Frequency</option>
                          <option value="Flash Loan Arbitrage">Flash Loan Arbitrage</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-emerald-400 mb-1 block">Win Trade Profit Range (%)</label>
                        <input
                          type="text"
                          required
                          value={botTemplateForm.winProfitRange}
                          onChange={e => setBotTemplateForm(prev => ({ ...prev, winProfitRange: e.target.value }))}
                          placeholder="e.g. 1.5% - 2.5%"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[9px] text-zinc-500 mt-1 block font-medium">
                          Profit % range earned on a winning trade
                        </span>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-rose-400 mb-1 block">Loss Trade Loss Range (%)</label>
                        <input
                          type="text"
                          required
                          value={botTemplateForm.lossPercentRange}
                          onChange={e => setBotTemplateForm(prev => ({ ...prev, lossPercentRange: e.target.value }))}
                          placeholder="e.g. 0.4% - 1.4%"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                        />
                        <span className="text-[9px] text-zinc-500 mt-1 block font-medium">
                          Loss % range incurred on a losing trade
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1 block">Win Ratio (%)</label>
                        <input
                          type="text"
                          required
                          value={botTemplateForm.winRatioRange}
                          onChange={e => setBotTemplateForm(prev => ({ ...prev, winRatioRange: e.target.value }))}
                          placeholder="e.g. 60%"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[9px] text-zinc-500 mt-1 block font-medium">
                          e.g. 60% = 60% Win / 40% Loss probability
                        </span>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1 block">Min Capital ($)</label>
                        <input
                          type="number"
                          required
                          value={botTemplateForm.minCapital}
                          onChange={e => setBotTemplateForm(prev => ({ ...prev, minCapital: e.target.value }))}
                          placeholder="50"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1 block">Risk Level</label>
                        <select
                          value={botTemplateForm.riskLevel}
                          onChange={e => setBotTemplateForm(prev => ({ ...prev, riskLevel: e.target.value }))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        >
                          <option value="Very Low Risk">Very Low Risk</option>
                          <option value="Low Risk">Low Risk</option>
                          <option value="Medium Risk">Medium Risk</option>
                          <option value="High Risk">High Risk</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1 block">Trading Pairs (Comma Separated)</label>
                      <input
                        type="text"
                        required
                        value={botTemplateForm.tradingPairs}
                        onChange={e => setBotTemplateForm(prev => ({ ...prev, tradingPairs: e.target.value }))}
                        placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBotTemplate(null);
                          setIsAddingBotTemplate(false);
                        }}
                        className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Save Bot Template
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Bot Templates List */}
              <div className="grid gap-4 sm:grid-cols-2">
                {[...botTemplatesList]
                  .sort((a, b) => Number(a.minCapital ?? 0) - Number(b.minCapital ?? 0))
                  .map(tpl => (
                  <div key={tpl.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400">{tpl.category}</span>
                        <h4 className="text-sm font-black text-white mt-0.5">{tpl.name}</h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBotTemplate(tpl);
                            setIsAddingBotTemplate(false);
                            setBotTemplateForm({
                              name: tpl.name,
                              category: tpl.category || 'PREMIUM',
                              winRatioRange: tpl.winRatioRange || '95%',
                              winProfitRange: tpl.winProfitRange || '1.5% - 2.5%',
                              lossPercentRange: tpl.lossPercentRange || '0.4% - 1.4%',
                              minCapital: (tpl.minCapital ?? 50).toString(),
                              tradingPairs: (tpl.tradingPairs || []).join(', '),
                              riskLevel: tpl.riskLevel || 'Low Risk',
                              color: tpl.color || 'from-amber-500 to-yellow-500'
                            });
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl"
                          title="Edit Template"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBotTemplate(tpl.id)}
                          className="p-1.5 bg-red-950/40 hover:bg-red-950 text-red-400 rounded-xl"
                          title="Delete Template"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800 text-center">
                      <div className="bg-zinc-950 p-2 rounded-xl">
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Win / Loss Ratio</span>
                        <span className="text-xs font-black text-emerald-400 font-mono">
                          {tpl.winRatioRange} Win
                          {(() => {
                            const val = parseFloat((tpl.winRatioRange || '').replace(/%/g, ''));
                            if (!isNaN(val) && val <= 100) {
                              return <span className="text-rose-400 text-[10px] ml-1 block sm:inline">({(100 - val).toFixed(0)}% L)</span>;
                            }
                            return null;
                          })()}
                        </span>
                      </div>
                      <div className="bg-zinc-950 p-2 rounded-xl">
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Profit / Loss %</span>
                        <span className="text-xs font-black font-mono block">
                          <span className="text-emerald-400">{tpl.winProfitRange || '1.5-2.5%'}</span>
                          <span className="text-zinc-600 mx-0.5">/</span>
                          <span className="text-rose-400">-{tpl.lossPercentRange || '0.4-1.4%'}</span>
                        </span>
                      </div>
                      <div className="bg-zinc-950 p-2 rounded-xl">
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Min Capital</span>
                        <span className="text-xs font-black text-white font-mono">${tpl.minCapital}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {(tpl.tradingPairs || []).map(pair => (
                        <span key={pair} className="text-[10px] bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded-full font-mono text-zinc-300">
                          {pair}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Settings / System Configuration Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              
              {/* Crypto Prices Live Controller Panel */}
              <div id="crypto-prices-live-controller" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Coins className="text-emerald-400" size={16} />
                    <div>
                      <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Live Cryptocurrency exchange rates & prices</h3>
                      <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">Toggle between Live World Market Rates (auto-syncing) or Custom Control values.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/5 px-2 py-1 rounded-md border border-emerald-500/10 text-[9px] font-bold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      <span>Auto-sync active (15s)</span>
                    </div>
                    <button
                      id="sync-all-live-prices-btn"
                      onClick={() => handleSyncAllLivePrices(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-[10px] rounded-lg border border-emerald-500/25 transition-colors cursor-pointer"
                    >
                      <RefreshCw size={12} />
                      <span>Sync All Live Market Coins</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {cryptoPricesList.map((cp) => {
                    const isStablecoin = cp.symbol === 'USDT' || cp.symbol === 'USDC';
                    const currentMode = cp.mode || (isStablecoin ? 'custom' : 'live');
                    const isEditing = editingPriceSymbol === cp.symbol;

                    return (
                      <div key={cp.symbol} className="bg-zinc-950 p-3 rounded-2xl border border-zinc-900/60 flex flex-col justify-between space-y-3.5 relative overflow-hidden">
                        
                        {/* Status Stripe */}
                        <div className={`absolute top-0 left-0 right-0 h-[2px] ${currentMode === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />

                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] text-zinc-500 font-bold block">{cp.name}</span>
                            <span className="text-xs font-black text-zinc-200 font-mono tracking-wider">{cp.symbol}</span>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${cp.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                              {cp.change24h >= 0 ? '+' : ''}{cp.change24h}%
                            </span>
                            <span className={`text-[8px] font-black uppercase tracking-wider px-1 rounded-sm ${currentMode === 'live' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                              {currentMode === 'live' ? 'Live' : 'Custom'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-zinc-500 block">Current Price</span>
                          <span className="text-sm font-black text-zinc-100 font-mono">${cp.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                          {cp.lastSyncedAt && (
                            <span className="text-[8px] text-zinc-600 block font-mono mt-0.5">Synced: {new Date(cp.lastSyncedAt).toLocaleTimeString()}</span>
                          )}
                        </div>

                        {/* Mode toggles */}
                        <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-zinc-900/80">
                          <button
                            id={`mode-live-btn-${cp.symbol}`}
                            onClick={() => handleSwitchToLiveMode(cp.symbol, cp.name)}
                            disabled={currentMode === 'live'}
                            className={`py-1 text-[8px] font-black rounded transition-all cursor-pointer flex flex-col items-center justify-center ${currentMode === 'live' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400 border border-transparent'}`}
                          >
                            <span>⚡ Live World</span>
                          </button>
                          <button
                            id={`mode-custom-btn-${cp.symbol}`}
                            onClick={() => handleSwitchToCustomMode(cp.symbol, cp.name, cp.price, cp.change24h)}
                            disabled={currentMode === 'custom' && isEditing}
                            className={`py-1 text-[8px] font-black rounded transition-all cursor-pointer flex flex-col items-center justify-center ${currentMode === 'custom' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400 border border-transparent'}`}
                          >
                            <span>✏️ Custom</span>
                          </button>
                        </div>

                        {isEditing && currentMode === 'custom' && (
                          <div className="space-y-2 pt-2 border-t border-zinc-900/85">
                            <div className="space-y-1">
                              <label className="text-[9px] text-zinc-500 font-semibold block">Set Price (USD)</label>
                              <input
                                id={`edit-price-input-${cp.symbol}`}
                                type="number"
                                step="any"
                                value={priceForm.price}
                                onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}
                                className="w-full px-2 py-1 bg-zinc-900 border border-zinc-850 rounded text-[11px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] text-zinc-500 font-semibold block">Set 24h %</label>
                              <input
                                id={`edit-change-input-${cp.symbol}`}
                                type="number"
                                step="any"
                                value={priceForm.change24h}
                                onChange={(e) => setPriceForm({ ...priceForm, change24h: e.target.value })}
                                className="w-full px-2 py-1 bg-zinc-900 border border-zinc-850 rounded text-[11px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                            <div className="flex gap-1 pt-1">
                              <button
                                id={`save-price-btn-${cp.symbol}`}
                                onClick={() => handleSaveCryptoPrice(cp.symbol, cp.name)}
                                className="flex-1 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[9px] rounded transition-colors cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                id={`cancel-price-btn-${cp.symbol}`}
                                onClick={() => setEditingPriceSymbol(null)}
                                className="px-1.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-[9px] rounded transition-colors cursor-pointer"
                              >
                                X
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Copy Trading Lead Traders Controller */}
              <div id="copy-trading-leads-controller" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="text-emerald-400" size={16} />
                    <div>
                      <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Copy Trading Lead Experts ({copyLeadsList.length})</h3>
                      <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">Manage lead expert traders displayed on the user Copy Trading dashboard. Define name, profile photo, professional description, and signals per day.</p>
                    </div>
                  </div>
                  <button
                    id="add-new-lead-trader-btn"
                    onClick={handleOpenAddLead}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-[11px] rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    <Plus size={14} />
                    <span>Add Lead Trader</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {copyLeadsList.map((lead) => (
                    <div key={lead.id} className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative overflow-hidden">
                      <div className="flex items-start gap-3">
                        <img 
                          src={lead.photoUrl} 
                          alt={lead.name}
                          className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/40 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400';
                          }}
                        />
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-black text-zinc-100 truncate">{lead.name}</h4>
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0 font-mono">
                              {lead.winRate || '98.5%'} Win
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                            <span className="text-amber-400 font-bold">⚡ {lead.signalsPerDay}</span>
                            <span>•</span>
                            <span>Min Capital: ${lead.minCapital ?? 100}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-2 leading-snug">
                            {lead.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
                        <button
                          onClick={() => handleOpenEditLead(lead)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-[10px] rounded-lg border border-zinc-800 transition-colors cursor-pointer"
                        >
                          <Edit size={12} />
                          <span>Edit Details</span>
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-[10px] rounded-lg border border-red-500/20 transition-colors cursor-pointer"
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Arbitrage Value Gap Controller */}
              <div id="arbitrage-config-controller" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-amber-500" size={16} />
                    <div>
                      <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Arbitrage & Value Gap Helper Config</h3>
                      <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">Configure the two cryptocurrency coins shown on the User Trade tab and specify price differences on external platforms to guide arbitrage trades.</p>
                    </div>
                  </div>
                  <div>
                    <button
                      id="save-arbitrage-config-btn"
                      onClick={handleSaveArbitrageConfig}
                      disabled={isSavingArbitrage}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSavingArbitrage ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                      <span>Save Arbitrage Settings</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Coin 1 Configuration */}
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/50 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                      <span className="text-xs font-black text-amber-400 tracking-wider uppercase">Arbitrage Coin #1</span>
                      <span className="text-[10px] bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded-full font-bold">Selected: {arbitrageConfig.coin1Symbol}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold block mb-1">Select System Coin</label>
                        <select
                          value={arbitrageConfig.coin1Symbol}
                          onChange={(e) => setArbitrageConfig({ ...arbitrageConfig, coin1Symbol: e.target.value })}
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                        >
                          {cryptoPricesList.map(c => (
                            <option key={`c1-${c.symbol}`} value={c.symbol}>{c.symbol} ({c.name})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold block mb-1">Price Mode</label>
                        <select
                          value={arbitrageConfig.coin1UseLiveOffset ? "live" : "manual"}
                          onChange={(e) => setArbitrageConfig({ 
                            ...arbitrageConfig, 
                            coin1UseLiveOffset: e.target.value === 'live' 
                          })}
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                        >
                          <option value="live">Dynamic % Discount</option>
                          <option value="manual">Manual Price Range</option>
                        </select>
                      </div>
                    </div>

                    {arbitrageConfig.coin1UseLiveOffset ? (
                      <div className="space-y-1 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900">
                        <label className="text-[10px] text-zinc-400 font-bold block">Discount on External Platforms (%)</label>
                        <p className="text-[9px] text-zinc-500 font-semibold mb-1.5">e.g., 2.5% means other platforms are 2.5% cheaper than this app's price.</p>
                        <input
                          type="number"
                          step="0.01"
                          value={arbitrageConfig.coin1OffsetPercentage}
                          onChange={(e) => setArbitrageConfig({ ...arbitrageConfig, coin1OffsetPercentage: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900">
                        <div>
                          <label className="text-[10px] text-zinc-400 font-bold block mb-1">External Min Price (USD)</label>
                          <input
                            type="number"
                            step="any"
                            value={arbitrageConfig.coin1ExternalMin}
                            onChange={(e) => setArbitrageConfig({ ...arbitrageConfig, coin1ExternalMin: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-400 font-bold block mb-1">External Max Price (USD)</label>
                          <input
                            type="number"
                            step="any"
                            value={arbitrageConfig.coin1ExternalMax}
                            onChange={(e) => setArbitrageConfig({ ...arbitrageConfig, coin1ExternalMax: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Quick calculations preview for Admin */}
                    <div className="bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/10 text-[10px] space-y-1 font-mono text-zinc-400">
                      <div className="font-bold text-zinc-300">Live Simulation Check:</div>
                      {(() => {
                        const matched = cryptoPricesList.find(c => c.symbol === arbitrageConfig.coin1Symbol);
                        const appPrice = matched ? matched.price : 0;
                        let extMin = arbitrageConfig.coin1ExternalMin;
                        let extMax = arbitrageConfig.coin1ExternalMax;
                        if (arbitrageConfig.coin1UseLiveOffset) {
                          extMin = appPrice * (1 - (arbitrageConfig.coin1OffsetPercentage + 0.3) / 100);
                          extMax = appPrice * (1 - (arbitrageConfig.coin1OffsetPercentage - 0.2) / 100);
                        }
                        const avgExt = (extMin + extMax) / 2;
                        const potentialProfit = appPrice - avgExt;
                        return (
                          <div className="space-y-0.5">
                            <div>App Rate: <span className="text-zinc-200">${appPrice.toLocaleString()}</span></div>
                            <div>External Range: <span className="text-zinc-200">${extMin.toLocaleString(undefined, {maximumFractionDigits: 2})} - ${extMax.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
                            <div>Arbitrage Difference: <span className="text-emerald-400 font-bold">+${potentialProfit.toLocaleString(undefined, {maximumFractionDigits: 2})} per coin ({((potentialProfit / avgExt) * 100).toFixed(2)}% ROI)</span></div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Coin 2 Configuration */}
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/50 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                      <span className="text-xs font-black text-amber-400 tracking-wider uppercase">Arbitrage Coin #2</span>
                      <span className="text-[10px] bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded-full font-bold">Selected: {arbitrageConfig.coin2Symbol}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold block mb-1">Select System Coin</label>
                        <select
                          value={arbitrageConfig.coin2Symbol}
                          onChange={(e) => setArbitrageConfig({ ...arbitrageConfig, coin2Symbol: e.target.value })}
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                        >
                          {cryptoPricesList.map(c => (
                            <option key={`c2-${c.symbol}`} value={c.symbol}>{c.symbol} ({c.name})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-zinc-500 font-bold block mb-1">Price Mode</label>
                        <select
                          value={arbitrageConfig.coin2UseLiveOffset ? "live" : "manual"}
                          onChange={(e) => setArbitrageConfig({ 
                            ...arbitrageConfig, 
                            coin2UseLiveOffset: e.target.value === 'live' 
                          })}
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                        >
                          <option value="live">Dynamic % Discount</option>
                          <option value="manual">Manual Price Range</option>
                        </select>
                      </div>
                    </div>

                    {arbitrageConfig.coin2UseLiveOffset ? (
                      <div className="space-y-1 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900">
                        <label className="text-[10px] text-zinc-400 font-bold block">Discount on External Platforms (%)</label>
                        <p className="text-[9px] text-zinc-500 font-semibold mb-1.5">e.g., 2.8% means other platforms are 2.8% cheaper than this app's price.</p>
                        <input
                          type="number"
                          step="0.01"
                          value={arbitrageConfig.coin2OffsetPercentage}
                          onChange={(e) => setArbitrageConfig({ ...arbitrageConfig, coin2OffsetPercentage: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900">
                        <div>
                          <label className="text-[10px] text-zinc-400 font-bold block mb-1">External Min Price (USD)</label>
                          <input
                            type="number"
                            step="any"
                            value={arbitrageConfig.coin2ExternalMin}
                            onChange={(e) => setArbitrageConfig({ ...arbitrageConfig, coin2ExternalMin: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-400 font-bold block mb-1">External Max Price (USD)</label>
                          <input
                            type="number"
                            step="any"
                            value={arbitrageConfig.coin2ExternalMax}
                            onChange={(e) => setArbitrageConfig({ ...arbitrageConfig, coin2ExternalMax: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Quick calculations preview for Admin */}
                    <div className="bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/10 text-[10px] space-y-1 font-mono text-zinc-400">
                      <div className="font-bold text-zinc-300">Live Simulation Check:</div>
                      {(() => {
                        const matched = cryptoPricesList.find(c => c.symbol === arbitrageConfig.coin2Symbol);
                        const appPrice = matched ? matched.price : 0;
                        let extMin = arbitrageConfig.coin2ExternalMin;
                        let extMax = arbitrageConfig.coin2ExternalMax;
                        if (arbitrageConfig.coin2UseLiveOffset) {
                          extMin = appPrice * (1 - (arbitrageConfig.coin2OffsetPercentage + 0.3) / 100);
                          extMax = appPrice * (1 - (arbitrageConfig.coin2OffsetPercentage - 0.2) / 100);
                        }
                        const avgExt = (extMin + extMax) / 2;
                        const potentialProfit = appPrice - avgExt;
                        return (
                          <div className="space-y-0.5">
                            <div>App Rate: <span className="text-zinc-200">${appPrice.toLocaleString()}</span></div>
                            <div>External Range: <span className="text-zinc-200">${extMin.toLocaleString(undefined, {maximumFractionDigits: 2})} - ${extMax.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
                            <div>Arbitrage Difference: <span className="text-emerald-400 font-bold">+${potentialProfit.toLocaleString(undefined, {maximumFractionDigits: 2})} per coin ({((potentialProfit / avgExt) * 100).toFixed(2)}% ROI)</span></div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Platform Name Tags management */}
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/50 space-y-3">
                  <span className="text-xs font-black text-amber-400 tracking-wider uppercase block border-b border-zinc-900 pb-2">Arbitrage Platform Recommendations</span>
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold block mb-1">Recommended Platforms (Comma-Separated)</label>
                    <input
                      type="text"
                      value={arbitrageConfig.platformsList.join(', ')}
                      onChange={(e) => setArbitrageConfig({ 
                        ...arbitrageConfig, 
                        platformsList: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      })}
                      placeholder="Binance, Bybit, OKX, Coinbase, Kraken"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <p className="text-[9px] text-zinc-500 font-semibold mt-1">Users will see how to buy coins on these specific platforms and transfer/sell them to your platform to pocket the value difference.</p>
                  </div>
                </div>
              </div>

              {/* First Deposit Referral & Welcome Bonus Settings Controller */}
              <div id="referral-deposit-bonus-controller" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="text-amber-400" size={16} />
                    <div>
                      <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Referral & Welcome First Deposit Rewards</h3>
                      <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">
                        Configure reward commission for the referrer and welcoming bonus percentage for the new referred user on their FIRST deposit.
                      </p>
                    </div>
                  </div>
                  <div>
                    <button
                      id="save-referral-config-btn"
                      onClick={handleSaveReferralConfig}
                      disabled={isSavingReferralConfig}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSavingReferralConfig ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                      <span>Save Referral Settings</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Toggle status */}
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/50 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-300">Reward Status</span>
                      <button
                        type="button"
                        onClick={() => setReferralConfig({ ...referralConfig, enabled: !referralConfig.enabled })}
                        className={`px-3 py-1 text-[10px] font-black rounded-lg transition-colors cursor-pointer ${
                          referralConfig.enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {referralConfig.enabled ? 'ENABLED' : 'DISABLED'}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      When enabled, rewards are automatically issued when an admin approves a user's first deposit.
                    </p>
                  </div>

                  {/* Minimum Deposit Threshold USD */}
                  <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/50 space-y-1.5">
                    <label className="text-xs font-bold text-zinc-300 block">Minimum Deposit Threshold ($)</label>
                    <p className="text-[10px] text-zinc-500">Minimum first deposit required to qualify for any reward bonus.</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-400 font-mono">$</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={referralConfig.minDepositThresholdUSD}
                        onChange={(e) => setReferralConfig({ ...referralConfig, minDepositThresholdUSD: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Tier Ranges Section */}
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/50 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                    <div>
                      <span className="text-xs font-black text-amber-400 tracking-wider uppercase">Deposit Amount Tier Ranges</span>
                      <p className="text-[10px] text-zinc-500 font-medium">Set custom reward percentages based on deposit amount brackets.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newTier: DepositBonusTier = {
                          id: 'tier-' + Date.now(),
                          minAmount: 100,
                          maxAmount: 1000,
                          referrerPercent: 7,
                          refereePercent: 12
                        };
                        setReferralConfig({
                          ...referralConfig,
                          tiers: [...(referralConfig.tiers || []), newTier]
                        });
                      }}
                      className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Tier Range
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(!referralConfig.tiers || referralConfig.tiers.length === 0) ? (
                      <p className="text-xs text-zinc-500 italic py-2 text-center">No deposit reward tiers configured. Click 'Add Tier Range' to create reward brackets.</p>
                    ) : (
                      referralConfig.tiers.map((tier, idx) => (
                        <div key={tier.id} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-850">
                          <div>
                            <label className="text-[9px] text-zinc-500 font-bold block mb-0.5">Min Deposit ($)</label>
                            <input
                              type="number"
                              value={tier.minAmount}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = [...(referralConfig.tiers || [])];
                                updated[idx].minAmount = val;
                                setReferralConfig({ ...referralConfig, tiers: updated });
                              }}
                              className="w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-zinc-500 font-bold block mb-0.5">Max Deposit ($)</label>
                            <input
                              type="number"
                              value={tier.maxAmount}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = [...(referralConfig.tiers || [])];
                                updated[idx].maxAmount = val;
                                setReferralConfig({ ...referralConfig, tiers: updated });
                              }}
                              className="w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-amber-400/80 font-bold block mb-0.5">Referrer Reward (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={tier.referrerPercent}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = [...(referralConfig.tiers || [])];
                                updated[idx].referrerPercent = val;
                                setReferralConfig({ ...referralConfig, tiers: updated });
                              }}
                              className="w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-amber-400 font-mono font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-emerald-400/80 font-bold block mb-0.5">Referee Welcome (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={tier.refereePercent}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = [...(referralConfig.tiers || [])];
                                updated[idx].refereePercent = val;
                                setReferralConfig({ ...referralConfig, tiers: updated });
                              }}
                              className="w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-emerald-400 font-mono font-bold"
                            />
                          </div>
                          <div className="flex justify-end items-end h-full pt-2 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (referralConfig.tiers || []).filter(t => t.id !== tier.id);
                                setReferralConfig({ ...referralConfig, tiers: updated });
                              }}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors cursor-pointer"
                              title="Delete Tier"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Left Side: Crypto Networks Board */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3">
                  <div>
                    <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Crypto Coins & Addresses</h3>
                    <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">Edit networks and destination wallet addresses</p>
                  </div>
                  <button
                    id="new-coin-btn"
                    onClick={startNewCoin}
                    className="p-1 bg-zinc-850 hover:bg-zinc-750 text-emerald-400 rounded-lg border border-zinc-700/50 flex items-center gap-1 text-[10px] font-bold"
                  >
                    <Plus size={12} />
                    <span>New Coin</span>
                  </button>
                </div>

                {/* Coin Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {networks.map(net => (
                    <div
                      key={net.id}
                      id={`coin-edit-select-${net.id}`}
                      onClick={() => startCoinEdit(net)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          startCoinEdit(net);
                        }
                      }}
                      className={`p-3 text-left border rounded-2xl transition-all relative cursor-pointer ${
                        editingCoin?.id === net.id 
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' 
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-zinc-200'
                      }`}
                    >
                      <span className="text-xs font-black block">{net.tokenName}</span>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-1">{net.networks.length} network(s) configured</span>
                      <span className="text-[10px] text-emerald-400 font-semibold font-mono block mt-0.5">Min Withdraw: ${net.minWithdrawalUSD ?? 10} USD</span>
                      <button
                        id={`delete-coin-btn-${net.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCoin(net.id);
                        }}
                        className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 cursor-pointer"
                        title="Delete Coin"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Edit Form */}
                <form onSubmit={handleSaveCoin} className="space-y-3 pt-3 border-t border-zinc-800/85">
                  <h4 className="text-[10px] text-emerald-400 uppercase font-black tracking-wider">
                    {editingCoin ? `Edit Mode: ${editingCoin.tokenName}` : 'Add New Crypto Coin'}
                  </h4>

                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 font-bold block">Select Crypto Coin to Configure</label>
                    <select
                      id="crypto-coin-dropdown-select"
                      required
                      value={coinForm.id}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        if (!selectedId) {
                          startNewCoin();
                          return;
                        }
                        const foundCoin = SUPPORTED_COINS.find(c => c.id === selectedId);
                        if (foundCoin) {
                          const existingNet = networks.find(n => n.id === selectedId);
                          if (existingNet) {
                            startCoinEdit(existingNet);
                          } else {
                            setEditingCoin(null);
                            setCoinForm({ id: foundCoin.id, tokenName: foundCoin.name, minWithdrawalUSD: 10 });
                            setCoinNetworks([]);
                            setNewNetworkName('');
                            setNewNetworkAddress('');
                          }
                        }
                      }}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-semibold"
                    >
                      <option value="">-- Choose a Crypto Coin --</option>
                      {SUPPORTED_COINS.map(c => {
                        const isConfigured = networks.some(n => n.id === c.id);
                        return (
                          <option key={c.id} value={c.id} className="bg-zinc-950 text-white font-mono">
                            {c.name} {isConfigured ? '✓ (Configured - Select to Edit)' : '+ (Unconfigured - Click to Add)'}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Minimum Withdrawal Limit ($ USD) */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 font-bold block">Minimum Withdrawal Limit ($ USD)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500 text-xs font-bold">$</span>
                      <input
                        id="coin-min-withdrawal-usd-input"
                        type="number"
                        min="1"
                        step="0.01"
                        required
                        value={coinForm.minWithdrawalUSD}
                        onChange={(e) => setCoinForm({ ...coinForm, minWithdrawalUSD: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-7 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                        placeholder="10.00"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500">Users will not be allowed to submit a withdrawal below this USD value.</p>
                  </div>

                  {/* Network Multi Addresses Manager */}
                  <div className="space-y-2 p-3 bg-zinc-950 rounded-2xl border border-zinc-900">
                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-wider block">Network Wallet Addresses</span>
                    
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      {coinNetworks.length === 0 ? (
                        <p className="text-[10px] text-zinc-600 italic">No network pathways added yet. Add supporting network below.</p>
                      ) : (
                        coinNetworks.map((cn, idx) => (
                          <div key={idx} className="flex gap-2 items-center bg-zinc-900 p-2 rounded-lg border border-zinc-850 text-[11px]">
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-emerald-400 font-mono uppercase shrink-0 block">{cn.network}</span>
                              <span className="text-zinc-400 font-mono truncate block text-[10px] select-all">{cn.address}</span>
                            </div>
                            <button
                              id={`remove-network-idx-${idx}`}
                              type="button"
                              onClick={() => handleRemoveNetworkFromCoin(idx)}
                              className="text-red-400 hover:text-red-300 p-1 shrink-0 bg-zinc-950 border border-red-950 rounded"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Form to add a network */}
                    <div className="border-t border-zinc-900/80 pt-2 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <input
                            id="new-network-name-input"
                            type="text"
                            placeholder="TRC20"
                            value={newNetworkName}
                            onChange={(e) => setNewNetworkName(e.target.value)}
                            className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-850 rounded-lg text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono uppercase"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            id="new-network-address-input"
                            type="text"
                            placeholder="Deposit Wallet Address"
                            value={newNetworkAddress}
                            onChange={(e) => setNewNetworkAddress(e.target.value)}
                            className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-850 rounded-lg text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                          />
                        </div>
                      </div>
                      <button
                        id="add-network-btn"
                        type="button"
                        onClick={handleAddNetworkToCoin}
                        className="w-full py-1.5 bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 font-bold rounded-lg hover:text-white transition-colors"
                      >
                        + Add Network Pathway to Coin
                      </button>
                    </div>
                  </div>

                  <button
                    id="submit-coin-btn"
                    type="submit"
                    className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-xs rounded-xl hover:from-emerald-500 hover:to-teal-400 transition-all shadow-md mt-2 cursor-pointer"
                  >
                    {editingCoin ? 'Update Coin Settings' : 'Add New Coin Pathway'}
                  </button>
                </form>
              </div>

              {/* Right Side: P2P Merchants Board */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3">
                  <div>
                    <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider">P2P Merchants Directory</h3>
                    <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">Add, edit, delete payment merchants and exchange rates</p>
                  </div>
                  <button
                    id="new-merchant-btn"
                    onClick={startNewMerchant}
                    className="p-1 bg-zinc-850 hover:bg-zinc-750 text-emerald-400 rounded-lg border border-zinc-700 flex items-center gap-1 text-[10px] font-bold"
                  >
                    <Plus size={12} />
                    <span>New Merchant</span>
                  </button>
                </div>

                {/* Form to Create/Edit Merchant */}
                <form onSubmit={handleSaveMerchant} className="space-y-3 bg-zinc-950/40 p-4 rounded-2xl border border-zinc-850/80">
                  <h4 className="text-[10px] text-emerald-400 uppercase font-black tracking-wider">
                    {editingMerchant ? `Edit Merchant: ${editingMerchant.name}` : 'Register New Merchant'}
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-bold">Merchant Unique ID</label>
                      <input
                        id="merchant-id-input"
                        type="text"
                        required
                        disabled={!!editingMerchant}
                        placeholder="e.g. mtn-swift-pro"
                        value={merchantForm.id}
                        onChange={(e) => setMerchantForm({ ...merchantForm, id: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-bold">Merchant Name</label>
                      <input
                        id="merchant-name-input"
                        type="text"
                        required
                        placeholder="e.g. M-Pesa Pro Trades"
                        value={merchantForm.name}
                        onChange={(e) => setMerchantForm({ ...merchantForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-bold">Payment Mobile Number</label>
                      <input
                        id="merchant-number-input"
                        type="text"
                        required
                        placeholder="e.g. +256 782 111 222"
                        value={merchantForm.paymentNumber}
                        onChange={(e) => setMerchantForm({ ...merchantForm, paymentNumber: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-bold">Exchange Rate (Shs / 1 USD)</label>
                      <input
                        id="merchant-rate-input"
                        type="number"
                        step="any"
                        required
                        placeholder="3750.00"
                        value={merchantForm.rate}
                        onChange={(e) => setMerchantForm({ ...merchantForm, rate: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-bold">Reputation Rating (0 - 5.0)</label>
                      <input
                        id="merchant-rating-input"
                        type="number"
                        step="0.01"
                        min="0"
                        max="5"
                        required
                        value={merchantForm.rating}
                        onChange={(e) => setMerchantForm({ ...merchantForm, rating: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-bold">Merchant Type (Escrow Flow)</label>
                      <select
                        id="merchant-type-select"
                        required
                        value={merchantForm.type}
                        onChange={(e) => setMerchantForm({ ...merchantForm, type: e.target.value as 'buy' | 'sell' | 'both' })}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white"
                      >
                        <option value="both">Both (Deposit & Withdrawal)</option>
                        <option value="buy">Buy (Deposit Only)</option>
                        <option value="sell">Sell (Withdrawal Only)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-bold">Min Trade Limit (Shs)</label>
                      <input
                        id="merchant-min-limit-input"
                        type="number"
                        step="any"
                        required
                        placeholder="500"
                        value={merchantForm.minLimit}
                        onChange={(e) => setMerchantForm({ ...merchantForm, minLimit: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500 font-bold">Max Trade Limit (Shs)</label>
                      <input
                        id="merchant-max-limit-input"
                        type="number"
                        step="any"
                        required
                        placeholder="500000"
                        value={merchantForm.maxLimit}
                        onChange={(e) => setMerchantForm({ ...merchantForm, maxLimit: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 font-bold">Payment Providers (comma-separated)</label>
                    <input
                      id="merchant-providers-input"
                      type="text"
                      placeholder="M-Pesa, MTN MoMo, Airtel"
                      value={merchantForm.providers}
                      onChange={(e) => setMerchantForm({ ...merchantForm, providers: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <button
                    id="submit-new-merchant"
                    type="submit"
                    className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-xs rounded-xl hover:from-emerald-500 hover:to-teal-400 transition-all shadow-md mt-2 cursor-pointer"
                  >
                    {editingMerchant ? 'Update Merchant Directory' : 'Register New P2P Merchant'}
                  </button>
                </form>

                {/* Display Current Merchants */}
                <div className="space-y-2 mt-4">
                  <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-wider">Active Merchants Board Registry</h4>
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {merchants.map(m => (
                      <div key={m.id} className="bg-zinc-950 p-3 rounded-2xl border border-zinc-900 flex justify-between items-center text-xs">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-zinc-200">{m.name}</span>
                            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 font-bold">
                              <Star size={10} className="fill-emerald-400 text-emerald-400" />
                              {m.rating?.toFixed(1) || '5.0'}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase tracking-wider ${
                              m.type === 'buy' ? 'bg-emerald-950/85 text-emerald-400 border border-emerald-900/30' :
                              m.type === 'sell' ? 'bg-indigo-950/85 text-indigo-400 border border-indigo-900/30' :
                              'bg-purple-950/85 text-purple-400 border border-purple-900/30'
                            }`}>
                              {m.type || 'both'}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500 block font-mono mt-0.5">
                            No: {m.paymentNumber} | Rate: {m.rate?.toLocaleString()} Shs/USD
                          </span>
                          <span className="text-[10px] text-amber-500/90 font-mono block mt-0.5">
                            Limits: Min {(m.minLimit || 500).toLocaleString()} Shs — Max {(m.maxLimit || 500000).toLocaleString()} Shs
                          </span>
                          <span className="text-[9px] text-zinc-400 block mt-0.5">
                            Providers: {m.providers?.join(', ')}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            id={`edit-merchant-btn-${m.id}`}
                            onClick={() => startMerchantEdit(m)}
                            className="p-1.5 text-emerald-400 hover:text-emerald-300 bg-zinc-900 border border-zinc-800 rounded-lg"
                            title="Edit Merchant"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            id={`delete-merchant-btn-${m.id}`}
                            onClick={() => handleDeleteMerchant(m.id)}
                            className="p-1.5 text-red-400 hover:text-red-300 bg-zinc-900 border border-red-950 rounded-lg"
                            title="Delete Merchant"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Orphaned & Custom Transaction Cleaner */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                  <ShieldAlert className="text-red-400 animate-pulse" size={16} />
                  <div>
                    <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Database Maintenance: Orphaned Transaction Cleaner</h3>
                    <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">Wipe transactions of deleted/missing accounts or manually clean any User ID history.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left panel: Manual UID Wipe */}
                  <div className="space-y-3 bg-zinc-950/40 p-4 rounded-2xl border border-zinc-850/85">
                    <h4 className="text-[10px] text-red-400 font-black uppercase tracking-wider">Manual Transaction Wipe</h4>
                    <p className="text-[10px] text-zinc-400 leading-normal">
                      Enter any specific User ID (UID) below to completely purge all transaction history associated with it. This is useful if the user was deleted before cleaning up their logs.
                    </p>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-500 font-bold">Target User ID (UID)</label>
                      <input
                        id="custom-wipe-uid-input"
                        type="text"
                        placeholder="e.g. JjfzhPFIrxZiZOtz4zgrOAg3avz2"
                        value={customWipeUID}
                        onChange={(e) => setCustomWipeUID(e.target.value.trim())}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-red-500 text-white font-mono"
                      />
                    </div>
                    <button
                      id="wipe-custom-uid-btn"
                      onClick={() => {
                        if (!customWipeUID) {
                          showFeedback('error', 'Please enter a valid User ID (UID).');
                          return;
                        }
                        handleDeleteAllTransactions(customWipeUID, `Manual Entry (ID: ${customWipeUID})`);
                      }}
                      className="w-full py-2 bg-red-950/30 hover:bg-red-950/60 text-red-400 hover:text-red-300 border border-red-900/45 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>Wipe Transactions for UID</span>
                    </button>
                  </div>

                  {/* Right panel: Automatically Detected Orphaned Transactions */}
                  <div className="space-y-3 bg-zinc-950/40 p-4 rounded-2xl border border-zinc-850/85 flex flex-col justify-between">
                    <div className="space-y-1">
                      <h4 className="text-[10px] text-zinc-300 font-black uppercase tracking-wider">Auto-Detected Orphaned Data & Leftover Records</h4>
                      <p className="text-[10px] text-zinc-500">
                        The system scans for leftover transactions, investments, and bots belonging to deleted UIDs no longer on the system.
                      </p>
                    </div>

                    {(() => {
                      const registeredUIDs = new Set(usersList.map(u => u.uid));
                      const txUIDs = txList.map(t => t.userId).filter(Boolean);
                      const invUIDs = investmentsList.map(i => i.userId).filter(Boolean);
                      const botUIDs = userBotsList.map(b => b.userId).filter(Boolean);

                      const allUIDs = Array.from(new Set([...txUIDs, ...invUIDs, ...botUIDs])) as string[];
                      const orphanedUIDs = allUIDs.filter(uid => !registeredUIDs.has(uid));

                      if (orphanedUIDs.length === 0) {
                        return (
                          <div className="text-center py-4 bg-zinc-950/50 border border-zinc-900 rounded-xl">
                            <span className="text-[10px] text-emerald-400 font-bold block">✓ No Orphaned Database Records Found</span>
                            <span className="text-[9px] text-zinc-500 mt-0.5 block">Database is clean! All transactions, investments, and bots belong to active user accounts.</span>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {orphanedUIDs.map(uid => {
                            const txCount = txList.filter(t => t.userId === uid).length;
                            const invCount = investmentsList.filter(i => i.userId === uid).length;
                            const botCount = userBotsList.filter(b => b.userId === uid).length;
                            return (
                              <div key={uid} className="flex justify-between items-center bg-zinc-950 p-2.5 rounded-xl border border-zinc-900 text-[10px] font-mono">
                                <div className="space-y-0.5">
                                  <span className="text-zinc-400 font-bold block truncate max-w-[120px] sm:max-w-[180px]" title={uid}>{uid}</span>
                                  <span className="text-zinc-500 text-[9px] block font-sans font-medium">
                                    Leftover: {txCount} tx(s), {invCount} inv(s), {botCount} bot(s)
                                  </span>
                                </div>
                                <button
                                  id={`wipe-orphaned-btn-${uid}`}
                                  onClick={() => handleWipeAllUserData(uid, `Orphaned UID: ${uid}`)}
                                  className="px-2.5 py-1 bg-red-950/40 hover:bg-red-950/80 text-red-400 text-[9px] font-bold rounded-lg border border-red-900/30 transition-all cursor-pointer flex items-center gap-1"
                                  title="Wipe all leftover records for this deleted user ID"
                                >
                                  <Trash2 size={10} />
                                  <span>Wipe Data</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

            </div>
          </div>
          )}

        </div>
      )}

      {/* User Full Account Audit & History Modal */}
      {selectedUserHistory && (
        <div 
          id="user-history-modal" 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in"
        >
          <div className="relative max-w-2xl w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 overflow-hidden shadow-2xl space-y-4">
            <div className="flex justify-between items-start pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-black text-zinc-100 uppercase tracking-tight">
                  User Audit & Activity Management — {selectedUserHistory.displayName || 'User'}
                </h3>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                  Email: {selectedUserHistory.email} | Phone: {selectedUserHistory.phone || (selectedUserHistory as any).phoneNumber || 'N/A'} | UID: {selectedUserHistory.uid}
                </p>
              </div>
              <button 
                id="close-history-modal-btn"
                onClick={() => setSelectedUserHistory(null)}
                className="p-1.5 rounded-full bg-zinc-950 hover:bg-zinc-800 border border-zinc-850 text-zinc-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            {/* Overview Stats for User Data */}
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
              <div className="p-2 bg-zinc-950 rounded-xl border border-zinc-800/80">
                <span className="text-zinc-500 block uppercase font-sans text-[9px]">Transactions</span>
                <span className="text-sm font-black text-emerald-400">{selectedUserTxs.length}</span>
              </div>
              <div className="p-2 bg-zinc-950 rounded-xl border border-zinc-800/80">
                <span className="text-zinc-500 block uppercase font-sans text-[9px]">MMF Investments</span>
                <span className="text-sm font-black text-amber-400">
                  {investmentsList.filter(i => i.userId === selectedUserHistory.uid).length}
                </span>
              </div>
              <div className="p-2 bg-zinc-950 rounded-xl border border-zinc-800/80">
                <span className="text-zinc-500 block uppercase font-sans text-[9px]">AI Bots</span>
                <span className="text-sm font-black text-cyan-400">
                  {userBotsList.filter(b => b.userId === selectedUserHistory.uid).length}
                </span>
              </div>
            </div>

            {/* Transaction Audit Records List */}
            <div className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Recent Transactions History</div>
              {selectedUserTxs.length === 0 ? (
                <div className="text-center py-6 bg-zinc-950/50 rounded-xl border border-zinc-900">
                  <p className="text-xs text-zinc-500">No transaction records found for this account.</p>
                </div>
              ) : (
                selectedUserTxs.map(t => (
                  <div key={t.id} className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-xs flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-300">
                          {t.type === 'deposit_crypto' && 'Crypto Deposit'}
                          {t.type === 'deposit_p2p' && 'P2P Deposit'}
                          {t.type === 'withdraw_crypto' && 'Crypto Withdraw'}
                          {t.type === 'withdraw_p2p' && 'P2P Sell'}
                          {t.type === 'buy_crypto' && 'Buy Crypto'}
                          {t.type === 'sell_crypto' && 'Sell Crypto'}
                          {t.type === 'swap_crypto' && 'Swap/Convert'}
                          {t.type === 'internal_send' && 'Internal Send'}
                          {t.type === 'internal_receive' && 'Internal Receive'}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          t.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400' :
                          t.status === 'PENDING APPROVAL' ? 'bg-amber-500/10 text-amber-400 animate-pulse' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        <span>ID: {t.id} | Date: {formatDate(t.createdAt)}</span>
                        {t.network && <span className="block text-[9px] text-zinc-400">Network: {t.network} | Address: {t.address}</span>}
                        {t.merchantName && <span className="block text-[9px] text-zinc-400">Merchant: {t.merchantName} {t.localAmount && `(${t.localAmount.toLocaleString()} Shs)`}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-black font-mono text-emerald-400">
                        {t.coinAmount && t.coinSymbol && t.coinSymbol.toUpperCase() !== 'USDT'
                          ? `${t.coinAmount} ${t.coinSymbol}`
                          : `$${t.amount?.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Quick Wipe Management Controls */}
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Data Wipe Operations</div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    id="wipe-user-txs-modal-btn"
                    onClick={() => handleDeleteAllTransactions(selectedUserHistory.uid, selectedUserHistory.email || '')}
                    disabled={selectedUserTxs.length === 0}
                    className="px-2.5 py-1.5 bg-red-950/30 hover:bg-red-950/60 disabled:opacity-40 text-red-400 border border-red-900/40 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    title="Wipe transaction logs"
                  >
                    <Trash2 size={11} />
                    <span>Wipe Txs ({selectedUserTxs.length})</span>
                  </button>

                  <button
                    id="wipe-user-invs-modal-btn"
                    onClick={() => handleDeleteAllInvestments(selectedUserHistory.uid, selectedUserHistory.email || '')}
                    disabled={investmentsList.filter(i => i.userId === selectedUserHistory.uid).length === 0}
                    className="px-2.5 py-1.5 bg-amber-950/30 hover:bg-amber-950/60 disabled:opacity-40 text-amber-400 border border-amber-900/40 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    title="Wipe investment portfolios"
                  >
                    <Coins size={11} />
                    <span>Wipe Invs ({investmentsList.filter(i => i.userId === selectedUserHistory.uid).length})</span>
                  </button>

                  <button
                    id="wipe-user-bots-modal-btn"
                    onClick={() => handleDeleteAllBots(selectedUserHistory.uid, selectedUserHistory.email || '')}
                    disabled={userBotsList.filter(b => b.userId === selectedUserHistory.uid).length === 0}
                    className="px-2.5 py-1.5 bg-cyan-950/30 hover:bg-cyan-950/60 disabled:opacity-40 text-cyan-400 border border-cyan-900/40 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    title="Wipe AI trading bots"
                  >
                    <Bot size={11} />
                    <span>Wipe Bots ({userBotsList.filter(b => b.userId === selectedUserHistory.uid).length})</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="wipe-all-user-data-modal-btn"
                    onClick={() => handleWipeAllUserData(selectedUserHistory.uid, selectedUserHistory.email || '')}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-lg"
                    title="Wipe all activity records (Txs, Investments, Bots)"
                  >
                    <Trash2 size={11} />
                    <span>Wipe All Data</span>
                  </button>

                  <button
                    onClick={() => setSelectedUserHistory(null)}
                    className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot/Evidence Modal View */}
      {selectedEvidence && (
        <div 
          id="evidence-overlay-modal" 
          onClick={() => setSelectedEvidence(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-fade-in cursor-pointer"
        >
          <div className="relative max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-4 overflow-hidden shadow-2xl">
            <h4 className="text-xs font-black text-zinc-400 mb-3 text-center uppercase tracking-wider">Verification - Evidence Screenshot</h4>
            <img src={selectedEvidence} alt="Evidence document" className="max-h-[70vh] object-contain mx-auto rounded-xl border border-zinc-800" />
            <p className="text-[10px] text-zinc-500 text-center mt-3 font-semibold">Tap anywhere to close magnifier</p>
          </div>
        </div>
      )}

      {/* Add / Edit Copy Trader Lead Modal */}
      {isAddLeadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setIsAddLeadModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Users size={18} className="text-emerald-400" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                {editingLead ? 'Edit Lead Expert Trader' : 'Add New Lead Expert Trader'}
              </h3>
            </div>

            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Expert Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Alex 'Apex' Rivers"
                  value={leadForm.name}
                  onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                  className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Profile Photo URL *</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={leadForm.photoUrl}
                  onChange={(e) => setLeadForm({ ...leadForm, photoUrl: e.target.value })}
                  className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Professional Description *</label>
                <textarea
                  rows={3}
                  placeholder="Enter professional trading background, strategy, and experience..."
                  value={leadForm.description}
                  onChange={(e) => setLeadForm({ ...leadForm, description: e.target.value })}
                  className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Signals Per Day *</label>
                  <input
                    type="text"
                    placeholder="e.g. 8 - 12 signals/day"
                    value={leadForm.signalsPerDay}
                    onChange={(e) => setLeadForm({ ...leadForm, signalsPerDay: e.target.value })}
                    className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Win Rate %</label>
                  <input
                    type="text"
                    placeholder="e.g. 98.5%"
                    value={leadForm.winRate}
                    onChange={(e) => setLeadForm({ ...leadForm, winRate: e.target.value })}
                    className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Min Trade Amount ($ USD) *</label>
                  <input
                    type="number"
                    placeholder="e.g. 50"
                    value={leadForm.minCapital}
                    onChange={(e) => setLeadForm({ ...leadForm, minCapital: e.target.value })}
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Max Trade Amount ($ USD) *</label>
                  <input
                    type="number"
                    placeholder="e.g. 10000"
                    value={leadForm.maxCapital}
                    onChange={(e) => setLeadForm({ ...leadForm, maxCapital: e.target.value })}
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Analysis Commission (%) *</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 10"
                    value={leadForm.analysisCommission}
                    onChange={(e) => setLeadForm({ ...leadForm, analysisCommission: e.target.value })}
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">1 Day Profit Rate (%) *</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 2.0"
                    value={leadForm.dayProfitRate}
                    onChange={(e) => setLeadForm({ ...leadForm, dayProfitRate: e.target.value })}
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Contract Duration (Days) *</label>
                  <input
                    type="number"
                    placeholder="e.g. 30"
                    value={leadForm.contractDurationDays}
                    onChange={(e) => setLeadForm({ ...leadForm, contractDurationDays: e.target.value })}
                    className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Supported Trading Pairs (Comma-separated) *</label>
                <input
                  type="text"
                  placeholder="BTC/USDT, ETH/USDT, SOL/USDT, XRP/USDT"
                  value={leadForm.tradingPairs}
                  onChange={(e) => setLeadForm({ ...leadForm, tradingPairs: e.target.value })}
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Signals Config */}
              <div className="p-3 bg-zinc-950/70 border border-zinc-850 rounded-2xl space-y-2">
                <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">Daily Trading Signals Schedule & Admin Codes</span>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase block">Signal 1 Time (HH:MM)</label>
                    <input
                      type="text"
                      placeholder="13:00"
                      value={leadForm.sig1Time}
                      onChange={(e) => setLeadForm({ ...leadForm, sig1Time: e.target.value })}
                      className="w-full p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase block">Signal 1 Code</label>
                    <input
                      type="text"
                      placeholder="SIG1300"
                      value={leadForm.sig1Code}
                      onChange={(e) => setLeadForm({ ...leadForm, sig1Code: e.target.value })}
                      className="w-full p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-amber-400 font-mono font-bold uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase block">Signal 2 Time (HH:MM)</label>
                    <input
                      type="text"
                      placeholder="20:00"
                      value={leadForm.sig2Time}
                      onChange={(e) => setLeadForm({ ...leadForm, sig2Time: e.target.value })}
                      className="w-full p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase block">Signal 2 Code</label>
                    <input
                      type="text"
                      placeholder="SIG2000"
                      value={leadForm.sig2Code}
                      onChange={(e) => setLeadForm({ ...leadForm, sig2Code: e.target.value })}
                      className="w-full p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-amber-400 font-mono font-bold uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Risk Level</label>
                <select
                  value={leadForm.riskLevel}
                  onChange={(e) => setLeadForm({ ...leadForm, riskLevel: e.target.value })}
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Very Low Risk">Very Low Risk</option>
                  <option value="Low Risk">Low Risk</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High Yield">High Yield</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsAddLeadModalOpen(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingLead}
                onClick={handleSaveLead}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSavingLead ? (
                  <>
                    <Loader size={12} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Lead Trader</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div 
          id="confirm-modal-overlay" 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in animate-duration-200"
        >
          <div className="relative max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl shrink-0 ${confirmModal.danger ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                <ShieldAlert size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-100">{confirmModal.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                id="confirm-cancel-btn"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-submit-btn"
                onClick={() => {
                  confirmModal.onConfirm();
                }}
                className={`px-4 py-2 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md ${
                  confirmModal.danger 
                    ? 'bg-red-600 hover:bg-red-500 shadow-red-500/10' 
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/10'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
