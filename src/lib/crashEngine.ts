// crashEngine.ts — SERVER-SYNCED shared crash round.
// Client polls crash_current_round every 300ms.
// On startup, loads last 20 rounds from server for history bar.
// IMPORTANT: getState() and getBets() MUST exist — hooks.ts calls them as initial values.

import { bus, Topics } from './bus';
import { store } from './store';
import { GameService } from './game-service';
import { auth } from './auth';
import { sfx, startHum, updateHum, stopHum } from './crashAudio';
import { supabase } from '@/integrations/supabase/client';

function playStartSound() { try { sfx.start(); startHum(); } catch { /* ignore */ } }
function playTickSound(m: number) { try { updateHum(m); } catch { /* ignore */ } }
function playCrashSound() { try { stopHum(); sfx.crash(); } catch { /* ignore */ } }
function playCashoutSound() { try { sfx.cashout(); } catch { /* ignore */ } }

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
  autoEnabled: boolean;
  cashedOutAt: number | null;
  cashedOut: boolean;
  win: number | null;
  /** Supabase bets row id — set after pending insert */
  dbId: string | null;
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
  bets: { A: BetSlot; B: BetSlot };
  startedAt: number;
  win: number | null;
  serverElapsedAtConnect: number;
  connectTime: number;
  /** Server-known crash point used to cap animation overshoot */
  serverCrashPoint: number | null;
  /** Last server-reported elapsed_ms during flying — used to prevent overshoot */
  lastServerElapsedMs: number;
  /** When the poll last set countdown (for smooth animation) */
  countdownSetAt: number;
  /** Countdown value at the time it was last set by poll */
  countdownAtSet: number;
}

const POLL_MS = 300;
/** Maximum ms the local animation is allowed to run ahead of the last server-reported elapsed */
const MAX_AHEAD_MS = 400;
/**
 * If local clock is THIS many ms ahead of server, gently nudge startedAt forward.
 * Keeps multiplier from drifting too far above server while avoiding jitter resets.
 */
const DRIFT_CORRECTION_MS = 800;
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
    dbId: null,
  };
}

function multiplierFromElapsed(elapsedMs: number): number {
  return Math.pow(Math.E, 0.12 * (elapsedMs / 1000));
}

