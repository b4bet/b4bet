// process-bet — Supabase Edge Function
// Handles all game bet processing + Aviator round lifecycle
// FIX: admin_config is now read per-game (nested object), not flat

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Secure random (crypto-based) ─────────────────────────────────────────────
function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xFFFFFFFF;
}

// ── Bust point generation ─────────────────────────────────────────────────────
// Used for Aviator + Crash games in AUTO mode
function generateBustPoint(targetWinProb: number, houseEdge: number): number {
  const p = Math.min(99, Math.max(1, targetWinProb)) / 100;
  const edge = Math.max(0.01, houseEdge / 100);
  // ~12% instant bust chance based on lose probability
  const instantBust = secureRandom() < (1 - p) * 0.12;
  if (instantBust) return 1.00;
  // Generate multiplier using inverse CDF
  const u = secureRandom();
  const raw = 1 / (1 - u * p) * (1 - edge);
  // Clamp between 1.01 and 200x
  return Math.min(200, Math.max(1.01, parseFloat(raw.toFixed(2))));
}

// Phase durations (must match client constants)
const AV_WAIT_MS       = 6_000;   // 6s waiting
const AV_CRASH_HOLD_MS = 3_000;   // 3s hold after crash

// =============================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const action: string = body.action ?? "";

    // ── Fetch admin config once (used by multiple actions) ───────────────────
    async function getGameAdminConfig(gameKey: string): Promise<{
      mode: string;
      targetWinProbability: number;
      houseEdge: number;
      manualCrashPoint: number;
      manualTargetRoundId: number | null;
      manualResult: string;
    }> {
      const { data: settingsRows } = await supabase.rpc("admin_get_settings");
      const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
      const adminConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};
      // FIX: read per-game nested config, not flat
      const gameConfig = (adminConfig as Record<string, Record<string, unknown>>)[gameKey] ?? {};
      return {
        mode: (gameConfig.mode as string) ?? "AUTO",
        targetWinProbability: (gameConfig.targetWinProbability as number) ?? 55,
        houseEdge: (gameConfig.houseEdge as number) ?? 5,
        manualCrashPoint: (gameConfig.manualCrashPoint as number) ?? 2.0,
        manualTargetRoundId: (gameConfig.manualTargetRoundId as number | null) ?? null,
        manualResult: (gameConfig.manualResult as string) ?? "",
      };
    }

    // =========================================================================
    // ── AVIATOR: Round lifecycle ticker ──────────────────────────────────────
    // Called every second by the client (poll tick)
    // =========================================================================
    if (action === "aviator_game_loop") {
      const { data: rows } = await supabase
        .from("aviator_current_round")
        .select("*")
        .eq("id", 1)
        .single();

      if (!rows) {
        // First time: insert singleton row
        await supabase.from("aviator_current_round").insert({
          id: 1,
          phase: "waiting",
          phase_started_at: new Date().toISOString(),
          crash_point: null,
          elapsed_ms: 0,
        });
        return new Response(JSON.stringify({ phase: "waiting", elapsed_ms: 0, crash_point: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const r = rows;
      const now = Date.now();
      const elapsed = now - new Date(r.phase_started_at).getTime();

      if (r.phase === "waiting" && elapsed >= AV_WAIT_MS) {
        // Transition: waiting → flying
        // Generate crash point NOW (server side) and store it (hidden during flight)
        const cfg = await getGameAdminConfig("aviator");
        let bustPoint: number;
        if (
          cfg.mode === "MANUAL" &&
          (cfg.manualTargetRoundId == null || cfg.manualTargetRoundId === r.id) &&
          cfg.manualCrashPoint >= 1.01
        ) {
          bustPoint = parseFloat(cfg.manualCrashPoint.toFixed(2));
          // Clear manualTargetRoundId after use if set
          if (cfg.manualTargetRoundId != null) {
            const { data: settingsRows } = await supabase.rpc("admin_get_settings");
            const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
            const fullConfig = settings.find((r2) => r2.key === "admin_config")?.value ?? {};
            await supabase.rpc("admin_update_setting", {
              p_key: "admin_config",
              p_value: JSON.parse(JSON.stringify({
                ...fullConfig,
                aviator: { ...cfg, manualTargetRoundId: null },
              })),
            }).catch(() => {});
          }
        } else {
          bustPoint = generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
        }

        const newStart = new Date().toISOString();
        const newUuid = crypto.randomUUID();
        await supabase
          .from("aviator_current_round")
          .update({
            phase: "flying",
            phase_started_at: newStart,
            crash_point: bustPoint,   // stored but NOT sent to client during flight
            elapsed_ms: 0,
            round_uuid: newUuid,
          })
          .eq("id", 1);

        return new Response(JSON.stringify({
          phase: "flying",
          elapsed_ms: 0,
          crash_point: null,   // NEVER reveal during flight
          round_uuid: newUuid,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (r.phase === "flying") {
        // Check if multiplier has reached crash point
        // Multiplier grows as: M = e^(elapsed_ms / 6000)
        // So crash happens when elapsed_ms = ln(crash_point) * 6000
        const flightDuration = r.crash_point ? Math.log(Number(r.crash_point)) * 6000 : 99999;
        if (elapsed >= flightDuration) {
          // Transition: flying → crashed
          const newStart = new Date().toISOString();
          await supabase
            .from("aviator_current_round")
            .update({
              phase: "crashed",
              phase_started_at: newStart,
              last_crash_point: r.crash_point,
              elapsed_ms: 0,
            })
            .eq("id", 1);

          return new Response(JSON.stringify({
            phase: "crashed",
            elapsed_ms: 0,
            crash_point: r.crash_point,   // safe to reveal — round is over
            last_crash_point: r.crash_point,
            round_uuid: r.round_uuid,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (r.phase === "crashed" && elapsed >= AV_CRASH_HOLD_MS) {
        // Transition: crashed → waiting (new round)
        const newStart = new Date().toISOString();
        await supabase
          .from("aviator_current_round")
          .update({
            phase: "waiting",
            phase_started_at: newStart,
            crash_point: null,
            elapsed_ms: 0,
            round_uuid: crypto.randomUUID(),
          })
          .eq("id", 1);

        return new Response(JSON.stringify({
          phase: "waiting",
          elapsed_ms: 0,
          crash_point: null,
          last_crash_point: r.crash_point ?? r.last_crash_point,
          round_uuid: r.round_uuid,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // No transition — return current state
      const responsePayload: Record<string, unknown> = {
        phase: r.phase,
        elapsed_ms: elapsed,
        round_uuid: r.round_uuid,
        last_crash_point: r.last_crash_point,
      };
      // Only reveal crash_point after crash
      if (r.phase === "crashed") {
        responsePayload.crash_point = r.crash_point;
      } else {
        responsePayload.crash_point = null;
      }

      return new Response(JSON.stringify(responsePayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ── AVIATOR: Get current round (for initial load / polling) ──────────────
    // =========================================================================
    if (action === "aviator_get_current_round") {
      const { data: r } = await supabase
        .from("aviator_current_round")
        .select("*")
        .eq("id", 1)
        .single();

      if (!r) {
        return new Response(JSON.stringify({ phase: "waiting", elapsed_ms: 0, crash_point: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const elapsed = Date.now() - new Date(r.phase_started_at).getTime();
      const payload: Record<string, unknown> = {
        phase: r.phase,
        elapsed_ms: elapsed,
        round_uuid: r.round_uuid,
        last_crash_point: r.last_crash_point,
        crash_point: r.phase === "crashed" ? r.crash_point : null,
      };

      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ── AVIATOR: Round status (legacy polling endpoint) ───────────────────────
    // =========================================================================
    if (action === "aviator_round_status") {
      const { data: r } = await supabase
        .from("aviator_current_round")
        .select("*")
        .eq("id", 1)
        .single();

      if (!r) return new Response(JSON.stringify({ phase: "waiting" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const elapsed = Date.now() - new Date(r.phase_started_at).getTime();
      return new Response(JSON.stringify({
        phase: r.phase,
        elapsed_ms: elapsed,
        crash_point: r.phase === "crashed" ? r.crash_point : null,
        last_crash_point: r.last_crash_point,
        round_uuid: r.round_uuid,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // =========================================================================
    // ── AVIATOR: Place bet ────────────────────────────────────────────────────
    // =========================================================================
    if (action === "aviator_place_bet") {
      const { user_id, bet_amount, round_uuid } = body;
      if (!user_id || !bet_amount || bet_amount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid bet" }), { status: 400, headers: corsHeaders });
      }

      // Check user balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();

      if (!profile || profile.balance < bet_amount) {
        return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400, headers: corsHeaders });
      }

      // Deduct balance
      await supabase
        .from("profiles")
        .update({ balance: profile.balance - bet_amount })
        .eq("id", user_id);

      // Get current round
      const { data: round } = await supabase
        .from("aviator_current_round")
        .select("round_uuid, phase")
        .eq("id", 1)
        .single();

      if (!round || round.phase !== "waiting") {
        // Refund — round not in waiting phase
        await supabase
          .from("profiles")
          .update({ balance: profile.balance })
          .eq("id", user_id);
        return new Response(JSON.stringify({ error: "Round not accepting bets" }), { status: 400, headers: corsHeaders });
      }

      // Record bet
      const { data: gameRow } = await supabase.from("games").select("id").eq("slug", "aviator").single();
      const { data: bet } = await supabase
        .from("bets")
        .insert({
          user_id,
          game_id: gameRow?.id,
          round_id: round.round_uuid,
          bet_amount,
          bet_details: { round_uuid: round_uuid ?? round.round_uuid },
          status: "pending",
        })
        .select()
        .single();

      return new Response(JSON.stringify({ success: true, bet_id: bet?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ── AVIATOR: Cash out ─────────────────────────────────────────────────────
    // =========================================================================
    if (action === "aviator_cashout") {
      const { user_id, bet_id, cashout_multiplier } = body;
      if (!user_id || !bet_id || !cashout_multiplier) {
        return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: corsHeaders });
      }

      // Get current round state
      const { data: round } = await supabase
        .from("aviator_current_round")
        .select("phase, crash_point, round_uuid")
        .eq("id", 1)
        .single();

      if (!round || round.phase !== "flying") {
        return new Response(JSON.stringify({ error: "Cannot cashout now" }), { status: 400, headers: corsHeaders });
      }

      // Validate cashout multiplier is below crash point
      if (round.crash_point && cashout_multiplier > Number(round.crash_point)) {
        return new Response(JSON.stringify({ error: "Crashed before cashout" }), { status: 400, headers: corsHeaders });
      }

      // Get bet
      const { data: bet } = await supabase
        .from("bets")
        .select("*")
        .eq("id", bet_id)
        .eq("user_id", user_id)
        .eq("status", "pending")
        .single();

      if (!bet) {
        return new Response(JSON.stringify({ error: "Bet not found" }), { status: 400, headers: corsHeaders });
      }

      const win_amount = Math.floor(bet.bet_amount * cashout_multiplier);

      // Update bet
      await supabase
        .from("bets")
        .update({
          status: "won",
          multiplier: cashout_multiplier,
          win_amount,
          resolved_at: new Date().toISOString(),
          bet_details: { ...bet.bet_details, cashOutAt: cashout_multiplier, bustPoint: round.crash_point },
        })
        .eq("id", bet_id);

      // Credit winnings
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();

      await supabase
        .from("profiles")
        .update({ balance: (profile?.balance ?? 0) + win_amount })
        .eq("id", user_id);

      return new Response(JSON.stringify({ success: true, win_amount, multiplier: cashout_multiplier }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ── AVIATOR: Settle lost bets (called on crash) ───────────────────────────
    // =========================================================================
    if (action === "aviator_settle_lost") {
      const { round_uuid } = body;
      if (!round_uuid) return new Response(JSON.stringify({ error: "Missing round_uuid" }), { status: 400, headers: corsHeaders });

      // Mark all pending bets for this round as lost
      await supabase
        .from("bets")
        .update({ status: "lost", resolved_at: new Date().toISOString() })
        .eq("status", "pending")
        .filter("bet_details->>round_uuid", "eq", round_uuid);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ── CRASH GAME: Place bet + resolve ──────────────────────────────────────
    // =========================================================================
    if (action === "crash_place_bet") {
      const { user_id, bet_amount, cashout_at, round_id } = body;
      if (!user_id || !bet_amount || !cashout_at) {
        return new Response(JSON.stringify({ error: "Invalid bet" }), { status: 400, headers: corsHeaders });
      }

      const cfg = await getGameAdminConfig("crash");
      let bustPoint: number;
      if (
        cfg.mode === "MANUAL" &&
        (cfg.manualTargetRoundId == null || cfg.manualTargetRoundId === round_id) &&
        cfg.manualCrashPoint >= 1.01
      ) {
        bustPoint = parseFloat(cfg.manualCrashPoint.toFixed(2));
      } else {
        bustPoint = generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
      }

      const won = cashout_at <= bustPoint;
      const win_amount = won ? Math.floor(bet_amount * cashout_at) : 0;

      // Check and deduct balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();

      if (!profile || profile.balance < bet_amount) {
        return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400, headers: corsHeaders });
      }

      const newBalance = won ? profile.balance - bet_amount + win_amount : profile.balance - bet_amount;
      await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);

      // Record bet
      const { data: gameRow } = await supabase.from("games").select("id").eq("slug", "crash").single();
      await supabase.from("bets").insert({
        user_id,
        game_id: gameRow?.id,
        bet_amount,
        win_amount,
        multiplier: won ? cashout_at : 1,
        status: won ? "won" : "lost",
        bet_details: { bustPoint, cashOutAt: cashout_at },
        resolved_at: new Date().toISOString(),
      });

      // Record round
      await supabase.from("crash_rounds").insert({ round_id: round_id ?? 0, bust_point: bustPoint });

      return new Response(JSON.stringify({ success: true, won, bustPoint, win_amount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ── ADMIN: Get next round crash point preview ─────────────────────────────
    // Allows admin to see what the next crash point will be
    // =========================================================================
    if (action === "admin_preview_next_round") {
      const { game } = body;
      const gameKey = game ?? "aviator";
      const cfg = await getGameAdminConfig(gameKey);

      if (cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01) {
        const preview = parseFloat(cfg.manualCrashPoint.toFixed(2));
        return new Response(JSON.stringify({ mode: cfg.mode, preview, gameKey }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Generate 5 sample values to give admin a sense of range
        const samples = Array.from({ length: 5 }, () =>
          generateBustPoint(cfg.targetWinProbability, cfg.houseEdge)
        );
        return new Response(JSON.stringify({ mode: cfg.mode, preview: samples[0], samples, gameKey }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // =========================================================================
    // ── WINGO / K3 / 5D / SunVsMoon: Place bet ───────────────────────────────
    // =========================================================================
    if (action === "place_bet") {
      const { user_id, game_slug, bet_amount, bet_details, round_id } = body;
      if (!user_id || !game_slug || !bet_amount) {
        return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: corsHeaders });
      }

      const cfg = await getGameAdminConfig(game_slug);

      // Check balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();

      if (!profile || profile.balance < bet_amount) {
        return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400, headers: corsHeaders });
      }

      const { data: game } = await supabase.from("games").select("id").eq("slug", game_slug).single();

      // Record bet as pending
      const { data: bet } = await supabase.from("bets").insert({
        user_id,
        game_id: game?.id,
        bet_amount,
        bet_details: bet_details ?? {},
        status: "pending",
        round_id,
      }).select().single();

      // Deduct balance
      await supabase.from("profiles").update({ balance: profile.balance - bet_amount }).eq("id", user_id);

      return new Response(JSON.stringify({ success: true, bet_id: bet?.id, config_mode: cfg.mode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ── ADMIN: Set crash point for next round ─────────────────────────────────
    // =========================================================================
    if (action === "admin_set_next_crash") {
      const { game, crash_point, round_id } = body;
      const gameKey = game ?? "aviator";
      const cfg = await getGameAdminConfig(gameKey);

      const { data: settingsRows } = await supabase.rpc("admin_get_settings");
      const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
      const fullConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};

      await supabase.rpc("admin_update_setting", {
        p_key: "admin_config",
        p_value: JSON.parse(JSON.stringify({
          ...fullConfig,
          [gameKey]: {
            ...cfg,
            mode: "MANUAL",
            manualCrashPoint: crash_point,
            manualTargetRoundId: round_id ?? null,
          },
        })),
      });

      return new Response(JSON.stringify({ success: true, game: gameKey, crash_point }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ── Admin: Reset to AUTO mode ─────────────────────────────────────────────
    // =========================================================================
    if (action === "admin_reset_to_auto") {
      const { game } = body;
      const gameKey = game ?? "aviator";
      const cfg = await getGameAdminConfig(gameKey);

      const { data: settingsRows } = await supabase.rpc("admin_get_settings");
      const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
      const fullConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};

      await supabase.rpc("admin_update_setting", {
        p_key: "admin_config",
        p_value: JSON.parse(JSON.stringify({
          ...fullConfig,
          [gameKey]: { ...cfg, mode: "AUTO", manualTargetRoundId: null },
        })),
      });

      return new Response(JSON.stringify({ success: true, game: gameKey, mode: "AUTO" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("process-bet error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
