// process-bet — Supabase Edge Function v8
// Supports GET (query params) + POST (JSON body)

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

function generateBustPoint(targetWinProb: number, houseEdge: number): number {
  const edge = Math.max(0.01, houseEdge / 100);
  const p = Math.min(0.99, Math.max(0.01, targetWinProb / 100));
  const u = secureRandom();
  if (u > p) return 1.00;
  const v = secureRandom();
  const vCapped = Math.min(v, 1 - 1 / (200 / (1 - edge) + 1));
  const raw = (1 / (1 - vCapped)) * (1 - edge);
  return Math.min(200, Math.max(1.01, parseFloat(raw.toFixed(2))));
}

// Crash timing constants
const CRASH_WAIT_MS       = 6_000;  // 6s betting window
const CRASH_CRASH_HOLD_MS = 3_000;  // 3s show crash result

// Aviator timing constants
const AV_WAIT_MS          = 6_000;
const AV_CRASH_HOLD_MS    = 3_000;
const AV_CASHOUT_GRACE_MS = 800;
// Grace window: bets that arrive up to this many ms after flying starts are
// still accepted. Handles the common race where the player places a bet at
// the last second but network latency pushes the request past the transition.
const AV_BET_LATE_GRACE_MS = 1_500;

// Flight duration: how long the plane flies before hitting crash_point
// Uses same formula as client: m = e^(0.12*t)  =>  t = ln(m)/0.12
function flightDurationMs(crashPoint: number): number {
  return (Math.log(Math.max(1.01, crashPoint)) / 0.12) * 1000;
}

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

    // ─────────────────────────────────────────────────────────────────────
    // getGameAdminConfig
    // ─────────────────────────────────────────────────────────────────────
    async function getGameAdminConfig(gameKey: string) {
      const { data: settingsRows } = await supabase.rpc("admin_get_settings");
      const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
      const adminConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};

      if (gameKey === "crash") {
        return {
          mode: (adminConfig.mode as string) ?? "AUTO",
          targetWinProbability: (adminConfig.targetWinProbability as number) ?? 55,
          houseEdge: (adminConfig.houseEdge as number) ?? 4,
          manualCrashPoint: (adminConfig.manualCrashPoint as number) ?? 2.0,
          manualTargetRoundId: (adminConfig.manualTargetRoundId as number | null) ?? null,
          manualResult: (adminConfig.manualResult as string) ?? "",
        };
      }

      const gameHandlers = (adminConfig.gameHandlers as Record<string, Record<string, unknown>>) ?? {};
      const gameConfig = gameHandlers[gameKey] ?? {};
      return {
        mode: (gameConfig.mode as string) ?? "AUTO",
        targetWinProbability: (gameConfig.targetWinProbability as number) ?? 55,
        houseEdge: (gameConfig.houseEdge as number) ?? 5,
        manualCrashPoint: (gameConfig.manualCrashPoint as number) ?? 2.0,
        manualTargetRoundId: (gameConfig.manualTargetRoundId as number | null) ?? null,
        manualResult: (gameConfig.manualResult as string) ?? "",
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // revertCrashToAuto
    // ─────────────────────────────────────────────────────────────────────
    async function revertCrashToAuto(fullConfig: Record<string, unknown>) {
      const existingCrash = (fullConfig.crash as Record<string, unknown>) ?? {};
      const existingHandlers = (fullConfig.gameHandlers as Record<string, unknown>) ?? {};
      const existingHandlerCrash = (existingHandlers.crash as Record<string, unknown>) ?? {};

      const newConfig: Record<string, unknown> = {
        ...fullConfig,
        mode: "AUTO",
        manualTargetRoundId: null,
        crash: { ...existingCrash, mode: "AUTO", manualTargetRoundId: null },
        gameHandlers: {
          ...existingHandlers,
          crash: { ...existingHandlerCrash, mode: "AUTO", manualTargetRoundId: null },
        },
      };

      await supabase.rpc("admin_update_setting", {
        p_key: "admin_config",
        p_value: JSON.parse(JSON.stringify(newConfig)),
      }).catch(() => {});
    }

    // ====================================================================
    // CRASH: Get last 10 history
    // ====================================================================
    if (action === "crash_get_history") {
      const { data: rows } = await supabase
        .from("crash_rounds")
        .select("bust_point")
        .order("created_at", { ascending: false })
        .limit(10);

      const history = (rows ?? []).map((r) => parseFloat(String(r.bust_point)));
      return json({ history });
    }

    // ====================================================================
    // CRASH: Get last 20 history with provably fair detail
    // ====================================================================
    if (action === "crash_get_history_detail") {
      const { data: rows } = await supabase
        .from("crash_rounds")
        .select("bust_point, round_uuid, server_seed, server_seed_hash, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      const history = (rows ?? []).map((r) => ({
        bust_point: parseFloat(String(r.bust_point)),
        round_uuid: r.round_uuid ?? String(r.bust_point),
        server_seed: r.server_seed ?? null,
        server_seed_hash: r.server_seed_hash ?? "—",
        created_at: r.created_at,
      }));
      return json({ history });
    }

    // ====================================================================
    // CRASH: Get current shared round
    // ====================================================================
    if (action === "crash_get_current_round") {
      const { data: r } = await supabase
        .from("crash_current_round").select("*").eq("id", 1).single();

      if (!r) {
        const cfg = await getGameAdminConfig("crash");
        const bustPoint = generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
        await supabase.from("crash_current_round").insert({
          id: 1, phase: "waiting",
          phase_started_at: new Date().toISOString(),
          crash_point: bustPoint, elapsed_ms: 0,
          round_uuid: crypto.randomUUID(),
        });
        return json({ phase: "waiting", elapsed_ms: 0, crash_point: null, round_uuid: crypto.randomUUID() });
      }

      const now = Date.now();
      const elapsed = now - new Date(r.phase_started_at).getTime();

      if (r.phase === "waiting" && elapsed >= CRASH_WAIT_MS) {
        const cfg = await getGameAdminConfig("crash");
        const bustPoint = cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01
          ? parseFloat(cfg.manualCrashPoint.toFixed(2))
          : generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);

        if (cfg.mode === "MANUAL") {
          const { data: settingsRows } = await supabase.rpc("admin_get_settings");
          const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
          const fullConfig = settings.find((r2) => r2.key === "admin_config")?.value ?? {};
          await revertCrashToAuto(fullConfig as Record<string, unknown>);
        }
        await supabase.from("crash_current_round").update({
          phase: "flying",
          phase_started_at: new Date().toISOString(),
          crash_point: bustPoint,
          elapsed_ms: 0,
        }).eq("id", 1);
        return json({ phase: "flying", elapsed_ms: 0, crash_point: null, round_uuid: r.round_uuid });
      }

      if (r.phase === "flying" && r.crash_point) {
        const dur = flightDurationMs(Number(r.crash_point));
        if (elapsed >= dur) {
          const newUuid = r.round_uuid ?? crypto.randomUUID();
          const serverSeedBytes = new Uint8Array(32);
          crypto.getRandomValues(serverSeedBytes);
          const serverSeed = Array.from(serverSeedBytes).map(b => b.toString(16).padStart(2, '0')).join('');
          const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serverSeed));
          const serverSeedHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

          await supabase.from("crash_current_round").update({
            phase: "crashed",
            phase_started_at: new Date().toISOString(),
            last_crash_point: r.crash_point,
            elapsed_ms: 0,
          }).eq("id", 1);

          await supabase.from("crash_rounds").insert({
            bust_point: Number(r.crash_point),
            round_uuid: newUuid,
            server_seed: serverSeed,
            server_seed_hash: serverSeedHash,
            created_at: new Date().toISOString(),
            phase_started_at: new Date().toISOString(),
          }).catch(() => {});

          return json({
            phase: "crashed", elapsed_ms: 0,
            crash_point: r.crash_point,
            last_crash_point: r.crash_point,
            round_uuid: r.round_uuid,
          });
        }
      }

      if (r.phase === "crashed" && elapsed >= CRASH_CRASH_HOLD_MS) {
        const cfg = await getGameAdminConfig("crash");
        const bustPoint = cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01
          ? parseFloat(cfg.manualCrashPoint.toFixed(2))
          : generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);

        if (cfg.mode === "MANUAL") {
          const { data: settingsRows } = await supabase.rpc("admin_get_settings");
          const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
          const fullConfig = settings.find((r2) => r2.key === "admin_config")?.value ?? {};
          await revertCrashToAuto(fullConfig as Record<string, unknown>);
        }

        const newUuid = crypto.randomUUID();
        await supabase.from("crash_current_round").update({
          phase: "waiting",
          phase_started_at: new Date().toISOString(),
          crash_point: bustPoint,
          elapsed_ms: 0,
          round_uuid: newUuid,
          last_crash_point: r.last_crash_point ?? r.crash_point,
        }).eq("id", 1);
        return json({
          phase: "waiting", elapsed_ms: 0, crash_point: null,
          last_crash_point: r.last_crash_point ?? r.crash_point,
          round_uuid: newUuid,
        });
      }

      return json({
        phase: r.phase,
        elapsed_ms: elapsed,
        round_uuid: r.round_uuid,
        last_crash_point: r.last_crash_point,
        crash_point: r.phase === "crashed" ? r.crash_point : null,
      });
    }

    // ====================================================================
    // AVIATOR: Get current round
    //
    // KEY FIX: Do NOT generate a new UUID on waiting→flying.
    // Bets are placed and stored with the WAITING phase UUID. If we change
    // the UUID on flying, the cashout search (bet_details->>round_uuid)
    // will never find the bet → "Bet not found" → balance not credited.
    // Only generate a new UUID on crashed→waiting (truly new round).
    // ====================================================================
    if (action === "aviator_get_current_round" || action === "aviator_round_status" || action === "aviator_game_loop") {
      const { data: r } = await supabase
        .from("aviator_current_round").select("*").eq("id", 1).single();

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

      // WAITING → FLYING: keep same UUID (bets stored with this UUID must match at cashout)
      if (r.phase === "waiting" && elapsed >= AV_WAIT_MS) {
        const cfg = await getGameAdminConfig("aviator");
        const bustPoint = cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01
          ? parseFloat(cfg.manualCrashPoint.toFixed(2))
          : generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
        // IMPORTANT: reuse r.round_uuid — do NOT generate a new UUID here.
        // The UUID must stay the same so bet_details->>round_uuid matches during cashout.
        await supabase.from("aviator_current_round").update({
          phase: "flying", phase_started_at: new Date().toISOString(),
          crash_point: bustPoint, elapsed_ms: 0,
          // round_uuid intentionally NOT updated here
        }).eq("id", 1);
        return json({ phase: "flying", elapsed_ms: 0, crash_point: null, round_uuid: r.round_uuid, just_transitioned: true });
      }

      if (r.phase === "flying" && r.crash_point) {
        const flightDuration = flightDurationMs(Number(r.crash_point));
        if (elapsed >= flightDuration) {
          await supabase.from("aviator_current_round").update({
            phase: "crashed", phase_started_at: new Date().toISOString(),
            last_crash_point: r.crash_point, elapsed_ms: 0,
          }).eq("id", 1);
          // Settle all pending bets for this round
          if (r.round_uuid) {
            await supabase.from("bets")
              .update({ status: "lost", resolved_at: new Date().toISOString() })
              .eq("status", "pending")
              .filter("bet_details->>round_uuid", "eq", r.round_uuid);
          }
          // Save to aviator_rounds history
          await supabase.from("aviator_rounds").insert({
            round_uuid: r.round_uuid,
            bust_point: Number(r.crash_point),
            phase_started_at: r.phase_started_at,
          }).catch(() => {});
          return json({ phase: "crashed", elapsed_ms: 0, crash_point: r.crash_point, last_crash_point: r.crash_point, round_uuid: r.round_uuid, just_transitioned: true });
        }
      }

      if (r.phase === "flying" && !r.crash_point) {
        const cfg = await getGameAdminConfig("aviator");
        const bustPoint = generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
        await supabase.from("aviator_current_round").update({
          crash_point: bustPoint, phase_started_at: new Date().toISOString(), elapsed_ms: 0,
        }).eq("id", 1);
        return json({ phase: "flying", elapsed_ms: 0, crash_point: null, round_uuid: r.round_uuid });
      }

      // CRASHED → WAITING: generate a fresh UUID for the new betting round
      if (r.phase === "crashed" && elapsed >= AV_CRASH_HOLD_MS) {
        const newUuid = crypto.randomUUID();
        await supabase.from("aviator_current_round").update({
          phase: "waiting", phase_started_at: new Date().toISOString(),
          crash_point: null, elapsed_ms: 0, round_uuid: newUuid,
        }).eq("id", 1);
        return json({ phase: "waiting", elapsed_ms: 0, crash_point: null, last_crash_point: r.crash_point ?? r.last_crash_point, round_uuid: newUuid, just_transitioned: true });
      }

      return json({
        phase: r.phase, elapsed_ms: elapsed, round_uuid: r.round_uuid,
        last_crash_point: r.last_crash_point,
        crash_point: r.phase === "crashed" ? r.crash_point : null,
      });
    }

    // ====================================================================
    // AVIATOR: Place bet
    //
    // FIX (round_id): The bets table has round_id FK → game_rounds(id).
    // Aviator does NOT use game_rounds, so we must set round_id = NULL and
    // store the aviator round UUID only in bet_details.round_uuid. This
    // prevents an FK violation that silently blocked the insert, causing
    // bets to be missing at cashout time → "Bet not found" → cashout error.
    //
    // FIX (late-bet grace): Players who place a bet in the last ~1s of the
    // waiting window sometimes see "Round not accepting bets" because their
    // request arrives at the server a few hundred ms after the phase
    // transitions to "flying" due to network latency. We now accept bets
    // for up to AV_BET_LATE_GRACE_MS (1500ms) after flying starts so these
    // late-arriving bets are still stored and can be cashed out normally.
    // ====================================================================
    if (action === "aviator_place_bet") {
      const { user_id, bet_amount, round_uuid } = body;
      if (!user_id || !bet_amount || (bet_amount as number) <= 0) return json({ error: "Invalid bet" }, 400);
      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
      if (!profile || profile.balance < (bet_amount as number)) return json({ error: "Insufficient balance" }, 400);
      const { data: round } = await supabase.from("aviator_current_round").select("round_uuid, phase, phase_started_at").eq("id", 1).single();

      // Accept bets during waiting phase OR during the early grace window of flying
      // (handles race where bet is placed in last second of countdown but arrives
      // at server just after the phase flips to "flying" due to network latency).
      const roundElapsed = round ? Date.now() - new Date(round.phase_started_at).getTime() : Infinity;
      const isAcceptingBets = round && (
        round.phase === "waiting" ||
        (round.phase === "flying" && roundElapsed <= AV_BET_LATE_GRACE_MS)
      );
      if (!isAcceptingBets) return json({ error: "Round not accepting bets" }, 400);

      await supabase.from("profiles").update({ balance: profile.balance - (bet_amount as number) }).eq("id", user_id);
      const { data: gameRow } = await supabase.from("games").select("id").eq("slug", "aviator").single();
      const activeUuid = round_uuid ?? round.round_uuid;
      // round_id is intentionally NULL — aviator uses its own round UUID system
      // stored in bet_details.round_uuid. Setting round_id to the UUID string
      // caused an FK violation against game_rounds(id) and silently prevented
      // the bet from being inserted.
      const { data: bet } = await supabase.from("bets").insert({
        user_id,
        game_id: gameRow?.id,
        round_id: null,
        bet_amount,
        bet_details: { round_uuid: activeUuid },
        status: "pending",
      }).select().single();
      return json({ success: true, bet_id: bet?.id, round_uuid: activeUuid });
    }

    // ====================================================================
    // AVIATOR: Cash out
    //
    // Search order:
    //  1. bet_id (if provided)
    //  2. bet_details->>round_uuid = round_uuid from client (current round UUID)
    //  3. round_id = current aviator_current_round.round_uuid (same UUID, belt-and-suspenders)
    //  4. round_id from client param
    // ====================================================================
    if (action === "aviator_cashout") {
      const { user_id, bet_id, cashout_multiplier, round_uuid, round_id } = body;
      if (!user_id || !cashout_multiplier) return json({ error: "Missing params" }, 400);
      const { data: round } = await supabase.from("aviator_current_round").select("phase, crash_point, round_uuid, phase_started_at").eq("id", 1).single();
      const phaseElapsed = round ? Date.now() - new Date(round.phase_started_at).getTime() : Infinity;
      const canCashout = round && (round.phase === "flying" || (round.phase === "crashed" && phaseElapsed < AV_CASHOUT_GRACE_MS));
      if (!canCashout) return json({ error: "Cannot cashout now", phase: round?.phase }, 400);
      if (round.crash_point && (cashout_multiplier as number) > Number(round.crash_point)) return json({ error: "Crashed before cashout", bustPoint: round.crash_point }, 400);

      let betData: Record<string, unknown> | null = null;

      // 1. By bet_id
      if (bet_id) {
        const { data } = await supabase.from("bets").select("*").eq("id", bet_id as string).eq("user_id", user_id as string).eq("status", "pending").single();
        betData = data;
      }
      // 2. By round_uuid from client (should match bet_details->>round_uuid)
      if (!betData) {
        const rv = (round_uuid as string) ?? round.round_uuid;
        const { data } = await supabase.from("bets").select("*").eq("user_id", user_id as string).eq("status", "pending").filter("bet_details->>round_uuid", "eq", rv).maybeSingle();
        betData = data;
      }
      // 3. By current round's UUID stored in round_id column
      if (!betData) {
        const { data } = await supabase.from("bets").select("*").eq("user_id", user_id as string).eq("status", "pending").eq("round_id", round.round_uuid).maybeSingle();
        betData = data;
      }
      // 4. By round_id from client param
      if (!betData && round_id) {
        const { data } = await supabase.from("bets").select("*").eq("user_id", user_id as string).eq("status", "pending").eq("round_id", String(round_id)).maybeSingle();
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
      const newBalance = (profile?.balance ?? 0) + win_amount;
      await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id as string);
      return json({ success: true, win_amount, balance_after: newBalance, multiplier: cashout_multiplier, bustPoint: round.crash_point });
    }

    // ====================================================================
    // AVIATOR: Settle lost bets
    // ====================================================================
    if (action === "aviator_settle_lost" || action === "aviator_settle") {
      const { round_uuid, user_id } = body;
      let q = supabase.from("bets").update({ status: "lost", resolved_at: new Date().toISOString() }).eq("status", "pending");
      if (round_uuid) q = q.filter("bet_details->>round_uuid", "eq", round_uuid as string);
      if (user_id) q = q.eq("user_id", user_id as string);
      await q;
      return json({ success: true });
    }

    // ====================================================================
    // CRASH: Get bust point (legacy)
    // ====================================================================
    if (action === "crash_get_bust") {
      const { round_id } = body;
      const cfg = await getGameAdminConfig("crash");
      let bustPoint: number;
      if (cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01) {
        bustPoint = parseFloat(cfg.manualCrashPoint.toFixed(2));
      } else {
        bustPoint = generateBustPoint(cfg.targetWinProbability, cfg.houseEdge);
      }
      const roundIdNum = round_id ? parseInt(String(round_id), 10) : 0;
      if (roundIdNum > 0) {
        const { data: existing } = await supabase.from("crash_rounds").select("bust_point").eq("round_id", roundIdNum).maybeSingle();
        if (!existing) {
          await supabase.from("crash_rounds").insert({ round_id: roundIdNum, bust_point: bustPoint }).catch(() => {});
        } else {
          bustPoint = parseFloat(String(existing.bust_point));
        }
      }
      return json({ bust_point: bustPoint, round_id });
    }

    // ====================================================================
    // CRASH: Settle round
    // ====================================================================
    if (action === "crash_settle") {
      const { user_id, round_id, amount, cash_out_at, bust_point } = body;
      if (!user_id || !amount) return json({ error: "Missing params" }, 400);

      let verifiedBust: number | null = null;
      const { data: sharedRound } = await supabase.from("crash_current_round").select("crash_point, last_crash_point, phase").eq("id", 1).single();
      if (sharedRound) {
        const bp = sharedRound.phase === 'crashed' ? sharedRound.crash_point : sharedRound.last_crash_point;
        if (bp) verifiedBust = parseFloat(String(bp));
      }
      if (!verifiedBust && round_id) {
        const roundIdNum = parseInt(String(round_id), 10);
        if (roundIdNum > 0) {
          const { data: cr } = await supabase.from("crash_rounds").select("bust_point").eq("round_id", roundIdNum).maybeSingle();
          if (cr) verifiedBust = parseFloat(String(cr.bust_point));
        }
      }

      const bustPoint = verifiedBust ?? (bust_point ? parseFloat(String(bust_point)) : null);
      const cashoutAt = cash_out_at ? parseFloat(String(cash_out_at)) : null;
      const won = cashoutAt !== null && bustPoint !== null && cashoutAt <= bustPoint;
      const betAmount = parseFloat(String(amount));
      const win_amount = won ? Math.floor(betAmount * cashoutAt!) : 0;

      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id as string).single();
      if (!profile) return json({ error: "User not found" }, 400);

      const newBalance = profile.balance + win_amount;
      if (win_amount > 0) {
        await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id as string);
      }

      const { data: gameRow } = await supabase.from("games").select("id").eq("slug", "crash").single();
      await supabase.from("bets").insert({
        user_id, game_id: gameRow?.id, bet_amount: betAmount, win_amount,
        multiplier: won ? cashoutAt : 1,
        status: won ? "won" : "lost",
        bet_details: { bustPoint, cashOutAt: cashoutAt },
        resolved_at: new Date().toISOString(),
      }).catch(() => {});

      return json({ success: true, won, win: win_amount, verified_bust: bustPoint, balance_after: newBalance });
    }

    // ====================================================================
    // CRASH: Legacy place_bet
    // ====================================================================
    if (action === "crash_place_bet") {
      const { user_id, bet_amount } = body;
      if (!user_id || !bet_amount) return json({ error: "Invalid bet" }, 400);
      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id as string).single();
      if (!profile || profile.balance < (bet_amount as number)) return json({ error: "Insufficient balance" }, 400);
      await supabase.from("profiles").update({ balance: profile.balance - (bet_amount as number) }).eq("id", user_id as string);
      return json({ success: true, balance_after: profile.balance - (bet_amount as number) });
    }

    // ====================================================================
    // Other game types
    // ====================================================================
    if (action === "place_bet") {
      const { user_id, game_slug, bet_amount, bet_details, round_id } = body;
      if (!user_id || !game_slug || !bet_amount) return json({ error: "Missing params" }, 400);
      const cfg = await getGameAdminConfig(game_slug as string);
      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id as string).single();
      if (!profile || profile.balance < (bet_amount as number)) return json({ error: "Insufficient balance" }, 400);
      const { data: game } = await supabase.from("games").select("id").eq("slug", game_slug as string).single();
      const { data: bet } = await supabase.from("bets").insert({
        user_id, game_id: game?.id, bet_amount, bet_details: bet_details ?? {}, status: "pending", round_id,
      }).select().single();
      await supabase.from("profiles").update({ balance: profile.balance - (bet_amount as number) }).eq("id", user_id as string);
      return json({ success: true, bet_id: bet?.id, config_mode: cfg.mode });
    }

    if (action === "admin_preview_next_round") {
      const { game } = body;
      const gameKey = (game as string) ?? "crash";
      const cfg = await getGameAdminConfig(gameKey);
      if (cfg.mode === "MANUAL" && cfg.manualCrashPoint >= 1.01) {
        return json({ mode: cfg.mode, preview: parseFloat(cfg.manualCrashPoint.toFixed(2)), gameKey });
      }
      const samples = Array.from({ length: 5 }, () => generateBustPoint(cfg.targetWinProbability, cfg.houseEdge));
      return json({ mode: cfg.mode, preview: samples[0], samples, gameKey });
    }

    if (action === "admin_set_next_crash") {
      const { game, crash_point, round_id } = body;
      const gameKey = (game as string) ?? "aviator";
      const cfg = await getGameAdminConfig(gameKey);
      const { data: settingsRows } = await supabase.rpc("admin_get_settings");
      const settings = (settingsRows as Array<{ key: string; value: Record<string, unknown> }>) ?? [];
      const fullConfig = settings.find((r) => r.key === "admin_config")?.value ?? {};
      await supabase.rpc("admin_update_setting", {
        p_key: "admin_config",
        p_value: JSON.parse(JSON.stringify({ ...fullConfig, [gameKey]: { ...cfg, mode: "MANUAL", manualCrashPoint: crash_point, manualTargetRoundId: round_id ?? null } })),
      });
      return json({ success: true, game: gameKey, crash_point });
    }

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

    // ====================================================================
    // SUN VS MOON: Get result for a round
    // ====================================================================
    if (action === "sunvsmoon_result") {
      const { round_id } = body;
      if (!round_id) return json({ error: "Missing round_id" }, 400);
      const roundIdNum = parseInt(String(round_id), 10);

      const { data: existing } = await supabase
        .from("sunvsmoon_rounds")
        .select("result")
        .eq("round_id", roundIdNum)
        .maybeSingle();

      if (existing) return json({ result: existing.result });

      const cfg = await getGameAdminConfig("sunvsmoon");
      let result: string;
      if (cfg.mode === "MANUAL" && cfg.manualResult) {
        result = cfg.manualResult;
      } else {
        const rand = secureRandom();
        result = rand < 0.45 ? "sun" : rand < 0.90 ? "moon" : "tie";
      }

      await supabase.from("sunvsmoon_rounds").insert({ round_id: roundIdNum, result }).catch(() => {});
      return json({ result });
    }

    // ====================================================================
    // SUN VS MOON: Settle bet
    // ====================================================================
    if (action === "sunvsmoon_settle") {
      const { user_id, round_id, bet, stake } = body;
      if (!user_id || !round_id || !bet || !stake) return json({ error: "Missing params" }, 400);
      const roundIdNum = parseInt(String(round_id), 10);

      // Get or generate result for this round
      const { data: existingRound } = await supabase
        .from("sunvsmoon_rounds")
        .select("result")
        .eq("round_id", roundIdNum)
        .maybeSingle();

      let result: string;
      if (existingRound) {
        result = existingRound.result;
      } else {
        const cfg = await getGameAdminConfig("sunvsmoon");
        if (cfg.mode === "MANUAL" && cfg.manualResult) {
          result = cfg.manualResult;
        } else {
          const rand = secureRandom();
          result = rand < 0.45 ? "sun" : rand < 0.90 ? "moon" : "tie";
        }
        await supabase.from("sunvsmoon_rounds").insert({ round_id: roundIdNum, result }).catch(() => {});
      }

      const betChoice = String(bet);
      const stakeNum = parseFloat(String(stake));
      // Payout multipliers (net profit multiplier, not including stake return)
      // sun/moon: 1:1 (win = stake), tie: 8:1 (win = 8 * stake)
      const profitMultipliers: Record<string, number> = { sun: 1, moon: 1, tie: 8 };
      const profitMult = profitMultipliers[betChoice] ?? 1;
      const won = betChoice === result;
      // The client already debited stake via store.debit() before calling settle.
      // Server balance still shows the full pre-bet balance.
      // Won:  credit stake + profit  → net change = +profit
      // Lost: debit stake            → net change = -stake
      const profit = won ? Math.floor(stakeNum * profitMult) : 0;
      const payout = won ? stakeNum + profit : 0;

      const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id as string).single();
      if (!profile) return json({ error: "User not found" }, 400);

      // Server balance: deduct stake always, add back payout if won
      const newBalance = profile.balance - stakeNum + payout;
      await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id as string);

      const { data: gameRow } = await supabase.from("games").select("id").eq("slug", "sunvsmoon").maybeSingle();
      await supabase.from("bets").insert({
        user_id,
        game_id: gameRow?.id ?? null,
        bet_amount: stakeNum,
        win_amount: payout,
        multiplier: won ? profitMult + 1 : 0,
        status: won ? "won" : "lost",
        bet_details: { bet: betChoice, result, round_id: roundIdNum },
        resolved_at: new Date().toISOString(),
      }).catch(() => {});

      return json({ success: true, result, won, payout, profit, balance_after: newBalance });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error("process-bet error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
