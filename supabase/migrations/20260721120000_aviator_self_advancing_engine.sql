-- Migration: 20260721120000_aviator_self_advancing_engine
-- ROOT CAUSE FIX: old aviator_get_current_round() was READ-ONLY — it never
-- advanced phases.  The round got stuck in 'flying' at 200x+ indefinitely.
-- Fix: rewrite to match crash_get_current_round() — self-advancing on every poll.
--
-- Changes:
--   1. Create aviator_rounds history table (mirrors crash_rounds)
--   2. Replace aviator_get_current_round() with crash-identical self-advancing logic
--      waiting(6s) → flying(until exp curve hits crash_point) → crashed(3s) → waiting
--   3. Reads gameHandlers.aviator admin config for AUTO/MANUAL mode + houseEdge
--   4. Auto-reverts MANUAL → AUTO after manual round fires

-- 1. History table
CREATE TABLE IF NOT EXISTS public.aviator_rounds (
  id               bigserial PRIMARY KEY,
  round_uuid       uuid,
  bust_point       numeric NOT NULL,
  phase_started_at timestamptz,
  created_at       timestamptz DEFAULT now()
);

-- 2. Drop old read-only function
DROP FUNCTION IF EXISTS public.aviator_get_current_round();

-- 3. Self-advancing function
CREATE OR REPLACE FUNCTION public.aviator_get_current_round()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row        aviator_current_round%ROWTYPE;
  v_now        timestamptz := now();
  v_elapsed_ms bigint;
  v_phase      text;
  v_crash_pt   numeric;
  v_cfg        jsonb;
  v_mode       text;
  v_manual_pt  numeric;
  v_house_edge numeric;
  v_new_uuid   uuid;
  v_rand       float8;
  WAIT_MS      constant bigint := 6000;
  CRASH_MS     constant bigint := 3000;
BEGIN
  SELECT * INTO v_row FROM public.aviator_current_round WHERE id = 1;

  IF NOT FOUND THEN
    v_new_uuid := gen_random_uuid();
    INSERT INTO public.aviator_current_round(id, round_uuid, phase, phase_started_at, crash_point, last_crash_point, elapsed_ms)
    VALUES (1, v_new_uuid, 'waiting', v_now, NULL, 1.00, 0)
    RETURNING * INTO v_row;
  END IF;

  v_elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_row.phase_started_at)) * 1000)::bigint;

  SELECT value INTO v_cfg FROM public.settings WHERE key = 'admin_config' LIMIT 1;
  v_mode       := COALESCE(v_cfg->'gameHandlers'->'aviator'->>'mode', 'AUTO');
  v_manual_pt  := COALESCE((v_cfg->'gameHandlers'->'aviator'->>'manualResult')::numeric, 2.00);
  v_house_edge := COALESCE((v_cfg->'gameHandlers'->'aviator'->>'houseEdge')::numeric, 4);

  v_phase    := v_row.phase;
  v_crash_pt := v_row.crash_point;

  -- WAITING → FLYING
  IF v_phase = 'waiting' AND v_elapsed_ms >= WAIT_MS THEN
    IF v_mode = 'MANUAL' THEN
      v_crash_pt := GREATEST(1.01, v_manual_pt);
    ELSE
      v_rand := random();
      IF v_rand < 0.01 THEN v_rand := 0.01; END IF;
      v_crash_pt := ROUND(GREATEST(1.01, LEAST(1000.0,
        (1.0 - v_house_edge / 100.0) / v_rand
      ))::numeric, 2);
    END IF;

    v_new_uuid := gen_random_uuid();
    UPDATE public.aviator_current_round SET
      round_uuid       = v_new_uuid,
      phase            = 'flying',
      phase_started_at = v_now,
      crash_point      = v_crash_pt,
      last_crash_point = v_row.last_crash_point,
      elapsed_ms       = 0
    WHERE id = 1 RETURNING * INTO v_row;

    v_phase      := 'flying';
    v_elapsed_ms := 0;

  -- FLYING → CRASHED
  ELSIF v_phase = 'flying' THEN
    IF exp(0.12 * (v_elapsed_ms::float8 / 1000.0)) >= v_crash_pt::float8 THEN
      INSERT INTO public.aviator_rounds(round_uuid, bust_point, phase_started_at)
      VALUES (v_row.round_uuid, v_crash_pt, v_row.phase_started_at)
      ON CONFLICT DO NOTHING;

      UPDATE public.aviator_current_round SET
        phase            = 'crashed',
        phase_started_at = v_now,
        last_crash_point = v_crash_pt,
        elapsed_ms       = 0
      WHERE id = 1 RETURNING * INTO v_row;

      v_phase      := 'crashed';
      v_elapsed_ms := 0;

      IF v_mode = 'MANUAL' THEN
        UPDATE public.settings SET
          value = jsonb_set(value, '{gameHandlers,aviator,mode}', '"AUTO"')
        WHERE key = 'admin_config';
      END IF;
    END IF;

  -- CRASHED → WAITING
  ELSIF v_phase = 'crashed' AND v_elapsed_ms >= CRASH_MS THEN
    v_new_uuid := gen_random_uuid();
    UPDATE public.aviator_current_round SET
      round_uuid       = v_new_uuid,
      phase            = 'waiting',
      phase_started_at = v_now,
      crash_point      = NULL,
      elapsed_ms       = 0
    WHERE id = 1 RETURNING * INTO v_row;

    v_phase      := 'waiting';
    v_elapsed_ms := 0;
  END IF;

  RETURN jsonb_build_object(
    'round_uuid',       v_row.round_uuid,
    'phase',            v_row.phase,
    'elapsed_ms',       v_elapsed_ms,
    'crash_point',      CASE WHEN v_row.phase = 'crashed' THEN v_row.crash_point ELSE NULL END,
    'last_crash_point', v_row.last_crash_point
  );
END;
$$;
