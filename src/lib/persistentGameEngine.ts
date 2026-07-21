/**
 * Persistent background game engines for the auto-run games:
 * • Sun vs Moon
 * • Wingo
 * • K3
 * • 5D
 * • Aviator
 */

import { bus } from './bus';
import { globalRounds, store } from './store';
import { GameService } from './game-service';
import { auth } from './auth';

// Deterministic PRNG (mulberry32) — used by Wingo/K3/FiveD/SunMoon.
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
// Aviator — SERVER-DRIVEN shared round model (v2)
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
const AV_MAX_MULTIPLIER = 200;
const AV_POLL_INTERVAL_MS = 300;
const AV_HISTORY_CAP = 20;

/**
 * Multiplier at elapsed milliseconds.
 * Formula: m = e^(0.12 * t)  — matches Postgres RPC exp(0.12 * elapsed_ms/1000)
 */
function aviatorMultiplierAt(msElapsed: number): number {
  const t = msElapsed / 1000;
  return Math.max(1.0, Math.floor(Math.pow(Math.E, 0.12 * t) * 100) / 100);
}

class AviatorLoop {
  private phase: AviatorPhase = 'waiting';
  private phaseStart = Date.now();
  private roundId = 1;
  private roundUuid: string | null = null;
  private crashPoint: number | null = null;
  private history: number[] = [];
  private multiplier = 1;
  private lastCrash: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPollMs = 0;
  private bootstrapped = false;

  constructor() {
    void this.syncFromServer();
  }

  // ── Server sync ────────────────────────────────────────────────────────────

  private async syncFromServer(): Promise<void> {
    try {
      const res = await GameService.aviatorGetCurrentRound();
      this.applyServerState(res);

      if (!this.bootstrapped) {
        this.bootstrapped = true;
        try {
          const histRes = await GameService.aviatorGetHistory();
          if (histRes.history.length > 0 && this.history.length === 0) {
            this.history = histRes.history.slice(0, AV_HISTORY_CAP);
          }
        } catch {
          // Non-fatal — history bar will populate as rounds complete.
        }
      }
    } catch {
      // Non-fatal — keep running from local state until next poll.
    }
  }

  private applyServerState(res: {
    phase: 'waiting' | 'flying' | 'crashed';
    elapsed_ms: number;
    round_uuid: string | null;
    crash_point: number | null;
    last_crash_point?: number | null;
  }) {
    const now = Date.now();

    if (res.round_uuid && res.round_uuid !== this.roundUuid) {
      if (this.roundUuid !== null && res.phase === 'waiting') {
        this.roundId += 1;
      }
      this.roundUuid = res.round_uuid;
    }

    if (res.phase === 'crashed') {
      if (this.phase !== 'crashed') {
        const cp = res.crash_point ?? res.last_crash_point ?? AV_MAX_MULTIPLIER;
        this.handleCrash(cp, now - Math.min(res.elapsed_ms, AV_CRASH_HOLD_MS - 1));
      }
      this.phaseStart = now - res.elapsed_ms;
      return;
    }

    if (res.phase === 'flying') {
      if (this.phase === 'waiting' || this.phase === 'crashed') {
        this.phase = 'flying';
        this.multiplier = aviatorMultiplierAt(res.elapsed_ms);
      }
      this.phaseStart = now - res.elapsed_ms;
      this.crashPoint = null;
      return;
    }

    if (res.phase === 'waiting') {
      if (this.phase === 'crashed') {
        const cp = res.last_crash_point;
        if (cp !== null && cp !== undefined && cp !== this.lastCrash) {
          this.history = [cp, ...this.history].slice(0, AV_HISTORY_CAP);
          this.lastCrash = cp;
        }
        this.phase = 'waiting';
        this.multiplier = 1.0;
        this.crashPoint = null;
        this.lastCrash = null;
      }
      this.phaseStart = now - res.elapsed_ms;
      return;
    }
  }

  // ── Local tick (50ms) ──────────────────────────────────────────────────────

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

  getRoundUuid(): string | null { return this.roundUuid; }

  /**
   * Cash out the current bet at the given multiplier.
   *
   * @param betAmount  - Original bet amount
   * @param placedAtMs - Timestamp when bet was placed (ms)
   * @param multiplier - Multiplier to cash out at
   * @param betId      - Server-assigned bet ID (from aviatorPlaceBet). When
   *                     provided, the server looks up the bet directly by ID
   *                     which is far more reliable than the round_uuid fallback.
   */
  cashoutBet(
    betAmount: number,
    placedAtMs: number,
    multiplier: number,
    betId?: string | null,
  ): Promise<import('./game-service').AviatorCashoutResult> {
    const session = auth.getSession();
    if (!session) return Promise.reject(new Error('Not authenticated'));
    return GameService.aviatorCashout(
      session.userId,
      this.roundUuid,
      this.roundId,
      betAmount,
      multiplier,
      betId ?? null,
    );
  }

  private tick() {
    const now = Date.now();
    const elapsed = now - this.phaseStart;

    if (now - this.lastPollMs >= AV_POLL_INTERVAL_MS) {
      this.lastPollMs = now;
      void this.syncFromServer();
    }

    if (this.phase === 'waiting') {
      if (elapsed >= AV_WAIT_MS) {
        this.phase = 'flying';
        this.phaseStart = now;
        this.multiplier = 1.0;
      }
    } else if (this.phase === 'flying') {
      const m = aviatorMultiplierAt(elapsed);
      if (m >= AV_MAX_MULTIPLIER) {
        this.handleCrash(AV_MAX_MULTIPLIER, now);
      } else {
        this.multiplier = m;
      }
    } else if (this.phase === 'crashed') {
      if (elapsed >= AV_CRASH_HOLD_MS + 500) {
        this.phase = 'waiting';
        this.phaseStart = now;
        this.multiplier = 1.0;
        this.lastCrash = null;
        this.crashPoint = null;
      }
    }

    bus.emit('engine:aviator:state', this.getState());
  }

  private handleCrash(crashAt: number, phaseStartOverride?: number) {
    this.phase = 'crashed';
    this.phaseStart = phaseStartOverride ?? Date.now();
    this.multiplier = crashAt;
    this.lastCrash = crashAt;
    this.crashPoint = crashAt;
    this.history = [crashAt, ...this.history].slice(0, AV_HISTORY_CAP);
    bus.emit('engine:aviator:state', this.getState());
  }

  reportServerCrash(serverCrashPoint: number) {
    if (this.phase !== 'flying') return;
    this.handleCrash(serverCrashPoint);
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
