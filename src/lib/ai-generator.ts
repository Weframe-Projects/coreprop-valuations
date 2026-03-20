// ============================================================
// CoreProp Valuation Report - AI Section Generator
// Uses Anthropic Claude API to generate formal RICS report text
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  ReportType,
  PropertyDetails,
  InspectionData,
  EPCData,
  GoogleMapsData,
  Comparable,
  ClientDetails,
  NearbyPlace,
  StructuredInspectionNotes,
  isInspectedType,
  isDesktopType,
  PROPERTY_TYPE_LABELS,
  CONDITION_LABELS,
  FREEHOLD_SUBTYPE_LABELS,
  LEASEHOLD_SUBTYPE_LABELS,
  ConditionRating,
} from '@/lib/types';

// --- Constants ---

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 6000;

const GARAGE_LABELS: Record<string, string> = {
  none: '',
  single_detached: 'a detached single garage',
  single_integrated: 'an integrated single garage',
  double: 'a detached double garage',
  other: 'a garage',
};

const ELECTRICAL_LABELS: Record<string, string> = {
  needs_upgrading: 'in need of upgrading',
  slightly_dated: 'slightly dated but functional',
  fair: 'in fair visual order',
  modern: 'in good modern order',
};

// --- System Prompt ---

const SYSTEM_PROMPT = `You are an expert RICS-qualified chartered surveyor writing formal valuation report sections for CoreProp, a UK-based property valuation firm.

Your writing style must adhere to the following rules:

1. Use British English spelling throughout (colour, neighbouring, centre, etc.)
2. Always refer to the subject property as "the Property" (capitalised) and the building as "the Building" (capitalised)
3. Write in the third person — never use "I", "we", or "our"
4. Use formal surveyor language: measured, precise, and professional
5. Be concise — do not pad with unnecessary adjectives or filler phrases
6. Use hedging language for condition assessments: "appears to", "is considered", "is in a generally serviceable condition"
7. Reference standard construction terminology (stretcher bond, interlocking tiles, dual-pitched, etc.)
8. For desktop (non-inspected) reports, prefix observations with "it is assumed" or "assumed" — never claim direct observation
9. Use paragraph breaks between distinct topics within a section
10. Never make definitive claims about structural integrity or hidden defects
11. Format output as valid JSON with the exact keys specified in the request
12. CRITICAL: Every paragraph MUST start with its sub-number (e.g. "5.1.", "5.2.", "13.1.", "13.2."). This is mandatory RICS Red Book formatting. Never write a paragraph without its sub-number prefix.
13. Reference the last known sale price and date if available from comparable/Land Registry data
14. When inspection notes mention specific fittings, brands, or details (e.g. "Vaillant combi boiler", "chrome mixer taps", "laminate worktops"), name them explicitly in the report. Never generalise specific observations into vague descriptions.
15. For condition sections, always state the specific room, the specific fitting/element, and its condition. Example: "The kitchen is fitted with wall and base units with laminate worktops and a stainless-steel sink. The units appear dated but functional." NOT: "The kitchen is in fair condition."
16. Use the phrase "at the time of inspection" when describing observed conditions in inspected reports.
17. For Section 5 (Description), always mention the number of storeys, the approximate construction era, and the neighbourhood character.
18. For Section 13 (Condition), structure exactly as: opening statement, then each element (kitchen, bathroom, heating, flooring, electrical, windows, decorative, overall). Each gets its own sub-numbered paragraph.

You will be given structured property data and asked to generate specific report sections. Return ONLY a JSON object with the requested section keys and their text content. Do not include any markdown formatting or code fences — return raw JSON only.`;

// --- Anthropic Client (lazy initialised) ---

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _client;
}

// --- Template Sections (no AI needed) ---

function generateSection7Accommodation(details: PropertyDetails): string {
  const lines: string[] = [];

  if (details.groundFloorRooms) {
    lines.push(`Ground Floor: ${details.groundFloorRooms}.`);
  }
  if (details.firstFloorRooms) {
    lines.push(`First Floor: ${details.firstFloorRooms}.`);
  }
  if (details.secondFloorRooms) {
    lines.push(`Second Floor: ${details.secondFloorRooms}.`);
  }

  return lines.join('\n\n');
}

function generateSection9Services(details: PropertyDetails): string {
  const services: string[] = [];
  if (details.hasWater) services.push('mains water');
  if (details.hasGas) services.push('mains gas');
  if (details.hasElectricity) services.push('mains electricity');
  if (details.hasDrainage) services.push('mains drainage');

  const servicesList = services.length > 0
    ? services.join(', ')
    : 'unknown services';

  const epcLine = details.epcRating
    ? `\n\nThe Property has an Energy Performance Certificate (EPC) rating of ${details.epcRating}.`
    : '';

  return `We understand the Property benefits from ${servicesList}. We have not tested any of the service installations and can therefore give no warranty as to their condition.${epcLine}`;
}

