import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// SECURE PROCESS-BET EDGE FUNCTION
// =============================================================================
// ALL game outcome logic is server-side. crypto.getRandomValues() is used
// for every random decision so the browser cannot predict or alter results.
//
// Supported game_type / action values:
//   crash_get_bust             – GET  – returns/stores server bust point for a Crash round
//   crash_settle               – POST – record crash bets + atomically update balance
//   mines_start                – POST – create mines session (mine positions secret)
//   mines_reveal               – POST – reveal a tile; server decides hit/safe
//   mines_cashout              – POST – cash out an active mines session
//   sunvsmoon_result           – GET  – return/store server result for a SvM round
//   sunvsmoon_settle           – POST – settle a player's Sun vs Moon bet
//   trading_settle             – POST – settle a binary trading bet
//   aviator_get_current_round  – GET  – returns live round state for ALL clients to observe
//                                        (crash_point is NEVER returned before round crashes)
//   aviator_round_start        – POST – (legacy / internal) generate secret crash point
//   aviator_round_status       – GET  – returns crashed=true+crash_point once server clock
//                                       has passed the crash point; safe to poll from client
//   aviator_cashout            – POST – cash out a live Aviator bet (server validates timing)
//   aviator_settle             – POST – settle an un-cashed Aviator bet at round end
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

// deno-lint-ignore no-unused-vars
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

