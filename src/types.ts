export interface UserAccount {
  uid: string;
  email: string;
  displayName?: string;
  balance: number; // in USD
  referralSource?: string;
  createdAt: any; // Firestore Timestamp
  withdrawalEnabled: boolean;
  walletPassword?: string;
  holdings?: Record<string, number>;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
}

export type TransactionType = 'deposit_crypto' | 'deposit_p2p' | 'withdraw_crypto' | 'withdraw_p2p' | 'buy_crypto' | 'sell_crypto' | 'swap_crypto';

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
}

export interface CryptoNetwork {
  id: string;
  tokenName: string; // e.g. "USDT", "BTC", "ETH"
  networks: string[]; // e.g. ["TRC20", "ERC20"]
  addresses: Record<string, string>; // e.g. {"TRC20": "TY...", "ERC20": "0x..."}
}

export interface P2PMerchant {
  id: string;
  name: string;
  paymentNumber: string;
  rating: number; // e.g. 4.9
  providers: string[]; // e.g. ["M-Pesa", "Airtel Money"]
  rate: number; // exchange rate (e.g. 130 shillings per USD)
  type: 'buy' | 'sell' | 'both';
}

export interface CryptoPrice {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  mode?: 'live' | 'custom';
  lastSyncedAt?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  image: string;
}