function generateSection10FloorArea(
  details: PropertyDetails,
  reportType: ReportType,
  measuredArea?: number
): string {
  const epcArea = details.floorArea;
  const lines: string[] = [];

  lines.push('10.1. All areas are approximate only and unless mentioned otherwise have been measured based on a Gross Internal Area basis as defined by RICS Property Measurement 2nd Edition January 2018 incorporating IPMS.');

  if (isInspectedType(reportType)) {
    if (measuredArea && measuredArea > 0) {
      lines.push(`10.2. We estimate the total useful superficial floor area of the Property to be some ${measuredArea}m\u00B2.`);
      // If EPC area is available and differs, note it
      if (epcArea && Math.abs(epcArea - measuredArea) > 3) {
        lines.push(`The EPC records a floor area of ${epcArea}m\u00B2.`);
      }
    } else if (epcArea) {
      lines.push(`10.2. We estimate the total useful superficial floor area of the Property to be some ${epcArea}m\u00B2.`);
    }
  } else {
    if (epcArea) {
      lines.push(`10.2. We estimate the gross internal floor area to be assumed c.${epcArea}m\u00B2.`);
    }
  }

  return lines.join('\n\n');
}

function generateSection11Tenure(details: PropertyDetails): string {
  const lines: string[] = [];

  if (details.tenure === 'freehold') {
    // Freehold variations
    const subType = details.freeholdSubType ?? 'standard';
    switch (subType) {
      case 'flying_freehold':
        lines.push('We understand the Property is held on a Freehold basis. We note that part of the Property constitutes a flying freehold, where a portion of the building extends over neighbouring land. Specialist legal advice regarding the flying freehold element should be sought.');
        break;
      case 'share_of_freehold':
        lines.push('We understand the Property is held on a Leasehold basis, however the Leaseholder also holds a Share of the Freehold through a management company or similar arrangement. This share provides the Leaseholder with greater control over the building management and the ability to extend the lease at nominal cost.');
        break;
      case 'commonhold':
        lines.push('We understand the Property is held on a Commonhold basis, as defined by the Commonhold and Leasehold Reform Act 2002. Each unit owner holds the freehold of their individual unit and is a member of the Commonhold Association responsible for the management of common parts.');
        break;
      default:
        lines.push('We understand the Property is held on a Freehold basis.');
        break;
    }
  } else {
    // Leasehold variations
    const subType = details.leaseholdSubType ?? 'long_leasehold';
    const ld = details.leaseholdDetails;

    switch (subType) {
      case 'virtual_freehold':
        lines.push('We understand the Property is held on a long Leasehold basis, with a term that is effectively a virtual freehold.');
        break;
      case 'short_leasehold':
        lines.push('We understand the Property is held on a Leasehold basis. We note that the remaining lease term is below 80 years, which is considered a short lease and has a material impact on the market value of the Property. The diminishing lease term may affect mortgageability and saleability.');
        break;
      default:
        lines.push('We understand the Property is held on a Leasehold basis.');
        break;
    }

    // Add lease term details
    if (ld) {
      if (ld.originalTerm && ld.remainingTerm) {
        lines.push(`The lease was originally granted for a term of ${ld.originalTerm} years${ld.leaseStartYear ? ` from ${ld.leaseStartYear}` : ''}, with approximately ${ld.remainingTerm} years unexpired.`);
      } else if (ld.remainingTerm) {
        lines.push(`The lease has approximately ${ld.remainingTerm} years unexpired.`);
      } else if (ld.originalTerm) {
        lines.push(`The lease was originally granted for a term of ${ld.originalTerm} years${ld.leaseStartYear ? ` from ${ld.leaseStartYear}` : ''}.`);
      }

      // Ground rent
      if (ld.groundRent != null && ld.groundRent > 0) {
        const reviewNote = ld.groundRentReview ? `, ${ld.groundRentReview}` : '';
        lines.push(`The ground rent is understood to be £${ld.groundRent.toLocaleString('en-GB')} per annum${reviewNote}.`);
      }

      // Service charge
      if (ld.serviceCharge != null && ld.serviceCharge > 0) {
        lines.push(`The service charge is understood to be approximately £${ld.serviceCharge.toLocaleString('en-GB')} per annum.`);
      }
    }
  }

  // Additional tenure notes
  if (details.tenureNotes) {
    lines.push(details.tenureNotes);
  }

  return lines.join('\n\n');
}

function generateSection12Roads(details: PropertyDetails): string {
  const adopted = details.roadAdopted
    ? 'which we understand to be adopted and maintained at the expense of the Local Authority'
    : 'the adoption status of which we have not verified';

  return `The Property fronts ${details.roadName}, ${adopted}.`;
}

// --- AI Prompt Builder ---

