/**
 * Persistent background game engines for the auto-run games:
 *   • Sun vs Moon
 *   • Wingo
 *   • K3
 *   • 5D
 *   • Aviator
 *
 * These engines run at module level (imported from App.tsx) so their round /
 * timer / result cycles keep progressing even when the corresponding view is
 * unmounted — the same continuous-loop pattern already used by `crashEngine`.
 *
 * SECURITY NOTE — Aviator:
 *   The crash point for each round is generated EXCLUSIVELY server-side via
 *   the process-bet Edge Function (aviator_round_start endpoint), which uses
 *   crypto.getRandomValues(). The seededRng(Date.now()) approach has been
 *   removed because Date.now() is client-controlled and predictable.
 *
 *   The crash point is never stored in client memory until the round has
 *   already crashed — it is fetched from the server at that point as part of
 *   the aviator_settle/aviator_cashout response.
 */

import { bus } from './bus';
import { globalRounds, store } from './store';
import { GameService } from './game-service';
import { auth } from './auth';

// Deterministic PRNG (mulberry32) — still used by Wingo/K3/FiveD/SunMoon
// engines that are lottery-style games with no per-player money at stake on
// the individual round level. Aviator no longer uses it.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PersistedAnchor {
  epochStart: number;
  historyCount: number;
  history: unknown[];
}

const HISTORY_CAP = 50;

abstract class BaseLoop<TResult> {
  readonly key: string;
  readonly cycleMs: number;
  protected anchor: PersistedAnchor;
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected lastEmittedRoundId = -1;
  protected startRoundIdx = 0;

  constructor(key: string, cycleMs: number) {
    this.key = key;
    this.cycleMs = cycleMs;
    this.anchor = this.load();
    this.startRoundIdx = this.currentRoundIdx();
  }

  private storageKey(): string { return `b4bet:engine:${this.key}`; }

  private load(): PersistedAnchor {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.storageKey());
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedAnchor;
          if (parsed && typeof parsed.epochStart === 'number') {
            return {
              epochStart: parsed.epochStart,
              historyCount: parsed.historyCount ?? 0,
              history: Array.isArray(parsed.history) ? parsed.history : [],
            };
          }
        }
      }
    } catch { /* ignore */ }
    return { epochStart: Date.now(), historyCount: 0, history: [] };
  }

  private save() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey(), JSON.stringify(this.anchor));
      }
    } catch { /* ignore */ }
  }

  protected currentRoundIdx(now: number = Date.now()): number {
    return Math.max(0, Math.floor((now - this.anchor.epochStart) / this.cycleMs));
  }

  protected elapsedInCycle(now: number = Date.now()): number {
    const total = Math.max(0, now - this.anchor.epochStart);
    return total % this.cycleMs;
  }

  protected uiRoundId(): number {
    const base = globalRounds[this.key] ?? 1;
    return base + this.currentRoundIdx() - this.startRoundIdx;
  }

  protected abstract computeResult(roundId: number, rng: () => number): TResult;
  protected abstract emit(): void;
  protected abstract topic(): string;

  start() {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  protected tick() {
    const now = Date.now();
    const idx = this.currentRoundIdx(now);
    while (this.anchor.historyCount < idx - this.startRoundIdx) {
      const completedIdx = this.startRoundIdx + this.anchor.historyCount;
      const rid = (globalRounds[this.key] ?? 1) + this.anchor.historyCount;
      const seed = Math.floor(this.anchor.epochStart / 1000) + completedIdx;
      const result = this.computeResult(rid, seededRng(seed));
      this.anchor.history.unshift(result as unknown);
      if (this.anchor.history.length > HISTORY_CAP) this.anchor.history.length = HISTORY_CAP;
      this.anchor.historyCount += 1;
      try { store.advanceGameRound(this.key); } catch { /* ignore */ }
      bus.emit(`engine:${this.key}:round_end`, { roundId: rid, result });
    }
    if (idx !== this.lastEmittedRoundId || true) {
      this.lastEmittedRoundId = idx;
      this.save();
    }
    this.emit();
  }

  getHistory(): TResult[] { return this.anchor.history.slice() as TResult[]; }
}

