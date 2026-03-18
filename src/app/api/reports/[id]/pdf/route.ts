// Vercel serverless: allow up to 120s for PDF generation (3 Puppeteer renders + merge)
export const maxDuration = 120;

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generatePDF, type GeneratePDFInput } from '@/lib/pdf-generator';
import { syncReportFile } from '@/lib/google-drive';
import { getDirectStreetViewUrl, getDirectSatelliteUrl, getDirectLocationMapUrl } from '@/lib/google-maps';
import { getReportTemplate } from '@/lib/report-templates';
import type { ReportPhoto } from '@/lib/pdf-template';
import type {
  ReportRow,
  PropertyDetails,
  ClientDetails,
  GoogleMapsData,
  UserSettings,
  Comparable,
} from '@/lib/types';

// POST /api/reports/[id]/pdf
// Generates a PDF from the stored report data and returns the binary.
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

  // Load report
  const { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const row = report as ReportRow;

  if (!row.valuation_figure) {
    return NextResponse.json(
      { error: 'Please enter a valuation figure before generating the PDF.' },
      { status: 400 }
    );
  }

  // Load user settings
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

  // Build template
  const template = getReportTemplate(row.report_type, settings);

  // Build property details with defaults
  const details = (row.property_details || {}) as Partial<PropertyDetails>;
  const fullDetails: PropertyDetails = {
    propertyType: details.propertyType || 'other',
    storeys: details.storeys || 2,
    constructionEra: details.constructionEra || '',
    brickType: details.brickType || 'brickwork',
    roofType: details.roofType || 'pitched roof',
    subFlooring: details.subFlooring || 'timber',
    areaCharacter: details.areaCharacter || 'a residential area',
    locationNotes: details.locationNotes || '',
    groundFloorRooms: details.groundFloorRooms || '',
    firstFloorRooms: details.firstFloorRooms || '',
    secondFloorRooms: details.secondFloorRooms || '',
    frontDescription: details.frontDescription || '',
    parkingDescription: details.parkingDescription || '',
    garageType: details.garageType || 'none',
    rearGardenDescription: details.rearGardenDescription || '',
    hasWater: details.hasWater ?? true,
    hasGas: details.hasGas ?? true,
    hasElectricity: details.hasElectricity ?? true,
    hasDrainage: details.hasDrainage ?? true,
    epcRating: details.epcRating || '',
    floorArea: details.floorArea || 0,
    floorAreaBasis: details.floorAreaBasis || 'Gross Internal Area',
    tenure: details.tenure || 'freehold',
    freeholdSubType: details.freeholdSubType || 'standard',
    leaseholdSubType: details.leaseholdSubType || 'long_leasehold',
    leaseholdDetails: details.leaseholdDetails || {
      originalTerm: null,
      remainingTerm: null,
      leaseStartYear: '',
      groundRent: null,
      groundRentReview: '',
      serviceCharge: null,
    },
    tenureNotes: details.tenureNotes || '',
    roadName: details.roadName || '',
    roadAdopted: details.roadAdopted ?? true,
  };

  // Build client details
  const cd = (row.client_details || {}) as Partial<ClientDetails>;
  const clientDetails: ClientDetails = {
    referenceNumber: cd.referenceNumber || row.reference_number || '',
    clientName: cd.clientName || '',
    deceasedName: cd.deceasedName || '',
    dateOfDeath: cd.dateOfDeath || '',
    valuationDate: cd.valuationDate || new Date().toISOString().split('T')[0],
    auctionCompany: cd.auctionCompany || '',
  };

  // Build template variables
  const variables: Record<string, string> = {
    PROPERTY_ADDRESS: row.property_address,
    CLIENT_NAME: clientDetails.clientName || '[Client Name]',
    VALUATION_DATE: formatDate(clientDetails.valuationDate),
    REFERENCE_NUMBER: clientDetails.referenceNumber,
    DECEASED_NAME: clientDetails.deceasedName || '[Deceased Name]',
    DATE_OF_DEATH: formatDate(clientDetails.dateOfDeath),
    AUCTION_COMPANY: clientDetails.auctionCompany || '[Auction Company]',
    LAND_REGISTRY_TITLE: row.land_registry_title || '[Title Number]',
    TENURE_TYPE: fullDetails.tenure === 'freehold' ? 'Freehold' : 'Leasehold',
    TENURE_TYPE_LOWER: fullDetails.tenure === 'freehold' ? 'freehold' : 'leasehold',
    LOCAL_AUTHORITY: row.local_authority || '[Local Authority]',
    POSTAL_DISTRICT: row.postal_district || row.postcode.split(/\s+/)[0] || '[Postal District]',
    INSPECTION_DATE: formatDate(clientDetails.valuationDate),
    INSPECTION_TIME_OF_DAY: 'morning',
    WEATHER_CONDITIONS: 'dry and clear',
    VALUATION_FIGURE: row.valuation_figure.toLocaleString('en-GB'),
    VALUATION_WORDS: row.valuation_figure_words || '',
    AUCTION_RESERVE: row.auction_reserve?.toLocaleString('en-GB') || '',
    AUCTION_RESERVE_WORDS: row.auction_reserve_words || '',
    AUCTION_MONTH_YEAR: formatMonthYear(clientDetails.valuationDate),
  };

  // Use the generated_sections directly (they were already filled during generation)
  const generatedSections = row.generated_sections || {};

  // Load report photos from report_photos table
  const { data: photoRows } = await supabase
    .from('report_photos')
    .select('label, storage_path')
    .eq('report_id', id)
    .order('sort_order', { ascending: true });

  const reportPhotos: ReportPhoto[] = (photoRows || []).map((p: { label: string; storage_path: string }) => {
    const { data: urlData } = supabase.storage
      .from('report-photos')
      .getPublicUrl(p.storage_path);
    return {
      label: p.label,
      url: urlData.publicUrl,
    };
  });

  // Build PDF input
  const pdfInput: GeneratePDFInput = {
    reportType: row.report_type,
    sections: generatedSections,
    templateSections: template,
    comparables: (row.comparables || []) as Comparable[],
    clientDetails,
    propertyDetails: fullDetails as unknown as { [key: string]: unknown },
    googleMapsData: (() => {
      const gmd = (row.google_maps_data || null) as GoogleMapsData | null;
      if (!gmd) return null;
      // Replace proxy URLs with direct Google Maps Static API URLs for reliable PDF rendering
      // (Puppeteer may not be able to reach localhost proxy)
      const addr = row.property_address || '';
      return {
        ...gmd,
        streetViewUrl: gmd.lat ? getDirectStreetViewUrl(addr) : gmd.streetViewUrl,
        satelliteUrl: gmd.lat ? getDirectSatelliteUrl(gmd.lat, gmd.lng) : gmd.satelliteUrl,
        locationMapUrl: gmd.lat ? getDirectLocationMapUrl(gmd.lat, gmd.lng) : gmd.locationMapUrl,
      };
    })(),
    valuationFigure: row.valuation_figure,
    valuationFigureWords: row.valuation_figure_words || '',
    auctionReserve: row.auction_reserve ?? undefined,
    auctionReserveWords: row.auction_reserve_words || undefined,
    variables,
    reportPhotos,
    firmSettings: settings ? {
      phone: settings.firmPhone,
      email: settings.firmEmail,
    } : undefined,
  };

  try {
    const pdfBuffer = await generatePDF(pdfInput);

    const fileName = `CoreProp-${row.postcode.replace(/\s/g, '')}-${row.reference_number || id.slice(0, 8)}.pdf`;

    // Auto-upload to Google Drive if folder is linked (non-blocking)
    // Falls back to property_details.driveFolderId for deployments without v2 migration
    const driveFolderId = (
      (row as unknown as Record<string, unknown>).google_drive_folder_id ||
      ((row.property_details as Record<string, unknown> | null)?.driveFolderId)
    ) as string | undefined;
    if (driveFolderId && user) {
      syncReportFile({
        supabase,
        userId: user.id,
        reportFolderId: driveFolderId,
        fileName,
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
      }).catch((err) => console.error('[pdf] Drive upload failed (non-blocking):', err));
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    console.error('[pdf] Generation failed:', errMsg);
    if (errStack) console.error('[pdf] Stack:', errStack);
    return NextResponse.json(
      { error: `PDF generation failed: ${errMsg}` },
      { status: 500 }
    );
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '[Date]';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
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
    return new Date(dateStr).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
