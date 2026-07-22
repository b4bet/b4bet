-- =====================================================================
-- Migration: 20260722000000_maintenance_mode.sql
-- Adds maintenance_mode toggle to settings table
-- =====================================================================

-- Insert maintenance_mode setting with default off
INSERT INTO public.settings (key, value, description)
VALUES (
  'maintenance_mode',
  '{"enabled": false, "title": "Under Maintenance", "message": "We are currently performing scheduled maintenance. We will be back shortly. Thank you for your patience!", "estimated_time": ""}',
  'Site-wide maintenance mode — blocks all non-admin users when enabled'
)
ON CONFLICT (key) DO NOTHING;
