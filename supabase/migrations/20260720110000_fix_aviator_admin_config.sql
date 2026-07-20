-- Migration: fix aviator_current_round missing columns + admin_config structure
-- Applied: 2026-07-20

-- Add missing columns to aviator_current_round
ALTER TABLE public.aviator_current_round 
  ADD COLUMN IF NOT EXISTS last_crash_point numeric,
  ADD COLUMN IF NOT EXISTS elapsed_ms integer DEFAULT 0;

-- Allow crash_point to be NULL during waiting phase
ALTER TABLE public.aviator_current_round 
  ALTER COLUMN crash_point DROP NOT NULL;

-- Reset aviator round to clean waiting state
UPDATE public.aviator_current_round 
SET phase = 'waiting',
    phase_started_at = now(),
    crash_point = NULL,
    elapsed_ms = 0
WHERE id = 1;

-- Fix admin_config: ensure per-game nested structure with correct field names
UPDATE public.settings
SET value = jsonb_build_object(
  'aviator', jsonb_build_object(
    'mode', 'AUTO',
    'houseEdge', 5,
    'targetWinProbability', 55,
    'manualCrashPoint', 3.0,
    'manualTargetRoundId', null
  ),
  'crash', jsonb_build_object(
    'mode', 'AUTO',
    'houseEdge', 5,
    'targetWinProbability', 50,
    'manualCrashPoint', 3.0,
    'manualTargetRoundId', null
  ),
  'wingo', jsonb_build_object(
    'mode', 'AUTO',
    'houseEdge', 5,
    'targetWinProbability', 50,
    'manualResult', '5',
    'manualTargetRoundId', null
  ),
  'k3', jsonb_build_object(
    'mode', 'AUTO',
    'houseEdge', 5,
    'targetWinProbability', 50,
    'manualResult', '3,3,3',
    'manualTargetRoundId', null
  ),
  'fived', jsonb_build_object(
    'mode', 'AUTO',
    'houseEdge', 5,
    'targetWinProbability', 50,
    'manualResult', '00000',
    'manualTargetRoundId', null
  ),
  'mines', jsonb_build_object(
    'mode', 'AUTO',
    'houseEdge', 5,
    'targetWinProbability', 50
  ),
  'sunvsmoon', jsonb_build_object(
    'mode', 'AUTO',
    'houseEdge', 5,
    'targetWinProbability', 50,
    'manualResult', 'sun',
    'manualTargetRoundId', null
  ),
  'trading', jsonb_build_object(
    'mode', 'AUTO',
    'houseEdge', 5,
    'targetWinProbability', 50
  )
)
WHERE key = 'admin_config';
