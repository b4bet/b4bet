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
  crash_point: number | null;
  last_crash_point: number | null;
}

export interface CrashHistoryResult {
  history: number[];
}

/** Full round detail used by CrashFeedPopup for provably fair verification */
export interface CrashRoundDetail {
  bust_point: number;
  round_uuid: string;
  server_seed?: string | null;
  server_seed_hash: string;
  created_at: string;
}

export interface CrashHistoryDetailResult {
  history: CrashRoundDetail[];
}

export interface AviatorCurrentRoundResult {
  round_uuid: string;
  phase: 'waiting' | 'flying' | 'crashed';
  elapsed_ms: number;
  crash_point: number | null;
  last_crash_point: number | null;
}

export interface AviatorHistoryResult {
  history: number[];
}

export interface AviatorPlaceBetResult {
  success: boolean;
  bet_id: string | null;
  round_uuid: string | null;
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

/** Normalised cashout result — mapped from the Edge Function response. */
export interface AviatorCashoutResult {
  success: boolean;
  /** True when the bet was cashed out before the crash. */
  won: boolean;
  /** The multiplier at which the cashout was accepted. */
  cashout_at: number | null;
  /** Gross win amount (bet × multiplier). */
  win: number;
  balance_after: number;
  crash_point: number | null;
}

export interface AviatorSettleResult { success: boolean; crash_point: number; }
export interface AviatorRoundStatusResult {
  crashed: boolean;
  crash_point: number | null;
}

// ── Helper ────────────────────────────────────────────────────────────────────

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

// ── Game API ────────────────────────────────────────────────────────────────

export const GameService = {
  // ── Crash ──────────────────────────────────────────────────────────────────

  /** Poll every 300ms — DB function handles all phase transitions server-side */
  async crashGetCurrentRound(): Promise<CrashCurrentRoundResult> {
    const { data, error } = await supabase.rpc('crash_get_current_round');
    if (error) throw new Error(error.message);
    const d = data as CrashCurrentRoundResult;
    return {
      round_uuid:       d.round_uuid       ?? '',
      phase:            (d.phase           ?? 'waiting') as CrashCurrentRoundResult['phase'],
      elapsed_ms:       Number(d.elapsed_ms ?? 0),
      crash_point:      d.crash_point      != null ? Number(d.crash_point)      : null,
      last_crash_point: d.last_crash_point != null ? Number(d.last_crash_point) : null,
    };
  },

  /** Last 20 bust points for history bar */
  async crashGetHistory(): Promise<CrashHistoryResult> {
    const { data, error } = await supabase.rpc('crash_get_history');
    if (error) throw new Error(error.message);
    const d = data as { history?: number[] };
    return { history: d?.history ?? [] };
  },

  /** Last 20 rounds with seeds for provably fair panel */
  async crashGetHistoryDetail(): Promise<CrashHistoryDetailResult> {
    const { data, error } = await supabase.rpc('crash_get_history_detail');
    if (error) throw new Error(error.message);
    const d = data as { history?: CrashRoundDetail[] };
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

  // ── Aviator ────────────────────────────────────────────────────────────────

  /** Poll every 300ms — mirrors crash_get_current_round for the aviator table */
  async aviatorGetCurrentRound(): Promise<AviatorCurrentRoundResult> {
    const { data, error } = await supabase.rpc('aviator_get_current_round');
    if (error) throw new Error(error.message);
    const d = data as AviatorCurrentRoundResult;
    return {
      round_uuid:       d.round_uuid       ?? '',
      phase:            (d.phase           ?? 'waiting') as AviatorCurrentRoundResult['phase'],
      elapsed_ms:       Number(d.elapsed_ms ?? 0),
      crash_point:      d.crash_point      != null ? Number(d.crash_point)      : null,
      last_crash_point: d.last_crash_point != null ? Number(d.last_crash_point) : null,
    };
  },

  /**
   * Fetch the last 20 completed Aviator rounds for history bar pre-fill.
   */
  async aviatorGetHistory(): Promise<AviatorHistoryResult> {
    const { data } = await supabase
      .from('aviator_rounds')
      .select('bust_point')
      .order('created_at', { ascending: false })
      .limit(20);
    const history = (data ?? []).map((r: { bust_point: number | string }) =>
      parseFloat(String(r.bust_point))
    );
    return { history };
  },

  /**
   * Register a bet on the server during the waiting phase.
   * Returns bet_id which should be stored and passed to aviatorCashout
   * for direct bet lookup (avoids round_uuid race condition).
   */
  aviatorPlaceBet(
    userId: string,
    betAmount: number,
    roundUuid: string | null,
  ): Promise<AviatorPlaceBetResult> {
    return post<AviatorPlaceBetResult>({
      action: 'aviator_place_bet',
      user_id: userId,
      bet_amount: betAmount,
      round_uuid: roundUuid,
    });
  },

  /**
   * Cash out at the given multiplier.
   *
   * @param betId - Server-assigned bet ID from aviatorPlaceBet. When provided,
   *                the server looks up the bet directly by ID — most reliable.
   *                Falls back to round_uuid lookup if null.
   */
  async aviatorCashout(
    userId: string,
    roundUuid: string | null,
    roundId: number,
    betAmount: number,
    cashoutMultiplier: number,
    betId?: string | null,
  ): Promise<AviatorCashoutResult> {
    type RawResponse = {
      success?: boolean;
      won?: boolean;
      win?: number;
      win_amount?: number;
      balance_after?: number;
      multiplier?: number;
      cashout_at?: number;
      bustPoint?: number | null;
      crash_point?: number | null;
      error?: string;
    };
    const raw = await post<RawResponse>({
      action: "aviator_cashout",
      user_id: userId,
      round_uuid: roundUuid,
      round_id: roundId,
      bet_amount: betAmount,
      cashout_multiplier: cashoutMultiplier,
      // Pass bet_id so the server finds the bet directly by ID.
      // This is the most reliable path — avoids round_uuid race conditions.
      ...(betId ? { bet_id: betId } : {}),
    });
    return {
      success:       raw.success       ?? false,
      won:           raw.won           ?? raw.success ?? false,
      cashout_at:    raw.cashout_at    ?? raw.multiplier ?? cashoutMultiplier,
      win:           raw.win           ?? raw.win_amount ?? 0,
      balance_after: raw.balance_after ?? 0,
      crash_point:   raw.crash_point   ?? raw.bustPoint ?? null,
    };
  },

  aviatorRoundStart(userId: string, roundId: number): Promise<AviatorRoundStartResult> {
    return post<AviatorRoundStartResult>({
      game_type: "aviator_round_start",
      user_id: userId,
      round_id: roundId,
    });
  },

  aviatorSettle(
    userId: string,
    roundUuid: string | null,
    roundId: number,
    betAmount: number,
  ): Promise<AviatorSettleResult> {
    return post<AviatorSettleResult>({
      action: "aviator_settle_lost",
      user_id: userId,
      round_uuid: roundUuid,
      round_id: roundId,
      bet_amount: betAmount,
    });
  },

  aviatorRoundStatus(roundId: number): Promise<AviatorRoundStatusResult> {
    return get<AviatorRoundStatusResult>({ action: "aviator_round_status", round_id: String(roundId) });
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
};
