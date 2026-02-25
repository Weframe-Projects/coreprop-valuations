import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';

/**
 * Proxy route for Google Maps static images (Street View, Satellite & Location Map).
 * The browser cannot load these directly because the API key may have
 * server-side restrictions. This route fetches the image on the server
 * and streams it back to the client.
 *
 * Query params:
 *   type: 'streetview' | 'satellite' | 'location'
 *   address: property address (for streetview)
 *   lat, lng: coordinates (for satellite and location)
 *   size: image size (default '800x600')
 *   zoom: zoom level for satellite/location (default 19 for satellite, 16 for location)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type');
  const size = searchParams.get('size') ?? '800x600';

  let googleUrl: URL;

  if (type === 'streetview') {
    const address = searchParams.get('address');
    if (!address) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
    }

    googleUrl = new URL('https://maps.googleapis.com/maps/api/streetview');
    googleUrl.searchParams.set('size', size);
    googleUrl.searchParams.set('location', address);
    googleUrl.searchParams.set('key', API_KEY);
  } else if (type === 'satellite') {
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    if (!lat || !lng) {
      return NextResponse.json({ error: 'Missing lat/lng parameters' }, { status: 400 });
    }

    const zoom = searchParams.get('zoom') ?? '19';
    googleUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');
    googleUrl.searchParams.set('center', `${lat},${lng}`);
    googleUrl.searchParams.set('zoom', zoom);
    googleUrl.searchParams.set('size', size);
    googleUrl.searchParams.set('maptype', 'satellite');
    googleUrl.searchParams.set('key', API_KEY);
  } else if (type === 'location') {
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    if (!lat || !lng) {
      return NextResponse.json({ error: 'Missing lat/lng parameters' }, { status: 400 });
    }

    const zoom = searchParams.get('zoom') ?? '16';
    googleUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');
    googleUrl.searchParams.set('center', `${lat},${lng}`);
    googleUrl.searchParams.set('zoom', zoom);
    googleUrl.searchParams.set('size', size);
    googleUrl.searchParams.set('maptype', 'roadmap');
    googleUrl.searchParams.set('markers', `color:red|${lat},${lng}`);
    googleUrl.searchParams.set('key', API_KEY);
  } else {
    return NextResponse.json({ error: 'Invalid type: use "streetview", "satellite", or "location"' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(googleUrl.toString(), {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Google API returned ${response.status}` },
        { status: response.status },
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}
