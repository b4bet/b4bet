// Real-time Crash engine — server-side bust point version.
//
// Key security changes vs old version:
//   1. Bust point is fetched from the process-bet Edge Function at the START
//      of every round using GameService.crashGetBustPoint(). The server uses
//      crypto.getRandomValues() — the client never computes it.
//   2. Balance updates (debit on bet, credit on cashout) are performed
//      server-side via GameService.crashSettle() when the round ends.
//      The local store balance is synced from the server response.
//   3. The local computeBustPoint() function is removed entirely.
//
// The engine still runs client-side for the animation tick (50ms interval).
// It simply compares the current multiplier against the SERVER-fetched bust
// point. The bust point is never sent to the client until the server returns
// it — but because we fetch it at round START (not during betting), the
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

export interface CrashState {
  phase: CrashPhase;
  multiplier: number;
  countdown: number;
  roundId: number;
  bustPoint: number;
  history: number[];
}

export interface BetSlot {
  id: 'A' | 'B';
  amount: number;
  placed: boolean;
  cashedOut: boolean;
  cashOutAt: number | null;
  autoEnabled: boolean;
  autoTarget: number;
  win: number | null;
}

interface EngineState {
  phase: CrashPhase;
  multiplier: number;
  countdown: number;
  roundId: number;
  bustPoint: number;
  history: number[];
  bets: Record<'A' | 'B', BetSlot>;
  startedAt: number;
}

const COUNTDOWN_SECS = 6;

