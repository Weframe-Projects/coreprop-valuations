// ============================================================
// Comparable Engine - Land Registry + EPC + Auction + Historical
// ============================================================
// Combines HM Land Registry Price Paid data with EPC records,
// auction comparables from the DB, and historical valuations
// to build a ranked list of comparable properties for use in
// residential valuation reports.
//
// Enhanced with Haversine distance calculation for proper
// quarter-mile radius filtering and distance-based scoring.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { Comparable, LandRegistrySale, EPCData, AuctionComparable, HistoricalValuation } from '@/lib/types';
import { LR_PROPERTY_TYPE_MAP } from '@/lib/types';
import { searchSoldProperties, normalizeUKPostcode } from '@/lib/land-registry';
import { searchEPCByPostcode } from '@/lib/epc';

// --- Haversine distance calculation ---

const EARTH_RADIUS_M = 6_371_000; // Earth radius in meters

/**
 * Calculate the distance in meters between two lat/lng points
 * using the Haversine formula.
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Distance thresholds in meters
const QUARTER_MILE_M = 402;
const HALF_MILE_M = 805;
const ONE_MILE_M = 1609;

// --- Address normalization ---

/**
 * Normalize an address string for comparison: lowercase, strip commas,
 * collapse whitespace, trim.
 */
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Postcode parsing helpers ---

/**
 * Extract the outward code (district) from a UK postcode.
 * e.g., "TN2 4TT" -> "TN2", "SW1A 1AA" -> "SW1A"
 */
function getPostcodeDistrict(postcode: string): string {
  const cleaned = postcode.trim().toUpperCase();
  const parts = cleaned.split(/\s+/);
  return parts[0] ?? cleaned;
}

/**
 * Extract the postcode sector from a UK postcode.
 * The sector is the outward code + the first digit of the inward code.
 * e.g., "TN2 4TT" -> "TN2 4", "SW1A 1AA" -> "SW1A 1"
 */
function getPostcodeSector(postcode: string): string {
  const cleaned = postcode.trim().toUpperCase();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2 && parts[1].length >= 1) {
    return `${parts[0]} ${parts[1][0]}`;
  }
  return parts[0] ?? cleaned;
}

/**
 * Get the first character of the inward code (sector digit).
 * e.g., "TN2 4TT" -> "4"
 */
function getInwardSectorDigit(postcode: string): string {
  const cleaned = postcode.trim().toUpperCase();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2 && parts[1].length >= 1) {
    return parts[1][0];
  }
  return '';
}

// --- Property type similarity ---

/**
 * Property types grouped by structural similarity.
 * D = Detached (standalone)
 * S = Semi-Detached (attached one side)
 * T = Terraced (attached both sides)
 * F = Flat/Maisonette (apartment)
 * O = Other
 */
type PropertyTypeGroup = 'standalone' | 'attached' | 'apartment' | 'other';

function getPropertyTypeGroup(type: string): PropertyTypeGroup {
  switch (type.toUpperCase()) {
    case 'D':
      return 'standalone';
    case 'S':
    case 'T':
      return 'attached';
    case 'F':
      return 'apartment';
    default:
      return 'other';
  }
}

// --- EPC matching ---

/**
 * Given a Land Registry sale record and a list of EPC records for the same
 * postcode area, find the best matching EPC record.
 *
 * Matching strategy:
 * 1. Normalize both the LR address components and EPC address
 * 2. Compare PAON (house number) and street from LR against EPC address
 * 3. If multiple EPC records match, use the most recent one (by lodgement date)
 */
