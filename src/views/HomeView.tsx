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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Banner */}
      <div className="px-3 pt-3 flex-shrink-0">
        <SliderBanner onSlideClick={(i) => {
          if (i === 1) onNavigate('crash');
          else if (i === 2) onNavigate('mines');
          else onNavigate('deposit');
        }} />
      </div>

      {/* Games grid */}
      <div className="px-3 pt-3 flex-shrink-0">
        <GameGrid onPlay={onNavigate} />
      </div>

      {/* Spacer pushes strips to bottom */}
      <div className="flex-1" />

      {/* Live stats strip */}
      <div className="mx-3 flex-shrink-0 rounded-xl bg-slatepanel-900 border border-borderline-900 grid grid-cols-3">
        <div className="flex flex-col items-center py-2.5 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Online</span>
          <span className="text-sm font-bold text-emeraldwin-400">{stats.onlineUsers.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center py-2.5 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Top Win</span>
          <span className="text-sm font-bold text-neon-400">{stats.topWin.toFixed(1)}x</span>
        </div>
        <div className="flex flex-col items-center py-2.5 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Paid Out</span>
          <span className="text-sm font-bold text-violet-400">₹{(stats.paidOut / 100000).toFixed(1)}M</span>
        </div>
      </div>

      {/* Trust strip */}
      <div className="mx-3 mt-2 mb-3 flex-shrink-0 rounded-xl bg-slatepanel-900 border border-borderline-900 grid grid-cols-3">
        <div className="flex flex-col items-center py-2.5 gap-1">
          <ShieldCheck className="w-4 h-4 text-emeraldwin-400" />
          <span className="text-[10px] text-slate-400 font-medium">Provably Fair</span>
        </div>
        <div className="flex flex-col items-center py-2.5 gap-1">
          <Zap className="w-4 h-4 text-neon-400" />
          <span className="text-[10px] text-slate-400 font-medium">Instant Payout</span>
        </div>
        <div className="flex flex-col items-center py-2.5 gap-1">
          <TrendingUp className="w-4 h-4 text-violet-400" />
          <span className="text-[10px] text-slate-400 font-medium">Secure Wallet</span>
        </div>
      </div>
    </div>
  );
}
