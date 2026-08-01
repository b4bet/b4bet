-- =====================================================================
-- Migration: 20260801100000_fix_get_my_referrals_no_args.sql
-- Fix: Drop old p_user_id parametered version, keep no-arg (auth.uid)
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_my_referrals(uuid, int);

CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS TABLE (
  id                  uuid,
  referrer_id         uuid,
  referred_id         uuid,
  bonus_amount        numeric,
  status              text,
  created_at          timestamptz,
  referred_username   text,
  referred_account_id text,
  deposit_amount      numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    r.id,
    r.referrer_id,
    r.referred_id,
    r.bonus_amount,
    r.status,
    r.created_at,
    COALESCE(p.username, '')       AS referred_username,
    COALESCE(p.account_id, '')     AS referred_account_id,
    COALESCE(
      (SELECT t.amount FROM transactions t
       WHERE t.user_id = r.referred_id
         AND t.type = 'deposit'
         AND t.status = 'approved'
       ORDER BY t.created_at DESC
       LIMIT 1),
      0
    ) AS deposit_amount
  FROM referrals r
  LEFT JOIN profiles p ON p.id = r.referred_id
  WHERE r.referrer_id = auth.uid()
  ORDER BY r.created_at DESC;
$$;
