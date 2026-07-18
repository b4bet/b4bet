-- =====================================================================
-- Migration: 20260718150000_admin_panel_live_supabase.sql
-- Connects 8 broken admin tabs to live Supabase tables/RPCs
-- =====================================================================

-- ── 1. admin_send_notification ──────────────────────────────────────
-- Inserts a notification row (broadcast = null user_id, or targeted).
CREATE OR REPLACE FUNCTION admin_send_notification(
  p_user_id   uuid,
  p_title     text,
  p_message   text,
  p_type      text    DEFAULT 'info',
  p_metadata  jsonb   DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    -- Broadcast: one row per profile so each user sees it
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    SELECT p.id, p_title, p_message, p_type, p_metadata
    FROM public.profiles p;
    RETURN gen_random_uuid();
  ELSE
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (p_user_id, p_title, p_message, p_type, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
END;
$$;

-- ── 2. admin_get_notifications ──────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_notifications(p_limit int DEFAULT 200)
RETURNS TABLE(
  id uuid, user_id uuid, title text, message text,
  type text, is_read boolean, metadata jsonb, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.user_id, n.title, n.message,
         n.type, n.is_read, n.metadata, n.created_at
  FROM public.notifications n
  ORDER BY n.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ── 3. crm_campaigns table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  segment      text NOT NULL DEFAULT 'All Users',
  subject      text NOT NULL,
  message      text NOT NULL,
  schedule     text NOT NULL DEFAULT 'now',
  status       text NOT NULL DEFAULT 'sent'
               CHECK (status IN ('sent','scheduled','draft','cancelled')),
  reach_count  integer NOT NULL DEFAULT 0,
  sent_at      timestamptz,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
-- Only service_role (Edge Functions / admin RPCs) can read/write
DROP POLICY IF EXISTS "service_role full access crm_campaigns" ON public.crm_campaigns;
CREATE POLICY "service_role full access crm_campaigns"
  ON public.crm_campaigns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 4. admin_save_crm_campaign ──────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_save_crm_campaign(
  p_name        text,
  p_segment     text,
  p_subject     text,
  p_message     text,
  p_schedule    text,
  p_reach_count int DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id     uuid;
  v_status text := CASE WHEN p_schedule = 'now' THEN 'sent' ELSE 'scheduled' END;
BEGIN
  INSERT INTO public.crm_campaigns
    (name, segment, subject, message, schedule, status, reach_count, sent_at)
  VALUES (
    p_name, p_segment, p_subject, p_message, p_schedule, v_status,
    p_reach_count,
    CASE WHEN p_schedule = 'now' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 5. admin_get_crm_campaigns ──────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_crm_campaigns(p_limit int DEFAULT 50)
RETURNS TABLE(
  id uuid, name text, segment text, subject text, message text,
  schedule text, status text, reach_count int, sent_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.segment, c.subject, c.message,
         c.schedule, c.status, c.reach_count, c.sent_at, c.created_at
  FROM public.crm_campaigns c
  ORDER BY c.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ── 6. Seed settings rows for new config keys ────────────────────────
INSERT INTO public.settings (key, value, description) VALUES
  ('currencies',
   '[{"code":"INR","symbol":"₹","name":"Indian Rupee","rate":1,"active":true,"primary":true},{"code":"USD","symbol":"$","name":"US Dollar","rate":0.012,"active":true,"primary":false},{"code":"EUR","symbol":"€","name":"Euro","rate":0.011,"active":true,"primary":false}]',
   'Supported currencies list'),
  ('dynamic_pages',
   '[]',
   'Admin-managed dynamic content pages'),
  ('email_templates',
   '{"welcome":"","depositSuccess":"","withdrawalStatus":""}',
   'Email HTML templates'),
  ('notification_templates',
   '[]',
   'Custom notification templates (built-ins handled client-side)'),
  ('referral_config',
   '{"rewardAmount":100,"minDeposit":500,"tierPercent":10,"tierThreshold":3}',
   'Referral program configuration')
ON CONFLICT (key) DO NOTHING;