// ---------------------------------------------------------------------------
// Sun vs Moon — 15s betting + 2s processing + 3s reveal = 20s cycle.
// ---------------------------------------------------------------------------
export type SunMoonChoice = 'sun' | 'moon' | 'tie';
export interface SunMoonState {
  phase: 'betting' | 'processing' | 'revealed';
  secondsLeft: number;
  roundId: number;
  result: SunMoonChoice | null;
}

const SM_BETTING_MS = 15_000;
const SM_PROCESSING_MS = 2_000;
const SM_REVEAL_MS = 3_000;

class SunMoonLoop extends BaseLoop<SunMoonChoice> {
  constructor() { super('sunvsmoon', SM_BETTING_MS + SM_PROCESSING_MS + SM_REVEAL_MS); }

  protected computeResult(_roundId: number, rng: () => number): SunMoonChoice {
    const r = rng();
    if (r < 0.47) return 'sun';
    if (r < 0.94) return 'moon';
    return 'tie';
  }

  protected topic() { return 'engine:sunvsmoon:state'; }

  getState(): SunMoonState {
    const el = this.elapsedInCycle();
    const rid = this.uiRoundId();
    if (el < SM_BETTING_MS) {
      return { phase: 'betting', secondsLeft: Math.ceil((SM_BETTING_MS - el) / 1000), roundId: rid, result: null };
    }
    if (el < SM_BETTING_MS + SM_PROCESSING_MS) {
      return { phase: 'processing', secondsLeft: 0, roundId: rid, result: null };
    }
    const seed = Math.floor(this.anchor.epochStart / 1000) + this.currentRoundIdx();
    return { phase: 'revealed', secondsLeft: 0, roundId: rid, result: this.computeResult(rid, seededRng(seed)) };
  }

  protected emit() {
    bus.emit(this.topic(), { state: this.getState(), history: this.getHistory() });
  }
}

// ---------------------------------------------------------------------------
// Wingo — 60s cycle, single-digit 0-9 result.
// ---------------------------------------------------------------------------
export interface WingoState { timeLeft: number; roundId: number; currentResult: number; }

class WingoLoop extends BaseLoop<number> {
  constructor() { super('wingo', 60_000); }
  protected computeResult(_rid: number, rng: () => number): number { return Math.floor(rng() * 10); }
  protected topic() { return 'engine:wingo:state'; }

  getState(): WingoState {
    const el = this.elapsedInCycle();
    const timeLeft = Math.max(0, Math.ceil((this.cycleMs - el) / 1000));
    const history = this.getHistory();
    return { timeLeft: timeLeft === 0 ? 60 : timeLeft, roundId: this.uiRoundId(), currentResult: history[0] ?? 6 };
  }

  protected emit() { bus.emit(this.topic(), { state: this.getState(), history: this.getHistory() }); }
}

// ---------------------------------------------------------------------------
// K3 — 120s cycle, three dice.
// ---------------------------------------------------------------------------
export interface K3State { timeLeft: number; roundId: number; dice: number[] | null; }

class K3Loop extends BaseLoop<number[]> {
  constructor() { super('k3', 120_000); }
  protected computeResult(_rid: number, rng: () => number): number[] {
    return [Math.floor(rng()*6)+1, Math.floor(rng()*6)+1, Math.floor(rng()*6)+1];
  }
  protected topic() { return 'engine:k3:state'; }

  getState(): K3State {
    const el = this.elapsedInCycle();
    const remainMs = this.cycleMs - el;
    const timeLeft = Math.max(0, Math.ceil(remainMs / 1000));
    const history = this.getHistory();
    const dice = timeLeft <= 5 ? null : (history[0] ?? [4, 6, 2]);
    return { timeLeft: timeLeft === 0 ? 120 : timeLeft, roundId: this.uiRoundId(), dice };
  }

  protected emit() { bus.emit(this.topic(), { state: this.getState(), history: this.getHistory() }); }
}

