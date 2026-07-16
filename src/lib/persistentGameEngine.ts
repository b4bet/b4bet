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
 * unmounted — the same continuous-loop pattern already used by
 * `crashEngine`. State is anchored to a persisted wall-clock timestamp in
 * localStorage so a page reload snaps back to the correct round & phase
 * (i.e. "server-like" continuity from the client's point of view — no new
 * database or external service is introduced).
 *
 * NOTE: Nothing here modifies existing base game logic. Each per-game view
 * subscribes to its engine for the shared *timer / round / result* state,
 * but the bet-placement, payout math, and history-recording flow that was
 * already in every view is preserved verbatim.
 */

import { bus } from './bus';
import { globalRounds, store } from './store';

// Deterministic PRNG (mulberry32) — lets us regenerate a round's result
// after a reload without ever storing that result before its cycle ends.
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
  epochStart: number;   // wall-clock ms at round 0 boundary
  historyCount: number; // number of completed rounds recorded via the engine
  history: unknown[];   // most-recent-first, capped
}

const HISTORY_CAP = 50;

abstract class BaseLoop<TResult> {
  readonly key: string;
  readonly cycleMs: number;
  protected anchor: PersistedAnchor;
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected lastEmittedRoundId = -1;
  /** Round index at which the anchor was last saved / booted. Everything
   *  before this is considered "already recorded". */
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

  /** Base round id shown in the UI — combines the initial per-game round
   *  from `store.getGameRound(key)` with how many cycles have advanced. */
  protected uiRoundId(): number {
    const base = globalRounds[this.key] ?? 1;
    return base + this.currentRoundIdx() - this.startRoundIdx;
  }

  protected abstract computeResult(roundId: number, rng: () => number): TResult;
  protected abstract emit(): void;
  protected abstract topic(): string;

  start() {
    if (this.timer) return;
    // Emit once immediately on boot so any view that mounts right after
    // gets the current state.
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
    // Detect crossed cycle boundaries — finalise all rounds whose end has
    // passed since the last tick (usually just one, but a background /
    // suspended tab may resume with many).
    while (this.anchor.historyCount < idx - this.startRoundIdx) {
      const completedIdx = this.startRoundIdx + this.anchor.historyCount;
      const rid = (globalRounds[this.key] ?? 1) + this.anchor.historyCount;
      const seed = Math.floor(this.anchor.epochStart / 1000) + completedIdx;
      const result = this.computeResult(rid, seededRng(seed));
      this.anchor.history.unshift(result as unknown);
      if (this.anchor.history.length > HISTORY_CAP) this.anchor.history.length = HISTORY_CAP;
      this.anchor.historyCount += 1;
      // Mirror advancement into the existing store round counter so any
      // consumer that still reads `store.getGameRound(key)` stays in sync.
      try { store.advanceGameRound(this.key); } catch { /* ignore */ }
      // Notify listeners about the completed round + its result.
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
      return {
        phase: 'betting',
        secondsLeft: Math.ceil((SM_BETTING_MS - el) / 1000),
        roundId: rid,
        result: null,
      };
    }
    if (el < SM_BETTING_MS + SM_PROCESSING_MS) {
      return { phase: 'processing', secondsLeft: 0, roundId: rid, result: null };
    }
    // Reveal phase — result is deterministic from cycle seed.
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
export interface WingoState {
  timeLeft: number;      // seconds remaining until round end
  roundId: number;
  currentResult: number; // last completed round's digit (for display)
}

class WingoLoop extends BaseLoop<number> {
  constructor() { super('wingo', 60_000); }
  protected computeResult(_rid: number, rng: () => number): number { return Math.floor(rng() * 10); }
  protected topic() { return 'engine:wingo:state'; }

  getState(): WingoState {
    const el = this.elapsedInCycle();
    const timeLeft = Math.max(0, Math.ceil((this.cycleMs - el) / 1000));
    const history = this.getHistory();
    return {
      timeLeft: timeLeft === 0 ? 60 : timeLeft,
      roundId: this.uiRoundId(),
      currentResult: history[0] ?? 6,
    };
  }

  protected emit() {
    bus.emit(this.topic(), { state: this.getState(), history: this.getHistory() });
  }
}

// ---------------------------------------------------------------------------
// K3 — 120s cycle, three dice.
// ---------------------------------------------------------------------------
export interface K3State {
  timeLeft: number;
  roundId: number;
  dice: number[] | null; // null while locked (last 5s) — matches original UX
}

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
    // Match original view: dice hidden during last 5 seconds ("Waiting…").
    const dice = timeLeft <= 5 ? null : (history[0] ?? [4, 6, 2]);
    return { timeLeft: timeLeft === 0 ? 120 : timeLeft, roundId: this.uiRoundId(), dice };
  }

  protected emit() {
    bus.emit(this.topic(), { state: this.getState(), history: this.getHistory() });
  }
}

// ---------------------------------------------------------------------------
// 5D — 60s cycle, five digits 0-9.
// ---------------------------------------------------------------------------
export interface FiveDState {
  timeLeft: number;
  roundId: number;
  balls: number[] | null;
}

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

  protected emit() {
    bus.emit(this.topic(), { state: this.getState(), history: this.getHistory() });
  }
}

// ---------------------------------------------------------------------------
// Aviator — variable-length phases (waiting 6s → flying → crashed 3s). We
// still run a single background loop and expose observable state so the view
// can subscribe instead of running its own render-loop.
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

function aviatorCrashPoint(rng: () => number): number {
  const r = rng();
  if (r < 0.03) return 1.0;
  const raw = 0.97 / (1 - r);
  return Math.min(200, Math.max(1.0, Math.floor(raw * 100) / 100));
}
function aviatorMultiplierAt(msElapsed: number): number {
  const t = msElapsed / 1000;
  return Math.max(1.0, Math.floor(Math.pow(Math.E, 0.14 * t) * 100) / 100);
}

class AviatorLoop {
  private phase: AviatorPhase = 'waiting';
  private phaseStart = Date.now();
  private roundId = 1;
  private crashPoint = 1;
  private history: number[] = [];
  private multiplier = 1;
  private lastCrash: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Seed initial crash point deterministically per boot round.
    this.crashPoint = aviatorCrashPoint(seededRng(Date.now() >>> 0));
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
      if (m >= this.crashPoint) {
        this.phase = 'crashed';
        this.phaseStart = now;
        this.multiplier = this.crashPoint;
        this.lastCrash = this.crashPoint;
        this.history = [this.crashPoint, ...this.history].slice(0, 18);
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
        this.crashPoint = aviatorCrashPoint(seededRng((Date.now() ^ this.roundId) >>> 0));
      }
    }
    bus.emit('engine:aviator:state', this.getState());
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
