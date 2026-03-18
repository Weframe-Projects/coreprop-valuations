// ============================================================
// EPC (Energy Performance Certificate) Register API Module
// ============================================================
// Queries the EPC Open Data Communities API for energy
// performance certificates. Used to enrich property data with
// EPC ratings, floor areas, construction details, and building
// fabric descriptions for valuation reports.
// ============================================================

import type { EPCData } from '@/lib/types';

const EPC_BASE_URL = 'https://epc.opendatacommunities.org/api/v1/domestic';

// --- Helper: get the auth header from environment ---

function getAuthHeader(): string {
  const auth = process.env.EPC_API_AUTH;
  if (!auth) {
    throw new Error(
      'EPC_API_AUTH environment variable is not set. ' +
      'It should contain the full "Basic ..." authorization header value.',
    );
  }
  return auth;
}

// --- Helper: make an authenticated request to the EPC API ---

async function epcFetch(path: string, params?: Record<string, string>): Promise<Response> {
  const url = new URL(`${EPC_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': getAuthHeader(),
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('EPC API request timed out after 10 seconds');
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`EPC API request failed: ${message}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `EPC API returned HTTP ${response.status}: ${errorText}`,
    );
  }

  return response;
}

// --- API response row type (kebab-case field names from the API) ---

interface EPCApiRow {
  'address': string;
  'postcode': string;
  'lodgement-date': string;
  'current-energy-rating': string;
  'current-energy-efficiency': string;
  'property-type': string;
  'built-form': string;
  'total-floor-area': string;
  'number-habitable-rooms': string;
  'construction-age-band': string;
  'walls-description': string;
  'roof-description': string;
  'windows-description': string;
  'mainheat-description': string;
  'floor-description': string;
  'transaction-type': string;
  'tenure': string;
  'environment-impact-current': string;
  'lmk-key': string;
  [key: string]: string | undefined;
}

interface EPCApiResponse {
  rows: EPCApiRow[];
  'column-names': string[];
}

// --- Transform an API row into our EPCData type ---

function transformRow(row: EPCApiRow): EPCData {
  return {
    address: row['address'] ?? '',
    postcode: row['postcode'] ?? '',
    lodgementDate: row['lodgement-date'] ?? '',
    currentEnergyRating: row['current-energy-rating'] ?? '',
    currentEnergyEfficiency: parseFloat(row['current-energy-efficiency'] ?? '0') || 0,
    propertyType: row['property-type'] ?? '',
    builtForm: row['built-form'] ?? '',
    floorArea: parseFloat(row['total-floor-area'] ?? '0') || 0,
    numberOfRooms: parseInt(row['number-habitable-rooms'] ?? '0', 10) || 0,
    constructionAgeBand: row['construction-age-band'] ?? '',
    wallsDescription: row['walls-description'] ?? '',
    roofDescription: row['roof-description'] ?? '',
    windowsDescription: row['windows-description'] ?? '',
    mainHeatingDescription: row['mainheat-description'] ?? '',
    floorDescription: row['floor-description'] ?? '',
    transactionType: row['transaction-type'] ?? '',
    tenure: row['tenure'] ?? '',
    environmentImpactCurrent: parseInt(row['environment-impact-current'] ?? '0', 10) || 0,
    lmkKey: row['lmk-key'] ?? '',
  };
}

// --- Helper: normalize an address string for fuzzy comparison ---

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Helper: compute a simple similarity score between two normalized strings ---
// Returns a value between 0 and 1, where 1 is an exact match.
// Uses token overlap (Jaccard similarity on words).

function addressSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

// --- Main exports ---

/**
 * Search for EPC certificates by postcode.
 *
 * Returns all certificates found for the given postcode, up to 100 results,
 * ordered as returned by the API (typically most recent first).
 *
 * @param postcode - UK postcode to search (e.g., "SW1A 1AA")
 * @returns Array of EPCData objects
 */