function matchEPCRecord(
  sale: LandRegistrySale,
  epcRecords: EPCData[],
): EPCData | null {
  if (epcRecords.length === 0) return null;

  // Build the key parts from LR data
  const lrPaon = sale.paon.toLowerCase().trim();
  const lrStreet = sale.street.toLowerCase().trim();
  const lrSaon = sale.saon.toLowerCase().trim();

  // If we have no PAON or street, we can't match reliably
  if (!lrPaon && !lrStreet) return null;

  // Score each EPC record
  const candidates: { epc: EPCData; quality: number }[] = [];

  for (const epc of epcRecords) {
    const epcAddr = normalizeAddress(epc.address);

    // Check if the PAON (house number) appears in the EPC address
    const hasPaon = lrPaon ? epcAddr.includes(lrPaon) : false;
    const hasStreet = lrStreet ? epcAddr.includes(lrStreet) : false;
    const hasSaon = lrSaon ? epcAddr.includes(lrSaon) : false;

    // For a match, we require the PAON and street to both be present
    if (hasPaon && hasStreet) {
      // Quality score: higher is better
      let quality = 2;
      // Bonus if the SAON also matches (for flats)
      if (lrSaon && hasSaon) quality += 1;
      // Bonus for exact-ish match (EPC address starts with the PAON)
      if (epcAddr.startsWith(lrPaon)) quality += 1;

      candidates.push({ epc, quality });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by quality descending, then by lodgement date descending (most recent first)
  candidates.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    return b.epc.lodgementDate.localeCompare(a.epc.lodgementDate);
  });

  return candidates[0].epc;
}

// --- Description generator ---

/**
 * Build a human-readable description for a comparable property.
 * Examples:
 *   "3-bed semi-detached house"
 *   "Semi-detached house, 95m2"
 *   "Semi-detached house"
 */
function buildDescription(params: {
  propertyTypeLabel: string;
  bedrooms: number | null;
  floorArea: number | null;
}): string {
  const { propertyTypeLabel, bedrooms, floorArea } = params;

  // Convert type label to lowercase for description
  const typeLower = propertyTypeLabel.toLowerCase();

  if (bedrooms && bedrooms > 0) {
    return `${typeLower}, ${bedrooms} rooms (EPC)`;
  }

  if (floorArea && floorArea > 0) {
    return `${propertyTypeLabel}, ${Math.round(floorArea)}m\u00B2`;
  }

  return propertyTypeLabel;
}

// --- Scoring function ---

/**
 * Score a single comparable against the subject property.
 * Returns a value between 0 and 100 based on:
 *   - Distance/Proximity: 0-30 points (uses Haversine if lat/lng available, else postcode)
 *   - Recency of sale: 0-25 points
 *   - Property type match: 0-25 points
 *   - Size similarity (if floor area available): 0-20 points
 */
