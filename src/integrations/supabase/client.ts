// Supabase client — safe against missing env vars.
// Falls back to hardcoded project credentials so the app never crashes
// even if VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set in the
// Cloudflare Pages environment.

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Hardcoded fallbacks — the anon key is PUBLIC (safe to commit).
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages
// to override these at build time.
const FALLBACK_URL = 'https://qbuanfugtqiljlkenlqo.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFidWFuZnVndHFpbGpsa2VubHFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMjQwOTgsImV4cCI6MjA5OTgwMDA5OH0.UqcqncVJb2co0eRe_v6_GErB8u9FCYZxbzkZtTUKfmU';

const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL;
const SUPABASE_ANON_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || FALLBACK_KEY;

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    fetch: createSupabaseFetch(SUPABASE_ANON_KEY),
  },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
