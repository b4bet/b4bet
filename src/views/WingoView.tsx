import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useBalance, useAdminConfig } from '../lib/hooks';
import { store } from '../lib/store';
import { bus, Topics } from '../lib/bus';
import { playTick, playWin, playLose, playClick } from '../lib/lotteryAudio';
import { cms } from '../lib/cms';
import { auth } from '../lib/auth';
import { wingoLoop, EngineTopics, type WingoState } from '../lib/persistentGameEngine';
import { bus as engineBus } from '../lib/bus';

type Bet = {
  type: string;
  amount: number;
  multiplier: number;
  color: string;
};

type RecentBet = Bet & {
  result: number;
  win: boolean;
  wonAmount: number;
  ts: number;
};

export default function WingoView({ onBack }: { onBack?: () => void }) {
  const balance = useBalance();
  const initial = wingoLoop.getState();
  const [timeLeft, setTimeLeft] = useState<number>(initial.timeLeft);
  const periodRef = useRef(initial.roundId);
  const [history, setHistory] = useState<number[]>(() => {
    const h = wingoLoop.getHistory();
    return h.length ? h : [2, 5, 8, 1, 9, 0, 3, 4, 7, 6];
  });
  const [recentBets, setRecentBets] = useState<RecentBet[]>([]);
  const [showRecent, setShowRecent] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const [activeBet, setActiveBet] = useState<{ type: string; color: string } | null>(null);
  const [baseAmount, setBaseAmount] = useState(10);
  const [multiplier, setMultiplier] = useState(1);

  const pendingBetRef = useRef<Bet | null>(null);
  const [winState, setWinState] = useState<any | null>(null);

  const limits = store.getGameLimits('wingo');
  const adminCfg = useAdminConfig();
  const quickStakes = adminCfg.gameHandlers['wingo']?.quickStakes?.length ? adminCfg.gameHandlers['wingo'].quickStakes : [1, 10, 100, 1000];

  const calculateWin = useCallback((bet: Bet, result: number) => {
    if (bet.type === result.toString()) return 9;
    if (bet.type === 'Big' && result >= 5) return 2;
    if (bet.type === 'Small' && result <= 4) return 2;
    if (bet.type === 'Green') {
      if ([2, 4, 6, 8].includes(result)) return 2;
      if (result === 0) return 2;
    }
    if (bet.type === 'Red') {
      if ([1, 3, 7, 9].includes(result)) return 2;
      if (result === 5) return 2;
    }
    if (bet.type === 'Violet') {
      if (result === 0 || result === 5) return 4.5;
    }
    return 0;
  }, []);

  const settleBetWithResult = useCallback((result: number) => {
    setHistory(prev => [result, ...prev].slice(0, 50));
    if (pendingBetRef.current) {
      const bet = pendingBetRef.current;
      const ratio = calculateWin(bet, result);
      const totalBet = bet.amount * bet.multiplier;
      
      if (ratio > 0) {
        const wonAmount = totalBet * ratio;
        setWinState({ won: true, amount: wonAmount, result, betAmount: totalBet, multiplier: bet.multiplier, betType: bet.type });
        store.addBalance(wonAmount);
        playWin();
      } else {
        setWinState({ won: false, amount: totalBet, result, betAmount: totalBet, multiplier: bet.multiplier, betType: bet.type });
        playLose();
      }
      
      setRecentBets(prev => [{
        ...bet, result, win: ratio > 0,
        wonAmount: ratio > 0 ? totalBet * ratio : 0,
        ts: Date.now(),
      }, ...prev]);
      pendingBetRef.current = null;
    }
  }, [calculateWin]);

  useEffect(() => {
    const offState = engineBus.on(EngineTopics.WingoState, (payload) => {
      const p = payload as { state: WingoState };
      const prev = timeLeft;
      setTimeLeft(p.state.timeLeft);
      periodRef.current = p.state.roundId;
      if (p.state.timeLeft !== prev) {
        if (p.state.timeLeft <= 15 && p.state.timeLeft > 5) playTick(false);
        if (p.state.timeLeft <= 5 && p.state.timeLeft > 0) playTick(true);
      }
    });
    const offRound = engineBus.on(EngineTopics.WingoRoundEnd, (payload) => {
      const p = payload as { roundId: number; result: number };
      settleBetWithResult(p.result);
    });
    return () => { offState(); offRound(); };
  }, [settleBetWithResult, timeLeft]);

  const isLocked = timeLeft <= 5;

  useEffect(() => {
    if (isLocked) {
      setActiveBet(null);
    }
  }, [isLocked]);

  useEffect(() => {
    if (winState) {
      const t = window.setTimeout(() => setWinState(null), winState.won ? 3000 : 2500);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [winState]);

  const handleBetClick = (type: string, color: string) => {
    if (isLocked) return;
    playClick();
    setActiveBet({ type, color });
    setBaseAmount(quickStakes[0] ?? 10);
    setMultiplier(1);
  };

  const confirmBet = () => {
    if (!auth.getSession()) { bus.emit('auth:open_modal' as any, 'login'); return; }
    const total = baseAmount * multiplier;
    if (total < limits.min || total > limits.max) {
      cms.toast({ title: 'Bet out of range', body: `Win Go bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
      return;
    }
    if (store.deductBalance(total)) {
      playClick();
      pendingBetRef.current = { type: activeBet!.type, amount: baseAmount, multiplier, color: activeBet!.color };
      setActiveBet(null);
    } else {
      bus.emit(Topics.InsufficientBalance);
    }
  };

  const periodStr = `20260706${periodRef.current.toString().padStart(4, '0')}`;
  
  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <div className="min-h-[100dvh] bg-midnight-900 text-white font-sans flex flex-col relative overflow-hidden pb-safe">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-midnight-900/90 backdrop-blur border-b border-borderline-900 flex items-center justify-between px-4 py-1">
        <button onClick={() => { playClick(); onBack?.(); }} className="hidden p-2 -ml-2 text-slate-300 hover:text-white transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold">Win Go 1 Min</h1>
        <div className="hidden font-mono text-emeraldwin-400 font-bold">₹{balance.toFixed(2)}</div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 pb-12">
        {/* Period & Timer */}
        <div className="panel p-4 flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-xs mb-1">Period Number</div>
            <div className="font-mono font-bold text-lg">{periodStr}</div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-slate-400 text-xs mb-1">Count Down</div>
            <div className={`flex items-center gap-1 ${isLocked ? 'animate-ticker-blink' : ''}`}>
              <div className="lottery-timer-digit">{m[0]}</div>
              <div className="lottery-timer-digit">{m[1]}</div>
              <span className="text-xl font-bold text-slate-400 pb-1">:</span>
              <div className="lottery-timer-digit">{s[0]}</div>
              <div className="lottery-timer-digit">{s[1]}</div>
            </div>
          </div>
        </div>

        {/* History row */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 px-2 -mx-2 bg-midnight-900/40 rounded-xl">
          {history.slice(0, 10).map((res, i) => (
            <div key={i} className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shadow-md lotto-ball-${res} ring-2 ring-white/10`}>
              {res}
            </div>
          ))}
        </div>

        {/* Betting Area */}
        <div className="panel p-4 relative">
          {isLocked && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-midnight-900/50 rounded-[0.875rem] backdrop-blur-[2px]">
              <div className="bg-coral-500 text-white px-5 py-2 rounded-full font-bold shadow-[0_0_15px_rgba(255,77,112,0.5)] animate-pulse flex items-center gap-2">
                Locked
              </div>
            </div>
          )}

          {/* Min/Max labels */}
          <div className="flex gap-3 mb-3">
            <span className="text-[10px] text-slate-500">Min Bet: <span className="text-slate-300 font-semibold">₹{limits.min}</span></span>
            <span className="text-[10px] text-slate-500">Max Bet: <span className="text-slate-300 font-semibold">₹{limits.max.toLocaleString()}</span></span>
          </div>

          <div className={`space-y-4 transition-opacity ${isLocked ? 'opacity-40 pointer-events-none' : ''}`}>
            {/* Colors */}
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => handleBetClick('Green', 'bg-emeraldwin-500')} className="btn-lottery-green py-3 rounded-xl font-bold text-white text-base transition-transform active:scale-95">Green</button>
              <button onClick={() => handleBetClick('Violet', 'bg-neon-500')} className="btn-lottery-violet py-3 rounded-xl font-bold text-white text-base transition-transform active:scale-95">Violet</button>
              <button onClick={() => handleBetClick('Red', 'bg-coral-500')} className="btn-lottery-red py-3 rounded-xl font-bold text-white text-base transition-transform active:scale-95">Red</button>
            </div>

            {/* Numbers */}
            <div className="bg-slatepanel-800 p-3 rounded-xl">
              <div className="grid grid-cols-5 gap-1.5 sm:gap-3 justify-items-center mb-3">
                {[0, 1, 2, 3, 4].map(n => (
                  <button key={n} onClick={() => handleBetClick(n.toString(), `lotto-ball-${n}`)} className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-base sm:text-lg font-bold text-white shadow-lg lotto-ball-${n} transition-transform active:scale-95`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-3 justify-items-center">
                {[5, 6, 7, 8, 9].map(n => (
                  <button key={n} onClick={() => handleBetClick(n.toString(), `lotto-ball-${n}`)} className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-base sm:text-lg font-bold text-white shadow-lg lotto-ball-${n} transition-transform active:scale-95`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Big/Small */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleBetClick('Big', 'bg-amberx-400')} className="py-3 rounded-xl font-bold text-lg text-black bg-amberx-400 shadow-[0_4px_16px_rgba(255,204,77,0.3)] transition-transform active:scale-95">Big</button>
              <button onClick={() => handleBetClick('Small', 'bg-coral-400')} className="py-3 rounded-xl font-bold text-lg text-white bg-coral-400 shadow-[0_4px_16px_rgba(255,77,112,0.3)] transition-transform active:scale-95">Small</button>
            </div>
          </div>
        </div>

        {/* My Recent Bets */}
        <div className="panel overflow-hidden">
          <div
            className="flex items-center justify-between p-4 bg-slatepanel-800 cursor-pointer select-none"
            onClick={() => { playClick(); setShowRecent(!showRecent); }}
          >
            <h3 className="font-bold text-slate-200">My Bets</h3>
            {showRecent ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
          </div>
          {showRecent && (
            <div className="p-4 space-y-3 bg-slatepanel-900 border-t border-borderline-900">
              {recentBets.length === 0 ? (
                <div className="text-center text-slate-500 py-4 text-sm">No bets yet</div>
              ) : (
                recentBets.map((b, i) => (
                  <div key={i} className="flex items-center justify-between bg-slatepanel-800 p-3 rounded-lg text-sm border border-borderline-800">
                    <div>
                      <div className="font-bold text-slate-200">Win Go: {b.type}</div>
                      <div className="text-slate-500 text-xs mt-0.5">₹{b.amount} × {b.multiplier} · Result: {b.result}</div>
                    </div>
                    <div className="text-right">
                      {b.win ? (
                        <div className="text-emeraldwin-400 font-bold">+₹{b.wonAmount.toFixed(2)}</div>
                      ) : (
                        <div className="text-coral-400 font-bold">-₹{(b.amount * b.multiplier).toFixed(2)}</div>
                      )}
                      <div className="text-slate-600 text-[10px]">{new Date(b.ts).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Game History */}
        <div className="panel overflow-hidden">
          <div
            className="flex items-center justify-between p-4 bg-slatepanel-800 cursor-pointer select-none"
            onClick={() => { playClick(); setShowHistory(!showHistory); }}
          >
            <h3 className="font-bold text-slate-200">Game History</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">{history.length} rounds</span>
              {showHistory ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
            </div>
          </div>
          {showHistory && (
            <div className="p-4 bg-slatepanel-900 border-t border-borderline-900">
              {history.length === 0 ? (
                <div className="text-center text-slate-500 py-4 text-sm">No history yet</div>
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  {history.map((res, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md lotto-ball-${res} ring-1 ring-white/10`}>
                        {res}
                      </div>
                      <span className="text-[9px] text-slate-500">#{periodRef.current - i}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Betting Popup */}
      <AnimatePresence>
        {activeBet && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-900/60 backdrop-blur-sm"
            onClick={() => setActiveBet(null)}
          >
            <motion.div 
              initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-slatepanel-900 rounded-t-2xl border-t border-borderline-800 p-5 shadow-2xl pb-safe"
              onClick={(e: any) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  Win Go: <span className={`px-3 py-1 rounded-md text-sm text-white ${activeBet.color.includes('bg-') ? activeBet.color : activeBet.color}`}>{activeBet.type}</span>
                </h2>
                <button onClick={() => { playClick(); setActiveBet(null); }} className="p-2 text-slate-400 hover:text-white bg-slatepanel-800 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="text-slate-400 text-sm mb-2">Base Amount</div>
                  <div className="flex gap-2">
                    {quickStakes.map(amt => (
                      <button 
                        key={amt} 
                        onClick={() => { playClick(); setBaseAmount(amt); }}
                        className={`flex-1 py-2 rounded-lg font-bold border transition-colors ${baseAmount === amt ? 'bg-neon-500/20 border-neon-500 text-neon-400' : 'bg-slatepanel-800 border-borderline-800 text-slate-300'}`}
                      >
                        {amt >= 1000 ? `${amt / 1000}K` : amt}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <input 
                      type="number" 
                      value={baseAmount} 
                      onChange={e => setBaseAmount(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-full bg-slatepanel-800 border border-borderline-800 rounded-lg p-3 text-white font-mono focus:border-neon-500 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-sm mb-2">Multiplier</div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(m => (
                      <button 
                        key={m} 
                        onClick={() => { playClick(); setMultiplier(m); }}
                        className={`flex-1 py-2 rounded-lg font-bold border transition-colors ${multiplier === m ? 'bg-emeraldwin-500/20 border-emeraldwin-500 text-emeraldwin-400' : 'bg-slatepanel-800 border-borderline-800 text-slate-300'}`}
                      >
                        {m}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-slate-400">Total Bet</div>
                  <div className="text-2xl font-mono font-bold text-amberx-400">₹{(baseAmount * multiplier).toFixed(2)}</div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => { playClick(); setActiveBet(null); }} className="flex-1 py-3.5 rounded-xl font-bold bg-slatepanel-800 text-slate-300 border border-borderline-800 active:scale-95 transition-transform">
                    Cancel
                  </button>
                  <button onClick={confirmBet} className={`flex-1 py-3.5 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-transform ${activeBet.color.includes('bg-') ? activeBet.color : 'bg-neon-500'}`}>
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Winner Popup */}
      <AnimatePresence>
        {winState && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="lottery-winner-overlay"
            onClick={() => setWinState(null)}
          >
            <div className={`lottery-winner-card p-6 text-center ${winState.won ? 'bg-gradient-to-b from-[#1a4a1a] to-[#0d2d0d] border border-[#5CBA47]/30' : 'bg-gradient-to-b from-[#2a0a0a] to-[#0d0404] border border-[#FB4E4E]/30'}`} onClick={(e: any) => e.stopPropagation()}>
              <h2 className={`text-2xl font-black mb-2 ${winState.won ? 'text-[#FFC511]' : 'text-slate-300'}`}>
                {winState.won ? 'Congratulations!' : 'Better Luck Next Time'}
              </h2>
              <div className="text-slate-400 mb-6 font-medium">Result: {winState.result}</div>
              
              <div className={`text-5xl font-black mb-6 ${winState.won ? 'text-[#5CBA47] shadow-emerald-glow drop-shadow-[0_0_15px_rgba(92,186,71,0.5)]' : 'text-[#FB4E4E]'}`}>
                {winState.won ? '+' : '-'}₹{winState.amount.toFixed(2)}
              </div>
              
              <div className="text-slate-400 text-sm mb-6 bg-black/20 p-3 rounded-lg border border-white/5">
                Bet ₹{winState.betAmount} | {winState.betType} | Multiplier {winState.multiplier}x
              </div>
              
              <button 
                onClick={() => setWinState(null)} 
                className={`w-full py-3.5 rounded-xl font-bold text-lg text-white transition-transform active:scale-95 ${winState.won ? 'bg-[#5CBA47]' : 'bg-slate-600'}`}
              >
                {winState.won ? 'Collect' : 'Try Again'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
