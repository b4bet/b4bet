// Supabase Edge Function — send a real SMTP test email
// Uses nodemailer via npm: specifier (Deno supports npm:)
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, smtpConfig } = await req.json() as {
      to: string;
      smtpConfig: { host: string; port: string; user: string; pass: string; tls: boolean };
    };

    if (!to || !smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing required fields (to, host, user, pass)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: parseInt(smtpConfig.port || '587', 10),
      secure: smtpConfig.tls && smtpConfig.port === '465',
      requireTLS: smtpConfig.tls,
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"B4BeT Admin" <${smtpConfig.user}>`,
      to,
      subject: 'B4BeT SMTP Test ✓',
      html: `
        <div style="font-family:Inter,sans-serif;background:#0a0f1c;color:#fff;padding:32px;border-radius:12px;max-width:480px">
          <h2 style="color:#00ff88;margin:0 0 16px">✅ SMTP Test Successful</h2>
          <p style="margin:0 0 8px;color:#a0aec0">Your B4BeT mail server is configured correctly.</p>
          <p style="margin:0;font-size:12px;color:#4a5568">Sent at: ${new Date().toISOString()}</p>
        </div>
      `,
    });

    return new Response(
      JSON.stringify({ ok: true, message: `Test email sent to ${to}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