function buildUserPrompt(data: {
  reportType: ReportType;
  propertyDetails: PropertyDetails;
  inspectionData: InspectionData | null;
  epcData: EPCData | null;
  googleMapsData: GoogleMapsData | null;
  comparables: Comparable[];
  structuredNotes: StructuredInspectionNotes | null;
  photoAnalysis: { label: string; analysis: string }[];
}): string {
  const { reportType, propertyDetails, inspectionData, epcData, googleMapsData, structuredNotes, photoAnalysis } = data;
  const inspected = isInspectedType(reportType);
  const propertyTypeLabel = PROPERTY_TYPE_LABELS[propertyDetails.propertyType] || propertyDetails.propertyType;

  let prompt = `Generate the following RICS valuation report sections based on the property data below.

Report type: ${reportType} (${inspected ? 'INSPECTED' : 'DESKTOP — use assumed language throughout'})

--- PROPERTY DATA ---

Property Type: ${propertyTypeLabel}
Storeys: ${propertyDetails.storeys}
Construction Era: ${propertyDetails.constructionEra}
Brick Type: ${propertyDetails.brickType}
Roof Type: ${propertyDetails.roofType}
Sub-flooring: ${propertyDetails.subFlooring}
Area Character: ${propertyDetails.areaCharacter}
Location Notes: ${propertyDetails.locationNotes}

Front Description: ${propertyDetails.frontDescription}
Parking: ${propertyDetails.parkingDescription}
Garage: ${GARAGE_LABELS[propertyDetails.garageType] || propertyDetails.garageType}
Rear Garden: ${propertyDetails.rearGardenDescription}
`;

  if (epcData) {
    prompt += `
--- EPC DATA ---
Construction Age Band: ${epcData.constructionAgeBand}
Walls: ${epcData.wallsDescription}
Roof: ${epcData.roofDescription}
Windows: ${epcData.windowsDescription}
Heating: ${epcData.mainHeatingDescription}
Floor: ${epcData.floorDescription}
Floor Area: ${epcData.floorArea}m²
`;
  }

  if (inspectionData) {
    prompt += `
--- INSPECTION DATA ---
Inspection Date: ${inspectionData.inspectionDate}
Weather: ${inspectionData.weatherConditions}
Kitchen: ${CONDITION_LABELS[inspectionData.kitchenCondition]}${inspectionData.kitchenNotes ? ' — ' + inspectionData.kitchenNotes : ''}
Bathroom: ${CONDITION_LABELS[inspectionData.bathroomCondition]}${inspectionData.bathroomNotes ? ' — ' + inspectionData.bathroomNotes : ''}
Heating: ${inspectionData.heatingType} (${inspectionData.heatingMake}), condition: ${CONDITION_LABELS[inspectionData.heatingCondition]}
Flooring: ${CONDITION_LABELS[inspectionData.flooringCondition]}${inspectionData.flooringNotes ? ' — ' + inspectionData.flooringNotes : ''}
Electrical: ${ELECTRICAL_LABELS[inspectionData.electricalCondition] || inspectionData.electricalCondition}
Windows: ${inspectionData.windowType}, condition: ${CONDITION_LABELS[inspectionData.windowCondition]}
Decorative: ${CONDITION_LABELS[inspectionData.decorativeCondition]}${inspectionData.decorativeNotes ? ' — ' + inspectionData.decorativeNotes : ''}
Overall: ${CONDITION_LABELS[inspectionData.overallCondition]}${inspectionData.overallNotes ? ' — ' + inspectionData.overallNotes : ''}
Rainwater Goods: ${inspectionData.rainwaterGoodsCondition}
External Paint: ${inspectionData.externalPaintCondition}
Roof Condition: ${inspectionData.roofCondition}${inspectionData.roofNotes ? ' — ' + inspectionData.roofNotes : ''}
`;
  }

  if (structuredNotes) {
    // Build note fields — combine layout + sizing together so AI can correlate rooms with measurements
    const noteFields: { key: keyof StructuredInspectionNotes; label: string }[] = [
      { key: 'descriptionNotes', label: 'Property Description & Area Character' },
      { key: 'constructionNotes', label: 'Construction (brickwork, roof, stories)' },
      { key: 'amenitiesNotes', label: 'Amenities, Access & Front Approach' },
      { key: 'heatingNotes', label: 'Heating System' },
      { key: 'windowsNotes', label: 'Windows' },
      { key: 'gardenNotes', label: 'Garden & External Areas' },
      { key: 'conditionNotes', label: 'Condition Issues' },
      { key: 'extraNotes', label: 'Additional Notes' },
    ];

    const filledNotes = noteFields
      .filter(({ key }) => structuredNotes[key])
      .map(({ key, label }) => `${label}: ${structuredNotes[key]}`);

    // Combine layout + sizing into one section so room names and measurements are together
    const hasLayout = !!structuredNotes.layoutNotes;
    const hasSizing = !!structuredNotes.sizingNotes;
    if (hasLayout || hasSizing) {
      let roomSection = 'Room Layout, Floor Finishes & Measurements:\n';
      if (hasLayout) roomSection += structuredNotes.layoutNotes;
      if (hasLayout && hasSizing) roomSection += '\n\nRoom dimensions (metres, in same order as rooms above):\n';
      if (hasSizing) roomSection += structuredNotes.sizingNotes;
      filledNotes.splice(3, 0, roomSection); // Insert after amenities
    }

    if (filledNotes.length > 0) {
      prompt += `
--- STRUCTURED INSPECTION NOTES ---
Inspector: ${structuredNotes.inspectorInitials || 'N/A'}
Date: ${structuredNotes.inspectionDate || 'N/A'}
Time: ${structuredNotes.timeOfDay || 'N/A'}
Weather: ${structuredNotes.weatherConditions || 'N/A'}

${filledNotes.join('\n\n')}

IMPORTANT - Surveyor shorthand guide:
- "s/g" = single glazed, "d/g" = double glazed
- "uPVC" / "UPVC" = uPVC windows
- "FFF" = first floor flat
- "Combi" = combination boiler
- "resi" = residential, "sort" = sought
- Floor finishes after room names: "carpet", "tiled", "laminate", "wood" = the flooring in that room
- Measurements like "6.21 x 2.94" = room dimensions in metres (length x width)
- Room names in layout and measurements in sizing are listed in the SAME ORDER — match them up
- "period conversion" = a period building converted into separate flats/units
- "historic water ingress" = past water damage (not necessarily active)

SECTION ROUTING GUIDE — map these notes to sections:
- descriptionNotes → section_5_description (property type, area character, neighbourhood)
- constructionNotes → section_6_construction (brickwork, roof, storeys, build method)
- amenitiesNotes → section_8_externally (front approach, access) AND section_15_amenity (local amenities)
- layoutNotes + sizingNotes → section_7_accommodation (room names matched with measurements)
- heatingNotes → section_13_condition (heating paragraph 13.4)
- windowsNotes → section_13_condition (windows paragraph 13.7)
- gardenNotes → section_8_externally (rear garden paragraph)
- conditionNotes → section_13_condition (relevant sub-paragraphs: kitchen, bathroom, flooring, electrical, decorative, general)
- extraNotes → distribute to the most relevant section

CRITICAL: These are first-hand notes from the surveyor's site visit. Do NOT lose any specific observations — every room, measurement, condition issue, fittings detail, and construction detail MUST appear in the final report. Name specific brands, materials, and fittings exactly as noted.
`;
    }
  }

  if (photoAnalysis.length > 0) {
    prompt += `
--- PHOTO ANALYSIS ---
The following observations were extracted from photographs taken during the inspection:

${photoAnalysis.map((p, i) => `Photo ${i + 1} (${p.label}): ${p.analysis}`).join('\n')}

Use these visual observations to supplement condition assessments and descriptions where relevant.
`;
  }

  if (googleMapsData) {
    prompt += `
--- LOCATION DATA ---
Formatted Address: ${googleMapsData.formattedAddress}
Nearby Places:
${googleMapsData.nearbyPlaces.map((p: NearbyPlace) => `  - ${p.name} (${p.type}): ${p.distanceText} (${p.travelMode})`).join('\n')}
`;
  }

  // Conditionally add accommodation generation when rooms are not manually provided
  const needsAIAccommodation = !propertyDetails.groundFloorRooms && !propertyDetails.firstFloorRooms;

  prompt += `
--- SECTIONS TO GENERATE ---

Return a JSON object with these exact keys:

"section_5_description": Description of Property — Write 2-3 sub-numbered paragraphs:
  5.1. The Property type, position within the building/street (e.g. "self-contained ground floor flat", "middle terrace period conversion"), and its location (populated residential area, sought-after neighbourhood, etc.). Reference propertyType, areaCharacter, and locationNotes.
  5.2. The last known sale price and date if available (e.g. "The Property last stated sold for £265,000 on 16 September 2016."). If no sale data is available, omit this paragraph.
  Keep it concise and factual — no speculation about value. Match this exact style: "The Property is a self-contained ground floor flat positioned within a purpose-built Local Authority block, located in a populated south-east London suburb, close to local amenities."

"section_6_construction": Construction — Write 3 sub-numbered paragraphs:
  6.1. Main construction — storeys, external wall material, roof type and material, any notable features (chimney stacks, render, detailing). Reference storeys, brickType, roofType, constructionEra.
  6.2. Sub-flooring — type of sub-floor construction (solid, suspended timber, etc.).
  6.3. Closing statement: "The method of construction is traditional for the type and age of the Property."
${needsAIAccommodation ? `
"section_7_accommodation": Accommodation — Based on the property type (${propertyTypeLabel}), EPC habitable rooms (${epcData?.numberOfRooms ?? 'unknown'}), floor area (${propertyDetails.floorArea}m²), built form (${epcData?.builtForm ?? 'unknown'}), and storeys (${propertyDetails.storeys}), generate a plausible room layout. Format as:
Ground Floor: [comma-separated room list].
First Floor: [comma-separated room list].${propertyDetails.storeys >= 3 ? '\nSecond Floor: [comma-separated room list].' : ''}
Use assumed language for desktop valuations. Keep room counts consistent with the EPC habitable room count. Do NOT invent dimensions. Example output: "Ground Floor: Entrance hallway, reception room, kitchen/dining room.\\n\\nFirst Floor: Three bedrooms, family bathroom."
` : ''}
"section_8_externally": Externally — Describe the front, parking, garage (if any), and rear garden. Use separate paragraphs for each area. Reference frontDescription, parkingDescription, garageType, rearGardenDescription.

"section_13_condition": Condition & Further Details — ${inspected
    ? `Generate sub-numbered paragraphs covering each area of internal condition. Use this exact structure:
  13.1 Opening: "In preparing the Valuation Report, we have had regard for the following matters as at the date of inspection:"
  13.2 Kitchen — condition of fittings, units, worktops. Look for "Kitchen:" in condition notes.
  13.3 Bathroom — suite type, tiles, shower, overall condition. Look for "Bathroom:" in condition notes.
  13.4 Heating — boiler type and make, radiators, visual condition (not tested, assumed functional).
  13.5 Flooring — type and condition throughout (carpet, laminate, tiles, exposed boards). Look for "Flooring:" in condition notes.
  13.6 Electrical — wiring installation, consumer unit, NICEIC compliance (not tested). Look for "Electrical:" in condition notes.
  13.7 Windows — frame type, glazing, sash/casement, condition.
  13.8 Decorative — overall decorative order (freshly decorated, dated, in need of redecoration). Look for "Decorative:" in condition notes.
  13.9 General issues — dampness, water ingress, cracking, structural concerns, specialist investigation needed. Look for "General:" in condition notes.
  13.10 Overall conclusion — overall condition assessment and modernisation expectation (e.g. "The general condition of the Property is considered dated and in need of modernisation.").
  Be specific about fittings, condition ratings and observations from the surveyor notes.`
    : 'This is a DESKTOP valuation — no inspection was carried out. Use assumed language throughout. State that internal condition is assumed based on age and type. Reference EPC data where available.'}

"section_14_structure": Structure and External — ${inspected
    ? 'Based on inspection data, describe the external structural condition: rainwater goods, pointing, brickwork, external paintwork, and roof. Use hedging language.'
    : 'This is a DESKTOP valuation. Reference Google satellite imagery if available. Use assumed/generic assessment language about the external structure based on age and type.'}

"section_15_amenity": Amenity — Describe the neighbourhood character and list ALL nearby amenities grouped by category. Group as: Transport (train stations with walking distances), Education (primary and secondary schools), Recreation (parks), Shopping (supermarkets), Medical (hospitals, GP surgeries). Reference areaCharacter and ALL entries from nearbyPlaces. Include distances for each.

Return ONLY the JSON object, no additional text.`;

  return prompt;
}

