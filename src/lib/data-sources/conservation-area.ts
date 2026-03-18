// ============================================================
// Conservation Area Check — Historic England GIS
// ============================================================
// Checks whether a given coordinate falls within a designated
// conservation area using the Historic England Feature Service.
// ============================================================

interface ConservationAreaResult {
  isConservationArea: boolean;
  name: string | null;
  designatedDate: string | null;
  localAuthority: string | null;
}

const HISTORIC_ENGLAND_CONSERVATION_URL =
  'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/ArcGIS/rest/services/Conservation_Areas/FeatureServer/0/query';

/**
 * Check if a lat/lng coordinate falls within a conservation area.
 * Uses Historic England's ArcGIS Feature Service (public, no key required).
 *
 * @returns ConservationAreaResult with area name if within one.
 */
export async function checkConservationArea(params: {
  lat: number;
  lng: number;
}): Promise<ConservationAreaResult> {
  const { lat, lng } = params;

  try {
    const queryParams = new URLSearchParams({
      where: '1=1',
      geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'NAME,DESIGNATED_DATE,LA_NAME',
      returnGeometry: 'false',
      f: 'json',
    });

    const response = await fetch(`${HISTORIC_ENGLAND_CONSERVATION_URL}?${queryParams}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`[conservation-area] HTTP ${response.status}`);
      return { isConservationArea: false, name: null, designatedDate: null, localAuthority: null };
    }

    const data = await response.json();
    const features = data.features || [];

    if (features.length === 0) {
      return { isConservationArea: false, name: null, designatedDate: null, localAuthority: null };
    }

    const attrs = features[0].attributes || {};
    return {
      isConservationArea: true,
      name: attrs.NAME || null,
      designatedDate: attrs.DESIGNATED_DATE || null,
      localAuthority: attrs.LA_NAME || null,
    };
  } catch (error) {
    console.error('[conservation-area] Check failed:', error);
    return { isConservationArea: false, name: null, designatedDate: null, localAuthority: null };
  }
}
