-- =============================================================================
-- Migration: Crash shared server round
-- =============================================================================
-- Adds crash_current_round — a single-row table that holds the ONE live
-- Crash round that all clients observe. Only the Edge Function (service role)
-- may write to it. crash_point is SECRET — never sent to client until crashed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS crash_current_round (
  id               int         PRIMARY KEY DEFAULT 1,
  round_uuid       uuid        NOT NULL DEFAULT gen_random_uuid(),
  phase            text        NOT NULL DEFAULT 'waiting',  -- waiting | flying | crashed
  phase_started_at timestamptz NOT NULL DEFAULT now(),
  crash_point      numeric     NOT NULL DEFAULT 2.0,        -- SECRET
  last_crash_point numeric     NULL,
  elapsed_ms       int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed the single row
INSERT INTO crash_current_round (id, round_uuid, phase, phase_started_at, crash_point)
VALUES (1, gen_random_uuid(), 'waiting', now(), 2.0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE crash_current_round ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crash_current_round_read" ON crash_current_round;
CREATE POLICY "crash_current_round_read" ON crash_current_round
  FOR SELECT TO authenticated, anon USING (true);
