// Supabase Edge Function — send transactional emails via admin-configured SMTP
// Called from frontend with: { type, to, variables }
// Types: 'welcome' | 'depositSuccess' | 'withdrawalStatus'
import nodemailer from 'npm:nodemailer@6';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  tls: boolean;
  active: boolean;
}

interface EmailTemplates {
  welcome: string;
  depositSuccess: string;
  withdrawalStatus: string;
}

type EmailType = 'welcome' | 'depositSuccess' | 'withdrawalStatus';

const SUBJECT_MAP: Record<EmailType, string> = {
  welcome: 'Welcome to B4BeT!',
  depositSuccess: 'Deposit Successful – B4BeT',
  withdrawalStatus: 'Withdrawal Update – B4BeT',
};

// Replace {{variable}} placeholders in template
function render(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json() as {
      type: EmailType;
      to: string;
      variables: Record<string, string>;
    };

    const { type, to, variables } = body;

    if (!type || !to) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing required fields: type, to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Load SMTP config and email templates from settings table
    const { data: settingsData } = await supabase.rpc('admin_get_settings');
    const rows = (settingsData ?? []) as Array<{ key: string; value: unknown }>;
    const find = (k: string) => rows.find(r => r.key === k)?.value;

    const smtp: SmtpConfig = {
      host: (find('smtp_host') as string) || '',
      port: (find('smtp_port') as string) || '587',
      user: (find('smtp_user') as string) || '',
      pass: (find('smtp_pass') as string) || '',
      tls: find('smtp_tls') !== false,
      active: find('smtp_active') === true,
    };

    if (!smtp.active || !smtp.host || !smtp.user || !smtp.pass) {
      return new Response(
        JSON.stringify({ ok: false, error: 'SMTP is not configured or not active. Please configure SMTP in Admin > SMTP tab.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const rawTemplates = find('email_templates') as Partial<EmailTemplates> | null;
    const defaultTemplates: EmailTemplates = {
      welcome: '<div style="font-family:Inter,sans-serif;background:#0a0f1c;color:#fff;padding:24px;border-radius:12px"><h1 style="color:#00ff88">Welcome to B4BeT, {{username}}!</h1><p>Your account is ready. Start playing and claim your welcome bonus!</p></div>',
      depositSuccess: '<div style="font-family:Inter,sans-serif;padding:24px"><h2>Deposit Successful</h2><p>Hi {{username}}, your deposit of <strong>{{amount}}</strong> has been credited. New balance: <strong>{{balance}}</strong>.</p><p>Transaction ID: {{txn_id}}</p></div>',
      withdrawalStatus: '<div style="font-family:Inter,sans-serif;padding:24px"><h2>Withdrawal {{status}}</h2><p>Hi {{username}}, your withdrawal of <strong>{{amount}}</strong> is now <strong>{{status}}</strong>.</p><p>Transaction ID: {{txn_id}}</p></div>',
    };
    const templates: EmailTemplates = { ...defaultTemplates, ...(rawTemplates ?? {}) };

    const templateHtml = templates[type];
    if (!templateHtml) {
      return new Response(
        JSON.stringify({ ok: false, error: `Unknown email type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const html = render(templateHtml, variables ?? {});
    const subject = SUBJECT_MAP[type];

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: parseInt(smtp.port || '587', 10),
      secure: smtp.tls && smtp.port === '465',
      requireTLS: smtp.tls,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await transporter.sendMail({
      from: `"B4BeT" <${smtp.user}>`,
      to,
      subject,
      html,
    });

    return new Response(
      JSON.stringify({ ok: true, message: `${type} email sent to ${to}` }),
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
