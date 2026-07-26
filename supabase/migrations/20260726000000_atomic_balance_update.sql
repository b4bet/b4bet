-- Atomic balance increment for aviator cashouts.
-- Using an atomic UPDATE avoids the read-then-write race condition
-- when two betting panels cash out simultaneously.
CREATE OR REPLACE FUNCTION profiles_add_balance(
  p_user_id uuid,
  p_amount   numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE profiles
     SET balance = balance + p_amount
   WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION profiles_add_balance(uuid, numeric) TO service_role;
