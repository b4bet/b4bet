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

    const { amount, payment_method, utr_number, metadata = {} } = await req.json();
    if (!amount || amount < 100) throw new Error("Minimum deposit is ₹1");
    if (!payment_method) throw new Error("Payment method required");

    // Get current balance
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    const balanceBefore = profile?.balance ?? 0;

    // Create pending transaction
    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "deposit",
        amount,
        balance_before: balanceBefore,
        balance_after: balanceBefore, // will update on approval
        reference: utr_number || null,
        metadata: { payment_method, utr_number, ...metadata },
        status: "pending",
      })
      .select("id")
      .single();

    if (txnErr) throw new Error(txnErr.message);

    return new Response(JSON.stringify({ success: true, transaction_id: txn.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
