// Mines engine — 5x5 grid. Mine positions are determined SERVER-SIDE only.
// Client sends start/reveal/cashout to the process-bet edge function.
// The server's response (is_mine, mine_positions on bust/cashout) is the
// ONLY source of truth for where mines are placed. No client-side RNG.

import { bus, Topics } from './bus';
import { store } from './store';
import { auth } from './auth';
import { minesStart, minesReveal, minesCashout } from './processBetApi';

export interface MinesState {
  grid: ('gem' | 'mine' | 'hidden')[]; // 25 cells
  revealed: boolean[];
  mineCount: number;
  active: boolean;
  stake: number;
  gemsFound: number;
  currentMultiplier: number;
  nextMultiplier: number;
  busted: boolean;
  cashedOut: boolean;
  /** True while an async server call is in-flight — disables tile clicks. */
  loading: boolean;
}

const GRID = 25;

// Local multiplier formula — mirrors server's minesMultiplier() for display.
// Server-returned multipliers are authoritative on every reveal response.
function multiplierFor(mines: number, gemsFound: number): number {
  if (gemsFound === 0) return 1;
  const safe = GRID - mines;
  let m = 1;
  for (let i = 0; i < gemsFound; i++) {
    m *= GRID - i;
    m /= safe - i;
  }
  return Math.max(1, Math.round((m * 0.97) * 100) / 100);
}

function initialState(mineCount = 3, stake = 100): MinesState {
  return {
    grid: new Array(GRID).fill('hidden') as ('gem' | 'mine' | 'hidden')[],
    revealed: new Array(GRID).fill(false) as boolean[],
    mineCount,
    active: false,
    stake,
    gemsFound: 0,
    currentMultiplier: 1,
    nextMultiplier: multiplierFor(mineCount, 1),
    busted: false,
    cashedOut: false,
    loading: false,
  };
}

class MinesEngine {
  private state: MinesState = initialState();
  /** Server-issued session ID for the active round. Not revealed to client until bust/cashout. */
  private sessionId: string | null = null;

  getState(): MinesState {
    return { ...this.state, grid: [...this.state.grid], revealed: [...this.state.revealed] };
  }

  setMineCount(n: number) {
    if (this.state.active || this.state.loading) return;
    this.state.mineCount = Math.max(1, Math.min(24, n));
    this.broadcast();
  }

  setStake(n: number) {
    if (this.state.active || this.state.loading) return;
    this.state.stake = Math.max(1, n);
    this.broadcast();
  }

  async start(): Promise<{ ok: boolean; reason?: string }> {
    if (this.state.active) return { ok: false, reason: 'Round already active' };
    if (this.state.loading) return { ok: false, reason: 'Loading' };
    if (!auth.getSession()) {
      bus.emit(Topics.AuthOpenModal, 'login');
      return { ok: false, reason: 'Not authenticated' };
    }
    const { min, max } = store.getGameLimits('mines');
    if (this.state.stake < min) return { ok: false, reason: `Min bet is ${store.currency}${min}` };
    if (this.state.stake > max) return { ok: false, reason: `Max bet is ${store.currency}${max}` };
    if (this.state.stake > store.balance) return { ok: false, reason: 'Insufficient balance' };

    this.state.loading = true;
    this.broadcast();

    try {
      // Server deducts stake atomically and creates the mines session
      const res = await minesStart(this.state.mineCount, this.state.stake);
      this.sessionId = res.session_id;
      const mc = this.state.mineCount;
      const st = this.state.stake;
      this.state = {
        grid: new Array(GRID).fill('hidden') as ('gem' | 'mine' | 'hidden')[],
        revealed: new Array(GRID).fill(false) as boolean[],
        mineCount: mc,
        active: true,
        stake: st,
        gemsFound: 0,
        currentMultiplier: 1,
        nextMultiplier: multiplierFor(mc, 1),
        busted: false,
        cashedOut: false,
        loading: false,
      };
      // Sync balance from server (server debited stake atomically)
      store.syncBalanceFromServer(res.balance_after);
      this.broadcast();
      return { ok: true };
    } catch (err) {
      this.state.loading = false;
      this.broadcast();
      return { ok: false, reason: err instanceof Error ? err.message : 'Server error — please try again' };
    }
  }

