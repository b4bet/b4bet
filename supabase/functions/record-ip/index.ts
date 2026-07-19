import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Reads the caller's real IP from the edge request headers (Cloudflare /
// standard proxy headers) — this only works server-side, which is why it
// has to be an Edge Function and can't be done in the browser.
function getRealIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "";
}

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

    const { action = "signup" } = await req.json().catch(() => ({}));
    const ip = getRealIp(req);

    if (ip) {
      const { error: insertErr } = await supabase.from("ip_logs").insert({
        user_id: user.id,
        ip_address: ip,
        device_info: { user_agent: req.headers.get("user-agent") ?? "" },
        action,
      });
      if (insertErr) throw new Error(insertErr.message);
    }

    return new Response(JSON.stringify({ success: true, ip }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
