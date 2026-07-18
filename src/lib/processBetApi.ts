/**
 * processBetApi — client wrapper around the process-bet Supabase Edge Function.
 * ALL game outcomes are decided server-side. This module never computes win/loss.
 */
import { supabase } from '@/integrations/supabase/client';

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/process-bet`;

async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}

// ── Crash ────────────────────────────────────────────────────────────────────

/** GET endpoint — no auth needed, idempotent per round_id. */
export async function crashGetBust(roundId: number): Promise<number> {
  const res = await fetch(`${EDGE_URL}?action=crash_get_bust&round_id=${roundId}`);
  if (!res.ok) throw new Error(`crash_get_bust HTTP ${res.status}`);
  const data = await res.json() as { bust_point?: number; error?: string };
  if (data.error || data.bust_point === undefined) throw new Error(data.error ?? 'No bust_point');
  return data.bust_point;
}

export interface CrashSettleResult {
  success: boolean;
  win: number;
  verified_bust: number | null;
}

/** POST — records a crash bet against the server-stored bust point. */
export async function crashSettle(params: {
  round_id: number; amount: number;
  cash_out_at: number | null; bust_point: number; win: number;
}): Promise<CrashSettleResult> {
  const user_id = await getUserId();
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_type: 'crash_settle', user_id, ...params }),
  });
  if (!res.ok) throw new Error(`crash_settle HTTP ${res.status}`);
  return res.json() as Promise<CrashSettleResult>;
}

// ── Mines ────────────────────────────────────────────────────────────────────

export interface MinesStartResult {
  success: boolean;
  session_id: string;
  balance_after: number;
  grid_size: number;
  mine_count: number;
}

/** POST — server deducts stake, places mines, returns session id. */
export async function minesStart(mineCount: number, stake: number): Promise<MinesStartResult> {
  const user_id = await getUserId();
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_type: 'mines_start', user_id, mine_count: mineCount, stake }),
  });
  const data = await res.json() as MinesStartResult & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `mines_start HTTP ${res.status}`);
  return data;
}

export interface MinesRevealResult {
  success: boolean;
  is_mine: boolean;
  mine_positions?: number[];
  gems_found: number;
  current_multiplier?: number;
  next_multiplier?: number;
}

/** POST — reveals a tile; server decides hit/safe. */
export async function minesReveal(sessionId: string, tileIndex: number): Promise<MinesRevealResult> {
  const user_id = await getUserId();
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_type: 'mines_reveal', user_id, session_id: sessionId, tile_index: tileIndex }),
  });
  const data = await res.json() as MinesRevealResult & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `mines_reveal HTTP ${res.status}`);
  return data;
}

export interface MinesCashoutResult {
  success: boolean;
  payout: number;
  multiplier: number;
  balance_after: number;
  mine_positions: number[];
}

/** POST — cashes out active session; server credits payout and returns mine positions. */
export async function minesCashout(sessionId: string): Promise<MinesCashoutResult> {
  const user_id = await getUserId();
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_type: 'mines_cashout', user_id, session_id: sessionId }),
  });
  const data = await res.json() as MinesCashoutResult & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `mines_cashout HTTP ${res.status}`);
  return data;
}

// ── Sun vs Moon ──────────────────────────────────────────────────────────────

export interface SunMoonSettleResult {
  success: boolean;
  result: 'sun' | 'moon' | 'tie';
  won: boolean;
  payout: number;
  profit: number;
  balance_after: number;
}

/** POST — settle a Sun vs Moon bet; server decides result and handles balance atomically. */
export async function sunMoonSettle(params: {
  round_id: number; bet: string; stake: number;
}): Promise<SunMoonSettleResult> {
  const user_id = await getUserId();
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_type: 'sunvsmoon_settle', user_id, ...params }),
  });
  const data = await res.json() as SunMoonSettleResult & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `sunvsmoon_settle HTTP ${res.status}`);
  return data;
}

// ── Trading ──────────────────────────────────────────────────────────────────

export interface TradingSettleResult {
  success: boolean;
  won: boolean;
  payout: number;
  profit: number;
  balance_after: number;
}

/** POST — settle a binary trading bet; server handles balance atomically. */
export async function tradingSettle(params: {
  symbol: string; direction: string; stake: number;
  entry_price: number; exit_price: number; payout_pct: number;
}): Promise<TradingSettleResult> {
  const user_id = await getUserId();
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_type: 'trading_settle', user_id, ...params }),
  });
  const data = await res.json() as TradingSettleResult & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `trading_settle HTTP ${res.status}`);
  return data;
}
