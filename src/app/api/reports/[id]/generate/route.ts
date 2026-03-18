// Vercel serverless: allow up to 120s for AI generation + data fetching
export const maxDuration = 120;

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchEPCByAddress } from '@/lib/epc';
import { fetchGoogleMapsData } from '@/lib/google-maps';
import { findComparables } from '@/lib/comparable-engine';
import { generateReportSections, generateComparableDescriptions } from '@/lib/ai-generator';
import { getReportTemplate, fillTemplate } from '@/lib/report-templates';
import { fetchAllDataSources } from '@/lib/data-sources';
import { parseRoomMeasurements } from '@/lib/floor-area-parser';
import type {
  ReportRow,
  EPCData,
  GoogleMapsData,
  Comparable,
  PropertyDetails,
  UserSettings,
  ReportType,
  StructuredInspectionNotes,
  AuctionComparable,
  HistoricalValuation,
} from '@/lib/types';
import { isAuctionType, isIHTType } from '@/lib/types';
import { parseEPCDescriptions, parseWindowType, parseHeatingSystem } from '@/lib/epc-parser';
import { checkFloodRisk, formatFloodRiskNote } from '@/lib/flood-risk';
import type { FloodRiskData } from '@/lib/flood-risk';

// POST /api/reports/[id]/generate
// Runs the full data-fetching + AI generation pipeline for a report.
// Each step stores partial results so nothing is lost if a later step fails.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Load the report
  const { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !report) {
    return NextResponse.json(
      { error: 'Report not found' },
      { status: 404 }
    );
  }

  const reportRow = report as ReportRow;
  const fullAddress = `${reportRow.property_address}, ${reportRow.postcode}`;

  // Load user settings for template generation
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const settings: UserSettings | null = settingsRow
    ? {
        id: settingsRow.id,
        userId: settingsRow.user_id,
        marketCommentaryIht: settingsRow.market_commentary_iht,
        marketCommentaryNonIht: settingsRow.market_commentary_non_iht,
        firmName: settingsRow.firm_name,
        signatoryName: settingsRow.signatory_name,
        signatoryTitleIht: settingsRow.signatory_title_iht,
        signatoryTitleOther: settingsRow.signatory_title_other,
        firmRicsNumber: settingsRow.firm_rics_number,
        firmEmail: settingsRow.firm_email,
        firmPhone: settingsRow.firm_phone,
        termsAndConditions: settingsRow.terms_and_conditions || '',
      }
    : null;

  // Load structured inspection notes (if any)
  const { data: inspectionNotesRow } = await supabase
    .from('inspection_notes')
    .select('*')
    .eq('report_id', id)
    .single();

  const structuredNotes: StructuredInspectionNotes | null = inspectionNotesRow
    ? {
        inspectionDate: inspectionNotesRow.inspection_date || '',
        inspectorInitials: inspectionNotesRow.inspector_initials || '',
        timeOfDay: inspectionNotesRow.time_of_day || 'morning',
        weatherConditions: inspectionNotesRow.weather_conditions || '',
        descriptionNotes: inspectionNotesRow.description_notes || '',
        constructionNotes: inspectionNotesRow.construction_notes || '',
        amenitiesNotes: inspectionNotesRow.amenities_notes || '',
        layoutNotes: inspectionNotesRow.layout_notes || '',
        heatingNotes: inspectionNotesRow.heating_notes || '',
        windowsNotes: inspectionNotesRow.windows_notes || '',
        gardenNotes: inspectionNotesRow.garden_notes || '',
        sizingNotes: inspectionNotesRow.sizing_notes || '',
        conditionNotes: inspectionNotesRow.condition_notes || '',
        extraNotes: inspectionNotesRow.extra_notes || '',
      }
    : null;

  // Load report photos with any analysis data
  const { data: reportPhotos } = await supabase
    .from('report_photos')
    .select('label, analysis')
    .eq('report_id', id)
    .order('sort_order', { ascending: true });

  const photoAnalysis: { label: string; analysis: string }[] = (reportPhotos || [])
    .filter((p: { label: string; analysis?: string | null }) => p.analysis)
    .map((p: { label: string; analysis?: string | null }) => ({
      label: p.label,
      analysis: p.analysis!,
    }));

  // Track what succeeded and what failed
  const pipeline: Record<string, 'pending' | 'success' | 'failed'> = {
    epc: 'pending',
    google_maps: 'pending',
    flood_risk: 'pending',
    data_sources: 'pending',
    comparables: 'pending',
    ai_sections: 'pending',
  };

  // Helper to save partial results to DB
  async function savePartial(updates: Record<string, unknown>) {
    await supabase
      .from('reports')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user!.id);
  }

  // -------------------------------------------------------
  // Step 1 & 2: EPC + Google Maps (parallel)
  // -------------------------------------------------------
  let epcData: EPCData | null = reportRow.epc_data;
  let googleMapsData: GoogleMapsData | null = reportRow.google_maps_data;

  const [epcResult, mapsResult] = await Promise.allSettled([
    searchEPCByAddress(reportRow.property_address, reportRow.postcode),
    fetchGoogleMapsData(fullAddress),
  ]);

  // Process EPC result
  if (epcResult.status === 'fulfilled' && epcResult.value) {
    epcData = epcResult.value;
    pipeline.epc = 'success';

    // Auto-populate property_details from EPC
    const existingDetails = (reportRow.property_details || {}) as Partial<PropertyDetails>;
    const autoDetails: Partial<PropertyDetails> = {
      ...existingDetails,
      floorArea: existingDetails.floorArea || epcData.floorArea,
      epcRating: existingDetails.epcRating || epcData.currentEnergyRating,
      constructionEra: existingDetails.constructionEra || epcData.constructionAgeBand,
    };

    // Map EPC property type to our PropertyType
    if (!existingDetails.propertyType) {
      const epcType = epcData.propertyType?.toLowerCase() || '';
      const epcForm = epcData.builtForm?.toLowerCase() || '';
      if (epcType.includes('flat') || epcType.includes('maisonette')) {
        autoDetails.propertyType = epcType.includes('maisonette') ? 'maisonette' : 'flat';
      } else if (epcType.includes('bungalow')) {
        autoDetails.propertyType = 'bungalow';
      } else if (epcForm.includes('detached') && !epcForm.includes('semi')) {
        autoDetails.propertyType = 'detached_house';
      } else if (epcForm.includes('semi')) {
        autoDetails.propertyType = 'semi_detached_house';
      } else if (epcForm.includes('terrace') || epcForm.includes('mid-terrace')) {
        autoDetails.propertyType = 'terraced_house';
      } else if (epcForm.includes('end-terrace')) {
        autoDetails.propertyType = 'end_terrace_house';
      }
    }

    // Set tenure from EPC if not already set
    if (!existingDetails.tenure && epcData.tenure) {
      const epcTenure = epcData.tenure.toLowerCase();
      if (epcTenure.includes('freehold')) {
        autoDetails.tenure = 'freehold';
      } else if (epcTenure.includes('leasehold')) {
        autoDetails.tenure = 'leasehold';
      }
    }

    // Parse EPC description strings into structured fields
    const parsedFromEPC = parseEPCDescriptions(epcData);
    if (!existingDetails.brickType && parsedFromEPC.brickType) {
      autoDetails.brickType = parsedFromEPC.brickType;
    }
    if (!existingDetails.roofType && parsedFromEPC.roofType) {
      autoDetails.roofType = parsedFromEPC.roofType;
    }
    if (!existingDetails.subFlooring && parsedFromEPC.subFlooring) {
      autoDetails.subFlooring = parsedFromEPC.subFlooring;
    }
    if (!existingDetails.storeys && parsedFromEPC.storeys) {
      autoDetails.storeys = parsedFromEPC.storeys;
    }

    // Default services (most UK residential properties have these)
    if (autoDetails.hasWater === undefined) autoDetails.hasWater = true;
    if (autoDetails.hasElectricity === undefined) autoDetails.hasElectricity = true;
    if (autoDetails.hasDrainage === undefined) autoDetails.hasDrainage = true;
    if (autoDetails.hasGas === undefined) {
      autoDetails.hasGas = parsedFromEPC.hasGas ?? true;
    }

    await savePartial({
      epc_data: epcData,
      property_details: autoDetails,
    });
  } else {
    pipeline.epc = 'failed';
    console.error('[generate] EPC fetch failed:', epcResult.status === 'rejected' ? epcResult.reason : 'No data');
  }

  // Process Google Maps result
  if (mapsResult.status === 'fulfilled' && mapsResult.value) {
    googleMapsData = mapsResult.value;
    pipeline.google_maps = 'success';

    const updates: Record<string, unknown> = {
      google_maps_data: googleMapsData,
    };

    // Extract local authority and postal district
    if (googleMapsData.localAuthority) {
      updates.local_authority = googleMapsData.localAuthority;
    }

    // Derive postal district from postcode (e.g., "TN2 4TT" → "TN2")
    const postalDistrict = reportRow.postcode.trim().toUpperCase().split(/\s+/)[0];
    if (postalDistrict) {
      updates.postal_district = postalDistrict;
    }

    await savePartial(updates);
  } else {
    pipeline.google_maps = 'failed';
    console.error('[generate] Google Maps fetch failed:', mapsResult.status === 'rejected' ? mapsResult.reason : 'No data');
  }

  // -------------------------------------------------------
  // Step 2.5: Flood Risk (needs lat/lng from Google Maps)
  // -------------------------------------------------------
  let floodRiskData: FloodRiskData | null = null;

  if (googleMapsData && googleMapsData.lat && googleMapsData.lng) {
    try {
      floodRiskData = await checkFloodRisk({
        lat: googleMapsData.lat,
        lng: googleMapsData.lng,
        postcode: reportRow.postcode,
      });
      pipeline.flood_risk = 'success';
      try {
        await savePartial({ flood_risk_data: floodRiskData });
      } catch {
        console.warn('[generate] flood_risk_data column may not exist, skipping save');
      }
    } catch (error) {
      pipeline.flood_risk = 'failed';
      console.error('[generate] Flood risk check failed:', error);
    }
  } else {
    pipeline.flood_risk = 'failed';
    console.error('[generate] Flood risk skipped: no lat/lng available');
  }

  // -------------------------------------------------------
  // Step 2.7: Conservation Area + Listed Buildings (parallel)
  // -------------------------------------------------------
  if (googleMapsData && googleMapsData.lat && googleMapsData.lng) {
    try {
      const dataSources = await fetchAllDataSources({
        lat: googleMapsData.lat,
        lng: googleMapsData.lng,
        postcode: reportRow.postcode,
      });
      pipeline.data_sources = 'success';

      const dsUpdates: Record<string, unknown> = {};
      if (dataSources.conservationArea.isConservationArea) {
        dsUpdates.conservation_area = true;
      } else {
        dsUpdates.conservation_area = false;
      }
      if (dataSources.listedBuilding.isListed) {
        dsUpdates.listed_building_grade = dataSources.listedBuilding.grade;
      }

      if (Object.keys(dsUpdates).length > 0) {
        try {
          await savePartial(dsUpdates);
        } catch {
          console.warn('[generate] conservation_area/listed_building columns may not exist, skipping save');
        }
      }

      console.log(`[generate] Data sources: conservation=${dataSources.conservationArea.isConservationArea}, listed=${dataSources.listedBuilding.isListed ? dataSources.listedBuilding.grade : 'no'}`);
    } catch (error) {
      pipeline.data_sources = 'failed';
      console.error('[generate] Data sources check failed:', error);
    }
  } else {
    pipeline.data_sources = 'failed';
    console.error('[generate] Data sources skipped: no lat/lng available');
  }

  // -------------------------------------------------------
  // Step 2.8: Load auction comparables + historical valuations from DB
  // -------------------------------------------------------
  let auctionComps: AuctionComparable[] = [];
  let historicalVals: HistoricalValuation[] = [];

  // Load auction comps and historical valuations (tables may not exist if migration not run)
  try {
    const postcodeDistrict = reportRow.postcode.trim().toUpperCase().split(/\s+/)[0];
    const { data: auctionRows } = await supabase
      .from('auction_comparables')
      .select('*')
      .ilike('postcode', `${postcodeDistrict}%`)
      .order('sale_date', { ascending: false })
      .limit(30);

    if (auctionRows && auctionRows.length > 0) {
      auctionComps = auctionRows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        source: r.source as AuctionComparable['source'],
        address: r.address as string,
        postcode: r.postcode as string,
        salePrice: r.sale_price as number | null,
        saleDate: r.sale_date as string | null,
        propertyType: r.property_type as string | null,
        lotNumber: r.lot_number as string | null,
        auctionDate: r.auction_date as string | null,
        bedrooms: r.bedrooms as number | null,
        description: (r.description as string) || '',
        imageUrl: r.image_url as string | null,
        url: (r.url as string) || '',
        lat: r.lat as number | null,
        lng: r.lng as number | null,
      }));
      console.log(`[generate] Loaded ${auctionComps.length} auction comparables for district ${postcodeDistrict}`);
    }
  } catch {
    // Table may not exist if v2 migration not run — silently skip
    console.warn('[generate] auction_comparables table not available, skipping');
  }

  try {
    const postcodeDistrict = reportRow.postcode.trim().toUpperCase().split(/\s+/)[0];
    const { data: histRows } = await supabase
      .from('historical_valuations')
      .select('*')
      .eq('user_id', user.id)
      .ilike('postcode', `${postcodeDistrict}%`)
      .order('valuation_date', { ascending: false })
      .limit(20);

    if (histRows && histRows.length > 0) {
      historicalVals = histRows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        userId: r.user_id as string,
        propertyAddress: r.property_address as string,
        postcode: r.postcode as string,
        valuationFigure: r.valuation_figure as number | null,
        valuationDate: r.valuation_date as string | null,
        reportType: r.report_type as string | null,
        propertyType: r.property_type as string | null,
        floorArea: r.floor_area as number | null,
        bedrooms: r.bedrooms as number | null,
        notes: (r.notes as string) || '',
        storagePath: r.storage_path as string | null,
        lat: r.lat as number | null,
        lng: r.lng as number | null,
        createdAt: r.created_at as string,
      }));
      console.log(`[generate] Loaded ${historicalVals.length} historical valuations for district ${postcodeDistrict}`);
    }
  } catch {
    // Table may not exist if v2 migration not run — silently skip
    console.warn('[generate] historical_valuations table not available, skipping');
  }

  // -------------------------------------------------------
  // Step 3: Comparables (needs EPC data for floor area + property type)
  // -------------------------------------------------------
  // Re-read property_details after EPC auto-population
  const { data: updatedReport } = await supabase
    .from('reports')
    .select('property_details')
    .eq('id', id)
    .single();

  const propertyDetails = (updatedReport?.property_details || {}) as Partial<PropertyDetails>;
  const subjectFloorArea = propertyDetails.floorArea || epcData?.floorArea || 0;
  const subjectPropertyType = mapPropertyTypeToLRCode(propertyDetails.propertyType, epcData);

  let comparables: Comparable[] = reportRow.comparables || [];

  try {
    comparables = await findComparables({
      subjectAddress: reportRow.property_address,
      subjectPostcode: reportRow.postcode,
      subjectFloorArea,
      subjectPropertyType,
      subjectLat: googleMapsData?.lat,
      subjectLng: googleMapsData?.lng,
      auctionComps,
      historicalVals,
    });
    pipeline.comparables = 'success';

    // Enrich comparable descriptions with AI
    try {
      comparables = await generateComparableDescriptions(comparables);
    } catch (err) {
      console.error('[generate] Comparable description enrichment failed (non-blocking):', err);
    }

    // Calculate suggested valuation from selected comps
    const selectedComps = comparables.filter((c) => c.isSelected);
    let suggestedValuation: number | null = null;

    if (selectedComps.length > 0 && subjectFloorArea > 0) {
      // Use comps with floor area for £/m² calculation
      const compsWithArea = selectedComps.filter((c) => c.pricePerSqm && c.pricePerSqm > 0);
      if (compsWithArea.length > 0) {
        const avgPricePerSqm =
          compsWithArea.reduce((sum, c) => sum + (c.pricePerSqm || 0), 0) / compsWithArea.length;
        suggestedValuation = Math.round(avgPricePerSqm * subjectFloorArea / 1000) * 1000;
      }
    }

    // Fallback: use average comp sale price if we couldn't calculate from £/m²
    if (!suggestedValuation && selectedComps.length > 0) {
      const avgPrice =
        selectedComps.reduce((sum, c) => sum + c.salePrice, 0) / selectedComps.length;
      suggestedValuation = Math.round(avgPrice / 5000) * 5000;
    }

    const compUpdates: Record<string, unknown> = { comparables };
    if (suggestedValuation) {
      compUpdates.valuation_figure = suggestedValuation;
      compUpdates.valuation_figure_words = numberToWords(suggestedValuation);
    }

    await savePartial(compUpdates);
  } catch (error) {
    pipeline.comparables = 'failed';
    console.error('[generate] Comparables fetch failed:', error);
  }

  // -------------------------------------------------------
  // Step 4: AI Section Generation
  // -------------------------------------------------------
  // Re-read the full report with all accumulated data
  const { data: fullReport } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .single();

  const currentRow = (fullReport || reportRow) as ReportRow;
  const currentDetails = (currentRow.property_details || {}) as Partial<PropertyDetails>;

  // Build a complete PropertyDetails with sensible defaults
  const fullPropertyDetails: PropertyDetails = {
    propertyType: currentDetails.propertyType || 'other',
    storeys: currentDetails.storeys || 2,
    constructionEra: currentDetails.constructionEra || epcData?.constructionAgeBand || 'unknown',
    brickType: currentDetails.brickType || 'brickwork',
    roofType: currentDetails.roofType || epcData?.roofDescription || 'pitched roof',
    subFlooring: currentDetails.subFlooring || 'assumed timber',
    areaCharacter: currentDetails.areaCharacter || 'a residential area',
    locationNotes: currentDetails.locationNotes || '',
    groundFloorRooms: currentDetails.groundFloorRooms || '',
    firstFloorRooms: currentDetails.firstFloorRooms || '',
    secondFloorRooms: currentDetails.secondFloorRooms || '',
    frontDescription: currentDetails.frontDescription || '',
    parkingDescription: currentDetails.parkingDescription || '',
    garageType: currentDetails.garageType || 'none',
    rearGardenDescription: currentDetails.rearGardenDescription || '',
    hasWater: currentDetails.hasWater ?? true,
    hasGas: currentDetails.hasGas ?? true,
    hasElectricity: currentDetails.hasElectricity ?? true,
    hasDrainage: currentDetails.hasDrainage ?? true,
    epcRating: currentDetails.epcRating || epcData?.currentEnergyRating || '',
    floorArea: currentDetails.floorArea || subjectFloorArea || 0,
    floorAreaBasis: currentDetails.floorAreaBasis || 'Gross Internal Area',
    tenure: currentDetails.tenure || 'freehold',
    freeholdSubType: currentDetails.freeholdSubType || 'standard',
    leaseholdSubType: currentDetails.leaseholdSubType || 'long_leasehold',
    leaseholdDetails: currentDetails.leaseholdDetails || {
      originalTerm: null,
      remainingTerm: null,
      leaseStartYear: '',
      groundRent: null,
      groundRentReview: '',
      serviceCharge: null,
    },
    tenureNotes: currentDetails.tenureNotes || '',
    roadName: currentDetails.roadName || extractRoadName(reportRow.property_address),
    roadAdopted: currentDetails.roadAdopted ?? true,
  };

  try {
    const clientDetails = (currentRow.client_details || {}) as {
      clientName?: string;
      referenceNumber?: string;
      valuationDate?: string;
      deceasedName?: string;
      dateOfDeath?: string;
      auctionCompany?: string;
    };

    // Parse room measurements from sizing notes to calculate floor area
    let measuredFloorArea: number | undefined;
    if (structuredNotes?.sizingNotes) {
      const { totalArea, measurementCount } = parseRoomMeasurements(structuredNotes.sizingNotes);
      if (measurementCount > 0 && totalArea > 0) {
        measuredFloorArea = totalArea;
      }
    }

    const aiSections = await generateReportSections({
      reportType: currentRow.report_type,
      propertyDetails: fullPropertyDetails,
      inspectionData: currentRow.inspection_data as Parameters<typeof generateReportSections>[0]['inspectionData'],
      epcData: epcData,
      googleMapsData: googleMapsData,
      comparables: comparables,
      clientDetails: {
        referenceNumber: clientDetails.referenceNumber || currentRow.reference_number || '',
        clientName: clientDetails.clientName || '',
        deceasedName: clientDetails.deceasedName || '',
        dateOfDeath: clientDetails.dateOfDeath || '',
        valuationDate: clientDetails.valuationDate || new Date().toISOString().split('T')[0],
        auctionCompany: clientDetails.auctionCompany || '',
      },
      structuredNotes,
      photoAnalysis,
      measuredFloorArea,
    });

    // Get template sections (boilerplate text)
    const hasTitleNumber = !!(currentRow.land_registry_title && currentRow.land_registry_title.trim());
    const template = getReportTemplate(currentRow.report_type, settings, { hasTitleNumber });

    // Build template variables for placeholder replacement
    const cd = clientDetails;
    const templateVars: Record<string, string> = {
      CLIENT_NAME: cd.clientName || '[Client Name]',
      VALUATION_DATE: formatDate(cd.valuationDate || ''),
      REFERENCE_NUMBER: cd.referenceNumber || currentRow.reference_number || (structuredNotes?.inspectorInitials ? `${structuredNotes.inspectorInitials}/${reportRow.postcode.replace(/\s+/g, '')}` : ''),
      DECEASED_NAME: cd.deceasedName || '[Deceased Name]',
      DATE_OF_DEATH: formatDate(cd.dateOfDeath || ''),
      AUCTION_COMPANY: cd.auctionCompany || '[Auction Company]',
      LAND_REGISTRY_TITLE: hasTitleNumber ? currentRow.land_registry_title : '',
      TENURE_TYPE: fullPropertyDetails.tenure === 'freehold' ? 'Freehold' : 'Leasehold',
      TENURE_TYPE_LOWER: fullPropertyDetails.tenure === 'freehold' ? 'freehold' : 'leasehold',
      LOCAL_AUTHORITY: currentRow.local_authority || googleMapsData?.localAuthority || '[Local Authority]',
      POSTAL_DISTRICT: currentRow.postal_district || reportRow.postcode.split(/\s+/)[0] || '[Postal District]',
      INSPECTION_DATE: formatDate(structuredNotes?.inspectionDate || cd.valuationDate || ''),
      INSPECTION_TIME_OF_DAY: structuredNotes?.timeOfDay || 'morning',
      WEATHER_CONDITIONS: structuredNotes?.weatherConditions || 'dry and clear',
      VALUATION_FIGURE: currentRow.valuation_figure?.toLocaleString('en-GB') || '[Figure]',
      VALUATION_WORDS: currentRow.valuation_figure_words || '[Amount in Words]',
      AUCTION_RESERVE: currentRow.auction_reserve?.toLocaleString('en-GB') || '[Reserve]',
      AUCTION_RESERVE_WORDS: currentRow.auction_reserve_words || '[Reserve in Words]',
      AUCTION_MONTH_YEAR: formatMonthYear(cd.valuationDate || ''),
    };

    // Append data source notes to assumptions if available
    let assumptionsText = fillTemplate(template.assumptionsAndSources, templateVars);
    // Find the highest existing 3.1.X number in the assumptions text
    const existingNums = [...assumptionsText.matchAll(/3\.1\.(\d+)\./g)].map(m => parseInt(m[1]));
    let noteNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 10;

    if (floodRiskData) {
      const floodNote = formatFloodRiskNote(floodRiskData);
      assumptionsText += `\n\n3.1.${noteNum}. Flood Risk - ${floodNote}`;
      noteNum++;
    }

    // Re-read report for conservation/listed data (columns may not exist if migration not run)
    try {
      const { data: dsReport } = await supabase
        .from('reports')
        .select('conservation_area, listed_building_grade')
        .eq('id', id)
        .single();

      if (dsReport?.conservation_area) {
        assumptionsText += `\n\n3.1.${noteNum}. Conservation Area - The property is located within a designated Conservation Area. This may restrict permitted development rights and alterations to the external appearance of the property.`;
        noteNum++;
      }

      if (dsReport?.listed_building_grade) {
        assumptionsText += `\n\n3.1.${noteNum}. Listed Building - The property is a Grade ${dsReport.listed_building_grade} Listed Building. Listed Building Consent would be required for any works that affect the character or appearance of the building, both internally and externally.`;
        noteNum++;
      }
    } catch {
      console.warn('[generate] conservation_area/listed_building columns not available, skipping');
    }

    // Fill template placeholders
    const filledTemplate = {
      section_1_instructions: fillTemplate(template.instructions, templateVars),
      section_2_basis: fillTemplate(template.basisOfValuation, templateVars),
      section_3_assumptions: assumptionsText,
      section_4_inspection: fillTemplate(template.inspection, templateVars),
      section_16_comparables_intro: fillTemplate(template.comparableDataIntro, templateVars),
      section_17_market_commentary: template.marketCommentary,
      section_18_valuation: fillTemplate(template.valuationConclusion, templateVars),
      section_19_auction_reserve: template.auctionReserveSection
        ? fillTemplate(template.auctionReserveSection, templateVars)
        : null,
      signature_block: template.signatureBlock,
      appendix_1: template.appendix1,
    };

    // Merge AI sections + template sections
    const allSections: Record<string, string> = {};

    // Template sections (1-4)
    allSections.section_1_instructions = filledTemplate.section_1_instructions;
    allSections.section_2_basis = filledTemplate.section_2_basis;
    allSections.section_3_assumptions = filledTemplate.section_3_assumptions;
    allSections.section_4_inspection = filledTemplate.section_4_inspection;

    // AI-generated sections (5-15)
    for (const [key, value] of Object.entries(aiSections)) {
      allSections[key] = value;
    }

    // Template sections (16+)
    allSections.section_16_comparables_intro = filledTemplate.section_16_comparables_intro;
    allSections.section_17_market_commentary = filledTemplate.section_17_market_commentary;
    allSections.section_18_valuation = filledTemplate.section_18_valuation;
    if (filledTemplate.section_19_auction_reserve) {
      allSections.section_19_auction_reserve = filledTemplate.section_19_auction_reserve;
    }
    allSections.signature_block = filledTemplate.signature_block;
    allSections.appendix_1 = filledTemplate.appendix_1;

    pipeline.ai_sections = 'success';

    await savePartial({
      generated_sections: allSections,
      property_details: fullPropertyDetails,
      status: 'review',
    });
  } catch (error) {
    pipeline.ai_sections = 'failed';
    console.error('[generate] AI section generation failed:', error);
  }

  // -------------------------------------------------------
  // Return pipeline status
  // -------------------------------------------------------
  const allSucceeded = Object.values(pipeline).every((s) => s === 'success');

  return NextResponse.json({
    success: allSucceeded,
    pipeline,
    report_id: id,
  });
}

