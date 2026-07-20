/**
 * game-service.ts
 *
 * Thin client wrapper around the process-bet Edge Function.
 * ALL game outcomes are determined server-side.
 * The browser is a pure display layer — it NEVER computes win/loss locally.
 */

const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-bet`;

// Use whichever key is available — new projects use VITE_SUPABASE_PUBLISHABLE_KEY,
// older projects use VITE_SUPABASE_ANON_KEY. Fall back gracefully.
const SUPABASE_KEY: string =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  '';

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
export interface AviatorCashoutResult {
  success: boolean;
  won: boolean;
  cashout_at: number | null;
  win: number;
  balance_after: number;
  crash_point: number | null; // only non-null if round already crashed
}
export interface AviatorSettleResult { success: boolean; crash_point: number; }
export interface AviatorRoundStatusResult {
  /** True once the server's own clock has passed the crash point. */
  crashed: boolean;
  /** Only non-null when crashed === true — safe to display/use as the real crash value. */
  crash_point: number | null;
}

/**
 * Response from aviator_get_current_round.
 * This is the primary sync endpoint — all clients poll this to observe the
 * ONE shared live round.  crash_point is NEVER non-null during waiting/flying.
 */
export interface AviatorCurrentRoundResult {
  /** Current phase of the shared round. */
  phase: 'waiting' | 'flying' | 'crashed';
  /**
   * Milliseconds elapsed since the current phase started.
   * Clients use this to jump to the right position in the animation
   * when they open mid-flight.
   */
  elapsed_ms: number;
  /**
   * UUID that identifies this specific round.
   * Used as the key for cashout/settle calls instead of the old integer round_id.
   * null only if the table hasn't been seeded yet (edge case, treat as waiting).\
   */
  round_uuid: string | null;
  /**
   * SECURITY: null during waiting and flying phases.
   * Only populated once phase === 'crashed' — never before.
   */
  crash_point: number | null;
  /**
   * The crash point of the most recently completed round (for history bar).
   * Only present in the response when a phase transition just happened.
   */
  last_crash_point?: number | null;
}

// ── Helper ───────────────────────────────────────────────────────────────────

async function get<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${EDGE_FN}?${qs}`, {
    method: "GET",
    headers: { "apikey": SUPABASE_KEY },
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
      "apikey": SUPABASE_KEY,
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
   * PRIMARY SYNC ENDPOINT — polled every ~300ms by every client.
   * Returns the ONE shared live round so all users see the same game.
   * SECURITY: crash_point is null until phase === 'crashed'.
   */
  aviatorGetCurrentRound(): Promise<AviatorCurrentRoundResult> {
    return get<AviatorCurrentRoundResult>({ action: "aviator_get_current_round" });
  },

  /**
   * Called at the START of each Aviator round (waiting phase).
   * Server generates crash_point via crypto.getRandomValues() and stores it.
   * Returns ONLY round metadata — crash point is NEVER returned here.
   * @deprecated New code uses aviatorGetCurrentRound instead. Kept for backward compat.
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
   * Server validates timing using its own clock + stored started_at.
   * Atomically credits balance. Returns crash_point only if round crashed.
   * Accepts round_uuid (new) or round_id (legacy).
   */
  aviatorCashout(
    userId: string,
    roundUuid: string | null,
    roundId: number,
    betAmount: number,
    placedAtMs: number,
  ): Promise<AviatorCashoutResult> {
    return post<AviatorCashoutResult>({
      game_type: "aviator_cashout",
      user_id: userId,
      round_uuid: roundUuid,
      round_id: roundId,
      bet_amount: betAmount,
      placed_at_ms: placedAtMs,
    });
  },

  /**
   * Called after a round ends for bets that did NOT cash out (always a loss).
   * Server records the bet and returns the real crash_point for history display.
   */
  aviatorSettle(userId: string, roundUuid: string | null, roundId: number, betAmount: number): Promise<AviatorSettleResult> {
    return post<AviatorSettleResult>({
      game_type: "aviator_settle",
      user_id: userId,
      round_uuid: roundUuid,
      round_id: roundId,
      bet_amount: betAmount,
    });
  },

  /**
   * Legacy per-round status poll — kept for backward compat.
   * @deprecated Prefer aviatorGetCurrentRound for new code.\
   */
  aviatorRoundStatus(roundId: number): Promise<AviatorRoundStatusResult> {
    return get<AviatorRoundStatusResult>({ action: "aviator_round_status", round_id: String(roundId) });
  },
};
