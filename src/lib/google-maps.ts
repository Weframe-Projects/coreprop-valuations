// ============================================================
// CoreProp Valuation Report - Google Maps API Integration
// ============================================================

import type { NearbyPlace, GoogleMapsData } from '@/lib/types';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';

const METERS_PER_MILE = 1609.344;
const TWO_MILES_IN_METERS = 2 * METERS_PER_MILE;

// ------------------------------------------------------------
// Geocode an address to lat/lng
// ------------------------------------------------------------

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; formattedAddress: string; localAuthority: string | null } | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('components', 'country:GB');

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error(`Geocoding API HTTP error: ${response.status}`);
    return null;
  }

  const data = (await response.json()) as {
    status: string;
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
      address_components: Array<{
        long_name: string;
        short_name: string;
        types: string[];
      }>;
    }>;
  };

  if (data.status !== 'OK' || data.results.length === 0) {
    console.error(`Geocoding failed for "${address}": ${data.status}`);
    return null;
  }

  const result = data.results[0];

  // Extract local authority from address components
  const localAuthority =
    result.address_components?.find((c) => c.types.includes('administrative_area_level_2'))?.long_name ?? null;

  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
    localAuthority,
  };
}

// ------------------------------------------------------------
// Get Street View static image URL for a property
// Returns a proxy URL through our own API to avoid browser
// API key restriction issues.
// ------------------------------------------------------------

export async function getStreetViewUrl(
  address: string,
  size: string = '800x600'
): Promise<string> {
  // Return proxy URL — the /api/map-image route fetches from Google server-side
  const params = new URLSearchParams({
    type: 'streetview',
    address,
    size,
  });
  return `/api/map-image?${params.toString()}`;
}

// ------------------------------------------------------------
// Get satellite/aerial view URL for a property
// Returns a proxy URL through our own API.
// ------------------------------------------------------------

export async function getSatelliteViewUrl(
  lat: number,
  lng: number,
  zoom: number = 19,
  size: string = '800x600'
): Promise<string> {
  const params = new URLSearchParams({
    type: 'satellite',
    lat: lat.toString(),
    lng: lng.toString(),
    zoom: zoom.toString(),
    size,
  });
  return `/api/map-image?${params.toString()}`;
}

// ------------------------------------------------------------
// Get location map URL (roadmap with marker showing property)
// Returns a proxy URL through our own API.
// ------------------------------------------------------------

export async function getLocationMapUrl(
  lat: number,
  lng: number,
  zoom: number = 16,
  size: string = '800x600'
): Promise<string> {
  const params = new URLSearchParams({
    type: 'location',
    lat: lat.toString(),
    lng: lng.toString(),
    zoom: zoom.toString(),
    size,
  });
  return `/api/map-image?${params.toString()}`;
}

// ------------------------------------------------------------
// Direct Google Maps Static API URLs (for PDF embedding where proxy may not work)
// These use the API key directly — only use server-side (not exposed to browser)
// ------------------------------------------------------------

export function getDirectStreetViewUrl(address: string, size: string = '800x600'): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return '';
  return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(address)}&key=${key}`;
}

export function getDirectSatelliteUrl(lat: number, lng: number, zoom: number = 19, size: string = '800x600'): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return '';
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}&maptype=satellite&key=${key}`;
}

