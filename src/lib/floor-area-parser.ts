// ============================================================
// Floor Area Parser
// Extracts room measurements from sizing notes and calculates
// total floor area. Measurements are in metres (length x width).
// ============================================================

export interface RoomMeasurement {
  length: number;
  width: number;
  area: number;
  raw: string; // original text matched
}

export interface FloorAreaResult {
  measurements: RoomMeasurement[];
  totalArea: number; // in m², rounded to 1 decimal
  measurementCount: number;
}

/**
 * Parse room measurements from free-text sizing notes.
 *
 * Handles patterns like:
 * - "6.21 x 2.94"
 * - "6.21x2.94"
 * - "6.21 X 2.94"
 * - "6.21 x 2.94m"
 * - "3.564 x 3.044"
 *
 * Returns individual measurements and a calculated total.
 */
export function parseRoomMeasurements(sizingNotes: string): FloorAreaResult {
  if (!sizingNotes || !sizingNotes.trim()) {
    return { measurements: [], totalArea: 0, measurementCount: 0 };
  }

  const measurements: RoomMeasurement[] = [];

  // Match dimensions: number x number (with optional m/m² suffix)
  const regex = /(\d+\.?\d*)\s*[xX×]\s*(\d+\.?\d*)\s*m?²?/g;
  let match;

  while ((match = regex.exec(sizingNotes)) !== null) {
    const length = parseFloat(match[1]);
    const width = parseFloat(match[2]);

    // Sanity check: ignore implausible dimensions (< 0.5m or > 30m)
    if (length >= 0.5 && length <= 30 && width >= 0.5 && width <= 30) {
      measurements.push({
        length,
        width,
        area: Math.round(length * width * 100) / 100,
        raw: match[0],
      });
    }
  }

  const totalArea = Math.round(
    measurements.reduce((sum, m) => sum + m.area, 0) * 10
  ) / 10;

  return {
    measurements,
    totalArea,
    measurementCount: measurements.length,
  };
}
