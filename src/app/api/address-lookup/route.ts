import { NextResponse, type NextRequest } from 'next/server';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface AutocompleteResponse {
  predictions: Prediction[];
  status: string;
}

interface PlaceDetailsResponse {
  result: {
    formatted_address: string;
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    geometry: {
      location: { lat: number; lng: number };
    };
  };
  status: string;
}

// GET /api/address-lookup?q=...  → autocomplete suggestions
// GET /api/address-lookup?placeId=...  → full address details for a selected place
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const placeId = searchParams.get('placeId');

  if (!API_KEY) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 });
  }

  // --- Place Details (when user selects a suggestion) ---
  if (placeId) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'formatted_address,address_components,geometry');
    url.searchParams.set('key', API_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return NextResponse.json({ error: 'Place details request failed' }, { status: 502 });
    }

    const data = (await res.json()) as PlaceDetailsResponse;
    if (data.status !== 'OK' || !data.result) {
      return NextResponse.json({ error: `Place details: ${data.status}` }, { status: 404 });
    }

    const components = data.result.address_components;
    const postcode = components.find(c => c.types.includes('postal_code'))?.long_name || '';

    // Build a clean address WITHOUT the postcode and country at the end
    // Google returns "15 Forest Rd, Tunbridge Wells TN2 4TT, UK"
    // We want "15 Forest Road, Tunbridge Wells, Kent"
    const streetNumber = components.find(c => c.types.includes('street_number'))?.long_name || '';
    const route = components.find(c => c.types.includes('route'))?.long_name || '';
    const locality = components.find(c => c.types.includes('postal_town'))?.long_name
      || components.find(c => c.types.includes('locality'))?.long_name || '';
    const county = components.find(c => c.types.includes('administrative_area_level_2'))?.long_name || '';

    const addressParts = [
      [streetNumber, route].filter(Boolean).join(' '),
      locality,
      county,
    ].filter(Boolean);

    return NextResponse.json({
      address: addressParts.join(', '),
      postcode: normalizeUKPostcode(postcode),
      lat: data.result.geometry.location.lat,
      lng: data.result.geometry.location.lng,
      formattedAddress: data.result.formatted_address,
    });
  }

  // --- Autocomplete (as user types) ---
  if (!query || query.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', query);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('components', 'country:gb');
  url.searchParams.set('types', 'address');

  const res = await fetch(url.toString());
  if (!res.ok) {
    return NextResponse.json({ error: 'Autocomplete request failed' }, { status: 502 });
  }

  const data = (await res.json()) as AutocompleteResponse;

  const suggestions = (data.predictions || []).map(p => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting.main_text,
    secondaryText: p.structured_formatting.secondary_text,
  }));

  return NextResponse.json({ suggestions });
}

function normalizeUKPostcode(postcode: string): string {
  const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
  if (cleaned.length < 5 || cleaned.length > 7) {
    return postcode.trim().toUpperCase();
  }
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
}