export async function searchEPCByPostcode(postcode: string): Promise<EPCData[]> {
  if (!postcode || postcode.trim().length === 0) {
    throw new Error('Postcode is required for EPC search');
  }

  const cleanPostcode = postcode.trim().toUpperCase();

  const response = await epcFetch('/search', {
    postcode: cleanPostcode,
    size: '100',
  });

  let data: EPCApiResponse;
  try {
    data = (await response.json()) as EPCApiResponse;
  } catch {
    throw new Error('Failed to parse EPC API response as JSON');
  }

  if (!data?.rows || !Array.isArray(data.rows)) {
    return [];
  }

  return data.rows.map(transformRow);
}

/**
 * Search for a specific property by address within a postcode.
 *
 * Performs a postcode search, then fuzzy-matches the provided address string
 * against the results. If multiple certificates exist for the same property,
 * returns the most recent one (by lodgement date).
 *
 * @param address - The property address to match (e.g., "10 Popes Lane")
 * @param postcode - UK postcode (e.g., "W5 4NG")
 * @returns The best-matching EPCData, or null if no good match is found
 */
export async function searchEPCByAddress(
  address: string,
  postcode: string,
): Promise<EPCData | null> {
  if (!address || address.trim().length === 0) {
    throw new Error('Address is required for EPC address search');
  }

  let results: EPCData[];
  try {
    results = await searchEPCByPostcode(postcode);
  } catch {
    // If the postcode search fails, return null rather than throwing
    return null;
  }

  if (results.length === 0) {
    return null;
  }

  const normalizedSearch = normalizeAddress(address);

  // Score each result by address similarity
  const scored = results.map((epc) => ({
    epc,
    score: addressSimilarity(normalizedSearch, normalizeAddress(epc.address)),
  }));

  // Sort by similarity score descending, then by lodgement date descending (most recent first)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.epc.lodgementDate.localeCompare(a.epc.lodgementDate);
  });

  // Require a minimum similarity threshold to avoid returning unrelated properties
  const MINIMUM_SIMILARITY = 0.25;
  const best = scored[0];

  if (best && best.score >= MINIMUM_SIMILARITY) {
    return best.epc;
  }

  // If fuzzy match on postcode results failed, try direct address search
  // The EPC API also supports an 'address' parameter for broader matching
  try {
    const addressResponse = await epcFetch('/search', {
      address: address.trim(),
      size: '10',
    });
    const addressData = (await addressResponse.json()) as EPCApiResponse;
    if (addressData?.rows?.length > 0) {
      // Filter to matching postcode and return best match
      const postcodeMatches = addressData.rows
        .map(transformRow)
        .filter(epc => epc.postcode.replace(/\s/g, '').toUpperCase() === postcode.replace(/\s/g, '').toUpperCase());
      if (postcodeMatches.length > 0) {
        // Return most recent
        postcodeMatches.sort((a, b) => b.lodgementDate.localeCompare(a.lodgementDate));
        return postcodeMatches[0];
      }
      // If no postcode match but address search returned results, return the first one
      return transformRow(addressData.rows[0]);
    }
  } catch {
    // Address search fallback failed — return null
  }

  return null;
}

/**
 * Get a specific EPC certificate by its LMK key.
 *
 * The LMK key is a unique identifier for each EPC certificate lodgement.
 *
 * @param lmkKey - The LMK key of the certificate
 * @returns The EPCData for the certificate, or null if not found
 */
export async function getEPCCertificate(lmkKey: string): Promise<EPCData | null> {
  if (!lmkKey || lmkKey.trim().length === 0) {
    throw new Error('LMK key is required to fetch an EPC certificate');
  }

  const cleanKey = lmkKey.trim();

  let response: Response;
  try {
    response = await epcFetch(`/certificate/${cleanKey}`);
  } catch (error) {
    // If the certificate is not found (404), return null
    if (error instanceof Error && error.message.includes('HTTP 404')) {
      return null;
    }
    throw error;
  }

  let data: EPCApiResponse;
  try {
    data = (await response.json()) as EPCApiResponse;
  } catch {
    throw new Error('Failed to parse EPC certificate response as JSON');
  }

  if (!data?.rows || !Array.isArray(data.rows) || data.rows.length === 0) {
    return null;
  }

  return transformRow(data.rows[0]);
}
