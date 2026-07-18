import { useMemo, useState } from 'react';
import { minesEngine } from '../lib/minesEngine';
import { useBus, useMinesMyHistory } from '../lib/hooks';

import { Topics } from '../lib/bus';
import type { MinesState } from '../lib/minesEngine';
import { store } from '../lib/store';
import { cms } from '../lib/cms';
import { Bomb, Gem, Flag, Play, HandCoins } from 'lucide-react';

function Cell({ index, state, onReveal }: { index: number; state: MinesState; onReveal: (i: number) => void }) {
  const revealed = state.revealed[index];
  const cell = state.grid[index];
  const isMine = cell === 'mine';
  const isGem = cell === 'gem';

  return (
    <button
      onClick={() => onReveal(index)}
      // Disable when: already revealed, no active round, or a server call is in-flight
      disabled={revealed || !state.active || state.loading}
      className={`relative aspect-square rounded-xl border transition-all duration-200 ${
        revealed
          ? isMine
            ? 'bg-coral-500/20 border-coral-500/60'
            : 'bg-emeraldwin-500/15 border-emeraldwin-500/50'
          : 'bg-slatepanel-800 border-borderline-900 hover:border-neon-400/60 hover:bg-slatepanel-700 active:scale-95'
      } ${!revealed && state.active && !state.loading ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {revealed && isGem && (
        <div className="absolute inset-0 grid place-items-center animate-gem-pop">
          <Gem className="w-6 h-6 sm:w-7 sm:h-7 text-emeraldwin-400 drop-shadow-[0_0_8px_rgba(0,255,136,0.5)]" />
        </div>
      )}
      {revealed && isMine && (
        <div className="absolute inset-0 grid place-items-center animate-mine-blast">
          <Bomb className="w-6 h-6 sm:w-7 sm:h-7 text-coral-500 drop-shadow-[0_0_8px_rgba(255,51,102,0.5)]" />
        </div>
      )}
      {!revealed && state.active && !state.loading && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="w-2 h-2 rounded-full bg-slate-600 group-hover:bg-neon-400" />
        </div>
      )}
      {/* Spinner shown on the clicked tile while server call is pending */}
      {!revealed && state.loading && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="w-3 h-3 rounded-full border-2 border-neon-400/30 border-t-neon-400 animate-spin" />
        </div>
      )}
    </button>
  );
}

export default function MinesView() {
  const state = useBus<MinesState>(Topics.MinesState, minesEngine.getState());
  const [stake, setStake] = useState('100');
  const [mines, setMines] = useState(3);

  const start = () => {
    const amt = parseFloat(stake) || 100;
    const { min, max } = store.getGameLimits('mines');
    if (amt < min || amt > max) {
      cms.toast({ title: 'Bet out of range', body: `Stake must be between ${store.currency}${min} and ${store.currency}${max}`, kind: 'alert' });
      return;
    }
    if (amt > store.balance) {
      cms.toast({ title: 'Insufficient Balance', body: `You need ${store.currency}${amt.toFixed(2)} to start this round.`, kind: 'alert' });
      return;
    }
    minesEngine.setStake(amt);
    minesEngine.setMineCount(mines);
    // start() is now async (server call) — fire and handle result
    void minesEngine.start().then((res) => {
      if (!res.ok) {
        const insufficient = (res.reason || '').toLowerCase().includes('insufficient');
        if (insufficient) cms.toast({ title: 'Insufficient Balance', body: res.reason || '', kind: 'alert' });
        else cms.toast({ title: 'Could not start round', body: res.reason || 'Server error', kind: 'alert' });
      }
    });
  };

  const reveal = (i: number) => {
    void minesEngine.reveal(i).then((res) => {
      if (res && !res.ok && res.reason) {
        cms.toast({ title: 'Reveal failed', body: res.reason, kind: 'alert' });
      }
    });
  };

  const cashout = () => {
    void minesEngine.cashOut().then((res) => {
      if (!res.ok) cms.toast({ title: 'Cashout failed', body: res.reason || 'Server error', kind: 'alert' });
    });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-coral-500/20 border border-coral-500/40 grid place-items-center">
          <Bomb className="w-5 h-5 text-coral-400" />
        </div>
        <div>
          <h1 className="font-display font-extrabold text-xl text-white leading-none">Mines</h1>
          <p className="text-xs text-slate-500">5×5 grid · {mines} mines hidden</p>
        </div>
      </div>

      {/* Grid */}
      <div className="panel p-3 sm:p-4">
        <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
          {Array.from({ length: 25 }, (_, i) => (
            <Cell key={i} index={i} state={state} onReveal={reveal} />
          ))}
        </div>
      </div>

      {/* Controls / bet section */}
      <div className="panel p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Stake</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">{store.currency}</span>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                disabled={state.active || state.loading}
                min={1}
                className="input text-center tabular"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Mines</label>
            <div className="relative mt-1">
              <Flag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="number"
                value={mines || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') setMines(0);
                  else {
                    const num = parseInt(val);
                    if (!isNaN(num)) setMines(Math.max(1, Math.min(24, num)));
                  }
                }}
                onBlur={() => {
                  if (mines === 0 || !mines) setMines(1);
                }}
                disabled={state.active || state.loading}
                min={1}
                max={24}
                placeholder="1"
                className="input text-center tabular"
              />
            </div>
          </div>
        </div>

        {/* Multiplier display */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Current</p>
            <p className="tabular font-display font-extrabold text-2xl text-emeraldwin-400">{state.currentMultiplier.toFixed(2)}x</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Next Gem</p>
            <p className="tabular font-bold text-lg text-neon-300">{state.nextMultiplier.toFixed(2)}x</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Gems</p>
            <p className="tabular font-bold text-lg text-white">{state.gemsFound}</p>
          </div>
        </div>

        {!state.active && !state.loading ? (
          <button onClick={start} className="btn-primary w-full py-3">
            <Play className="w-4 h-4" /> Start Round
          </button>
        ) : state.loading && !state.active ? (
          // Loading state while server creates the session
          <button disabled className="btn-primary w-full py-3 opacity-60">
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Starting…
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={cashout} disabled={state.gemsFound === 0 || state.busted || state.cashedOut || state.loading} className="btn-emerald py-3">
              <HandCoins className="w-4 h-4" />
              Cash Out {store.currency}{state.gemsFound > 0 ? (state.stake * state.currentMultiplier).toFixed(2) : '0.00'}
            </button>
            <button 
              disabled={state.busted || state.cashedOut}
              className={`py-3 justify-center text-sm font-semibold rounded-xl border transition-colors ${
                state.busted 
                  ? 'btn-ghost text-slate-400' 
                  : state.cashedOut 
                  ? 'btn-ghost text-slate-400'
                  : 'bg-neon-500/15 border-neon-500/40 text-neon-300 hover:bg-neon-500/25 hover:border-neon-500/60'
              }`}
            >
              {state.busted ? 'Round lost' : state.cashedOut ? 'Cashed out' : 'Pick a tile'}
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-600 text-center px-4">
        Reveal gems to grow your multiplier. Hit a mine and you lose your stake. Cash out anytime to lock in winnings.
      </p>

      <MinesStatsTabs />
    </div>
  );
}

type MinesTab = 'mine' | 'top';
type Range = '1d' | '1w' | '1m' | '1y';
const RANGE_MS: Record<Range, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

function MinesStatsTabs() {
  const myHistory = useMinesMyHistory();
  const [tab, setTab] = useState<MinesTab>('mine');
  const [range, setRange] = useState<Range>('1d');

  const topUsers = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[range];
    const agg = new Map<string, number>();
    store.minesLeaderboard
      .filter((r) => r.ts >= cutoff)
      .forEach((r) => agg.set(r.user, (agg.get(r.user) || 0) + r.earnings));
    return Array.from(agg.entries())
      .map(([user, earnings]) => ({ user, earnings }))
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 10);
  }, [range]);

  return (
    <div className="panel p-0 overflow-hidden">
      <div className="flex border-b border-borderline-900">
        {([
          { k: 'mine', label: 'My History' },
          { k: 'top', label: 'Top Ranking' },
        ] as { k: MinesTab; label: string }[]).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${tab === t.k ? 'text-coral-300 border-b-2 border-coral-400 bg-coral-500/5' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3">
        {tab === 'mine' ? (
          myHistory.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-3">No rounds yet. Play to build your history.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-borderline-900">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 font-semibold pb-1">
                <span>Stake</span><span>Mines</span><span>Gems</span><span>x</span><span>Payout</span>
              </div>
              {myHistory.map((r) => {
                const won = !r.busted && r.win > 0;
                return (
                  <div key={r.id} className={`flex items-center justify-between py-1.5 text-xs ${won ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                    <span className="tabular">{store.currency}{r.stake.toFixed(2)}</span>
                    <span className="tabular">{r.mines}</span>
                    <span className="tabular">{r.gems}</span>
                    <span className="tabular">{r.multiplier.toFixed(2)}x</span>
                    <span className={`tabular font-bold ${won ? 'bg-emeraldwin-500/15 px-2 py-0.5 rounded-md' : ''}`}>
                      {store.currency}{r.win.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div>
            <div className="flex items-center gap-1 mb-2">
              {(['1d', '1w', '1m', '1y'] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider ${range === r ? 'bg-coral-500/15 text-coral-300 border border-coral-500/40' : 'bg-slatepanel-800 text-slate-400 border border-borderline-900'}`}
                >
                  {r === '1d' ? '1 Day' : r === '1w' ? '1 Week' : r === '1m' ? '1 Month' : '1 Year'}
                </button>
              ))}
            </div>
            <div className="divide-y divide-borderline-900">
              {topUsers.map((u, i) => (
                <div key={u.user} className="flex items-center justify-between py-2 text-xs">
                  <span className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-md grid place-items-center text-[10px] font-bold ${i === 0 ? 'bg-amberx-400 text-black' : i < 3 ? 'bg-coral-500/20 text-coral-300' : 'bg-slatepanel-800 text-slate-400'}`}>{i + 1}</span>
                    <span className="font-semibold text-slate-200">{u.user}</span>
                  </span>
                  <span className="tabular font-bold text-emeraldwin-400">{store.currency}{u.earnings.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
