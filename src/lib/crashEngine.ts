// crashEngine.ts — SERVER-SIDE bust point only. Client NEVER computes RNG.
// Edge function "process-bet" generates bust point via crypto.getRandomValues().
// If edge function times out, game shows error toast instead of freezing.
// Balance via store.setBalance() which persists to Supabase.

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
  /** true when player has cashed out this round */
  cashedOut: boolean;
  win: number | null;
}
export interface CrashState { phase: CrashPhase; multiplier: number; countdown: number; roundId: number; bustPoint: number; history: number[]; bets: { A: BetSlot; B: BetSlot }; startedAt: number; }

interface EngineState { phase: CrashPhase; multiplier: number; countdown: number; roundId: number; bustPoint: number; history: number[]; bets: { A: BetSlot; B: BetSlot }; startedAt: number; win: number | null; }

const COUNTDOWN_SECS = 6;
const FETCH_TIMEOUT_MS = 4000;

function freshBet(id: 'A' | 'B'): BetSlot { return { id, amount: 100, placed: false, autoCashAt: null, cashedOutAt: null, cashedOut: false, win: null }; }

/**
 * Call crash_settle edge function for a single slot.
 * This atomically updates balance in Supabase (credit on win, no change on bust —
 * the debit already happened at bet placement time via debitBalance).
 */
async function settleSlotOnServer(
  slot: BetSlot,
  roundId: number,
  bustPoint: number,
): Promise<void> {
  const session = auth.getSession();
  if (!session) return;
  try {
    const result = await GameService.crashSettle(
      session.userId,
      roundId,
      slot.amount,
      slot.cashedOutAt,   // null if busted
      bustPoint,
    );
    // Sync authoritative balance from server
    if (typeof result.balance_after === 'number') {
      store.setBalance(result.balance_after);
    }
  } catch (err) {
    console.warn('[CrashEngine] crashSettle failed:', (err as Error)?.message ?? err);
    // Don't update local balance if server call fails — leave it as-is
    // so user sees their current balance and can retry/refresh
  }
}

class CrashEngine {
  private state: EngineState = {
    phase: 'countdown', multiplier: 1.0, countdown: COUNTDOWN_SECS, roundId: 1,
    bustPoint: 2.50, history: [],
    bets: { A: freshBet('A'), B: freshBet('B') }, startedAt: Date.now(), win: null,
  };

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private bustPointFetchStart = 0;
  private bustPointReceived = false;

  start() {
    if (this.timer) return;
    void this.fetchBustPoint(this.state.roundId);
    this.timer = setInterval(() => this.tick(), 50);
    this.lastTick = Date.now();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private publish() { bus.emit(Topics.CrashState, this.getState()); }
  private broadcastBets() {
    const bets = { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } };
    bus.emit(Topics.CrashBets, bets);
    bus.emit(Topics.CrashTick, bets);
  }

  private tick() {
    const now = Date.now(); const dt = (now - this.lastTick) / 1000; this.lastTick = now;

    if (this.state.phase === 'countdown') {
      this.state.countdown -= dt;
      if (this.state.countdown <= 0) {
        if (!this.bustPointReceived) {
          const waited = now - this.bustPointFetchStart;
          if (waited > FETCH_TIMEOUT_MS) {
            this.state.phase = 'busted';
            this.state.bustPoint = 1.01;
            this.state.multiplier = 1.01;
            playCrashSound();
            cms.toast({ title: 'Connection Error', body: 'Unable to reach game server. Round skipped.', kind: 'warn' });
            this.settleBustedBets();
            setTimeout(() => this.nextRound(), 3000);
            this.publish();
            return;
          }
          this.state.countdown = 0; this.publish(); return;
        }
        this.state.phase = 'flying'; this.state.multiplier = 1.0; this.state.startedAt = now;
        playStartSound();
      }
    }

    if (this.state.phase === 'flying') {
      const elapsed = (now - this.state.startedAt) / 1000;
      const m = Math.pow(Math.E, 0.12 * elapsed);
      playTickSound(m); this.state.multiplier = m;
      for (const slot of Object.values(this.state.bets)) { if (slot.placed && slot.cashedOutAt === null && slot.autoCashAt !== null && m >= slot.autoCashAt) this.performCashOut(slot.id, slot.autoCashAt); }
      if (m >= this.state.bustPoint) {
        this.state.multiplier = this.state.bustPoint; this.state.phase = 'busted';
        playCrashSound();
        this.state.history = [this.state.bustPoint, ...this.state.history].slice(0, 20);
        this.settleBustedBets();
        setTimeout(() => this.nextRound(), 3000);
      }
    }
    this.publish();
  }

