/**
 * game-service.ts
 *
 * Thin client wrapper around the process-bet Edge Function + Supabase RPCs.
 * ALL game outcomes are determined server-side.
 * The browser is a pure display layer — it NEVER computes win/loss locally.
 */

import { supabase } from '../integrations/supabase/client';

const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-bet`;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CrashCurrentRoundResult {
  round_uuid: string;
  phase: 'waiting' | 'flying' | 'crashed';
  elapsed_ms: number;
  crash_point: number | null;       // only non-null when phase === 'crashed'
  last_crash_point: number | null;  // bust point of the previous completed round
}

export interface CrashHistoryResult {
  history: number[];
}

export interface CrashBustResult { bust_point: number; }
export interface CrashSettleResult { success: boolean; win: number; verified_bust: number | null; balance_after: number; }
export interface MinesStartResult { success: boolean; session_id: string; balance_after: number; grid_size: number; mine_count: number; }
export interface MinesRevealResult { success: boolean; is_mine: boolean; gems_found: number; current_multiplier: number; next_multiplier: number; mine_positions?: number[]; }
export interface MinesCashoutResult { success: boolean; payout: number; multiplier: number; balance_after: number; mine_positions: number[]; }
export interface SunMoonResult { result: "sun" | "moon" | "tie"; }
export interface SunMoonSettleResult { success: boolean; result: string; won: boolean; payout: number; profit: number; balance_after: number; }
export interface TradingSettleResult { success: boolean; won: boolean; payout: number; profit: number; balance_after: number; }
export interface AviatorRoundStartResult {
  success: boolean;
  round_id: number;
  started_at?: string;
  already_exists?: boolean;
}
export interface AviatorCashoutResult {
  success: boolean;
  won: boolean;
  cashout_at: number | null;
  win: number;
  balance_after: number;
  crash_point: number | null;
}
export interface AviatorSettleResult { success: boolean; crash_point: number; }
export interface AviatorRoundStatusResult {
  crashed: boolean;
  crash_point: number | null;
}

// ── Helper ───────────────────────────────────────────────────────────────────

async function get<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${EDGE_FN}?${qs}`, {
    method: "GET",
    headers: { "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY },
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok || data.error) throw new Error((data as { error?: string }).error ?? "Server error");
  return data;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(EDGE_FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok || data.error) throw new Error((data as { error?: string }).error ?? "Server error");
  return data;
}

// ── Game API ─────────────────────────────────────────────────────────────────

export const GameService = {
  // ── Crash ──────────────────────────────────────────────────────────────────

  /**
   * Get current round state. Called every 300ms by the crash engine.
   * Uses the crash_get_current_round() Postgres RPC which handles all
   * phase transitions (waiting→flying→crashed→waiting) server-side.
   */
  async crashGetCurrentRound(): Promise<CrashCurrentRoundResult> {
    const { data, error } = await supabase.rpc('crash_get_current_round');
    if (error) throw new Error(error.message);
    // RPC returns a jsonb object — Supabase client parses it automatically
    const d = data as CrashCurrentRoundResult;
    return {
      round_uuid:        d.round_uuid       ?? '',
      phase:             (d.phase           ?? 'waiting') as CrashCurrentRoundResult['phase'],
      elapsed_ms:        Number(d.elapsed_ms ?? 0),
      crash_point:       d.crash_point != null ? Number(d.crash_point) : null,
      last_crash_point:  d.last_crash_point != null ? Number(d.last_crash_point) : null,
    };
  },

  /**
   * Get last 20 completed rounds for the history bar.
   */
  async crashGetHistory(): Promise<CrashHistoryResult> {
    const { data, error } = await supabase.rpc('crash_get_history');
    if (error) throw new Error(error.message);
    const d = data as { history?: number[] };
    return { history: d?.history ?? [] };
  },

  crashGetBustPoint(roundId: number): Promise<CrashBustResult> {
    return get<CrashBustResult>({ action: "crash_get_bust", round_id: String(roundId) });
  },

  crashSettle(userId: string, roundId: number, amount: number, cashOutAt: number | null, bustPoint: number): Promise<CrashSettleResult> {
    const won = cashOutAt !== null && cashOutAt <= bustPoint;
    return post<CrashSettleResult>({
      game_type: "crash_settle",
      user_id: userId,
      round_id: roundId,
      amount,
      cash_out_at: cashOutAt,
      bust_point: bustPoint,
      win: won ? Math.round(amount * (cashOutAt ?? 0) * 100) / 100 : 0,
    });
  },

  // ── Mines ──────────────────────────────────────────────────────────────────
  minesStart(userId: string, mineCount: number, stake: number): Promise<MinesStartResult> {
    return post<MinesStartResult>({ game_type: "mines_start", user_id: userId, mine_count: mineCount, stake });
  },

  minesReveal(userId: string, sessionId: string, tileIndex: number): Promise<MinesRevealResult> {
    return post<MinesRevealResult>({ game_type: "mines_reveal", user_id: userId, session_id: sessionId, tile_index: tileIndex });
  },

  minesCashout(userId: string, sessionId: string): Promise<MinesCashoutResult> {
    return post<MinesCashoutResult>({ game_type: "mines_cashout", user_id: userId, session_id: sessionId });
  },

  // ── Sun vs Moon ────────────────────────────────────────────────────────────
  sunMoonGetResult(roundId: number): Promise<SunMoonResult> {
    return get<SunMoonResult>({ action: "sunvsmoon_result", round_id: String(roundId) });
  },

  sunMoonSettle(userId: string, roundId: number, bet: "sun" | "moon" | "tie", stake: number): Promise<SunMoonSettleResult> {
    return post<SunMoonSettleResult>({ game_type: "sunvsmoon_settle", user_id: userId, round_id: roundId, bet, stake });
  },

  // ── Trading ────────────────────────────────────────────────────────────────
  tradingSettle(
    userId: string,
    symbol: string,
    direction: "UP" | "DOWN",
    stake: number,
    entryPrice: number,
    exitPrice: number,
    payoutPct: number,
  ): Promise<TradingSettleResult> {
    return post<TradingSettleResult>({
      game_type: "trading_settle",
      user_id: userId,
      symbol,
      direction,
      stake,
      entry_price: entryPrice,
      exit_price: exitPrice,
      payout_pct: payoutPct,
    });
  },

  // ── Aviator ────────────────────────────────────────────────────────────────
  aviatorRoundStart(userId: string, roundId: number): Promise<AviatorRoundStartResult> {
    return post<AviatorRoundStartResult>({
      game_type: "aviator_round_start",
      user_id: userId,
      round_id: roundId,
    });
  },

  aviatorCashout(
    userId: string,
    roundId: number,
    betAmount: number,
    placedAtMs: number,
  ): Promise<AviatorCashoutResult> {
    return post<AviatorCashoutResult>({
      game_type: "aviator_cashout",
      user_id: userId,
      round_id: roundId,
      bet_amount: betAmount,
      placed_at_ms: placedAtMs,
    });
  },

  aviatorSettle(userId: string, roundId: number, betAmount: number): Promise<AviatorSettleResult> {
    return post<AviatorSettleResult>({
      game_type: "aviator_settle",
      user_id: userId,
      round_id: roundId,
      bet_amount: betAmount,
    });
  },

  aviatorRoundStatus(roundId: number): Promise<AviatorRoundStatusResult> {
    return get<AviatorRoundStatusResult>({ action: "aviator_round_status", round_id: String(roundId) });
  },
};