// ── Aviator crash point generation ──────────────────────────────────────────
function generateAviatorCrashPoint(): number {
  const r = secureRandom();
  if (r < 0.03) return 1.0;
  const raw = 0.97 / (1 - r);
  return Math.min(200, Math.max(1.0, Math.floor(raw * 100) / 100));
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

// ── Mines multiplier ─────────────────────────────────────────────────────────
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

// ── Aviator multiplier formula (matches client animation) ───────────────────
function aviatorMultiplierAt(msElapsed: number): number {
  const t = msElapsed / 1000;
  return Math.max(1.0, Math.floor(Math.pow(Math.E, 0.14 * t) * 100) / 100);
}

// Phase durations (must match client constants)
const AV_WAIT_MS      = 6_000;
const AV_CRASH_HOLD_MS = 3_000;

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

    // ── GET endpoints ───────────────────────────────────────────────────────
    if (req.method === "GET") {

      // ── aviator_get_current_round ────────────────────────────────────────
      // Called on mount and every ~300ms by every Aviator client.
      // Returns the ONE shared live round so all clients stay in sync.
      // SECURITY: crash_point is NEVER returned here — only after the round
      // has crashed. Clients receive phase, elapsed_ms, round_uuid (for
      // cashout/settle calls), and last_crash_point (post-crash only).
      if (action === "aviator_get_current_round") {
        const { data: row, error } = await supabase
          .from("aviator_current_round")
          .select("round_uuid, phase, phase_started_at, crash_point")
          .eq("id", 1)
          .single();

        if (error || !row) {
          // Table not seeded yet — return a waiting state
          return json({ phase: "waiting", elapsed_ms: 0, round_uuid: null, crash_point: null });
        }

        const r = row as { round_uuid: string; phase: string; phase_started_at: string; crash_point: number };
        const nowMs = Date.now();
        const phaseStartMs = new Date(r.phase_started_at).getTime();
        const elapsed = Math.max(0, nowMs - phaseStartMs);

        // ── Advance phase if enough time has elapsed ──────────────────────
        // This function is purely derived from stored timestamps — no cron
        // needed. Each client poll may trigger a phase transition if it's
        // the first one to notice the elapsed time.

        if (r.phase === "waiting" && elapsed >= AV_WAIT_MS) {
          // Transition: waiting → flying
          const newStart = new Date(phaseStartMs + AV_WAIT_MS).toISOString();
          await supabase
            .from("aviator_current_round")
            .update({ phase: "flying", phase_started_at: newStart })
            .eq("id", 1);
          const flyingElapsed = Math.max(0, nowMs - new Date(newStart).getTime());
          return json({
            phase: "flying",
            elapsed_ms: flyingElapsed,
            round_uuid: r.round_uuid,
            crash_point: null,   // never revealed early
          });
        }

        if (r.phase === "flying") {
          const currentMultiplier = aviatorMultiplierAt(elapsed);
          if (currentMultiplier >= r.crash_point) {
            // Transition: flying → crashed
            const crashedAt = new Date().toISOString();

            // Archive to aviator_rounds history
            await supabase.from("aviator_rounds").upsert({
              round_id: 0,        // legacy integer field — unused for uuid rounds
              crash_point: r.crash_point,
              phase: "crashed",
              started_at: r.phase_started_at,
            }, { onConflict: "round_id", ignoreDuplicates: false }).then(() => {
              // best-effort — ignore errors from the legacy integer pk
            }).catch(() => {});

            // Start next round immediately
            const newUuid = crypto.randomUUID();
            const newCrashPoint = generateAviatorCrashPoint();
            await supabase
              .from("aviator_current_round")
              .update({
                round_uuid: newUuid,
                phase: "crashed",
                phase_started_at: crashedAt,
                crash_point: newCrashPoint,  // next round's secret stored already
              })
              .eq("id", 1);

            return json({
              phase: "crashed",
              elapsed_ms: 0,
              round_uuid: r.round_uuid,
              crash_point: r.crash_point,   // safe to reveal — round is over
              last_crash_point: r.crash_point,
            });
          }

          return json({
            phase: "flying",
            elapsed_ms: elapsed,
            round_uuid: r.round_uuid,
            crash_point: null,   // NEVER revealed during flight
          });
        }

        if (r.phase === "crashed" && elapsed >= AV_CRASH_HOLD_MS) {
          // Transition: crashed → waiting (new round already has uuid+crash_point)
          const newStart = new Date().toISOString();
          await supabase
            .from("aviator_current_round")
            .update({ phase: "waiting", phase_started_at: newStart })
            .eq("id", 1);
          return json({
            phase: "waiting",
            elapsed_ms: 0,
            round_uuid: r.round_uuid,   // new uuid already stored from previous transition
            crash_point: null,
            last_crash_point: r.crash_point,  // show in history bar
          });
        }

        // Phase hasn't changed — return current state
        return json({
          phase: r.phase,
          elapsed_ms: elapsed,
          round_uuid: r.round_uuid,
          // Only reveal crash_point if already crashed
          crash_point: r.phase === "crashed" ? r.crash_point : null,
          last_crash_point: r.phase === "crashed" ? r.crash_point : null,
        });
      }

      // ── crash_get_bust ──────────────────────────────────────────────────
      if (action === "crash_get_bust") {
        const roundId = parseInt(url.searchParams.get("round_id") ?? "0", 10);
        if (!roundId || roundId < 1) return json({ error: "Missing round_id" }, 400);

        const { data: existing } = await supabase
          .from("crash_rounds")
          .select("bust_point")
          .eq("round_id", roundId)
          .single();
        if (existing) return json({ bust_point: (existing as { bust_point: number }).bust_point });

        const { data: settingsRows } = await supabase.rpc("admin_get_settings");
        const settings = (settingsRows as Array<{ key: string; value: unknown }>) ?? [];
        const adminConfig = (settings.find((r) => r.key === "admin_config")?.value ?? {}) as {
          mode?: string; targetWinProbability?: number; houseEdge?: number;
          manualCrashPoint?: number; manualTargetRoundId?: number | null;
        };
        let bustPoint: number;
        if (
          adminConfig.mode === "MANUAL" &&
          (adminConfig.manualTargetRoundId == null || adminConfig.manualTargetRoundId === roundId) &&
          adminConfig.manualCrashPoint
        ) {
          bustPoint = Math.max(1.01, adminConfig.manualCrashPoint);
          void supabase.rpc("admin_update_setting", {
            p_key: "admin_config",
            p_value: { ...adminConfig, mode: "AUTO", manualTargetRoundId: null } as unknown as string,
          });
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

      // ── aviator_round_status ────────────────────────────────────────────
      // Legacy polling endpoint — still used by cashout/settle as fallback.
      if (action === "aviator_round_status") {
        const roundId = parseInt(url.searchParams.get("round_id") ?? "0", 10);
        if (!roundId || roundId < 1) return json({ error: "Missing round_id" }, 400);

        const { data: roundRow } = await supabase
          .from("aviator_rounds")
          .select("crash_point, started_at")
          .eq("round_id", roundId)
          .single();

        if (!roundRow) {
          return json({ crashed: false, crash_point: null });
        }

        const r = roundRow as { crash_point: number; started_at: string };
        const flightStartMs = new Date(r.started_at).getTime() + 6000;
        const nowMs = Date.now();
        const elapsedMs = nowMs - flightStartMs;

        if (elapsedMs <= 0) {
          return json({ crashed: false, crash_point: null });
        }

        const currentMultiplier = aviatorMultiplierAt(elapsedMs);
        const crashed = currentMultiplier >= r.crash_point;
        return json({ crashed, crash_point: crashed ? r.crash_point : null });
      }

      return json({ error: "Unknown GET action" }, 400);
    }

    // ── POST endpoints ──────────────────────────────────────────────────────
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

    // ── crash_settle ─────────────────────────────────────────────────────────
    if (game_type === "crash_settle") {
      const { round_id, amount, cash_out_at, bust_point } = body as {
        round_id: number; amount: number; cash_out_at: number | null; bust_point: number;
      };
      if (!amount || amount <= 0) return json({ error: "Invalid amount" }, 400);

      const { data: roundRow } = await supabase
        .from("crash_rounds")
        .select("bust_point")
        .eq("round_id", round_id)
        .single();
      const serverBust = roundRow ? (roundRow as { bust_point: number }).bust_point : null;

      const actualWin = serverBust !== null && cash_out_at !== null && cash_out_at <= serverBust
        ? Math.round(amount * cash_out_at * 100) / 100
        : 0;

      const newBalance = actualWin > 0
        ? Math.round((userBalance + actualWin) * 100) / 100
        : userBalance;

      if (actualWin > 0) {
        const { error: balErr } = await supabase
          .from("profiles")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("id", user_id);
        if (balErr) return json({ error: "Balance update failed" }, 500);
      }

      await supabase.from("bets").insert({
        user_id, bet_amount: amount, win_amount: actualWin,
        multiplier: cash_out_at ?? bust_point ?? 0,
        status: actualWin > 0 ? "won" : "lost",
        bet_details: { cashOutAt: cash_out_at, bustPoint: serverBust ?? bust_point },
        resolved_at: new Date().toISOString(),
      });

      await supabase.from("transactions").insert({
        user_id,
        type: actualWin > 0 ? "credit" : "debit",
        amount: actualWin > 0 ? actualWin : amount,
        status: "completed",
        balance_before: userBalance,
        balance_after: newBalance,
        reference: `crash_round_${round_id}`,
      });

      return json({ success: true, win: actualWin, verified_bust: serverBust, balance_after: newBalance });
    }

    // ── aviator_round_start ──────────────────────────────────────────────────
    // Legacy endpoint kept for backward compat. New code uses aviator_get_current_round.
    if (game_type === "aviator_round_start") {
      const { round_id } = body as { round_id: number };
      if (!round_id || round_id < 1) return json({ error: "Missing round_id" }, 400);

      const { data: existing } = await supabase
        .from("aviator_rounds")
        .select("id, started_at")
        .eq("round_id", round_id)
        .single();
      if (existing) {
        return json({ success: true, round_id, already_exists: true });
      }

      const crashPoint = generateAviatorCrashPoint();
      const startedAt  = new Date().toISOString();

      await supabase.from("aviator_rounds").insert({
        round_id,
        crash_point: crashPoint,
        started_at: startedAt,
        phase: "waiting",
      });

      return json({ success: true, round_id, started_at: startedAt });
    }

    // ── aviator_cashout ──────────────────────────────────────────────────────
    // Validates timing against the SHARED current round (aviator_current_round).
    if (game_type === "aviator_cashout") {
      const { round_uuid, round_id, bet_amount, placed_at_ms } = body as {
        round_uuid?: string; round_id?: number; bet_amount: number; placed_at_ms: number;
      };
      if (!bet_amount || bet_amount <= 0) return json({ error: "Missing fields" }, 400);
      if (bet_amount > userBalance) return json({ error: "Insufficient balance" }, 400);

      // Prefer uuid-based lookup (new flow), fall back to integer round_id (old flow)
      let crashPointVal: number;
      let startedAtVal: string;

      if (round_uuid) {
        const { data: curRow } = await supabase
          .from("aviator_current_round")
          .select("round_uuid, crash_point, phase, phase_started_at")
          .eq("id", 1)
          .single();
        if (!curRow) return json({ error: "No active round" }, 400);
        const cr = curRow as { round_uuid: string; crash_point: number; phase: string; phase_started_at: string };
        if (cr.round_uuid !== round_uuid) return json({ error: "Round has changed" }, 400);
        crashPointVal = cr.crash_point;
        startedAtVal  = cr.phase_started_at;
      } else if (round_id) {
        const { data: roundRow } = await supabase
          .from("aviator_rounds")
          .select("crash_point, started_at")
          .eq("round_id", round_id)
          .single();
        if (!roundRow) return json({ error: "Round not found" }, 400);
        const r = roundRow as { crash_point: number; started_at: string };
        crashPointVal = r.crash_point;
        startedAtVal  = r.started_at;
      } else {
        return json({ error: "Missing round_uuid or round_id" }, 400);
      }

      const flightStartMs = new Date(startedAtVal).getTime() + (round_uuid ? 0 : 6000);
      const nowMs = Date.now();
      const elapsedMs = Math.max(0, nowMs - flightStartMs);
      const currentMultiplier = aviatorMultiplierAt(elapsedMs);

      const crashed = currentMultiplier >= crashPointVal;
      const cashoutMultiplier = crashed ? null : Math.min(currentMultiplier, crashPointVal - 0.01);
      const win = cashoutMultiplier !== null
        ? Math.round(bet_amount * cashoutMultiplier * 100) / 100
        : 0;

      const newBalance = win > 0
        ? Math.round((userBalance + win) * 100) / 100
        : userBalance;

      if (win > 0) {
        const { error: balErr } = await supabase
          .from("profiles")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("id", user_id);
        if (balErr) return json({ error: "Balance update failed" }, 500);
      }

      await supabase.from("bets").insert({
        user_id,
        bet_amount,
        win_amount: win,
        multiplier: cashoutMultiplier ?? 0,
        status: win > 0 ? "won" : "lost",
        bet_details: {
          game: "aviator",
          round_uuid: round_uuid ?? null,
          round_id: round_id ?? null,
          cashout_at: cashoutMultiplier,
          crash_point: crashPointVal,
          placed_at_ms,
        },
        resolved_at: new Date().toISOString(),
      });

      return json({
        success: true,
        won: win > 0,
        cashout_at: cashoutMultiplier,
        win,
        balance_after: newBalance,
        crash_point: crashed ? crashPointVal : null,
      });
    }

    // ── aviator_settle ───────────────────────────────────────────────────────
    if (game_type === "aviator_settle") {
      const { round_uuid, round_id, bet_amount } = body as { round_uuid?: string; round_id?: number; bet_amount: number };
      if (!bet_amount || bet_amount <= 0) return json({ error: "Missing fields" }, 400);

      let crashPoint = 0;
      if (round_uuid) {
        const { data: curRow } = await supabase
          .from("aviator_current_round")
          .select("crash_point, round_uuid")
          .eq("id", 1)
          .single();
        if (curRow && (curRow as { round_uuid: string }).round_uuid === round_uuid) {
          crashPoint = (curRow as { crash_point: number }).crash_point;
        }
      } else if (round_id) {
        const { data: roundRow } = await supabase
          .from("aviator_rounds")
          .select("crash_point")
          .eq("round_id", round_id)
          .single();
        if (roundRow) crashPoint = (roundRow as { crash_point: number }).crash_point;
      }

      await supabase.from("bets").insert({
        user_id,
        bet_amount,
        win_amount: 0,
        multiplier: 0,
        status: "lost",
        bet_details: { game: "aviator", round_uuid: round_uuid ?? null, round_id: round_id ?? null, crash_point: crashPoint },
        resolved_at: new Date().toISOString(),
      });

      return json({ success: true, crash_point: crashPoint });
    }

    // ── mines_start ─────────────────────────────────────────────────────────
    if (game_type === "mines_start") {
      const { mine_count, stake } = body as { mine_count: number; stake: number };
      if (!mine_count || mine_count < 1 || mine_count > 24) return json({ error: "Invalid mine_count" }, 400);
      if (!stake || stake <= 0) return json({ error: "Invalid stake" }, 400);
      if (stake > userBalance) return json({ error: "Insufficient balance" }, 400);

      await supabase
        .from("mines_sessions")
        .update({ status: "busted" })
        .eq("user_id", user_id)
        .eq("status", "active");

      const minePositions = generateMinePositions(mine_count);
      const newBalance = userBalance - stake;

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
      const newBalance = won
        ? Math.round((userBalance + payout) * 100) / 100
        : userBalance;

      if (won) {
        const { error: balErr } = await supabase
          .from("profiles")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("id", user_id);
        if (balErr) return json({ error: "Balance update failed" }, 500);
      }

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

      const won =
        (direction === "UP" && exit_price > entry_price) ||
        (direction === "DOWN" && exit_price < entry_price);
      const profit = won ? Math.round(stake * payout_pct / 100 * 100) / 100 : 0;
      const payout = won ? stake + profit : 0;
      const newBalance = won
        ? Math.round((userBalance + payout) * 100) / 100
        : userBalance;

      if (won) {
        const { error: balErr } = await supabase
          .from("profiles")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("id", user_id);
        if (balErr) return json({ error: "Balance update failed" }, 500);
      }

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
