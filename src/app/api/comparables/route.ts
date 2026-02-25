import { NextRequest, NextResponse } from 'next/server';
import { findComparables } from '@/lib/comparable-engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, postcode, floorArea, propertyType, lat, lng } = body;

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid required field: address' },
        { status: 400 }
      );
    }

    if (!postcode || typeof postcode !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid required field: postcode' },
        { status: 400 }
      );
    }

    const result = await findComparables({
      subjectAddress: address,
      subjectPostcode: postcode,
      subjectFloorArea: typeof floorArea === 'number' && floorArea > 0 ? floorArea : 0,
      subjectPropertyType: propertyType || 'S',
      subjectLat: lat,
      subjectLng: lng,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Comparables API error:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error while finding comparables' },
      { status: 500 }
    );
  }
}
