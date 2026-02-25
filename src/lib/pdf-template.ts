// ============================================================
// CoreProp Valuation Report - HTML Template for PDF Generation
// ============================================================

import type {
  ReportType,
  Comparable,
  ClientDetails,
  PropertyDetails,
  GoogleMapsData,
} from '@/lib/types';
import { isAuctionType } from '@/lib/types';
import type { ReportTemplate } from '@/lib/report-templates';
import { fillTemplate } from '@/lib/report-templates';
import { format, parseISO } from 'date-fns';

// --- Helpers ---

/**
 * Format a number as GBP currency string: £650,000
 */
function formatCurrency(amount: number): string {
  return `£${amount.toLocaleString('en-GB')}`;
}

/**
 * Format a date string (ISO) to DD/MM/YYYY
 */
function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy');
  } catch {
    return dateStr;
  }
}

/**
 * Escape HTML special characters to prevent injection.
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Convert plain text (with newlines and numbered paragraphs) into HTML paragraphs.
 * Preserves blank-line separation and converts newlines within a block to <br>.
 */
function textToHTML(text: string): string {
  if (!text) return '';

  // Split on double newlines to get paragraphs
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      // Convert single newlines within a paragraph to <br>
      const html = escapeHTML(trimmed).replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

// --- Comparable Table Builder ---

function buildComparableRow(comp: Comparable): string {
  const date = comp.status === 'SOLD'
    ? `SOLD<br>${formatDate(comp.saleDate)}`
    : `${comp.status}<br>${formatDate(comp.saleDate)}`;

  const floorAreaText = comp.floorArea
    ? `${comp.floorArea}m² (${comp.floorAreaSource === 'epc' ? 'EPC' : comp.floorAreaSource === 'agent_floorplan' ? 'agent floorplan' : 'estimated'})`
    : '';

  const pricePerSqm = comp.pricePerSqm
    ? `${formatCurrency(Math.round(comp.pricePerSqm))}/m²`
    : '';

  const typeAndDescription = [
    floorAreaText,
    comp.description,
  ].filter(Boolean).join('<br>');

  const priceLines = [
    formatCurrency(comp.salePrice),
    pricePerSqm,
  ].filter(Boolean).join('<br>');

  return `
    <tr>
      <td class="comp-date">${date}</td>
      <td class="comp-address">${escapeHTML(comp.address)}</td>
      <td class="comp-type">${typeAndDescription}</td>
      <td class="comp-price">${priceLines}</td>
    </tr>`;
}

function buildComparableTable(comparables: Comparable[]): string {
  const selected = comparables.filter((c) => c.isSelected);
  if (selected.length === 0) {
    return '<p><em>No comparable evidence selected.</em></p>';
  }

  const rows = selected.map(buildComparableRow).join('\n');

  return `
    <table class="comp-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Address</th>
          <th>Type</th>
          <th>Sale Price</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

// --- Photo Section Builder ---

function buildPhotoSection(
  title: string,
  imageUrl: string | null,
  altText: string,
): string {
  if (!imageUrl) {
    return `
      <div class="photo-section">
        <p class="photo-caption">${escapeHTML(title)}</p>
        <div class="photo-placeholder">
          <p>[${escapeHTML(altText)} - image not available]</p>
        </div>
      </div>`;
  }

  return `
    <div class="photo-section">
      <p class="photo-caption">${escapeHTML(title)}</p>
      <img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(altText)}" class="report-photo" />
    </div>`;
}

// --- Section Builder ---

function buildSection(
  title: string,
  content: string,
  variables: Record<string, string>,
): string {
  const filled = fillTemplate(content, variables);
  return `
    <div class="report-section">
      <h2 class="section-heading">${escapeHTML(title)}</h2>
      <div class="section-body">
        ${textToHTML(filled)}
      </div>
    </div>`;
}

// --- CSS Styles ---

function getStyles(): string {
  return `
    @page {
      size: A4;
      margin: 20mm 25mm 20mm 25mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 210mm;
      font-family: "Beausite Classic", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #2c2c2c;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* --- Page break utilities --- */
    .page-break-before {
      page-break-before: always;
      break-before: page;
    }

    .page-break-after {
      page-break-after: always;
      break-after: page;
    }

    .avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* --- Header / Logo area --- */
    .report-header {
      text-align: center;
      padding-bottom: 20px;
      margin-bottom: 30px;
      border-bottom: 3px solid #1a2e3b;
    }

    .report-header img.logo {
      max-width: 220px;
      height: auto;
      margin-bottom: 16px;
    }

    .report-header .report-title {
      font-size: 20pt;
      font-weight: 700;
      color: #1a2e3b;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .report-header .report-subtitle {
      font-size: 12pt;
      color: #555;
      font-weight: 400;
    }

    .report-header .property-address {
      font-size: 13pt;
      font-weight: 600;
      color: #1a2e3b;
      margin-top: 12px;
    }

    .report-header .report-meta {
      font-size: 9.5pt;
      color: #666;
      margin-top: 8px;
    }

    /* --- Section headings --- */
    .section-heading {
      font-size: 12pt;
      font-weight: 700;
      color: #1a2e3b;
      border-bottom: 2px solid #c49a6c;
      padding-bottom: 4px;
      margin-top: 24px;
      margin-bottom: 12px;
    }

    .section-body p {
      margin-bottom: 8px;
      text-align: justify;
    }

    .report-section {
      margin-bottom: 16px;
    }

    /* --- Comparable Table --- */
    .comp-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 9.5pt;
    }

    .comp-table thead {
      background-color: #1a2e3b;
      color: #fff;
    }

    .comp-table th {
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .comp-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #ddd;
      vertical-align: top;
    }

    .comp-table tbody tr:nth-child(even) {
      background-color: #f8f7f5;
    }

    .comp-table .comp-date {
      width: 80px;
      white-space: nowrap;
    }

    .comp-table .comp-address {
      width: 30%;
    }

    .comp-table .comp-type {
      width: 35%;
    }

    .comp-table .comp-price {
      width: 15%;
      text-align: right;
      font-weight: 600;
    }

    /* --- Photos --- */
    .photo-section {
      margin: 24px 0;
      text-align: center;
      page-break-inside: avoid;
    }

    .photo-caption {
      font-size: 9.5pt;
      font-weight: 600;
      color: #1a2e3b;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .report-photo {
      max-width: 100%;
      max-height: 260px;
      border: 1px solid #ccc;
      border-radius: 2px;
    }

    .photo-placeholder {
      width: 100%;
      height: 200px;
      border: 2px dashed #ccc;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-style: italic;
      font-size: 9.5pt;
      background: #fafafa;
    }

    /* --- Signature Block --- */
    .signature-block {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
    }

    .signature-block .sig-line {
      width: 250px;
      border-bottom: 1px solid #333;
      margin-bottom: 6px;
      height: 50px;
    }

    .signature-block p {
      margin-bottom: 2px;
      font-size: 10pt;
    }

    .signature-block .sig-name {
      font-weight: 700;
      color: #1a2e3b;
    }

    .signature-block .sig-title {
      color: #555;
      font-size: 9.5pt;
    }

    .signature-block .sig-date {
      margin-top: 12px;
      font-size: 9.5pt;
      color: #555;
    }

    /* --- Appendix --- */
    .appendix-heading {
      font-size: 14pt;
      font-weight: 700;
      color: #1a2e3b;
      border-bottom: 3px solid #c49a6c;
      padding-bottom: 6px;
      margin-bottom: 16px;
    }

    .appendix-body p {
      margin-bottom: 6px;
      text-align: justify;
      font-size: 9.5pt;
      line-height: 1.5;
    }

    /* --- Valuation Figure --- */
    .valuation-figure {
      background-color: #f4f1ec;
      border-left: 4px solid #c49a6c;
      padding: 16px 20px;
      margin: 20px 0;
      page-break-inside: avoid;
    }

    .valuation-figure .amount {
      font-size: 16pt;
      font-weight: 700;
      color: #1a2e3b;
    }

    .valuation-figure .words {
      font-size: 10pt;
      color: #555;
      font-style: italic;
      margin-top: 4px;
    }

    /* --- Auction Reserve --- */
    .auction-reserve {
      background-color: #faf6f1;
      border-left: 4px solid #c49a6c;
      padding: 16px 20px;
      margin: 16px 0;
      page-break-inside: avoid;
    }

    .auction-reserve .amount {
      font-size: 14pt;
      font-weight: 700;
      color: #1a2e3b;
    }

    .auction-reserve .words {
      font-size: 10pt;
      color: #555;
      font-style: italic;
      margin-top: 4px;
    }
  `;
}

// --- Main Export ---

export function buildReportHTML(data: {
  reportType: ReportType;
  sections: Record<string, string>;
  templateSections: ReportTemplate;
  comparables: Comparable[];
  clientDetails: ClientDetails;
  propertyDetails: PropertyDetails;
  googleMapsData: GoogleMapsData | null;
  valuationFigure: number;
  valuationFigureWords: string;
  auctionReserve?: number;
  auctionReserveWords?: string;
  variables: Record<string, string>;
}): string {
  const {
    reportType,
    sections,
    templateSections,
    comparables,
    clientDetails,
    propertyDetails,
    googleMapsData,
    valuationFigure,
    valuationFigureWords,
    auctionReserve,
    auctionReserveWords,
    variables,
  } = data;

  // Derive the report title from the report type
  const reportTitleMap: Record<ReportType, string> = {
    iht_inspected: 'Retrospective Market Valuation Report',
    iht_desktop: 'Retrospective Desktop Valuation Report',
    current_market_inspected: 'Market Valuation Report',
    current_market_desktop: 'Desktop Market Valuation Report',
    auction_inspected: 'Auction Market Valuation Report',
    auction_desktop: 'Auction Desktop Valuation Report',
    ha_current_market_auction: 'Market Valuation & Auction Reserve Report',
  };

  const reportTitle = reportTitleMap[reportType] ?? 'Valuation Report';

  // Build the property address line from variables or propertyDetails
  const propertyAddress = variables['PROPERTY_ADDRESS'] ?? '';
  const referenceNumber = clientDetails.referenceNumber ?? '';
  const valuationDate = variables['VALUATION_DATE'] ?? clientDetails.valuationDate ?? '';

  // Map image URLs
  const streetViewUrl = googleMapsData?.streetViewUrl ?? null;
  const satelliteUrl = googleMapsData?.satelliteUrl ?? null;
  const locationMapUrl = googleMapsData?.locationMapUrl ?? null;

  // Build the valuation conclusion with the figure
  const valuationConclusionText = fillTemplate(templateSections.valuationConclusion, {
    ...variables,
    VALUATION_FIGURE: valuationFigure.toLocaleString('en-GB'),
    VALUATION_WORDS: valuationFigureWords,
  });

  // Build auction reserve section if applicable
  let auctionReserveHTML = '';
  if (isAuctionType(reportType) && templateSections.auctionReserveSection && auctionReserve) {
    const auctionText = fillTemplate(templateSections.auctionReserveSection, {
      ...variables,
      AUCTION_RESERVE: auctionReserve.toLocaleString('en-GB'),
      AUCTION_RESERVE_WORDS: auctionReserveWords ?? '',
    });
    auctionReserveHTML = `
      <div class="report-section">
        <h2 class="section-heading">Auction Reserve</h2>
        <div class="section-body">
          ${textToHTML(auctionText)}
        </div>
        <div class="auction-reserve">
          <div class="amount">${formatCurrency(auctionReserve)}</div>
          <div class="words">(${escapeHTML(auctionReserveWords ?? '')})</div>
        </div>
      </div>`;
  }

  // Build signature block
  const signatureLines = templateSections.signatureBlock.split('\n');
  const sigName = signatureLines[0] ?? '';
  const sigTitles = signatureLines.slice(1).map((l) => l.trim()).filter(Boolean);

  const signatureHTML = `
    <div class="signature-block">
      <div class="sig-line"></div>
      <p class="sig-name">${escapeHTML(sigName)}</p>
      ${sigTitles.map((t) => `<p class="sig-title">${escapeHTML(t)}</p>`).join('\n')}
      <p class="sig-date">Date of Report: ${escapeHTML(valuationDate)}</p>
    </div>`;

  // IHT reports use "Total Floor Area", non-IHT use "Total Superficial Floor Area"
  const isIHT = reportType === 'iht_inspected' || reportType === 'iht_desktop';
  const floorAreaTitle = isIHT ? 'Total Floor Area' : 'Total Superficial Floor Area';

  // --- Assemble the full HTML ---

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(reportTitle)} - ${escapeHTML(propertyAddress)}</title>
  <style>
    ${getStyles()}
  </style>
</head>
<body>

  <!-- ===== HEADER / LOGO ===== -->
  <div class="report-header">
    <div class="report-title">${escapeHTML(reportTitle)}</div>
    <div class="report-subtitle">RICS Red Book Compliant</div>
    <div class="property-address">${escapeHTML(propertyAddress)}</div>
    <div class="report-meta">
      Reference: ${escapeHTML(referenceNumber)} &nbsp;|&nbsp; Valuation Date: ${escapeHTML(valuationDate)}
    </div>
  </div>

  ${buildSection('Instructions', templateSections.instructions, variables)}

  ${buildSection('Basis of Valuation', templateSections.basisOfValuation, variables)}

  ${buildSection('Assumptions and Sources of Information', templateSections.assumptionsAndSources, variables)}

  ${buildSection('Inspection', templateSections.inspection, variables)}

  ${buildSection('Description of Property', sections['section_5_description'] ?? '', variables)}

  ${buildSection('Construction', sections['section_6_construction'] ?? '', variables)}

  <!-- Photo: Front Elevation (inline after Construction, matching client format) -->
  ${buildPhotoSection('Front Elevation', streetViewUrl, 'Front elevation of the Property')}

  ${buildSection('Accommodation', sections['section_7_accommodation'] ?? '', variables)}

  ${buildSection('Externally', sections['section_8_externally'] ?? '', variables)}

  ${buildSection('Services', sections['section_9_services'] ?? '', variables)}

  ${buildSection(floorAreaTitle, sections['section_10_floor_area'] ?? '', variables)}

  ${buildSection('Tenure', sections['section_11_tenure'] ?? '', variables)}

  ${buildSection('Roads', sections['section_12_roads'] ?? '', variables)}

  ${buildSection('Condition & Further Details', sections['section_13_condition'] ?? '', variables)}

  ${buildSection('Structure and External', sections['section_14_structure'] ?? '', variables)}

  <!-- Photo: Satellite/Roof view (inline after Structure, matching client format) -->
  ${buildPhotoSection('Aerial View', satelliteUrl, 'Google satellite view of roof')}

  ${buildSection('Amenity', sections['section_15_amenity'] ?? '', variables)}

  <!-- Photo: Location Map (neighbourhood context, after Amenity) -->
  ${buildPhotoSection('Location Plan', locationMapUrl, 'Location map showing the Property and surrounding area')}

  <!-- Comparable Data with table -->
  <div class="report-section">
    <h2 class="section-heading">Comparable Data</h2>
    <div class="section-body">
      ${textToHTML(fillTemplate(templateSections.comparableDataIntro, variables))}
    </div>
    ${buildComparableTable(comparables)}
  </div>

  <!-- Valuation Conclusions and Market Commentary -->
  <div class="report-section">
    <h2 class="section-heading">Valuation Conclusions and Market Commentary</h2>
    <div class="section-body">
      ${textToHTML(templateSections.marketCommentary)}
    </div>
    <div class="section-body" style="margin-top: 16px;">
      ${textToHTML(valuationConclusionText)}
    </div>
    <div class="valuation-figure">
      <div class="amount">${formatCurrency(valuationFigure)}</div>
      <div class="words">(${escapeHTML(valuationFigureWords)})</div>
    </div>
  </div>

  ${auctionReserveHTML}

  <!-- Signature -->
  <div class="report-section">
    <p style="margin-bottom: 4px;">Signed:</p>
    ${signatureHTML}
  </div>

  <div class="page-break-before"></div>

  <!-- Appendix 1 -->
  <div class="report-section">
    <h1 class="appendix-heading">Appendix 1</h1>
    <div class="appendix-body">
      ${textToHTML(templateSections.appendix1)}
    </div>
  </div>

</body>
</html>`;
}
