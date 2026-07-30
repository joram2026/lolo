import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Bot, 
  Pause, 
  Play, 
  Square, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  Terminal, 
  CheckCircle2, 
  XCircle, 
  Zap,
  Activity,
  ShieldCheck,
  AlertCircle,
  X,
  History,
  RotateCcw
} from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../context/ToastContext';

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

interface TradeOutcomeModalData {
  isWin: boolean;
  profitDelta: number;
  profitPercent: number;
  capital: number;
  durationSeconds: number;
  tradingPair: string;
  botName: string;
}

interface RunningBotViewProps {
  bot: any;
  user: any;
  userBalance: number;
  isLightTheme: boolean;
  onBack: () => void;
  onTradeAgain?: (bot: any) => void;
  onGoToHistory?: () => void;
}

export const RunningBotView: React.FC<RunningBotViewProps> = ({
  bot,
  user,
  userBalance,
  isLightTheme,
  onBack,
  onTradeAgain,
  onGoToHistory
}) => {
  const toast = useToast();
  
  const durationSeconds = bot?.durationSeconds || (bot?.durationMinutes ? Math.round(bot.durationMinutes * 60) : 60);
  const tradingPair = bot?.tradingPair || 'BTC/USDT';
  const botName = bot?.name || 'Trading Bot';
  
  const [remainingSeconds, setRemainingSeconds] = useState<number>(durationSeconds);
  const [status, setStatus] = useState<'RUNNING' | 'PAUSED' | 'STOPPED'>(bot?.status || 'RUNNING');
  const [wins, setWins] = useState<number>(bot?.wins || 0);
  const [losses, setLosses] = useState<number>(bot?.losses || 0);
  const [totalTrades, setTotalTrades] = useState<number>(bot?.totalTrades || 0);
  const [accruedProfit, setAccruedProfit] = useState<number>(bot?.accruedProfit || 0);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [outcomeModal, setOutcomeModal] = useState<TradeOutcomeModalData | null>(null);
  const [showStopConfirmModal, setShowStopConfirmModal] = useState<boolean>(false);

  const formatTime = () => {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  };

  const [logs, setLogs] = useState<LogEntry[]>(() => [
    {
      id: '1',
      time: formatTime(),
      message: `'${botName}' initialized on ${tradingPair} with $${bot?.capital || 0} capital (${durationSeconds}s cycle).`,
      type: 'info'
    },
    {
      id: '2',
      time: formatTime(),
      message: `Analyzing market depth & technical indicators on ${tradingPair}...`,
      type: 'info'
    }
  ]);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const isExecutingRef = useRef<boolean>(false);

  // Auto-scroll console log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Main Trade Cycle & Countdown Timer Effect
  useEffect(() => {
    if (status !== 'RUNNING' || outcomeModal !== null) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          // Trade round completed! Trigger execution once outside of state updater
          if (!isExecutingRef.current) {
            isExecutingRef.current = true;
            setTimeout(() => {
              executeTradeRound().finally(() => {
                isExecutingRef.current = false;
              });
            }, 0);
          }
          return durationSeconds;
        }

        // Add periodic analytical logs
        if (prev === Math.floor(durationSeconds * 0.75)) {
          addLog(`Scanning order book depth & RSI momentum on ${tradingPair}...`, 'info');
        } else if (prev === Math.floor(durationSeconds * 0.50)) {
          addLog(`Signal detected: Technical indicator confirmation on ${tradingPair}.`, 'info');
        } else if (prev === Math.floor(durationSeconds * 0.25)) {
          addLog(`Executing smart order placement on liquidity node...`, 'info');
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status, durationSeconds, tradingPair, outcomeModal]);

  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setLogs((prevLogs) => [
      ...prevLogs.slice(-49), // Keep last 50 logs
      {
        id: Math.random().toString(36).substring(2, 9),
        time: formatTime(),
        message,
        type
      }
    ]);
  };

  const executeTradeRound = async () => {
    // 75% win probability (25% loss chance) per trade cycle
    const isWin = Math.random() < 0.75;
    const capital = bot?.capital || 50;
    
    // Profit delta calculation (+1.5% to +2.3% for win, -0.4% to -1.4% for loss)
    const profitRate = isWin 
      ? (0.015 + Math.random() * 0.008) 
      : -(0.004 + Math.random() * 0.010);
    const profitDelta = parseFloat((capital * profitRate).toFixed(2));
    const profitPercent = parseFloat((profitRate * 100).toFixed(2));

    let newTotal = totalTrades + 1;
    let newWins = isWin ? wins + 1 : wins;
    let newLosses = isWin ? losses : losses + 1;
    let newProfit = parseFloat((accruedProfit + profitDelta).toFixed(2));

    setTotalTrades(newTotal);
    setWins(newWins);
    setLosses(newLosses);
    setAccruedProfit(newProfit);

    if (isWin) {
      addLog(`Trade #${newTotal} closed! Result: WIN (+${profitDelta.toFixed(2)} USDT) on ${tradingPair}.`, 'success');
    } else {
      addLog(`Trade #${newTotal} closed! Result: LOSS (${profitDelta.toFixed(2)} USDT) on ${tradingPair}.`, 'warning');
    }

    // Trigger Profit / Loss Outcome Modal
    setOutcomeModal({
      isWin,
      profitDelta,
      profitPercent,
      capital,
      durationSeconds,
      tradingPair,
      botName
    });

    // Persist bot stats to Firestore
    if (bot?.id) {
      try {
        const botRef = doc(db, 'user_bots', bot.id);
        await updateDoc(botRef, {
          accruedProfit: newProfit,
          wins: newWins,
          losses: newLosses,
          totalTrades: newTotal,
          lastTradeAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Error updating bot stats in Firestore:", err);
      }
    }

    if (user?.uid) {
      try {
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          userEmail: user.email || '',
          type: 'bot_trade',
          title: `${botName}`,
          tradingPair: tradingPair,
          botName: botName,
          amount: profitDelta,
          profitDelta: profitDelta,
          profitPercent: profitPercent,
          isWin: isWin,
          isCredit: isWin,
          status: isWin ? 'WIN' : 'LOSS',
          paymentMessage: `Bot trade on ${tradingPair}: ${isWin ? 'WIN' : 'LOSS'} (${profitDelta >= 0 ? '+' : ''}$${profitDelta.toFixed(2)})`,
          createdAt: serverTimestamp()
        });
      } catch (txErr) {
        console.error("Error creating bot_trade transaction record:", txErr);
      }
    }
  };

  // Toggle Pause/Resume
  const handleTogglePause = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    const newStatus = status === 'RUNNING' ? 'PAUSED' : 'RUNNING';
    try {
      if (bot?.id) {
        const botRef = doc(db, 'user_bots', bot.id);
        await updateDoc(botRef, { status: newStatus });
      }
      setStatus(newStatus);
      if (newStatus === 'PAUSED') {
        addLog(`Bot trading paused by user.`, 'warning');
        toast.info(`'${botName}' trading paused`, 'Bot Paused');
      } else {
        addLog(`Bot trading resumed.`, 'info');
        toast.success(`'${botName}' trading resumed`, 'Bot Running');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update bot status', 'Status Error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Stop Confirmation Modal
  const handleStopBotClick = () => {
    if (actionLoading) return;
    setShowStopConfirmModal(true);
  };

  // Confirm Stop Bot and Return Capital + Profit/Loss
  const confirmStopBot = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const botCapital = bot?.capital || 0;
      const totalReturnAmount = Math.max(0, parseFloat((botCapital + accruedProfit).toFixed(2)));
      const userRef = doc(db, 'users', user.uid);
      const newBalance = userBalance + totalReturnAmount;
      await updateDoc(userRef, { balance: newBalance });

      if (bot?.id) {
        const botRef = doc(db, 'user_bots', bot.id);
        await updateDoc(botRef, { 
          status: 'STOPPED', 
          accruedProfit: 0,
          stoppedAt: serverTimestamp() 
        });
      }

      if (accruedProfit !== 0) {
        const isProfit = accruedProfit > 0;
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          userEmail: user.email,
          type: 'bot_harvest',
          title: `${botName} ${isProfit ? 'Profit Harvest' : 'Loss Deduction'}`,
          tradingPair: bot?.tradingPair || 'BTC/USDT',
          botName: botName,
          amount: Math.abs(accruedProfit),
          profitDelta: accruedProfit,
          isWin: isProfit,
          status: isProfit ? 'WIN' : 'LOSS',
          paymentMessage: `Bot ${botName} stopped: ${isProfit ? `Harvested +$${accruedProfit.toFixed(2)} USDT profit` : `Net loss -$${Math.abs(accruedProfit).toFixed(2)} USDT`}`,
          createdAt: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        userEmail: user.email,
        type: 'bot_capital_return',
        title: 'Bot Capital Return',
        amount: botCapital,
        status: 'APPROVED',
        coinSymbol: bot?.coinSymbol || 'USDT',
        paymentMessage: `Auto Bot trade: Stopped ${botName} & returned $${botCapital.toFixed(2)} capital`,
        createdAt: serverTimestamp()
      });

      addLog(`Bot '${botName}' stopped. Credited $${totalReturnAmount.toFixed(2)} USDT to wallet balance.`, 'warning');
      toast.success(`Stopped '${botName}'. Credited $${totalReturnAmount.toFixed(2)} to your balance!`, 'Auto Bot Trade');
      setShowStopConfirmModal(false);
      onBack();
    } catch (err: any) {
      console.error("Error stopping bot:", err);
      toast.error(err.message || 'Failed to stop bot', 'Stop Error');
      setActionLoading(false);
    }
  };

  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / durationSeconds) * 100));
  const winRatio = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '100.0';

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl mx-auto pb-10">
      {/* HEADER SECTION */}
      <div className={`p-5 sm:p-6 rounded-3xl border shadow-xs transition-all ${
        isLightTheme ? 'bg-white border-zinc-200/90' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className={`w-10 h-10 rounded-2xl border transition-all cursor-pointer flex items-center justify-center shadow-xs active:scale-95 ${
                isLightTheme 
                  ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-700' 
                  : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-zinc-200'
              }`}
              title="Back to Dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className={`text-xl sm:text-2xl font-black tracking-tight ${
                  isLightTheme ? 'text-zinc-900' : 'text-white'
                }`}>
                  Running Bot
                </h2>
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-3 py-1 rounded-full font-black uppercase tracking-wider border shadow-xs ${
                  status === 'RUNNING'
                    ? isLightTheme ? 'bg-emerald-100/90 text-emerald-900 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : isLightTheme ? 'bg-amber-100/90 text-amber-900 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${status === 'RUNNING' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                  {status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Badges row right below Running Bot title */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3.5 border-t border-zinc-100 dark:border-slate-800/80">
          <div className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 ${
            isLightTheme 
              ? 'bg-amber-100/80 border-amber-300 text-amber-900 shadow-xs' 
              : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
          }`}>
            <Bot size={14} className={isLightTheme ? 'text-amber-700' : 'text-emerald-400'} />
            <span>{botName}</span>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border flex items-center gap-1.5 ${
            isLightTheme 
              ? 'bg-zinc-100/90 border-zinc-200 text-zinc-700' 
              : 'bg-slate-800 border-slate-700 text-zinc-300'
          }`}>
            <Clock size={14} className="text-amber-500" />
            <span>Cycle duration: <strong className="font-mono">{durationSeconds}s</strong></span>
          </div>
        </div>

        {/* Text line */}
        <p className={`text-xs font-medium mt-3 leading-relaxed ${
          isLightTheme ? 'text-zinc-600' : 'text-zinc-400'
        }`}>
          <strong className={isLightTheme ? 'text-amber-700 font-bold' : 'text-emerald-400 font-bold'}>'{botName}'</strong> is automatically analyzing trade entries on <strong className="font-mono text-zinc-900 dark:text-zinc-100">{tradingPair}</strong>.
        </p>
      </div>

      {/* CARD 1: Trade Closes in & Trading Pair + Countdown Progress Bar */}
      <div className={`p-5 sm:p-6 rounded-3xl border shadow-xs space-y-4 ${
        isLightTheme ? 'bg-white border-zinc-200/90' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-row items-center justify-between gap-3">
          {/* Trade Closes in */}
          <div>
            <span className={`text-[11px] font-black uppercase tracking-wider block ${
              isLightTheme ? 'text-zinc-400' : 'text-zinc-400'
            }`}>
              Trade Closes In
            </span>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`px-4 py-1.5 rounded-xl font-mono text-lg sm:text-xl font-black border tracking-tight shadow-xs ${
                remainingSeconds <= 10 
                  ? 'bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-950/60 dark:border-rose-500/40 dark:text-rose-300 animate-pulse'
                  : isLightTheme 
                    ? 'bg-amber-100/80 border-amber-300 text-amber-900' 
                    : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
              }`}>
                {status === 'PAUSED' ? 'PAUSED' : `${remainingSeconds}s`}
              </span>
            </div>
          </div>

          {/* Trading Pair */}
          <div className="text-right">
            <span className={`text-[11px] font-black uppercase tracking-wider block ${
              isLightTheme ? 'text-zinc-400' : 'text-zinc-400'
            }`}>
              Trading Pair
            </span>
            <div className="mt-1.5">
              <span className={`px-4 py-1.5 rounded-xl font-mono text-sm sm:text-base font-black border inline-block shadow-xs ${
                isLightTheme ? 'bg-zinc-100 border-zinc-200 text-zinc-900' : 'bg-slate-800 border-slate-700 text-white'
              }`}>
                {tradingPair}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2 pt-2">
          <div className="flex justify-between items-center text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
            <span>Progress: {progressPercent.toFixed(0)}%</span>
            <span>Duration: {durationSeconds}s</span>
          </div>
          <div className={`w-full h-3 rounded-full p-0.5 overflow-hidden border ${
            isLightTheme ? 'bg-zinc-100 border-zinc-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                remainingSeconds <= 10
                  ? 'bg-rose-500'
                  : isLightTheme 
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-xs' 
                    : 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-xs'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* CARD 2: Wins, Total Trades, Losses, Win Ratio, Profit + STOP & PAUSE Buttons */}
      <div className={`p-5 sm:p-6 rounded-3xl border shadow-xs space-y-5 ${
        isLightTheme ? 'bg-white border-zinc-200/90' : 'bg-slate-900 border-slate-800'
      }`}>
        {/* Top Row: Wins, Total trades, Losses */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`p-3.5 sm:p-4 rounded-2xl border text-center transition-all ${
            isLightTheme ? 'bg-emerald-50/80 border-emerald-200' : 'bg-emerald-950/20 border-emerald-500/20'
          }`}>
            <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider block ${
              isLightTheme ? 'text-emerald-800' : 'text-emerald-400'
            }`}>
              Wins
            </span>
            <span className={`text-xl sm:text-2xl font-black font-mono mt-0.5 block ${
              isLightTheme ? 'text-emerald-700' : 'text-emerald-300'
            }`}>
              {wins}
            </span>
          </div>

          <div className={`p-3.5 sm:p-4 rounded-2xl border text-center transition-all ${
            isLightTheme ? 'bg-zinc-50 border-zinc-200' : 'bg-slate-800/60 border-slate-700/60'
          }`}>
            <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider block ${
              isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
            }`}>
              Total Trades
            </span>
            <span className={`text-xl sm:text-2xl font-black font-mono mt-0.5 block ${
              isLightTheme ? 'text-zinc-900' : 'text-white'
            }`}>
              {totalTrades}
            </span>
          </div>

          <div className={`p-3.5 sm:p-4 rounded-2xl border text-center transition-all ${
            isLightTheme ? 'bg-rose-50/80 border-rose-200' : 'bg-rose-950/20 border-rose-500/20'
          }`}>
            <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider block ${
              isLightTheme ? 'text-rose-800' : 'text-rose-400'
            }`}>
              Losses
            </span>
            <span className={`text-xl sm:text-2xl font-black font-mono mt-0.5 block ${
              isLightTheme ? 'text-rose-700' : 'text-rose-300'
            }`}>
              {losses}
            </span>
          </div>
        </div>

        {/* Bottom Row: Win ratio & Profit */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-4 rounded-2xl border ${
            isLightTheme ? 'bg-zinc-50 border-zinc-200' : 'bg-slate-800/40 border-slate-700/60'
          }`}>
            <span className={`text-[11px] font-black uppercase tracking-wider block ${
              isLightTheme ? 'text-zinc-500' : 'text-zinc-400'
            }`}>
              Win Ratio
            </span>
            <span className={`text-xl sm:text-2xl font-black font-mono mt-1 block ${
              isLightTheme ? 'text-amber-600' : 'text-emerald-400'
            }`}>
              {winRatio}%
            </span>
          </div>

          <div className={`p-4 rounded-2xl border ${
            isLightTheme 
              ? accruedProfit >= 0 ? 'bg-emerald-50/50 border-emerald-200/80' : 'bg-rose-50/50 border-rose-200/80'
              : accruedProfit >= 0 ? 'bg-emerald-950/20 border-emerald-500/20' : 'bg-rose-950/20 border-rose-500/20'
          }`}>
            <span className={`text-[11px] font-black uppercase tracking-wider block ${
              isLightTheme 
                ? accruedProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                : accruedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {accruedProfit >= 0 ? 'Accrued Profit' : 'Accrued Loss'}
            </span>
            <span className={`text-xl sm:text-2xl font-black font-mono mt-1 block ${
              isLightTheme 
                ? accruedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                : accruedProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}>
              {accruedProfit >= 0 ? '+' : ''}${accruedProfit.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Action Buttons: Stop & Pause */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleStopBotClick}
            disabled={actionLoading}
            className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all flex items-center justify-center gap-2 shadow-xs active:scale-95 ${
              isLightTheme 
                ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700' 
                : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
            }`}
          >
            <Square size={15} fill="currentColor" />
            <span>Stop</span>
          </button>

          <button
            type="button"
            onClick={handleTogglePause}
            disabled={actionLoading}
            className={`flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all flex items-center justify-center gap-2 shadow-xs active:scale-95 ${
              status === 'RUNNING'
                ? isLightTheme 
                  ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900' 
                  : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
                : isLightTheme
                  ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-400 border-emerald-400 text-slate-950'
            }`}
          >
            {status === 'RUNNING' ? <Pause size={15} /> : <Play size={15} />}
            <span>{status === 'RUNNING' ? 'Pause' : 'Resume'}</span>
          </button>
        </div>
      </div>

      {/* CARD 3: Bot Console Log */}
      <div className={`p-5 sm:p-6 rounded-3xl border shadow-lg space-y-3 ${
        isLightTheme ? 'bg-white border-zinc-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-black tracking-tight flex items-center gap-2 ${
            isLightTheme ? 'text-zinc-900' : 'text-white'
          }`}>
            <Terminal size={17} className={isLightTheme ? 'text-amber-500' : 'text-emerald-400'} />
            <span>Bot Console log</span>
          </h3>
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
            Live Output
          </span>
        </div>

        {/* Log Window */}
        <div 
          ref={logContainerRef}
          className={`h-52 overflow-y-auto p-3.5 rounded-2xl font-mono text-xs space-y-2 border ${
            isLightTheme 
              ? 'bg-zinc-900 border-zinc-800 text-zinc-200' 
              : 'bg-slate-950 border-slate-800 text-slate-200'
          }`}
        >
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-relaxed text-[11px] sm:text-xs">
              <span className="text-zinc-500 shrink-0 select-none">[{log.time}]</span>
              <span className={
                log.type === 'success' 
                  ? 'text-emerald-400 font-bold' 
                  : log.type === 'warning' 
                  ? 'text-amber-400 font-bold' 
                  : log.type === 'error'
                  ? 'text-rose-400 font-bold'
                  : 'text-zinc-300'
              }>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* TRADE OUTCOME MODAL (PROFIT / LOSS) BASED ON BLUEPRINT */}
      {outcomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className={`relative max-w-sm w-full p-6 rounded-3xl border shadow-2xl text-center space-y-4 ${
            isLightTheme ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            {/* Close X Button */}
            <button
              type="button"
              onClick={() => setOutcomeModal(null)}
              className={`absolute top-4 right-4 p-1.5 rounded-full border transition-all cursor-pointer ${
                isLightTheme 
                  ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-500' 
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-zinc-400'
              }`}
            >
              <X size={16} />
            </button>

            {/* Top Badge: Profit or Loss */}
            <div className="flex justify-center pt-1">
              <span className={`px-4 py-1 rounded-full text-xs font-black uppercase tracking-wider border shadow-sm ${
                outcomeModal.isWin
                  ? isLightTheme
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : isLightTheme
                    ? 'bg-rose-100 border-rose-300 text-rose-800'
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              }`}>
                {outcomeModal.isWin ? 'Profit' : 'Loss'}
              </span>
            </div>

            {/* Message Headings */}
            <div className="space-y-1">
              <h3 className={`text-base font-black tracking-tight ${
                outcomeModal.isWin
                  ? isLightTheme ? 'text-emerald-700' : 'text-emerald-400'
                  : isLightTheme ? 'text-rose-700' : 'text-rose-400'
              }`}>
                {outcomeModal.isWin ? 'Profitable trade closed.' : 'Loss trade closed.'}
              </h3>
              <p className={`text-xs font-semibold ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {outcomeModal.isWin ? 'Trade again for more Profit' : 'Trade again to recover'}
              </p>
            </div>

            {/* Outcome Pill Box: (+XX.XX (X%)) */}
            <div className={`py-3 px-4 rounded-2xl border font-mono font-black text-xl sm:text-2xl tracking-wide flex items-center justify-center gap-2 ${
              outcomeModal.isWin
                ? isLightTheme
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-inner'
                  : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 shadow-inner'
                : isLightTheme
                  ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-inner'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300 shadow-inner'
            }`}>
              {outcomeModal.isWin ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
              <span>
                {outcomeModal.isWin ? '+' : ''}{outcomeModal.profitDelta.toFixed(2)} USDT ({outcomeModal.profitPercent > 0 ? '+' : ''}{outcomeModal.profitPercent.toFixed(1)}%)
              </span>
            </div>

            {/* Details Grid */}
            <div className={`p-3.5 rounded-2xl border text-left text-xs space-y-2 font-medium ${
              isLightTheme ? 'bg-zinc-50 border-zinc-200 text-zinc-700' : 'bg-slate-800/60 border-slate-700/60 text-zinc-300'
            }`}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-bold block">Invested amount</span>
                  <span className="font-mono font-bold">${outcomeModal.capital} USDT</span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-bold block">Duration</span>
                  <span className="font-mono font-bold">{outcomeModal.durationSeconds}s</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-zinc-200 dark:border-slate-700/60">
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-bold block">Trading pair</span>
                  <span className="font-mono font-bold">{outcomeModal.tradingPair}</span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-bold block">Trade type</span>
                  <span className="font-mono font-bold capitalize">bot</span>
                </div>
              </div>
            </div>

            {/* Action Buttons: Trade again & History */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setOutcomeModal(null);
                  setRemainingSeconds(durationSeconds);
                  setStatus('RUNNING');
                  addLog(`Initiated next trade round on ${tradingPair} (${durationSeconds}s cycle).`, 'info');
                  toast.success(`Continuing auto trade on ${tradingPair}`, 'Trade Restarted');
                }}
                className={`py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 ${
                  isLightTheme
                    ? 'bg-amber-500 hover:bg-amber-600 border-amber-600 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-400 border-emerald-400 text-slate-950 font-black'
                }`}
              >
                <RotateCcw size={14} />
                <span>Trade again</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOutcomeModal(null);
                  if (onGoToHistory) {
                    onGoToHistory();
                  } else {
                    onBack();
                  }
                }}
                className={`py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                  isLightTheme
                    ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                }`}
              >
                <History size={14} />
                <span>History</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STOP CONFIRMATION MODAL */}
      {showStopConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className={`relative max-w-sm w-full p-6 rounded-3xl border shadow-2xl space-y-4 ${
            isLightTheme ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <button
              type="button"
              onClick={() => setShowStopConfirmModal(false)}
              className={`absolute top-4 right-4 p-1.5 rounded-full border transition-all cursor-pointer ${
                isLightTheme 
                  ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-500' 
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-zinc-400'
              }`}
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 pt-1">
              <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30 shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight">Stop Trading Bot?</h3>
                <p className={`text-xs font-medium ${isLightTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Confirm bot termination
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2.5 ${
              isLightTheme ? 'bg-zinc-50 border-zinc-200 text-zinc-700' : 'bg-slate-800/60 border-slate-700/60 text-zinc-300'
            }`}>
              <p>
                Are you sure you want to stop <strong className={isLightTheme ? 'text-zinc-900' : 'text-white'}>'{botName}'</strong>?
              </p>
              <div className="pt-2 border-t border-zinc-200 dark:border-slate-700/60 space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Capital:</span>
                  <span className="font-bold">${bot?.capital || 0} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Accrued Profit/Loss:</span>
                  <span className={`font-bold ${accruedProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {accruedProfit >= 0 ? '+' : ''}${accruedProfit.toFixed(2)} USDT
                  </span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-dashed border-zinc-200 dark:border-slate-700/60 text-sm font-black">
                  <span>Total Return:</span>
                  <span className="text-amber-500 dark:text-emerald-400">${((bot?.capital || 0) + accruedProfit).toFixed(2)} USDT</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowStopConfirmModal(false)}
                disabled={actionLoading}
                className={`py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all ${
                  isLightTheme
                    ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmStopBot}
                disabled={actionLoading}
                className="py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all bg-rose-500 hover:bg-rose-600 border-rose-600 text-white shadow-md active:scale-95 flex items-center justify-center gap-1.5"
              >
                {actionLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Square size={13} fill="currentColor" />
                    <span>Yes, Stop Bot</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
