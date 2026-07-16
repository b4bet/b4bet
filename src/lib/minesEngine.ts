// Mines engine — 5x5 grid. Player picks tiles; gems increase the multiplier,
// mines end the round and lose the stake. Cashout locks in winnings.

import { bus, Topics } from './bus';
import { store } from './store';

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
}

const GRID = 25;

function placeMines(count: number): ('gem' | 'mine')[] {
  const cells: ('gem' | 'mine')[] = new Array(GRID).fill('gem');
  const indices = Array.from({ length: GRID }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (GRID - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
    cells[indices[i]] = 'mine';
  }
  return cells;
}

// Fair multiplier for k mines, n gems revealed so far.
function multiplierFor(mines: number, gemsFound: number): number {
  if (gemsFound === 0) return 1;
  const safe = GRID - mines;
  let m = 1;
  for (let i = 0; i < gemsFound; i++) {
    m *= GRID - i;
    m /= safe - i;
  }
  // house edge 3%
  return Math.max(1, Math.round((m * 0.97) * 100) / 100);
}

class MinesEngine {
  private state: MinesState = {
    grid: new Array(GRID).fill('hidden'),
    revealed: new Array(GRID).fill(false),
    mineCount: 3,
    active: false,
    stake: 100,
    gemsFound: 0,
    currentMultiplier: 1,
    nextMultiplier: 1,
    busted: false,
    cashedOut: false,
  };
  private solution: ('gem' | 'mine')[] = [];

  getState(): MinesState {
    return { ...this.state, grid: [...this.state.grid] };
  }

  setMineCount(n: number) {
    if (this.state.active) return;
    this.state.mineCount = Math.max(1, Math.min(24, n));
    this.broadcast();
  }

  setStake(n: number) {
    if (this.state.active) return;
    this.state.stake = Math.max(1, n);
    this.broadcast();
  }

  start(): { ok: boolean; reason?: string } {
    if (this.state.active) return { ok: false, reason: 'Round already active' };
    const { min, max } = store.getGameLimits('mines');
    if (this.state.stake < min) return { ok: false, reason: `Min bet is ${store.currency}${min}` };
    if (this.state.stake > max) return { ok: false, reason: `Max bet is ${store.currency}${max}` };
    if (!store.debit(this.state.stake)) return { ok: false, reason: 'Insufficient balance' };
    this.solution = placeMines(this.state.mineCount);
    this.state = {
      grid: new Array(GRID).fill('hidden'),
      revealed: new Array(GRID).fill(false),
      mineCount: this.state.mineCount,
      active: true,
      stake: this.state.stake,
      gemsFound: 0,
      currentMultiplier: 1,
      nextMultiplier: multiplierFor(this.state.mineCount, 1),
      busted: false,
      cashedOut: false,
    };
    this.broadcast();
    return { ok: true };
  }

  reveal(index: number): { ok: boolean; busted?: boolean; reason?: string } {
    if (!this.state.active || this.state.busted || this.state.cashedOut) return { ok: false, reason: 'No active round' };
    if (this.state.revealed[index]) return { ok: false, reason: 'Already revealed' };
    this.state.revealed[index] = true;
    const cell = this.solution[index];
    this.state.grid[index] = cell;
    if (cell === 'mine') {
      this.state.busted = true;
      this.state.active = false;
      // reveal all mines
      this.solution.forEach((c, i) => {
        if (c === 'mine') {
          this.state.revealed[i] = true;
          this.state.grid[i] = 'mine';
        }
      });
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
    this.state.gemsFound += 1;
    this.state.currentMultiplier = multiplierFor(this.state.mineCount, this.state.gemsFound);
    this.state.nextMultiplier = multiplierFor(this.state.mineCount, this.state.gemsFound + 1);
    this.broadcast();
    return { ok: true };
  }

  cashOut(): { ok: boolean; payout?: number; reason?: string } {
    if (!this.state.active || this.state.busted || this.state.cashedOut) return { ok: false, reason: 'No active round' };
    if (this.state.gemsFound === 0) return { ok: false, reason: 'Reveal at least one gem' };
    const payout = Math.round(this.state.stake * this.state.currentMultiplier * 100) / 100;
    this.state.cashedOut = true;
    this.state.active = false;
    store.credit(payout);
    // reveal remaining mines
    this.solution.forEach((c, i) => {
      if (c === 'mine') {
        this.state.revealed[i] = true;
        this.state.grid[i] = 'mine';
      }
    });
    store.recordMinesRound({
      stake: this.state.stake,
      mines: this.state.mineCount,
      gems: this.state.gemsFound,
      multiplier: this.state.currentMultiplier,
      win: payout,
      busted: false,
    });
    this.broadcast();
    return { ok: true, payout };
  }

  private broadcast() {
    bus.emit(Topics.MinesState, this.getState());
  }
}

export const minesEngine = new MinesEngine();