// --- Fallback Text Generators ---

function fallbackSection5(details: PropertyDetails): string {
  const typeLabel = PROPERTY_TYPE_LABELS[details.propertyType] || 'property';
  return `The Property is a ${typeLabel.toLowerCase()}, located within ${details.areaCharacter || 'a residential area'}${details.locationNotes ? ', ' + details.locationNotes : ''}.`;
}

function fallbackSection6(details: PropertyDetails, epcData: EPCData | null): string {
  const storeysText = details.storeys === 1 ? 'one storey' : details.storeys === 2 ? 'two storeys' : `${details.storeys} storeys`;
  const lines: string[] = [];

  lines.push(
    `Construction of the Building is arranged over ${storeysText}, with external elevations of ${details.brickType || 'brickwork'}. The structure is surmounted by a ${details.roofType || 'pitched roof'}.`
  );

  if (details.subFlooring) {
    lines.push(`Sub-flooring within the Property is predominantly of ${details.subFlooring} construction.`);
  }

  lines.push('The method of construction is traditional for the type and age of the Property.');

  return lines.join('\n\n');
}

function fallbackSection8(details: PropertyDetails): string {
  const lines: string[] = [];

  if (details.frontDescription) {
    lines.push(`To the front of the Property, ${details.frontDescription}.`);
  }

  if (details.parkingDescription) {
    lines.push(details.parkingDescription);
  }

  const garageLabel = GARAGE_LABELS[details.garageType];
  if (garageLabel) {
    lines.push(`The Property benefits from ${garageLabel}.`);
  }

  if (details.rearGardenDescription) {
    lines.push(`To the rear of the Property is ${details.rearGardenDescription}.`);
  }

  return lines.join('\n\n');
}

