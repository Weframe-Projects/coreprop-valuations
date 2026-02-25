// ============================================================
// HM Land Registry Price Paid Data - SPARQL Query Module
// ============================================================
// Queries the Land Registry Linked Data SPARQL endpoint for
// sold property transactions. Used to find comparable sales
// near a target property for valuation reports.
//
// NOTE: Uses node:http directly because Next.js's patched fetch
// causes timeouts on plain HTTP requests to this endpoint.
// ============================================================

import http from 'node:http';
import type { LandRegistrySale } from '@/lib/types';

const SPARQL_ENDPOINT = 'http://landregistry.data.gov.uk/landregistry/query';

// --- UK Postcode normalization ---
// UK postcodes always have a 3-character inward code (e.g., "0PT" in "HA8 0PT").
// Users often type them without a space. This function ensures proper formatting.

export function normalizeUKPostcode(postcode: string): string {
  const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
  if (cleaned.length < 5 || cleaned.length > 7) {
    // Too short/long to be a valid UK postcode — return as-is with uppercase
    return postcode.trim().toUpperCase();
  }
  // Insert space before the last 3 characters (the inward code)
  const outward = cleaned.slice(0, -3);
  const inward = cleaned.slice(-3);
  return `${outward} ${inward}`;
}

// --- Property type mappings between our codes and SPARQL URIs ---

const PROPERTY_TYPE_URI_MAP: Record<string, string> = {
  D: 'lrppi:detached',
  S: 'lrppi:semi-detached',
  T: 'lrppi:terraced',
  F: 'lrppi:flat-maisonette',
  O: 'lrppi:otherPropertyType',
};

const PROPERTY_TYPE_REVERSE_MAP: Record<string, LandRegistrySale['propertyType']> = {
  'http://landregistry.data.gov.uk/def/common/detached': 'D',
  'http://landregistry.data.gov.uk/def/common/semi-detached': 'S',
  'http://landregistry.data.gov.uk/def/common/terraced': 'T',
  'http://landregistry.data.gov.uk/def/common/flat-maisonette': 'F',
  'http://landregistry.data.gov.uk/def/common/otherPropertyType': 'O',
};

const ESTATE_TYPE_MAP: Record<string, LandRegistrySale['tenure']> = {
  'http://landregistry.data.gov.uk/def/common/freehold': 'F',
  'http://landregistry.data.gov.uk/def/common/leasehold': 'L',
};

const TRANSACTION_CATEGORY_MAP: Record<string, LandRegistrySale['transactionCategory']> = {
  'http://landregistry.data.gov.uk/def/ppi/standardPricePaidTransaction': 'A',
  'http://landregistry.data.gov.uk/def/ppi/additionalPricePaidTransaction': 'B',
};

// --- Helper: get default min date (3 years ago) ---

function getDefaultMinDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 3);
  return date.toISOString().split('T')[0];
}

// --- Helper: escape string for SPARQL ---

function escapeSparqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// --- Helper: build postcode filter for SPARQL ---
// Supports full postcodes (e.g., "TN2 4TT") and partial/sector postcodes (e.g., "TN2 4")

function buildPostcodeFilter(postcode: string): string {
  const cleaned = postcode.trim().toUpperCase();

  // If the postcode looks like a full postcode (has a space with 3+ chars after),
  // do an exact match. Otherwise, use STRSTARTS for partial/sector matching.
  const parts = cleaned.split(/\s+/);
  if (parts.length === 2 && parts[1].length >= 3) {
    // Full postcode - exact match
    return `FILTER (?postcode = "${escapeSparqlString(cleaned)}")`;
  }

  // Partial postcode - use STRSTARTS for sector-level matching
  return `FILTER (STRSTARTS(?postcode, "${escapeSparqlString(cleaned)}"))`;
}

// --- Build the SPARQL query ---

function buildSparqlQuery(params: {
  postcode: string;
  maxResults: number;
  minDate: string;
  propertyType?: string;
}): string {
  const { postcode, maxResults, minDate, propertyType } = params;

  const postcodeFilter = buildPostcodeFilter(postcode);

  const propertyTypeFilter = propertyType && PROPERTY_TYPE_URI_MAP[propertyType]
    ? `FILTER (?propertyType = ${PROPERTY_TYPE_URI_MAP[propertyType]})`
    : '';

  return `
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?paon ?saon ?street ?locality ?town ?district ?county ?postcode
       ?price ?date ?propertyType ?estateType ?newBuild ?transactionCategory
WHERE {
  ?transaction lrppi:pricePaid ?price ;
               lrppi:transactionDate ?date ;
               lrppi:propertyAddress ?address ;
               lrppi:propertyType ?propertyType ;
               lrppi:estateType ?estateType ;
               lrppi:newBuild ?newBuild ;
               lrppi:transactionCategory ?transactionCategory .

  ?address lrcommon:postcode ?postcode .

  OPTIONAL { ?address lrcommon:paon ?paon . }
  OPTIONAL { ?address lrcommon:saon ?saon . }
  OPTIONAL { ?address lrcommon:street ?street . }
  OPTIONAL { ?address lrcommon:locality ?locality . }
  OPTIONAL { ?address lrcommon:town ?town . }
  OPTIONAL { ?address lrcommon:district ?district . }
  OPTIONAL { ?address lrcommon:county ?county . }

  ${postcodeFilter}
  FILTER (?date >= "${minDate}"^^xsd:date)
  ${propertyTypeFilter}
}
ORDER BY DESC(?date)
LIMIT ${maxResults}
`.trim();
}

