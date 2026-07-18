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
 * SECURITY: AviatorLoop no longer computes the crash point client-side.
 * It calls `aviatorInit(roundId)` on the process-bet edge function at round
 * start to generate a cryptographically secure crash point server-side.
 * The crash point is NEVER present in client memory until the round actually
 * crashes. The server validates all cashout requests against the stored value.
 */

import { bus } from './bus';
import { globalRounds, store } from './store';
import { aviatorInit } from './processBetApi';

// Deterministic PRNG — only used for non-money display games (Wingo, K3, 5D, SunVsMoon timer).
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
            return { epochStart: parsed.epochStart, historyCount: parsed.historyCount ?? 0, history: Array.isArray(parsed.history) ? parsed.history : [] };
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
// Aviator — server-side crash point, client is display-only.
//
// SECURITY MODEL:
//   1. When a new round starts, aviatorInit(roundId) is called on the server.
//      The server generates the crash point with crypto.getRandomValues() and
//      stores it in `aviator_rounds`. The crash_point column is protected by
//      RLS: clients can only read it AFTER ended_at is set (round over).
//   2. The client drives the multiplier animation with aviatorMultiplierAt().
//      It does NOT know when to stop — it compares against a locally-unknown
//      crash point. Instead it advances until the server confirms a bust.
//   3. Cash-outs are sent to `aviator_cashout`. The server checks
//      cash_out_at < crash_point; if not, the bet is already lost.
//   4. When the client-side multiplier would naturally exceed any reasonable
//      crash point (200x), it calls `aviatorBust(roundId)` on the server to
//      settle remaining bets and reveal the crash point.
//
// HOW BUST DETECTION WORKS WITHOUT CLIENT KNOWING CRASH POINT:
//   The server periodically emits the real crash point via Supabase Realtime
//   postgres_changes on `aviator_rounds` (ended_at IS SET). The client
//   subscribes and crashes the round as soon as it receives the ended_at
//   event. In the absence of a realtime event (e.g. polling mode) the client
//   falls back to busting at 200x maximum.
// ---------------------------------------------------------------------------
export type AviatorPhase = 'waiting' | 'flying' | 'crashed';
export interface AviatorEngineState {
  phase: AviatorPhase;
  multiplier: number;
  countdown: number;
  history: number[];
  roundId: number;
  lastCrash: number | null;
  // Server-revealed crash point (only set AFTER the round has ended)
  revealedCrashPoint: number | null;
}

const AV_WAIT_MS = 6_000;
const AV_CRASH_HOLD_MS = 3_000;
// Safety cap: no real Aviator round should last beyond 200x
const AV_MAX_MULTIPLIER = 200;

function aviatorMultiplierAt(msElapsed: number): number {
  const t = msElapsed / 1000;
  return Math.max(1.0, Math.floor(Math.pow(Math.E, 0.14 * t) * 100) / 100);
}

class AviatorLoop {
  private phase: AviatorPhase = 'waiting';
  private phaseStart = Date.now();
  private roundId = 1;
  private history: number[] = [];
  private multiplier = 1;
  private lastCrash: number | null = null;
  // The actual crash point is ONLY known to the server. This field is null
  // during 'waiting' and 'flying' and is only populated after the server
  // ends the round (via Realtime or explicit aviatorBust call).
  private revealedCrashPoint: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  // Track server init state to avoid duplicate calls
  private serverInitialisedRound = -1;
  // Realtime channel for bust notifications
  private realtimeChannel: ReturnType<typeof import('@/integrations/supabase/client').supabase.channel> | null = null;

  constructor() {
    // Subscribe to Supabase Realtime for aviator_rounds ended_at updates.
    // When the server ends a round, this fires and we crash immediately.
    void this.subscribeRealtime();
  }

  private async subscribeRealtime() {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      this.realtimeChannel = supabase
        .channel('aviator_round_bust')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'aviator_rounds' },
          (evt) => {
            const row = evt.new as { round_id: number; crash_point: number; ended_at: string | null };
            if (row.ended_at && row.round_id === this.roundId && this.phase === 'flying') {
              // Server confirmed bust — crash at the real crash_point
              this.doCrash(row.crash_point);
            }
          },
        )
        .subscribe();
    } catch { /* ignore in SSR / test environments */ }
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
      revealedCrashPoint: this.revealedCrashPoint,
    };
  }

  private tick() {
    const now = Date.now();
    const elapsed = now - this.phaseStart;

    if (this.phase === 'waiting') {
      // Initialise the round server-side as soon as waiting starts
      if (this.serverInitialisedRound !== this.roundId) {
        this.serverInitialisedRound = this.roundId;
        void aviatorInit(this.roundId).catch((err: unknown) => {
          console.warn('[AviatorLoop] aviatorInit failed:', err);
        });
      }
      if (elapsed >= AV_WAIT_MS) {
        this.phase = 'flying';
        this.phaseStart = now;
        this.multiplier = 1.0;
        this.revealedCrashPoint = null;
      }
    } else if (this.phase === 'flying') {
      const m = aviatorMultiplierAt(elapsed);
      this.multiplier = m;

      // Safety cap: if we reach 200x without the server crashing us,
      // trigger bust ourselves.
      if (m >= AV_MAX_MULTIPLIER) {
        void this.triggerServerBust();
      }
      // Note: actual crash is triggered by Realtime update from the server.
      // Client NEVER checks m >= crashPoint because it doesn't know crashPoint.
    } else if (this.phase === 'crashed') {
      if (elapsed >= AV_CRASH_HOLD_MS) {
        this.roundId += 1;
        this.phase = 'waiting';
        this.phaseStart = now;
        this.multiplier = 1.0;
        this.lastCrash = null;
        this.revealedCrashPoint = null;
      }
    }
    bus.emit('engine:aviator:state', this.getState());
  }

  private doCrash(crashPoint: number) {
    this.multiplier = crashPoint;
    this.phase = 'crashed';
    this.phaseStart = Date.now();
    this.lastCrash = crashPoint;
    this.revealedCrashPoint = crashPoint;
    this.history = [crashPoint, ...this.history].slice(0, 18);
    bus.emit('engine:aviator:state', this.getState());
  }

  private async triggerServerBust() {
    // Only call once per round
    if (this.phase !== 'flying') return;
    try {
      const { aviatorBust } = await import('./processBetApi');
      const result = await aviatorBust(this.roundId);
      this.doCrash(result.crash_point);
    } catch (err: unknown) {
      console.warn('[AviatorLoop] aviatorBust failed:', err);
      // Fallback: crash at current multiplier so the round doesn't freeze
      this.doCrash(this.multiplier);
    }
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
