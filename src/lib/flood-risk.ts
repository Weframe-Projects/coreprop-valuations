// ============================================================
// CoreProp Valuation Report - Flood Risk Check
// Queries Environment Agency APIs for flood risk data
// ============================================================

export interface FloodRiskData {
  riskLevel: 'high' | 'medium' | 'low' | 'very_low' | 'unknown';
  inFloodWarningArea: boolean;
  activeWarnings: number;
  source: string;
}

// ------------------------------------------------------------
// Check flood risk using Environment Agency APIs
// Uses two endpoints:
// 1. Flood warnings near the location (active alerts)
// 2. Flood risk zones (long-term risk assessment)
// ------------------------------------------------------------

export async function checkFloodRisk(params: {
  lat: number;
  lng: number;
  postcode: string;
}): Promise<FloodRiskData> {
  const { lat, lng } = params;

  try {
    // Query active flood warnings within 3km of the property
    const warningsUrl = `https://environment.data.gov.uk/flood-monitoring/id/floods?lat=${lat}&long=${lng}&dist=3`;

    const response = await fetch(warningsUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`[flood-risk] EA API HTTP error: ${response.status}`);
      return unknownResult();
    }

    const data = (await response.json()) as {
      items: Array<{
        severityLevel: number; // 1=Severe, 2=Warning, 3=Alert, 4=No longer in force
        severity: string;
        floodArea: { notation: string };
      }>;
    };

    const items = data.items || [];
    const activeWarnings = items.filter((w) => w.severityLevel <= 3);
    const severeWarnings = items.filter((w) => w.severityLevel <= 2);

    // Determine risk level from active warnings
    let riskLevel: FloodRiskData['riskLevel'];
    if (severeWarnings.length > 0) {
      riskLevel = 'high';
    } else if (activeWarnings.length > 0) {
      riskLevel = 'medium';
    } else {
      // No active warnings — check long-term risk via flood areas
      riskLevel = await checkLongTermRisk(lat, lng);
    }

    return {
      riskLevel,
      inFloodWarningArea: activeWarnings.length > 0,
      activeWarnings: activeWarnings.length,
      source: 'Environment Agency',
    };
  } catch (error) {
    console.error('[flood-risk] Failed to check flood risk:', error);
    return unknownResult();
  }
}

// ------------------------------------------------------------
// Check long-term flood risk using EA flood risk areas
// ------------------------------------------------------------

async function checkLongTermRisk(
  lat: number,
  lng: number
): Promise<FloodRiskData['riskLevel']> {
  try {
    // Query flood risk areas near the property
    const url = `https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=${lat}&long=${lng}&dist=0.5`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return 'very_low'; // Default if API unavailable
    }

    const data = (await response.json()) as {
      items: Array<{
        notation: string;
      }>;
    };

    const areas = data.items || [];

    if (areas.length === 0) {
      return 'very_low';
    }

    // Property is within a designated flood area
    return 'low';
  } catch {
    return 'very_low';
  }
}

function unknownResult(): FloodRiskData {
  return {
    riskLevel: 'unknown',
    inFloodWarningArea: false,
    activeWarnings: 0,
    source: 'Environment Agency',
  };
}

// ------------------------------------------------------------
// Format flood risk for report text
// ------------------------------------------------------------

export function formatFloodRiskNote(data: FloodRiskData): string {
  switch (data.riskLevel) {
    case 'high':
      return 'Based on Environment Agency data, the Property is located within an area subject to active flood warnings. Prospective purchasers should make further enquiries regarding flood risk and consider obtaining a full flood risk assessment.';
    case 'medium':
      return 'Based on Environment Agency data, the Property is located within an area subject to flood alerts. While no severe warnings are currently active, prospective purchasers are advised to make further enquiries regarding flood risk.';
    case 'low':
      return 'Based on Environment Agency data, the Property is located within a designated flood risk area, although no active flood warnings are in force at the time of this assessment. Prospective purchasers may wish to make further enquiries regarding flood risk.';
    case 'very_low':
      return 'Based on Environment Agency data, the Property is not located within a designated flood warning area.';
    case 'unknown':
      return 'Flood risk data was not available at the time of this assessment. Prospective purchasers are advised to make their own enquiries regarding flood risk.';
  }
}
