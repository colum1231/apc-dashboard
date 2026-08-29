import { createClient } from '@/lib/supabase/server';
import { getRole } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, role } = await getRole();
  if (!role) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();
  if (!body?.person_id) return NextResponse.json({ error: 'person_id required' }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase.from('renewal_flags').insert({
    person_id: body.person_id,
    flagged_by: email,
    note: body.note || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
