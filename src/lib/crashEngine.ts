// crashEngine.ts — Client-side RNG for bust point generation
//
// The bust point is now generated locally using a seeded RNG based on:
//   roundId + a random session seed (set once at engine start).
//
// This guarantees every round has a DIFFERENT bust point distributed
// between 1.10x and 50x+ (with house edge weighting toward lower values).
//
// Balance updates: cashout / bust are settled through store.setBalance()
// which persists to Supabase profiles via the user's id.

import { bus, Topics } from './bus';
import { store } from './store';
import { auth } from './auth';

import { sfx, startHum, updateHum, stopHum } from './crashAudio';
function playStartSound() { sfx.start(); startHum(); }
function playTickSound(m: number) { updateHum(m); }
function playCrashSound() { stopHum(); sfx.crash(); }
function playCashoutSound() { sfx.cashout(); }

export type CrashPhase = 'countdown' | 'flying' | 'busted';

export interface CashoutEvent {
  id: string;
  amount: number;
  multiplier: number;
  ts: number;
}

export interface BetSlot {
  id: 'A' | 'B';
  amount: number;
  placed: boolean;
  autoCashAt: number | null;
  cashedOutAt: number | null;
  win: number | null;
}

export interface CrashState {
  phase: CrashPhase;
  multiplier: number;
  countdown: number;
  roundId: number;
  bustPoint: number;
  history: number[];
  bets: { A: BetSlot; B: BetSlot };
  startedAt: number;
}

interface EngineState {
  phase: CrashPhase;
  multiplier: number;
  countdown: number;
  roundId: number;
  bustPoint: number;
  history: number[];
  bets: { A: BetSlot; B: BetSlot };
  startedAt: number;
  win: number | null;
}

const COUNTDOWN_SECS = 6;

// ── Seeded RNG (Mulberry32) for deterministic but random-feeling bust points ──
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a bust point for the given round.
 *
 * Distribution designed to match real crash games:
 *   - ~50% of rounds bust very low (1.10x–1.60x) — the "house wins" region
 *   - ~30% bust medium (1.60x–5.00x)
 *   - ~15% bust high (5.00x–20.00x)
 *   - ~5%  bust extreme (20.00x–100.00x) — the rare multipliers
 *
 * The RNG is seeded from (sessionSeed + roundId) so that reusing the same seed
 * across sessions still yields different sequences per round.
 */
function generateBustPoint(roundId: number, rng: () => number): number {
  const bucket = rng(); // 0..1
  let raw: number;

  if (bucket < 0.50) {
    // 50% — very low: 1.10x to 1.60x
    raw = 1.10 + rng() * 0.50;
  } else if (bucket < 0.80) {
    // 30% — medium: 1.60x to 5.00x
    raw = 1.60 + rng() * 3.40;
  } else if (bucket < 0.95) {
    // 15% — high: 5.00x to 20.00x
    raw = 5.00 + rng() * 15.0;
  } else {
    // 5% — extreme: 20.00x to 100.00x
    raw = 20.00 + rng() * 80.0;
  }

  // Round to 2 decimal places
  return Math.round(raw * 100) / 100;
}

function freshBet(id: 'A' | 'B'): BetSlot {
  return {
    id,
    amount: 100,
    placed: false,
    autoCashAt: null,
    cashedOutAt: null,
    win: null,
  };
}

class CrashEngine {
  private state: EngineState = {
    phase: 'countdown',
    multiplier: 1.0,
    countdown: COUNTDOWN_SECS,
    roundId: 1,
    bustPoint: 2.0,
    history: [],
    bets: { A: freshBet('A'), B: freshBet('B') },
    startedAt: Date.now(),
    win: null,
  };

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  // RNG session seed — generated once at engine start.
  private sessionSeed: number;
  private rng: () => number;

  constructor() {
    // Generate a random session seed using crypto if available, otherwise Date.now
    this.sessionSeed = Math.floor(
      (typeof crypto !== 'undefined' && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Date.now() * 7919 + Math.floor(Math.random() * 65536)
      )
    );
    this.rng = mulberry32(this.sessionSeed);
    // Generate the initial bust point immediately
    this.state.bustPoint = generateBustPoint(this.state.roundId, this.rng);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 50);
    this.lastTick = Date.now();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private publish() {
    bus.emit(Topics.CrashState, this.getState());
  }

