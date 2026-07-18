-- =============================================================================
-- Migration: Server-side game outcome tables
-- =============================================================================
-- Creates the aviator_rounds table required for server-side crash point
-- storage. The crash_point column is only accessible via the service role key
-- (used by the Edge Function) — never exposed to the anon/authenticated key.
-- =============================================================================

-- ── aviator_rounds ────────────────────────────────────────────────────────────
-- Stores the server-generated crash point for each Aviator round.
-- The crash_point is set at round start and NEVER returned to clients until
-- after the round has ended.

CREATE TABLE IF NOT EXISTS aviator_rounds (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id     integer     NOT NULL UNIQUE,
  crash_point  numeric     NOT NULL,  -- hidden from client during flying phase
  phase        text        NOT NULL DEFAULT 'waiting',
  started_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index for fast round lookups
CREATE INDEX IF NOT EXISTS aviator_rounds_round_id_idx ON aviator_rounds (round_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- RLS: authenticated users can see only non-sensitive columns (NOT crash_point).
-- The service role (Edge Function) bypasses RLS.

ALTER TABLE aviator_rounds ENABLE ROW LEVEL SECURITY;

-- Policy: anon/authenticated roles can only read round_id, phase, started_at.
-- crash_point is intentionally excluded from SELECT — clients must call the
-- Edge Function which uses the service role.
DROP POLICY IF EXISTS "aviator_rounds_read_safe_cols" ON aviator_rounds;
CREATE POLICY "aviator_rounds_read_safe_cols" ON aviator_rounds
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- No INSERT/UPDATE/DELETE for clients — only service role (Edge Function).

-- ── mines_sessions ────────────────────────────────────────────────────────────
-- Already created by the application but may be missing in fresh deployments.

CREATE TABLE IF NOT EXISTS mines_sessions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL,
  mine_positions  integer[]   NOT NULL,  -- hidden from client until bust/cashout
  mine_count      integer     NOT NULL,
  stake           numeric     NOT NULL,
  gems_found      integer     NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'active', -- active | busted | cashed_out
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mines_sessions_user_status_idx ON mines_sessions (user_id, status);

ALTER TABLE mines_sessions ENABLE ROW LEVEL SECURITY;

-- Users can read only their own sessions. mine_positions are in the row but
-- the Edge Function handles reveal logic — clients should NOT query this table
-- directly for mine_positions during an active session.
DROP POLICY IF EXISTS "mines_sessions_own" ON mines_sessions;
CREATE POLICY "mines_sessions_own" ON mines_sessions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── crash_rounds ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crash_rounds (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id    integer NOT NULL UNIQUE,
  bust_point  numeric NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crash_rounds_round_id_idx ON crash_rounds (round_id);

ALTER TABLE crash_rounds ENABLE ROW LEVEL SECURITY;

-- Public read (bust_point is revealed after round ends — the engine only
-- queries this to verify a client-submitted cashout claim)
DROP POLICY IF EXISTS "crash_rounds_read" ON crash_rounds;
CREATE POLICY "crash_rounds_read" ON crash_rounds
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- ── sunvsmoon_rounds ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sunvsmoon_rounds (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id   integer NOT NULL UNIQUE,
  result     text    NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sunvsmoon_rounds_round_id_idx ON sunvsmoon_rounds (round_id);

ALTER TABLE sunvsmoon_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sunvsmoon_rounds_read" ON sunvsmoon_rounds;
CREATE POLICY "sunvsmoon_rounds_read" ON sunvsmoon_rounds
  FOR SELECT TO authenticated, anon USING (true);
