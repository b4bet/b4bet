// crashEngine.ts — SERVER-SYNCED shared crash round.
// Polls crash_get_current_round every 300ms.
// Loads last 20 provably-fair rounds on startup for history bar + popup.

import { bus, Topics } from './bus';
import { store } from './store';
import { GameService } from './game-service';
import type { CrashRoundDetail } from './game-service';
import { auth } from './auth';
import { sfx, startHum, updateHum, stopHum } from './crashAudio';

function playStartSound() { try { sfx.start(); startHum(); } catch { /* audio not ready */ } }
function playTickSound(m: number) { try { updateHum(m); } catch { /* ignore */ } }
function playCrashSound() { try { stopHum(); sfx.crash(); } catch { /* ignore */ } }
function playCashoutSound() { try { sfx.cashout(); } catch { /* ignore */ } }

export type CrashPhase = 'countdown' | 'flying' | 'busted';

export interface CashoutEvent { id: string; amount: number; multiplier: number; ts: number; }

export interface BetSlot {
  id: 'A' | 'B';
  amount: number;
  placed: boolean;
  autoCashAt: number | null;
  autoEnabled: boolean;
  cashedOutAt: number | null;
  cashedOut: boolean;
  win: number | null;
}

export interface CrashState {
  phase: CrashPhase;
  multiplier: number;
  countdown: number;
  roundId: string;
  roundSeq: number;
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
  historyDetail: CrashRoundDetail[];
  bets: { A: BetSlot; B: BetSlot };
  startedAt: number;
  win: number | null;
  serverElapsedAtConnect: number;
  connectTime: number;
}

const POLL_MS = 300;
const SESSION_ROUND_KEY = 'b4bet.crash.lastRoundId';
const SESSION_PHASE_KEY = 'b4bet.crash.lastPhase';

function freshBet(id: 'A' | 'B'): BetSlot {
  return {
    id,
    amount: 100,
    placed: false,
    autoCashAt: null,
    autoEnabled: false,
    cashedOutAt: null,
    cashedOut: false,
    win: null,
  };
}

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
    if (typeof result.balance_after === 'number') store.setBalance(result.balance_after);
  } catch (err) {
    console.warn('[CrashEngine] crashSettle failed:', (err as Error)?.message ?? err);
  }
}

class CrashEngine {
  private state: EngineState = {
    phase: 'countdown',
    multiplier: 1.0,
    countdown: 6,
    roundId: '',
    roundSeq: 0,
    bustPoint: 0,
    history: [],
    historyDetail: [],
    bets: { A: freshBet('A'), B: freshBet('B') },
    startedAt: Date.now(),
    win: null,
    serverElapsedAtConnect: 0,
    connectTime: Date.now(),
  };

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private rafId: number = 0;
  private lastKnownRoundId: string = sessionStorage.getItem(SESSION_ROUND_KEY) ?? '';
  private lastKnownPhase: 'waiting' | 'flying' | 'crashed' | '' =
    (sessionStorage.getItem(SESSION_PHASE_KEY) as 'waiting' | 'flying' | 'crashed' | '') ?? '';
  private didPlayStart = false;
  private didPlayCrash = false;

  start() {
    if (this.pollTimer) return;
    void this.loadHistory();
    void this.poll();
    this.pollTimer = setInterval(() => { void this.poll(); }, POLL_MS);
    this.rafId = requestAnimationFrame(() => this.animate());
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    cancelAnimationFrame(this.rafId);
  }

  private async loadHistory() {
    try {
      const r = await GameService.crashGetHistoryDetail();
      if (r.history && r.history.length > 0) {
        this.state.historyDetail = r.history;
        this.state.history = r.history.map((d) => Number(d.bust_point));
        this.publishHistory();
        this.publish();
      }
    } catch (err) {
      console.warn('[CrashEngine] loadHistory failed:', (err as Error)?.message ?? err);
      try {
        const r2 = await GameService.crashGetHistory();
        if (r2.history && r2.history.length > 0) {
          this.state.history = r2.history.map((v) => Number(v));
          this.publishHistory();
          this.publish();
        }
      } catch (err2) {
        console.warn('[CrashEngine] loadHistory fallback failed:', (err2 as Error)?.message ?? err2);
      }
    }
  }

  /** Full provably-fair detail — used by CrashFeedPopup */
  getHistoryDetail(): CrashRoundDetail[] {
    return [...this.state.historyDetail];
  }