function fallbackSection13(
  details: PropertyDetails,
  inspectionData: InspectionData | null,
  reportType: ReportType
): string {
  if (isDesktopType(reportType)) {
    return 'No internal inspection of the Property has been undertaken. It is assumed that the internal condition of the Property is commensurate with its age and type, and that no significant defects are present which would materially affect the valuation.';
  }

  if (!inspectionData) {
    return 'Internal condition details are unavailable.';
  }

  const safe = (key: keyof typeof CONDITION_LABELS | undefined) =>
    key && CONDITION_LABELS[key] ? CONDITION_LABELS[key].toLowerCase() : 'fair';

  const lines: string[] = [];
  lines.push(`The kitchen is in ${safe(inspectionData.kitchenCondition)} condition${inspectionData.kitchenNotes ? ', ' + inspectionData.kitchenNotes : ''}.`);
  lines.push(`The bathroom is in ${safe(inspectionData.bathroomCondition)} order${inspectionData.bathroomNotes ? ', ' + inspectionData.bathroomNotes : ''}.`);
  if (inspectionData.heatingType) {
    lines.push(`The heating is provided by ${inspectionData.heatingType}${inspectionData.heatingMake ? ' (' + inspectionData.heatingMake + ')' : ''}, in ${safe(inspectionData.heatingCondition)} visual order (not tested albeit assumed functional).`);
  }
  lines.push(`The decorative order throughout is ${safe(inspectionData.decorativeCondition)}.`);
  if (inspectionData.overallNotes) {
    lines.push(inspectionData.overallNotes);
  }

  return lines.join('\n\n');
}