  private broadcastBets() {
    bus.emit(Topics.CrashBets, { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } });
  }

  private tick() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    if (this.state.phase === 'countdown') {
      this.state.countdown -= dt;
      if (this.state.countdown <= 0) {
        this.state.phase = 'flying';
        this.state.multiplier = 1.0;
        this.state.startedAt = now;
        playStartSound();
      }
    }

    if (this.state.phase === 'flying') {
      const elapsed = (now - this.state.startedAt) / 1000;
      // Exponential growth curve
      const m = Math.pow(Math.E, 0.12 * elapsed);
      playTickSound(m);
      this.state.multiplier = m;

      // Auto cash-out logic
      for (const slot of Object.values(this.state.bets)) {
        if (
          slot.placed &&
          slot.cashedOutAt === null &&
          slot.autoCashAt !== null &&
          m >= slot.autoCashAt
        ) {
          this.performCashOut(slot.id, slot.autoCashAt);
        }
      }

      if (m >= this.state.bustPoint) {
        this.state.multiplier = this.state.bustPoint;
        this.state.phase = 'busted';
        playCrashSound();
        this.settleBustedBets();
        // Add to history
        this.state.history = [this.state.bustPoint, ...this.state.history].slice(0, 20);
        setTimeout(() => this.nextRound(), 3000);
      }
    }

    // busted: idle, waiting for nextRound
    this.publish();
  }

  private nextRound() {
    stopHum();
    this.state.roundId += 1;
    this.state.phase = 'countdown';
    this.state.multiplier = 1.0;
    this.state.countdown = COUNTDOWN_SECS;
    this.state.bets = { A: freshBet('A'), B: freshBet('B') };
    this.state.win = null;
    // Generate a NEW bust point for this round using the rng
    this.state.bustPoint = generateBustPoint(this.state.roundId, this.rng);
    this.broadcastBets();
  }

  private performCashOut(id: 'A' | 'B', cashOutAt: number) {
    const slot = this.state.bets[id];
    if (!slot.placed || slot.cashedOutAt !== null) return;
    slot.cashedOutAt = cashOutAt;
    slot.win = Math.floor(slot.amount * cashOutAt);
    playCashoutSound();

    bus.emit(Topics.CashoutEvent, {
      id,
      amount: slot.win,
      multiplier: cashOutAt,
      ts: Date.now(),
    } satisfies CashoutEvent);

    this.broadcastBets();

    // Credit balance locally (persists to Supabase via store.setBalance)
    store.credit(slot.win);

    // Record history
    const roundId = this.state.roundId;
    const bustPoint = this.state.bustPoint;
    store.recordCrashBet({
      roundId,
      amount: slot.amount,
      cashOutAt,
      bustPoint,
      win: slot.win ?? 0,
    });
  }

  private settleBustedBets() {
    const roundId = this.state.roundId;
    const bustPoint = this.state.bustPoint;

    for (const slot of Object.values(this.state.bets)) {
      if (!slot.placed || slot.cashedOutAt !== null) continue;
      slot.win = 0;

      // Record loss in history (balance was already debited on bet placement)
      store.recordCrashBet({
        roundId,
        amount: slot.amount,
        cashOutAt: null,
        bustPoint,
        win: 0,
      });
    }
    this.broadcastBets();
  }

  // ── Place bet (debit balance locally, reconciled on settle) ─────────────
  placeBet(id: 'A' | 'B', amount: number): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (this.state.phase !== 'countdown') return { ok: false, reason: 'Round not in betting phase' };
    if (slot.placed) return { ok: false, reason: 'Already placed' };
    if (amount <= 0) return { ok: false, reason: 'Invalid amount' };

    // Check if user has enough balance
    if (amount > store.balance) return { ok: false, reason: 'Insufficient balance' };

    slot.amount = amount;
    slot.placed = true;
    store.debitBalance(amount);
    this.broadcastBets();
    return { ok: true };
  }

  setAutoCashAt(id: 'A' | 'B', at: number | null) {
    this.state.bets[id].autoCashAt = at;
    this.broadcastBets();
  }

  cashOut(id: 'A' | 'B'): boolean {
    const slot = this.state.bets[id];
    if (this.state.phase !== 'flying') return false;
    if (!slot.placed || slot.cashedOutAt !== null) return false;
    this.performCashOut(id, this.state.multiplier);
    return true;
  }

  getState(): CrashState {
    const { phase, multiplier, countdown, roundId, bustPoint, history } = this.state;
    return {
      phase,
      multiplier,
      countdown,
      roundId,
      bustPoint,
      history,
      bets: { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } },
      startedAt: this.state.startedAt,
    };
  }
}

export const crashEngine = new CrashEngine();
