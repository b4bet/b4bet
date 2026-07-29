import React from 'react';
import SliderBanner from '../components/SliderBanner';
import GameGrid from '../components/GameGrid';
import type { Route } from '../components/BottomNav';
import { ShieldCheck, Zap, TrendingUp } from 'lucide-react';
import { supabaseGetSettings } from '../lib/supabaseIntegration';

interface Props { onNavigate: (r: Route) => void; }

interface HomeStats {
  onlineMin: number;
  onlineMax: number;
  topWin: number;
  paidOut: number;
}

const DEFAULT_STATS: HomeStats = { onlineMin: 120, onlineMax: 350, topWin: 144.5, paidOut: 8500000 };

async function loadHomeStats(): Promise<HomeStats> {
  try {
    const settings = await supabaseGetSettings();
    const row = settings.find((s) => s.key === 'home_stats');
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return { ...DEFAULT_STATS, ...parsed };
    }
  } catch { /* use defaults */ }
  return DEFAULT_STATS;
}

export default function HomeView({ onNavigate }: Props) {
  const [statsConfig, setStatsConfig] = React.useState<HomeStats>(DEFAULT_STATS);
  // online count fluctuates realistically
  const [onlineCount, setOnlineCount] = React.useState(DEFAULT_STATS.onlineMin);

  // Load from Supabase once
  React.useEffect(() => {
    loadHomeStats().then((cfg) => {
      setStatsConfig(cfg);
      // Start at midpoint
      const mid = Math.round((cfg.onlineMin + cfg.onlineMax) / 2);
      setOnlineCount(mid);
    });
  }, []);

  // Auto-fluctuate online count between min and max every 2-4 seconds
  React.useEffect(() => {
    const { onlineMin, onlineMax } = statsConfig;
    let current = onlineCount;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      // small random step ±(1..8% of range), biased toward center
      const range = Math.max(1, onlineMax - onlineMin);
      const step = Math.round((Math.random() - 0.48) * range * 0.06);
      current = Math.min(onlineMax, Math.max(onlineMin, current + step));
      setOnlineCount(current);
      const delay = 2000 + Math.random() * 2000;
      timeoutId = setTimeout(tick, delay);
    };

    timeoutId = setTimeout(tick, 2000 + Math.random() * 2000);
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsConfig.onlineMin, statsConfig.onlineMax]);

  return (
    <div
      className="flex flex-col px-3 pt-3 pb-2"
      style={{
        height: 'calc(100dvh - 62px - 60px)',
        overflow: 'hidden',
        maxHeight: 'calc(100dvh - 62px - 60px)',
      }}
    >
      {/* Banner */}
      <div className="flex-shrink-0">
        <SliderBanner onCta={(i) => {
          if (i === 1) onNavigate('crash');
          else if (i === 2) onNavigate('mines');
          else onNavigate('deposit');
        }} />
      </div>

      {/* Games grid */}
      <div className="pt-3 flex-shrink-0">
        <GameGrid onPlay={onNavigate} />
      </div>

      {/* Spacer pushes strips to bottom */}
      <div className="flex-1 min-h-[4px]" />

      {/* Live stats strip */}
      <div className="flex-shrink-0 rounded-xl bg-slatepanel-900 border border-borderline-900 grid grid-cols-3">
        <div className="flex flex-col items-center py-2 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Online</span>
          <span className="text-xs font-bold text-emeraldwin-400">{onlineCount.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center py-2 gap-0.5 border-x border-borderline-900">
          <span className="text-[10px] text-slate-500 font-medium">Top Win</span>
          <span className="text-xs font-bold text-neon-400">{statsConfig.topWin.toFixed(1)}x</span>
        </div>
        <div className="flex flex-col items-center py-2 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Paid Out</span>
          <span className="text-xs font-bold text-violet-400">₹{(statsConfig.paidOut / 100000).toFixed(1)}M</span>
        </div>
      </div>

      {/* Trust strip */}
      <div className="mt-1.5 flex-shrink-0 rounded-xl bg-slatepanel-900 border border-borderline-900 grid grid-cols-3">
        <div className="flex flex-col items-center py-1.5 gap-0.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emeraldwin-400" />
          <span className="text-[9px] text-slate-400 font-medium">Provably Fair</span>
        </div>
        <div className="flex flex-col items-center py-1.5 gap-0.5 border-x border-borderline-900">
          <Zap className="w-3.5 h-3.5 text-neon-400" />
          <span className="text-[9px] text-slate-400 font-medium">Instant Payout</span>
        </div>
        <div className="flex flex-col items-center py-1.5 gap-0.5">
          <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[9px] text-slate-400 font-medium">Secure Wallet</span>
        </div>
      </div>
    </div>
  );
}
