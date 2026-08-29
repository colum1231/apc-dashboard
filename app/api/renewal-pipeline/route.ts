import { createClient } from '@/lib/supabase/server';
import { getRole, canEditPipeline } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, role } = await getRole();
  if (!canEditPipeline(role)) {
    return NextResponse.json({ error: 'Your role cannot change renewal status' }, { status: 403 });
  }

  const body = await request.json();
  if (!body?.term_id || !body?.status) {
    return NextResponse.json({ error: 'term_id and status required' }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.from('renewal_pipeline').upsert(
    {
      term_id: body.term_id,
      person_id: body.person_id ?? null,
      status: body.status,
      last_contact_date: new Date().toISOString().slice(0, 10),
      updated_by: email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'term_id' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
