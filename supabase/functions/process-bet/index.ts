// process-bet — Supabase Edge Function v5
// Supports GET (query params) + POST (JSON body)
// Supports both 'action' and 'game_type' fields

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xFFFFFFFF;
}

/**
 * generateBustPoint — proper heavy-tail distribution.
 * targetWinProb 55 means ~55% of rounds go above 1.00x
 * Crash range: 1.00x to 200x
 */
function generateBustPoint(targetWinProb: number, houseEdge: number): number {
  const edge = Math.max(0.01, houseEdge / 100);
  const p = Math.min(0.99, Math.max(0.01, targetWinProb / 100));

  // (1-p) fraction instant bust at 1.00x
  const u = secureRandom();
  if (u > p) return 1.00;

  // Surviving rounds: inverse-CDF gives 1x–200x heavy tail
  const v = secureRandom();
  const vCapped = Math.min(v, 1 - 1 / (200 / (1 - edge) + 1));
  const raw = (1 / (1 - vCapped)) * (1 - edge);
  return Math.min(200, Math.max(1.01, parseFloat(raw.toFixed(2))));
}

// Aviator timing constants
const AV_WAIT_MS       = 6_000;   // 6 s betting window
const AV_CRASH_HOLD_MS = 3_000;   // 3 s show crash result
const AV_CASHOUT_GRACE_MS = 800;  // 0.8 s race-condition grace

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "GET") {
      const url = new URL(req.url);
      url.searchParams.forEach((v, k) => { body[k] = v; });
    } else {
      try { body = await req.json(); } catch { body = {}; }
    }

    const action: string = (body.action as string) ?? (body.game_type as string) ?? "";

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    async function getGameAdminConfig(gameKey: string) {
      const { data: settingsRows } = await supabase.rpc("admin_get_settings");
      const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
      const adminConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};
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

    // ====================================================================
    // AVIATOR: Get current round (also advances phase if needed)
    // This is the main polling endpoint — clients call this every ~300ms.
    // It both reads AND advances the game state, so no separate game_loop
    // scheduler is needed.
    // ====================================================================
    if (action === "aviator_get_current_round" || action === "aviator_round_status" || action === "aviator_game_loop") {
      const { data: r } = await supabase
        .from("aviator_current_round").select("*").eq("id", 1).single();

      // First ever run: create the row
      if (!r) {
        await supabase.from("aviator_current_round").insert({
          id: 1, phase: "waiting",
          phase_started_at: new Date().toISOString(),
          crash_point: null, elapsed_ms: 0,
          round_uuid: crypto.randomUUID(),
        });
        return json({ phase: "waiting", elapsed_ms: 0, crash_point: null });
      }

      const now = Date.now();
      const elapsed = now - new Date(r.phase_started_at).getTime();

      // ── WAITING → FLYING (after 6 s)
      if (r.phase === "waiting" && elapsed >= AV_WAIT_MS) {
        const cfg = await getGameAdminConfig("aviator");
        const bustPoint = cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01
          ? parseFloat(cfg.manualCrashPoint.toFixed(2))
          : generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
        const newUuid = crypto.randomUUID();
        await supabase.from("aviator_current_round").update({
          phase: "flying",
          phase_started_at: new Date().toISOString(),
          crash_point: bustPoint,
          elapsed_ms: 0,
          round_uuid: newUuid,
        }).eq("id", 1);
        return json({ phase: "flying", elapsed_ms: 0, crash_point: null, round_uuid: newUuid, just_transitioned: true });
      }

      // ── FLYING → CRASHED (when flight duration reached)
      if (r.phase === "flying" && r.crash_point) {
        // Flight duration: plane flies for log(crashPoint)*6000 ms
        const flightDuration = Math.log(Number(r.crash_point)) * 6000;
        if (elapsed >= flightDuration) {
          await supabase.from("aviator_current_round").update({
            phase: "crashed",
            phase_started_at: new Date().toISOString(),
            last_crash_point: r.crash_point,
            elapsed_ms: 0,
          }).eq("id", 1);
          // Settle all pending bets for this round as lost
          if (r.round_uuid) {
            await supabase.from("bets")
              .update({ status: "lost", resolved_at: new Date().toISOString() })
              .eq("status", "pending")
              .filter("bet_details->>round_uuid", "eq", r.round_uuid);
            await supabase.from("bets")
              .update({ status: "lost", resolved_at: new Date().toISOString() })
              .eq("status", "pending")
              .eq("round_id", r.round_uuid);
          }
          return json({ phase: "crashed", elapsed_ms: 0, crash_point: r.crash_point, last_crash_point: r.crash_point, round_uuid: r.round_uuid, just_transitioned: true });
        }
      }

      // ── FLYING but crash_point null = bad state, fix it
      if (r.phase === "flying" && !r.crash_point) {
        const cfg = await getGameAdminConfig("aviator");
        const bustPoint = generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
        await supabase.from("aviator_current_round").update({
          crash_point: bustPoint,
          phase_started_at: new Date().toISOString(),
          elapsed_ms: 0,
        }).eq("id", 1);
        return json({ phase: "flying", elapsed_ms: 0, crash_point: null, round_uuid: r.round_uuid });
      }

      // ── CRASHED → WAITING (after 3 s hold)
      if (r.phase === "crashed" && elapsed >= AV_CRASH_HOLD_MS) {
        const newUuid = crypto.randomUUID();
        await supabase.from("aviator_current_round").update({
          phase: "waiting",
          phase_started_at: new Date().toISOString(),
          crash_point: null,
          elapsed_ms: 0,
          round_uuid: newUuid,
        }).eq("id", 1);
        return json({ phase: "waiting", elapsed_ms: 0, crash_point: null, last_crash_point: r.crash_point ?? r.last_crash_point, round_uuid: newUuid, just_transitioned: true });
      }

      // ── No transition needed: return current state
      return json({
        phase: r.phase,
        elapsed_ms: elapsed,
        round_uuid: r.round_uuid,
        last_crash_point: r.last_crash_point,
        crash_point: r.phase === "crashed" ? r.crash_point : null,
      });
    }

    // ── AVIATOR: Place bet ──────────────────────────────────────────────
    if (action === "aviator_place_bet") {
      const { user_id, bet_amount, round_uuid } = body;
      if (!user_id || !bet_amount || (bet_amount as number) <= 0)
        return json({ error: "Invalid bet" }, 400);

      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
      if (!profile || profile.balance < (bet_amount as number))
        return json({ error: "Insufficient balance" }, 400);

      const { data: round } = await supabase.from("aviator_current_round").select("round_uuid, phase").eq("id", 1).single();
      if (!round || round.phase !== "waiting") {
        return json({ error: "Round not accepting bets" }, 400);
      }

      await supabase.from("profiles").update({ balance: profile.balance - (bet_amount as number) }).eq("id", user_id);

      const { data: gameRow } = await supabase.from("games").select("id").eq("slug", "aviator").single();
      const { data: bet } = await supabase.from("bets").insert({
        user_id, game_id: gameRow?.id, round_id: round.round_uuid, bet_amount,
        bet_details: { round_uuid: round_uuid ?? round.round_uuid }, status: "pending",
      }).select().single();
      return json({ success: true, bet_id: bet?.id });
    }

    // ── AVIATOR: Cash out ───────────────────────────────────────────────
    if (action === "aviator_cashout") {
      const { user_id, bet_id, cashout_multiplier, round_uuid, round_id } = body;
      if (!user_id || !cashout_multiplier)
        return json({ error: "Missing params" }, 400);

      const { data: round } = await supabase
        .from("aviator_current_round")
        .select("phase, crash_point, round_uuid, phase_started_at")
        .eq("id", 1).single();

      const phaseElapsed = round ? Date.now() - new Date(round.phase_started_at).getTime() : Infinity;
      const canCashout = round && (
        round.phase === "flying" ||
        (round.phase === "crashed" && phaseElapsed < AV_CASHOUT_GRACE_MS)
      );

      if (!canCashout)
        return json({ error: "Cannot cashout now", phase: round?.phase }, 400);

      if (round.crash_point && (cashout_multiplier as number) > Number(round.crash_point))
        return json({ error: "Crashed before cashout", bustPoint: round.crash_point }, 400);

      let betData: Record<string, unknown> | null = null;
      if (bet_id) {
        const { data } = await supabase.from("bets").select("*").eq("id", bet_id as string).eq("user_id", user_id as string).eq("status", "pending").single();
        betData = data;
      }
      if (!betData) {
        const rv = round_uuid ?? round.round_uuid;
        const { data } = await supabase.from("bets").select("*").eq("user_id", user_id as string).eq("status", "pending").filter("bet_details->>round_uuid", "eq", rv).maybeSingle();
        betData = data;
      }
      if (!betData && round_id) {
        const { data } = await supabase.from("bets").select("*").eq("user_id", user_id as string).eq("status", "pending").eq("round_id", String(round_id)).maybeSingle();
        betData = data;
      }
      if (!betData) {
        const { data } = await supabase.from("bets").select("*").eq("user_id", user_id as string).eq("status", "pending").eq("round_id", round.round_uuid).maybeSingle();
        betData = data;
      }

      if (!betData) return json({ error: "Bet not found or already settled" }, 400);

      const bet = betData;
      const win_amount = Math.floor((bet.bet_amount as number) * (cashout_multiplier as number));

      await supabase.from("bets").update({
        status: "won", multiplier: cashout_multiplier, win_amount,
        resolved_at: new Date().toISOString(),
        bet_details: { ...(bet.bet_details as Record<string, unknown>), cashOutAt: cashout_multiplier, bustPoint: round.crash_point },
      }).eq("id", bet.id as string);

      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id as string).single();
      await supabase.from("profiles").update({ balance: (profile?.balance ?? 0) + win_amount }).eq("id", user_id as string);

      return json({ success: true, win_amount, multiplier: cashout_multiplier, bustPoint: round.crash_point });
    }

    // ── AVIATOR: Settle lost bets ───────────────────────────────────────
    if (action === "aviator_settle_lost" || action === "aviator_settle") {
      const { round_uuid, user_id } = body;
      let q = supabase.from("bets").update({ status: "lost", resolved_at: new Date().toISOString() }).eq("status", "pending");
      if (round_uuid) q = q.filter("bet_details->>round_uuid", "eq", round_uuid as string);
      if (user_id) q = q.eq("user_id", user_id as string);
      await q;
      return json({ success: true });
    }

    // ── CRASH: Get bust point ───────────────────────────────────────────
    if (action === "crash_get_bust") {
      const { round_id } = body;
      const cfg = await getGameAdminConfig("crash");
      let bustPoint: number;
      if (cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01) {
        bustPoint = parseFloat(cfg.manualCrashPoint.toFixed(2));
        const { data: settingsRows } = await supabase.rpc("admin_get_settings");
        const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
        const fullConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};
        await supabase.rpc("admin_update_setting", {
          p_key: "admin_config",
          p_value: JSON.parse(JSON.stringify({ ...fullConfig, crash: { ...cfg, mode: "AUTO", manualTargetRoundId: null } })),
        }).catch(() => {});
      } else {
        bustPoint = generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
      }
      return json({ bustPoint, round_id });
    }

    // ── CRASH: Place bet ────────────────────────────────────────────────
    if (action === "crash_place_bet") {
      const { user_id, bet_amount, cashout_at, round_id } = body;
      if (!user_id || !bet_amount || !cashout_at)
        return json({ error: "Invalid bet" }, 400);

      const cfg = await getGameAdminConfig("crash");
      const bustPoint = cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01
        ? parseFloat(cfg.manualCrashPoint.toFixed(2))
        : generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);

      const won = (cashout_at as number) <= bustPoint;
      const win_amount = won ? Math.floor((bet_amount as number) * (cashout_at as number)) : 0;

      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id as string).single();
      if (!profile || profile.balance < (bet_amount as number))
        return json({ error: "Insufficient balance" }, 400);

      const newBalance = won
        ? profile.balance - (bet_amount as number) + win_amount
        : profile.balance - (bet_amount as number);
      await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id as string);

      const { data: gameRow } = await supabase.from("games").select("id").eq("slug", "crash").single();
      await supabase.from("bets").insert({
        user_id, game_id: gameRow?.id, bet_amount, win_amount,
        multiplier: won ? cashout_at : 1,
        status: won ? "won" : "lost",
        bet_details: { bustPoint, cashOutAt: cashout_at },
        resolved_at: new Date().toISOString(),
      });
      await supabase.from("crash_rounds").insert({ round_id: round_id ?? 0, bust_point: bustPoint });
      return json({ success: true, won, bustPoint, win_amount });
    }

    // ── ADMIN: Preview next round ───────────────────────────────────────
    if (action === "admin_preview_next_round") {
      const { game } = body;
      const gameKey = (game as string) ?? "aviator";
      const cfg = await getGameAdminConfig(gameKey);
      if (cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01) {
        return json({ mode: cfg.mode, preview: parseFloat(cfg.manualCrashPoint.toFixed(2)), gameKey });
      }
      const samples = Array.from({ length: 5 }, () => generateBustPoint(cfg.targetWinProbability, cfg.houseEdge));
      return json({ mode: cfg.mode, preview: samples[0], samples, gameKey });
    }

    // ── WINGO / K3 / 5D / SunVsMoon: Place bet ─────────────────────────
    if (action === "place_bet") {
      const { user_id, game_slug, bet_amount, bet_details, round_id } = body;
      if (!user_id || !game_slug || !bet_amount)
        return json({ error: "Missing params" }, 400);

      const cfg = await getGameAdminConfig(game_slug as string);
      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id as string).single();
      if (!profile || profile.balance < (bet_amount as number))
        return json({ error: "Insufficient balance" }, 400);

      const { data: game } = await supabase.from("games").select("id").eq("slug", game_slug as string).single();
      const { data: bet } = await supabase.from("bets").insert({
        user_id, game_id: game?.id, bet_amount,
        bet_details: bet_details ?? {}, status: "pending", round_id,
      }).select().single();
      await supabase.from("profiles").update({ balance: profile.balance - (bet_amount as number) }).eq("id", user_id as string);
      return json({ success: true, bet_id: bet?.id, config_mode: cfg.mode });
    }

    // ── ADMIN: Set crash point ──────────────────────────────────────────
    if (action === "admin_set_next_crash") {
      const { game, crash_point, round_id } = body;
      const gameKey = (game as string) ?? "aviator";
      const cfg = await getGameAdminConfig(gameKey);
      const { data: settingsRows } = await supabase.rpc("admin_get_settings");
      const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
      const fullConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};
      await supabase.rpc("admin_update_setting", {
        p_key: "admin_config",
        p_value: JSON.parse(JSON.stringify({
          ...fullConfig,
          [gameKey]: { ...cfg, mode: "MANUAL", manualCrashPoint: crash_point, manualTargetRoundId: round_id ?? null },
        })),
      });
      return json({ success: true, game: gameKey, crash_point });
    }

    // ── ADMIN: Reset to AUTO ────────────────────────────────────────────
    if (action === "admin_reset_to_auto") {
      const { game } = body;
      const gameKey = (game as string) ?? "aviator";
      const cfg = await getGameAdminConfig(gameKey);
      const { data: settingsRows } = await supabase.rpc("admin_get_settings");
      const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
      const fullConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};
      await supabase.rpc("admin_update_setting", {
        p_key: "admin_config",
        p_value: JSON.parse(JSON.stringify({ ...fullConfig, [gameKey]: { ...cfg, mode: "AUTO", manualTargetRoundId: null } })),
      });
      return json({ success: true, game: gameKey, mode: "AUTO" });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error("process-bet error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
