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
export interface AviatorPlaceBetResult {
  success: boolean;
  balance_after: number | null;
  bet_id: string | null;
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
 * Soft rejections like { success: false, error: "Round already ended" } on HTTP 200
 * are returned as-is so the caller can inspect result.success.
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

  /**
   * Place a bet for the current Aviator round.
   * Uses postSoft so server soft-rejections (round ended, window closed)
   * come back as { success: false } instead of thrown exceptions.
   * Client must call store.debitLocalOnly() before this — server also deducts.
   */
  aviatorPlaceBet(userId: string, betAmount: number, roundUuid: string | null, placedAtMs?: number): Promise<AviatorPlaceBetResult> {
    return postSoft<AviatorPlaceBetResult>({
      action: "aviator_place_bet",
      user_id: userId,
      bet_amount: betAmount,
      round_uuid: roundUuid,
      placed_at_ms: placedAtMs ?? Date.now(),
    });
  },

  /**
   * Called at the START of each Aviator round.
   * Server generates crash_point and stores it — never returned here.
   */
  aviatorRoundStart(userId: string, roundId: number): Promise<AviatorRoundStartResult> {
    return post<AviatorRoundStartResult>({
      game_type: "aviator_round_start",
      user_id: userId,
      round_id: roundId,
    });
  },

  /**
   * Called when a player clicks Cash Out during flying phase.
   */
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

  /**
   * Called after a round ends for bets that did NOT cash out (always a loss).
   * @param roundUuid - the round UUID string
   */
  aviatorSettle(userId: string, roundUuid: string, _legacyRoundId: number, betAmount: number): Promise<AviatorSettleResult> {
    return post<AviatorSettleResult>({
      action: "aviator_settle",
      user_id: userId,
      round_uuid: roundUuid,
      bet_amount: betAmount,
    });
  },

  /**
   * Polled every ~300ms during flying phase to detect server crash.
   */
  aviatorRoundStatus(roundId: number): Promise<AviatorRoundStatusResult> {
    return get<AviatorRoundStatusResult>({ action: "aviator_round_status", round_id: String(roundId) });
  },
};
