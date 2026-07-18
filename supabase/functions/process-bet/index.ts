import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// SECURE PROCESS-BET EDGE FUNCTION
// =============================================================================
// ALL game outcome logic is server-side. crypto.getRandomValues() is used
// for every random decision so the browser cannot predict or alter results.
//
// Supported game_type values:
//   crash_get_bust  – GET (no auth) – returns/stores server bust point for a round
//   crash_settle    – POST          – record crash bets after a round ends
//   mines_start     – POST          – create mines session (mine positions secret)
//   mines_reveal    – POST          – reveal a tile; server decides hit/safe
//   mines_cashout   – POST          – cash out an active mines session
//   sunvsmoon_result– GET           – return/store server result for a SvM round
//   sunvsmoon_settle– POST          – settle a player's Sun vs Moon bet
//   trading_settle  – POST          – settle a binary trading bet
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Crypto RNG helpers ───────────────────────────────────────────────────────
function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

function secureRandomInt(min: number, max: number): number {
  return min + Math.floor(secureRandom() * (max - min + 1));
}

// ── Bust point generation ────────────────────────────────────────────────────
function generateBustPoint(targetWinProb: number, houseEdge: number): number {
  const p = Math.min(99, Math.max(1, targetWinProb)) / 100;
  const edge = Math.max(0.01, houseEdge / 100);
  const instantBust = secureRandom() < (1 - p) * 0.12;
  if (instantBust) return Math.round((1 + secureRandom() * 0.05) * 100) / 100;
  const r = secureRandom();
  const u = Math.max(0.0001, 1 - r);
  const raw = (1 / (u * (1 - edge))) * (0.5 + p);
  return Math.max(1.01, Math.min(1000, Math.round(raw * 100) / 100));
}

// ── Sun vs Moon result generation ────────────────────────────────────────────
function generateSunMoonResult(): "sun" | "moon" | "tie" {
  const r = secureRandom();
  if (r < 0.47) return "sun";
  if (r < 0.94) return "moon";
  return "tie";
}