// --- SPARQL result row type ---

interface SparqlBinding {
  type: string;
  value: string;
  datatype?: string;
}

interface SparqlResult {
  results: {
    bindings: Array<Record<string, SparqlBinding>>;
  };
}

// --- Helper: safely extract a string value from a SPARQL binding ---

function getBindingValue(
  binding: Record<string, SparqlBinding>,
  key: string,
  fallback: string = '',
): string {
  return binding[key]?.value ?? fallback;
}

// --- Helper: format a full address string from components ---

function formatAddress(parts: {
  saon: string;
  paon: string;
  street: string;
  locality: string;
  town: string;
}): string {
  const components: string[] = [];

  if (parts.saon) components.push(parts.saon);
  if (parts.paon) components.push(parts.paon);
  if (parts.street) components.push(parts.street);
  if (parts.locality) components.push(parts.locality);
  if (parts.town) components.push(parts.town);

  return components.join(', ');
}

// --- Transform a SPARQL result binding into a LandRegistrySale ---

function transformBinding(binding: Record<string, SparqlBinding>): LandRegistrySale {
  const saon = getBindingValue(binding, 'saon');
  const paon = getBindingValue(binding, 'paon');
  const street = getBindingValue(binding, 'street');
  const locality = getBindingValue(binding, 'locality');
  const town = getBindingValue(binding, 'town');
  const district = getBindingValue(binding, 'district');
  const county = getBindingValue(binding, 'county');
  const postcode = getBindingValue(binding, 'postcode');

  const propertyTypeUri = getBindingValue(binding, 'propertyType');
  const estateTypeUri = getBindingValue(binding, 'estateType');
  const transactionCategoryUri = getBindingValue(binding, 'transactionCategory');

  const price = parseFloat(getBindingValue(binding, 'price', '0'));
  const date = getBindingValue(binding, 'date');
  const newBuildValue = getBindingValue(binding, 'newBuild', 'false');

  return {
    address: formatAddress({ saon, paon, street, locality, town }),
    street,
    postcode,
    paon,
    saon,
    locality,
    town,
    district,
    county,
    price,
    date: date.split('T')[0], // Ensure ISO date format (YYYY-MM-DD)
    propertyType: PROPERTY_TYPE_REVERSE_MAP[propertyTypeUri] ?? 'O',
    newBuild: newBuildValue === 'true',
    tenure: ESTATE_TYPE_MAP[estateTypeUri] ?? 'F',
    transactionCategory: TRANSACTION_CATEGORY_MAP[transactionCategoryUri] ?? 'A',
  };
}

// --- HTTP POST via node:http (bypasses Next.js fetch patching) ---

function httpPost(url: string, body: string, headers: Record<string, string>, timeoutMs: number = 30000): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body, 'utf-8').toString(),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 500,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Land Registry SPARQL request timed out after ${timeoutMs / 1000} seconds`));
    });

    req.write(body);
    req.end();
  });
}

// --- Main export: search for sold properties near a postcode ---

/**
 * Queries HM Land Registry Price Paid Data via their SPARQL endpoint
 * to find sold properties near a given postcode.
 *
 * @param params.postcode - Full or partial postcode (e.g., "TN2 4" or "TN2 4TT")
 * @param params.maxResults - Maximum number of results to return (default: 50)
 * @param params.minDate - Earliest transaction date in ISO format (default: 3 years ago)
 * @param params.propertyType - Optional filter: D, S, T, F, or O
 * @returns Array of LandRegistrySale objects, ordered by date descending
 */
export async function searchSoldProperties(params: {
  postcode: string;
  maxResults?: number;
  minDate?: string;
  propertyType?: string;
  timeoutMs?: number;
}): Promise<LandRegistrySale[]> {
  const {
    postcode,
    maxResults = 50,
    minDate = getDefaultMinDate(),
    propertyType,
    timeoutMs = 30000,
  } = params;

  if (!postcode || postcode.trim().length === 0) {
    throw new Error('Postcode is required for Land Registry search');
  }

  // Normalize postcode to ensure proper spacing (e.g., "HA80PT" → "HA8 0PT")
  const normalizedPostcode = normalizeUKPostcode(postcode);

  const query = buildSparqlQuery({
    postcode: normalizedPostcode,
    maxResults,
    minDate,
    propertyType,
  });

  const body = new URLSearchParams({ query }).toString();

  let result: { statusCode: number; body: string };
  try {
    result = await httpPost(
      SPARQL_ENDPOINT,
      body,
      {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeoutMs,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Land Registry SPARQL request failed: ${message}`);
  }

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(
      `Land Registry SPARQL query returned HTTP ${result.statusCode}: ${result.body.slice(0, 200)}`,
    );
  }

  let data: SparqlResult;
  try {
    data = JSON.parse(result.body) as SparqlResult;
  } catch {
    throw new Error('Failed to parse Land Registry SPARQL response as JSON');
  }

  if (!data?.results?.bindings) {
    return [];
  }

  return data.results.bindings.map(transformBinding);
}
