import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function getSecureRandom(): number {
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const value = new DataView(randomBytes.buffer).getUint32(0);
  return value / 0xffffffff;
}

// Safe wrapper — Supabase JS builder returns a PromiseLike, not a real Promise,
// so .catch() is not available directly. Use this helper for fire-and-forget queries.
async function safeInsert(queryBuilder: PromiseLike<unknown>): Promise<void> {
  try { await queryBuilder; } catch { /* ignore */ }
}

/**
 * Reads the admin-configured manual result for sunvsmoon from Supabase settings.
 * Returns null if no manual override is configured or mode is AUTO.
 */
async function getAdminSunMoonManualResult(
  supabase: ReturnType<typeof createClient>
): Promise<"sun" | "moon" | "tie" | null> {
  try {
    const { data } = await supabase.rpc("admin_get_settings");
    if (!data) return null;
    const rows = data as { key: string; value: unknown }[];
    const row = rows.find((r) => r.key === "admin_config");
    if (!row?.value || typeof row.value !== "object") return null;
    const cfg = row.value as Record<string, unknown>;

    function parseSunMoonResult(obj: unknown): "sun" | "moon" | "tie" | null {
      if (!obj || typeof obj !== "object") return null;
      const sm = obj as Record<string, unknown>;
      if (sm.mode !== "MANUAL") return null;
      const result = sm.manualResult as string | undefined;
      if (result === "sun" || result === "moon" || result === "tie") return result;
      if (result === "eclipse") return "tie";
      return null;
    }

    const handlers = cfg.gameHandlers as Record<string, unknown> | undefined;
    if (handlers) {
      const fromHandlers = parseSunMoonResult(handlers["sunvsmoon"]);
      if (fromHandlers) return fromHandlers;
    }
    const fromTopLevel = parseSunMoonResult(cfg["sunvsmoon"]);
    if (fromTopLevel) return fromTopLevel;
    return null;
  } catch {
    return null;
  }
}

async function revertSunMoonToAuto(
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  try {
    const { data } = await supabase.rpc("admin_get_settings");
    if (!data) return;
    const rows = data as { key: string; value: unknown }[];
    const row = rows.find((r) => r.key === "admin_config");
    if (!row?.value || typeof row.value !== "object") return;
    const cfg = { ...(row.value as Record<string, unknown>) };
    const autoState = { mode: "AUTO", manualResult: "", manualTargetRoundId: null };
    const handlers = { ...(cfg.gameHandlers as Record<string, unknown> ?? {}) };
    const sunmoon = { ...(handlers["sunvsmoon"] as Record<string, unknown> ?? {}) };
    Object.assign(sunmoon, autoState);
    handlers["sunvsmoon"] = sunmoon;
    cfg.gameHandlers = handlers;
    const topLevelSunMoon = { ...(cfg["sunvsmoon"] as Record<string, unknown> ?? {}) };
    Object.assign(topLevelSunMoon, autoState);
    cfg["sunvsmoon"] = topLevelSunMoon;
    await supabase.rpc("admin_update_setting", { p_key: "admin_config", p_value: cfg });
  } catch { /* Non-fatal */ }
}

