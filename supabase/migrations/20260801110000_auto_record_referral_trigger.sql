-- =====================================================================
-- Migration: 20260801110000_auto_record_referral_trigger.sql
-- SAFETY NET: Auto-records referral on profile INSERT via DB trigger
-- Prevents silent failure when frontend RPC call fails at signup
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_auto_record_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referral_code text;
  v_referrer_id   uuid;
  v_existing_id   uuid;
BEGIN
  -- Get referralCode from auth.users metadata
  SELECT raw_user_meta_data->>'referralCode'
  INTO v_referral_code
  FROM auth.users
  WHERE id = NEW.id;

  -- No referral code? Nothing to do
  IF v_referral_code IS NULL OR v_referral_code = '' THEN
    RETURN NEW;
  END IF;

  -- Lookup referrer by account_id (6-digit), referral_code (8-char), or username
  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE account_id = v_referral_code
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    SELECT id INTO v_referrer_id
    FROM public.profiles
    WHERE referral_code = upper(v_referral_code)
    LIMIT 1;
  END IF;

  IF v_referrer_id IS NULL THEN
    SELECT id INTO v_referrer_id
    FROM public.profiles
    WHERE lower(username) = lower(v_referral_code)
    LIMIT 1;
  END IF;

  -- Referrer not found? Skip
  IF v_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't refer yourself
  IF v_referrer_id = NEW.id THEN
    RETURN NEW;
  END IF;

  -- Check if referral already recorded (idempotent)
  SELECT id INTO v_existing_id FROM public.referrals WHERE referred_id = NEW.id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Insert the referral record
  INSERT INTO public.referrals (referrer_id, referred_id, bonus_amount, status, created_at)
  VALUES (v_referrer_id, NEW.id, 0, 'pending', now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_record_referral ON public.profiles;
CREATE TRIGGER trg_auto_record_referral
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_auto_record_referral();
