// ============================================================
// Data Source Orchestrator
// ============================================================
// Runs all supplementary data source lookups in parallel.
// Each source is independent and failure-tolerant.
// ============================================================

import { checkConservationArea } from './conservation-area';
import { checkListedBuilding } from './listed-buildings';

export interface DataSourceResults {
  conservationArea: {
    isConservationArea: boolean;
    name: string | null;
    designatedDate: string | null;
    localAuthority: string | null;
  };
  listedBuilding: {
    isListed: boolean;
    grade: string | null;
    name: string | null;
    listEntry: string | null;
  };
}

/**
 * Fetch all supplementary data sources in parallel.
 * Each source is independent — a failure in one doesn't affect others.
 */
export async function fetchAllDataSources(params: {
  lat: number;
  lng: number;
  postcode: string;
}): Promise<DataSourceResults> {
  const { lat, lng } = params;

  const [conservationArea, listedBuilding] = await Promise.all([
    checkConservationArea({ lat, lng }),
    checkListedBuilding({ lat, lng }),
  ]);

  return {
    conservationArea,
    listedBuilding,
  };
}

export { checkConservationArea } from './conservation-area';
export { checkListedBuilding } from './listed-buildings';