export function scoreComparable(params: {
  comparable: {
    saleDate: string;
    propertyType: string;
    floorArea: number | null;
    postcode: string;
    street: string;
    distanceMeters?: number | null;
  };
  subject: {
    postcode: string;
    floorArea: number;
    propertyType: string;
    street: string;
  };
}): number {
  const { comparable, subject } = params;
  let score = 0;

  // --- Distance/Proximity (0-30 points) ---
  if (comparable.distanceMeters != null && comparable.distanceMeters >= 0) {
    // Use actual distance if available
    if (comparable.distanceMeters <= 200) {
      score += 30; // Very close — essentially same street
    } else if (comparable.distanceMeters <= QUARTER_MILE_M) {
      score += 25; // Within quarter mile
    } else if (comparable.distanceMeters <= HALF_MILE_M) {
      score += 18; // Within half mile
    } else if (comparable.distanceMeters <= ONE_MILE_M) {
      score += 10; // Within one mile
    } else {
      score += 3; // Further away
    }
  } else {
    // Fallback to postcode-based proximity
    const compStreet = normalizeAddress(comparable.street);
    const subjStreet = normalizeAddress(subject.street);
    const compDistrict = getPostcodeDistrict(comparable.postcode);
    const subjDistrict = getPostcodeDistrict(subject.postcode);
    const compSectorDigit = getInwardSectorDigit(comparable.postcode);
    const subjSectorDigit = getInwardSectorDigit(subject.postcode);

    if (compStreet && subjStreet && compStreet === subjStreet) {
      score += 30;
    } else if (compDistrict === subjDistrict && compSectorDigit === subjSectorDigit) {
      score += 20;
    } else if (compDistrict === subjDistrict) {
      score += 10;
    }
  }

  // --- Recency (0-25 points) ---
  const saleDate = new Date(comparable.saleDate);
  const now = new Date();
  const monthsAgo = (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  if (monthsAgo <= 6) {
    score += 25;
  } else if (monthsAgo <= 12) {
    score += 20;
  } else if (monthsAgo <= 24) {
    score += 12;
  } else if (monthsAgo <= 36) {
    score += 5;
  }

  // --- Property type match (0-25 points) ---
  const compTypeCode = getPropertyTypeCode(comparable.propertyType);
  const subjTypeCode = subject.propertyType.toUpperCase();

  if (compTypeCode === subjTypeCode) {
    score += 25;
  } else if (getPropertyTypeGroup(compTypeCode) === getPropertyTypeGroup(subjTypeCode)) {
    score += 15;
  }

  // --- Size similarity (0-20 points) ---
  if (comparable.floorArea && comparable.floorArea > 0 && subject.floorArea > 0) {
    const ratio = comparable.floorArea / subject.floorArea;
    const percentDiff = Math.abs(1 - ratio);

    if (percentDiff <= 0.10) {
      score += 20;
    } else if (percentDiff <= 0.20) {
      score += 15;
    } else if (percentDiff <= 0.30) {
      score += 10;
    } else if (percentDiff <= 0.50) {
      score += 5;
    }
  } else {
    // No floor area data available - award neutral score
    score += 10;
  }

  return score;
}

/**
 * Convert a property type label back to its single-character code.
 * Handles both single-char codes (pass-through) and human-readable labels.
 */
function getPropertyTypeCode(typeOrLabel: string): string {
  // If it's already a single character code
  if (typeOrLabel.length === 1 && 'DSTFO'.includes(typeOrLabel.toUpperCase())) {
    return typeOrLabel.toUpperCase();
  }

  // Reverse lookup from LR_PROPERTY_TYPE_MAP
  const normalized = typeOrLabel.toLowerCase();
  for (const [code, label] of Object.entries(LR_PROPERTY_TYPE_MAP)) {
    if (label.toLowerCase() === normalized) {
      return code;
    }
  }

  // Fallback: try partial matching
  if (normalized.includes('detached') && normalized.includes('semi')) return 'S';
  if (normalized.includes('detached')) return 'D';
  if (normalized.includes('terrace')) return 'T';
  if (normalized.includes('flat') || normalized.includes('maisonette')) return 'F';

  return 'O';
}

// --- Extract street name from subject address ---

/**
 * Attempt to extract a street name from a full address string.
 * Looks for common patterns like "10 High Street, Town, County"
 * and extracts "high street".
 */
function extractStreetFromAddress(address: string): string {
  // Split by comma, take the first part, remove the house number
  const parts = address.split(',');
  const firstPart = (parts[0] ?? '').trim();

  // Remove leading numbers and any flat/unit prefix
  const withoutNumber = firstPart
    .replace(/^\d+[a-z]?\s*/i, '') // "10a High Street" -> "High Street"
    .replace(/^(flat|apartment|unit)\s+\d+\s*/i, '') // "Flat 2 10 High Street" -> "10 High Street"
    .replace(/^\d+[a-z]?\s*/i, '') // Clean up again after flat removal
    .trim();

  return withoutNumber.toLowerCase();
}

// --- Main function ---

/**
 * Find and rank comparable properties by combining multiple sources:
 * 1. Land Registry Price Paid data (enriched with EPC)
 * 2. Auction comparables from the database
 * 3. Historical valuations from the database
 *
 * Process:
 * 1. Search Land Registry for sold properties (sector → district → extended)
 * 2. Merge auction comparables from DB (if auctionComps provided)
 * 3. Merge historical valuations from DB (if historicalVals provided)
 * 4. Enrich each with EPC data (floor area, bedrooms, EPC rating)
 * 5. Calculate distances using Haversine (if lat/lng available)
 * 6. Score and rank each comparable
 * 7. Mark the top N as selected (configurable, default 7)
 *
 * @returns Array of Comparable objects sorted by relevanceScore descending
 */
export async function findComparables(params: {
  subjectAddress: string;
  subjectPostcode: string;
  subjectFloorArea: number;
  subjectPropertyType: string;
  subjectLat?: number;
  subjectLng?: number;
  auctionComps?: AuctionComparable[];
  historicalVals?: HistoricalValuation[];
  maxResults?: number;
  autoSelectCount?: number;
}): Promise<Comparable[]> {
  const {
    subjectAddress,
    subjectPostcode: rawPostcode,
    subjectFloorArea,
    subjectPropertyType,
    subjectLat,
    subjectLng,
    auctionComps = [],
    historicalVals = [],
    maxResults = 20,
    autoSelectCount = 7,
  } = params;

  // Normalize postcode to ensure proper spacing (e.g., "HA80PT" → "HA8 0PT")
  const subjectPostcode = normalizeUKPostcode(rawPostcode);
  console.log(`[comparable-engine] Normalized postcode: "${rawPostcode}" → "${subjectPostcode}"`);

  const postcodeSector = getPostcodeSector(subjectPostcode);
  const postcodeDistrict = getPostcodeDistrict(subjectPostcode);
  console.log(`[comparable-engine] Search strategy: exact="${subjectPostcode}", sector="${postcodeSector}", district="${postcodeDistrict}"`);
  const subjectStreet = extractStreetFromAddress(subjectAddress);

  let lrResults: LandRegistrySale[] = [];

  const mergeResults = (existing: LandRegistrySale[], incoming: LandRegistrySale[]): LandRegistrySale[] => {
    const keys = new Set(
      existing.map((r) => `${normalizeAddress(r.address)}|${r.date}|${r.price}`),
    );
    const merged = [...existing];
    for (const result of incoming) {
      const key = `${normalizeAddress(result.address)}|${result.date}|${result.price}`;
      if (!keys.has(key)) {
        merged.push(result);
        keys.add(key);
      }
    }
    return merged;
  };

  // Strategy 1: Exact postcode match (fast — uses = not STRSTARTS)
  // Run alongside sector search in parallel for speed
  const exactPromise = searchSoldProperties({
    postcode: subjectPostcode,
    maxResults: 50,
    timeoutMs: 30000,
  }).catch((error) => {
    console.error('[comparable-engine] Land Registry exact postcode search failed:', error);
    return [] as LandRegistrySale[];
  });

  // Strategy 2: Postcode sector (e.g., "TN2 4") — uses STRSTARTS, slower
  const sectorPromise = searchSoldProperties({
    postcode: postcodeSector,
    maxResults: 50,
    timeoutMs: 45000,
  }).catch((error) => {
    console.error('[comparable-engine] Land Registry sector search failed:', error);
    return [] as LandRegistrySale[];
  });

  // Run both in parallel
  const [exactResults, sectorResults] = await Promise.all([exactPromise, sectorPromise]);
  lrResults = mergeResults(lrResults, exactResults);
  lrResults = mergeResults(lrResults, sectorResults);
  console.log(`[comparable-engine] After exact+sector: ${lrResults.length} results`);

  // Strategy 3: Full postcode district (e.g., "TN2") if still too few
  if (lrResults.length < 10) {
    try {
      const districtResults = await searchSoldProperties({
        postcode: postcodeDistrict,
        maxResults: 50,
        timeoutMs: 60000,
      });
      lrResults = mergeResults(lrResults, districtResults);
      console.log(`[comparable-engine] After district: ${lrResults.length} results`);
    } catch (error) {
      console.error('[comparable-engine] Land Registry district search failed:', error);
    }
  }

  // Strategy 4: District with extended date range (5 years) if very few
  if (lrResults.length < 5) {
    try {
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      const extendedResults = await searchSoldProperties({
        postcode: postcodeDistrict,
        maxResults: 50,
        minDate: fiveYearsAgo.toISOString().split('T')[0],
        timeoutMs: 60000,
      });
      lrResults = mergeResults(lrResults, extendedResults);
      console.log(`[comparable-engine] After extended: ${lrResults.length} results`);
    } catch (error) {
      console.error('[comparable-engine] Land Registry extended search failed:', error);
    }
  }

  // Step 3: Fetch EPC data for the postcode sector in bulk
  const epcByPostcode = new Map<string, EPCData[]>();
  const postcodesToFetch = [...new Set([
    postcodeSector,
    ...lrResults
      .map((r) => r.postcode.trim().toUpperCase())
      .filter((pc) => pc.startsWith(postcodeSector)),
  ])].slice(0, 5); // Max 5 EPC lookups to keep it fast

  await Promise.all(
    postcodesToFetch.map(async (pc) => {
      try {
        const epcResults = await searchEPCByPostcode(pc);
        epcByPostcode.set(pc, epcResults);
      } catch (error) {
        console.error(`[comparable-engine] EPC lookup failed for ${pc}:`, error);
        epcByPostcode.set(pc, []);
      }
    }),
  );

  // Build a flat lookup of all EPC records
  const allEpcRecords: EPCData[] = [];
  for (const records of epcByPostcode.values()) {
    allEpcRecords.push(...records);
  }

  // Step 4: Build Comparable objects from Land Registry results
  const comparables: Comparable[] = lrResults.map((sale) => {
    const salePostcode = sale.postcode.trim().toUpperCase();
    const epcRecords = allEpcRecords.filter(
      (e) => e.postcode.trim().toUpperCase() === salePostcode,
    );
    const matchedEPC = matchEPCRecord(sale, epcRecords);

    const propertyTypeLabel = LR_PROPERTY_TYPE_MAP[sale.propertyType] ?? 'Other';
    const floorArea = matchedEPC?.floorArea ?? null;
    const bedrooms = matchedEPC?.numberOfRooms ?? null;
    const epcRating = matchedEPC?.currentEnergyRating ?? null;
    const pricePerSqm = floorArea && floorArea > 0
      ? Math.round((sale.price / floorArea) * 100) / 100
      : null;

    const description = buildDescription({
      propertyTypeLabel,
      bedrooms,
      floorArea,
    });

    // Calculate distance if we have subject lat/lng
    // Note: we don't have lat/lng for LR results directly,
    // distance will be estimated from postcode proximity
    const distanceMeters: number | null = null;

    const relevanceScore = scoreComparable({
      comparable: {
        saleDate: sale.date,
        propertyType: propertyTypeLabel,
        floorArea,
        postcode: sale.postcode,
        street: sale.street,
        distanceMeters,
      },
      subject: {
        postcode: subjectPostcode,
        floorArea: subjectFloorArea,
        propertyType: subjectPropertyType,
        street: subjectStreet,
      },
    });

    return {
      id: uuidv4(),
      address: sale.address,
      saleDate: sale.date,
      salePrice: sale.price,
      floorArea,
      pricePerSqm,
      propertyType: propertyTypeLabel,
      bedrooms,
      description,
      source: 'land_registry' as const,
      epcRating,
      floorAreaSource: matchedEPC ? ('epc' as const) : null,
      distanceMeters,
      relevanceScore,
      isSelected: false,
      status: 'SOLD' as const,
      agentName: null,
      condition: null,
      parking: null,
      garden: null,
      frontPhotoUrl: null,
      floorPlanUrl: null,
      tenure: sale.tenure === 'F' ? 'freehold' as const : sale.tenure === 'L' ? 'leasehold' as const : null,
    };
  });

  // Step 5: Merge auction comparables from DB
  if (auctionComps.length > 0) {
    console.log(`[comparable-engine] Merging ${auctionComps.length} auction comparables`);
    for (const ac of auctionComps) {
      // Skip if no sale price
      if (!ac.salePrice || !ac.saleDate) continue;

      // Calculate distance if both have lat/lng
      let distanceMeters: number | null = null;
      if (subjectLat && subjectLng && ac.lat && ac.lng) {
        distanceMeters = Math.round(haversineDistance(subjectLat, subjectLng, ac.lat, ac.lng));
      }

      const relevanceScore = scoreComparable({
        comparable: {
          saleDate: ac.saleDate,
          propertyType: ac.propertyType || 'O',
          floorArea: null,
          postcode: ac.postcode,
          street: extractStreetFromAddress(ac.address),
          distanceMeters,
        },
        subject: {
          postcode: subjectPostcode,
          floorArea: subjectFloorArea,
          propertyType: subjectPropertyType,
          street: subjectStreet,
        },
      });

      comparables.push({
        id: uuidv4(),
        address: ac.address,
        saleDate: ac.saleDate,
        salePrice: ac.salePrice,
        floorArea: null,
        pricePerSqm: null,
        propertyType: ac.propertyType || 'Other',
        bedrooms: ac.bedrooms,
        description: ac.description || `Auction sale (${ac.source})`,
        source: 'auction',
        epcRating: null,
        floorAreaSource: null,
        distanceMeters,
        relevanceScore,
        isSelected: false,
        status: 'SOLD',
        agentName: ac.source,
        condition: null,
        parking: null,
        garden: null,
        frontPhotoUrl: ac.imageUrl,
        floorPlanUrl: null,
        tenure: null,
      });
    }
  }

  // Step 6: Merge historical valuations
  if (historicalVals.length > 0) {
    console.log(`[comparable-engine] Merging ${historicalVals.length} historical valuations`);
    for (const hv of historicalVals) {
      if (!hv.valuationFigure || !hv.valuationDate) continue;

      let distanceMeters: number | null = null;
      if (subjectLat && subjectLng && hv.lat && hv.lng) {
        distanceMeters = Math.round(haversineDistance(subjectLat, subjectLng, hv.lat, hv.lng));
      }

      const pricePerSqm = hv.floorArea && hv.floorArea > 0
        ? Math.round((hv.valuationFigure / hv.floorArea) * 100) / 100
        : null;

      const relevanceScore = scoreComparable({
        comparable: {
          saleDate: hv.valuationDate,
          propertyType: hv.propertyType || 'O',
          floorArea: hv.floorArea,
          postcode: hv.postcode,
          street: extractStreetFromAddress(hv.propertyAddress),
          distanceMeters,
        },
        subject: {
          postcode: subjectPostcode,
          floorArea: subjectFloorArea,
          propertyType: subjectPropertyType,
          street: subjectStreet,
        },
      });

      comparables.push({
        id: uuidv4(),
        address: hv.propertyAddress,
        saleDate: hv.valuationDate,
        salePrice: hv.valuationFigure,
        floorArea: hv.floorArea,
        pricePerSqm,
        propertyType: hv.propertyType || 'Other',
        bedrooms: hv.bedrooms,
        description: hv.notes || `Historical valuation`,
        source: 'historical',
        epcRating: null,
        floorAreaSource: hv.floorArea ? ('estimated' as const) : null,
        distanceMeters,
        relevanceScore,
        isSelected: false,
        status: 'SOLD',
        agentName: null,
        condition: null,
        parking: null,
        garden: null,
        frontPhotoUrl: null,
        floorPlanUrl: null,
        tenure: null,
      });
    }
  }

  // If we have no results from any source, return empty
  if (comparables.length === 0) {
    return [];
  }

  // Step 7: Sort by relevance score descending
  comparables.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Step 8: Mark the top N as selected
  for (let i = 0; i < Math.min(autoSelectCount, comparables.length); i++) {
    comparables[i].isSelected = true;
  }

  // Step 9: Return up to maxResults
  return comparables.slice(0, maxResults);
}
