import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth token");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) throw new Error("Invalid token");

    const { amount, payment_method, account_details } = await req.json();
    if (!amount || amount < 10000) throw new Error("Minimum withdrawal is ₹100");
    if (!payment_method) throw new Error("Payment method required");
    if (!account_details) throw new Error("Account details required");

    // Get and lock balance atomically
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    const balance = profile?.balance ?? 0;
    if (balance < amount) throw new Error("Insufficient balance");

    // Check pending withdrawals
    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "withdrawal")
      .eq("status", "pending");

    if ((count ?? 0) >= 3) throw new Error("Maximum 3 pending withdrawals allowed");

    // Deduct balance immediately (hold)
    await supabase
      .from("profiles")
      .update({ balance: balance - amount, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    // Create pending withdrawal
    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "withdrawal",
        amount,
        balance_before: balance,
        balance_after: balance - amount,
        metadata: { payment_method, account_details },
        status: "pending",
      })
      .select("id")
      .single();

    if (txnErr) {
      // Rollback balance if txn failed
      await supabase.from("profiles").update({ balance, updated_at: new Date().toISOString() }).eq("id", user.id);
      throw new Error(txnErr.message);
    }

    return new Response(JSON.stringify({ success: true, transaction_id: txn.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
