import React from 'react';
import SliderBanner from '../components/SliderBanner';
import GameGrid from '../components/GameGrid';
import type { Route } from '../components/BottomNav';
import { supabaseGetStats } from '../lib/supabaseIntegration';

interface Props { onNavigate: (r: Route) => void; }

export default function HomeView({ onNavigate }: Props) {
  const [stats, setStats] = React.useState({ onlineUsers: 0, topWin: 0, paidOut: 0 });

  React.useEffect(() => {
    supabaseGetStats().then(s => setStats(s || { onlineUsers: 0, topWin: 0, paidOut: 0 }));
  }, []);

  return (
    <div className="flex flex-col px-3 pt-2 pb-2 gap-3">
      {/* Banner — rounded box, overflow hidden so image doesn't cut out */}
      <div className="rounded-xl overflow-hidden w-full">
        <SliderBanner onSlideClick={(i) => {
          if (i === 1) onNavigate('crash');
          else if (i === 2) onNavigate('mines');
          else onNavigate('deposit');
        }} />
      </div>

      {/* Game grid */}
      <GameGrid onNavigate={onNavigate} />
    </div>
  );
}
