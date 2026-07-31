-- Fix 1: Atomic balance deduction — prevents race condition when 2 bets placed simultaneously
-- Old pattern: SELECT balance, then UPDATE balance = balance - bet_amount (race: both reads get same value)
-- New pattern: UPDATE balance = balance - p_amount WHERE balance >= p_amount (atomic, safe)
CREATE OR REPLACE FUNCTION profiles_deduct_balance(p_user_id uuid, p_amount numeric)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE profiles
     SET balance = balance - p_amount
   WHERE id = p_user_id
     AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance or user not found for user %', p_user_id;
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Fix 2: get_aviator_my_bets — include won bets that were inserted without game_id
-- (cashout path without bet_id inserts with bet_details->>'game' = 'aviator' but no game_id)
CREATE OR REPLACE FUNCTION get_aviator_my_bets(p_user_id uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  bet_amount bigint,
  win_amount bigint,
  multiplier numeric,
  status text,
  placed_at timestamptz,
  cash_out_at numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    b.id,
    b.bet_amount,
    COALESCE(b.win_amount, 0) AS win_amount,
    COALESCE(b.multiplier, 1.0) AS multiplier,
    b.status,
    b.placed_at,
    CAST(b.bet_details->>'cashOutAt' AS numeric) AS cash_out_at
  FROM bets b
  WHERE b.user_id = p_user_id
    AND b.status IN ('won', 'lost')
    AND (
      b.game_id = 'dfec9812-9596-43db-8b70-791200770f2b'
      OR (b.bet_details->>'game' = 'aviator')
    )
  ORDER BY b.placed_at DESC
  LIMIT p_limit;
$$;

-- Fix 3: All-time top 10 highest aviator wins (used by Top tab in sidebar)
CREATE OR REPLACE FUNCTION get_aviator_top_wins(p_limit int DEFAULT 10)
RETURNS TABLE (
  username text,
  bet_amount bigint,
  win_amount bigint,
  multiplier numeric,
  placed_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(pr.username, 'Player') AS username,
    b.bet_amount,
    COALESCE(b.win_amount, 0) AS win_amount,
    COALESCE(b.multiplier, 1.0) AS multiplier,
    b.placed_at
  FROM bets b
  LEFT JOIN profiles pr ON pr.id = b.user_id
  WHERE b.status = 'won'
    AND (
      b.game_id = 'dfec9812-9596-43db-8b70-791200770f2b'
      OR (b.bet_details->>'game' = 'aviator')
    )
  ORDER BY b.win_amount DESC
  LIMIT p_limit;
$$;
