import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
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
    const payload = await req.json();
    const action = payload.action ?? payload.game_type ?? "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── sunvsmoon_result: get or generate round result ──────────────────────
    if (action === "sunvsmoon_result") {
      const { round_id } = payload;

      const { data: existing } = await supabase
        .from("sunvsmoon_rounds")
        .select("result")
        .eq("round_id", round_id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ success: true, result: existing.result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rand = getSecureRandom();
      const result = rand < 0.45 ? "sun" : rand < 0.90 ? "moon" : "tie";
      await supabase.from("sunvsmoon_rounds").insert({ round_id, result });

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── sunvsmoon_settle: settle a bet for a completed round ─────────────────
    if (action === "sunvsmoon_settle") {
      const { user_id, round_id, bet, stake } = payload;
      const stakeNum = Number(stake);

      if (!user_id || !round_id || !bet || !stakeNum) {
        throw new Error("Missing required fields: user_id, round_id, bet, stake");
      }

      // Get or generate round result
      let roundResult: string;
      const { data: existing } = await supabase
        .from("sunvsmoon_rounds")
        .select("result")
        .eq("round_id", round_id)
        .maybeSingle();

      if (existing) {
        roundResult = existing.result;
      } else {
        const manualResult = payload.manualResult ?? null;
        if (manualResult && ["sun", "moon", "tie"].includes(manualResult)) {
          roundResult = manualResult;
        } else {
          const rand = getSecureRandom();
          roundResult = rand < 0.45 ? "sun" : rand < 0.90 ? "moon" : "tie";
        }
        await supabase.from("sunvsmoon_rounds").insert({ round_id, result: roundResult });
      }

      const won = bet === roundResult;
      // Payout: sun/moon = 2x total (1x net profit), tie = 9x total (8x net profit)
      const totalMultipliers: Record<string, number> = { sun: 2, moon: 2, tie: 9 };
      const totalMultiplier = totalMultipliers[bet] ?? 2;
      const winAmount = won ? Math.round(stakeNum * totalMultiplier) : 0;
      const profit = won ? winAmount - stakeNum : 0;

      // Fetch current balance
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();

      if (profileError || !profile) {
        throw new Error("User profile not found");
      }

      const balanceBefore = profile.balance;
      const newBalance = won
        ? balanceBefore - stakeNum + winAmount
        : balanceBefore - stakeNum;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user_id);

      if (updateError) {
        throw new Error(`Balance update failed: ${updateError.message}`);
      }

      // Record in bets table using correct column names
      const now = new Date().toISOString();
      await supabase.from("bets").insert({
        user_id,
        round_id: round_id ?? null,
        bet_amount: stakeNum,
        win_amount: winAmount,
        multiplier: won ? totalMultiplier : 0,
        status: won ? "won" : "lost",
        bet_details: {
          game: "sunvsmoon",
          result: roundResult,
          bet_choice: bet,
          profit,
        },
        placed_at: now,
        resolved_at: now,
      }).catch(() => {}); // Non-fatal

      return new Response(
        JSON.stringify({
          success: true,
          won,
          result: roundResult,
          profit,
          balance_after: newBalance,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_cashout: player cashes out before crash ──────────────────────
    if (action === "aviator_cashout") {
      const { user_id, round_id, bet_amount, cashout_at, placed_at_ms } = payload;
      const betNum = Number(bet_amount);
      const cashoutMultiplier = Number(cashout_at ?? payload.multiplier ?? 0);

      if (!user_id || !betNum) {
        throw new Error("Missing required fields: user_id, bet_amount");
      }

      if (!cashoutMultiplier || cashoutMultiplier < 1.01) {
        throw new Error("Invalid cashout multiplier");
      }

      // Look up bust_point for this round to validate cashout was before crash
      let bustPoint: number | null = null;
      if (round_id) {
        const isNumeric = !isNaN(Number(round_id));
        const query = supabase
          .from("aviator_rounds")
          .select("bust_point")
          .order("id", { ascending: false })
          .limit(1);

        const { data: roundData } = isNumeric
          ? await query.eq("id", Number(round_id))
          : await query.eq("round_uuid", round_id);

        if (roundData && roundData.length > 0) {
          bustPoint = Number(roundData[0].bust_point);
        }
      }

      // Verify cashout was before crash
      if (bustPoint !== null && cashoutMultiplier > bustPoint) {
        return new Response(
          JSON.stringify({
            success: false,
            won: false,
            win: 0,
            balance_after: null,
            crash_point: bustPoint,
            error: `Cashout at ${cashoutMultiplier}x is after crash at ${bustPoint}x`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      // Fetch current balance
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();

      if (profileError || !profile) {
        throw new Error("User profile not found");
      }

      // Win amount = bet * cashoutMultiplier (total payout)
      const winAmount = Math.round(betNum * cashoutMultiplier);
      // Balance: add back the win (bet was already deducted client-side)
      const newBalance = profile.balance + winAmount;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user_id);

      if (updateError) {
        throw new Error(`Balance update failed: ${updateError.message}`);
      }

      // Record in bets table
      const now = new Date().toISOString();
      await supabase.from("bets").insert({
        user_id,
        round_id: null,
        bet_amount: betNum,
        win_amount: winAmount,
        multiplier: cashoutMultiplier,
        status: "won",
        bet_details: {
          game: "aviator",
          cashOutAt: cashoutMultiplier,
          bustPoint: bustPoint ?? 0,
          placed_at_ms: placed_at_ms ?? null,
        },
        placed_at: placed_at_ms ? new Date(Number(placed_at_ms)).toISOString() : now,
        resolved_at: now,
      }).catch(() => {}); // Non-fatal

      return new Response(
        JSON.stringify({
          success: true,
          won: true,
          win: winAmount,
          balance_after: newBalance,
          cashout_at: cashoutMultiplier,
          crash_point: bustPoint,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_place_bet: deduct balance when player places bet ─────────────
    if (action === "aviator_place_bet") {
      const { user_id, bet_amount, round_id } = payload;
      const betNum = Number(bet_amount);

      if (!user_id || !betNum) {
        throw new Error("Missing required fields: user_id, bet_amount");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user_id)
        .single();

      if (profileError || !profile) throw new Error("User profile not found");
      if (profile.balance < betNum) throw new Error("Insufficient balance");

      const newBalance = profile.balance - betNum;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("id", user_id);

      if (updateError) throw new Error(`Balance deduction failed: ${updateError.message}`);

      const { data: betRecord } = await supabase.from("bets").insert({
        user_id,
        round_id: null,
        bet_amount: betNum,
        win_amount: 0,
        multiplier: 0,
        status: "pending",
        bet_details: { game: "aviator", round_id: round_id ?? null },
        placed_at: new Date().toISOString(),
      }).select("id").maybeSingle().catch(() => ({ data: null }));

      return new Response(
        JSON.stringify({
          success: true,
          balance_after: newBalance,
          bet_id: (betRecord as { id?: string } | null)?.id ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_settle: round ended, record lost bet ─────────────────────────
    if (action === "aviator_settle") {
      const { user_id, bet_amount, bust_point } = payload;
      if (user_id && bet_amount) {
        const now = new Date().toISOString();
        await supabase.from("bets").insert({
          user_id,
          round_id: null,
          bet_amount: Number(bet_amount),
          win_amount: 0,
          multiplier: 0,
          status: "lost",
          bet_details: {
            game: "aviator",
            bustPoint: bust_point ?? 0,
            cashOutAt: null,
          },
          placed_at: now,
          resolved_at: now,
        }).catch(() => {});
      }
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── aviator_round_start: acknowledge new round ───────────────────────────
    if (action === "aviator_round_start") {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
