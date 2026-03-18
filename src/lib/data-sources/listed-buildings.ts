// ============================================================
// Listed Building Check — Historic England
// ============================================================
// Checks whether a property near a given coordinate is a
// listed building using the Historic England Feature Service.
// ============================================================

interface ListedBuildingResult {
  isListed: boolean;
  grade: string | null; // 'I', 'II*', 'II', or null
  name: string | null;
  listEntry: string | null; // Historic England list entry number
}

const HISTORIC_ENGLAND_LISTED_URL =
  'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/ArcGIS/rest/services/Listed_Buildings/FeatureServer/0/query';

/**
 * Check if there's a listed building at or very near the given coordinates.
 * Uses a 25m buffer around the point to catch the building footprint.
 *
 * @returns ListedBuildingResult with grade if listed.
 */
export async function checkListedBuilding(params: {
  lat: number;
  lng: number;
}): Promise<ListedBuildingResult> {
  const { lat, lng } = params;

  try {
    // Use a small buffer (25m) around the point to catch the building
    const queryParams = new URLSearchParams({
      where: '1=1',
      geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      distance: '25',
      units: 'esriSRUnit_Meter',
      outFields: 'NAME,GRADE,LIST_ENTRY',
      returnGeometry: 'false',
      f: 'json',
    });

    const response = await fetch(`${HISTORIC_ENGLAND_LISTED_URL}?${queryParams}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`[listed-buildings] HTTP ${response.status}`);
      return { isListed: false, grade: null, name: null, listEntry: null };
    }

    const data = await response.json();
    const features = data.features || [];

    if (features.length === 0) {
      return { isListed: false, grade: null, name: null, listEntry: null };
    }

    // Take the closest/first result
    const attrs = features[0].attributes || {};
    return {
      isListed: true,
      grade: attrs.GRADE || null,
      name: attrs.NAME || null,
      listEntry: attrs.LIST_ENTRY?.toString() || null,
    };
  } catch (error) {
    console.error('[listed-buildings] Check failed:', error);
    return { isListed: false, grade: null, name: null, listEntry: null };
  }
}
