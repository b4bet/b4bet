/**
 * TradingGameView — server-side settlement version.
 *
 * When a bet expires the outcome is settled by the process-bet Edge Function
 * (trading_settle). The server compares entry vs exit price, atomically
 * updates profiles.balance and inserts a bets row.
 * store.recordTradingBet() is called ONLY for the local UI history — it no
 * longer modifies the balance.
 *
 * Layout matches spec §6:
 *   Top bar:     Asset selector + Binary chip only.
 *   Control panel order: Amount → Active Bets toggle → Expiration → UP/DOWN → Payout.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Plus, Clock,
  ChevronDown, CheckCircle, XCircle, Info, X,
  BarChart2,
} from 'lucide-react';
import { store } from '../lib/store';
import { bus, Topics } from '../lib/bus';
import type { TradingBetRecord } from '../lib/store';
import { useBalance } from '../lib/hooks';
import { cms } from '../lib/cms';
import { auth } from '../lib/auth';
import { GameService } from '../lib/game-service';

// ─────────────────────────────────────────────────────────────
type AssetCategory = 'Crypto' | 'Forex' | 'Commodities' | 'Stocks';
type BetDirection  = 'UP' | 'DOWN';
type TimeOption    = 1 | 5 | 10 | 30;
type ChartTF       = '1m' | '5m' | '15m';

interface Asset {
  category: AssetCategory;
  name: string;
  symbol: string;
  basePrice: number;
  payout: number;
  volatility: number;
}

interface PricePoint { timestamp: number; price: number; }

interface ActiveBet {
  id: string;
  asset: Asset;
  entryPrice: number;
  currentPrice: number;
  betAmount: number;
  direction: BetDirection;
  payoutPercentage: number;
  expiryTimestamp: number;
  placedAt: number;
  isWinning: boolean;
  timeRemaining: number;
  durationMinutes: TimeOption;
}

interface ToastItem { id: string; message: string; type: 'win' | 'lose' | 'info'; }

// ─────────────────────────────────────────────────────────────
const ASSETS: Asset[] = [
  { category: 'Crypto',      name: 'Bitcoin',    symbol: 'BTC/USDT',   basePrice: 43000, payout: 85, volatility: 0.03  },
  { category: 'Crypto',      name: 'Ethereum',   symbol: 'ETH/USDT',   basePrice: 2600,  payout: 82, volatility: 0.035 },
  { category: 'Crypto',      name: 'Solana',     symbol: 'SOL/USDT',   basePrice: 100,   payout: 88, volatility: 0.05  },
  { category: 'Crypto',      name: 'BNB',        symbol: 'BNB/USDT',   basePrice: 320,   payout: 80, volatility: 0.03  },
  { category: 'Forex',       name: 'EUR/USD',    symbol: 'EUR/USD',    basePrice: 1.08,  payout: 75, volatility: 0.005 },
  { category: 'Forex',       name: 'GBP/USD',    symbol: 'GBP/USD',    basePrice: 1.27,  payout: 75, volatility: 0.006 },
  { category: 'Forex',       name: 'USD/JPY',    symbol: 'USD/JPY',    basePrice: 149.5, payout: 75, volatility: 0.004 },
  { category: 'Forex',       name: 'USD/CHF',    symbol: 'USD/CHF',    basePrice: 0.9,   payout: 75, volatility: 0.005 },
  { category: 'Commodities', name: 'Gold',       symbol: 'XAU/USD',    basePrice: 2000,  payout: 80, volatility: 0.015 },
  { category: 'Commodities', name: 'Silver',     symbol: 'SILVER/USD', basePrice: 28,    payout: 75, volatility: 0.02  },
  { category: 'Commodities', name: 'Crude Oil',  symbol: 'OIL/USD',    basePrice: 80,    payout: 80, volatility: 0.025 },
  { category: 'Stocks',      name: 'Apple',      symbol: 'AAPL',       basePrice: 175,   payout: 70, volatility: 0.02  },
  { category: 'Stocks',      name: 'Tesla',      symbol: 'TSLA',       basePrice: 190,   payout: 85, volatility: 0.04  },
  { category: 'Stocks',      name: 'NASDAQ 100', symbol: 'NAS100',     basePrice: 18000, payout: 90, volatility: 0.03  },
];
const CATEGORIES = ['Crypto', 'Forex', 'Commodities', 'Stocks'] as const;
const MAX_HISTORY = 1000;
const TIME_OPTIONS: TimeOption[] = [1, 5, 10, 30];
const PRESET_AMOUNTS = [100, 500, 1000, 5000];

function fmtPrice(price: number, asset: Asset): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (price >= 1)    return price.toFixed(asset.volatility < 0.01 ? 4 : 2);
  return price.toFixed(6);
}
function fmtPriceTick(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)    return price.toFixed(4);
  return price.toFixed(6);
}
function catColor(cat: AssetCategory): string {
  return { Crypto: 'text-orange-400', Forex: 'text-blue-400', Commodities: 'text-yellow-400', Stocks: 'text-green-400' }[cat];
}

// ─────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────
function ToastItem({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setTimeout(() => setVisible(true), 10);
    const t = setTimeout(() => { setVisible(false); setTimeout(() => onRemove(toast.id), 300); }, 4000);
    return () => clearTimeout(t);
  }, [toast.id, onRemove]);

  const icon = toast.type === 'win'  ? <CheckCircle className="w-5 h-5 text-emerald-400" /> :
               toast.type === 'lose' ? <XCircle className="w-5 h-5 text-red-400" /> :
               <Info className="w-5 h-5 text-blue-400" />;
  const bg   = toast.type === 'win'  ? 'from-emerald-900/90 to-emerald-800/90 border-emerald-500/30' :
               toast.type === 'lose' ? 'from-red-900/90 to-red-800/90 border-red-500/30' :
               'from-blue-900/90 to-blue-800/90 border-blue-500/30';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm transition-all duration-300 shadow-2xl bg-gradient-to-r ${bg} ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
      {icon}
      <p className="text-white font-medium text-sm flex-1">{toast.message}</p>
      <button onClick={() => { setVisible(false); setTimeout(() => onRemove(toast.id), 300); }} className="text-white/60 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chart (Canvas-based — unchanged)
// ─────────────────────────────────────────────────────────────
function PriceChart({ priceHistory, currentPrice, selectedAsset, activeBets }: {
  priceHistory: PricePoint[]; currentPrice: number; selectedAsset: Asset; activeBets?: ActiveBet[];
}) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tf, setTf]  = useState<ChartTF>('1m');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const dragStartX      = useRef(0);
  const dragStartOffset = useRef(0);

  const visibleCount = tf === '1m' ? 60 : tf === '5m' ? 300 : 900;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const cont   = containerRef.current;
    if (!canvas || !cont || priceHistory.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = cont.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width  = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const start  = Math.max(0, priceHistory.length - visibleCount - scrollOffset);
    const end    = Math.max(0, priceHistory.length - scrollOffset);
    const points = priceHistory.slice(Math.max(0, start), Math.max(1, end));
    if (points.length < 2) return;

    const prices   = points.map((p) => p.price);
    const minP     = Math.min(...prices);
    const maxP     = Math.max(...prices);
    const range    = maxP - minP || 0.01;
    const pad      = range * 0.12;
    const adjMin   = minP - pad;
    const adjMax   = maxP + pad;
    const adjRange = adjMax - adjMin;

    const CP = { top: 30, right: 70, bottom: 35, left: 10 };
    const CW = W - CP.left - CP.right;
    const CH = H - CP.top - CP.bottom;

    ctx.strokeStyle = '#1c2333'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = CP.top + (CH / 5) * i;
      ctx.beginPath(); ctx.moveTo(CP.left, y); ctx.lineTo(W - CP.right, y); ctx.stroke();
      const lbl = (adjMax - (adjRange / 5) * i).toFixed(2);
      ctx.fillStyle = '#4b5563'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
      ctx.fillText(lbl, W - 4, y + 4);
    }

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = CP.left + (i / (points.length - 1)) * CW;
      const y = CP.top + CH - ((p.price - adjMin) / adjRange) * CH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    const last  = points[points.length - 1];
    const first = points[0];
    const rising = last.price >= first.price;
    ctx.strokeStyle = rising ? '#22c55e' : '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke();

    const lastX = CP.left + CW;
    const lastY = CP.top + CH - ((last.price - adjMin) / adjRange) * CH;
    const grad  = ctx.createLinearGradient(0, CP.top, 0, CP.top + CH);
    grad.addColorStop(0, rising ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = CP.left + (i / (points.length - 1)) * CW;
      const y = CP.top + CH - ((p.price - adjMin) / adjRange) * CH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(lastX, CP.top + CH); ctx.lineTo(CP.left, CP.top + CH); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CP.left, lastY); ctx.lineTo(W - CP.right, lastY); ctx.stroke();
    ctx.setLineDash([]);

    if (activeBets && activeBets.length > 0) {
      const now = Date.now();
      activeBets.forEach((bet) => {
        let entryIdx = points.findIndex((p) => p.timestamp >= bet.placedAt);
        if (entryIdx < 0) entryIdx = points.length - 1;
        const entryX = CP.left + (entryIdx / (points.length - 1)) * CW;
        const entryY = CP.top + CH - ((bet.entryPrice - adjMin) / adjRange) * CH;
        const secs   = Math.max(0, Math.floor((bet.expiryTimestamp - now) / 1000));
        const mins   = Math.floor(secs / 60);
        const remSecs = secs % 60;
        const timerText = `${mins}:${remSecs.toString().padStart(2, '0')}`;

        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = bet.direction === 'UP' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(entryX, CP.top); ctx.lineTo(entryX, H - CP.bottom); ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(entryX, entryY, 4, 0, Math.PI * 2);
        ctx.fillStyle = bet.direction === 'UP' ? '#22c55e' : '#ef4444'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = bet.direction === 'UP' ? '#22c55e' : '#ef4444';
        ctx.fillText(timerText, entryX, CP.top - 6);
        ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(bet.direction, entryX, CP.top - 18);
      });
    }
  }, [priceHistory, scrollOffset, visibleCount, activeBets]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const onMouseDown  = (e: React.MouseEvent) => { setDragging(true); dragStartX.current = e.clientX; dragStartOffset.current = scrollOffset; };
  const onMouseMove  = (e: React.MouseEvent) => { if (!dragging) return; const delta = (e.clientX - dragStartX.current) / 2; setScrollOffset(Math.max(0, Math.min(priceHistory.length - visibleCount, Math.round(dragStartOffset.current - delta)))); };
  const onMouseUp    = () => setDragging(false);
  const onTouchStart = (e: React.TouchEvent) => { dragStartX.current = e.touches[0].clientX; dragStartOffset.current = scrollOffset; };
  const onTouchMove  = (e: React.TouchEvent) => { const delta = (e.touches[0].clientX - dragStartX.current) / 2; setScrollOffset(Math.max(0, Math.min(priceHistory.length - visibleCount, Math.round(dragStartOffset.current - delta)))); };

  return (
    <div className="relative w-full h-full bg-[#0d1117]">
      <div className="absolute top-2 left-2 flex gap-1 z-20">
        {(['1m', '5m', '15m'] as ChartTF[]).map((t) => (
          <button key={t} onClick={() => setTf(t)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${tf === t ? 'bg-blue-500 text-white' : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700/80'}`}>{t}</button>
        ))}
      </div>
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
      <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-gray-800/70 px-2 py-1 rounded text-xs z-10">
        <span className="text-gray-400">Vol:</span>
        <span className="text-yellow-400">{(selectedAsset.volatility * 100).toFixed(1)}%</span>
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-gray-800/70 px-2 py-1 rounded text-xs z-10 tabular">
        <Clock className="w-3 h-3 text-gray-400" />
        <span className="text-gray-200 font-semibold">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {scrollOffset > 0 && (
        <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-gray-800/70 px-2 py-1 rounded text-xs z-10">
          <span className="text-gray-400">Historical</span>
          <button onClick={() => setScrollOffset(0)} className="text-blue-400 hover:text-blue-300 font-semibold">Live</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Active bets panel
// ─────────────────────────────────────────────────────────────
function ActiveBetsList({ bets }: { bets: ActiveBet[] }) {
  const winning = bets.filter((b) => b.isWinning).length;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl mt-1 max-h-56 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 sticky top-0 bg-gray-900">
        <span className="font-bold text-white text-xs">Active Trades ({bets.length})</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-400">{winning} winning</span>
          <span className="text-xs text-red-400">{bets.length - winning} losing</span>
        </div>
      </div>
      {bets.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-6">No active trades</p>
      ) : (
        <div className="p-2 space-y-2">
          {bets.map((bet) => (
            <div key={bet.id} className={`rounded-xl border p-2.5 ${bet.isWinning ? 'border-emerald-500/30 bg-emerald-900/10' : 'border-red-500/30 bg-red-900/10'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {bet.direction === 'UP'
                    ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                    : <TrendingDown className="w-4 h-4 text-red-400" />}
                  <span className="font-semibold text-white text-xs">{bet.asset.symbol}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>{bet.timeRemaining}s</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><p className="text-gray-400 mb-0.5">Entry</p><p className="text-white font-semibold">{fmtPriceTick(bet.entryPrice)}</p></div>
                <div><p className="text-gray-400 mb-0.5">Current</p><p className={`font-semibold ${bet.isWinning ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPriceTick(bet.currentPrice)}</p></div>
                <div><p className="text-gray-400 mb-0.5">Amount</p><p className="text-white font-semibold">{Math.floor(bet.betAmount)}</p></div>
              </div>
              <div className={`mt-1.5 flex items-center justify-center gap-1.5 py-1 rounded-lg text-xs ${bet.isWinning ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {bet.isWinning
                  ? <><CheckCircle className="w-3.5 h-3.5" /><span>Winning +{Math.floor(bet.betAmount + bet.betAmount * bet.payoutPercentage / 100)}</span></>
                  : <><XCircle className="w-3.5 h-3.5" /><span>Losing -{Math.floor(bet.betAmount)}</span></>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────
export default function TradingGameView({ onBack: _onBack }: { onBack?: () => void }) {
  const balance = useBalance();

  const [selectedAsset, setSelectedAsset] = useState<Asset>(ASSETS[0]);
  const [currentPrice,  setCurrentPrice]  = useState(ASSETS[0].basePrice);
  const [priceHistory,  setPriceHistory]  = useState<PricePoint[]>([]);
  const [activeBets,    setActiveBets]    = useState<ActiveBet[]>([]);
  const [toasts,        setToasts]        = useState<ToastItem[]>([]);
  const [betsPanelOpen, setBetsPanelOpen] = useState(false);

  const [selectedTime,   setSelectedTime]   = useState<TimeOption>(1);
  const [betAmountStr,   setBetAmountStr]   = useState('100');
  const betAmount = parseFloat(betAmountStr) || 0;

  const [assetDropdown,  setAssetDropdown]  = useState(false);

  const activeBetsRef   = useRef<ActiveBet[]>(activeBets);
  const currentPriceRef = useRef(currentPrice);
  const assetRef        = useRef(selectedAsset);
  const betsPanelRef    = useRef<HTMLDivElement>(null);

  useEffect(() => { activeBetsRef.current = activeBets; }, [activeBets]);
  useEffect(() => { currentPriceRef.current = currentPrice; }, [currentPrice]);
  useEffect(() => { assetRef.current = selectedAsset; }, [selectedAsset]);

  useEffect(() => {
    if (!betsPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (betsPanelRef.current && !betsPanelRef.current.contains(e.target as Node)) {
        setBetsPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [betsPanelOpen]);

  // ── Init price history ──
  useEffect(() => {
    const now = Date.now();
    const history: PricePoint[] = [];
    for (let i = MAX_HISTORY - 1; i >= 0; i--) {
      history.push({
        timestamp: now - i * 1000,
        price: selectedAsset.basePrice + (Math.random() - 0.5) * selectedAsset.basePrice * selectedAsset.volatility * 0.5,
      });
    }
    setPriceHistory(history);
    setCurrentPrice(history[history.length - 1].price);
  }, [selectedAsset]);

  // ── Price tick ──
  const updatePrice = useCallback(() => {
    const asset = assetRef.current;
    const last  = currentPriceRef.current;
    const change = (Math.random() - 0.5) * 2 * asset.volatility * asset.basePrice * 0.01;
    const minP = asset.basePrice * 0.8;
    const maxP = asset.basePrice * 1.2;
    let next = Math.max(0.000001, Math.min(maxP, last + change));
    if (next < minP) next = minP + Math.abs(change) * 0.5;
    if (next > maxP) next = maxP - Math.abs(change) * 0.5;
    setCurrentPrice(next);
    setPriceHistory((prev) => {
      const updated = [...prev, { timestamp: Date.now(), price: next }];
      return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
    });
  }, []);

  const addToast    = useCallback((message: string, type: ToastItem['type']) => {
    const t: ToastItem = { id: Math.random().toString(36).slice(2), message, type };
    setToasts((prev) => [...prev, t]);
  }, []);
  const removeToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // ── Resolve bets (server-side settlement) ──
  const resolveBets = useCallback(() => {
    const now = Date.now();
    const cp  = currentPriceRef.current;
    setActiveBets((prev) => {
      const remaining: ActiveBet[] = [];
      const updated = prev.map((bet) => {
        const tr = Math.max(0, Math.floor((bet.expiryTimestamp - now) / 1000));
        const isWinning =
          (bet.direction === 'UP'   && cp > bet.entryPrice) ||
          (bet.direction === 'DOWN' && cp < bet.entryPrice);
        return { ...bet, currentPrice: cp, timeRemaining: tr, isWinning };
      });
      updated.forEach((bet) => {
        if (bet.timeRemaining <= 0) {
          // Settlement is fully server-side
          const session = auth.getSession();
          if (session) {
            void GameService.tradingSettle(
              session.userId,
              bet.asset.symbol,
              bet.direction,
              bet.betAmount,
              bet.entryPrice,
              cp,
              bet.payoutPercentage,
            ).then((res) => {
              // Sync balance from server
              store.setBalance(res.balance_after);
              if (res.won) {
                addToast(`WIN +${Math.floor(res.profit)} on ${bet.asset.symbol}`, 'win');
              } else {
                addToast(`LOSS -${Math.floor(bet.betAmount)} on ${bet.asset.symbol}`, 'lose');
              }
              // Local history only — no balance mutation
              store.recordTradingBet({
                symbol: bet.asset.symbol,
                direction: bet.direction,
                stake: bet.betAmount,
                duration: bet.durationMinutes,
                entryPrice: bet.entryPrice,
                exitPrice: cp,
                payout: bet.payoutPercentage,
                win: res.won ? res.payout : 0,
                won: res.won,
              } as Omit<TradingBetRecord, 'id' | 'ts'>);
            }).catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : 'Server error';
              addToast(`Settle failed: ${msg}`, 'info');
            });
          }
          // Don't push to remaining — bet is expired
        } else {
          remaining.push(bet);
        }
      });
      return remaining;
    });
  }, [addToast]);

  useEffect(() => {
    const id = setInterval(() => { updatePrice(); resolveBets(); }, 1000);
    return () => clearInterval(id);
  }, [updatePrice, resolveBets]);

  const limits = store.getGameLimits('trading');

  const handlePlaceBet = useCallback((direction: BetDirection) => {
    const session = auth.getSession();
    if (!session) {
      bus.emit('auth:open_modal' as Parameters<typeof bus.emit>[0], 'login');
      return;
    }
    const amt = parseFloat(betAmountStr) || 0;
    if (amt < limits.min || amt > limits.max) {
      cms.toast({ title: 'Bet out of range', body: `Trading bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
      return;
    }
    if (amt <= 0 || amt > balance) {
      bus.emit(Topics.InsufficientBalance);
      addToast('Invalid bet amount', 'info');
      return;
    }
    // Deduct balance locally for optimistic display; server reconciles on settle
    const ok = store.debit(amt);
    if (!ok) { bus.emit(Topics.InsufficientBalance); addToast('Insufficient balance', 'info'); return; }

    const newBet: ActiveBet = {
      id: Math.random().toString(36).slice(2),
      asset: assetRef.current,
      entryPrice: currentPriceRef.current,
      currentPrice: currentPriceRef.current,
      betAmount: amt,
      direction,
      payoutPercentage: assetRef.current.payout,
      expiryTimestamp: Date.now() + selectedTime * 60 * 1000,
      placedAt: Date.now(),
      isWinning: false,
      timeRemaining: selectedTime * 60,
      durationMinutes: selectedTime,
    };
    setActiveBets((prev) => [...prev, newBet]);
    addToast(`${direction} on ${assetRef.current.symbol} ×${selectedTime}m`, 'info');
  }, [balance, betAmountStr, selectedTime, addToast, limits]);

  const handleAssetChange = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssetDropdown(false);
    setActiveBets([]);
  };

  const adjustAmount = (delta: number) => {
    const cur = parseFloat(betAmountStr) || 0;
    setBetAmountStr(String(Math.max(1, Math.min(Math.floor(balance), cur + delta))));
  };

  const potentialWin = betAmount + (betAmount * selectedAsset.payout) / 100;
  const canBet       = betAmount > 0 && betAmount <= balance;

  return (
    <div className="flex flex-col animate-fade-in h-[calc(100vh-130px)]">
      {/* ── Top bar: asset selector only ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-t-2xl px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <div className="relative flex-1">
          <button
            onClick={() => setAssetDropdown(!assetDropdown)}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 px-2.5 py-1.5 rounded-md border border-gray-700 transition-colors w-full"
          >
            <TrendingUp className={`w-3.5 h-3.5 ${catColor(selectedAsset.category)}`} />
            <div className="text-left flex-1">
              <p className="text-[9px] text-gray-400 leading-tight">{selectedAsset.symbol}</p>
              <p className="text-xs font-semibold text-white leading-tight">{fmtPriceTick(currentPrice)}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${assetDropdown ? 'rotate-180' : ''}`} />
          </button>
          {assetDropdown && (
            <div className="absolute left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto">
              {CATEGORIES.map((cat) => (
                <div key={cat} className="border-b border-gray-700 last:border-b-0">
                  <div className={`px-3 py-1.5 text-xs font-semibold ${catColor(cat)} bg-gray-900 sticky top-0`}>{cat}</div>
                  {ASSETS.filter((a) => a.category === cat).map((a) => (
                    <button
                      key={a.symbol}
                      onClick={() => handleAssetChange(a)}
                      className={`w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700 transition-colors text-left ${selectedAsset.symbol === a.symbol ? 'bg-gray-700/60' : ''}`}
                    >
                      <div>
                        <p className="text-xs font-semibold text-white">{a.symbol}</p>
                        <p className="text-[10px] text-gray-400">{a.name}</p>
                      </div>
                      <span className={`text-[10px] font-bold ${catColor(a.category)}`}>{a.payout}%</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="flex-1 min-h-0 border-x border-gray-800 relative overflow-hidden">
        <PriceChart priceHistory={priceHistory} currentPrice={currentPrice} selectedAsset={selectedAsset} activeBets={activeBets} />
      </div>

      {/* ── Control panel ── */}
      <div className="bg-gray-900 border border-t-0 border-gray-800 rounded-b-2xl px-3 py-2.5 flex-shrink-0 space-y-2.5">

        {/* Amount FIRST */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Amount</span>
            <div className="flex gap-2 text-[10px] text-gray-500">
              <span>Min: {store.currency}{limits.min}</span>
              <span>Max: {Math.floor(balance).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => adjustAmount(-50)} disabled={betAmount <= 1} className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-all active:scale-95">
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={betAmountStr}
              onChange={(e) => setBetAmountStr(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg py-2 px-3 text-sm font-bold text-white text-center focus:outline-none focus:border-blue-500"
            />
            <button onClick={() => adjustAmount(50)} disabled={betAmount >= balance} className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-all active:scale-95">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {PRESET_AMOUNTS.map((a) => (
              <button key={a} onClick={() => setBetAmountStr(String(Math.min(a, Math.floor(balance))))} className="flex-1 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-[10px] font-semibold transition-colors">
                {a.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Active Bets toggle */}
        <div ref={betsPanelRef}>
          <button
            onClick={() => setBetsPanelOpen(!betsPanelOpen)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-xs font-bold ${activeBets.length > 0 ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" />
              <span>Active Trades</span>
              {activeBets.length > 0 && (
                <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeBets.length}</span>
              )}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${betsPanelOpen ? 'rotate-180' : ''}`} />
          </button>
          {betsPanelOpen && <ActiveBetsList bets={activeBets} />}
        </div>

        {/* Expiration */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Expiration</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {TIME_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTime(t)}
                className={`py-1.5 rounded-md text-xs font-semibold transition-all ${selectedTime === t ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 active:scale-95'}`}
              >
                {t}m
              </button>
            ))}
          </div>
        </div>

        {/* UP/DOWN buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handlePlaceBet('UP')}
            disabled={!canBet}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 text-white font-black text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all hover:brightness-110"
          >
            <TrendingUp className="w-5 h-5" />
            <span className="hidden sm:inline">CALL</span>
            <span className="sm:hidden">UP</span>
          </button>
          <button
            onClick={() => handlePlaceBet('DOWN')}
            disabled={!canBet}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-500 text-white font-black text-sm shadow-lg shadow-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all hover:brightness-110"
          >
            <TrendingDown className="w-5 h-5" />
            <span className="hidden sm:inline">PUT</span>
            <span className="sm:hidden">DOWN</span>
          </button>
        </div>

        {/* Payout preview */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-gray-400">Potential win</span>
          <span className="text-[10px] font-bold text-emerald-400">+{Math.floor(potentialWin).toLocaleString()}</span>
        </div>
      </div>

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-80 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </div>
  );
}
