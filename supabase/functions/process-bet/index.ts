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

    // ── aviator_current_round ────────────────────────────────────────────────
    // Returns the current round state so the client engine can sync with server.
    if (action === "aviator_current_round") {
      const { data: row } = await supabase
        .from("aviator_current_round")
        .select("round_uuid, phase, phase_started_at, crash_point, last_crash_point")
        .eq("id", 1)
        .single();

      if (!row) {
        // No row yet — tell client we are in waiting phase
        return new Response(
          JSON.stringify({ phase: "waiting", elapsed_ms: 0, round_uuid: null, crash_point: null, last_crash_point: null }),
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
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_history ──────────────────────────────────────────────────────
    // Returns the last 20 crash points for the history bar.
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

    // ── sunvsmoon_result ─────────────────────────────────────────────────────
    if (action === "sunvsmoon_result") {
      const round_id = payload.round_id;
      const { data: existing } = await supabase.from("sunvsmoon_rounds").select("result").eq("round_id", round_id).maybeSingle();
      if (existing) return new Response(JSON.stringify({ success: true, result: existing.result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const rand = getSecureRandom();
      const result = rand < 0.45 ? "sun" : rand < 0.90 ? "moon" : "tie";
      await supabase.from("sunvsmoon_rounds").insert({ round_id, result });
      return new Response(JSON.stringify({ success: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── sunvsmoon_settle ─────────────────────────────────────────────────────
    if (action === "sunvsmoon_settle") {
      const { user_id, round_id, bet, stake } = payload;
      const stakeNum = Number(stake);
      if (!user_id || !round_id || !bet || !stakeNum) throw new Error("Missing required fields: user_id, round_id, bet, stake");
      let roundResult: string;
      const { data: existing } = await supabase.from("sunvsmoon_rounds").select("result").eq("round_id", round_id).maybeSingle();
      if (existing) {
        roundResult = existing.result;
      } else {
        const manualResult = payload.manualResult ?? null;
        if (manualResult && ["sun", "moon", "tie"].includes(manualResult as string)) {
          roundResult = manualResult as string;
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
      const newBalance = won ? profile.balance + winAmount : profile.balance;
      const { error: updateError } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);
      if (updateError) throw new Error(`Balance update failed: ${updateError.message}`);
      const now = new Date().toISOString();
      await supabase.from("bets").insert({ user_id, round_id: round_id ?? null, bet_amount: stakeNum, win_amount: winAmount, multiplier: won ? totalMultiplier : 0, status: won ? "won" : "lost", bet_details: { game: "sunvsmoon", result: roundResult, bet_choice: bet, profit }, placed_at: now, resolved_at: now }).catch(() => {});
      return new Response(JSON.stringify({ success: true, won, result: roundResult, profit, balance_after: newBalance }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── aviator_cancel_bet ───────────────────────────────────────────────────
    if (action === "aviator_cancel_bet") {
      const { user_id, bet_amount, bet_id } = payload;
      const betNum = Number(bet_amount);
      if (!user_id || !betNum) throw new Error("Missing required fields: user_id, bet_amount");

      const CANCEL_GRACE_MS = 2000;

      const { data: currentRound } = await supabase
        .from("aviator_current_round")
        .select("phase, phase_started_at")
        .eq("id", 1)
        .single();

      if (currentRound && currentRound.phase === "flying") {
        const phaseStartedAt = new Date(currentRound.phase_started_at).getTime();
        const elapsedSinceFlying = Date.now() - phaseStartedAt;
        if (elapsedSinceFlying > CANCEL_GRACE_MS) {
          return new Response(
            JSON.stringify({ success: false, error: "Round already started, cannot cancel" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      }

      if (currentRound && currentRound.phase === "crashed") {
        return new Response(
          JSON.stringify({ success: false, error: "Round already ended, cannot cancel" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();
      if (profileError || !profile) throw new Error("User profile not found");

      const newBalance = profile.balance + betNum;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user_id);
      if (updateError) throw new Error(`Balance refund failed: ${updateError.message}`);

      if (bet_id) {
        await supabase
          .from("bets")
          .delete()
          .eq("id", bet_id)
          .eq("user_id", user_id)
          .eq("status", "pending")
          .catch(() => {});
      }

      return new Response(
        JSON.stringify({ success: true, balance_after: newBalance }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_cashout ──────────────────────────────────────────────────────
    if (action === "aviator_cashout") {
      const { user_id, bet_amount, cashout_at, placed_at_ms } = payload;
      const betNum = Number(bet_amount);
      const cashoutMultiplier = Number(cashout_at ?? payload.cashout_multiplier ?? payload.multiplier ?? 0);
      const roundUuid = payload.round_uuid ?? null;
      const betId = payload.bet_id ?? null;
      if (!user_id || !betNum) throw new Error("Missing required fields: user_id, bet_amount");
      if (!cashoutMultiplier || cashoutMultiplier < 1.01) throw new Error("Invalid cashout multiplier");

      if (betId) {
        const { data: existingBet } = await supabase.from("bets").select("id, status, win_amount, multiplier").eq("id", betId).maybeSingle();
        if (existingBet && existingBet.status === "won") {
          const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
          return new Response(JSON.stringify({ success: true, won: true, win: existingBet.win_amount ?? 0, balance_after: profile?.balance ?? 0, cashout_at: Number(existingBet.multiplier ?? cashoutMultiplier), crash_point: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (existingBet && existingBet.status === "lost") {
          const { data: profile } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
          return new Response(JSON.stringify({ success: false, won: false, win: 0, balance_after: profile?.balance ?? null, crash_point: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }
      }

      let bustPoint: number | null = null;
      if (roundUuid) {
        const { data: roundData } = await supabase.from("aviator_rounds").select("bust_point").eq("round_uuid", roundUuid).order("id", { ascending: false }).limit(1);
        if (roundData && roundData.length > 0 && roundData[0].bust_point != null) bustPoint = Number(roundData[0].bust_point);
      }
      if (bustPoint !== null && cashoutMultiplier > bustPoint) {
        return new Response(JSON.stringify({ success: false, won: false, win: 0, balance_after: null, crash_point: bustPoint, reason: `Cashout at ${cashoutMultiplier}x is after crash at ${bustPoint}x` }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      }

      const winAmount = Math.round(betNum * cashoutMultiplier);
      const { data: profile, error: profileError } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
      if (profileError || !profile) throw new Error("User profile not found");
      const newBalance = profile.balance + winAmount;
      const { error: updateError } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);
      if (updateError) throw new Error(`Balance update failed: ${updateError.message}`);

      const now = new Date().toISOString();
      if (betId) {
        await supabase.from("bets").update({ win_amount: winAmount, multiplier: cashoutMultiplier, status: "won", resolved_at: now, bet_details: { game: "aviator", cashOutAt: cashoutMultiplier, bustPoint: bustPoint ?? 0, round_uuid: roundUuid, placed_at_ms: placed_at_ms ?? null } }).eq("id", betId).catch(() => {});
      } else {
        await supabase.from("bets").insert({ user_id, round_id: null, bet_amount: betNum, win_amount: winAmount, multiplier: cashoutMultiplier, status: "won", bet_details: { game: "aviator", cashOutAt: cashoutMultiplier, bustPoint: bustPoint ?? 0, round_uuid: roundUuid, placed_at_ms: placed_at_ms ?? null }, placed_at: placed_at_ms ? new Date(Number(placed_at_ms)).toISOString() : now, resolved_at: now }).catch(() => {});
      }
      return new Response(JSON.stringify({ success: true, won: true, win: winAmount, balance_after: newBalance, cashout_at: cashoutMultiplier, crash_point: bustPoint }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── aviator_place_bet ────────────────────────────────────────────────────
    if (action === "aviator_place_bet") {
      const { user_id, bet_amount, round_id } = payload;
      const betNum = Number(bet_amount);
      const roundUuid = payload.round_uuid ?? null;
      if (!user_id || !betNum) throw new Error("Missing required fields: user_id, bet_amount");

      const clientPlacedAtMs = payload.placed_at_ms ? Number(payload.placed_at_ms) : Date.now();

      const { data: currentRound } = await supabase
        .from("aviator_current_round")
        .select("phase, phase_started_at, crash_point")
        .eq("id", 1)
        .single();

      if (currentRound) {
        const phaseStartedAt = new Date(currentRound.phase_started_at).getTime();

        if (currentRound.phase === "flying") {
          const gracePeriodMs = 5000;
          if (clientPlacedAtMs > phaseStartedAt + gracePeriodMs) {
            return new Response(
              JSON.stringify({ success: false, error: "Betting window closed", balance_after: null }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
            );
          }
        }

        if (currentRound.phase === "crashed") {
          const gracePeriodMs = 5000;
          if (clientPlacedAtMs > phaseStartedAt + gracePeriodMs) {
            return new Response(
              JSON.stringify({ success: false, error: "Round already ended", balance_after: null }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
            );
          }
        }
      }

      const { data: profile, error: profileError } = await supabase.from("profiles").select("balance").eq("id", user_id).single();
      if (profileError || !profile) throw new Error("User profile not found");

      if (profile.balance < betNum) {
        return new Response(
          JSON.stringify({ success: false, error: "Insufficient balance", balance_after: profile.balance }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const newBalance = profile.balance - betNum;
      const { error: updateError } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", user_id);
      if (updateError) throw new Error(`Balance deduction failed: ${updateError.message}`);

      const { data: betRecord } = await supabase
        .from("bets")
        .insert({
          user_id,
          round_id: null,
          bet_amount: betNum,
          win_amount: 0,
          multiplier: 0,
          status: "pending",
          bet_details: { game: "aviator", round_id: round_id ?? null, round_uuid: roundUuid },
          placed_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle()
        .catch(() => ({ data: null }));

      return new Response(
        JSON.stringify({ success: true, balance_after: newBalance, bet_id: (betRecord as { id?: string } | null)?.id ?? null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_settle / aviator_settle_lost ─────────────────────────────────
    if (action === "aviator_settle" || action === "aviator_settle_lost") {
      const { user_id, bet_amount, bust_point, round_uuid } = payload;
      if (user_id && bet_amount) {
        const now = new Date().toISOString();
        const bustPt = Number(bust_point ?? 0);
        if (round_uuid) {
          const { data: pendingBet } = await supabase.from("bets").select("id, status").eq("user_id", user_id).eq("status", "pending").contains("bet_details", { round_uuid }).maybeSingle();
          if (pendingBet && pendingBet.status === "pending") {
            await supabase.from("bets").update({ win_amount: 0, multiplier: bustPt, status: "lost", resolved_at: now, bet_details: { game: "aviator", bustPoint: bustPt, cashOutAt: null, round_uuid } }).eq("id", pendingBet.id).catch(() => {});
            return new Response(JSON.stringify({ success: true, crash_point: bustPt }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
        await supabase.from("bets").insert({ user_id, round_id: null, bet_amount: Number(bet_amount), win_amount: 0, multiplier: 0, status: "lost", bet_details: { game: "aviator", bustPoint: bustPt, cashOutAt: null }, placed_at: now, resolved_at: now }).catch(() => {});
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

    // ── Legacy handlers (aviator, crash, dice) ───────────────────────────────
    if (action === "aviator" || action === "crash" || action === "dice" ||
        payload.bet_amount !== undefined) {

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

      const balanceBefore = userBalance.balance;
      if (bet_amount <= 0) throw new Error("Bet amount must be positive");
      if (bet_amount > balanceBefore) throw new Error("Insufficient balance");

      let multiplier = 1;
      let won = false;

      const rand = getSecureRandom();
      if (game_type === "aviator") {
        const crashPoint = Math.max(1.01, Math.floor(Math.exp(rand * 3) * 100) / 100);
        const autoCashout = 2.5;
        multiplier = Math.min(crashPoint, autoCashout);
        won = multiplier >= autoCashout;
      } else if (game_type === "crash") {
        multiplier = Math.max(1.01, Math.exp(getSecureRandom() * 5));
        won = false;
      } else if (game_type === "dice") {
        const roll = Math.floor(getSecureRandom() * 100) + 1;
        multiplier = roll >= 50 ? 2 : 0;
        won = roll >= 50;
      }

      const payout = won ? bet_amount * multiplier : 0;
      const finalBalance = balanceBefore - bet_amount + payout;
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
