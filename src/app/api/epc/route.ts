import { NextRequest, NextResponse } from 'next/server';
import { searchEPCByAddress, searchEPCByPostcode } from '@/lib/epc';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const postcode = searchParams.get('postcode');
    const address = searchParams.get('address');

    if (!postcode) {
      return NextResponse.json(
        { error: 'Missing required query parameter: postcode' },
        { status: 400 }
      );
    }

    let result;

    if (address) {
      result = await searchEPCByAddress(address, postcode);
    } else {
      result = await searchEPCByPostcode(postcode);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('EPC API error:', error);
    return NextResponse.json(
      { error: 'Internal server error while searching EPC data' },
      { status: 500 }
    );
  }
}
