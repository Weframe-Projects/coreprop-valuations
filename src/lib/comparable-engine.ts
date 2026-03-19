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

/** Jaccard similarity on address tokens (0 to 1, where 1 = exact match) */
function addressSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
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
 * Aggressively normalize an address for fuzzy matching:
 * expand abbreviations, strip flat/unit prefixes, collapse whitespace.
 */
function normalizeAddressAggressive(address: string): string {
  return address
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\bflat\b/gi, '')
    .replace(/\bapartment\b/gi, '')
    .replace(/\bunit\b/gi, '')
    .replace(/\bst\b/g, 'street')
    .replace(/\brd\b/g, 'road')
    .replace(/\bave\b/g, 'avenue')
    .replace(/\bln\b/g, 'lane')
    .replace(/\bdr\b/g, 'drive')
    .replace(/\bct\b/g, 'court')
    .replace(/\bcl\b/g, 'close')
    .replace(/\bcres\b/g, 'crescent')
    .replace(/\bpl\b/g, 'place')
    .replace(/\bgdns?\b/g, 'gardens')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract just the numeric portion of a PAON (e.g., "10a" → "10") */
function extractNumericPaon(paon: string): string {
  const match = paon.match(/^(\d+)/);
  return match ? match[1] : paon;
}

/**
 * Given a Land Registry sale record and a list of EPC records for the same
 * postcode area, find the best matching EPC record.
 *
 * Three-tier matching strategy:
 * Tier 1 (strict): PAON + street both present as substrings in EPC address
 * Tier 2 (relaxed): Aggressive normalization + numeric PAON + Jaccard > 0.4
 * Tier 3 (fuzzy):  Jaccard similarity > 0.5 across all EPC records for same postcode
 */
function matchEPCRecord(
  sale: LandRegistrySale,
  epcRecords: EPCData[],
): EPCData | null {
  if (epcRecords.length === 0) return null;

  const lrPaon = sale.paon.toLowerCase().trim();
  const lrStreet = sale.street.toLowerCase().trim();
  const lrSaon = sale.saon.toLowerCase().trim();

  if (!lrPaon && !lrStreet) return null;

  // Helper: pick best candidate from a list by quality then recency
  const pickBest = (candidates: { epc: EPCData; quality: number }[]): EPCData | null => {
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      return b.epc.lodgementDate.localeCompare(a.epc.lodgementDate);
    });
    return candidates[0].epc;
  };

  // --- Tier 1: Strict match (original logic) ---
  const tier1: { epc: EPCData; quality: number }[] = [];
  for (const epc of epcRecords) {
    const epcAddr = normalizeAddress(epc.address);
    const hasPaon = lrPaon ? epcAddr.includes(lrPaon) : false;
    const hasStreet = lrStreet ? epcAddr.includes(lrStreet) : false;
    const hasSaon = lrSaon ? epcAddr.includes(lrSaon) : false;

    if (hasPaon && hasStreet) {
      let quality = 2;
      if (lrSaon && hasSaon) quality += 1;
      if (epcAddr.startsWith(lrPaon)) quality += 1;
      tier1.push({ epc, quality });
    }
  }
  const tier1Result = pickBest(tier1);
  if (tier1Result) return tier1Result;

  // --- Tier 2: Relaxed match (aggressive normalization + numeric PAON + Jaccard) ---
  const numericPaon = extractNumericPaon(lrPaon);
  const lrAddrNorm = normalizeAddressAggressive(`${lrSaon} ${lrPaon} ${lrStreet}`);
  const tier2: { epc: EPCData; quality: number }[] = [];

  for (const epc of epcRecords) {
    const epcAddrNorm = normalizeAddressAggressive(epc.address);

    // Must contain the numeric house number at minimum
    if (numericPaon && !epcAddrNorm.includes(numericPaon)) continue;

    const similarity = addressSimilarity(lrAddrNorm, epcAddrNorm);
    if (similarity >= 0.4) {
      tier2.push({ epc, quality: Math.round(similarity * 10) });
    }
  }
  const tier2Result = pickBest(tier2);
  if (tier2Result) return tier2Result;

  // --- Tier 3: Fuzzy postcode-wide match (Jaccard > 0.5) ---
  const lrFullAddr = normalizeAddress(`${lrSaon} ${lrPaon} ${lrStreet}`);
  let bestScore = 0;
  let bestEpc: EPCData | null = null;

  for (const epc of epcRecords) {
    const score = addressSimilarity(lrFullAddr, normalizeAddress(epc.address));
    if (score > bestScore) {
      bestScore = score;
      bestEpc = epc;
    }
  }

  return bestEpc && bestScore >= 0.5 ? bestEpc : null;
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
  const typeLower = propertyTypeLabel.toLowerCase();
  const hasArea = floorArea && floorArea > 0;
  const hasBeds = bedrooms && bedrooms > 0;

  if (hasBeds && hasArea) {
    return `${bedrooms}-bed ${typeLower}, ${Math.round(floorArea)}m\u00B2`;
  }
  if (hasBeds) {
    return `${bedrooms}-bed ${typeLower}`;
  }
  if (hasArea) {
    return `${propertyTypeLabel}, ${Math.round(floorArea)}m\u00B2`;
  }
  return propertyTypeLabel;
}

