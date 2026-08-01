-- =====================================================================
-- Migration: 20260801000000_referral_rpc_with_usernames.sql
-- Fixes referral history: JOIN profiles for usernames + account_id
-- =====================================================================

-- ── get_my_referrals (user view) ─────────────────────────────────────
-- Returns all referrals made by a specific user, enriched with
-- referred user's username and 6-digit account_id from profiles.
CREATE OR REPLACE FUNCTION public.get_my_referrals(
  p_user_id uuid,
  p_limit   int DEFAULT 100
)
RETURNS TABLE (
  id                  uuid,
  referrer_id         uuid,
  referred_id         uuid,
  bonus_amount        numeric,
  status              text,
  created_at          timestamptz,
  referred_username   text,
  referred_account_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.referrer_id,
    r.referred_id,
    r.bonus_amount,
    r.status,
    r.created_at,
    COALESCE(p.username, '')            AS referred_username,
    COALESCE(p.account_id, '')          AS referred_account_id
  FROM public.referrals r
  LEFT JOIN public.profiles p ON p.id = r.referred_id
  WHERE r.referrer_id = p_user_id
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ── admin_get_referrals (admin view) ─────────────────────────────────
-- Returns ALL referrals with referrer + referred usernames and
-- 6-digit account_ids. SECURITY DEFINER bypasses RLS.
DROP FUNCTION IF EXISTS public.admin_get_referrals(int);

CREATE OR REPLACE FUNCTION public.admin_get_referrals(
  p_limit int DEFAULT 500
)
RETURNS TABLE (
  id                   uuid,
  referrer_id          uuid,
  referred_id          uuid,
  bonus_amount         numeric,
  status               text,
  created_at           timestamptz,
  referrer_username    text,
  referred_username    text,
  referrer_account_id  text,
  referred_account_id  text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.referrer_id,
    r.referred_id,
    r.bonus_amount,
    r.status,
    r.created_at,
    COALESCE(rp.username,   '')  AS referrer_username,
    COALESCE(dp.username,   '')  AS referred_username,
    COALESCE(rp.account_id, '')  AS referrer_account_id,
    COALESCE(dp.account_id, '')  AS referred_account_id
  FROM public.referrals r
  LEFT JOIN public.profiles rp ON rp.id = r.referrer_id
  LEFT JOIN public.profiles dp ON dp.id = r.referred_id
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$$;