  async reveal(index: number): Promise<{ ok: boolean; busted?: boolean; reason?: string }> {
    if (!this.state.active || this.state.busted || this.state.cashedOut) {
      return { ok: false, reason: 'No active round' };
    }
    if (this.state.revealed[index]) return { ok: false, reason: 'Already revealed' };
    if (this.state.loading) return { ok: false, reason: 'Loading' };
    if (!this.sessionId) return { ok: false, reason: 'No session' };

    // Optimistic reveal while request is in-flight
    this.state.loading = true;
    this.state.revealed[index] = true;
    this.broadcast();

    try {
      const res = await minesReveal(this.sessionId, index);

      if (res.is_mine) {
        this.state.grid[index] = 'mine';
        this.state.busted = true;
        this.state.active = false;
        this.state.loading = false;
        // Server reveals all mine positions — display them
        if (res.mine_positions) {
          for (const pos of res.mine_positions) {
            this.state.revealed[pos] = true;
            this.state.grid[pos] = 'mine';
          }
        }
        // Display-only record — server already inserted into bets table
        store.recordMinesRound({
          stake: this.state.stake,
          mines: this.state.mineCount,
          gems: this.state.gemsFound,
          multiplier: this.state.currentMultiplier,
          win: 0,
          busted: true,
        });
        this.broadcast();
        return { ok: true, busted: true };
      }

      // Safe tile — use server-authoritative multipliers
      this.state.grid[index] = 'gem';
      this.state.gemsFound = res.gems_found;
      this.state.currentMultiplier = res.current_multiplier ?? multiplierFor(this.state.mineCount, res.gems_found);
      this.state.nextMultiplier = res.next_multiplier ?? multiplierFor(this.state.mineCount, res.gems_found + 1);
      this.state.loading = false;
      this.broadcast();
      return { ok: true };
    } catch (err) {
      // Revert optimistic reveal on network/server error
      this.state.loading = false;
      this.state.revealed[index] = false;
      this.state.grid[index] = 'hidden';
      this.broadcast();
      return { ok: false, reason: err instanceof Error ? err.message : 'Server error — please try again' };
    }
  }

  async cashOut(): Promise<{ ok: boolean; payout?: number; reason?: string }> {
    if (!this.state.active || this.state.busted || this.state.cashedOut) {
      return { ok: false, reason: 'No active round' };
    }
    if (this.state.gemsFound === 0) return { ok: false, reason: 'Reveal at least one gem' };
    if (this.state.loading) return { ok: false, reason: 'Loading' };
    if (!this.sessionId) return { ok: false, reason: 'No session' };

    this.state.loading = true;
    this.broadcast();

    try {
      const res = await minesCashout(this.sessionId);
      this.state.cashedOut = true;
      this.state.active = false;
      this.state.loading = false;
      // Reveal all mine positions for display
      for (const pos of res.mine_positions) {
        this.state.revealed[pos] = true;
        this.state.grid[pos] = 'mine';
      }
      // Sync balance from server (server credited payout atomically)
      store.syncBalanceFromServer(res.balance_after);
      // Display-only record — server already inserted into bets table
      store.recordMinesRound({
        stake: this.state.stake,
        mines: this.state.mineCount,
        gems: this.state.gemsFound,
        multiplier: res.multiplier,
        win: res.payout,
        busted: false,
      });
      this.broadcast();
      return { ok: true, payout: res.payout };
    } catch (err) {
      this.state.loading = false;
      this.broadcast();
      return { ok: false, reason: err instanceof Error ? err.message : 'Server error — please try again' };
    }
  }

  private broadcast() {
    bus.emit(Topics.MinesState, this.getState());
  }
}

export const minesEngine = new MinesEngine();