// --- Hard filter: remove incompatible comparables ---

/**
 * Filter out fundamentally incompatible comparables:
 * - Flats should never be compared to houses (and vice versa)
 * - If bedrooms are known, exclude comps differing by more than 2 bedrooms
 */
function filterIncompatibleComparables(
  comparables: Comparable[],
  subjectPropertyType: string,
  subjectBedrooms: number | null,
): Comparable[] {
  const subjGroup = getPropertyTypeGroup(subjectPropertyType.toUpperCase());

  return comparables.filter((comp) => {
    const compTypeCode = getPropertyTypeCode(comp.propertyType);
    const compGroup = getPropertyTypeGroup(compTypeCode);

    // Hard filter: apartments vs houses
    if (subjGroup === 'apartment' && compGroup !== 'apartment') return false;
    if (subjGroup !== 'apartment' && subjGroup !== 'other' && compGroup === 'apartment') return false;

    // Bedroom filter: exclude if both known and differ by more than 2
    if (subjectBedrooms && subjectBedrooms > 0 && comp.bedrooms && comp.bedrooms > 0) {
      if (Math.abs(subjectBedrooms - comp.bedrooms) > 2) return false;
    }

    return true;
  });
}

// --- Scoring function ---

/**
 * Score a single comparable against the subject property.
 * Returns a value between 0 and 100 based on:
 *   - Distance/Proximity: 0-25 points
 *   - Recency of sale: 0-20 points
 *   - Property type match: 0-20 points
 *   - Bedroom match: 0-15 points
 *   - Size similarity (floor area): 0-20 points
 */