function fallbackSection14(
  inspectionData: InspectionData | null,
  reportType: ReportType
): string {
  if (isDesktopType(reportType)) {
    return 'No external inspection of the Property has been undertaken. Based on available satellite imagery, the external structure appears to be in a condition commensurate with its age and type. It is assumed that no significant structural defects are present.';
  }

  if (!inspectionData) {
    return 'External structural condition details are unavailable.';
  }

  return `The rainwater goods are in ${inspectionData.rainwaterGoodsCondition || 'a generally serviceable'} condition. External paintwork is in ${inspectionData.externalPaintCondition || 'fair'} order. The roof appears to be in ${inspectionData.roofCondition || 'serviceable'} condition${inspectionData.roofNotes ? ', ' + inspectionData.roofNotes : ''}.`;
}

function fallbackAccommodation(
  details: PropertyDetails,
  epcData: EPCData | null
): string {
  const rooms = epcData?.numberOfRooms ?? 0;
  const storeys = details.storeys || 2;
  const typeLabel = PROPERTY_TYPE_LABELS[details.propertyType] || 'property';

  if (rooms === 0) {
    return `The Property is a ${typeLabel.toLowerCase()} arranged over ${storeys === 1 ? 'one storey' : storeys === 2 ? 'two storeys' : `${storeys} storeys`}. Detailed room accommodation was not available at the time of this desktop assessment.`;
  }

  // Estimate bedroom count from total habitable rooms
  const bedrooms = Math.max(1, Math.ceil(rooms * 0.5));
  const receptionRooms = rooms - bedrooms;

  const lines: string[] = [];

  if (storeys === 1) {
    // Bungalow — all on one floor
    const roomList: string[] = ['Entrance hallway'];
    if (receptionRooms >= 2) roomList.push('reception room', 'kitchen/dining room');
    else roomList.push('kitchen/living room');
    roomList.push(`${bedrooms} bedroom${bedrooms > 1 ? 's' : ''}`, 'bathroom');
    lines.push(`Ground Floor: ${roomList.join(', ')}.`);
  } else {
    // Multi-storey
    const groundRooms: string[] = ['Entrance hallway'];
    if (receptionRooms >= 2) {
      groundRooms.push('reception room', 'kitchen/dining room');
    } else {
      groundRooms.push('kitchen/living room');
    }
    lines.push(`Ground Floor: ${groundRooms.join(', ')}.`);

    const firstFloorRooms: string[] = ['Landing'];
    firstFloorRooms.push(`${bedrooms} bedroom${bedrooms > 1 ? 's' : ''}`);
    firstFloorRooms.push('family bathroom');
    lines.push(`First Floor: ${firstFloorRooms.join(', ')}.`);
  }

  return `The accommodation is assumed to comprise approximately ${rooms} habitable rooms as follows:\n\n${lines.join('\n\n')}`;
}

