import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/reports — list user's reports
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search') || '';
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('reports')
    .select('id, status, report_type, property_address, postcode, reference_number, valuation_figure, created_at, updated_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`property_address.ilike.%${search}%,postcode.ilike.%${search}%,reference_number.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reports: data, total: count });
}

// POST /api/reports — create new report
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  if (!body.property_address || !body.postcode || !body.report_type) {
    return NextResponse.json({ error: 'Missing required fields: property_address, postcode, report_type' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      user_id: user.id,
      report_type: body.report_type,
      property_address: body.property_address,
      postcode: body.postcode,
      reference_number: body.reference_number || '',
      client_details: body.client_details || {},
      land_registry_title: body.land_registry_title || '',
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