export function scoreComparable(params: {
  comparable: {
    saleDate: string;
    propertyType: string;
    floorArea: number | null;
    bedrooms?: number | null;
    postcode: string;
    street: string;
    distanceMeters?: number | null;
  };
  subject: {
    postcode: string;
    floorArea: number;
    propertyType: string;
    bedrooms?: number | null;
    street: string;
  };
}): number {
  const { comparable, subject } = params;
  let score = 0;

  // --- Distance/Proximity (0-25 points) ---
  if (comparable.distanceMeters != null && comparable.distanceMeters >= 0) {
    if (comparable.distanceMeters <= 200) {
      score += 25;
    } else if (comparable.distanceMeters <= QUARTER_MILE_M) {
      score += 21;
    } else if (comparable.distanceMeters <= HALF_MILE_M) {
      score += 15;
    } else if (comparable.distanceMeters <= ONE_MILE_M) {
      score += 8;
    } else {
      score += 2;
    }
  } else {
    const compStreet = normalizeAddress(comparable.street);
    const subjStreet = normalizeAddress(subject.street);
    const compDistrict = getPostcodeDistrict(comparable.postcode);
    const subjDistrict = getPostcodeDistrict(subject.postcode);
    const compSectorDigit = getInwardSectorDigit(comparable.postcode);
    const subjSectorDigit = getInwardSectorDigit(subject.postcode);

    if (compStreet && subjStreet && compStreet === subjStreet) {
      score += 25;
    } else if (compDistrict === subjDistrict && compSectorDigit === subjSectorDigit) {
      score += 17;
    } else if (compDistrict === subjDistrict) {
      score += 8;
    }
  }

  // --- Recency (0-20 points) ---
  const saleDate = new Date(comparable.saleDate);
  const now = new Date();
  const monthsAgo = (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  if (monthsAgo <= 6) {
    score += 20;
  } else if (monthsAgo <= 12) {
    score += 16;
  } else if (monthsAgo <= 24) {
    score += 10;
  } else if (monthsAgo <= 36) {
    score += 4;
  }

  // --- Property type match (0-20 points) ---
  const compTypeCode = getPropertyTypeCode(comparable.propertyType);
  const subjTypeCode = subject.propertyType.toUpperCase();

  if (compTypeCode === subjTypeCode) {
    score += 20;
  } else if (getPropertyTypeGroup(compTypeCode) === getPropertyTypeGroup(subjTypeCode)) {
    score += 12;
  }

  // --- Bedroom match (0-15 points) ---
  const compBeds = comparable.bedrooms;
  const subjBeds = subject.bedrooms;
  if (compBeds && compBeds > 0 && subjBeds && subjBeds > 0) {
    const diff = Math.abs(compBeds - subjBeds);
    if (diff === 0) score += 15;
    else if (diff === 1) score += 10;
    else if (diff === 2) score += 5;
    // diff >= 3: 0 points
  } else {
    score += 7; // Unknown bedrooms — neutral
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
    score += 5; // No floor area — penalise (was 10)
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
  subjectBedrooms?: number | null;
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
    subjectBedrooms = null,
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

  // Step 3: Fetch EPC data for ALL unique postcodes from LR results (not just same sector)
  const epcByPostcode = new Map<string, EPCData[]>();
  const postcodesToFetch = [...new Set([
    postcodeSector,
    ...lrResults.map((r) => r.postcode.trim().toUpperCase()),
  ])].slice(0, 15); // Allow up to 15 postcodes to cover all comparables

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
        bedrooms,
        postcode: sale.postcode,
        street: sale.street,
        distanceMeters,
      },
      subject: {
        postcode: subjectPostcode,
        floorArea: subjectFloorArea,
        propertyType: subjectPropertyType,
        bedrooms: subjectBedrooms,
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

  // Step 5: Merge auction comparables from DB (with EPC floor area lookup)
  if (auctionComps.length > 0) {
    console.log(`[comparable-engine] Merging ${auctionComps.length} auction comparables`);

    // Fetch EPC data for auction postcodes not already fetched
    const auctionPostcodes = [...new Set(
      auctionComps
        .filter((ac) => ac.postcode)
        .map((ac) => ac.postcode.trim().toUpperCase()),
    )].filter((pc) => !epcByPostcode.has(pc));

    if (auctionPostcodes.length > 0) {
      await Promise.all(
        auctionPostcodes.slice(0, 10).map(async (pc) => {
          try {
            const epcResults = await searchEPCByPostcode(pc);
            epcByPostcode.set(pc, epcResults);
            allEpcRecords.push(...epcResults);
          } catch (error) {
            console.error(`[comparable-engine] EPC lookup failed for auction postcode ${pc}:`, error);
          }
        }),
      );
    }

    for (const ac of auctionComps) {
      // Skip if no sale price
      if (!ac.salePrice || !ac.saleDate) continue;

      // Try to match EPC record by address for floor area
      const acPostcode = ac.postcode.trim().toUpperCase();
      const acEpcRecords = allEpcRecords.filter(
        (e) => e.postcode.trim().toUpperCase() === acPostcode,
      );
      // Try fuzzy address match against EPC records
      let matchedFloorArea: number | null = null;
      let matchedEpcRating: string | null = null;
      if (acEpcRecords.length > 0) {
        const normalizedAcAddr = normalizeAddress(ac.address);
        let bestScore = 0;
        let bestEpc: EPCData | null = null;
        for (const epc of acEpcRecords) {
          const score = addressSimilarity(normalizedAcAddr, normalizeAddress(epc.address));
          if (score > bestScore) {
            bestScore = score;
            bestEpc = epc;
          }
        }
        if (bestEpc && bestScore >= 0.3) {
          matchedFloorArea = bestEpc.floorArea && bestEpc.floorArea > 0 ? bestEpc.floorArea : null;
          matchedEpcRating = bestEpc.currentEnergyRating || null;
        }
      }

      const pricePerSqm = matchedFloorArea && matchedFloorArea > 0
        ? Math.round((ac.salePrice / matchedFloorArea) * 100) / 100
        : null;

      // Calculate distance if both have lat/lng
      let distanceMeters: number | null = null;
      if (subjectLat && subjectLng && ac.lat && ac.lng) {
        distanceMeters = Math.round(haversineDistance(subjectLat, subjectLng, ac.lat, ac.lng));
      }

      const relevanceScore = scoreComparable({
        comparable: {
          saleDate: ac.saleDate,
          propertyType: ac.propertyType || 'O',
          floorArea: matchedFloorArea,
          bedrooms: ac.bedrooms,
          postcode: ac.postcode,
          street: extractStreetFromAddress(ac.address),
          distanceMeters,
        },
        subject: {
          postcode: subjectPostcode,
          floorArea: subjectFloorArea,
          propertyType: subjectPropertyType,
          bedrooms: subjectBedrooms,
          street: subjectStreet,
        },
      });

      comparables.push({
        id: uuidv4(),
        address: ac.address,
        saleDate: ac.saleDate,
        salePrice: ac.salePrice,
        floorArea: matchedFloorArea,
        pricePerSqm,
        propertyType: ac.propertyType || 'Other',
        bedrooms: ac.bedrooms,
        description: ac.description || `Auction sale (${ac.source})`,
        source: 'auction',
        epcRating: matchedEpcRating,
        floorAreaSource: matchedFloorArea ? ('epc' as const) : null,
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
          bedrooms: hv.bedrooms,
          postcode: hv.postcode,
          street: extractStreetFromAddress(hv.propertyAddress),
          distanceMeters,
        },
        subject: {
          postcode: subjectPostcode,
          floorArea: subjectFloorArea,
          propertyType: subjectPropertyType,
          bedrooms: subjectBedrooms,
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

  // Step 7: Hard-filter incompatible comparables (flats vs houses, bedroom mismatch)
  const filtered = filterIncompatibleComparables(comparables, subjectPropertyType, subjectBedrooms);
  console.log(`[comparable-engine] After hard filter: ${filtered.length} of ${comparables.length} retained`);

  // Use filtered list if it has enough results, otherwise fall back to all
  const finalList = filtered.length >= 3 ? filtered : comparables;

  // Step 8: Sort by relevance score descending
  finalList.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Step 9: Mark the top N as selected (only if above minimum score threshold)
  const MIN_SCORE = 25;
  let selectedCount = 0;
  for (let i = 0; i < finalList.length && selectedCount < autoSelectCount; i++) {
    if (finalList[i].relevanceScore >= MIN_SCORE) {
      finalList[i].isSelected = true;
      selectedCount++;
    }
  }

  // Step 10: Return up to maxResults
  return finalList.slice(0, maxResults);
}
