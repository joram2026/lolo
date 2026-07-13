import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Transaction } from '../types';
import { 
  ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Clock, CheckCircle2, XCircle, 
  ChevronDown, ChevronUp, Filter, RefreshCw, Calendar, ListFilter, Gift, TrendingUp
} from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error in ActivityLog: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ActivityLogProps {
  userId: string;
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Transactions' },
  { value: 'deposits', label: 'Deposits' },
  { value: 'withdrawals', label: 'Withdrawals' },
  { value: 'buy', label: 'Buy Crypto' },
  { value: 'sell', label: 'Sell Crypto' },
  { value: 'swap', label: 'Swap & Convert' },
  { value: 'referral', label: 'Referral Rewards' },
  { value: 'investments', label: 'Crypto MMF' },
] as const;

export default function ActivityLog({ userId }: ActivityLogProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'deposits' | 'withdrawals' | 'buy' | 'sell' | 'swap' | 'referral' | 'investments'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when user clicks outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#custom-dropdown-container')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    setLoading(true);
    const txCol = collection(db, 'transactions');
    const q = query(txCol, where('userId', '==', userId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const list = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        } as Transaction));

        // Sort descending by creation date
        list.sort((a, b) => {
          const aTime = a.createdAt?.seconds || a.createdAt?.getTime?.() / 1000 || 0;
          const bTime = b.createdAt?.seconds || b.createdAt?.getTime?.() / 1000 || 0;
          return bTime - aTime;
        });

        setTransactions(list);
        setLoading(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'transactions');
      }
    }, (err) => {
      setError(err.message);
      setLoading(false);
      handleFirestoreError(err, OperationType.GET, 'transactions');
    });

    return () => unsubscribe();
  }, [userId]);

  // Filter transactions based on selection
  const filteredTransactions = transactions.filter(tx => {
    const isDeposit = tx.type.startsWith('deposit');
    const isWithdrawal = tx.type.startsWith('withdraw');
    const isBuy = tx.type === 'buy_crypto';
    const isSell = tx.type === 'sell_crypto';
    const isSwap = tx.type === 'swap_crypto';
    const isReferral = tx.type === 'referral_reward';
    const isInvestment = tx.type === 'invested' || tx.type === 'investment_earning';

    if (filter === 'deposits') return isDeposit;
    if (filter === 'withdrawals') return isWithdrawal;
    if (filter === 'buy') return isBuy;
    if (filter === 'sell') return isSell;
    if (filter === 'swap') return isSwap;
    if (filter === 'referral') return isReferral;
    if (filter === 'investments') return isInvestment;
    
    // For 'all' filter, show everything
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle2 size={14} className="text-emerald-400" />;
      case 'DECLINED':
        return <XCircle size={14} className="text-red-400" />;
      default:
        return <Clock size={14} className="text-amber-400" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'DECLINED':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      default:
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    }
  };

  const getTxTypeInfo = (type: string) => {
    switch (type) {
      case 'referral_reward':
        return {
          label: 'Referral Reward',
          isCredit: true,
          colorClass: 'text-emerald-400',
          bgClass: 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400',
          icon: <Gift size={16} />
        };
      case 'deposit_crypto':
        return {
          label: 'Crypto Deposit',
          isCredit: true,
          colorClass: 'text-emerald-400',
          bgClass: 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400',
          icon: <ArrowDownLeft size={16} />
        };
      case 'deposit_p2p':
        return {
          label: 'P2P Deposit',
          isCredit: true,
          colorClass: 'text-emerald-400',
          bgClass: 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400',
          icon: <ArrowDownLeft size={16} />
        };
      case 'withdraw_crypto':
        return {
          label: 'Crypto Withdrawal',
          isCredit: false,
          colorClass: 'text-red-400',
          bgClass: 'bg-red-500/10 border-red-500/15 text-red-400',
          icon: <ArrowUpRight size={16} />
        };
      case 'withdraw_p2p':
        return {
          label: 'P2P Withdrawal',
          isCredit: false,
          colorClass: 'text-red-400',
          bgClass: 'bg-red-500/10 border-red-500/15 text-red-400',
          icon: <ArrowUpRight size={16} />
        };
      case 'buy_crypto':
        return {
          label: 'Buy Crypto',
          isCredit: false, // spending USD to buy crypto
          colorClass: 'text-blue-450 text-[#60a5fa]',
          bgClass: 'bg-blue-500/10 border-blue-500/15 text-[#60a5fa]',
          icon: <ArrowDownLeft size={16} />
        };
      case 'sell_crypto':
        return {
          label: 'Sell Crypto',
          isCredit: true, // receiving USD from crypto sell
          colorClass: 'text-amber-400',
          bgClass: 'bg-amber-500/10 border-amber-500/15 text-amber-400',
          icon: <ArrowUpRight size={16} />
        };
      case 'swap_crypto':
        return {
          label: 'Swap & Convert',
          isCredit: null, // neutral / structural swap
          colorClass: 'text-[#a78bfa]', // purple-400
          bgClass: 'bg-purple-500/10 border-purple-500/15 text-[#a78bfa]',
          icon: <ArrowRightLeft size={16} />
        };
      case 'invested':
        return {
          label: 'MMF Invested',
          isCredit: false,
          colorClass: 'text-amber-500',
          bgClass: 'bg-amber-500/10 border-amber-500/15 text-amber-500',
          icon: <TrendingUp size={16} />
        };
      case 'investment_earning':
        return {
          label: 'MMF Earning',
          isCredit: true,
          colorClass: 'text-emerald-400',
          bgClass: 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400',
          icon: <TrendingUp size={16} />
        };
      default:
        const isDeposit = type.startsWith('deposit');
        return {
          label: isDeposit ? 'Deposit' : 'Withdrawal',
          isCredit: isDeposit,
          colorClass: isDeposit ? 'text-emerald-400' : 'text-red-400',
          bgClass: isDeposit 
            ? 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400' 
            : 'bg-red-500/10 border-red-500/15 text-red-400',
          icon: isDeposit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />
        };
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    let date: Date;
    if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div id="activity-log-container" className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 select-none">
        <div className="flex items-center gap-2">
          <ListFilter size={16} className="text-emerald-400" />
          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Transaction Activity Log</h3>
        </div>
        
        {/* Custom Dropdown */}
        <div id="custom-dropdown-container" className="relative shrink-0 z-50">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full sm:w-auto flex items-center justify-between gap-3 pl-8.5 pr-4 py-2 text-[10px] font-black uppercase bg-slate-950 border border-slate-850 text-zinc-300 hover:text-emerald-400 hover:border-slate-750 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/40 cursor-pointer transition-all min-w-[170px]"
          >
            <Filter size={11} className="absolute left-3.5 text-zinc-400" />
            <span>
              {FILTER_OPTIONS.find(opt => opt.value === filter)?.label || 'All Transactions'}
            </span>
            <ChevronDown 
              size={11} 
              className={`text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`} 
            />
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-1.5 w-full sm:w-[170px] bg-slate-950 border border-slate-850 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-900/60 animate-fade-in">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setFilter(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-[10px] font-black uppercase transition-all flex items-center justify-between cursor-pointer ${
                    filter === opt.value
                      ? 'bg-slate-900/80 text-emerald-400 font-extrabold'
                      : 'text-zinc-400 hover:bg-slate-900 hover:text-zinc-200'
                  }`}
                >
                  <span>{opt.label}</span>
                  {filter === opt.value && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-slate-800/60 border border-slate-750 rounded-2xl overflow-hidden divide-y divide-slate-800">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 select-none">
            <RefreshCw size={20} className="text-emerald-500 animate-spin" />
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Retrieving transaction logs...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-400 text-xs font-semibold select-none">
            {error}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-8 text-center select-none flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-zinc-500 border border-slate-850">
              <Calendar size={16} />
            </div>
            <p className="text-xs text-zinc-500 font-semibold mt-1">No transaction activity found</p>
            <p className="text-[10px] text-zinc-600 max-w-[240px] mx-auto leading-relaxed">
              Your transactions will appear here as soon as they are recorded or processed.
            </p>
          </div>
        ) : (
          filteredTransactions.map(tx => {
            const info = getTxTypeInfo(tx.type);
            const isExpanded = expandedId === tx.id;

            return (
              <div 
                key={tx.id}
                id={`activity-log-item-${tx.id}`}
                className="transition-all hover:bg-slate-800/40"
              >
                {/* Summary Row */}
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                  className="flex justify-between items-center p-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${info.bgClass}`}>
                      {info.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-zinc-200">
                          {info.label}
                        </span>
                        <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${getStatusBadgeClass(tx.status)}`}>
                          {tx.status}
                        </span>
                      </div>
                      <span className="text-[9px] text-zinc-500 font-semibold block mt-1 font-mono">
                        {formatDate(tx.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="text-right">
                      <span className={`text-xs font-black font-mono ${info.colorClass}`}>
                        {info.isCredit === true ? '+' : info.isCredit === false ? '-' : ''}${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {tx.localAmount && (
                        <span className="block text-[9px] font-bold text-zinc-500 font-mono mt-0.5">
                          {tx.localAmount.toLocaleString()} Shs
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-500">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="bg-slate-950/50 px-4 pb-4 pt-1 text-[10px] space-y-2 border-t border-slate-900/40 select-all animate-fade-in">
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-zinc-400 py-1.5">
                      <div>
                        <span className="text-zinc-600 font-bold block uppercase tracking-wider text-[8px]">Transaction ID</span>
                        <span className="font-mono text-zinc-300 font-medium">{tx.id}</span>
                      </div>
                      <div>
                        <span className="text-zinc-600 font-bold block uppercase tracking-wider text-[8px]">Method / Type</span>
                        <span className="text-zinc-300 font-semibold capitalize">
                          {tx.type.split('_').join(' ')}
                        </span>
                      </div>
                      {tx.network && (
                        <div>
                          <span className="text-zinc-600 font-bold block uppercase tracking-wider text-[8px]">Blockchain Network</span>
                          <span className="text-zinc-300 font-extrabold font-mono">{tx.network}</span>
                        </div>
                      )}
                      {tx.address && (
                        <div>
                          <span className="text-zinc-600 font-bold block uppercase tracking-wider text-[8px]">Destination Address</span>
                          <span className="text-zinc-300 font-semibold font-mono break-all">{tx.address}</span>
                        </div>
                      )}
                      {tx.merchantName && (
                        <div>
                          <span className="text-zinc-600 font-bold block uppercase tracking-wider text-[8px]">P2P Merchant</span>
                          <span className="text-zinc-300 font-bold">{tx.merchantName}</span>
                        </div>
                      )}
                      {tx.paymentMessage && (
                        <div className="col-span-2 mt-1">
                          <span className="text-zinc-600 font-bold block uppercase tracking-wider text-[8px]">Payment Information / Notes</span>
                          <p className="text-zinc-300 font-medium leading-relaxed bg-slate-900/80 p-2 rounded-lg border border-slate-800/40 mt-1">
                            {tx.paymentMessage}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
