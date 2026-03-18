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
    const escapedSearch = search.replace(/[%_]/g, '\\$&');
    query = query.or(`property_address.ilike.%${escapedSearch}%,postcode.ilike.%${escapedSearch}%,reference_number.ilike.%${escapedSearch}%`);
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

  // Validate postcode (UK format)
  const postcodeRegex = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
  if (!postcodeRegex.test(body.postcode)) {
    return NextResponse.json({ error: 'Invalid UK postcode format' }, { status: 400 });
  }

  // Validate property_address length
  if (typeof body.property_address !== 'string' || body.property_address.length < 5 || body.property_address.length > 500) {
    return NextResponse.json({ error: 'property_address must be between 5 and 500 characters' }, { status: 400 });
  }

  // Validate report_type
  const validReportTypes = [
    'iht_inspected', 'iht_desktop',
    'current_market_inspected', 'current_market_desktop',
    'auction_inspected', 'auction_desktop',
    'ha_current_market_auction',
    'aso_inspected', 'aso_desktop',
    'portfolio_inspected', 'portfolio_desktop',
  ];
  if (!validReportTypes.includes(body.report_type)) {
    return NextResponse.json({ error: `Invalid report_type. Must be one of: ${validReportTypes.join(', ')}` }, { status: 400 });
  }

  // Create the report
  const insertData: Record<string, unknown> = {
    user_id: user.id,
    report_type: body.report_type,
    property_address: body.property_address,
    postcode: body.postcode,
    reference_number: body.reference_number || '',
    client_details: body.client_details || {},
    land_registry_title: body.land_registry_title || body.title_number || '',
    property_details: body.property_details || {},
  };

  // Include google_drive_folder_id if provided
  if (body.google_drive_folder_id) {
    insertData.google_drive_folder_id = body.google_drive_folder_id;
  }

  let { data, error } = await supabase
    .from('reports')
    .insert(insertData)
    .select('id')
    .single();

  // If insert failed (possibly due to google_drive_folder_id not in PostgREST schema cache),
  // retry without it — the Drive folder ID is also in property_details JSON as fallback.
  if (error && body.google_drive_folder_id) {
    delete insertData.google_drive_folder_id;
    const retry = await supabase
      .from('reports')
      .insert(insertData)
      .select('id')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create report' }, { status: 500 });
  }

  // If inspection notes are provided, create them in the inspection_notes table
  if (body.inspection_notes) {
    const notes = body.inspection_notes;
    await supabase.from('inspection_notes').insert({
      report_id: data.id,
      user_id: user.id,
      inspection_date: notes.inspectionDate || null,
      inspector_initials: notes.inspectorInitials || '',
      time_of_day: notes.timeOfDay || 'morning',
      weather_conditions: notes.weatherConditions || '',
      description_notes: notes.descriptionNotes || '',
      construction_notes: notes.constructionNotes || '',
      amenities_notes: notes.amenitiesNotes || '',
      layout_notes: notes.layoutNotes || '',
      heating_notes: notes.heatingNotes || '',
      windows_notes: notes.windowsNotes || '',
      garden_notes: notes.gardenNotes || '',
      sizing_notes: notes.sizingNotes || '',
      condition_notes: notes.conditionNotes || '',
      extra_notes: notes.extraNotes || '',
    });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
