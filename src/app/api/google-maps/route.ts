import { NextRequest, NextResponse } from 'next/server';
import { fetchGoogleMapsData } from '@/lib/google-maps';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Missing required query parameter: address' },
        { status: 400 }
      );
    }

    const result = await fetchGoogleMapsData(address);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Google Maps API error:', error);
    return NextResponse.json(
      { error: 'Internal server error while fetching Google Maps data' },
      { status: 500 }
    );
  }
}