function fallbackSection15(
  details: PropertyDetails,
  googleMapsData: GoogleMapsData | null
): string {
  const lines: string[] = [];
  lines.push(`The Property is in a ${details.areaCharacter || 'residential area'}, with neighbouring dwellings of compatible style and size.`);

  if (googleMapsData?.nearbyPlaces && googleMapsData.nearbyPlaces.length > 0) {
    const places = googleMapsData.nearbyPlaces;

    // Transport
    const stations = places.filter((p: NearbyPlace) => p.type === 'train_station');
    if (stations.length > 0) {
      lines.push('Principal transport facilities close by include:');
      stations.forEach((s: NearbyPlace) => {
        lines.push(`${s.name}, ${s.distanceText}.`);
      });
    }

    // Education
    const primarySchools = places.filter((p: NearbyPlace) => p.type === 'primary_school');
    const secondarySchools = places.filter((p: NearbyPlace) => p.type === 'secondary_school');
    const allSchools = [...primarySchools, ...secondarySchools];
    if (allSchools.length > 0) {
      const schoolLines = allSchools.map((s: NearbyPlace) => `${s.name}, ${s.distanceText}`);
      lines.push(`Educational facilities nearby include ${schoolLines.join('; ')}.`);
    }

    // Recreation
    const parks = places.filter((p: NearbyPlace) => p.type === 'park');
    if (parks.length > 0) {
      lines.push(`Recreational amenities include ${parks.map((p: NearbyPlace) => `${p.name}, ${p.distanceText}`).join('; ')}.`);
    }

    // Shopping
    const shops = places.filter((p: NearbyPlace) => p.type === 'supermarket');
    if (shops.length > 0) {
      lines.push(`Shopping facilities include ${shops.map((s: NearbyPlace) => `${s.name}, ${s.distanceText}`).join('; ')}.`);
    }

    // Medical
    const medical = places.filter((p: NearbyPlace) => p.type === 'hospital' || p.type === 'doctor');
    if (medical.length > 0) {
      lines.push(`Medical facilities include ${medical.map((m: NearbyPlace) => `${m.name}, ${m.distanceText}`).join('; ')}.`);
    }
  }

  return lines.join('\n\n');
}

// --- Sub-numbering Enforcement ---

/**
 * Ensures all paragraphs in a section start with proper sub-numbers (e.g. 5.1., 5.2.).
 * If the AI returns un-numbered paragraphs, this adds them.
 */
function enforceSubNumbering(sectionKey: string, text: string): string {
  // Extract section number from key (e.g. "section_5_description" → 5)
  const match = sectionKey.match(/section_(\d+)/);
  if (!match) return text;
  const sectionNum = parseInt(match[1], 10);

  // Split into paragraphs (double newline separated)
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return text;

  // Check if first paragraph already has sub-numbering
  const subNumPattern = new RegExp(`^${sectionNum}\\.\\d+\\.?\\s`);
  const alreadyNumbered = paragraphs.some(p => subNumPattern.test(p));
  if (alreadyNumbered) return text;

  // Add sub-numbers
  return paragraphs.map((p, i) => {
    // Don't number if it's already numbered with any pattern like "X.Y."
    if (/^\d+\.\d+\.?\s/.test(p)) return p;
    return `${sectionNum}.${i + 1}. ${p}`;
  }).join('\n\n');
}

// --- Main Generator ---

