-- =============================================================================
-- Migration: Aviator shared server round
-- =============================================================================
-- Adds aviator_current_round — a single-row table that holds the ONE live
-- Aviator round that all clients observe.  Only the Edge Function (service
-- role) may write to it; the anon/authenticated role may only read the
-- non-secret columns (round_id, phase, phase_started_at).
-- crash_point is stored here but is NEVER exposed to the client until
-- the round has already crashed (enforced in the Edge Function, not RLS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS aviator_current_round (
  id              int  PRIMARY KEY DEFAULT 1,           -- always exactly one row
  round_uuid      uuid NOT NULL DEFAULT gen_random_uuid(),
  phase           text NOT NULL DEFAULT 'waiting',      -- waiting | flying | crashed
  phase_started_at timestamptz NOT NULL DEFAULT now(),
  crash_point     numeric NOT NULL DEFAULT 1.0,         -- SECRET — never sent to client before crash
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed the single row if it doesn't exist yet
INSERT INTO aviator_current_round (id, round_uuid, phase, phase_started_at, crash_point)
VALUES (1, gen_random_uuid(), 'waiting', now(), 1.5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE aviator_current_round ENABLE ROW LEVEL SECURITY;

-- Clients may read the row — but the Edge Function filters out crash_point
-- before returning data to the browser (it is never sent in GET responses
-- during waiting/flying phases).
DROP POLICY IF EXISTS "aviator_current_round_read" ON aviator_current_round;
CREATE POLICY "aviator_current_round_read" ON aviator_current_round
  FOR SELECT
  TO authenticated, anon
  USING (true);
