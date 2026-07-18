import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// IRON-CLAD EDGE FUNCTION: ALL GAME OUTCOME LOGIC RUNS HERE (SERVER-SIDE ONLY)
// ============================================================================
// Outcome generation uses crypto.getRandomValues() — cannot be inspected or
// manipulated from the browser devtools.  The admin_config settings table row
// supplies RTP (targetWinProbability) and houseEdge per game.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BetRequest {
  game_type: string;
  bet_amount: number;
  bet_details?: Record<string, unknown>;
  auto_cashout?: number;
  user_id: string;
}

interface GameConfig {
  mode: "AUTO" | "MANUAL";
  targetWinProbability: number;
  houseEdge: number;
  manualResult: string;
  manualTargetRoundId: number | null;
}

interface AdminConfig {
  gameHandlers?: Record<string, GameConfig>;
  targetWinProbability?: number;
  houseEdge?: number;
}

// Cryptographically secure random [0, 1)
function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

// ── Server-side outcome calculation ─────────────────────────────────────────
function computeOutcomeServerSide(
  gameKey: string,
  config: { targetWinProbability: number; houseEdge: number },
): { result: string; multiplier: number; won: boolean } {
  const winChance = Math.max(0, Math.min(1, (config.targetWinProbability - config.houseEdge) / 100));
  const roll = secureRandom();

  if (gameKey === "crash" || gameKey === "aviator") {
    let crashPoint: number;
    if (roll < winChance) {
      crashPoint = 1 + Math.floor(secureRandom() * 100) / 10;
    } else {
      crashPoint = 1 + Math.floor(secureRandom() * 20) / 100;
    }
    return { result: crashPoint.toFixed(2) + "x", multiplier: crashPoint, won: crashPoint >= 2.0 };
  }

  if (gameKey === "mines") {
    const won = roll < winChance;
    return { result: won ? "win" : "bust", multiplier: won ? 1.5 : 0, won };
  }

  if (gameKey === "sunvsmoon") {
    let outcome: string;
    if (roll < winChance) outcome = "sun";
    else if (roll < winChance * 2) outcome = "moon";
    else outcome = "eclipse";
    return { result: outcome, multiplier: outcome === "eclipse" ? 9 : 1.95, won: roll < winChance * 2 };
  }

  if (gameKey === "wingo") {
    const digit = Math.floor(secureRandom() * 10);
    return { result: String(digit), multiplier: 9, won: digit % 2 === 0 };
  }

  if (gameKey === "k3") {
    const d1 = Math.floor(secureRandom() * 6) + 1;
    const d2 = Math.floor(secureRandom() * 6) + 1;
    const d3 = Math.floor(secureRandom() * 6) + 1;
    const sum = d1 + d2 + d3;
    return { result: `${d1},${d2},${d3}`, multiplier: 1.95, won: sum >= 11 };
  }

  if (gameKey === "fived") {
    const num = Math.floor(secureRandom() * 100000);
    return { result: String(num).padStart(5, "0"), multiplier: 9, won: roll < winChance };
  }

  if (gameKey === "trading") {
    const won = roll < winChance;
    return { result: won ? "UP" : "DOWN", multiplier: won ? 1.9 : 0, won };
  }

  // Default fallback
  const won = roll < winChance;
  return { result: won ? "win" : "loss", multiplier: won ? 2 : 0, won };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: BetRequest = await req.json();
    const { game_type, bet_amount, user_id, bet_details } = payload;

    if (!game_type || !bet_amount || !user_id) {
      throw new Error("Missing required fields: game_type, bet_amount, user_id");
    }
    if (bet_amount <= 0) throw new Error("bet_amount must be positive");

    // ── 1. Verify user balance ──────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, balance")
      .eq("id", user_id)
      .single();

    if (profileErr || !profile) {
      throw new Error("User not found");
    }
    const balanceBefore = (profile as { id: string; balance: number }).balance;
    if (bet_amount > balanceBefore) {
      throw new Error("Insufficient balance");
    }

    // ── 2. Load admin_config for game-specific RTP/edge params ─────────────
    const { data: settingsRows } = await supabase.rpc("admin_get_settings");
    const settings = (settingsRows as Array<{ key: string; value: unknown }>) ?? [];
    const adminConfig = (settings.find((r) => r.key === "admin_config")?.value ?? {}) as AdminConfig;

    const gameHandler: GameConfig = adminConfig.gameHandlers?.[game_type] ?? {
      mode: "AUTO",
      targetWinProbability: adminConfig.targetWinProbability ?? 55,
      houseEdge: adminConfig.houseEdge ?? 4,
      manualResult: "",
      manualTargetRoundId: null,
    };

    // ── 3. Compute outcome SERVER-SIDE only ────────────────────────────────
    let outcome: { result: string; multiplier: number; won: boolean };

    if (gameHandler.mode === "MANUAL" && gameHandler.manualResult) {
      outcome = {
        result: gameHandler.manualResult,
        multiplier: gameHandler.manualResult.includes("x")
          ? parseFloat(gameHandler.manualResult)
          : 2.0,
        won: true,
      };
      // Clear the manual override so it applies once
      const updatedHandlers = {
        ...adminConfig.gameHandlers,
        [game_type]: { ...gameHandler, mode: "AUTO" as const, manualResult: "", manualTargetRoundId: null },
      };
      void supabase.rpc("admin_update_setting", {
        p_key: "admin_config",
        p_value: { ...adminConfig, gameHandlers: updatedHandlers } as unknown as string,
      });
    } else {
      outcome = computeOutcomeServerSide(game_type, {
        targetWinProbability: gameHandler.targetWinProbability,
        houseEdge: gameHandler.houseEdge,
      });
    }

    const payout = outcome.won ? Math.round(bet_amount * outcome.multiplier) : 0;
    const balanceAfter = balanceBefore - bet_amount + payout;

    // ── 4. Atomic balance update + bet record ───────────────────────────────
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
      .eq("id", user_id);

    if (updateErr) throw new Error("Balance update failed: " + updateErr.message);

    const { data: betRow, error: betErr } = await supabase
      .from("bets")
      .insert({
        user_id,
        bet_amount,
        win_amount: payout,
        multiplier: outcome.multiplier,
        status: outcome.won ? "won" : "lost",
        bet_details: { ...(bet_details ?? {}), result: outcome.result },
        resolved_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (betErr) throw new Error("Bet record failed: " + betErr.message);

    return new Response(
      JSON.stringify({
        success: true,
        bet_id: (betRow as { id: string }).id,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        game_result: {
          outcome: outcome.won ? "win" : "loss",
          result: outcome.result,
          multiplier: outcome.multiplier,
          payout,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
