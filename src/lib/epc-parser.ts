// ============================================================
// EPC Description Parser
// Extracts structured PropertyDetails fields from EPC text
// descriptions. Pure functions — no external API calls.
// ============================================================

import type { EPCData, PropertyDetails } from '@/lib/types';

/**
 * Parse EPC description strings into structured PropertyDetails fields.
 * EPC descriptions follow predictable patterns from a finite set of values
 * used by energy assessors, so regex/string matching is reliable here.
 */
export function parseEPCDescriptions(
  epc: EPCData
): Partial<PropertyDetails> {
  const result: Partial<PropertyDetails> = {};

  // --- Walls → brickType ---
  if (epc.wallsDescription) {
    result.brickType = parseWalls(epc.wallsDescription);
  }

  // --- Roof → roofType ---
  if (epc.roofDescription) {
    result.roofType = parseRoof(epc.roofDescription);
  }

  // --- Floor → subFlooring ---
  if (epc.floorDescription) {
    result.subFlooring = parseFloor(epc.floorDescription);
  }

  // --- Heating → hasGas ---
  if (epc.mainHeatingDescription) {
    result.hasGas = parseHeatingGas(epc.mainHeatingDescription);
  }

  // --- Storeys (from builtForm + propertyType + numberOfRooms) ---
  result.storeys = estimateStoreys(epc);

  return result;
}

// --- Individual Parsers ---

function parseWalls(desc: string): string {
  const d = desc.toLowerCase();

  if (d.includes('timber frame')) {
    return 'timber-frame construction with rendered elevations';
  }
  if (d.includes('sandstone') || d.includes('limestone') || d.includes('granite')) {
    return 'stone elevations';
  }
  if (d.includes('system built') || d.includes('system build')) {
    return 'system-built construction';
  }
  if (d.includes('park home') || d.includes('cob')) {
    return 'non-traditional construction';
  }

  // Brick variants — most common
  if (d.includes('cavity')) {
    if (d.includes('insulated') || d.includes('filled')) {
      return 'insulated cavity wall brickwork';
    }
    return 'cavity wall brickwork';
  }
  if (d.includes('solid brick') || d.includes('solid wall')) {
    return 'solid brickwork';
  }

  // Render
  if (d.includes('rendered') || d.includes('render')) {
    return 'rendered elevations';
  }

  // Default for any other brick
  if (d.includes('brick')) {
    return 'brickwork';
  }

  return 'brickwork';
}

function parseRoof(desc: string): string {
  const d = desc.toLowerCase();

  const isPitched = d.includes('pitched') || d.includes('pitch');
  const isFlat = d.includes('flat');

  // Material hints
  const hasSlate = d.includes('slate');
  const hasTile = d.includes('tile') || d.includes('tiled');
  const hasThatch = d.includes('thatch');

  if (hasThatch) {
    return 'thatched roof';
  }
  if (isFlat) {
    return 'flat roof with felt covering';
  }
  if (isPitched && hasSlate) {
    return 'pitched roof with natural slate covering';
  }
  if (isPitched && hasTile) {
    return 'pitched roof with tile covering';
  }
  if (isPitched) {
    return 'pitched roof with tile covering';
  }

  // Mixed — some properties have both pitched and flat sections
  if (d.includes('pitched') && d.includes('flat')) {
    return 'part pitched, part flat roof';
  }

  return 'pitched roof';
}

function parseFloor(desc: string): string {
  const d = desc.toLowerCase();

  if (d.includes('suspended') && d.includes('timber')) {
    return 'suspended timber';
  }
  if (d.includes('suspended')) {
    return 'suspended timber';
  }
  if (d.includes('solid') && d.includes('concrete')) {
    return 'solid concrete';
  }
  if (d.includes('solid')) {
    return 'solid concrete';
  }

  // "To external area" typically means ground floor above open air (stilts/undercroft)
  if (d.includes('external area')) {
    return 'suspended above external area';
  }

  return 'assumed timber';
}

function parseHeatingGas(desc: string): boolean {
  const d = desc.toLowerCase();
  return d.includes('gas') || d.includes('mains gas');
}

/**
 * Estimate number of storeys from EPC data.
 * EPC doesn't have a direct "storeys" field, so we use heuristics.
 */
function estimateStoreys(epc: EPCData): number {
  const form = (epc.builtForm || '').toLowerCase();
  const type = (epc.propertyType || '').toLowerCase();
  const rooms = epc.numberOfRooms || 0;
  const area = epc.floorArea || 0;

  // Bungalows are single-storey
  if (type.includes('bungalow') || form.includes('bungalow')) {
    return 1;
  }

  // Flats/maisonettes
  if (type.includes('flat') || type.includes('maisonette')) {
    // Maisonettes are typically 2 floors
    if (type.includes('maisonette')) return 2;
    return 1;
  }

  // Houses — use room count and floor area as heuristics
  // Average UK room is ~15m², so area/rooms gives a rough size indicator
  if (rooms >= 8 || area >= 200) {
    return 3;
  }
  if (rooms >= 4 || area >= 60) {
    return 2;
  }

  return 2; // Default for houses
}

/**
 * Extract window type description from EPC data.
 * Useful as supplementary info for the AI generator prompt.
 */
export function parseWindowType(epc: EPCData): string | null {
  const d = (epc.windowsDescription || '').toLowerCase();

  if (d.includes('triple')) return 'triple glazed windows';
  if (d.includes('double')) return 'double glazed windows';
  if (d.includes('single')) return 'single glazed windows';
  if (d.includes('secondary')) return 'secondary glazed windows';

  return null;
}

/**
 * Extract heating system description for AI context.
 */
export function parseHeatingSystem(epc: EPCData): string | null {
  const d = (epc.mainHeatingDescription || '').toLowerCase();

  if (d.includes('boiler') && d.includes('gas')) {
    if (d.includes('combi') || d.includes('combination')) {
      return 'gas-fired combination boiler with radiators';
    }
    return 'gas-fired boiler with radiators';
  }
  if (d.includes('boiler') && d.includes('oil')) {
    return 'oil-fired boiler with radiators';
  }
  if (d.includes('electric') && d.includes('storage')) {
    return 'electric storage heaters';
  }
  if (d.includes('heat pump')) {
    return 'air source heat pump';
  }
  if (d.includes('warm air')) {
    return 'warm air heating system';
  }
  if (d.includes('underfloor')) {
    return 'underfloor heating';
  }

  return null;
}
