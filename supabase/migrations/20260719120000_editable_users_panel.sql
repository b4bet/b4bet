-- Migration: editable users panel + remove is_admin from admin UI paths
-- 1. Replace admin_get_profiles to also return is_active, account_id
-- 2. Add admin_update_user_full RPC — edits all profile fields EXCEPT is_admin

-- 1. Replace admin_get_profiles
CREATE OR REPLACE FUNCTION public.admin_get_profiles()
RETURNS TABLE (
  id              uuid,
  username        text,
  display_name    text,
  avatar_url      text,
  phone           text,
  balance         bigint,
  total_deposit   bigint,
  total_withdrawal bigint,
  vip_level       integer,
  is_admin        boolean,
  is_active       boolean,
  is_banned       boolean,
  account_id      text,
  referral_code   text,
  email           text,
  created_at      timestamptz,
  updated_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.username, p.display_name, p.avatar_url, p.phone,
    p.balance, p.total_deposit, p.total_withdrawal,
    p.vip_level, p.is_admin, p.is_active, p.is_banned,
    p.account_id, p.referral_code,
    COALESCE(p.email, u.email) AS email,
    p.created_at, p.updated_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

-- 2. admin_update_user_full — intentionally omits is_admin
-- Drop all existing overloads of admin_update_user_full before recreating
DROP FUNCTION IF EXISTS public.admin_update_user_full(uuid, text, text, text, text, bigint, integer, boolean, boolean, text);

CREATE OR REPLACE FUNCTION public.admin_update_user_full(
  p_user_id     uuid,
  p_username    text    DEFAULT NULL,
  p_display_name text   DEFAULT NULL,
  p_phone       text    DEFAULT NULL,
  p_email       text    DEFAULT NULL,
  p_balance     bigint  DEFAULT NULL,
  p_vip_level   integer DEFAULT NULL,
  p_is_active   boolean DEFAULT NULL,
  p_is_banned   boolean DEFAULT NULL,
  p_account_id  text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles SET
    username     = COALESCE(p_username,     username),
    display_name = COALESCE(p_display_name, display_name),
    phone        = COALESCE(p_phone,        phone),
    email        = COALESCE(p_email,        email),
    balance      = COALESCE(p_balance,      balance),
    vip_level    = COALESCE(p_vip_level,    vip_level),
    is_active    = COALESCE(p_is_active,    is_active),
    is_banned    = COALESCE(p_is_banned,    is_banned),
    account_id   = COALESCE(p_account_id,   account_id),
    updated_at   = now()
  WHERE id = p_user_id;
END;
$$;
