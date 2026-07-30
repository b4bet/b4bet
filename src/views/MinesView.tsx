/**
 * MinesView — server-side outcome version.
 * FIX: Persist active session to localStorage so navigating away and back
 * restores the game state (grid, revealed tiles, multiplier, session id).
 */

import { useState, useCallback, useEffect } from 'react';
import { store } from '../lib/store';
import { cms } from '../lib/cms';
import { auth } from '../lib/auth';
import { GameService } from '../lib/game-service';
import { bus, Topics } from '../lib/bus';
import { supabase } from '../integrations/supabase/client';
import { useAdminConfig, useGameLogos, useBalance } from '../lib/hooks';
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

// ── Persistence helpers ───────────────────────────────────────────────────────
const MINES_SESSION_KEY = 'b4bet_mines_active_session';

function saveMinesSession(game: ClientMinesState) {
  try {
    if (game.active && game.sessionId) {
      localStorage.setItem(MINES_SESSION_KEY, JSON.stringify(game));
    } else {
      localStorage.removeItem(MINES_SESSION_KEY);
    }
  } catch { /* ignore */ }
}

function loadMinesSession(): ClientMinesState | null {
  try {
    const raw = localStorage.getItem(MINES_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientMinesState;
    // Only restore if session is still active
    if (parsed.active && parsed.sessionId && !parsed.busted && !parsed.cashedOut) {
      return parsed;
    }
    localStorage.removeItem(MINES_SESSION_KEY);
    return null;
  } catch { return null; }
}

function clearMinesSession() {
  try { localStorage.removeItem(MINES_SESSION_KEY); } catch { /* ignore */ }
}

// ── Supabase mines history via RPC ────────────────────────────────────────────

interface MinesBetRow {
  id: string;
  bet_amount: number;
  win_amount: number | null;
  multiplier: number | null;
  status: string;
  bet_details: { mines?: number; gems?: number } | null;
  placed_at: string;
}

function useSupabaseMinesHistory() {
  const [rows, setRows] = useState<MinesBetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      const localSession = auth.getSession();
      if (!localSession?.userId) {
        if (!cancelled) { setRows([]); setError(null); }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: rpcError } = await supabase.rpc('get_my_mines_bets');

        if (rpcError) {
          console.error('[mines] rpc error:', rpcError);
          if (!cancelled) setError(rpcError.message);
          return;
        }

        if (!cancelled) setRows((data ?? []) as MinesBetRow[]);
      } catch (e) {
        console.error('[mines] fetch exception:', e);
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchHistory();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    const unsub = bus.on(Topics.AuthState, () => setRefreshKey((k) => k + 1));
    return unsub;
  }, []);

  return { rows, loading, error, refresh };
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
      type="button"
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
        <span className="absolute inset-0 flex items-center justify-center">
          <Gem className="w-5 h-5 text-emeraldwin-400" />
        </span>
      )}
      {isRevealed && isMine && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Bomb className="w-5 h-5 text-coral-400" />
        </span>
      )}
      {!isRevealed && active && (
        <span className="absolute inset-0 flex items-center justify-center opacity-20">
          <Flag className="w-3 h-3 text-slate-400" />
        </span>
      )}
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function MinesView() {
  // Use admin-configured default bet; falls back to 100 until store loads
  const [stakeStr, setStakeStr] = useState(() => String(store.getGameDefaultBet('mines')));
  const [minesInput, setMinesInput] = useState(3);
  const [loading, setLoading] = useState(false);
  // Load persisted session on mount
  const [game, setGame] = useState<ClientMinesState>(() => {
    const saved = loadMinesSession();
    return saved ?? initialState(3, store.getGameDefaultBet('mines'));
  });

  const { rows: myHistory, loading: histLoading, error: histError, refresh: refreshHistory } = useSupabaseMinesHistory();

  const adminCfg = useAdminConfig();
  const gameLogos = useGameLogos();
  const balance = useBalance();
  const quickStakes = adminCfg.gameHandlers['mines']?.quickStakes?.length
    ? adminCfg.gameHandlers['mines'].quickStakes
    : [100, 500, 1000, 5000];

  // Persist game state whenever it changes
  useEffect(() => {
    saveMinesSession(game);
  }, [game]);

  const start = useCallback(async () => {
    const session = auth.getSession();
    if (!session) {
      bus.emit('auth:open_modal' as Parameters<typeof bus.emit>[0], 'login');
      return;
    }
    const amt = parseFloat(stakeStr) || store.getGameDefaultBet('mines');
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
      const newState: ClientMinesState = {
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
      };
      setGame(newState);
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
        clearMinesSession();
        store.recordMinesRound({ stake: game.stake, mines: game.mineCount, gems: res.gems_found, multiplier: res.current_multiplier, win: 0, busted: true });
        setTimeout(refreshHistory, 1500);
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
      clearMinesSession();
      store.recordMinesRound({ stake: game.stake, mines: game.mineCount, gems: game.gemsFound, multiplier: res.multiplier, win: res.payout, busted: false });
      cms.toast({ title: 'Cashed out!', body: `You won ${store.currency}${res.payout.toFixed(2)}`, kind: 'success' });
      setTimeout(refreshHistory, 1500);
    } catch (err) {
      cms.toast({ title: 'Cashout failed', body: err instanceof Error ? err.message : 'Server error', kind: 'alert' });
    } finally {
      setLoading(false);
    }
  }, [game, refreshHistory]);

  const isDisabled = loading;
  const limits = store.getGameLimits('mines');
  const stakeNum = parseFloat(stakeStr) || 0;
  const lastQuickRef = { current: null as number | null };

  return (
    <div className="flex flex-col h-full bg-midnight-900 overflow-hidden">
      {/* Sticky Header with admin logo + balance */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-borderline-900 bg-midnight-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          {gameLogos['mines'] ? (
            <img src={gameLogos['mines']} alt="Mines" className="w-7 h-7 rounded-lg object-cover" />
          ) : null}
          <div>
            <p className="font-display font-extrabold text-white text-sm leading-tight">Mines</p>
            <p className="text-[10px] text-slate-500 leading-tight">5×5 grid · {game.active ? game.mineCount : minesInput} mines hidden</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slatepanel-800 border border-borderline-900">
          <span className="text-[11px] font-bold text-slate-400">{store.currency}</span>
          <span className="tabular font-extrabold text-white text-sm">
            {store.currency}{balance.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Grid */}
        <div className="rounded-2xl border border-borderline-900 bg-slatepanel-900 p-3">
          <div className="grid grid-cols-5 gap-1.5">
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

        {/* Status overlay for busted/cashedOut */}
        {(game.busted || game.cashedOut) && (
          <div className={`rounded-2xl border p-4 text-center ${
            game.busted
              ? 'bg-coral-500/10 border-coral-500/30'
              : 'bg-emeraldwin-500/10 border-emeraldwin-500/30'
          }`}>
            {game.busted ? (
              <>
                <Bomb className="w-8 h-8 text-coral-400 mx-auto mb-2" />
                <p className="font-display font-extrabold text-coral-300 text-lg">BUSTED!</p>
                <p className="text-[11px] text-slate-500 mt-1">{game.gemsFound} gems found before hitting a mine</p>
              </>
            ) : (
              <>
                <HandCoins className="w-8 h-8 text-emeraldwin-400 mx-auto mb-2" />
                <p className="font-display font-extrabold text-emeraldwin-300 text-lg">CASHED OUT!</p>
                <p className="text-[11px] text-slate-500 mt-1">{game.gemsFound} gems · {game.currentMultiplier.toFixed(2)}x multiplier</p>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                const def = store.getGameDefaultBet('mines');
                setGame(initialState(minesInput, def));
                setStakeStr(String(def));
              }}
              className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-slatepanel-700 border border-borderline-800 text-slate-300 text-xs font-semibold active:scale-95 transition-transform"
            >
              <RefreshCw className="w-3 h-3" /> New Game
            </button>
          </div>
        )}

        {/* Multiplier display when active */}
        {game.active && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slatepanel-800 border border-borderline-900">
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">Current</p>
              <p className="font-display font-extrabold text-emeraldwin-400 text-lg tabular">{game.currentMultiplier.toFixed(2)}x</p>
            </div>
            <div className="w-px h-8 bg-borderline-900" />
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">Next gem</p>
              <p className="font-display font-extrabold text-neon-300 text-lg tabular">{game.nextMultiplier.toFixed(2)}x</p>
            </div>
            <div className="w-px h-8 bg-borderline-900" />
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">Gems found</p>
              <p className="font-display font-extrabold text-white text-lg tabular">{game.gemsFound}</p>
            </div>
          </div>
        )}

        {/* Bet controls (only when not active) */}
        {!game.active && !game.busted && !game.cashedOut && (
          <div className="rounded-2xl border border-borderline-900 bg-slatepanel-900 p-3 space-y-3">
            {/* Mines count */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 block">Mines count</label>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 5, 8, 10, 15].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMinesInput(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      minesInput === n
                        ? 'bg-neon-500/20 border-neon-400/60 text-neon-300'
                        : 'bg-slatepanel-800 border-borderline-800 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Stake input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Stake</label>
                <span className="text-[9px] text-slate-600">
                  Min {store.currency}{limits.min} · Max {store.currency}{limits.max.toLocaleString()}
                </span>
              </div>
              <div
                className="rounded-xl border border-borderline-900 p-2 flex flex-col gap-2"
                style={{ background: 'rgba(10,12,26,0.8)' }}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(stakeStr) || 0;
                      const next = Math.max(limits.min, cur - 50);
                      setStakeStr(String(next));
                    }}
                    className="w-7 h-7 grid place-items-center rounded-lg bg-slatepanel-800 border border-borderline-800 text-slate-200 active:scale-95 transition-transform"
                  >
                    <span className="text-base leading-none font-bold">−</span>
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={stakeStr}
                    onChange={(e) => setStakeStr(e.target.value)}
                    className="flex-1 text-center tabular font-extrabold text-white text-base leading-none bg-transparent border-0 outline-none w-0 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(stakeStr) || 0;
                      const next = Math.min(limits.max, cur + 50);
                      setStakeStr(String(next));
                    }}
                    className="w-7 h-7 grid place-items-center rounded-lg bg-slatepanel-800 border border-borderline-800 text-slate-200 active:scale-95 transition-transform"
                  >
                    <span className="text-base leading-none font-bold">+</span>
                  </button>
                </div>
                <div className="flex gap-1">
                  {quickStakes.slice(0, 4).map((v) => {
                    const label = v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : String(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          if (lastQuickRef.current === v) {
                            const cur = parseFloat(stakeStr) || 0;
                            setStakeStr(String(Math.min(limits.max, cur + v)));
                          } else {
                            lastQuickRef.current = v;
                            setStakeStr(String(v));
                          }
                        }}
                        className="flex-1 py-1 rounded-lg text-[10px] tabular font-bold border border-borderline-800 bg-slatepanel-800 text-slate-300 active:scale-95 transition-transform"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Validation */}
            {stakeNum > 0 && (stakeNum < limits.min || stakeNum > limits.max) && (
              <p className="text-[10px] text-coral-400 font-semibold">
                Stake must be between {store.currency}{limits.min} and {store.currency}{limits.max.toLocaleString()}
              </p>
            )}

            <button
              type="button"
              disabled={isDisabled || stakeNum < limits.min || stakeNum > limits.max || stakeNum > balance}
              onClick={() => void start()}
              className="w-full py-3 rounded-xl font-display font-extrabold text-white text-base uppercase tracking-wider
                         bg-gradient-to-r from-neon-500 to-emeraldwin-500 border border-neon-400/40
                         active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {isDisabled ? (
                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Game
            </button>
          </div>
        )}

        {/* Cash Out button when active */}
        {game.active && game.gemsFound > 0 && (
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => void cashout()}
            className="w-full py-3 rounded-xl font-display font-extrabold text-white text-base uppercase tracking-wider
                       bg-gradient-to-r from-amberx-400 to-amberx-600 border border-amberx-400/40
                       active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {isDisabled ? (
              <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <HandCoins className="w-4 h-4" />
            )}
            Cash Out · {store.currency}{(game.stake * game.currentMultiplier).toFixed(2)}
          </button>
        )}

        {/* My History */}
        <div className="rounded-2xl border border-borderline-900 bg-slatepanel-900 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-borderline-900">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">My Bets</p>
            <button type="button" onClick={refreshHistory} className="p-1 rounded-lg hover:bg-slatepanel-800 transition-colors">
              <RefreshCw className="w-3 h-3 text-slate-500" />
            </button>
          </div>
          {histLoading ? (
            <div className="py-6 flex justify-center">
              <div className="w-4 h-4 border-2 border-neon-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : histError ? (
            <p className="px-4 py-3 text-[11px] text-coral-400">{histError}</p>
          ) : myHistory.length === 0 ? (
            <p className="px-4 py-4 text-[11px] text-slate-600 text-center">No bets yet — start playing!</p>
          ) : (
            <div className="divide-y divide-borderline-900">
              {myHistory.slice(0, 20).map((row) => {
                const won = row.win_amount != null && row.win_amount > 0;
                return (
                  <div key={row.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-white tabular">
                        {store.currency}{row.bet_amount.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {row.bet_details?.mines ?? '?'} mines · {row.bet_details?.gems ?? '?'} gems
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold tabular ${won ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                        {won ? `+${store.currency}${(row.win_amount ?? 0).toLocaleString()}` : 'Bust'}
                      </p>
                      <p className="text-[10px] text-slate-600">
                        {row.multiplier != null ? `${row.multiplier.toFixed(2)}x` : '—'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
