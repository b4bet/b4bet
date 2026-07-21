/**
 * MinesView — server-side outcome version.
 */

import { useState, useCallback, useEffect } from 'react';
import { store } from '../lib/store';
import { cms } from '../lib/cms';
import { auth } from '../lib/auth';
import { GameService } from '../lib/game-service';
import { bus, Topics } from '../lib/bus';
import { supabase } from '../integrations/supabase/client';
import { Bomb, Gem, Flag, Play, HandCoins, RefreshCw } from 'lucide-react';

// ── Local UI state ────────────────────────────────────────────────────────────

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
  // bet_details is stored as JSONB — may arrive as object or string
  bet_details: unknown;
  placed_at: string;
}

/** Safely parse bet_details regardless of whether Supabase returns it as object or string */
function parseBetDetails(raw: unknown): { mines?: number; gems?: number } {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as { mines?: number; gems?: number };
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as { mines?: number; gems?: number }; } catch { return {}; }
  }
  return {};
}

function isMinesBet(row: SupabaseMinesBet): boolean {
  const d = parseBetDetails(row.bet_details);
  return 'mines' in d;
}

function useSupabaseMinesHistory() {
  const [rows, setRows] = useState<SupabaseMinesBet[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      setLoading(true);
      try {
        // Get the current authenticated Supabase session — this attaches
        // the JWT so RLS policy (auth.uid() = user_id) is satisfied.
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id ?? auth.getSession()?.userId;

        if (!userId) {
          if (!cancelled) setRows([]);
          return;
        }

        // NOTE: column is `placed_at`, not `created_at`
        const { data, error } = await supabase
          .from('bets')
          .select('id, bet_amount, win_amount, multiplier, status, bet_details, placed_at')
          .eq('user_id', userId)
          .order('placed_at', { ascending: false });

        if (error) {
          console.warn('[mines] history fetch error:', error.message, error);
          if (!cancelled) setRows([]);
          return;
        }

        const mineBets = ((data ?? []) as SupabaseMinesBet[]).filter(isMinesBet);
        if (!cancelled) setRows(mineBets);
      } catch (e) {
        console.warn('[mines] history exception:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchHistory();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Re-fetch on auth state change (login / logout)
  useEffect(() => {
    const unsub = bus.on(Topics.AuthState, () => setRefreshKey((k) => k + 1));
    return unsub;
  }, []);

  return { rows, loading, refresh };
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
  const [game, setGame] = useState<ClientMinesState>(() => initialState(3, 100));

  const { rows: myHistory, loading: histLoading, refresh: refreshHistory } = useSupabaseMinesHistory();

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
          res.mine_positions.forEach((pos) => { newGrid[pos] = 'mine'; newRevealed[pos] = true; });
        }
        setGame((g) => ({ ...g, active: false, busted: true, grid: newGrid, revealed: newRevealed, gemsFound: res.gems_found }));
        store.recordMinesRound({ stake: game.stake, mines: game.mineCount, gems: res.gems_found, multiplier: res.current_multiplier, win: 0, busted: true });
        setTimeout(refreshHistory, 1200);
      } else {
        const newGrid = [...game.grid] as ClientMinesState['grid'];
        const newRevealed = [...game.revealed];
        newGrid[index] = 'gem';
        newRevealed[index] = true;
        setGame((g) => ({ ...g, grid: newGrid, revealed: newRevealed, gemsFound: res.gems_found, currentMultiplier: res.current_multiplier, nextMultiplier: res.next_multiplier }));
      }
    } catch (err) {
      cms.toast({ title: 'Reveal failed', body: err instanceof Error ? err.message : 'Server error', kind: 'alert' });
    } finally {
      setLoading(false);
    }
  }, [game, refreshHistory]);

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
      res.mine_positions.forEach((pos) => { newGrid[pos] = 'mine'; newRevealed[pos] = true; });
      setGame((g) => ({ ...g, active: false, cashedOut: true, grid: newGrid, revealed: newRevealed }));
      store.recordMinesRound({ stake: game.stake, mines: game.mineCount, gems: game.gemsFound, multiplier: res.multiplier, win: res.payout, busted: false });
      cms.toast({ title: 'Cashed out!', body: `You won ${store.currency}${res.payout.toFixed(2)}`, kind: 'success' });
      setTimeout(refreshHistory, 1200);
    } catch (err) {
      cms.toast({ title: 'Cashout failed', body: err instanceof Error ? err.message : 'Server error', kind: 'alert' });
    } finally {
      setLoading(false);
    }
  }, [game, refreshHistory]);

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
            <Cell key={i} index={i} grid={game.grid} revealed={game.revealed} active={game.active && !isDisabled} onReveal={reveal} />
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
              <input type="number" value={stakeStr} onChange={(e) => setStakeStr(e.target.value)} disabled={game.active} min={1} className="input text-center tabular" />
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
                  else { const num = parseInt(val); if (!isNaN(num)) setMinesInput(Math.max(1, Math.min(24, num))); }
                }}
                onBlur={() => { if (!minesInput) setMinesInput(1); }}
                disabled={game.active} min={1} max={24} placeholder="1" className="input text-center tabular"
              />
            </div>
          </div>
        </div>

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
            <button onClick={() => { void cashout(); }} disabled={game.gemsFound === 0 || game.busted || game.cashedOut || isDisabled} className="btn-emerald py-3">
              <HandCoins className="w-4 h-4" />
              Cash Out {store.currency}{game.gemsFound > 0 ? (game.stake * game.currentMultiplier).toFixed(2) : '0.00'}
            </button>
            <button
              disabled={game.busted || game.cashedOut}
              className={`py-3 justify-center text-sm font-semibold rounded-xl border transition-colors ${
                game.busted ? 'btn-ghost text-slate-400' : game.cashedOut ? 'btn-ghost text-slate-400' : 'bg-neon-500/15 border-neon-500/40 text-neon-300'
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

      <MinesHistoryPanel rows={myHistory} loading={histLoading} onRefresh={refreshHistory} />
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────

function MinesHistoryPanel({
  rows,
  loading,
  onRefresh,
}: {
  rows: SupabaseMinesBet[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const totalWon = rows
    .filter((r) => r.status === 'won')
    .reduce((s, r) => s + (r.win_amount ?? 0), 0);

  return (
    <div className="panel p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-borderline-900">
        <span className="text-xs font-semibold text-coral-300">My History</span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="py-6 flex justify-center">
            <RefreshCw className="w-4 h-4 text-slate-600 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-4">No rounds yet. Play to build your history.</p>
        ) : (
          <>
            {/* Fixed column headers */}
            <div className="grid grid-cols-[1.8rem_1.6rem_3.2rem_1fr_1fr] gap-x-2 pb-1 mb-1 border-b border-borderline-900 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              <span>💣</span>
              <span>💎</span>
              <span className="text-right">Multi</span>
              <span className="text-right">Stake</span>
              <span className="text-right">Payout</span>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-borderline-900">
              {rows.map((r) => {
                const won = r.status === 'won';
                const d = parseBetDetails(r.bet_details);
                const mines = d.mines ?? '-';
                const gems = d.gems ?? '-';
                const multiplier = r.multiplier ? Number(r.multiplier) : 0;
                const payout = r.win_amount ?? 0;
                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1.8rem_1.6rem_3.2rem_1fr_1fr] gap-x-2 py-1.5 text-xs items-center"
                  >
                    <span className={`tabular font-mono ${won ? 'text-emeraldwin-400' : 'text-coral-400'}`}>{mines}</span>
                    <span className={`tabular font-mono ${won ? 'text-emeraldwin-400' : 'text-coral-400'}`}>{gems}</span>
                    <span className={`tabular font-mono text-right ${won ? 'text-emeraldwin-400' : 'text-coral-400'}`}>{multiplier.toFixed(2)}x</span>
                    <span className="tabular font-mono text-right text-slate-400 truncate">{store.currency}{r.bet_amount.toFixed(0)}</span>
                    <span className={`tabular font-mono text-right font-bold truncate ${won ? 'text-emeraldwin-400' : 'text-slate-600'}`}>
                      {won ? `${store.currency}${payout.toFixed(2)}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Summary footer */}
            <div className="mt-2 pt-2 border-t border-borderline-900 flex items-center justify-between text-[10px] text-slate-500">
              <span>{rows.length} rounds</span>
              <span>
                Total won:{' '}
                <span className="text-emeraldwin-400 font-semibold">
                  {store.currency}{totalWon.toFixed(2)}
                </span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
