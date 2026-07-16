// Real-time Crash engine. Drives the multiplier loop, computes crash points
// based on admin config (auto win-probability or manual override), and manages
// dual independent bets with auto-cashout. Emits state via the event bus.

import { bus, Topics } from './bus';
import { store } from './store';

// Real-audio hooks — synthesised via WebAudio, gated by user Sound toggle.
import { sfx, startHum, updateHum, stopHum } from './crashAudio';
function playStartSound() { sfx.start(); startHum(); }
function playTickSound(m: number) { updateHum(m); }
function playCrashSound() { stopHum(); sfx.crash(); }
function playCashoutSound() { sfx.cashout(); }

export type CrashPhase = 'countdown' | 'flying' | 'busted';

/** Emitted on Topics.CrashCashout when a player cashes out. */
export interface CashoutEvent {
  id: string;       // unique event id
  amount: number;   // payout credited
  multiplier: number;
  ts: number;
}

export interface CrashState {
  phase: CrashPhase;
  multiplier: number;
  countdown: number; // seconds remaining when phase === countdown
  roundId: number;
  bustPoint: number;
  history: number[];
}

export interface BetSlot {
  id: 'A' | 'B';
  amount: number;
  placed: boolean; // bet is locked in for the current/next round
  cashedOut: boolean;
  cashOutAt: number | null; // multiplier at which user cashed out
  autoEnabled: boolean;
  autoTarget: number;
  win: number | null; // payout (0 if busted)
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

function computeBustPoint(roundId: number): number {
  const cfg = store.admin;
  // Manual override applies only on the targeted round (or next round if null).
  const applyManual =
    cfg.mode === 'MANUAL' &&
    (cfg.manualTargetRoundId == null || cfg.manualTargetRoundId === roundId);
  if (applyManual) {
    return Math.max(1.01, cfg.manualCrashPoint);
  }
  const p = Math.min(99, Math.max(1, cfg.targetWinProbability)) / 100;
  const instantBust = Math.random() < (1 - p) * 0.12;
  if (instantBust) return 1 + Math.random() * 0.05;
  const edge = Math.max(0.01, cfg.houseEdge / 100);
  const r = Math.random();
  const u = Math.max(0.0001, 1 - r);
  const raw = (1 / (u * (1 - edge))) * (0.5 + p);
  return Math.max(1.01, Math.min(1000, Math.round(raw * 100) / 100));
}

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
    bustPoint: computeBustPoint(1),
    history: [],
    bets: { A: freshBet('A'), B: freshBet('B') },
    startedAt: Date.now(),
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;

  start() {
    if (this.timer) return;
    this.lastTick = Date.now();
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

  cashOut(id: 'A' | 'B', atMultiplier?: number): { ok: boolean; reason?: string; payout?: number } {
    const slot = this.state.bets[id];
    if (!slot.placed || slot.cashedOut) return { ok: false, reason: 'No active bet' };
    if (this.state.phase !== 'flying') return { ok: false, reason: 'Not in flight' };
    // Use the exact override multiplier when supplied (e.g. auto-cashout target)
    // so 2.00x doesn't overshoot to 2.01x due to tick granularity.
    const m = typeof atMultiplier === 'number' ? atMultiplier : this.state.multiplier;
    const payout = Math.round(slot.amount * m * 100) / 100;
    slot.cashedOut = true;
    slot.cashOutAt = m;
    slot.win = payout;
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
      // Compounding non-linear growth.
      const elapsed = (now - this.state.startedAt) / 1000;
      // multiplier = 1.0 * e^(k*elapsed), k tuned for ~6s to reach 2x
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
        // Bust any un-cashed bets + record placed bets to user history.
        (['A', 'B'] as const).forEach((id) => {
          const slot = this.state.bets[id];
          if (slot.placed && !slot.cashedOut) {
            slot.cashedOut = true;
            slot.cashOutAt = this.state.bustPoint;
            slot.win = 0;
          }
          if (slot.placed) {
            store.recordCrashBet({
              roundId: this.state.roundId,
              amount: slot.amount,
              cashOutAt: slot.win && slot.win > 0 ? slot.cashOutAt : null,
              bustPoint: this.state.bustPoint,
              win: slot.win || 0,
            });
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
    this.state.bustPoint = computeBustPoint(this.state.roundId);
    // Manual one-shot: if the just-played round consumed the manual target,
    // flip back to AUTO and clear the target so subsequent rounds are normal.
    const cfg = store.admin;
    if (
      cfg.mode === 'MANUAL' &&
      (cfg.manualTargetRoundId == null || cfg.manualTargetRoundId < this.state.roundId)
    ) {
      store.setAdmin({ mode: 'AUTO', manualTargetRoundId: null });
    }
    this.state.bets = { A: freshBet('A'), B: freshBet('B') };
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
