import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_MARKET_COMMENTARY_IHT, DEFAULT_MARKET_COMMENTARY_NON_IHT } from '@/lib/report-templates';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Drive connection stored in auth user metadata — bypasses PostgREST entirely
  const driveConnected = !!(user.user_metadata?.google_tokens);

  // If no settings exist yet, return defaults
  if (!data) {
    return NextResponse.json({
      market_commentary_iht: DEFAULT_MARKET_COMMENTARY_IHT,
      market_commentary_non_iht: DEFAULT_MARKET_COMMENTARY_NON_IHT,
      firm_name: 'The CoreProp Group',
      signatory_name: 'Nicholas Green MRICS',
      signatory_title_iht: 'RICS Registered Valuer',
      signatory_title_other: 'RICS Registered Valuer\nGroup Managing Director',
      firm_rics_number: '863315',
      firm_email: 'nick.green@coreprop.co.uk',
      firm_phone: '0203 143 0123',
      terms_and_conditions: '',
      google_tokens: driveConnected ? { connected: true } : null,
    });
  }

  return NextResponse.json({
    terms_and_conditions: '',
    ...data,
    google_tokens: driveConnected ? { connected: true } : null,
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Only upsert columns PostgREST knows about (v1 migration columns).
  // terms_and_conditions was added via ALTER TABLE and PostgREST's schema cache
  // hasn't refreshed — including it causes PGRST204. It will be re-added once
  // the schema cache reloads (Supabase dashboard → Settings → API → Reload schema).
  const { data, error } = await supabase
    .from('settings')
    .upsert(
      {
        user_id: user.id,
        market_commentary_iht: body.market_commentary_iht,
        market_commentary_non_iht: body.market_commentary_non_iht,
        firm_name: body.firm_name,
        signatory_name: body.signatory_name,
        signatory_title_iht: body.signatory_title_iht,
        signatory_title_other: body.signatory_title_other,
        firm_rics_number: body.firm_rics_number,
        firm_email: body.firm_email,
        firm_phone: body.firm_phone,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('[settings PUT] Supabase error:', JSON.stringify(error));
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
