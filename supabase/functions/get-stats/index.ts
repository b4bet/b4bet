import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.substring(7);
    const userId = extractUserIdFromToken(token);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // Fetch user stats from transactions table
    // ========================================================================
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select(
        "bet_amount, payout_amount, multiplier, game_type, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000); // Last 1000 transactions

    if (error) {
      throw new Error("Failed to fetch stats");
    }

    if (!transactions || transactions.length === 0) {
      return new Response(
        JSON.stringify({
          total_bets: 0,
          total_wins: 0,
          total_wagered: 0,
          total_winnings: 0,
          avg_multiplier: 0,
          game_breakdown: {},
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // ========================================================================
    // Aggregate stats
    // ========================================================================
    let totalBets = 0;
    let totalWins = 0;
    let totalWagered = 0;
    let totalWinnings = 0;
    let totalMultiplier = 0;
    const gameBreakdown: {
      [key: string]: {
        bets: number;
        wins: number;
        wagered: number;
        winnings: number;
      };
    } = {};

    for (const tx of transactions) {
      totalBets++;
      totalWagered += tx.bet_amount;
      totalWinnings += tx.payout_amount;
      totalMultiplier += tx.multiplier;

      if (tx.payout_amount > 0) {
        totalWins++;
      }

      if (!gameBreakdown[tx.game_type]) {
        gameBreakdown[tx.game_type] = {
          bets: 0,
          wins: 0,
          wagered: 0,
          winnings: 0,
        };
      }

      gameBreakdown[tx.game_type].bets++;
      gameBreakdown[tx.game_type].wagered += tx.bet_amount;
      gameBreakdown[tx.game_type].winnings += tx.payout_amount;

      if (tx.payout_amount > 0) {
        gameBreakdown[tx.game_type].wins++;
      }
    }

    const avgMultiplier =
      totalBets > 0 ? totalMultiplier / totalBets : 0;

    return new Response(
      JSON.stringify({
        total_bets: totalBets,
        total_wins: totalWins,
        total_wagered: parseFloat(totalWagered.toFixed(2)),
        total_winnings: parseFloat(totalWinnings.toFixed(2)),
        avg_multiplier: parseFloat(avgMultiplier.toFixed(4)),
        game_breakdown: gameBreakdown,
        last_updated: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

function extractUserIdFromToken(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid token format");
    }

    const decoded = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return decoded.sub || decoded.user_id || "";
  } catch {
    throw new Error("Failed to extract user ID from token");
  }
}
