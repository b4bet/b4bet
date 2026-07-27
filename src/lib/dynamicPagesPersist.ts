// Dedicated helper for persisting dynamic pages to Supabase.
// Separated from cms.ts to keep the fix small and isolated.

import { supabase } from '../integrations/supabase/client';
import type { DynamicPage } from './cms';

/**
 * Persist dynamic pages to the Supabase settings table.
 * Tries RPC first, falls back to direct upsert if RPC fails.
 */
export async function persistDynamicPages(pages: DynamicPage[]): Promise<boolean> {
  // Convert to plain JSON-safe array (removes class instances, functions, etc.)
  const payload = JSON.parse(JSON.stringify(pages));

  // Attempt 1: via RPC (SECURITY DEFINER — bypasses RLS)
  const { error: rpcError } = await supabase.rpc('admin_update_setting', {
    p_key: 'dynamic_pages',
    p_value: payload,
  });

  if (!rpcError) {
    console.log('[dynamicPages] Saved via RPC ✓', pages.length, 'pages');
    return true;
  }

  console.warn('[dynamicPages] RPC failed:', rpcError.message, '— trying direct upsert…');

  // Attempt 2: direct table upsert (uses RLS write policies)
  const { error: upsertError } = await (supabase as any)
    .from('settings')
    .upsert(
      { key: 'dynamic_pages', value: payload, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (!upsertError) {
    console.log('[dynamicPages] Saved via direct upsert ✓', pages.length, 'pages');
    return true;
  }

  console.error('[dynamicPages] Both persist methods failed!', {
    rpcError: rpcError.message,
    upsertError: upsertError.message,
  });
  return false;
}
