// crashEngine.ts — SERVER-SYNCED shared round.
// All users see the same phase, multiplier, and crash point.
// Client polls crash_get_current_round every 300 ms (same pattern as Aviator).
// Bust point is NEVER sent to the client before the round crashes.

import { bus, Topics } from './bus';
import { store } from './store';
import { GameService } from './game-service';
import { auth } from './auth';
import { cms } from './cms';

import { sfx, startHum, updateHum, stopHum } from './crashAudio';
function playStartSound() { sfx.start(); startHum(); }
function playTickSound(m: number) { updateHum(m); }
function playCrashSound() { stopHum(); sfx.crash(); }
function playCashoutSound() { sfx.cashout(); }

export type CrashPhase = 'countdown' | 'flying' | 'busted';

export interface CashoutEvent { id: string; amount: number; multiplier: number; ts: number; }
export interface BetSlot {
  id: 'A' | 'B';
  amount: number;
  placed: boolean;
  autoCashAt: number | null;
  cashedOutAt: number | null;
  cashedOut: boolean;
  win: number | null;
}
export interface CrashState {
  phase: CrashPhase;
  multiplier: number;
  countdown: number;
  roundId: string;   // round_uuid from server
  roundSeq: number;  // local incrementing counter for display
  bustPoint: number;
  history: number[];
  bets: { A: BetSlot; B: BetSlot };
  startedAt: number;
}

interface EngineState {
  phase: CrashPhase;
  multiplier: number;
  countdown: number;
  roundId: string;
  roundSeq: number;
  bustPoint: number;
  history: number[];
  bets: { A: BetSlot; B: BetSlot };
  startedAt: number;
  win: number | null;
  // server-reported elapsed when we first connected mid-flight
  serverElapsedAtConnect: number;
  connectTime: number;
}

const POLL_MS = 300;  // poll server every 300 ms

function freshBet(id: 'A' | 'B'): BetSlot {
  return { id, amount: 100, placed: false, autoCashAt: null, cashedOutAt: null, cashedOut: false, win: null };
}

// Multiplier formula — must match edge function's flight duration calculation
function multiplierFromElapsed(elapsedMs: number): number {
  return Math.pow(Math.E, 0.12 * (elapsedMs / 1000));
}

async function settleSlotOnServer(slot: BetSlot, roundId: string, bustPoint: number): Promise<void> {
  const session = auth.getSession();
  if (!session) return;
  try {
    const result = await GameService.crashSettle(
      session.userId,
      roundId as unknown as number,
      slot.amount,
      slot.cashedOutAt,
      bustPoint,
    );
    if (typeof result.balance_after === 'number') {
      store.setBalance(result.balance_after);
    }
  } catch (err) {
    console.warn('[CrashEngine] crashSettle failed:', (err as Error)?.message ?? err);
  }
}

class CrashEngine {
  private state: EngineState = {
    phase: 'countdown', multiplier: 1.0, countdown: 6,
    roundId: '', roundSeq: 0,
    bustPoint: 0, history: [],
    bets: { A: freshBet('A'), B: freshBet('B') },
    startedAt: Date.now(), win: null,
    serverElapsedAtConnect: 0, connectTime: Date.now(),
  };

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private rafId: number = 0;
  private lastKnownRoundId = '';
  private lastKnownPhase: 'waiting' | 'flying' | 'crashed' | '' = '';
  // sounds guard
  private didPlayStart = false;
  private didPlayCrash = false;

  start() {
    if (this.pollTimer) return;
    void this.poll();
    this.pollTimer = setInterval(() => { void this.poll(); }, POLL_MS);
    this.rafId = requestAnimationFrame(() => this.animate());
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    cancelAnimationFrame(this.rafId);
  }

  // ── Server poll ──────────────────────────────────────────────────────────
  private async poll() {
    try {
      const r = await GameService.crashGetCurrentRound();

      const newRound = r.round_uuid !== this.lastKnownRoundId;

      // ── Round changed (new round started) ───────────────────────────────
      if (newRound) {
        if (this.lastKnownRoundId !== '') {
          // Previous round just ended — carry over any history we have
        }
        this.lastKnownRoundId = r.round_uuid ?? '';
        this.state.bets = { A: freshBet('A'), B: freshBet('B') };
        this.state.win = null;
        this.state.roundId = r.round_uuid ?? '';
        this.state.roundSeq += 1;
        this.didPlayStart = false;
        this.didPlayCrash = false;
        this.broadcastBets();
      }

      // ── Phase transitions ────────────────────────────────────────────────
      const prevPhase = this.lastKnownPhase;
      this.lastKnownPhase = r.phase;

      if (r.phase === 'waiting') {
        // Countdown — compute from server elapsed
        const waitTotal = 6000; // ms
        const remaining = Math.max(0, (waitTotal - r.elapsed_ms) / 1000);
        this.state.phase = 'countdown';
        this.state.countdown = remaining;
        this.state.multiplier = 1.0;
        // If we just transitioned from crashed → waiting, record history
        if (prevPhase === 'crashed' && r.last_crash_point) {
          this.state.history = [r.last_crash_point, ...this.state.history].slice(0, 20);
        }
      }

      if (r.phase === 'flying') {
        if (prevPhase !== 'flying') {
          // Just started flying
          this.state.phase = 'flying';
          this.state.serverElapsedAtConnect = r.elapsed_ms;
          this.state.connectTime = Date.now();
          this.state.startedAt = Date.now() - r.elapsed_ms;
          this.state.bustPoint = 0; // still secret
          if (!this.didPlayStart) { playStartSound(); this.didPlayStart = true; }
        } else {
          // Already flying — keep startedAt anchored at first connect
        }
        this.state.phase = 'flying';
        this.state.countdown = 0;
        // Check auto cashouts
        this.checkAutoCashouts();
      }

      if (r.phase === 'crashed') {
        if (prevPhase !== 'crashed') {
          // Just crashed
          this.state.phase = 'busted';
          this.state.bustPoint = r.crash_point ?? this.state.multiplier;
          this.state.multiplier = this.state.bustPoint;
          if (!this.didPlayCrash) { playCrashSound(); this.didPlayCrash = true; }
          this.state.history = [this.state.bustPoint, ...this.state.history].slice(0, 20);
          this.settleBustedBets();
        } else {
          this.state.phase = 'busted';
          if (r.crash_point) this.state.bustPoint = r.crash_point;
        }
      }

      this.publish();
    } catch (err) {
      console.warn('[CrashEngine] poll error:', (err as Error)?.message ?? err);
    }
  }