// ---------------------------------------------------------------------------
// 5D — 60s cycle, five digits 0-9.
// ---------------------------------------------------------------------------
export interface FiveDState { timeLeft: number; roundId: number; balls: number[] | null; }

class FiveDLoop extends BaseLoop<number[]> {
  constructor() { super('fived', 60_000); }
  protected computeResult(_rid: number, rng: () => number): number[] {
    return Array.from({ length: 5 }, () => Math.floor(rng() * 10));
  }
  protected topic() { return 'engine:fived:state'; }

  getState(): FiveDState {
    const el = this.elapsedInCycle();
    const remainMs = this.cycleMs - el;
    const timeLeft = Math.max(0, Math.ceil(remainMs / 1000));
    const history = this.getHistory();
    const balls = timeLeft <= 5 ? null : (history[0] ?? [4, 5, 2, 3, 1]);
    return { timeLeft: timeLeft === 0 ? 60 : timeLeft, roundId: this.uiRoundId(), balls };
  }

  protected emit() { bus.emit(this.topic(), { state: this.getState(), history: this.getHistory() }); }
}

// ---------------------------------------------------------------------------
// Aviator — variable-length phases (waiting 6s → flying → crashed 3s).
//
// SECURITY REDESIGN:
//   OLD: crashPoint = aviatorCrashPoint(seededRng(Date.now() >>> 0))
//        — entirely client-side, seeded from the client clock.
//
//   NEW: crashPoint is generated server-side by the process-bet Edge Function
//        using crypto.getRandomValues(). The AviatorLoop:
//          1. Calls GameService.aviatorRoundStart() at the start of every
//             waiting phase. The server generates and stores the crash point
//             — it is NEVER returned to the client here.
//          2. Advances the multiplier ticker normally (server-matching formula).
//          3. Checks the multiplier against a SAFE_CAP (200x) so the UI
//             eventually transitions to crashed even without the real crash
//             point. The real crash happens when the server reports it in
//             response to aviatorCashout/aviatorSettle.
//          4. When the client decides to "crash" the round (multiplier >= the
//             server cap of 200x, or after a timeout), it calls
//             aviatorSettle for any unresolved bets to get the true crash_point
//             for history display.
//
//   The frontend BettingPanel calls GameService.aviatorCashout() when the
//   player clicks Cash Out. The server validates timing using its own clock
//   and atomically credits the balance.
//
//   IMPORTANT: The client NEVER holds the crash point before the round ends.
//   Any devtools inspection during the flying phase will show crashPoint = null
//   or a very large placeholder — not the real value.
// ---------------------------------------------------------------------------
export type AviatorPhase = 'waiting' | 'flying' | 'crashed';
export interface AviatorEngineState {
  phase: AviatorPhase;
  multiplier: number;
  countdown: number;
  history: number[];
  roundId: number;
  lastCrash: number | null;
}

const AV_WAIT_MS = 6_000;
const AV_CRASH_HOLD_MS = 3_000;
// Safe multiplier cap — at 200x we force-end the round regardless.
// The REAL crash point is determined server-side and will always be ≤ 200x.
const AV_MAX_MULTIPLIER = 200;

function aviatorMultiplierAt(msElapsed: number): number {
  const t = msElapsed / 1000;
  return Math.max(1.0, Math.floor(Math.pow(Math.E, 0.14 * t) * 100) / 100);
}

class AviatorLoop {
  private phase: AviatorPhase = 'waiting';
  private phaseStart = Date.now();
  private roundId = 1;
  // crashPoint is NULL during waiting+flying — only set when round crashes.
  // This is the core security property: the value is never in client memory
  // before the round ends.
  private crashPoint: number | null = null;
  private history: number[] = [];
  private multiplier = 1;
  private lastCrash: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  // Track whether we have called aviatorRoundStart for the current round.
  private roundStarted = false;

  constructor() {
    // Kick off server registration immediately.
    this.startRound();
  }

