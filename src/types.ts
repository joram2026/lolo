export interface UserAccount {
  uid: string;
  email: string;
  displayName?: string;
  phone?: string;
  country?: string;
  balance: number; // in USD
  referralSource?: string;
  hasMadeFirstDeposit?: boolean;
  createdAt: any; // Firestore Timestamp
  withdrawalEnabled: boolean;
  walletPassword?: string;
  holdings?: Record<string, number>;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
}

export type TransactionType = 
  | 'deposit_crypto' 
  | 'deposit_p2p' 
  | 'withdraw_crypto' 
  | 'withdraw_p2p' 
  | 'buy_crypto' 
  | 'sell_crypto' 
  | 'swap_crypto' 
  | 'referral_reward' 
  | 'first_deposit_commission'
  | 'welcome_bonus'
  | 'invested' 
  | 'investment_earning' 
  | 'internal_send' 
  | 'internal_receive';

export interface DepositBonusTier {
  id: string;
  minAmount: number;
  maxAmount: number;
  referrerPercent: number;
  refereePercent: number;
}

export interface ReferralDepositConfig {
  enabled: boolean;
  minDepositThresholdUSD: number; // e.g. 10 USD
  tiers?: DepositBonusTier[];
}

export type TransactionStatus = 'PENDING APPROVAL' | 'APPROVED' | 'DECLINED';

export interface Transaction {
  id: string;
  userId: string;
  userEmail: string;
  type: TransactionType;
  amount: number; // in USD
  localAmount?: number; // in shillings/local currency
  status: TransactionStatus;
  createdAt: any; // Firestore Timestamp
  evidence?: string; // base64 string or url
  paymentMessage?: string; // payment confirmation message text
  network?: string; // TRC20, ERC20, etc.
  address?: string; // destination wallet address or merchant details
  merchantName?: string;
  coinSymbol?: string; // for MMF or specific coin transactions
  coinAmount?: number; // for MMF or specific coin transactions
  feePercent?: number; // e.g. 10
  feeAmount?: number;  // 10% fee in USD
  netAmount?: number;  // amount user actually receives (90%)
}

export interface CryptoNetwork {
  id: string;
  tokenName: string; // e.g. "USDT", "BTC", "ETH"
  networks: string[]; // e.g. ["TRC20", "ERC20"]
  addresses: Record<string, string>; // e.g. {"TRC20": "TY...", "ERC20": "0x..."}
  minWithdrawalUSD?: number; // Minimum withdrawal amount in USD set by Admin
}

export interface P2PMerchant {
  id: string;
  name: string;
  paymentNumber: string;
  rating: number; // e.g. 4.9
  providers: string[]; // e.g. ["M-Pesa", "Airtel Money"]
  rate: number; // exchange rate (e.g. 130 shillings per USD)
  type: 'buy' | 'sell' | 'both';
  minLimit?: number; // Minimum transaction limit in Shillings
  maxLimit?: number; // Maximum transaction limit in Shillings
}

export interface CryptoPrice {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  mode?: 'live' | 'custom';
  lastSyncedAt?: string;
  investmentRate?: number; // Daily MMF / Signal investment rate in %
  minInvestment?: number; // Minimum amount that can be invested
  winRate?: number; // Signal Win Rate in % e.g. 98.5
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  image: string;
}

export interface ArbitrageConfig {
  coin1Symbol: string;
  coin1ExternalMin: number;
  coin1ExternalMax: number;
  coin1UseLiveOffset: boolean;
  coin1OffsetPercentage: number;
  coin2Symbol: string;
  coin2ExternalMin: number;
  coin2ExternalMax: number;
  coin2UseLiveOffset: boolean;
  coin2OffsetPercentage: number;
  platformsList: string[]; // platforms like ["Binance", "Bybit", "OKX", "Coinbase"]
}

export interface BotTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  winRatioRange: string;
  winProfitRange?: string;
  lossPercentRange?: string;
  minCapital: number;
  dailyRoi?: string;
  tradingPairs: string[];
  riskLevel: string;
  color?: string;
}

export interface UserBot {
  id: string;
  userId: string;
  userEmail: string;
  templateId: string;
  name: string;
  category: string;
  capital: number;
  coinSymbol: string;
  tradingPair: string;
  tradeDurationSec: number;
  accruedProfit: number;
  status: 'RUNNING' | 'PAUSED' | 'STOPPED';
  dailyRoi: string;
  winRatioRange: string;
  winProfitRange?: string;
  lossPercentRange?: string;
  wins: number;
  totalTrades: number;
  losses: number;
  createdAt: any;
}