// ── Mines multiplier table ────────────────────────────────────────────────────
// Returns multiplier for revealing `gemsFound` gems with `mineCount` mines on a 5x5 grid.
function minesMultiplier(mineCount: number, gemsFound: number): number {
  const totalCells = 25;
  const safeCells = totalCells - mineCount;
  if (gemsFound <= 0 || gemsFound > safeCells) return 1.0;
  // Product of odds: for each gem, probability of NOT hitting a mine on remaining cells
  let prob = 1.0;
  for (let i = 0; i < gemsFound; i++) {
    const remaining = totalCells - i;
    const mines = mineCount;
    const safe = remaining - mines;
    prob *= safe / remaining;
  }
  // Payout = (1 / prob) * (1 - house_edge), house edge ~4%
  const raw = 1 / prob;
  return Math.max(1.0, Math.floor(raw * 0.96 * 100) / 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let payload: Record<string, unknown> = {};

    if (req.method === "GET") {
      const url = new URL(req.url);
      for (const [k, v] of url.searchParams.entries()) {
        payload[k] = v;
      }
    } else {
      payload = await req.json();
    }

    const action = (payload.action ?? payload.game_type ?? "") as string;

    // ── mines_start ──────────────────────────────────────────────────────────
    if (action === "mines_start") {
      const { user_id, mine_count, stake } = payload;
      const stakeNum = Number(stake);
      const mineCountNum = Math.min(24, Math.max(1, Number(mine_count ?? 3)));

      if (!user_id || !stakeNum || stakeNum <= 0) {
        throw new Error("Missing required fields: user_id, stake");
      }

      // Deduct stake from balance atomically
      const { data: newBalanceData, error: deductError } = await supabase
        .rpc("profiles_deduct_balance", { p_user_id: user_id, p_amount: stakeNum });

      if (deductError) {
        const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
        return new Response(
          JSON.stringify({ success: false, error: "Insufficient balance", balance_after: Number(profile?.balance ?? 0) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const newBalance = Number(newBalanceData);

      // Randomly place mines on the 5x5 grid
      const totalCells = 25;
      const allPositions = Array.from({ length: totalCells }, (_, i) => i);
      // Fisher-Yates shuffle to pick mine positions
      for (let i = allPositions.length - 1; i > 0; i--) {
        const j = Math.floor(getSecureRandom() * (i + 1));
        [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
      }
      const minePositions = allPositions.slice(0, mineCountNum);

      // Store session in DB
      const { data: session, error: sessionError } = await supabase
        .from("mines_sessions")
        .insert({
          user_id,
          mine_positions: minePositions,
          mine_count: mineCountNum,
          stake: stakeNum,
          gems_found: 0,
          status: "active",
        })
        .select("id")
        .single();

      if (sessionError || !session) {
        // Refund on failure
        await supabase.rpc("profiles_add_balance", { p_user_id: user_id, p_amount: stakeNum }).catch(() => {});
        throw new Error(`Could not create session: ${sessionError?.message ?? "unknown"}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          session_id: session.id,
          balance_after: newBalance,
          grid_size: totalCells,
          mine_count: mineCountNum,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── mines_reveal ─────────────────────────────────────────────────────────
    if (action === "mines_reveal") {
      const { user_id, session_id, tile_index } = payload;
      const tileIdx = Number(tile_index);

      if (!user_id || !session_id || isNaN(tileIdx)) {
        throw new Error("Missing required fields: user_id, session_id, tile_index");
      }

      // Load session
      const { data: session, error: sessionError } = await supabase
        .from("mines_sessions")
        .select("id, user_id, mine_positions, mine_count, stake, gems_found, status")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .single();

      if (sessionError || !session) throw new Error("Session not found");
      if (session.status !== "active") throw new Error("Session is no longer active");

      const minePositions: number[] = session.mine_positions as number[];
      const isMine = minePositions.includes(tileIdx);

      if (isMine) {
        // Mark session as busted
        await supabase.from("mines_sessions")
          .update({ status: "busted", updated_at: new Date().toISOString() })
          .eq("id", session_id);

        // Record lost bet
        const now = new Date().toISOString();
        await safeInsert(
          supabase.from("bets").insert({
            user_id,
            bet_amount: Number(session.stake),
            win_amount: 0,
            multiplier: 0,
            status: "lost",
            bet_details: { mines: session.mine_count, gems: session.gems_found },
            placed_at: now,
            resolved_at: now,
          })
        );

        return new Response(
          JSON.stringify({
            success: true,
            is_mine: true,
            gems_found: session.gems_found,
            current_multiplier: minesMultiplier(session.mine_count, session.gems_found),
            next_multiplier: minesMultiplier(session.mine_count, session.gems_found),
            mine_positions: minePositions,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Safe tile — increment gems_found
      const newGemsFound = (session.gems_found as number) + 1;
      const currentMult = minesMultiplier(session.mine_count, newGemsFound);
      const nextMult = minesMultiplier(session.mine_count, newGemsFound + 1);

      await supabase.from("mines_sessions")
        .update({ gems_found: newGemsFound, updated_at: new Date().toISOString() })
        .eq("id", session_id);

      return new Response(
        JSON.stringify({
          success: true,
          is_mine: false,
          gems_found: newGemsFound,
          current_multiplier: currentMult,
          next_multiplier: nextMult,
          mine_positions: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── mines_cashout ────────────────────────────────────────────────────────
    if (action === "mines_cashout") {
      const { user_id, session_id } = payload;

      if (!user_id || !session_id) {
        throw new Error("Missing required fields: user_id, session_id");
      }

      const { data: session, error: sessionError } = await supabase
        .from("mines_sessions")
        .select("id, user_id, mine_positions, mine_count, stake, gems_found, status")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .single();

      if (sessionError || !session) throw new Error("Session not found");
      if (session.status !== "active") throw new Error("Session is no longer active");
      if ((session.gems_found as number) === 0) throw new Error("Must reveal at least one gem before cashing out");

      const multiplier = minesMultiplier(session.mine_count, session.gems_found as number);
      const stakeNum = Number(session.stake);
      const payout = Math.round(stakeNum * multiplier * 100) / 100;

      // Mark session as cashed_out
      await supabase.from("mines_sessions")
        .update({ status: "cashed_out", updated_at: new Date().toISOString() })
        .eq("id", session_id);

      // Credit winnings
      const { data: newBalanceData, error: balanceError } = await supabase
        .rpc("profiles_add_balance", { p_user_id: user_id, p_amount: payout });

      let newBalance: number;
      if (balanceError) {
        const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
        newBalance = Number(profile?.balance ?? 0) + payout;
        await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);
      } else {
        newBalance = Number(newBalanceData);
      }

      // Record won bet
      const now = new Date().toISOString();
      await safeInsert(
        supabase.from("bets").insert({
          user_id,
          bet_amount: stakeNum,
          win_amount: payout,
          multiplier,
          status: "won",
          bet_details: { mines: session.mine_count, gems: session.gems_found },
          placed_at: now,
          resolved_at: now,
        })
      );

      return new Response(
        JSON.stringify({
          success: true,
          payout,
          multiplier,
          balance_after: newBalance,
          mine_positions: session.mine_positions as number[],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_current_round ────────────────────────────────────────────────
    if (action === "aviator_current_round") {
      const { data: rpcResult, error: rpcError } = await supabase.rpc("aviator_get_current_round");

      if (rpcError || !rpcResult) {
        const { data: row } = await supabase
          .from("aviator_current_round")
          .select("round_uuid, phase, phase_started_at, crash_point, last_crash_point, server_seed_hash")
          .eq("id", 1)
          .single();

        if (!row) {
          return new Response(
            JSON.stringify({ phase: "waiting", elapsed_ms: 0, round_uuid: null, crash_point: null, last_crash_point: null, server_seed_hash: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const phaseStartedAt = new Date(row.phase_started_at).getTime();
        const elapsed_ms = Math.max(0, Date.now() - phaseStartedAt);
        return new Response(
          JSON.stringify({
            phase: row.phase ?? "waiting",
            elapsed_ms,
            round_uuid: row.round_uuid ?? null,
            crash_point: row.crash_point != null ? Number(row.crash_point) : null,
            last_crash_point: row.last_crash_point != null ? Number(row.last_crash_point) : null,
            server_seed_hash: row.server_seed_hash ?? null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const r = rpcResult as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          phase: r.phase ?? "waiting",
          elapsed_ms: Number(r.elapsed_ms ?? 0),
          round_uuid: r.round_uuid ?? null,
          crash_point: r.crash_point != null ? Number(r.crash_point) : null,
          last_crash_point: r.last_crash_point != null ? Number(r.last_crash_point) : null,
          server_seed_hash: r.server_seed_hash ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_history ──────────────────────────────────────────────────────
    if (action === "aviator_history") {
      const { data: rows } = await supabase
        .from("aviator_rounds")
        .select("bust_point")
        .order("id", { ascending: false })
        .limit(20);

      const history = (rows ?? [])
        .map((r: { bust_point: unknown }) => Number(r.bust_point))
        .filter((v: number) => !isNaN(v) && v > 0);

      return new Response(
        JSON.stringify({ history }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_history_detail ───────────────────────────────────────────────
    if (action === "aviator_history_detail") {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("aviator_get_history_detail");
      if (!rpcErr && rpcData) {
        return new Response(
          JSON.stringify(rpcData),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: rows } = await supabase
        .from("aviator_rounds")
        .select("bust_point, round_uuid, server_seed, server_seed_hash")
        .order("id", { ascending: false })
        .limit(20);

      const history = (rows ?? []).map((r: { bust_point: unknown; round_uuid: unknown; server_seed: unknown; server_seed_hash: unknown }) => ({
        bust_point: Number(r.bust_point),
        round_uuid: r.round_uuid ?? null,
        server_seed: r.server_seed ?? null,
        server_seed_hash: r.server_seed_hash ?? null,
      }));

      return new Response(
        JSON.stringify({ history }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── crash_current_round ──────────────────────────────────────────────────
    if (action === "crash_current_round") {
      const { data: row } = await supabase
        .from("crash_current_round")
        .select("round_uuid, phase, phase_started_at, crash_point, last_crash_point, server_seed_hash")
        .eq("id", 1)
        .single();

      if (!row) {
        return new Response(
          JSON.stringify({ phase: "waiting", elapsed_ms: 0, round_uuid: null, crash_point: null, last_crash_point: null, server_seed_hash: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const phaseStartedAt = new Date(row.phase_started_at).getTime();
      const elapsed_ms = Math.max(0, Date.now() - phaseStartedAt);

      return new Response(
        JSON.stringify({
          phase: row.phase ?? "waiting",
          elapsed_ms,
          round_uuid: row.round_uuid ?? null,
          crash_point: row.crash_point != null ? Number(row.crash_point) : null,
          last_crash_point: row.last_crash_point != null ? Number(row.last_crash_point) : null,
          server_seed_hash: row.server_seed_hash ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── crash_history ────────────────────────────────────────────────────────
    if (action === "crash_history") {
      const { data: rows } = await supabase
        .from("crash_rounds")
        .select("bust_point")
        .order("id", { ascending: false })
        .limit(20);

      const history = (rows ?? [])
        .map((r: { bust_point: unknown }) => Number(r.bust_point))
        .filter((v: number) => !isNaN(v) && v > 0);

      return new Response(
        JSON.stringify({ history }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── crash_history_detail ─────────────────────────────────────────────────
    if (action === "crash_history_detail") {
      const { data: rows } = await supabase
        .from("crash_rounds")
        .select("bust_point, round_uuid, server_seed, server_seed_hash, created_at")
        .order("id", { ascending: false })
        .limit(20);

      const history = (rows ?? []).map((r: { bust_point: unknown; round_uuid: unknown; server_seed: unknown; server_seed_hash: unknown; created_at: unknown }) => ({
        bust_point: Number(r.bust_point),
        round_uuid: r.round_uuid ?? null,
        server_seed: r.server_seed ?? null,
        server_seed_hash: r.server_seed_hash ?? null,
        created_at: r.created_at ?? null,
      }));

      return new Response(
        JSON.stringify({ history }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_bets ─────────────────────────────────────────────────────────
    if (action === "aviator_bets") {
      const round_uuid = payload.round_uuid as string | undefined;
      if (!round_uuid) {
        return new Response(
          JSON.stringify({ bets: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: rows1 } = await supabase
        .from("bets")
        .select("user_id, bet_amount, win_amount, multiplier, status, placed_at, bet_details")
        .eq("game_id", "dfec9812-9596-43db-8b70-791200770f2b")
        .contains("bet_details", { round_uuid })
        .order("placed_at", { ascending: true })
        .limit(200);

      const { data: rows2 } = await supabase
        .from("bets")
        .select("user_id, bet_amount, win_amount, multiplier, status, placed_at, bet_details")
        .is("game_id", null)
        .contains("bet_details", { round_uuid })
        .order("placed_at", { ascending: true })
        .limit(200);

      const { data: rows3 } = await supabase
        .from("bets")
        .select("user_id, bet_amount, win_amount, multiplier, status, placed_at, bet_details")
        .contains("bet_details", { round_uuid, game: "aviator" })
        .order("placed_at", { ascending: true })
        .limit(200);

      const seen = new Set<string>();
      const allRows: {
        user_id: unknown;
        bet_amount: unknown;
        win_amount: unknown;
        multiplier: unknown;
        status: unknown;
        placed_at: unknown;
      }[] = [];
      for (const r of [...(rows1 ?? []), ...(rows2 ?? []), ...(rows3 ?? [])]) {
        const key = `${r.user_id as string}-${r.placed_at as string}`;
        if (!seen.has(key)) {
          seen.add(key);
          allRows.push(r);
        }
      }

      const bets = allRows.map((b) => ({
        user_id: b.user_id,
        bet_amount: Number(b.bet_amount),
        win_amount: b.win_amount != null ? Number(b.win_amount) : null,
        multiplier: b.multiplier != null ? Number(b.multiplier) : null,
        status: b.status,
        placed_at: b.placed_at,
      }));

      return new Response(
        JSON.stringify({ bets }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_my_bets ──────────────────────────────────────────────────────
    if (action === "aviator_my_bets") {
      const user_id = payload.user_id as string | undefined;
      if (!user_id) {
        return new Response(
          JSON.stringify({ bets: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .rpc("get_aviator_my_bets", { p_user_id: user_id, p_limit: 50 });

      if (error) {
        return new Response(
          JSON.stringify({ bets: [], error: error.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ bets: data ?? [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_top_wins ─────────────────────────────────────────────────────
    if (action === "aviator_top_wins") {
      const { data, error } = await supabase
        .rpc("get_aviator_top_wins", { p_limit: 10 });

      if (error) {
        return new Response(
          JSON.stringify({ wins: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ wins: data ?? [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── sunvsmoon_result ─────────────────────────────────────────────────────
    if (action === "sunvsmoon_result") {
      const round_id = payload.round_id;
      const { data: existing } = await supabase.from("sunvsmoon_rounds").select("result").eq("round_id", round_id).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ success: true, result: existing.result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const adminManual = await getAdminSunMoonManualResult(supabase);
      let result: string;
      if (adminManual) {
        result = adminManual;
        await revertSunMoonToAuto(supabase);
      } else {
        const rand = getSecureRandom();
        result = rand < 0.45 ? "sun" : rand < 0.90 ? "moon" : "tie";
      }
      await supabase.from("sunvsmoon_rounds").insert({ round_id, result });
      return new Response(JSON.stringify({ success: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── sunvsmoon_settle ─────────────────────────────────────────────────────
    if (action === "sunvsmoon_settle") {
      const { user_id, round_id, bet, stake } = payload;
      const stakeNum = Number(stake);
      if (!user_id || !round_id || !bet || !stakeNum) {
        throw new Error("Missing required fields: user_id, round_id, bet, stake");
      }

      let roundResult: string;
      const { data: existing } = await supabase.from("sunvsmoon_rounds").select("result").eq("round_id", round_id).maybeSingle();
      if (existing) {
        roundResult = existing.result;
      } else {
        const adminManual = await getAdminSunMoonManualResult(supabase);
        if (adminManual) {
          roundResult = adminManual;
          await revertSunMoonToAuto(supabase);
        } else {
          const rand = getSecureRandom();
          roundResult = rand < 0.45 ? "sun" : rand < 0.90 ? "moon" : "tie";
        }
        await supabase.from("sunvsmoon_rounds").insert({ round_id, result: roundResult });
      }

      const won = bet === roundResult;
      const totalMultipliers: Record<string, number> = { sun: 2, moon: 2, tie: 9 };
      const totalMultiplier = totalMultipliers[bet as string] ?? 2;
      const winAmount = won ? Math.round(stakeNum * totalMultiplier) : 0;
      const profit = won ? winAmount - stakeNum : 0;

      const { data: profile, error: profileError } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
      if (profileError || !profile) throw new Error("User profile not found");

      const currentBalance = Number(profile.balance);
      const newBalance = currentBalance - stakeNum + winAmount;

      const { error: updateError } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);
      if (updateError) throw new Error(`Balance update failed: ${updateError.message}`);

      const now = new Date().toISOString();
      await safeInsert(
        supabase.from("bets").insert({
          user_id,
          round_id: round_id ?? null,
          bet_amount: stakeNum,
          win_amount: winAmount,
          multiplier: won ? totalMultiplier : 0,
          status: won ? "won" : "lost",
          bet_details: {
            game: "sunvsmoon",
            round_number: round_id,
            bet: bet,
            bet_choice: bet,
            result: roundResult,
            profit,
          },
          placed_at: now,
          resolved_at: now,
        })
      );

      return new Response(
        JSON.stringify({ success: true, won, result: roundResult, profit, balance_after: newBalance }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_cancel_bet ───────────────────────────────────────────────────
    if (action === "aviator_cancel_bet") {
      const { user_id, bet_amount, bet_id } = payload;
      const betNum = Number(bet_amount);
      if (!user_id || !betNum) throw new Error("Missing required fields: user_id, bet_amount");

      const CANCEL_GRACE_MS = 2000;

      const { data: roundRow } = await supabase
        .from("aviator_current_round")
        .select("phase, phase_started_at")
        .eq("id", 1)
        .single();

      const currentPhase = roundRow?.phase ?? "waiting";
      const phaseElapsedMs = roundRow?.phase_started_at
        ? Math.max(0, Date.now() - new Date(roundRow.phase_started_at).getTime())
        : 0;

      if (currentPhase === "flying" && phaseElapsedMs > CANCEL_GRACE_MS) {
        return new Response(
          JSON.stringify({ success: false, error: "Round already started, cannot cancel" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      if (currentPhase === "crashed") {
        return new Response(
          JSON.stringify({ success: false, error: "Round already ended, cannot cancel" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const { data: newBalanceData, error: refundError } = await supabase
        .rpc("profiles_add_balance", { p_user_id: user_id, p_amount: betNum });

      if (refundError) {
        const { data: profile, error: profileError } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
        if (profileError || !profile) throw new Error("User profile not found");
        const newBalance = Number(profile.balance) + betNum;
        const { error: updateError } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);
        if (updateError) throw new Error(`Balance refund failed: ${updateError.message}`);
        if (bet_id) {
          await safeInsert(supabase.from("bets").delete().eq("id", bet_id).eq("user_id", user_id).eq("status", "pending"));
        }
        return new Response(
          JSON.stringify({ success: true, balance_after: newBalance }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (bet_id) {
        await safeInsert(
          supabase.from("bets").delete().eq("id", bet_id).eq("user_id", user_id).eq("status", "pending")
        );
      }

      return new Response(
        JSON.stringify({ success: true, balance_after: Number(newBalanceData) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_cashout ──────────────────────────────────────────────────────
    if (action === "aviator_cashout") {
      const { user_id, bet_amount, cashout_at, placed_at_ms } = payload;
      const betNum = Number(bet_amount);
      const cashoutMultiplier = Math.max(
        1.0,
        Number(cashout_at ?? payload.cashout_multiplier ?? payload.multiplier ?? 1.0)
      );
      const roundUuid = payload.round_uuid ?? null;
      const betId = payload.bet_id ?? null;
      if (!user_id || !betNum) throw new Error("Missing required fields: user_id, bet_amount");
      if (cashoutMultiplier <= 0) throw new Error("Invalid cashout multiplier");

      const winAmount = Math.round(betNum * cashoutMultiplier);
      const now = new Date().toISOString();
      const betDetails = { game: "aviator", cashOutAt: cashoutMultiplier, bustPoint: 0, round_uuid: roundUuid, placed_at_ms: placed_at_ms ?? null };

      let bustPoint: number | null = null;
      if (roundUuid) {
        const { data: roundData } = await supabase
          .from("aviator_rounds")
          .select("bust_point")
          .eq("round_uuid", roundUuid)
          .order("id", { ascending: false })
          .limit(1);
        if (roundData && roundData.length > 0 && roundData[0].bust_point != null) {
          bustPoint = Number(roundData[0].bust_point);
        }
      }
      if (bustPoint !== null && cashoutMultiplier > bustPoint) {
        return new Response(
          JSON.stringify({ success: false, won: false, win: 0, balance_after: null, crash_point: bustPoint }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
      betDetails.bustPoint = bustPoint ?? 0;

      if (betId) {
        const { data: claimedBets, error: claimError } = await supabase
          .from("bets")
          .update({
            win_amount: winAmount,
            multiplier: cashoutMultiplier,
            status: "won",
            resolved_at: now,
            bet_details: betDetails,
          })
          .eq("id", betId)
          .eq("user_id", user_id)
          .eq("status", "pending")
          .select("id");

        if (claimError) {
          console.error("Bet claim UPDATE error:", claimError.message);
        }

        const claimed = !claimError && Array.isArray(claimedBets) && claimedBets.length > 0;

        if (!claimed) {
          const { data: existingBet } = await supabase.from("bets").select("id, status, win_amount, multiplier").eq("id", betId).maybeSingle();
          const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
          if (existingBet?.status === "won") {
            return new Response(
              JSON.stringify({ success: true, won: true, win: existingBet.win_amount ?? 0, balance_after: Number(profile?.balance ?? 0), cashout_at: Number(existingBet.multiplier ?? cashoutMultiplier), crash_point: bustPoint }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ success: false, won: false, win: 0, balance_after: Number(profile?.balance ?? 0), crash_point: bustPoint }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }

        const { data: newBalanceData, error: balanceRpcError } = await supabase
          .rpc("profiles_add_balance", { p_user_id: user_id, p_amount: winAmount });

        let newBalance: number;
        if (balanceRpcError) {
          const { data: profile, error: profileError } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
          if (profileError || !profile) throw new Error("User profile not found");
          newBalance = Number(profile.balance) + winAmount;
          const { error: updateError } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);
          if (updateError) throw new Error(`Balance update failed: ${updateError.message}`);
        } else {
          newBalance = Number(newBalanceData);
        }

        return new Response(
          JSON.stringify({ success: true, won: true, win: winAmount, balance_after: newBalance, cashout_at: cashoutMultiplier, crash_point: bustPoint }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } else {
        if (roundUuid) {
          const { data: existingCashout } = await supabase
            .from("bets")
            .select("id, status, win_amount, multiplier")
            .eq("user_id", user_id)
            .eq("status", "won")
            .contains("bet_details", { round_uuid: roundUuid, game: "aviator" })
            .maybeSingle();
          if (existingCashout) {
            const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
            return new Response(
              JSON.stringify({ success: true, won: true, win: existingCashout.win_amount ?? 0, balance_after: Number(profile?.balance ?? 0), cashout_at: Number(existingCashout.multiplier ?? cashoutMultiplier), crash_point: bustPoint }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const { error: insertError } = await supabase.from("bets").insert({
          user_id,
          round_id: null,
          bet_amount: betNum,
          win_amount: winAmount,
          multiplier: cashoutMultiplier,
          status: "won",
          bet_details: betDetails,
          placed_at: placed_at_ms ? new Date(Number(placed_at_ms)).toISOString() : now,
          resolved_at: now,
        });

        if (insertError) {
          const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
          return new Response(
            JSON.stringify({ success: false, won: false, win: 0, balance_after: Number(profile?.balance ?? 0), crash_point: bustPoint }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }

        const { data: newBalanceData, error: balanceRpcError } = await supabase
          .rpc("profiles_add_balance", { p_user_id: user_id, p_amount: winAmount });

        let newBalance: number;
        if (balanceRpcError) {
          const { data: profile, error: profileError } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
          if (profileError || !profile) throw new Error("User profile not found");
          newBalance = Number(profile.balance) + winAmount;
          const { error: updateError } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);
          if (updateError) throw new Error(`Balance update failed: ${updateError.message}`);
        } else {
          newBalance = Number(newBalanceData);
        }

        return new Response(
          JSON.stringify({ success: true, won: true, win: winAmount, balance_after: newBalance, cashout_at: cashoutMultiplier, crash_point: bustPoint }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── aviator_place_bet ────────────────────────────────────────────────────
    if (action === "aviator_place_bet") {
      const { user_id, bet_amount, round_id } = payload;
      const betNum = Number(bet_amount);
      const roundUuid = payload.round_uuid ?? null;
      if (!user_id || !betNum) throw new Error("Missing required fields: user_id, bet_amount");

      const { data: roundRow, error: roundErr } = await supabase
        .from("aviator_current_round")
        .select("phase, phase_started_at, round_uuid")
        .eq("id", 1)
        .single();

      if (roundErr || !roundRow) throw new Error("Failed to read round state");

      const currentPhase = roundRow.phase as string;
      const phaseStartedAt = new Date(roundRow.phase_started_at).getTime();
      const serverElapsedMs = Math.max(0, Date.now() - phaseStartedAt);

      if (currentPhase === "flying") {
        const FLYING_GRACE_MS = 15000;
        if (serverElapsedMs > FLYING_GRACE_MS) {
          return new Response(
            JSON.stringify({ success: false, error: "Betting window closed", balance_after: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      }

      if (currentPhase === "crashed") {
        return new Response(
          JSON.stringify({ success: false, error: "Round already ended", balance_after: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const { data: newBalanceData, error: deductError } = await supabase
        .rpc("profiles_deduct_balance", { p_user_id: user_id, p_amount: betNum });

      if (deductError) {
        const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
        const currentBalance = Number(profile?.balance ?? 0);
        return new Response(
          JSON.stringify({ success: false, error: "Insufficient balance", balance_after: currentBalance }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const newBalance = Number(newBalanceData);

      const { data: betRecord, error: betInsertError } = await supabase
        .from("bets")
        .insert({
          user_id,
          game_id: "dfec9812-9596-43db-8b70-791200770f2b",
          round_id: null,
          bet_amount: betNum,
          win_amount: 0,
          multiplier: 0,
          status: "pending",
          bet_details: { game: "aviator", round_id: round_id ?? null, round_uuid: roundUuid ?? roundRow.round_uuid ?? null },
          placed_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (betInsertError) {
        await supabase.rpc("profiles_add_balance", { p_user_id: user_id, p_amount: betNum }).catch(() => {});
        throw new Error(`Bet record failed: ${betInsertError.message}`);
      }

      const betId = (betRecord as { id?: string } | null)?.id ?? null;

      return new Response(
        JSON.stringify({ success: true, balance_after: newBalance, bet_id: betId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_settle ───────────────────────────────────────────────────────
    if (action === "aviator_settle" || action === "aviator_settle_lost") {
      const { user_id, bet_amount, bust_point, round_uuid } = payload;
      if (user_id && bet_amount) {
        const now = new Date().toISOString();
        const bustPt = Number(bust_point ?? 0);
        if (round_uuid) {
          const { data: pendingBet } = await supabase.from("bets").select("id, status").eq("user_id", user_id).eq("status", "pending").contains("bet_details", { round_uuid }).maybeSingle();
          if (pendingBet && pendingBet.status === "pending") {
            await safeInsert(
              supabase.from("bets").update({ win_amount: 0, multiplier: bustPt, status: "lost", resolved_at: now, bet_details: { game: "aviator", bustPoint: bustPt, cashOutAt: null, round_uuid } }).eq("id", pendingBet.id)
            );
            return new Response(JSON.stringify({ success: true, crash_point: bustPt }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
        await safeInsert(
          supabase.from("bets").insert({ user_id, game_id: "dfec9812-9596-43db-8b70-791200770f2b", round_id: null, bet_amount: Number(bet_amount), win_amount: 0, multiplier: 0, status: "lost", bet_details: { game: "aviator", bustPoint: Number(bust_point ?? 0), cashOutAt: null }, placed_at: now, resolved_at: now })
        );
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── aviator_round_start ──────────────────────────────────────────────────
    if (action === "aviator_round_start") {
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── aviator_round_status ─────────────────────────────────────────────────
    if (action === "aviator_round_status") {
      const round_id = payload.round_id;
      const { data: roundData } = await supabase.from("aviator_rounds").select("bust_point").eq("round_uuid", round_id).maybeSingle();
      if (roundData) {
        return new Response(JSON.stringify({ crashed: true, crash_point: Number(roundData.bust_point) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ crashed: false, crash_point: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Legacy handlers (crash, dice) ────────────────────────────────────────
    if (action === "crash" || action === "dice" ||
        (payload.game_type !== undefined && payload.bet_amount !== undefined)) {

      const { game_type, bet_amount, user_id } = payload;

      if (!game_type || !bet_amount || !user_id) {
        throw new Error("Missing required fields");
      }

      const { data: userBalance, error: balanceError } = await supabase
        .from("balances")
        .select("balance, user_id")
        .eq("user_id", user_id)
        .single();

      if (balanceError || !userBalance) {
        throw new Error("User balance not found or unauthorized");
      }

      const balanceBefore = Number(userBalance.balance);
      if (Number(bet_amount) <= 0) throw new Error("Bet amount must be positive");
      if (Number(bet_amount) > balanceBefore) throw new Error("Insufficient balance");

      let multiplier = 1;
      let won = false;

      if (game_type === "crash") {
        multiplier = Math.max(1.01, Math.exp(getSecureRandom() * 5));
        won = false;
      } else if (game_type === "dice") {
        const roll = Math.floor(getSecureRandom() * 100) + 1;
        multiplier = roll >= 50 ? 2 : 0;
        won = roll >= 50;
      }

      const payout = won ? Number(bet_amount) * multiplier : 0;
      const finalBalance = balanceBefore - Number(bet_amount) + payout;
      const transactionId = crypto.randomUUID();

      const { error: updateError } = await supabase.rpc("process_bet_atomic", {
        user_id,
        bet_amount,
        payout,
        game_type,
        multiplier,
        transaction_id: transactionId,
      });

      if (updateError) throw new Error(`Transaction failed: ${updateError.message}`);

      return new Response(
        JSON.stringify({
          success: true,
          transaction_id: transactionId,
          balance_before: balanceBefore,
          balance_after: finalBalance,
          game_result: { outcome: won ? "win" : "loss", multiplier, payout },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message, transaction_id: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