  // ── Animation loop (smooth multiplier between polls) ─────────────────────
  private animate() {
    if (this.state.phase === 'flying') {
      const elapsed = Date.now() - this.state.startedAt;
      const m = multiplierFromElapsed(elapsed);
      playTickSound(m);
      this.state.multiplier = m;
      // Auto-cashout check every frame
      this.checkAutoCashouts();
      this.publish();
    }
    this.rafId = requestAnimationFrame(() => this.animate());
  }

  private checkAutoCashouts() {
    const m = this.state.multiplier;
    for (const slot of Object.values(this.state.bets)) {
      if (slot.placed && !slot.cashedOut && slot.autoCashAt !== null && m >= slot.autoCashAt) {
        this.performCashOut(slot.id, slot.autoCashAt);
      }
    }
  }

  private publish() { bus.emit(Topics.CrashState, this.getState()); }
  private broadcastBets() {
    const bets = { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } };
    bus.emit(Topics.CrashBets, bets);
    bus.emit(Topics.CrashTick, bets);
  }

  private performCashOut(id: 'A' | 'B', cashOutAt: number) {
    const slot = this.state.bets[id];
    if (!slot.placed || slot.cashedOutAt !== null) return;
    slot.cashedOutAt = cashOutAt;
    slot.cashedOut = true;
    slot.win = Math.floor(slot.amount * cashOutAt);
    playCashoutSound();
    bus.emit(Topics.CrashCashout, { id, amount: slot.win, multiplier: cashOutAt, ts: Date.now() } satisfies CashoutEvent);
    this.broadcastBets();
    store.addBalance(slot.win);
    store.recordCrashBet({ roundId: this.state.roundSeq, amount: slot.amount, cashOutAt, bustPoint: this.state.bustPoint, win: slot.win ?? 0 });
    void settleSlotOnServer(slot, this.state.roundId, this.state.bustPoint);
  }

  private settleBustedBets() {
    const bustPoint = this.state.bustPoint;
    const roundSeq = this.state.roundSeq;
    const roundId = this.state.roundId;
    for (const slot of Object.values(this.state.bets)) {
      if (!slot.placed || slot.cashedOutAt !== null) continue;
      slot.win = 0;
      store.recordCrashBet({ roundId: roundSeq, amount: slot.amount, cashOutAt: null, bustPoint, win: 0 });
      void settleSlotOnServer(slot, roundId, bustPoint);
    }
    this.broadcastBets();
  }

  // ── Public API ───────────────────────────────────────────────────────────
  placeBet(id: 'A' | 'B', amount: number): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (this.state.phase !== 'countdown') return { ok: false, reason: 'Round not in betting phase' };
    if (slot.placed) return { ok: false, reason: 'Already placed' };
    if (amount <= 0) return { ok: false, reason: 'Invalid amount' };
    if (amount > store.balance) return { ok: false, reason: 'Insufficient balance' };
    slot.amount = amount;
    slot.placed = true;
    store.debit(amount);
    this.broadcastBets();
    return { ok: true };
  }

  cancelBet(id: 'A' | 'B'): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (this.state.phase !== 'countdown') return { ok: false, reason: 'Cannot cancel after round starts' };
    if (!slot.placed) return { ok: false, reason: 'No bet to cancel' };
    store.addBalance(slot.amount);
    this.state.bets[id] = freshBet(id);
    this.broadcastBets();
    return { ok: true };
  }

  setAutoCashAt(id: 'A' | 'B', at: number | null) { this.state.bets[id].autoCashAt = at; this.broadcastBets(); }

  setAuto(id: 'A' | 'B', enabled: boolean, target: number) {
    this.state.bets[id].autoCashAt = enabled ? Math.max(1.01, target) : null;
    this.broadcastBets();
  }

  cashOut(id: 'A' | 'B'): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (this.state.phase !== 'flying') return { ok: false, reason: 'Round not in flight' };
    if (!slot.placed || slot.cashedOutAt !== null) return { ok: false, reason: 'Cannot cash out' };
    this.performCashOut(id, this.state.multiplier);
    return { ok: true };
  }

  getBets(): Record<'A' | 'B', BetSlot> {
    return { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } };
  }

  getState(): CrashState {
    const { phase, multiplier, countdown, roundId, roundSeq, bustPoint, history, startedAt } = this.state;
    return { phase, multiplier, countdown, roundId, roundSeq, bustPoint, history, bets: { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } }, startedAt };
  }
}

export const crashEngine = new CrashEngine();