  private nextRound() {
    stopHum(); this.state.roundId += 1; this.state.phase = 'countdown';
    this.state.multiplier = 1.0; this.state.countdown = COUNTDOWN_SECS;
    this.state.bets = { A: freshBet('A'), B: freshBet('B') }; this.state.win = null;
    this.state.bustPoint = 2.50; this.bustPointReceived = false;
    void this.fetchBustPoint(this.state.roundId); this.broadcastBets();
  }

  private async fetchBustPoint(roundId: number) {
    this.bustPointFetchStart = Date.now();
    try {
      const res = await GameService.crashGetBustPoint(roundId);
      if (this.state.roundId === roundId && this.state.phase !== 'busted') {
        this.bustPointReceived = true;
        this.state.bustPoint = Math.max(1.10, Number(res.bust_point) || 2.50);
      }
    } catch (err) {
      console.warn('[CrashEngine] Server bust point failed for round', roundId + ':', (err as Error)?.message ?? err);
    }
  }

  private performCashOut(id: 'A' | 'B', cashOutAt: number) {
    const slot = this.state.bets[id]; if (!slot.placed || slot.cashedOutAt !== null) return;
    slot.cashedOutAt = cashOutAt;
    slot.cashedOut = true;
    slot.win = Math.floor(slot.amount * cashOutAt);
    playCashoutSound();
    bus.emit(Topics.CrashCashout, { id, amount: slot.win, multiplier: cashOutAt, ts: Date.now() } satisfies CashoutEvent);
    this.broadcastBets();

    // Optimistic local credit so UI feels instant
    store.addBalance(slot.win);

    // Record locally for history
    store.recordCrashBet({ roundId: this.state.roundId, amount: slot.amount, cashOutAt, bustPoint: this.state.bustPoint, win: slot.win ?? 0 });

    // Sync with Supabase via edge function (authoritative balance update)
    void settleSlotOnServer(slot, this.state.roundId, this.state.bustPoint);
  }

  private settleBustedBets() {
    const bustPoint = this.state.bustPoint;
    const roundId = this.state.roundId;
    for (const slot of Object.values(this.state.bets)) {
      if (!slot.placed || slot.cashedOutAt !== null) continue;
      slot.win = 0;
      store.recordCrashBet({ roundId, amount: slot.amount, cashOutAt: null, bustPoint, win: 0 });
      // Settle loss on server (records bet in DB, no balance change needed — debit already done)
      void settleSlotOnServer(slot, roundId, bustPoint);
    }
    this.broadcastBets();
  }

  placeBet(id: 'A' | 'B', amount: number): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (this.state.phase !== 'countdown') return { ok: false, reason: 'Round not in betting phase' };
    if (slot.placed) return { ok: false, reason: 'Already placed' };
    if (amount <= 0) return { ok: false, reason: 'Invalid amount' };
    if (amount > store.balance) return { ok: false, reason: 'Insufficient balance' };
    slot.amount = amount;
    slot.placed = true;
    // Debit locally + Supabase via store.debit()
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

  /** setAuto — enable/disable auto-cashout and set target multiplier */
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

  getState(): CrashState { const { phase, multiplier, countdown, roundId, bustPoint, history } = this.state; return { phase, multiplier, countdown, roundId, bustPoint, history, bets: { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } }, startedAt: this.state.startedAt }; }
}

export const crashEngine = new CrashEngine();