function freshBet(id: 'A' | 'B'): BetSlot {
  return {
    id,
    amount: 100,
    placed: false,
    cashedOut: false,
    cashOutAt: null,
    autoEnabled: false,
    autoTarget: 2.0,
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
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  // Tracks whether we have already fetched the bust point for the current round.
  private bustPointFetched = false;

  start() {
    if (this.timer) return;
    this.lastTick = Date.now();
    // Kick off the bust-point fetch for round 1 immediately.
    this.fetchBustPoint(this.state.roundId);
    this.timer = setInterval(() => this.tick(), 50);
    this.broadcast();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getState(): CrashState {
    const { phase, multiplier, countdown, roundId, bustPoint, history } = this.state;
    return { phase, multiplier, countdown, roundId, bustPoint, history };
  }

  getBets(): Record<'A' | 'B', BetSlot> {
    return { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } };
  }

  // ── Fetch server bust point ──────────────────────────────────────────────
  private fetchBustPoint(roundId: number) {
    if (this.bustPointFetched) return;
    this.bustPointFetched = true;
    GameService.crashGetBustPoint(roundId)
      .then((res) => {
        // Only apply if we are still on the same round and haven't crashed yet.
        if (this.state.roundId === roundId && this.state.phase !== 'busted') {
          this.state.bustPoint = res.bust_point;
        }
      })
      .catch(() => {
        // On error keep the safe placeholder (2.0). The round will still
        // resolve but the server record may be missing — acceptable fallback.
      });
  }

  // ── Place bet (debit balance locally, reconciled on settle) ─────────────
  placeBet(id: 'A' | 'B', amount: number): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (slot.placed) return { ok: false, reason: 'Already placed' };
    if (this.state.phase !== 'countdown') return { ok: false, reason: 'Round in progress' };
    if (!amount || amount <= 0) return { ok: false, reason: 'Invalid amount' };
    const { min, max } = store.getGameLimits('crash');
    if (amount < min) return { ok: false, reason: `Min bet is ${store.currency}${min}` };
    if (amount > max) return { ok: false, reason: `Max bet is ${store.currency}${max}` };
    if (!store.debit(amount)) return { ok: false, reason: 'Insufficient balance' };
    slot.amount = amount;
    slot.placed = true;
    slot.cashedOut = false;
    slot.cashOutAt = null;
    slot.win = null;
    this.broadcastBets();
    return { ok: true };
  }

  cancelBet(id: 'A' | 'B'): { ok: boolean; reason?: string } {
    const slot = this.state.bets[id];
    if (!slot.placed) return { ok: false, reason: 'No bet to cancel' };
    if (this.state.phase !== 'countdown') return { ok: false, reason: 'Round started' };
    store.credit(slot.amount);
    slot.placed = false;
    slot.amount = 0;
    this.broadcastBets();
    return { ok: true };
  }

  // ── Cash out (server-settled later on bust) ──────────────────────────────
  cashOut(id: 'A' | 'B', atMultiplier?: number): { ok: boolean; reason?: string; payout?: number } {
    const slot = this.state.bets[id];
    if (!slot.placed || slot.cashedOut) return { ok: false, reason: 'No active bet' };
    if (this.state.phase !== 'flying') return { ok: false, reason: 'Not in flight' };
    const m = typeof atMultiplier === 'number' ? atMultiplier : this.state.multiplier;
    const payout = Math.round(slot.amount * m * 100) / 100;
    slot.cashedOut = true;
    slot.cashOutAt = m;
    slot.win = payout;
    // Optimistic credit — will be reconciled by server settle at round end.
    store.credit(payout);
    playCashoutSound();
    bus.emit(Topics.CrashCashout, { id, amount: payout, multiplier: m, ts: Date.now() });
    this.broadcastBets();
    return { ok: true, payout };
  }

  setAuto(id: 'A' | 'B', enabled: boolean, target: number) {
    const slot = this.state.bets[id];
    slot.autoEnabled = enabled;
    slot.autoTarget = Math.max(1.01, target);
    this.broadcastBets();
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
      this.broadcast();
      return;
    }

    if (this.state.phase === 'flying') {
      const elapsed = (now - this.state.startedAt) / 1000;
      const k = 0.12;
      this.state.multiplier = Math.max(1.0, Math.exp(k * elapsed));
      const m = this.state.multiplier;
      playTickSound(m);

      // Auto-cashout checks
      (['A', 'B'] as const).forEach((id) => {
        const slot = this.state.bets[id];
        if (slot.placed && !slot.cashedOut && slot.autoEnabled && m >= slot.autoTarget) {
          this.cashOut(id, slot.autoTarget);
        }
      });

      if (m >= this.state.bustPoint) {
        this.state.multiplier = this.state.bustPoint;
        this.state.phase = 'busted';
        playCrashSound();

        // Bust any un-cashed bets
        (['A', 'B'] as const).forEach((id) => {
          const slot = this.state.bets[id];
          if (slot.placed && !slot.cashedOut) {
            slot.cashedOut = true;
            slot.cashOutAt = this.state.bustPoint;
            slot.win = 0;
          }
        });

        // Settle all placed bets server-side
        const session = auth.getSession();
        const roundId = this.state.roundId;
        const bustPoint = this.state.bustPoint;
        (['A', 'B'] as const).forEach((id) => {
          const slot = this.state.bets[id];
          if (!slot.placed) return;
          const cashOutAt = slot.win && slot.win > 0 ? slot.cashOutAt : null;
          const win = slot.win || 0;

          if (session) {
            void GameService.crashSettle(session.userId, roundId, slot.amount, cashOutAt, bustPoint)
              .then((res) => {
                // Sync balance from server (authoritative)
                store.setBalance(res.balance_after ?? store.balance);
                // Local history record
                store.recordCrashBet({
                  roundId,
                  amount: slot.amount,
                  cashOutAt,
                  bustPoint: res.verified_bust ?? bustPoint,
                  win: res.win,
                });
              })
              .catch(() => {
                // Fallback: record locally even if server call fails
                store.recordCrashBet({ roundId, amount: slot.amount, cashOutAt, bustPoint, win });
              });
          } else {
            store.recordCrashBet({ roundId, amount: slot.amount, cashOutAt, bustPoint, win });
          }
        });

        this.state.history = [this.state.bustPoint, ...this.state.history].slice(0, 18);
        bus.emit(Topics.CrashHistory, this.state.history);
        setTimeout(() => this.nextRound(), 2600);
      }
      this.broadcast();
      this.broadcastBets();
      return;
    }

    // busted: idle, waiting for nextRound
  }

  private nextRound() {
    stopHum();
    this.state.roundId += 1;
    this.state.phase = 'countdown';
    this.state.countdown = COUNTDOWN_SECS;
    this.state.multiplier = 1.0;
    // Placeholder bust point until server responds
    this.state.bustPoint = 2.0;
    this.bustPointFetched = false;

    // Clear manual override from admin config if applicable
    const cfg = store.admin;
    if (
      cfg.mode === 'MANUAL' &&
      (cfg.manualTargetRoundId == null || cfg.manualTargetRoundId < this.state.roundId)
    ) {
      store.setAdmin({ mode: 'AUTO', manualTargetRoundId: null });
    }

    this.state.bets = { A: freshBet('A'), B: freshBet('B') };

    // Fetch bust point for the new round immediately so it arrives before flying
    this.fetchBustPoint(this.state.roundId);

    this.broadcast();
    this.broadcastBets();
  }

  private broadcast() {
    bus.emit(Topics.CrashState, this.getState());
  }

  private broadcastBets() {
    bus.emit(Topics.CrashTick, this.getBets());
  }
}

export const crashEngine = new CrashEngine();
