/**
 * game-service.ts
 *
 * Thin client wrapper around the process-bet Edge Function.
 * ALL game outcomes are determined server-side.
 * The browser is a pure display layer — it NEVER computes win/loss locally.
 */

const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-bet`;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CrashBustResult { bust_point: number; }
export interface CrashSettleResult { success: boolean; win: number; verified_bust: number | null; balance_after: number; }
export interface CrashCurrentRoundResult {
  phase: 'waiting' | 'flying' | 'crashed';
  elapsed_ms: number;
  round_uuid: string | null;
  crash_point: number | null;
  last_crash_point: number | null;
  server_seed_hash?: string | null;
}
export interface CrashHistoryResult { history: number[]; }
export interface CrashRoundDetail {
  bust_point: number;
  round_uuid: string;
  server_seed_hash: string;
  server_seed: string | null;
  created_at: string;
}
export interface CrashHistoryDetailResult { history: CrashRoundDetail[]; }
export interface MinesStartResult { success: boolean; session_id: string; balance_after: number; grid_size: number; mine_count: number; }
export interface MinesRevealResult { success: boolean; is_mine: boolean; gems_found: number; current_multiplier: number; next_multiplier: number; mine_positions?: number[]; }
export interface MinesCashoutResult { success: boolean; payout: number; multiplier: number; balance_after: number; mine_positions: number[]; }
export interface SunMoonResult { result: "sun" | "moon" | "tie"; }
export interface SunMoonSettleResult { success: boolean; result: string; won: boolean; payout: number; profit: number; balance_after: number; }
export interface TradingSettleResult { success: boolean; won: boolean; payout: number; profit: number; balance_after: number; error?: string; }
export interface AviatorRoundStartResult {
  success: boolean;
  round_id: number;
  started_at?: string;
  already_exists?: boolean;
}
export interface AviatorPlaceBetResult {
  success: boolean;
  balance_after: number | null;
  bet_id: string | null;
  error?: string;
}
export interface AviatorCancelBetResult {
  success: boolean;
  balance_after: number | null;
  error?: string;
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
export interface AviatorCurrentRoundResult {
  phase: 'waiting' | 'flying' | 'crashed';
  elapsed_ms: number;
  round_uuid: string | null;
  crash_point: number | null;
  last_crash_point: number | null;
  server_seed_hash?: string | null;
}
export interface AviatorHistoryResult {
  history: number[];
}
export interface AviatorHistoryDetailResult {
  history: { bust_point: number | string; round_uuid?: string | null; server_seed?: string | null }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Standard post — throws if HTTP error or response has { error: "..." } field. */
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

/**
 * Soft post — only throws on HTTP 5xx server failures.
 * Returns the response data even if it contains an error field.
 * Use this for actions that may not be supported by the server yet.
 */
async function postSoft<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(EDGE_FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T;
  if (res.status >= 500) throw new Error("Server error");
  return data;
}

// ── Game API ─────────────────────────────────────────────────────────────────

export const GameService = {
  // ── Crash ──────────────────────────────────────────────────────────────────

  /** Fetch current crash round state (phase, elapsed_ms, round_uuid, crash_point). */
  crashGetCurrentRound(): Promise<CrashCurrentRoundResult> {
    return get<CrashCurrentRoundResult>({ action: "crash_current_round" });
  },

  /** Fetch recent crash history (bust points only). */
  crashGetHistory(): Promise<CrashHistoryResult> {
    return get<CrashHistoryResult>({ action: "crash_history" });
  },

  /** Fetch detailed crash history with provably-fair fields. */
  crashGetHistoryDetail(): Promise<CrashHistoryDetailResult> {
    return get<CrashHistoryDetailResult>({ action: "crash_history_detail" });
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
  /**
   * Settle a trading bet. Uses postSoft so it NEVER throws for "Unknown action".
   * The caller checks res.success and falls back to local settlement if false.
   */
  tradingSettle(
    userId: string,
    symbol: string,
    direction: "UP" | "DOWN",
    stake: number,
    entryPrice: number,
    exitPrice: number,
    payoutPct: number,
  ): Promise<TradingSettleResult> {
    return postSoft<TradingSettleResult>({
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

  aviatorGetCurrentRound(): Promise<AviatorCurrentRoundResult> {
    return get<AviatorCurrentRoundResult>({ action: "aviator_current_round" });
  },

  aviatorGetHistory(): Promise<AviatorHistoryResult> {
    return get<AviatorHistoryResult>({ action: "aviator_history" });
  },

  aviatorGetHistoryDetail(): Promise<AviatorHistoryDetailResult> {
    return get<AviatorHistoryDetailResult>({ action: "aviator_history_detail" });
  },

  aviatorPlaceBet(userId: string, betAmount: number, roundUuid: string | null, placedAtMs?: number): Promise<AviatorPlaceBetResult> {
    return postSoft<AviatorPlaceBetResult>({
      action: "aviator_place_bet",
      user_id: userId,
      bet_amount: betAmount,
      round_uuid: roundUuid,
      placed_at_ms: placedAtMs ?? Date.now(),
    });
  },

  aviatorCancelBet(userId: string, betAmount: number, betId: string | null): Promise<AviatorCancelBetResult> {
    return postSoft<AviatorCancelBetResult>({
      action: "aviator_cancel_bet",
      user_id: userId,
      bet_amount: betAmount,
      bet_id: betId,
    });
  },

  aviatorRoundStart(userId: string, roundId: number): Promise<AviatorRoundStartResult> {
    return post<AviatorRoundStartResult>({
      game_type: "aviator_round_start",
      user_id: userId,
      round_id: roundId,
    });
  },

  aviatorCashout(
    userId: string,
    roundUuid: string | null,
    roundId: number,
    betAmount: number,
    multiplier: number,
    betId: string | null,
  ): Promise<AviatorCashoutResult> {
    return post<AviatorCashoutResult>({
      action: "aviator_cashout",
      user_id: userId,
      round_uuid: roundUuid,
      round_id: roundId,
      bet_amount: betAmount,
      cashout_at: multiplier,
      bet_id: betId,
    });
  },

  aviatorSettle(userId: string, roundUuid: string | null, _legacyRoundId: number, betAmount: number): Promise<AviatorSettleResult> {
    return post<AviatorSettleResult>({
      action: "aviator_settle",
      user_id: userId,
      round_uuid: roundUuid,
      bet_amount: betAmount,
    });
  },

  aviatorRoundStatus(roundId: number): Promise<AviatorRoundStatusResult> {
    return get<AviatorRoundStatusResult>({ action: "aviator_round_status", round_id: String(roundId) });
  },
};
