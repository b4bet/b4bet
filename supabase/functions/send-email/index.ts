import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
  secure: boolean;
  enabled: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      type: string;
      to?: string;
      userId?: string;
      variables?: Record<string, string>;
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load SMTP config and email templates from settings table
    const { data: settingsData } = await supabase.rpc('admin_get_settings');
    const rows = (settingsData ?? []) as Array<{ key: string; value: unknown }>;
    const find = (k: string) => rows.find(r => r.key === k)?.value;

    // Read smtp_settings as JSON blob (matches what SmtpTab saves)
    const smtpBlob = find('smtp_settings') as Partial<SmtpConfig> | undefined;
    const smtp: SmtpConfig = {
      host: (smtpBlob?.host as string) || '',
      port: Number(smtpBlob?.port) || 587,
      user: (smtpBlob?.user as string) || '',
      pass: (smtpBlob?.pass as string) || '',
      from: (smtpBlob?.from as string) || (smtpBlob?.user as string) || '',
      fromName: (smtpBlob?.fromName as string) || 'B4BeT',
      secure: typeof smtpBlob?.secure === 'boolean' ? smtpBlob.secure : true,
      enabled: typeof smtpBlob?.enabled === 'boolean' ? smtpBlob.enabled : false,
    };

    if (!smtp.enabled || !smtp.host || !smtp.user || !smtp.pass) {
      return new Response(JSON.stringify({ ok: false, error: 'SMTP not configured or not enabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Resolve recipient email
    let recipientEmail = body.to;
    let recipientName = '';

    if (!recipientEmail && body.userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, username, display_name')
        .eq('id', body.userId)
        .single();
      if (profile) {
        recipientEmail = (profile as Record<string, unknown>).email as string;
        recipientName = ((profile as Record<string, unknown>).display_name as string) || ((profile as Record<string, unknown>).username as string) || '';
      }
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ ok: false, error: 'No recipient email found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Load email templates
    const emailTemplates = find('email_templates') as Record<string, string> | undefined;

    // Select template by type
    const vars: Record<string, string> = { username: recipientName, ...body.variables };
    let subject = 'Notification from B4BeT';
    let html = `<p>Hi ${recipientName || recipientEmail}, you have a new notification.</p>`;

    if (body.type === 'welcome') {
      subject = `Welcome to B4BeT, ${vars.username || recipientEmail}!`;
      html = emailTemplates?.welcome || html;
    } else if (body.type === 'depositSuccess' || body.type === 'deposit') {
      subject = `Deposit ${vars.status || 'Update'} - B4BeT`;
      html = emailTemplates?.depositSuccess || html;
    } else if (body.type === 'withdrawalStatus' || body.type === 'withdrawal') {
      subject = `Withdrawal ${vars.status || 'Update'} - B4BeT`;
      html = emailTemplates?.withdrawalStatus || html;
    }

    // Replace template variables {{key}} with values
    for (const [k, v] of Object.entries(vars)) {
      html = html.replaceAll(`{{${k}}}`, v);
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure && smtp.port === 465,
      requireTLS: smtp.secure && smtp.port !== 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.from || smtp.user}>`,
      to: recipientEmail,
      subject,
      html,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-email] error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