async function settleSlotOnServer(
  slot: BetSlot,
  roundId: string,
  bustPoint: number,
): Promise<void> {
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

async function insertPendingBet(
  userId: string,
  amount: number,
  roundId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('bets')
      .insert({
        user_id: userId,
        bet_amount: amount,
        win_amount: 0,
        multiplier: 0,
        status: 'pending',
        bet_details: { bustPoint: 0, cashOutAt: null, roundId },
        placed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) {
      console.warn('[CrashEngine] insertPendingBet error:', error.message);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (e) {
    console.warn('[CrashEngine] insertPendingBet exception:', e);
    return null;
  }
}

async function settlePendingBet(
  dbId: string,
  winAmount: number,
  multiplier: number,
  cashOutAt: number | null,
  bustPoint: number,
  status: 'won' | 'lost',
): Promise<void> {
  try {
    await supabase
      .from('bets')
      .update({
        win_amount: winAmount,
        multiplier,
        status,
        resolved_at: new Date().toISOString(),
        bet_details: { bustPoint, cashOutAt },
      })
      .eq('id', dbId);
  } catch (e) {
    console.warn('[CrashEngine] settlePendingBet exception:', e);
  }
}

async function deletePendingBet(dbId: string): Promise<void> {
  try {
    await supabase.from('bets').delete().eq('id', dbId);
  } catch (e) {
    console.warn('[CrashEngine] deletePendingBet exception:', e);
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
    bets: { A: freshBet('A'), B: freshBet('B') },
    startedAt: Date.now(),
    win: null,
    serverElapsedAtConnect: 0,
    connectTime: Date.now(),
    serverCrashPoint: null,
    lastServerElapsedMs: 0,
    countdownSetAt: Date.now(),
    countdownAtSet: 6,
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
      const r = await GameService.crashGetHistory();
      if (r.history && r.history.length > 0) {
        this.state.history = r.history;
        this.publishHistory();
        this.publish();
      }
    } catch (err) {
      console.warn('[CrashEngine] loadHistory failed:', (err as Error)?.message ?? err);
    }
  }

  private async poll() {
    try {
      const r = await GameService.crashGetCurrentRound();

      const newRound = r.round_uuid && r.round_uuid !== this.lastKnownRoundId;

      if (newRound) {
        this.lastKnownRoundId = r.round_uuid ?? '';
        try { sessionStorage.setItem(SESSION_ROUND_KEY, this.lastKnownRoundId); } catch { /* ignore */ }
        this.state.bets = { A: freshBet('A'), B: freshBet('B') };
        this.state.win = null;
        this.state.roundId = r.round_uuid ?? '';
        this.state.roundSeq += 1;
        this.state.lastServerElapsedMs = 0;
        this.didPlayStart = false;
        this.didPlayCrash = false;
        this.broadcastBets();
      }

      const prevPhase = this.lastKnownPhase;
      this.lastKnownPhase = r.phase;
      try { sessionStorage.setItem(SESSION_PHASE_KEY, r.phase); } catch { /* ignore */ }

      if (r.phase === 'waiting') {
        const waitTotal = 6000;
        const remaining = Math.max(0, (waitTotal - r.elapsed_ms) / 1000);
        this.state.phase = 'countdown';
        this.state.countdown = remaining;
        this.state.countdownAtSet = remaining;
        this.state.countdownSetAt = Date.now();
        this.state.multiplier = 1.0;
        this.state.serverCrashPoint = null;
        this.state.lastServerElapsedMs = 0;
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
          // First time entering flying — set startedAt once
          this.state.phase = 'flying';
          this.state.serverElapsedAtConnect = r.elapsed_ms;
          this.state.connectTime = Date.now();
          this.state.startedAt = Date.now() - r.elapsed_ms;
          this.state.bustPoint = 0;
          this.state.lastServerElapsedMs = r.elapsed_ms;
          if (!this.didPlayStart) {
            playStartSound();
            this.didPlayStart = true;
          }
        } else {
          // Already flying — only update lastServerElapsedMs.
          // DO NOT reset startedAt on every poll — that causes jitter/2x-fly.
          // Only apply gentle correction if local clock has drifted >DRIFT_CORRECTION_MS ahead.
          const localElapsed = Date.now() - this.state.startedAt;
          const drift = localElapsed - r.elapsed_ms;
          if (drift > DRIFT_CORRECTION_MS) {
            // Nudge startedAt forward slightly to stay in sync without hard reset
            this.state.startedAt = Date.now() - r.elapsed_ms;
          }
          this.state.lastServerElapsedMs = r.elapsed_ms;
        }
        if (r.crash_point != null && Number(r.crash_point) >= 1.0) {
          this.state.serverCrashPoint = Number(r.crash_point);
        }
        this.state.phase = 'flying';
        this.state.countdown = 0;
        this.checkAutoCashouts();
      }

      if (r.phase === 'crashed') {
        if (prevPhase !== 'crashed') {
          const serverBust = r.crash_point != null ? Number(r.crash_point) : null;
          this.state.phase = 'busted';
          this.state.bustPoint = serverBust ?? this.state.multiplier;
          this.state.multiplier = this.state.bustPoint;
          this.state.serverCrashPoint = null;
          this.state.lastServerElapsedMs = 0;
          if (!this.didPlayCrash) { playCrashSound(); this.didPlayCrash = true; }
          const bp = this.state.bustPoint;
          if (this.state.history[0] !== bp) {
            this.state.history = [bp, ...this.state.history].slice(0, 20);
            this.publishHistory();
          }
          this.settleBustedBets();
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

      const maxElapsed = this.state.lastServerElapsedMs > 0
        ? this.state.lastServerElapsedMs + MAX_AHEAD_MS
        : elapsed;
      const cappedElapsed = Math.min(elapsed, maxElapsed);

      let m = multiplierFromElapsed(cappedElapsed);

      if (this.state.serverCrashPoint != null && m >= this.state.serverCrashPoint) {
        m = this.state.serverCrashPoint;
      }

      playTickSound(m);
      this.state.multiplier = m;
      this.checkAutoCashouts();
      this.publish();
    } else if (this.state.phase === 'countdown') {
      const elapsed = (Date.now() - this.state.countdownSetAt) / 1000;
      const smooth = Math.max(0, this.state.countdownAtSet - elapsed);
      this.state.countdown = smooth;
      this.publish();
    }

    this.rafId = requestAnimationFrame(() => this.animate());
  }

  private checkAutoCashouts() {
    if (this.state.phase !== 'flying') return;
    const m = this.state.multiplier;
    for (const id of ['A', 'B'] as const) {
      const slot = this.state.bets[id];
      if (!slot.placed || slot.cashedOut || !slot.autoEnabled || slot.autoCashAt == null) continue;
      if (m >= slot.autoCashAt) {
        this.cashOut(id);
      }
    }
  }

  cashOut(id: 'A' | 'B') {
    const slot = this.state.bets[id];
    if (!slot.placed || slot.cashedOut || this.state.phase !== 'flying') return;
    const m = this.state.multiplier;
    slot.cashedOutAt = m;
    slot.cashedOut = true;
    slot.win = Math.floor(slot.amount * m);
    store.addBalance(slot.win);
    playCashoutSound();
    this.broadcastBets();
    this.publish();
    void settleSlotOnServer(slot, this.state.roundId, this.state.bustPoint);
    if (slot.dbId) {
      void settlePendingBet(slot.dbId, slot.win, m, m, this.state.bustPoint, 'won');
    }
  }

  placeBet(id: 'A' | 'B', amount: number, autoCashAt: number | null, autoEnabled: boolean) {
    if (this.state.phase !== 'countdown') return;
    const slot = this.state.bets[id];
    if (slot.placed) return;
    if (!store.deductBalance(amount)) return;
    slot.amount = amount;
    slot.placed = true;
    slot.autoCashAt = autoCashAt;
    slot.autoEnabled = autoEnabled;
    slot.cashedOutAt = null;
    slot.cashedOut = false;
    slot.win = null;
    slot.dbId = null;
    this.broadcastBets();
    this.publish();
    const session = auth.getSession();
    if (session) {
      void insertPendingBet(session.userId, amount, this.state.roundId).then((dbId) => {
        if (dbId) slot.dbId = dbId;
      });
    }
  }

  cancelBet(id: 'A' | 'B') {
    const slot = this.state.bets[id];
    if (!slot.placed || this.state.phase !== 'countdown') return;
    store.addBalance(slot.amount);
    if (slot.dbId) void deletePendingBet(slot.dbId);
    this.state.bets[id] = freshBet(id);
    this.broadcastBets();
    this.publish();
  }

  private settleBustedBets() {
    for (const id of ['A', 'B'] as const) {
      const slot = this.state.bets[id];
      if (!slot.placed || slot.cashedOut) continue;
      slot.win = 0;
      this.broadcastBets();
      this.publish();
      void settleSlotOnServer(slot, this.state.roundId, this.state.bustPoint);
      if (slot.dbId) {
        void settlePendingBet(slot.dbId, 0, 0, null, this.state.bustPoint, 'lost');
      }
    }
  }

  private broadcastBets() {
    const bets: Record<'A' | 'B', BetSlot> = { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } };
    bus.emit(Topics.CrashBets, bets);
  }

  private publishHistory() {
    bus.emit(Topics.CrashHistory, [...this.state.history]);
  }

  private publish() {
    const s = this.state;
    bus.emit(Topics.CrashState, {
      phase: s.phase,
      multiplier: s.multiplier,
      countdown: s.countdown,
      roundId: s.roundId,
      roundSeq: s.roundSeq,
      bustPoint: s.bustPoint,
      history: s.history,
      bets: { A: { ...s.bets.A }, B: { ...s.bets.B } },
      startedAt: s.startedAt,
    } satisfies CrashState);
  }

  getState(): CrashState {
    const s = this.state;
    return {
      phase: s.phase,
      multiplier: s.multiplier,
      countdown: s.countdown,
      roundId: s.roundId,
      roundSeq: s.roundSeq,
      bustPoint: s.bustPoint,
      history: [...s.history],
      bets: { A: { ...s.bets.A }, B: { ...s.bets.B } },
      startedAt: s.startedAt,
    };
  }

  getBets(): Record<'A' | 'B', BetSlot> {
    return { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } };
  }
}

export const crashEngine = new CrashEngine();