// --- Helpers ---

function mapPropertyTypeToLRCode(
  propertyType: string | undefined,
  epcData: EPCData | null
): string {
  // Map our PropertyType to Land Registry single-char code
  switch (propertyType) {
    case 'detached_house':
    case 'bungalow':
      return 'D';
    case 'semi_detached_house':
      return 'S';
    case 'terraced_house':
    case 'end_terrace_house':
      return 'T';
    case 'flat':
    case 'maisonette':
      return 'F';
    default:
      break;
  }

  // Fallback: try EPC data
  if (epcData) {
    const form = epcData.builtForm?.toLowerCase() || '';
    if (form.includes('detached') && !form.includes('semi')) return 'D';
    if (form.includes('semi')) return 'S';
    if (form.includes('terrace')) return 'T';
    if (form.includes('flat') || form.includes('maisonette')) return 'F';
  }

  return 'D'; // default
}

function extractRoadName(address: string): string {
  const roadPattern = /\b(road|street|lane|drive|avenue|close|way|place|crescent|gardens|terrace|court|hill|grove|park|rise|mews|square|walk)\b/i;
  const parts = address.split(',');

  // Try each part until we find one that looks like a road name
  for (const part of parts) {
    const cleaned = part.trim()
      .replace(/^(flat|apartment|unit|room)\s+\d+\w?\s*/i, '')
      .replace(/^\d+[a-z]?\s*/i, '')
      .trim();
    if (cleaned && roadPattern.test(cleaned)) {
      return cleaned;
    }
  }

  // Fallback: strip flat prefix and house number from first part
  const firstPart = (parts[0] ?? '').trim();
  return firstPart
    .replace(/^(flat|apartment|unit)\s+\d+\w?,?\s*/i, '')
    .replace(/^\d+[a-z]?\s*/i, '')
    .trim() || firstPart;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '[Date]';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatMonthYear(dateStr: string): string {
  if (!dateStr) return '[Month Year]';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function numberToWords(n: number): string {
  if (n < 0) return 'Negative ' + numberToWords(-n);
  if (n === 0) return 'Zero Pounds';
  if (n >= 1_000_000_000) return 'Over One Billion Pounds';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function chunk(num: number): string {
    if (num === 0) return '';
    if (num < 20) return ones[num];
    if (num < 100) {
      const remainder = num % 10;
      return tens[Math.floor(num / 10)] + (remainder ? ' ' + ones[remainder] : '');
    }
    if (num < 1000) {
      const remainder = num % 100;
      return ones[Math.floor(num / 100)] + ' Hundred' + (remainder ? ' and ' + chunk(remainder) : '');
    }
    return '';
  }

  const parts: string[] = [];

  if (n >= 1_000_000) {
    const millions = Math.floor(n / 1_000_000);
    parts.push(chunk(millions) + ' Million');
    n %= 1_000_000;
  }

  if (n >= 1_000) {
    const thousands = Math.floor(n / 1_000);
    parts.push(chunk(thousands) + ' Thousand');
    n %= 1_000;
  }

  if (n > 0) {
    // Add "and" before the final part if there were larger parts
    const prefix = parts.length > 0 && n < 100 ? 'and ' : '';
    parts.push(prefix + chunk(n));
  }

  return parts.join(' ') + ' Pounds';
}
