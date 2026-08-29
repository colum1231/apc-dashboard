import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * SERVICE ROLE. Bypasses RLS entirely.
 * Only import this from route handlers or server actions that have already
 * checked the caller's role. Never import from a component marked 'use client'.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