export function getDirectLocationMapUrl(lat: number, lng: number, zoom: number = 16, size: string = '800x600'): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return '';
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}&maptype=roadmap&markers=color:red|${lat},${lng}&key=${key}`;
}

// ------------------------------------------------------------
// Internal: search for nearby places of a given type
// ------------------------------------------------------------

interface PlacesResult {
  name: string;
  place_id: string;
  types: string[];
  geometry: {
    location: { lat: number; lng: number };
  };
}

// Types that must appear in the place's types array to be considered valid.
// Google Places often returns loosely related results (e.g. piano tutors for
// "school", cricket clubs for "park"), so we filter strictly.
const VALID_TYPES: Record<string, string[]> = {
  train_station: ['train_station', 'subway_station', 'light_rail_station', 'transit_station'],
  hospital: ['hospital'],
  school: ['school', 'primary_school', 'secondary_school', 'university'],
  park: ['park'],
  supermarket: ['supermarket', 'grocery_or_supermarket'],
  doctor: ['doctor', 'health'],
};

async function searchNearbyPlaces(
  lat: number,
  lng: number,
  type: string,
  limit: number
): Promise<PlacesResult[]> {
  const url = new URL(
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json'
  );
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('type', type);
  url.searchParams.set('rankby', 'distance');
  url.searchParams.set('key', API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error(`Places API HTTP error for type "${type}": ${response.status}`);
    return [];
  }

  const data = (await response.json()) as {
    status: string;
    results: PlacesResult[];
  };

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error(`Places API failed for type "${type}": ${data.status}`);
    return [];
  }

  // Filter: only keep results whose types array includes a valid type for
  // what we searched. This eliminates false positives like piano tutors
  // being returned for "school" or cricket clubs for "park".
  const validTypes = VALID_TYPES[type] || [type];
  const filtered = data.results.filter((place) =>
    place.types?.some((t) => validTypes.includes(t))
  );

  return filtered.slice(0, limit);
}

// ------------------------------------------------------------
// Internal: get distances via the Distance Matrix API
// ------------------------------------------------------------

interface DistanceMatrixElement {
  status: string;
  distance?: { text: string; value: number };
  duration?: { text: string; value: number };
}

async function getDistances(
  originLat: number,
  originLng: number,
  placeIds: string[],
  mode: 'walking' | 'driving'
): Promise<DistanceMatrixElement[]> {
  if (placeIds.length === 0) return [];

  const destinations = placeIds.map((id) => `place_id:${id}`).join('|');
  const url = new URL(
    'https://maps.googleapis.com/maps/api/distancematrix/json'
  );
  url.searchParams.set('origins', `${originLat},${originLng}`);
  url.searchParams.set('destinations', destinations);
  url.searchParams.set('mode', mode);
  url.searchParams.set('key', API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error(`Distance Matrix API HTTP error: ${response.status}`);
    return placeIds.map(() => ({ status: 'UNKNOWN_ERROR' }));
  }

  const data = (await response.json()) as {
    status: string;
    rows: Array<{ elements: DistanceMatrixElement[] }>;
  };

  if (data.status !== 'OK' || data.rows.length === 0) {
    console.error(`Distance Matrix API failed: ${data.status}`);
    return placeIds.map(() => ({ status: 'UNKNOWN_ERROR' }));
  }

  return data.rows[0].elements;
}

// ------------------------------------------------------------
// Internal: convert meters to a formatted miles string
// ------------------------------------------------------------

function metersToMilesText(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  return `c.${miles.toFixed(1)} miles distant`;
}

// ------------------------------------------------------------
// Find nearby places (train stations, hospitals) with distances
// ------------------------------------------------------------

export async function findNearbyTransport(
  lat: number,
  lng: number
): Promise<NearbyPlace[]> {
  const results: NearbyPlace[] = [];

  // Search for all amenity categories in parallel
  const [stations, hospitals, schools, parks, supermarkets, doctors] = await Promise.all([
    searchNearbyPlaces(lat, lng, 'train_station', 3),
    searchNearbyPlaces(lat, lng, 'hospital', 1),
    searchNearbyPlaces(lat, lng, 'school', 3),
    searchNearbyPlaces(lat, lng, 'park', 1),
    searchNearbyPlaces(lat, lng, 'supermarket', 1),
    searchNearbyPlaces(lat, lng, 'doctor', 1),
  ]);

  // Walking distances: train stations + parks
  const walkingPlaces: Array<{ place: PlacesResult; category: string }> = [];
  for (const s of stations) walkingPlaces.push({ place: s, category: 'train_station' });
  for (const p of parks) walkingPlaces.push({ place: p, category: 'park' });

  if (walkingPlaces.length > 0) {
    const walkingDistances = await getDistances(
      lat, lng,
      walkingPlaces.map((w) => w.place.place_id),
      'walking'
    );

    for (let i = 0; i < walkingPlaces.length; i++) {
      const { place, category } = walkingPlaces[i];
      const element = walkingDistances[i];

      if (element?.status === 'OK' && element.distance) {
        // Only include train stations within 2 miles walking
        if (category === 'train_station' && element.distance.value > TWO_MILES_IN_METERS) continue;

        results.push({
          name: place.name,
          type: category as NearbyPlace['type'],
          distanceText: `${metersToMilesText(element.distance.value)} (walking)`,
          distanceValue: element.distance.value,
          travelMode: 'walking',
        });
      }
    }
  }

  // Driving distances: hospitals, schools, supermarkets, GPs (batched into 1 call)
  const drivingPlaces: Array<{ place: PlacesResult; category: string }> = [];
  for (const h of hospitals) drivingPlaces.push({ place: h, category: 'hospital' });
  for (const s of schools) drivingPlaces.push({ place: s, category: 'school' });
  for (const s of supermarkets) drivingPlaces.push({ place: s, category: 'supermarket' });
  for (const d of doctors) drivingPlaces.push({ place: d, category: 'doctor' });

  if (drivingPlaces.length > 0) {
    const drivingDistances = await getDistances(
      lat, lng,
      drivingPlaces.map((d) => d.place.place_id),
      'driving'
    );

    for (let i = 0; i < drivingPlaces.length; i++) {
      const { place, category } = drivingPlaces[i];
      const element = drivingDistances[i];

      if (element?.status === 'OK' && element.distance) {
        // Skip schools that are clearly not real schools (tutoring, coaching, etc.)
        let placeType: NearbyPlace['type'] = category as NearbyPlace['type'];
        if (category === 'school') {
          const nameLower = place.name.toLowerCase();
          const isNotRealSchool = nameLower.includes('tutor') || nameLower.includes('coaching')
            || nameLower.includes('music') || nameLower.includes('piano')
            || nameLower.includes('dance') || nameLower.includes('martial')
            || nameLower.includes('driving') || nameLower.includes('language school')
            || nameLower.includes('cricket') || nameLower.includes('football')
            || nameLower.includes('swimming') || nameLower.includes('yoga');
          if (isNotRealSchool) continue;

          // Classify real schools as primary or secondary
          if (nameLower.includes('secondary') || nameLower.includes('high school') || nameLower.includes('academy') || nameLower.includes('grammar') || nameLower.includes('college')) {
            placeType = 'secondary_school';
          } else {
            placeType = 'primary_school';
          }
        }

        results.push({
          name: place.name,
          type: placeType,
          distanceText: `${metersToMilesText(element.distance.value)} (car)`,
          distanceValue: element.distance.value,
          travelMode: 'driving',
        });
      }
    }
  }

  return results;
}

// ------------------------------------------------------------
// All-in-one: fetch all Google Maps data for a property
// ------------------------------------------------------------

export async function fetchGoogleMapsData(
  address: string
): Promise<GoogleMapsData> {
  // Step 1: Geocode the address
  const geocodeResult = await geocodeAddress(address);

  if (!geocodeResult) {
    return {
      streetViewUrl: null,
      satelliteUrl: null,
      locationMapUrl: null,
      lat: 0,
      lng: 0,
      nearbyPlaces: [],
      formattedAddress: address,
      localAuthority: null,
    };
  }

  const { lat, lng, formattedAddress, localAuthority } = geocodeResult;

  // Step 2: Fetch all map images and nearby places in parallel
  const [streetViewUrl, satelliteUrl, locationMapUrl, nearbyPlaces] = await Promise.allSettled([
    getStreetViewUrl(address),
    getSatelliteViewUrl(lat, lng),
    getLocationMapUrl(lat, lng),
    findNearbyTransport(lat, lng),
  ]);

  return {
    streetViewUrl:
      streetViewUrl.status === 'fulfilled' ? streetViewUrl.value : null,
    satelliteUrl:
      satelliteUrl.status === 'fulfilled' ? satelliteUrl.value : null,
    locationMapUrl:
      locationMapUrl.status === 'fulfilled' ? locationMapUrl.value : null,
    lat,
    lng,
    nearbyPlaces:
      nearbyPlaces.status === 'fulfilled' ? nearbyPlaces.value : [],
    formattedAddress,
    localAuthority,
  };
}
