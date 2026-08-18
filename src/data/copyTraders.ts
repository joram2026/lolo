import { CopyTraderLead } from '../types';

export const DEFAULT_COPY_LEADS: CopyTraderLead[] = [
  {
    id: 'lead-alex-rivers',
    name: 'Alex "Apex" Rivers',
    photoUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&crop=face&w=160&h=160&q=75&fm=webp',
    description: 'Senior Quantitative Forex & Crypto Trader with 12+ years of market experience. Specializes in BTC/ETH algorithmic momentum and risk-managed break-outs.',
    signalsPerDay: '2 signals/day',
    winRate: '98.4%',
    copiersCount: 1420,
    minCapital: 50,
    maxCapital: 10000,
    analysisCommission: 10,
    dayProfitRate: 2.0,
    contractDurationDays: 30,
    tradingPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'],
    signals: [
      { id: 'sig-1', time: '13:00', code: 'SIG1300' },
      { id: 'sig-2', time: '20:00', code: 'SIG2000' }
    ],
    riskLevel: 'Low Risk'
  },
  {
    id: 'lead-elena-rostova',
    name: 'Elena Rostova',
    photoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&crop=face&w=160&h=160&q=75&fm=webp',
    description: 'Former Wall Street Macro Strategist focusing on swing trading and multi-asset arbitrage across top cryptocurrencies.',
    signalsPerDay: '2 signals/day',
    winRate: '96.8%',
    copiersCount: 980,
    minCapital: 100,
    maxCapital: 15000,
    analysisCommission: 12,
    dayProfitRate: 2.4,
    contractDurationDays: 30,
    tradingPairs: ['ETH/USDT', 'BTC/USDT', 'BNB/USDT', 'SOL/USDT'],
    signals: [
      { id: 'sig-1', time: '12:00', code: 'ELENA12' },
      { id: 'sig-2', time: '18:00', code: 'ELENA18' }
    ],
    riskLevel: 'Moderate'
  },
  {
    id: 'lead-david-chen',
    name: 'David Chen (Quantum Trading)',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&crop=face&w=160&h=160&q=75&fm=webp',
    description: 'High-frequency intraday scalper leveraging custom proprietary indicators for rapid intraday profit capture.',
    signalsPerDay: '2 signals/day',
    winRate: '94.5%',
    copiersCount: 2150,
    minCapital: 50,
    maxCapital: 8000,
    analysisCommission: 8,
    dayProfitRate: 1.8,
    contractDurationDays: 30,
    tradingPairs: ['BTC/USDT', 'SOL/USDT', 'DOGE/USDT', 'XRP/USDT'],
    signals: [
      { id: 'sig-1', time: '11:00', code: 'CHEN1100' },
      { id: 'sig-2', time: '19:00', code: 'CHEN1900' }
    ],
    riskLevel: 'Low Risk'
  },
  {
    id: 'lead-sarah-jenkins',
    name: 'Sarah Jenkins',
    photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&crop=face&w=160&h=160&q=75&fm=webp',
    description: 'Risk-first DeFi and Spot position trader with a disciplined 1:3 risk-reward ratio strategy.',
    signalsPerDay: '2 signals/day',
    winRate: '97.2%',
    copiersCount: 860,
    minCapital: 100,
    maxCapital: 12000,
    analysisCommission: 10,
    dayProfitRate: 2.2,
    contractDurationDays: 30,
    tradingPairs: ['BTC/USDT', 'ETH/USDT', 'USDC/USDT', 'SOL/USDT'],
    signals: [
      { id: 'sig-1', time: '14:00', code: 'SARAH14' },
      { id: 'sig-2', time: '21:00', code: 'SARAH21' }
    ],
    riskLevel: 'Low Risk'
  }
];
