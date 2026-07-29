import React from 'react';
import SliderBanner from '../components/SliderBanner';
import GameGrid from '../components/GameGrid';
import type { Route } from '../components/BottomNav';
import { ShieldCheck, Zap, TrendingUp } from 'lucide-react';
import { supabaseGetStats } from '../lib/supabaseIntegration';

interface Props { onNavigate: (r: Route) => void; }

export default function HomeView({ onNavigate }: Props) {
  const [stats, setStats] = React.useState({ onlineUsers: 0, topWin: 0, paidOut: 0 });

  React.useEffect(() => {
    supabaseGetStats().then(s => setStats(s || { onlineUsers: 0, topWin: 0, paidOut: 0 }));
  }, []);

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
          <span className="text-xs font-bold text-emeraldwin-400">{stats.onlineUsers.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center py-2 gap-0.5 border-x border-borderline-900">
          <span className="text-[10px] text-slate-500 font-medium">Top Win</span>
          <span className="text-xs font-bold text-neon-400">{stats.topWin.toFixed(1)}x</span>
        </div>
        <div className="flex flex-col items-center py-2 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Paid Out</span>
          <span className="text-xs font-bold text-violet-400">₹{(stats.paidOut / 100000).toFixed(1)}M</span>
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