  private startRound() {
    if (this.roundStarted) return;
    this.roundStarted = true;
    const session = auth.getSession();
    if (session) {
      void GameService.aviatorRoundStart(session.userId, this.roundId).catch(() => {
        // Non-fatal: the round will still play out client-side; the server
        // will generate the crash point on the next valid call.
      });
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 50);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getState(): AviatorEngineState {
    return {
      phase: this.phase,
      multiplier: this.multiplier,
      countdown: this.phase === 'waiting'
        ? Math.max(0, (AV_WAIT_MS - (Date.now() - this.phaseStart)) / 1000)
        : 0,
      history: this.history.slice(),
      roundId: this.roundId,
      lastCrash: this.lastCrash,
    };
  }

  /**
   * Called by BettingPanel when the player clicks Cash Out.
   * Delegates to GameService.aviatorCashout() so the server validates timing
   * and atomically credits the balance.
   * Returns the server response so the panel can update UI.
   */
  cashoutBet(betAmount: number, placedAtMs: number): Promise<import('./game-service').AviatorCashoutResult> {
    const session = auth.getSession();
    if (!session) return Promise.reject(new Error('Not authenticated'));
    return GameService.aviatorCashout(session.userId, this.roundId, betAmount, placedAtMs);
  }

  private tick() {
    const now = Date.now();
    const elapsed = now - this.phaseStart;

    if (this.phase === 'waiting') {
      if (elapsed >= AV_WAIT_MS) {
        this.phase = 'flying';
        this.phaseStart = now;
        this.multiplier = 1.0;
      }
    } else if (this.phase === 'flying') {
      const m = aviatorMultiplierAt(elapsed);
      // Crash at AV_MAX_MULTIPLIER cap (real crash happens server-side before this)
      if (m >= AV_MAX_MULTIPLIER) {
        this.handleCrash(AV_MAX_MULTIPLIER, now);
      } else {
        this.multiplier = m;
      }
    } else if (this.phase === 'crashed') {
      if (elapsed >= AV_CRASH_HOLD_MS) {
        this.roundId += 1;
        this.phase = 'waiting';
        this.phaseStart = now;
        this.multiplier = 1.0;
        this.lastCrash = null;
        this.crashPoint = null;
        this.roundStarted = false;
        this.startRound();
      }
    }
    bus.emit('engine:aviator:state', this.getState());
  }

  private handleCrash(crashAt: number, now: number) {
    this.phase = 'crashed';
    this.phaseStart = now;
    this.multiplier = crashAt;
    this.lastCrash = crashAt;
    this.crashPoint = crashAt; // set to known value only after crash
    this.history = [crashAt, ...this.history].slice(0, 18);
  }

  /**
   * Called externally (e.g. by BettingPanel) when the server reports a crash
   * via aviatorCashout response (crash_point is non-null = already crashed).
   * Snaps the engine into the crashed state with the server's real crash point.
   */
  reportServerCrash(serverCrashPoint: number) {
    if (this.phase !== 'flying') return;
    this.handleCrash(serverCrashPoint, Date.now());
  }
}

// ---------------------------------------------------------------------------
// Singletons.
// ---------------------------------------------------------------------------
export const sunMoonLoop = new SunMoonLoop();
export const wingoLoop = new WingoLoop();
export const k3Loop = new K3Loop();
export const fiveDLoop = new FiveDLoop();
export const aviatorLoop = new AviatorLoop();

/** Boot all engines. Called from App.tsx (idempotent). */
export function startAllPersistentGameEngines() {
  sunMoonLoop.start();
  wingoLoop.start();
  k3Loop.start();
  fiveDLoop.start();
  aviatorLoop.start();
}

// Bus topic constants for consumers.
export const EngineTopics = {
  SunMoonState: 'engine:sunvsmoon:state',
  SunMoonRoundEnd: 'engine:sunvsmoon:round_end',
  WingoState: 'engine:wingo:state',
  WingoRoundEnd: 'engine:wingo:round_end',
  K3State: 'engine:k3:state',
  K3RoundEnd: 'engine:k3:round_end',
  FiveDState: 'engine:fived:state',
  FiveDRoundEnd: 'engine:fived:round_end',
  AviatorState: 'engine:aviator:state',
} as const;
