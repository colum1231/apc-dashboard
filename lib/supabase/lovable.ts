import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Second Supabase project: "Lovable Sites" (osqreoolrbcpmutgkped).
 * Holds applications, the member directory and funnel data.
 *
 * Kept separate from apc-finance-agent on purpose: a bug in member-matching
 * must never be able to touch the P&L. The two are joined by key, not merged.
 *
 * Returns null when the env vars are absent, so every caller degrades to the
 * link-click proxy rather than crashing the page.
 */
export function createLovableClient() {
  const url = process.env.NEXT_PUBLIC_LOVABLE_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_LOVABLE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export const lovableConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_LOVABLE_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_LOVABLE_SUPABASE_ANON_KEY);