export async function generateReportSections(data: {
  reportType: ReportType;
  propertyDetails: PropertyDetails;
  inspectionData: InspectionData | null;
  epcData: EPCData | null;
  googleMapsData: GoogleMapsData | null;
  comparables: Comparable[];
  clientDetails: ClientDetails;
  structuredNotes?: StructuredInspectionNotes | null;
  photoAnalysis?: { label: string; analysis: string }[];
  measuredFloorArea?: number;
}): Promise<Record<string, string>> {
  const {
    reportType,
    propertyDetails,
    inspectionData,
    epcData,
    googleMapsData,
    comparables,
    structuredNotes = null,
    photoAnalysis = [],
    measuredFloorArea,
  } = data;

  // Determine if AI should generate accommodation (when rooms not manually provided)
  const needsAIAccommodation = !propertyDetails.groundFloorRooms && !propertyDetails.firstFloorRooms;

  // Build template sections (no AI needed)
  const templateSections: Record<string, string> = {
    section_9_services: generateSection9Services(propertyDetails),
    section_10_floor_area: generateSection10FloorArea(propertyDetails, reportType, measuredFloorArea),
    section_11_tenure: generateSection11Tenure(propertyDetails),
    section_12_roads: generateSection12Roads(propertyDetails),
  };

  // If rooms were manually provided, use the template version
  if (!needsAIAccommodation) {
    templateSections.section_7_accommodation = generateSection7Accommodation(propertyDetails);
  }

  // Build fallback sections in case AI fails
  const fallbackSections: Record<string, string> = {
    section_5_description: fallbackSection5(propertyDetails),
    section_6_construction: fallbackSection6(propertyDetails, epcData),
    section_8_externally: fallbackSection8(propertyDetails),
    section_13_condition: fallbackSection13(propertyDetails, inspectionData, reportType),
    section_14_structure: fallbackSection14(inspectionData, reportType),
    section_15_amenity: fallbackSection15(propertyDetails, googleMapsData),
  };

  // Add accommodation fallback for AI-generated version
  if (needsAIAccommodation) {
    fallbackSections.section_7_accommodation = fallbackAccommodation(propertyDetails, epcData);
  }

  // Attempt AI generation for the complex sections
  let aiSections: Record<string, string> = {};

  try {
    const client = getClient();
    const userPrompt = buildUserPrompt({
      reportType,
      propertyDetails,
      inspectionData,
      epcData,
      googleMapsData,
      comparables,
      structuredNotes,
      photoAnalysis,
    });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      const rawText = textBlock.text.trim();
      // Strip markdown code fences if present
      const jsonText = rawText
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '');
      aiSections = JSON.parse(jsonText);
    }
  } catch (error) {
    console.error('[ai-generator] Claude API call failed, using fallback text:', error);
    // aiSections remains empty — fallbacks will be used
  }

  // Enforce sub-numbering on AI sections
  for (const key of Object.keys(aiSections)) {
    if (aiSections[key] && typeof aiSections[key] === 'string') {
      aiSections[key] = enforceSubNumbering(key, aiSections[key]);
    }
  }

  // Merge: AI sections take precedence over fallbacks, templates are always used
  const AI_SECTION_KEYS = [
    'section_5_description',
    'section_6_construction',
    ...(needsAIAccommodation ? ['section_7_accommodation'] : []),
    'section_8_externally',
    'section_13_condition',
    'section_14_structure',
    'section_15_amenity',
  ];

  const result: Record<string, string> = { ...templateSections };

  for (const key of AI_SECTION_KEYS) {
    const aiText = aiSections[key];
    const isAI = aiText && typeof aiText === 'string';
    result[key] = isAI ? aiText : fallbackSections[key];
    // Track source for UI display
    result[key + '_source'] = isAI ? 'ai' : 'fallback';
  }

  return result;
}

// --- Comparable Description Enhancer ---

export async function generateComparableDescriptions(
  comparables: Comparable[]
): Promise<Comparable[]> {
  if (comparables.length === 0) {
    return comparables;
  }

  try {
    const client = getClient();

    const comparableData = comparables.map((c, i) => ({
      index: i,
      address: c.address,
      propertyType: c.propertyType,
      bedrooms: c.bedrooms,
      salePrice: c.salePrice,
      floorArea: c.floorArea,
      floorAreaSource: c.floorAreaSource,
      epcRating: c.epcRating,
      currentDescription: c.description,
      status: c.status,
      condition: c.condition,
      parking: c.parking,
      garden: c.garden,
      tenure: c.tenure,
    }));

    const userPrompt = `You are writing comparable property descriptions for a RICS valuation report. Each description should be a concise factual summary. Match this exact style from real CoreProp reports:

"253m2 (agent floorplan) \n3 bedroom s/c fifth floor penthouse flat in modern order throughout. Purpose-built mansion block. Direct lift access. Share of Freehold. Highly comparable."
"233m2 (agent floorplan) \n5 bedroom s/c third floor penthouse flat in fair / dated order throughout. Purpose-built block. Leasehold. £28,000 per annum service charge."
"187m2 (agent floorplan) \n3 bedroom s/c fourth floor flat in basic order. Direct lift access and porterage. Leasehold, 958 years remaining."

RULES:
- Floor area and source (EPC or agent floorplan) comes first on its own line, e.g. "215m² (EPC)"
- Then: [bedrooms]-bedroom s/c [type] description
- Use "s/c" for self-contained
- Include tenure (Freehold/Leasehold) and remaining lease years if known
- Include built form if known (Purpose-built block, Period conversion, etc.)
- Include notable features: lift access, parking, concierge, garden
- NEVER say "Condition not assessed" or "Bedroom count not recorded" or "No further details available" — if you don't know something, just leave it out
- End with "Similar style." if the property type is comparable
- Keep descriptions factual and concise (2-4 lines max)

Here are the comparables to describe:

${JSON.stringify(comparableData, null, 2)}

Return a JSON object where the key is the index (as a string) and the value is the enhanced description. Return ONLY the JSON object.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      const rawText = textBlock.text.trim();
      const jsonText = rawText
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '');
      const descriptions: Record<string, string> = JSON.parse(jsonText);

      return comparables.map((c, i) => ({
        ...c,
        description: descriptions[String(i)] || c.description,
      }));
    }
  } catch (error) {
    console.error('[ai-generator] Failed to enhance comparable descriptions:', error);
  }

  // Return originals if AI fails
  return comparables;
}
