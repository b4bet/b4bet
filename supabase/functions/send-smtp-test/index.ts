import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import nodemailer from 'npm:nodemailer@6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      to: string;
      smtp?: { host: string; port: number; user: string; pass: string; secure: boolean };
    };

    const { to, smtp } = body;

    if (!to || !smtp?.host || !smtp?.user || !smtp?.pass) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing required fields: to, smtp.host, smtp.user, smtp.pass' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port) || 587,
      secure: smtp.secure && Number(smtp.port) === 465,
      requireTLS: smtp.secure && Number(smtp.port) !== 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    await transporter.sendMail({
      from: `"B4BeT" <${smtp.user}>`,
      to,
      subject: 'B4BeT SMTP Test ✓',
      html: '<div style="font-family:sans-serif;padding:20px;background:#0a0f1c;color:#fff;border-radius:12px"><h2 style="color:#00ff88">SMTP Test Successful!</h2><p>Your email settings are configured correctly.</p><p style="color:#a0aec0;font-size:12px">This is an automated test from B4BeT Admin Panel.</p></div>',
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-smtp-test] error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
