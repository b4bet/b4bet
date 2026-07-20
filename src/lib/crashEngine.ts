// crashEngine.ts - Seeded RNG bust point, store.credit for balance
import { bus, Topics } from './bus';
import { store } from './store';
import { sfx, startHum, updateHum, stopHum } from './crashAudio';
function playStartSound() { sfx.start(); startHum(); }
function playTickSound(m: number) { updateHum(m); }
function playCrashSound() { stopHum(); sfx.crash(); }
function playCashoutSound() { sfx.cashout(); }

export type CrashPhase = 'countdown' | 'flying' | 'busted';
export interface CashoutEvent { id: string; amount: number; multiplier: number; ts: number; }
export interface BetSlot { id: 'A' | 'B'; amount: number; placed: boolean; autoCashAt: number | null; cashedOutAt: number | null; win: number | null; }
export interface CrashState { phase: CrashPhase; multiplier: number; countdown: number; roundId: number; bustPoint: number; history: number[]; bets: { A: BetSlot; B: BetSlot }; startedAt: number; }

interface EngineState { phase: CrashPhase; multiplier: number; countdown: number; roundId: number; bustPoint: number; history: number[]; bets: { A: BetSlot; B: BetSlot }; startedAt: number; win: number | null; }

const COUNTDOWN_SECS = 6;

/** Mulberry32 seeded PRNG */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Generate bust point with casino-style tiered distribution */
function genBust(rng: () => number): number {
  const bucket = rng();
  let raw: number;
  if (bucket < 0.50) raw = 1.10 + rng() * 0.50;
  else if (bucket < 0.80) raw = 1.60 + rng() * 3.40;
  else if (bucket < 0.95) raw = 5.00 + rng() * 15.0;
  else raw = 20.00 + rng() * 80.0;
  return Math.round(raw * 100) / 100;
}

function freshBet(id: 'A' | 'B'): BetSlot { return { id, amount: 100, placed: false, autoCashAt: null, cashedOutAt: null, win: null }; }

class CrashEngine {
  private rng: () => number;
  private state: EngineState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;

  constructor() {
    const sessionSeed = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Date.now() * 7919 + Math.floor(Math.random() * 65536);
    this.rng = mulberry32(sessionSeed);
    this.state = {
      phase: 'countdown', multiplier: 1.0, countdown: COUNTDOWN_SECS, roundId: 1,
      bustPoint: genBust(this.rng), history: [],
      bets: { A: freshBet('A'), B: freshBet('B') }, startedAt: Date.now(), win: null,
    };
  }

  start() { if (this.timer) return; this.timer = setInterval(() => this.tick(), 50); this.lastTick = Date.now(); }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  private publish() { bus.emit(Topics.CrashState, this.getState()); }
  private broadcastBets() { bus.emit(Topics.CrashBets, { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } }); }

  private tick() {
    const now = Date.now(); const dt = (now - this.lastTick) / 1000; this.lastTick = now;
    if (this.state.phase === 'countdown') {
      this.state.countdown -= dt;
      if (this.state.countdown <= 0) { this.state.phase = 'flying'; this.state.multiplier = 1.0; this.state.startedAt = now; playStartSound(); }
    }
    if (this.state.phase === 'flying') {
      const elapsed = (now - this.state.startedAt) / 1000; const m = Math.pow(Math.E, 0.12 * elapsed);
      playTickSound(m); this.state.multiplier = m;
      for (const slot of Object.values(this.state.bets)) { if (slot.placed && slot.cashedOutAt === null && slot.autoCashAt !== null && m >= slot.autoCashAt) this.performCashOut(slot.id, slot.autoCashAt); }
      if (m >= this.state.bustPoint) {
        this.state.multiplier = this.state.bustPoint; this.state.phase = 'busted'; playCrashSound();
        this.state.history = [this.state.bustPoint, ...this.state.history].slice(0, 20); this.settleBustedBets();
        setTimeout(() => this.nextRound(), 3000);
      }
    }
    this.publish();
  }

  private nextRound() { stopHum(); this.state.roundId += 1; this.state.phase = 'countdown'; this.state.multiplier = 1.0; this.state.countdown = COUNTDOWN_SECS; this.state.bets = { A: freshBet('A'), B: freshBet('B') }; this.state.win = null; this.state.bustPoint = genBust(this.rng); this.broadcastBets(); }

  private performCashOut(id: 'A' | 'B', cashOutAt: number) {
    const slot = this.state.bets[id]; if (!slot.placed || slot.cashedOutAt !== null) return;
    slot.cashedOutAt = cashOutAt; slot.win = Math.floor(slot.amount * cashOutAt); playCashoutSound();
    bus.emit(Topics.CashoutEvent, { id, amount: slot.win, multiplier: cashOutAt, ts: Date.now() } satisfies CashoutEvent); this.broadcastBets();
    store.credit(slot.win);
    store.recordCrashBet({ roundId: this.state.roundId, amount: slot.amount, cashOutAt, bustPoint: this.state.bustPoint, win: slot.win ?? 0 });
  }

  private settleBustedBets() { for (const slot of Object.values(this.state.bets)) { if (!slot.placed || slot.cashedOutAt !== null) continue; slot.win = 0; store.recordCrashBet({ roundId: this.state.roundId, amount: slot.amount, cashOutAt: null, bustPoint: this.state.bustPoint, win: 0 }); } this.broadcastBets(); }

  placeBet(id: 'A' | 'B', amount: number): { ok: boolean; reason?: string } { const slot = this.state.bets[id]; if (this.state.phase !== 'countdown') return { ok: false, reason: 'Round not in betting phase' }; if (slot.placed) return { ok: false, reason: 'Already placed' }; if (amount <= 0) return { ok: false, reason: 'Invalid amount' }; if (amount > store.balance) return { ok: false, reason: 'Insufficient balance' }; slot.amount = amount; slot.placed = true; store.debitBalance(amount); this.broadcastBets(); return { ok: true }; }
  setAutoCashAt(id: 'A' | 'B', at: number | null) { this.state.bets[id].autoCashAt = at; this.broadcastBets(); }
  cashOut(id: 'A' | 'B'): boolean { const slot = this.state.bets[id]; if (this.state.phase !== 'flying') return false; if (!slot.placed || slot.cashedOutAt !== null) return false; this.performCashOut(id, this.state.multiplier); return true; }
  getState(): CrashState { const { phase, multiplier, countdown, roundId, bustPoint, history } = this.state; return { phase, multiplier, countdown, roundId, bustPoint, history, bets: { A: { ...this.state.bets.A }, B: { ...this.state.bets.B } }, startedAt: this.state.startedAt }; }
}

export const crashEngine = new CrashEngine();