  /** Current bets — used by useCrashBets() in hooks.ts */
  getBets(): Record<'A' | 'B', BetSlot> {
    return { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } };
  }

  getState(): CrashState {
    return {
      phase: this.state.phase,
      multiplier: this.state.multiplier,
      countdown: this.state.countdown,
      roundId: this.state.roundId,
      roundSeq: this.state.roundSeq,
      bustPoint: this.state.bustPoint,
      history: [...this.state.history],
      bets: { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } },
      startedAt: this.state.startedAt,
    };
  }

  private async poll() {
    try {
      const r = await GameService.crashGetCurrentRound();

      // ── NEW ROUND DETECTION ──────────────────────────────────────────────
      // A "new round" is when:
      //   1. round_uuid changed AND
      //   2. the server phase is 'waiting' (new betting window opened)
      //
      // IMPORTANT: Do NOT treat waiting→flying UUID change as a new round.
      // The DB function (after fix) keeps the same UUID waiting→flying, so bets
      // placed during countdown are still valid when flying starts.
      // Before the DB fix, a new UUID was generated at flying start — this caused
      // crashEngine to think a new round started, reset bets, and refund locally
      // even though balance was already debited → balance cut with no bet counted.
      const uuidChanged = r.round_uuid && r.round_uuid !== this.lastKnownRoundId;
      const isNewRound = uuidChanged && r.phase === 'waiting';

      if (isNewRound) {
        this.lastKnownRoundId = r.round_uuid ?? '';
        try { sessionStorage.setItem(SESSION_ROUND_KEY, this.lastKnownRoundId); } catch { /* ignore */ }

        // Safety guard: settle any placed-but-unsettled bets before wiping.
        // Under normal operation (DB fix applied) this should never trigger because
        // bets are either cashed out or settled by settleBustedBets() before the
        // crashed→waiting transition. But kept as a safety net.
        for (const slot of Object.values(this.state.bets)) {
          if (slot.placed && slot.cashedOutAt === null && slot.win === null) {
            store.credit(slot.amount);
          }
        }

        this.state.bets = { A: freshBet('A'), B: freshBet('B') };
        this.state.win = null;
        this.state.roundId = r.round_uuid ?? '';
        this.state.roundSeq += 1;
        this.didPlayStart = false;
        this.didPlayCrash = false;
        this.broadcastBets();
      } else if (uuidChanged && this.lastKnownRoundId === '') {
        // First poll ever — just sync the round ID without resetting bets
        this.lastKnownRoundId = r.round_uuid ?? '';
        this.state.roundId = r.round_uuid ?? '';
        try { sessionStorage.setItem(SESSION_ROUND_KEY, this.lastKnownRoundId); } catch { /* ignore */ }
      }

      const prevPhase = this.lastKnownPhase;
      this.lastKnownPhase = r.phase;
      try { sessionStorage.setItem(SESSION_PHASE_KEY, r.phase); } catch { /* ignore */ }

      if (r.phase === 'waiting') {
        const waitTotal = 6000;
        const remaining = Math.max(0, (waitTotal - r.elapsed_ms) / 1000);
        this.state.phase = 'countdown';
        this.state.countdown = remaining;
        this.state.multiplier = 1.0;

        if (r.last_crash_point) {
          const bp = Number(r.last_crash_point);
          if (this.state.history[0] !== bp) {
            this.state.history = [bp, ...this.state.history].slice(0, 20);
            this.publishHistory();
          }
        }
      }

      if (r.phase === 'flying') {
        if (prevPhase !== 'flying') {
          this.state.phase = 'flying';
          this.state.serverElapsedAtConnect = r.elapsed_ms;
          this.state.connectTime = Date.now();
          this.state.startedAt = Date.now() - r.elapsed_ms;
          this.state.bustPoint = 0;
          if (!this.didPlayStart) {
            playStartSound();
            this.didPlayStart = true;
          }
        }
        this.state.phase = 'flying';
        this.state.countdown = 0;
        this.checkAutoCashouts();
      }

      if (r.phase === 'crashed') {
        if (prevPhase !== 'crashed') {
          this.state.phase = 'busted';
          this.state.bustPoint = r.crash_point ?? this.state.multiplier;
          this.state.multiplier = this.state.bustPoint;
          if (!this.didPlayCrash) { playCrashSound(); this.didPlayCrash = true; }
          const bp = this.state.bustPoint;
          if (this.state.history[0] !== bp) {
            this.state.history = [bp, ...this.state.history].slice(0, 20);
            this.publishHistory();
          }
          this.settleBustedBets();
          setTimeout(() => { void this.loadHistory(); }, 2000);
        } else {
          this.state.phase = 'busted';
          if (r.crash_point) {
            this.state.bustPoint = r.crash_point;
            this.state.multiplier = r.crash_point;
          }
        }
      }

      this.publish();
    } catch (err) {
      console.warn('[CrashEngine] poll error:', (err as Error)?.message ?? err);
    }
  }

  private animate() {
    if (this.state.phase === 'flying') {
      const elapsed = Date.now() - this.state.startedAt;
      const m = multiplierFromElapsed(elapsed);
      playTickSound(m);
      this.state.multiplier = m;
      this.checkAutoCashouts();
      this.publish();
    }
    this.rafId = requestAnimationFrame(() => this.animate());
  }

  private checkAutoCashouts() {
    const m = this.state.multiplier;
    for (const slot of Object.values(this.state.bets)) {
      if (slot.placed && !slot.cashedOut && slot.autoEnabled && slot.autoCashAt !== null && m >= slot.autoCashAt) {
        this.performCashOut(slot.id, slot.autoCashAt);
      }
    }
  }

  private publish() { bus.emit(Topics.CrashState, this.getState()); }

  private publishHistory() { bus.emit(Topics.CrashHistory, [...this.state.history]); }

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

  /** Set auto cash-out for a slot. Called by DualBetPanel. */
  setAutoCashAt(id: 'A' | 'B', at: number | null) {
    this.state.bets[id].autoCashAt = at;
  }

  /**
   * setAuto — DualBetPanel calls this as: crashEngine.setAuto(id, enabled, target)
   * Enables/disables auto cashout and sets the target multiplier.
   */
  setAuto(id: 'A' | 'B', enabled: boolean, target: number) {
    this.state.bets[id].autoEnabled = enabled;
    this.state.bets[id].autoCashAt = enabled ? target : null;
  }

  cashOut(id: 'A' | 'B'): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (this.state.phase !== 'flying') return { ok: false, reason: 'Not in flight' };
    if (!slot.placed) return { ok: false, reason: 'No bet placed' };
    if (slot.cashedOut) return { ok: false, reason: 'Already cashed out' };
    this.performCashOut(id, this.state.multiplier);
    return { ok: true };
  }
}

export const crashEngine = new CrashEngine();
