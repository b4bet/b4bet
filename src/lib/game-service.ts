/**
 * game-service.ts
 *
 * Thin client wrapper around the process-bet Edge Function.
 * ALL game outcomes are determined server-side.
 * The browser is a pure display layer — it NEVER computes win/loss locally.
 */

const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-bet`;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CrashBustResult    { bust_point: number; }
export interface CrashSettleResult  { success: boolean; win: number; verified_bust: number | null; balance_after: number; }
export interface MinesStartResult   { success: boolean; session_id: string; balance_after: number; grid_size: number; mine_count: number; }
export interface MinesRevealResult  { success: boolean; is_mine: boolean; gems_found: number; current_multiplier: number; next_multiplier: number; mine_positions?: number[]; }
export interface MinesCashoutResult { success: boolean; payout: number; multiplier: number; balance_after: number; mine_positions: number[]; }
export interface SunMoonResult      { result: "sun" | "moon" | "tie"; }
export interface SunMoonSettleResult{ success: boolean; result: string; won: boolean; payout: number; profit: number; balance_after: number; }
export interface TradingSettleResult{ success: boolean; won: boolean; payout: number; profit: number; balance_after: number; }

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
  /**
   * Crash — fetch server-generated bust point for a round.
   * Called BEFORE a round starts; idempotent (returns same value on retry).
   */
  crashGetBustPoint(roundId: number): Promise<CrashBustResult> {
    return get<CrashBustResult>({ action: "crash_get_bust", round_id: String(roundId) });
  },

  /**
   * Crash — record a played bet after the round ends.
   * Server verifies bust_point against its stored value and atomically
   * credits winnings. Returns updated balance_after.
   */
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

  /**
   * Mines — create a new session. Server generates mine positions (kept secret).
   * Stakes deducted server-side; returns session_id and new balance.
   */
  minesStart(userId: string, mineCount: number, stake: number): Promise<MinesStartResult> {
    return post<MinesStartResult>({ game_type: "mines_start", user_id: userId, mine_count: mineCount, stake });
  },

  /**
   * Mines — reveal a tile. Server decides hit/safe based on stored mine positions.
   * On mine hit, mine_positions are revealed in the response.
   */
  minesReveal(userId: string, sessionId: string, tileIndex: number): Promise<MinesRevealResult> {
    return post<MinesRevealResult>({ game_type: "mines_reveal", user_id: userId, session_id: sessionId, tile_index: tileIndex });
  },

  /**
   * Mines — cash out an active session. Server credits balance and reveals mine positions.
   */
  minesCashout(userId: string, sessionId: string): Promise<MinesCashoutResult> {
    return post<MinesCashoutResult>({ game_type: "mines_cashout", user_id: userId, session_id: sessionId });
  },

  /**
   * Sun vs Moon — get the authoritative server result for a round.
   * Idempotent: same round_id always returns the same result.
   */
  sunMoonGetResult(roundId: number): Promise<SunMoonResult> {
    return get<SunMoonResult>({ action: "sunvsmoon_result", round_id: String(roundId) });
  },

  /**
   * Sun vs Moon — settle a player bet. Server reconciles balance after
   * the client's optimistic stake debit.
   */
  sunMoonSettle(userId: string, roundId: number, bet: "sun" | "moon" | "tie", stake: number): Promise<SunMoonSettleResult> {
    return post<SunMoonSettleResult>({ game_type: "sunvsmoon_settle", user_id: userId, round_id: roundId, bet, stake });
  },

  /**
   * Trading — settle a binary bet. Server compares entry/exit prices,
   * reconciles balance after the client's optimistic stake debit.
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
