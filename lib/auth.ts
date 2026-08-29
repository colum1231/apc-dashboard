import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'manager' | 'team';

export async function getSessionUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/** Resolves the caller's role from user_roles. Unknown users get the lowest tier. */
export async function getRole(): Promise<{ email: string | null; role: Role | null }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { email: null, role: null };

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('email', user.email.toLowerCase())
    .maybeSingle();

  return { email: user.email, role: (data?.role as Role) ?? 'team' };
}

export const canSeeRepComp = (role: Role | null) => role === 'admin';
export const canEditPipeline = (role: Role | null) => role === 'admin' || role === 'manager';
