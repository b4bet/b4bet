// process-bet edge function is authoritative for:
//   1. The bust point for each round — generated server-side via
//      crypto.getRandomValues() — the client never computes it.
//   2. Balance updates (debit on bet, credit on cashout) are performed
//      server-side via GameService.crashSettle() when the round ends.
//
// Security note on bust point: we fetch it at round START (not during
// betting), but we must NOT start the flying phase until the server
// actually responds — otherwise the placeholder 2.0x is used.
// round-start fetch latency must complete before the flying phase begins.

import { bus, Topics } from './bus';
import { store } from './store';
import { GameService } from './game-service';
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
    // Initial bust point is 2.0 as a safe placeholder until the first
    // server fetch completes during the countdown phase.
    bustPoint: 2.0,
    history: [],
    bets: { A: freshBet('A'), B: freshBet('B') },
    startedAt: Date.now(),
    win: null,
  };

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  // Tracks whether we have already sent the bust point request for the current round.
  private bustPointFetched = false;
  // Tracks whether the server has actually RESPONDED with the bust point.
  // Flying phase must NOT start until this is true to avoid using the 2.0 placeholder.
  private bustPointReceived = false;

  start() {
    if (this.timer) return;
    // Kick off the bust-point fetch for round 1 immediately.
    this.fetchBustPoint(this.state.roundId);
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
        // ── FIX: Do NOT start flying until server bust_point is received ──
        // Without this guard, the default 2.0 placeholder is used every round.
        if (!this.bustPointReceived) {
          this.state.countdown = 0; // hold at 0, keep displaying countdown
          this.publish();
          return;
        }
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
    // Placeholder bust point until server responds
    this.state.bustPoint = 2.0;
    this.bustPointFetched = false;
    // Reset received flag — flying phase will wait until new bust_point arrives
    this.bustPointReceived = false;
    // Fetch bust point for the new round immediately so it arrives before flying
    this.fetchBustPoint(this.state.roundId);
    this.broadcastBets();
  }

  // ── Fetch server bust point ──────────────────────────────────────────────
  private fetchBustPoint(roundId: number) {
    if (this.bustPointFetched) return;
    this.bustPointFetched = true;
    GameService.crashGetBustPoint(roundId)
      .then((res) => {
        // Only apply if we are still on the same round and haven't crashed yet.
        if (this.state.roundId === roundId && this.state.phase !== 'busted') {
          this.bustPointReceived = true;
          this.state.bustPoint = res.bust_point;
        }
      })
      .catch(() => {
        // On failure, allow flying with the 2.0 placeholder after a short delay
        // so the game doesn't freeze. Log for debugging.
        console.warn('[CrashEngine] Failed to fetch bust point for round', roundId, '— using placeholder 2.0');
        if (this.state.roundId === roundId && this.state.phase !== 'busted') {
          this.bustPointReceived = true;
        }
      });
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

    // Settle server-side
    const roundId = this.state.roundId;
    const bustPoint = this.state.bustPoint;
    const session = auth.getSession();
    if (session) {
      void GameService.crashSettle(session.userId, roundId, slot.amount, cashOutAt, bustPoint)
        .then((res) => {
          if (res.balance_after !== undefined) {
            store.setBalance(res.balance_after);
          }
          // Local history record
          store.recordCrashBet({
            roundId,
            amount: slot.amount,
            cashOutAt,
            bustPoint,
            win: slot.win ?? 0,
          });
        })
        .catch((err) => console.warn('[CrashEngine] cashout settle error', err));
    }
  }

  private settleBustedBets() {
    const roundId = this.state.roundId;
    const bustPoint = this.state.bustPoint;

    for (const slot of Object.values(this.state.bets)) {
      if (!slot.placed || slot.cashedOutAt !== null) continue;
      slot.win = 0;

      const session = auth.getSession();
      if (session) {
        void GameService.crashSettle(session.userId, roundId, slot.amount, null, bustPoint)
          .then((res) => {
            if (res.balance_after !== undefined) {
              store.setBalance(res.balance_after);
            }
            store.recordCrashBet({
              roundId,
              amount: slot.amount,
              cashOutAt: null,
              bustPoint,
              win: 0,
            });
          })
          .catch((err) => console.warn('[CrashEngine] bust settle error', err));
      }
    }
    this.broadcastBets();
  }

  // ── Place bet (debit balance locally, reconciled on settle) ─────────────
  placeBet(id: 'A' | 'B', amount: number): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (this.state.phase !== 'countdown') return { ok: false, reason: 'Round not in betting phase' };
    if (slot.placed) return { ok: false, reason: 'Already placed' };
    if (amount <= 0) return { ok: false, reason: 'Invalid amount' };

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