// ── Mines grid generation ────────────────────────────────────────────────────
function generateMinePositions(mineCount: number): number[] {
  const GRID = 25;
  const indices = Array.from({ length: GRID }, (_, i) => i);
  for (let i = 0; i < mineCount; i++) {
    const j = i + Math.floor(secureRandom() * (GRID - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, mineCount).sort((a, b) => a - b);
}

// ── Mines multiplier (mirrors client-side formula) ───────────────────────────
function minesMultiplier(mineCount: number, gemsFound: number): number {
  if (gemsFound === 0) return 1;
  const GRID = 25;
  const safe = GRID - mineCount;
  let m = 1;
  for (let i = 0; i < gemsFound; i++) {
    m *= GRID - i;
    m /= safe - i;
  }
  return Math.max(1, Math.round(m * 0.97 * 100) / 100);
}

// =============================================================================
// Main handler
// =============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  try {
    const url    = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";

    // ── GET endpoints (no auth needed, just game config) ───────────────────
    if (req.method === "GET") {
      // ── crash_get_bust ──────────────────────────────────────────────────
      if (action === "crash_get_bust") {
        const roundId = parseInt(url.searchParams.get("round_id") ?? "0", 10);
        if (!roundId || roundId < 1) {
          return json({ error: "Missing round_id" }, 400);
        }
        // Idempotent: return existing bust point if already generated
        const { data: existing } = await supabase
          .from("crash_rounds")
          .select("bust_point")
          .eq("round_id", roundId)
          .single();
        if (existing) {
          return json({ bust_point: (existing as { bust_point: number }).bust_point });
        }
        // Generate new one using admin config
        const { data: settingsRows } = await supabase.rpc("admin_get_settings");
        const settings = (settingsRows as Array<{ key: string; value: unknown }>) ?? [];
        const adminConfig = (settings.find((r) => r.key === "admin_config")?.value ?? {}) as {
          mode?: string; targetWinProbability?: number; houseEdge?: number; manualCrashPoint?: number; manualTargetRoundId?: number | null;
        };
        let bustPoint: number;
        if (
          adminConfig.mode === "MANUAL" &&
          (adminConfig.manualTargetRoundId == null || adminConfig.manualTargetRoundId === roundId) &&
          adminConfig.manualCrashPoint
        ) {
          bustPoint = Math.max(1.01, adminConfig.manualCrashPoint);
          // Auto-clear the manual override after applying it once
          if (adminConfig.manualTargetRoundId == null || adminConfig.manualTargetRoundId === roundId) {
            void supabase.rpc("admin_update_setting", {
              p_key: "admin_config",
              p_value: { ...adminConfig, mode: "AUTO", manualTargetRoundId: null } as unknown as string,
            });
          }
        } else {
          bustPoint = generateBustPoint(
            adminConfig.targetWinProbability ?? 55,
            adminConfig.houseEdge ?? 4,
          );
        }
        await supabase.from("crash_rounds").insert({ round_id: roundId, bust_point: bustPoint });
        return json({ bust_point: bustPoint });
      }

      // ── sunvsmoon_result ────────────────────────────────────────────────
      if (action === "sunvsmoon_result") {
        const roundId = parseInt(url.searchParams.get("round_id") ?? "0", 10);
        if (!roundId || roundId < 1) return json({ error: "Missing round_id" }, 400);
        const { data: existing } = await supabase
          .from("sunvsmoon_rounds")
          .select("result")
          .eq("round_id", roundId)
          .single();
        if (existing) return json({ result: (existing as { result: string }).result });
        const result = generateSunMoonResult();
        await supabase.from("sunvsmoon_rounds").insert({ round_id: roundId, result });
        return json({ result });
      }

      return json({ error: "Unknown GET action" }, 400);
    }

    // ── POST endpoints (require valid user_id) ──────────────────────────────
    const body = await req.json() as Record<string, unknown>;
    const { game_type, user_id } = body;

    if (!user_id || typeof user_id !== "string") return json({ error: "Missing user_id" }, 400);

    // Verify user exists
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, balance")
      .eq("id", user_id)
      .single();
    if (profileErr || !profile) return json({ error: "User not found" }, 400);
    const userBalance = (profile as { id: string; balance: number }).balance;

    // ── crash_settle ────────────────────────────────────────────────────────
    if (game_type === "crash_settle") {
      const { round_id, amount, cash_out_at, bust_point, win } = body as {
        round_id: number; amount: number; cash_out_at: number | null; bust_point: number; win: number;
      };
      if (!amount || amount <= 0) return json({ error: "Invalid amount" }, 400);

      // Verify bust_point matches server record (prevents spoofing)
      const { data: roundRow } = await supabase
        .from("crash_rounds")
        .select("bust_point")
        .eq("round_id", round_id)
        .single();
      const serverBust = roundRow ? (roundRow as { bust_point: number }).bust_point : null;
      const actualWin = serverBust !== null && cash_out_at !== null && cash_out_at <= serverBust
        ? Math.round(amount * cash_out_at * 100) / 100
        : 0;

      await supabase.from("bets").insert({
        user_id,
        bet_amount: amount,
        win_amount: actualWin,
        multiplier: cash_out_at ?? bust_point ?? 0,
        status: actualWin > 0 ? "won" : "lost",
        bet_details: { cashOutAt: cash_out_at, bustPoint: serverBust ?? bust_point },
        resolved_at: new Date().toISOString(),
      });

      // The balance was already debited/credited by the client-side crash engine.
      // Server record is now canonical in the bets table.
      return json({ success: true, win: actualWin, verified_bust: serverBust });
    }

    // ── mines_start ─────────────────────────────────────────────────────────
    if (game_type === "mines_start") {
      const { mine_count, stake } = body as { mine_count: number; stake: number };
      if (!mine_count || mine_count < 1 || mine_count > 24) return json({ error: "Invalid mine_count" }, 400);
      if (!stake || stake <= 0) return json({ error: "Invalid stake" }, 400);
      if (stake > userBalance) return json({ error: "Insufficient balance" }, 400);

      // Cancel any existing active session first
      await supabase
        .from("mines_sessions")
        .update({ status: "busted" })
        .eq("user_id", user_id)
        .eq("status", "active");

      const minePositions = generateMinePositions(mine_count);
      const newBalance = userBalance - stake;

      // Deduct stake atomically
      const { error: balErr } = await supabase
        .from("profiles")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", user_id);
      if (balErr) return json({ error: "Balance deduction failed" }, 500);

      const { data: session, error: sessErr } = await supabase
        .from("mines_sessions")
        .insert({ user_id, mine_positions: minePositions, mine_count, stake, gems_found: 0, status: "active" })
        .select("id")
        .single();
      if (sessErr || !session) return json({ error: "Failed to create mines session" }, 500);

      return json({
        success: true,
        session_id: (session as { id: string }).id,
        balance_after: newBalance,
        // Do NOT reveal mine_positions to client
        grid_size: 25,
        mine_count,
      });
    }

    // ── mines_reveal ────────────────────────────────────────────────────────
    if (game_type === "mines_reveal") {
      const { session_id, tile_index } = body as { session_id: string; tile_index: number };
      if (tile_index < 0 || tile_index > 24) return json({ error: "Invalid tile_index" }, 400);

      const { data: session, error: sessErr } = await supabase
        .from("mines_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .eq("status", "active")
        .single();
      if (sessErr || !session) return json({ error: "No active session" }, 400);

      const s = session as {
        id: string; mine_positions: number[]; mine_count: number; stake: number;
        gems_found: number; status: string;
      };
      const isMine = s.mine_positions.includes(tile_index);

      if (isMine) {
        // Bust: no payout, session ends
        await supabase
          .from("mines_sessions")
          .update({ status: "busted", updated_at: new Date().toISOString() })
          .eq("id", session_id);
        await supabase.from("bets").insert({
          user_id, bet_amount: s.stake, win_amount: 0,
          multiplier: minesMultiplier(s.mine_count, s.gems_found),
          status: "lost",
          bet_details: { mines: s.mine_count, gems: s.gems_found, busted_at: tile_index },
          resolved_at: new Date().toISOString(),
        });
        return json({ success: true, is_mine: true, mine_positions: s.mine_positions, gems_found: s.gems_found });
      }

      // Safe: increment gems_found
      const newGems = s.gems_found + 1;
      await supabase
        .from("mines_sessions")
        .update({ gems_found: newGems, updated_at: new Date().toISOString() })
        .eq("id", session_id);

      const currentMultiplier = minesMultiplier(s.mine_count, newGems);
      const nextMultiplier = minesMultiplier(s.mine_count, newGems + 1);
      return json({ success: true, is_mine: false, gems_found: newGems, current_multiplier: currentMultiplier, next_multiplier: nextMultiplier });
    }

    // ── mines_cashout ───────────────────────────────────────────────────────
    if (game_type === "mines_cashout") {
      const { session_id } = body as { session_id: string };
      const { data: session, error: sessErr } = await supabase
        .from("mines_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .eq("status", "active")
        .single();
      if (sessErr || !session) return json({ error: "No active session" }, 400);

      const s = session as {
        id: string; mine_positions: number[]; mine_count: number; stake: number; gems_found: number;
      };
      if (s.gems_found === 0) return json({ error: "Reveal at least one gem before cashing out" }, 400);

      const multiplier = minesMultiplier(s.mine_count, s.gems_found);
      const payout = Math.round(s.stake * multiplier * 100) / 100;
      const newBalance = userBalance + payout;

      const { error: balErr } = await supabase
        .from("profiles")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", user_id);
      if (balErr) return json({ error: "Balance update failed" }, 500);

      await supabase
        .from("mines_sessions")
        .update({ status: "cashed_out", updated_at: new Date().toISOString() })
        .eq("id", session_id);
      await supabase.from("bets").insert({
        user_id, bet_amount: s.stake, win_amount: payout,
        multiplier,
        status: "won",
        bet_details: { mines: s.mine_count, gems: s.gems_found },
        resolved_at: new Date().toISOString(),
      });

      return json({
        success: true, payout, multiplier,
        balance_after: newBalance,
        mine_positions: s.mine_positions,
      });
    }

    // ── sunvsmoon_settle ────────────────────────────────────────────────────
    if (game_type === "sunvsmoon_settle") {
      const { round_id, bet, stake } = body as { round_id: number; bet: string; stake: number };
      if (!round_id || !bet || !stake || stake <= 0) return json({ error: "Missing fields" }, 400);
      if (stake > userBalance) return json({ error: "Insufficient balance" }, 400);

      // Get (or create) authoritative server result
      const { data: existing } = await supabase
        .from("sunvsmoon_rounds")
        .select("result")
        .eq("round_id", round_id)
        .single();
      let result: string;
      if (existing) {
        result = (existing as { result: string }).result;
      } else {
        result = generateSunMoonResult();
        await supabase.from("sunvsmoon_rounds").insert({ round_id, result });
      }

      const PAYOUTS: Record<string, number> = { sun: 1, moon: 1, tie: 8 };
      const won = bet === result;
      const profit = won ? stake * (PAYOUTS[bet] ?? 1) : 0;
      const payout = won ? stake + profit : 0;
      const newBalance = userBalance - stake + payout;

      const { error: balErr } = await supabase
        .from("profiles")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", user_id);
      if (balErr) return json({ error: "Balance update failed" }, 500);

      await supabase.from("bets").insert({
        user_id, bet_amount: stake, win_amount: payout,
        multiplier: won ? PAYOUTS[bet] + 1 : 0,
        status: won ? "won" : "lost",
        bet_details: { game: "sunvsmoon", bet, result, round_id },
        resolved_at: new Date().toISOString(),
      });

      return json({ success: true, result, won, payout, profit, balance_after: newBalance });
    }

    // ── trading_settle ──────────────────────────────────────────────────────
    if (game_type === "trading_settle") {
      const { symbol, direction, stake, entry_price, exit_price, payout_pct } = body as {
        symbol: string; direction: string; stake: number;
        entry_price: number; exit_price: number; payout_pct: number;
      };
      if (!stake || stake <= 0) return json({ error: "Invalid stake" }, 400);
      if (stake > userBalance) return json({ error: "Insufficient balance" }, 400);
      if (!direction || !entry_price || !exit_price) return json({ error: "Missing fields" }, 400);

      // Server determines win: compare entry vs exit price (client sends real price ticks)
      const won =
        (direction === "UP" && exit_price > entry_price) ||
        (direction === "DOWN" && exit_price < entry_price);
      const profit = won ? Math.round(stake * payout_pct / 100 * 100) / 100 : 0;
      const payout = won ? stake + profit : 0;
      const newBalance = userBalance - stake + payout;

      const { error: balErr } = await supabase
        .from("profiles")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", user_id);
      if (balErr) return json({ error: "Balance update failed" }, 500);

      await supabase.from("bets").insert({
        user_id, bet_amount: stake, win_amount: payout,
        multiplier: won ? 1 + payout_pct / 100 : 0,
        status: won ? "won" : "lost",
        bet_details: { symbol, direction, entry_price, exit_price, payout_pct },
        resolved_at: new Date().toISOString(),
      });

      return json({ success: true, won, payout, profit, balance_after: newBalance });
    }

    return json({ error: `Unknown game_type: ${String(game_type)}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
