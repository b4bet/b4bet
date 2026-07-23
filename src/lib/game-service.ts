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
  // For aviator_place_bet: success:false is a valid business response (phase closed, insufficient balance)
  // Don't throw on 4xx — let the caller inspect result.success and result.error.
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Server error");
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
   * Called at the START of each Aviator round (waiting phase).
   * Server generates crash_point via crypto.getRandomValues() and stores it.
   * Returns ONLY round metadata — crash point is NEVER returned here.
   */
  aviatorRoundStart(userId: string, roundId: number): Promise<AviatorRoundStartResult> {
    return post<AviatorRoundStartResult>({
      action: "aviator_round_start",
      user_id: userId,
      round_id: roundId,
    });
  },

  /**
   * Place a bet during the waiting phase.
   *
   * - placed_at_ms: exact client timestamp when user clicked BET.
   *   The server uses this (not Date.now() on the server) to validate
   *   timing, so cold-start delay (up to 4s) doesn't falsely reject bets.
   *
   * Returns success:false with an error field for phase_closed / insufficient_balance.
   * These are NOT thrown — callers must check result.success.
   */
  aviatorPlaceBet(
    userId: string,
    amount: number,
    roundUuid: string,
    placedAtMs: number,
  ): Promise<AviatorPlaceBetResult> {
    return post<AviatorPlaceBetResult>({
      action: "aviator_place_bet",
      user_id: userId,
      bet_amount: amount,
      round_uuid: roundUuid,
      placed_at_ms: placedAtMs,
    });
  },

  /**
   * Called when a player clicks Cash Out during flying phase.
   * Server validates timing using its own clock + stored started_at.
   * Atomically credits balance. Returns crash_point only if round already crashed.
   */
  aviatorCashout(
    userId: string,
    roundUuid: string,
    betAmount: number,
    placedAtMs: number,
    cashoutAt: number,
    betId: string | null,
  ): Promise<AviatorCashoutResult> {
    return post<AviatorCashoutResult>({
      action: "aviator_cashout",
      user_id: userId,
      round_uuid: roundUuid,
      bet_amount: betAmount,
      placed_at_ms: placedAtMs,
      cashout_at: cashoutAt,
      bet_id: betId,
    });
  },

  /**
   * Called after a round ends for bets that did NOT cash out (always a loss).
   * roundUuid + roundId both sent so server can match the pending bet record.
   */
  aviatorSettle(
    userId: string,
    roundUuid: string,
    roundId: number,
    betAmount: number,
  ): Promise<AviatorSettleResult> {
    return post<AviatorSettleResult>({
      action: "aviator_settle",
      user_id: userId,
      round_uuid: roundUuid,
      round_id: roundId,
      bet_amount: betAmount,
    });
  },

  /**
   * Polled every ~300ms during the flying phase to detect when the server has
   * passed its crash point. Returns crash_point only AFTER the server's own
   * clock has crossed it — the client never learns the value early.
   */
  aviatorRoundStatus(roundId: number): Promise<AviatorRoundStatusResult> {
    return get<AviatorRoundStatusResult>({ action: "aviator_round_status", round_id: String(roundId) });
  },
};
