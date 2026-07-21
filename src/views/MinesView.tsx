/**
 * MinesView — server-side outcome version.
 *
 * ALL outcome decisions happen in the process-bet Edge Function:
 *   - Mine positions generated server-side, never sent to client until round ends
 *   - Balance deducted on mines_start, credited on mines_cashout
 *   - store.recordMinesRound() is called ONLY for local history display
 *     after receiving the server's verdict — it no longer decides anything.
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { store } from '../lib/store';
import { cms } from '../lib/cms';
import { auth } from '../lib/auth';
import { GameService } from '../lib/game-service';
import { bus, Topics } from '../lib/bus';
import { supabase } from '../integrations/supabase/client';
import { Bomb, Gem, Flag, Play, HandCoins, RefreshCw } from 'lucide-react';

// ── Local UI state (does NOT encode outcome) ─────────────────────────────────

interface ClientMinesState {
  active: boolean;
  sessionId: string | null;
  stake: number;
  mineCount: number;
  gemsFound: number;
  currentMultiplier: number;
  nextMultiplier: number;
  grid: ('hidden' | 'gem' | 'mine')[];
  revealed: boolean[];
  busted: boolean;
  cashedOut: boolean;
}

function initialState(mineCount: number, stake: number): ClientMinesState {
  return {
    active: false,
    sessionId: null,
    stake,
    mineCount,
    gemsFound: 0,
    currentMultiplier: 1,
    nextMultiplier: 1,
    grid: new Array(25).fill('hidden'),
    revealed: new Array(25).fill(false),
    busted: false,
    cashedOut: false,
  };
}

// ── Supabase mines history ────────────────────────────────────────────────────

interface SupabaseMinesBet {
  id: string;
  bet_amount: number;
  win_amount: number | null;
  multiplier: number | null;
  status: string;
  bet_details: { mines?: number; gems?: number } | null;
  created_at: string;
}

function useSupabaseMinesHistory(refreshTrigger: number) {
  const [rows, setRows] = useState<SupabaseMinesBet[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const session = auth.getSession();
    if (!session?.userId) {
      setRows([]);
      return;
    }
    setLoading(true);
    supabase
      .from('bets')
      .select('id, bet_amount, win_amount, multiplier, status, bet_details, created_at')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.warn('[mines] history fetch error:', error.message); }
        // Filter only mines bets — they have bet_details with mines/gems keys
        const mineBets = ((data ?? []) as SupabaseMinesBet[]).filter(
          (b) => b.bet_details && typeof b.bet_details === 'object' && 'mines' in b.bet_details
        );
        setRows(mineBets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  return { rows, loading };
}

// ── Cell ─────────────────────────────────────────────────────────────────────

function Cell({
  index,
  grid,
  revealed,
  active,
  onReveal,
}: {
  index: number;
  grid: ClientMinesState['grid'];
  revealed: boolean[];
  active: boolean;
  onReveal: (i: number) => void;
}) {
  const isRevealed = revealed[index];
  const cell = grid[index];
  const isMine = cell === 'mine';

  return (
    <button
      onClick={() => onReveal(index)}
      disabled={isRevealed || !active}
      className={`relative aspect-square rounded-xl border transition-all duration-200 ${
        isRevealed
          ? isMine
            ? 'bg-coral-500/20 border-coral-500/60'
            : 'bg-emeraldwin-500/15 border-emeraldwin-500/50'
          : 'bg-slatepanel-800 border-borderline-900 hover:border-neon-400/60 hover:bg-slatepanel-700 active:scale-95'
      } ${!isRevealed && active ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {isRevealed && cell === 'gem' && (
        <div className="absolute inset-0 grid place-items-center animate-gem-pop">
          <Gem className="w-6 h-6 sm:w-7 sm:h-7 text-emeraldwin-400 drop-shadow-[0_0_8px_rgba(0,255,136,0.5)]" />
        </div>
      )}
      {isRevealed && isMine && (
        <div className="absolute inset-0 grid place-items-center animate-mine-blast">
          <Bomb className="w-6 h-6 sm:w-7 sm:h-7 text-coral-500 drop-shadow-[0_0_8px_rgba(255,51,102,0.5)]" />
        </div>
      )}
      {!isRevealed && active && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="w-2 h-2 rounded-full bg-slate-600" />
        </div>
      )}
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function MinesView() {
  const [stakeStr, setStakeStr] = useState('100');
  const [minesInput, setMinesInput] = useState(3);
  const [loading, setLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [game, setGame] = useState<ClientMinesState>(() =>
    initialState(3, 100)
  );

  // ── Start round ──────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    const session = auth.getSession();
    if (!session) {
      bus.emit('auth:open_modal' as Parameters<typeof bus.emit>[0], 'login');
      return;
    }
    const amt = parseFloat(stakeStr) || 100;
    const { min, max } = store.getGameLimits('mines');
    if (amt < min || amt > max) {
      cms.toast({ title: 'Bet out of range', body: `Stake must be between ${store.currency}${min} and ${store.currency}${max}`, kind: 'alert' });
      return;
    }
    if (amt > store.balance) {
      cms.toast({ title: 'Insufficient Balance', body: `You need ${store.currency}${amt.toFixed(2)} to start.`, kind: 'alert' });
      return;
    }

    setLoading(true);
    try {
      const res = await GameService.minesStart(session.userId, minesInput, amt);
      store.setBalance(res.balance_after);
      setGame({
        active: true,
        sessionId: res.session_id,
        stake: amt,
        mineCount: minesInput,
        gemsFound: 0,
        currentMultiplier: 1,
        nextMultiplier: 1,
        grid: new Array(25).fill('hidden'),
        revealed: new Array(25).fill(false),
        busted: false,
        cashedOut: false,
      });
    } catch (err) {
      cms.toast({ title: 'Could not start', body: err instanceof Error ? err.message : 'Server error', kind: 'alert' });
    } finally {
      setLoading(false);
    }
  }, [stakeStr, minesInput]);

  // ── Reveal tile ──────────────────────────────────────────────────────────
  const reveal = useCallback(async (index: number) => {
    if (!game.active || game.revealed[index] || !game.sessionId) return;
    const session = auth.getSession();
    if (!session) return;

    setLoading(true);
    try {
      const res = await GameService.minesReveal(session.userId, game.sessionId, index);

      if (res.is_mine) {
        const newGrid = [...game.grid] as ClientMinesState['grid'];
        const newRevealed = [...game.revealed];
        newGrid[index] = 'mine';
        newRevealed[index] = true;
        if (res.mine_positions) {
          res.mine_positions.forEach((pos) => {
            newGrid[pos] = 'mine';
            newRevealed[pos] = true;
          });
        }
        setGame((g) => ({
          ...g,
          active: false,
          busted: true,
          grid: newGrid,
          revealed: newRevealed,
          gemsFound: res.gems_found,
        }));
        store.recordMinesRound({
          stake: game.stake,
          mines: game.mineCount,
          gems: res.gems_found,
          multiplier: res.current_multiplier,
          win: 0,
          busted: true,
        });
        // Refresh Supabase history after round ends
        setHistoryRefresh((n) => n + 1);
      } else {
        const newGrid = [...game.grid] as ClientMinesState['grid'];
        const newRevealed = [...game.revealed];
        newGrid[index] = 'gem';
        newRevealed[index] = true;
        setGame((g) => ({
          ...g,
          grid: newGrid,
          revealed: newRevealed,
          gemsFound: res.gems_found,
          currentMultiplier: res.current_multiplier,
          nextMultiplier: res.next_multiplier,
        }));
      }
    } catch (err) {
      cms.toast({ title: 'Reveal failed', body: err instanceof Error ? err.message : 'Server error', kind: 'alert' });
    } finally {
      setLoading(false);
    }
  }, [game]);

  // ── Cash out ─────────────────────────────────────────────────────────────
  const cashout = useCallback(async () => {
    if (!game.active || game.gemsFound === 0 || !game.sessionId) return;
    const session = auth.getSession();
    if (!session) return;

    setLoading(true);
    try {
      const res = await GameService.minesCashout(session.userId, game.sessionId);
      store.setBalance(res.balance_after);

      const newGrid = [...game.grid] as ClientMinesState['grid'];
      const newRevealed = [...game.revealed];
      res.mine_positions.forEach((pos) => {
        newGrid[pos] = 'mine';
        newRevealed[pos] = true;
      });

      setGame((g) => ({
        ...g,
        active: false,
        cashedOut: true,
        grid: newGrid,
        revealed: newRevealed,
      }));

      store.recordMinesRound({
        stake: game.stake,
        mines: game.mineCount,
        gems: game.gemsFound,
        multiplier: res.multiplier,
        win: res.payout,
        busted: false,
      });
      cms.toast({ title: 'Cashed out!', body: `You won ${store.currency}${res.payout.toFixed(2)}`, kind: 'success' });
      // Refresh Supabase history after cashout
      setHistoryRefresh((n) => n + 1);
    } catch (err) {
      cms.toast({ title: 'Cashout failed', body: err instanceof Error ? err.message : 'Server error', kind: 'alert' });
    } finally {
      setLoading(false);
    }
  }, [game]);

  const isDisabled = loading;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-coral-500/20 border border-coral-500/40 grid place-items-center">
          <Bomb className="w-5 h-5 text-coral-400" />
        </div>
        <div>
          <h1 className="font-display font-extrabold text-xl text-white leading-none">Mines</h1>
          <p className="text-xs text-slate-500">5×5 grid · {game.active ? game.mineCount : minesInput} mines hidden</p>
        </div>
      </div>

      {/* Grid */}
      <div className="panel p-3 sm:p-4">
        <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
          {Array.from({ length: 25 }, (_, i) => (
            <Cell
              key={i}
              index={i}
              grid={game.grid}
              revealed={game.revealed}
              active={game.active && !isDisabled}
              onReveal={reveal}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="panel p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Stake</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">{store.currency}</span>
              <input
                type="number"
                value={stakeStr}
                onChange={(e) => setStakeStr(e.target.value)}
                disabled={game.active}
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
                value={minesInput || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') setMinesInput(0);
                  else {
                    const num = parseInt(val);
                    if (!isNaN(num)) setMinesInput(Math.max(1, Math.min(24, num)));
                  }
                }}
                onBlur={() => { if (!minesInput) setMinesInput(1); }}
                disabled={game.active}
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
            <p className="tabular font-display font-extrabold text-2xl text-emeraldwin-400">{game.currentMultiplier.toFixed(2)}x</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Next Gem</p>
            <p className="tabular font-bold text-lg text-neon-300">{game.nextMultiplier.toFixed(2)}x</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Gems</p>
            <p className="tabular font-bold text-lg text-white">{game.gemsFound}</p>
          </div>
        </div>

        {!game.active ? (
          <button onClick={() => { void start(); }} disabled={isDisabled} className="btn-primary w-full py-3">
            <Play className="w-4 h-4" /> {loading ? 'Starting…' : 'Start Round'}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { void cashout(); }}
              disabled={game.gemsFound === 0 || game.busted || game.cashedOut || isDisabled}
              className="btn-emerald py-3"
            >
              <HandCoins className="w-4 h-4" />
              Cash Out {store.currency}{game.gemsFound > 0 ? (game.stake * game.currentMultiplier).toFixed(2) : '0.00'}
            </button>
            <button
              disabled={game.busted || game.cashedOut}
              className={`py-3 justify-center text-sm font-semibold rounded-xl border transition-colors ${
                game.busted
                  ? 'btn-ghost text-slate-400'
                  : game.cashedOut
                  ? 'btn-ghost text-slate-400'
                  : 'bg-neon-500/15 border-neon-500/40 text-neon-300'
              }`}
            >
              {game.busted ? 'Round lost' : game.cashedOut ? 'Cashed out' : loading ? 'Checking…' : 'Pick a tile'}
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-600 text-center px-4">
        Reveal gems to grow your multiplier. Hit a mine and you lose your stake. Cash out anytime to lock in winnings.
      </p>

      <MinesStatsTabs historyRefresh={historyRefresh} onRefresh={() => setHistoryRefresh((n) => n + 1)} />
    </div>
  );
}

// ── History tabs ──────────────────────────────────────────────────────────────

type MinesTab = 'mine' | 'top';
type Range = '1d' | '1w' | '1m' | '1y';
const RANGE_MS: Record<Range, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

function MinesStatsTabs({ historyRefresh, onRefresh }: { historyRefresh: number; onRefresh: () => void }) {
  const { rows: myHistory, loading: histLoading } = useSupabaseMinesHistory(historyRefresh);
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
          <div>
            {/* Header row with refresh button */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center justify-between flex-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <span>Stake</span><span>Mines</span><span>Gems</span><span>x</span><span>Payout</span>
              </div>
              <button
                onClick={onRefresh}
                disabled={histLoading}
                className="ml-2 p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                title="Refresh history"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${histLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {histLoading ? (
              <div className="py-6 text-center">
                <RefreshCw className="w-4 h-4 text-slate-600 animate-spin mx-auto" />
              </div>
            ) : myHistory.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-3">No rounds yet. Play to build your history.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-borderline-900 pr-1">
                {myHistory.map((r) => {
                  const won = r.status === 'won';
                  const mines = r.bet_details?.mines ?? '-';
                  const gems = r.bet_details?.gems ?? '-';
                  const multiplier = r.multiplier ?? 0;
                  const payout = r.win_amount ?? 0;
                  return (
                    <div key={r.id} className={`flex items-center justify-between py-1.5 text-xs ${won ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                      <span className="tabular">{store.currency}{r.bet_amount.toFixed(2)}</span>
                      <span className="tabular">{mines}</span>
                      <span className="tabular">{gems}</span>
                      <span className="tabular">{multiplier.toFixed(2)}x</span>
                      <span className={`tabular font-bold ${won ? 'bg-emeraldwin-500/15 px-2 py-0.5 rounded-md' : ''}`}>
                        {store.currency}{payout.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Total summary */}
            {myHistory.length > 0 && (
              <div className="mt-2 pt-2 border-t border-borderline-900 flex items-center justify-between text-[10px] text-slate-500">
                <span>{myHistory.length} rounds total</span>
                <span>
                  Won:{' '}
                  <span className="text-emeraldwin-400 font-semibold">
                    {store.currency}{myHistory.filter(r => r.status === 'won').reduce((s, r) => s + (r.win_amount ?? 0), 0).toFixed(2)}
                  </span>
                </span>
              </div>
            )}
          </div>
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
            {topUsers.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-3">No ranking data yet.</p>
            ) : (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
