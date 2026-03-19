// ============================================================
// CoreProp Valuation Report - HTML Template for PDF Generation
// Matches the exact structure of real CoreProp reports:
// Cover Page → Sections 1-17 → Signature → Appendix → Back Cover
//
// Exports three HTML builders for 3-part PDF generation:
//   buildCoverHTML     → full-bleed cover page
//   buildContentHTML   → all content pages (sections 1-17 + appendix)
//   buildBackCoverHTMLDoc → full-bleed back cover
// Plus Puppeteer header/footer templates.
// ============================================================

import type {
  ReportType,
  Comparable,
  ClientDetails,
  GoogleMapsData,
} from '@/lib/types';
import { isAuctionType, isIHTType } from '@/lib/types';
import type { ReportTemplate } from '@/lib/report-templates';
import { fillTemplate } from '@/lib/report-templates';
import { format, parseISO } from 'date-fns';
import { getCorepropLogoDataUrl, getRicsLogoDataUrl, getRicsLogoWhiteDataUrl, getRicsLogoGoldDataUrl } from '@/lib/logo-data';
import { getDirectStreetViewUrl } from '@/lib/google-maps';

// --- Report Photo type (from report_photos table) ---

export interface ReportPhoto {
  label: string;
  url: string;
  analysis?: string;
}

// ============================== HELPERS ==============================

function formatCurrency(amount: number): string {
  return `£${amount.toLocaleString('en-GB')}`;
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy');
  } catch {
    return dateStr;
  }
}

function formatDateLong(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMMM yyyy');
  } catch {
    return dateStr;
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightBrackets(html: string): string {
  return html.replace(
    /\[([^\]]+)\]/g,
    '<span class="bracket-highlight">[$1]</span>',
  );
}

function textToHTML(text: string): string {
  if (!text) return '';
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      const html = escapeHTML(trimmed).replace(/\n/g, '<br>');
      return `<p>${highlightBrackets(html)}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

// ============================== REPORT TYPE ==============================

function getReportTypeDisplay(reportType: ReportType): string {
  const map: Record<ReportType, string> = {
    iht_inspected: 'RICS RED BOOK IHT VALUATION',
    iht_desktop: 'RICS RED BOOK IHT DESKTOP VALUATION',
    current_market_inspected: 'RICS RED BOOK MARKET VALUATION',
    current_market_desktop: 'RICS RED BOOK DESKTOP MARKET VALUATION',
    auction_inspected: 'RICS RED BOOK AUCTION VALUATION',
    auction_desktop: 'RICS RED BOOK AUCTION DESKTOP VALUATION',
    ha_current_market_auction: 'RICS RED BOOK MARKET VALUATION & AUCTION RESERVE',
    aso_inspected: 'RICS RED BOOK SHARED OWNERSHIP VALUATION',
    aso_desktop: 'RICS RED BOOK SHARED OWNERSHIP DESKTOP VALUATION',
    portfolio_inspected: 'RICS RED BOOK PORTFOLIO VALUATION',
    portfolio_desktop: 'RICS RED BOOK PORTFOLIO DESKTOP VALUATION',
  };
  return map[reportType] ?? 'RICS RED BOOK VALUATION';
}

// ============================== SECTION BUILDERS ==============================

function buildNumberedSection(
  sectionNumber: number,
  title: string,
  content: string,
  variables: Record<string, string>,
): string {
  const filled = fillTemplate(content, variables);
  return `
    <div class="report-section avoid-break">
      <h2 class="section-heading">${sectionNumber}. &nbsp;${escapeHTML(title)}</h2>
      <div class="section-body">
        ${textToHTML(filled)}
      </div>
    </div>`;
}

// ============================== PHOTO BUILDERS ==============================

function buildInlinePhoto(url: string, altText?: string, photoNumber?: number): string {
  const caption = photoNumber
    ? `<div class="photo-caption">Photo ${photoNumber}. ${escapeHTML(altText || '')}</div>`
    : '';
  return `
    <div class="inline-photo">
      <img src="${escapeHTML(url)}" alt="${escapeHTML(altText || '')}" />
      ${caption}
    </div>`;
}

function buildPhotoPlaceholder(altText: string): string {
  return `
    <div class="inline-photo">
      <div class="photo-placeholder">
        <p>[${escapeHTML(altText)} - image not available]</p>
      </div>
    </div>`;
}

function findPhotos(photos: ReportPhoto[], ...labelPatterns: string[]): ReportPhoto[] {
  return photos.filter((p) =>
    labelPatterns.some((pattern) =>
      p.label.toLowerCase().includes(pattern.toLowerCase()),
    ),
  );
}

// ============================== EPC CARD BUILDER ==============================

function buildEPCCard(epcData: { rating?: string; score?: number; address?: string; validUntil?: string; certificateNumber?: string; } | null, propertyAddress: string): string {
  if (!epcData?.rating) return '';

  const rating = (epcData.rating || 'N/A').toUpperCase();
  const ratingColors: Record<string, string> = {
    A: '#008054', B: '#19b459', C: '#8dce46', D: '#ffd500', E: '#fcaa65', F: '#ef8023', G: '#e9153b',
  };
  const bgColor = ratingColors[rating] || '#666';

  return `
    <div class="epc-card avoid-break" style="
      border: 2px solid #2b7c9e;
      border-radius: 6px;
      overflow: hidden;
      margin: 16px 0;
      max-width: 450px;
    ">
      <div style="display: flex;">
        <div style="background: #2b7c9e; color: white; padding: 12px 16px; flex: 1;">
          <div style="font-size: 9pt; margin-bottom: 2px;">${escapeHTML(propertyAddress)}</div>
        </div>
        <div style="background: #2b7c9e; padding: 8px 20px; text-align: center; border-left: 2px solid #1a5e7a;">
          <div style="color: white; font-size: 8pt; margin-bottom: 2px;">Energy rating</div>
          <div style="
            background: ${bgColor};
            color: white;
            font-size: 28pt;
            font-weight: 700;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            margin: 0 auto;
          ">${rating}</div>
        </div>
      </div>
      ${epcData.validUntil || epcData.certificateNumber ? `
      <div style="display: flex; background: #2b7c9e;">
        ${epcData.validUntil ? `<div style="flex: 1; padding: 8px 16px; border-top: 1px solid #1a5e7a;">
          <div style="color: #b0d4e3; font-size: 7.5pt;">Valid until</div>
          <div style="color: white; font-size: 9pt; font-weight: 600;">${escapeHTML(epcData.validUntil)}</div>
        </div>` : ''}
        ${epcData.certificateNumber ? `<div style="flex: 1; padding: 8px 16px; border-top: 1px solid #1a5e7a; border-left: 1px solid #1a5e7a;">
          <div style="color: #b0d4e3; font-size: 7.5pt;">Certificate number</div>
          <div style="color: white; font-size: 9pt; font-weight: 600;">${escapeHTML(epcData.certificateNumber)}</div>
        </div>` : ''}
      </div>` : ''}
    </div>`;
}

// ============================== COMPARABLE TABLE BUILDER ==============================

function buildComparableTable(comparables: Comparable[]): string {
  const selected = comparables.filter((c) => c.isSelected);
  if (selected.length === 0) {
    return '<p><em>No comparable evidence selected.</em></p>';
  }

  const rows = selected.map((comp) => {
    const statusLabel = comp.status === 'SOLD' ? 'SOLD' : escapeHTML(comp.status);
    const dateLabel = formatDate(comp.saleDate);

    const floorAreaText = comp.floorArea
      ? `${comp.floorArea}m\u00B2 (${comp.floorAreaSource === 'epc' ? 'EPC' : comp.floorAreaSource === 'agent_floorplan' ? 'agent floorplan' : 'estimated'})`
      : '';

    const pricePerSqm = comp.pricePerSqm
      ? `${formatCurrency(Math.round(comp.pricePerSqm))}/m\u00B2`
      : '';

    const typeDesc = [
      floorAreaText,
      comp.description || '',
    ].filter(Boolean).join('<br>');

    const priceText = [
      formatCurrency(comp.salePrice),
      pricePerSqm,
    ].filter(Boolean).join('<br>');

    const adjustmentNote = (comp as Comparable & { adjustmentNotes?: string }).adjustmentNotes;

    // Street View thumbnail: request taller image (200x160) and crop to 100x60
    // using object-position: center top to cut off the Google watermark at the bottom
    const streetViewUrl = getDirectStreetViewUrl(comp.address, '200x160');
    const streetViewImg = streetViewUrl
      ? `<img src="${streetViewUrl}" alt="" style="width: 100px; height: 60px; object-fit: cover; object-position: center top; margin-bottom: 4px; display: block; border-radius: 2px; overflow: hidden;" onerror="this.style.display='none'" />`
      : '';

    return `
      <tr>
        <td style="padding: 8px 10px; border: 1px solid #ddd; vertical-align: top; font-size: 9.5pt; white-space: nowrap;">
          <strong>${statusLabel}</strong><br>${dateLabel}
        </td>
        <td style="padding: 8px 10px; border: 1px solid #ddd; vertical-align: top; font-size: 9.5pt;">
          ${streetViewImg}
          ${escapeHTML(comp.address)}
        </td>
        <td style="padding: 8px 10px; border: 1px solid #ddd; vertical-align: top; font-size: 9.5pt;">
          ${typeDesc}${adjustmentNote ? `<br><em style="color: #888; font-size: 8.5pt;">Adjustment: ${escapeHTML(adjustmentNote)}</em>` : ''}
        </td>
        <td style="padding: 8px 10px; border: 1px solid #ddd; vertical-align: top; font-size: 9.5pt; text-align: right; white-space: nowrap;">
          ${priceText}
        </td>
      </tr>`;
  }).join('\n');

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-family: Arial, sans-serif;">
      <thead>
        <tr style="background: #B5DEE8;">
          <th style="padding: 8px 10px; border: 1px solid #ddd; color: #000000; font-size: 9.5pt; text-align: left;">Date</th>
          <th style="padding: 8px 10px; border: 1px solid #ddd; color: #000000; font-size: 9.5pt; text-align: left;">Address</th>
          <th style="padding: 8px 10px; border: 1px solid #ddd; color: #000000; font-size: 9.5pt; text-align: left;">Type</th>
          <th style="padding: 8px 10px; border: 1px solid #ddd; color: #000000; font-size: 9.5pt; text-align: right;">Sale Price</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

// ============================== COMPARABLE CARD BUILDERS (legacy) ==============================

function buildComparableCard(comp: Comparable): string {
  const statusLabel = comp.status === 'SOLD' ? 'Sold' : escapeHTML(comp.status);
  const dateLabel = formatDate(comp.saleDate);

  const floorAreaText = comp.floorArea
    ? `${comp.floorArea}m² (${comp.floorAreaSource === 'epc' ? 'EPC' : comp.floorAreaSource === 'agent_floorplan' ? 'agent floorplan' : 'estimated'})`
    : '';

  const pricePerSqm = comp.pricePerSqm
    ? `${formatCurrency(Math.round(comp.pricePerSqm))}/m²`
    : '';

  // Google Street View image URL (direct API for reliable PDF rendering)
  const streetViewUrl = getDirectStreetViewUrl(comp.address, '400x250') || `/api/map-image?type=streetview&address=${encodeURIComponent(comp.address)}&size=400x250`;

  const descriptionHTML = comp.description
    ? `<div class="comp-card-desc">${escapeHTML(comp.description)}</div>`
    : '';

  return `
    <div class="comp-card avoid-break">
      <div class="comp-card-img-wrap">
        <img src="${streetViewUrl}" alt="" class="comp-card-img" onerror="this.parentElement.style.display='none'" />
      </div>
      <div class="comp-card-body">
        <div class="comp-card-address">${escapeHTML(comp.address)}</div>
        <div class="comp-card-meta">
          <span class="comp-card-status">${statusLabel}</span>
          <span class="comp-card-date">${dateLabel}</span>
          ${floorAreaText ? `<span class="comp-card-area">${floorAreaText}</span>` : ''}
        </div>
        <div class="comp-card-price-row">
          <span class="comp-card-price">${formatCurrency(comp.salePrice)}</span>
          ${pricePerSqm ? `<span class="comp-card-ppsqm">${pricePerSqm}</span>` : ''}
        </div>
        ${descriptionHTML}
      </div>
    </div>`;
}

function buildComparableSection(comparables: Comparable[]): string {
  const selected = comparables.filter((c) => c.isSelected);
  if (selected.length === 0) {
    return '<p><em>No comparable evidence selected.</em></p>';
  }

  return `
    <div class="comp-cards">
      ${selected.map(buildComparableCard).join('\n')}
    </div>`;
}

// ============================== COVER PAGE ==============================

function buildCoverPageContent(data: {
  reportType: ReportType;
  reportTitle: string;
  propertyAddress: string;
  clientName: string;
  deceasedName: string;
  dateOfDeath: string;
  referenceNumber: string;
  valuationDate: string;
  firmName: string;
}): string {
  const {
    reportType,
    reportTitle,
    propertyAddress,
    clientName,
    deceasedName,
    dateOfDeath,
    referenceNumber,
    valuationDate,
  } = data;

  const reportTypeDisplay = getReportTypeDisplay(reportType);

  let clientLines = '';
  if (isIHTType(reportType) && deceasedName) {
    clientLines = `
      <div class="cover-detail">Valuation advice on ${escapeHTML(propertyAddress)} ('the Property')</div>
      <div class="cover-detail">On behalf of the Estate of the late ${escapeHTML(deceasedName)} c/o ${escapeHTML(clientName)}</div>
      ${dateOfDeath ? `<div class="cover-detail">Date of death &ndash; ${escapeHTML(formatDateLong(dateOfDeath))}</div>` : ''}
    `;
  } else {
    clientLines = `
      <div class="cover-detail">Valuation advice on ${escapeHTML(propertyAddress)} ('the Property')</div>
      <div class="cover-detail">On behalf of ${escapeHTML(clientName)}</div>
    `;
  }

  return `
    <div class="cover-page">
      <div class="cover-content">
        <div class="cover-brand">
          <img src="${getCorepropLogoDataUrl()}" alt="The CoreProp Group" style="height: 110px;" />
        </div>
        <div class="cover-report-type">${escapeHTML(reportTypeDisplay)}</div>
        <div class="cover-details">
          ${clientLines}
        </div>
        <div class="cover-ref">Our ref: ${escapeHTML(referenceNumber)}</div>
        <div class="cover-date">${escapeHTML(formatDateLong(valuationDate))}</div>
      </div>
      <div class="cover-footer">
        <div class="cover-contact">
          <span>p: +44 (0)20 8050 5060</span>
          <span>e: info@coreprop.co.uk</span>
          <span>w: www.coreprop.co.uk</span>
        </div>
        <div class="cover-address">First Floor, 4 Pentonville Road, London, N1 9HF</div>
        <img src="${getRicsLogoWhiteDataUrl()}" alt="Regulated by RICS" class="cover-rics" onerror="this.style.display='none'" />
      </div>
    </div>
  `;
}

// ============================== BACK COVER ==============================

function buildBackCoverContent(firmSettings?: {
  phone?: string;
  email?: string;
  address?: string;
}): string {
  const phone = firmSettings?.phone || '+44 (0)20 8050 5060';
  const email = firmSettings?.email || 'info@coreprop.co.uk';
  const address = firmSettings?.address || 'First Floor, 4 Pentonville Road, London, N1 9HF';

  return `
    <div class="back-cover">
      <div class="back-cover-content">
        <div class="back-brand">
          <img src="${getCorepropLogoDataUrl()}" alt="The CoreProp Group" style="height: 60px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
          <div style="display:none;">
            <span class="brand-the">The</span>
            <span class="brand-name">CoreProp</span>
            <span class="brand-group">Group</span>
          </div>
        </div>
        <div class="back-tagline">Chartered Surveyors &nbsp;|&nbsp; Specialist Valuers &ndash; Regulated by RICS</div>
      </div>
      <div class="back-footer">
        <div class="back-contact">
          <span>p: ${phone}</span>
          <span>e: ${email}</span>
          <span>w: www.coreprop.co.uk</span>
        </div>
        <div class="back-address">${address}</div>
      </div>
    </div>
  `;
}

// ============================== CSS STYLES ==============================

function getCoverStyles(): string {
  return `
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 210mm;
      overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cover-page {
      width: 210mm; min-height: 297mm;
      background: #1a2e3b;
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 30mm 30mm 20mm;
    }
    .cover-content { color: #fff; }
    .cover-brand { margin-bottom: 20px; }
    .cover-report-type { font-size: 18pt; font-weight: 400; color: #fff; margin-top: 30px; letter-spacing: 0.3px; }
    .cover-details { margin-top: 24px; }
    .cover-detail { font-size: 11pt; color: #e0e0e0; margin-bottom: 4px; line-height: 1.5; }
    .cover-ref { margin-top: 20px; font-size: 10.5pt; color: #c49a6c; }
    .cover-date { font-size: 10.5pt; color: #c49a6c; }
    .cover-footer {
      display: flex; justify-content: space-between; align-items: flex-end;
      padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.15);
    }
    .cover-contact span { color: #c0c0c0; font-size: 8pt; display: block; line-height: 1.6; }
    .cover-address { color: #c0c0c0; font-size: 8pt; margin-top: 2px; }
    .cover-rics { height: 36px; }
  `;
}

function getBackCoverStyles(): string {
  return `
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 210mm;
      overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .back-cover {
      width: 210mm; min-height: 297mm;
      background: #1a2e3b;
      display: flex; flex-direction: column; justify-content: flex-end;
      padding: 40mm 30mm 30mm;
    }
    .back-cover-content { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; }
    .back-brand { text-align: center; margin-bottom: 12px; }
    .brand-the { color: #c49a6c; font-size: 18pt; font-weight: 300; display: block; line-height: 1.1; }
    .brand-name { color: #ffffff; font-size: 28pt; font-weight: 700; display: block; line-height: 1.1; }
    .brand-group { color: #c49a6c; font-size: 18pt; font-weight: 300; display: block; line-height: 1.1; }
    .back-tagline { color: #e0e0e0; font-size: 10pt; text-align: center; margin-bottom: 40px; }
    .back-footer { text-align: center; }
    .back-contact span { color: #c0c0c0; font-size: 8.5pt; margin: 0 6px; }
    .back-address { color: #c0c0c0; font-size: 8.5pt; margin-top: 4px; }
  `;
}

function getContentStyles(): string {
  return `
    @page {
      size: A4;
      margin: 0;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 210mm;
      overflow-x: hidden;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.6;
      color: #000000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* --- Table layout for repeating header/footer on every page --- */
    .page-table {
      width: 210mm;
      border-collapse: collapse;
    }
    .page-table td {
      padding: 0;
      vertical-align: top;
    }

    /* Header repeats on every page via <thead> */
    .page-header-row td {
      padding: 0;
    }
    .header-banner {
      background: #1a2e3b;
      padding: 8mm 25.4mm 6mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 210mm;
    }
    .header-brand img { height: 18mm; }
    .header-right { text-align: right; }
    .header-right .h-cs {
      color: #ffffff;
      font-size: 11pt;
      font-weight: 700;
      font-family: Arial, Helvetica, sans-serif;
    }
    .header-right .h-sv {
      color: #c0c0c0;
      font-size: 8pt;
      font-family: Arial, Helvetica, sans-serif;
      margin-top: 2px;
    }
    .header-address-bar {
      padding: 4mm 25.4mm 0;
    }
    .header-address-bar .h-addr {
      font-size: 9pt;
      color: #8b7355;
      padding-bottom: 3mm;
      border-bottom: 1.5px solid #1a2e3b;
    }

    /* Footer uses position:fixed to repeat on every printed page */
    .fixed-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      width: 210mm;
      z-index: 100;
      background: #fff;
    }
    .footer-bar {
      border-top: 2px solid #1a2e3b;
      margin: 0 25.4mm;
      padding: 4mm 0 3mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-left {
      display: flex;
      gap: 8mm;
    }
    .footer-col {
      font-size: 7.5pt;
      color: #333;
      line-height: 1.6;
    }
    .footer-rics { display: flex; align-items: center; }
    .footer-rics img { height: 12mm; width: auto; }

    /* --- Page break utilities --- */
    .page-break {
      page-break-after: always;
      break-after: page;
      height: 0;
    }

    .avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* --- Content area (left/right padding for margins) --- */
    /* Top: gap below repeating header; Bottom: clear the fixed footer (28mm Puppeteer margin + footer height) */
    .content-area {
      padding: 16mm 25.4mm 28mm;
    }

    /* --- Section headings --- */
    .section-heading {
      font-size: 10.5pt;
      font-weight: 700;
      color: #000000;
      margin-top: 20px;
      margin-bottom: 10px;
      page-break-after: avoid;
      break-after: avoid;
    }

    /* Accommodation section uses center alignment (matching DOCX) */
    .accommodation-section .section-body p {
      text-align: center;
    }

    .section-body p {
      margin-bottom: 8px;
      text-align: left;
      font-size: 10.5pt;
      line-height: 1.6;
      orphans: 3;
      widows: 3;
    }

    .report-section {
      margin-bottom: 8px;
    }

    /* --- Bracket highlight --- */
    .bracket-highlight {
      color: #FF0000;
      font-weight: bold;
      background: #FEE2E2;
      padding: 0 2px;
      border-radius: 2px;
    }

    /* --- Comparable Cards --- */
    .comp-cards {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin: 16px 0;
    }

    .comp-card {
      border: 1px solid #ddd;
      border-radius: 6px;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .comp-card-img-wrap {
      width: 100%;
      max-height: 160px;
      overflow: hidden;
      background: #f5f5f5;
    }

    .comp-card-img {
      width: 100%;
      height: 160px;
      object-fit: cover;
      display: block;
    }

    .comp-card-body {
      padding: 10px 14px 12px;
    }

    .comp-card-address {
      font-weight: 700;
      font-size: 10.5pt;
      color: #1a2e3b;
    }

    .comp-card-meta {
      display: flex;
      gap: 12px;
      font-size: 9pt;
      color: #666;
      margin-top: 4px;
    }

    .comp-card-status {
      font-weight: 600;
      color: #1a2e3b;
      text-transform: uppercase;
      font-size: 8.5pt;
    }

    .comp-card-price-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-top: 6px;
    }

    .comp-card-price {
      font-size: 13pt;
      font-weight: 700;
      color: #1a2e3b;
    }

    .comp-card-ppsqm {
      font-size: 9pt;
      color: #666;
    }

    .comp-card-desc {
      font-size: 9pt;
      color: #555;
      margin-top: 6px;
      line-height: 1.5;
    }

    /* --- Table of Contents --- */
    .toc-heading {
      font-size: 16pt;
      font-weight: 700;
      color: #1a2e3b;
      margin-bottom: 20px;
      padding-bottom: 8px;
      border-bottom: 2px solid #c49a6c;
    }

    .toc-list {
      list-style: none;
      padding: 0;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 6px 0;
      border-bottom: 1px dotted #ccc;
      font-size: 10.5pt;
      color: #2c2c2c;
    }

    .toc-item .toc-num {
      font-weight: 700;
      color: #1a2e3b;
      min-width: 30px;
    }

    .toc-item .toc-title {
      flex: 1;
      margin-left: 8px;
    }

    .toc-item.toc-appendix {
      margin-top: 12px;
      font-style: italic;
    }

    /* --- Inline Photos --- */
    .inline-photo {
      margin: 16px 0;
      text-align: center;
      page-break-inside: avoid;
    }

    .inline-photo img {
      max-width: 100%;
      max-height: 280px;
      border: 1px solid #ddd;
    }

    .photo-caption {
      font-size: 9pt;
      color: #555;
      text-align: center;
      margin-top: 4px;
      font-style: italic;
    }

    .photo-placeholder {
      width: 100%;
      height: 180px;
      border: 2px dashed #ccc;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-style: italic;
      font-size: 9.5pt;
      background: #fafafa;
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

    /* --- Signature Block --- */
    .signature-block {
      margin-top: 30px;
      padding-top: 16px;
      page-break-inside: avoid;
    }

    .signature-block p { margin-bottom: 2px; font-size: 10pt; }
    .sig-space { height: 50px; width: 200px; border-bottom: 1px solid #333; margin: 8px 0; }
    .sig-name { font-weight: 700; color: #1a2e3b; }
    .sig-title { color: #555; font-size: 9.5pt; }
    .sig-date { margin-top: 12px; font-size: 9.5pt; color: #555; }

    /* --- Appendix --- */
    .appendix-heading {
      font-size: 13pt;
      font-weight: 700;
      color: #1a2e3b;
      margin-bottom: 16px;
      padding-bottom: 6px;
      border-bottom: 2px solid #c49a6c;
    }

    .appendix-body p {
      margin-bottom: 6px;
      text-align: justify;
      font-size: 9.5pt;
      line-height: 1.5;
    }

    /* --- Photo appendix --- */
    .photo-appendix { margin: 20px 0; }

    .photo-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 12px;
    }

    .photo-grid-item {
      text-align: center;
      page-break-inside: avoid;
    }

    .photo-grid-item img {
      max-width: 100%;
      max-height: 200px;
      border: 1px solid #ddd;
    }

    .photo-grid-item .photo-label {
      font-size: 8.5pt;
      color: #555;
      margin-top: 4px;
    }
  `;
}

// ============================== PUPPETEER HEADER / FOOTER ==============================

/**
 * Build Puppeteer headerTemplate (inline-styled, rendered in margin area).
 * Puppeteer requires all CSS to be inline. The header repeats on every content page.
 */
export function buildPuppeteerHeader(propertyAddress: string): string {
  const addr = escapeHTML(propertyAddress);
  // Matches the real CoreProp report header:
  // Left: "The" (gold) / "CoreProp" (large, dark navy) / "Group" (gold)
  // Right: "Chartered Surveyors" (dark navy) / "Specialist Valuers – Regulated by RICS" (small grey)
  // Below: Property address + thin separator line
  return `
    <div style="width: 100%; margin: 0; padding: 0; font-family: 'Times New Roman', Georgia, serif;">
      <div style="padding: 6px 25mm 4px; display: flex; justify-content: space-between; align-items: center;">
        <div style="line-height: 1.1;">
          <span style="font-size: 8pt; color: #8b7355;">The</span>
          <span style="font-size: 13pt; font-weight: 700; color: #1a2e3b;"> CoreProp</span>
          <span style="font-size: 8pt; color: #8b7355;"> Group</span>
        </div>
        <div style="text-align: right;">
          <span style="color: #1a2e3b; font-size: 9pt; font-weight: 700; font-family: Arial, Helvetica, sans-serif;">Chartered Surveyors</span>
          <span style="color: #666; font-size: 7pt; font-family: Arial, Helvetica, sans-serif; margin-left: 6px;">Specialist Valuers &ndash; Regulated by RICS</span>
        </div>
      </div>
      <div style="padding: 0 25mm; font-family: Arial, Helvetica, sans-serif;">
        <div style="height: 1px; background: #1a2e3b; margin-bottom: 4px;"></div>
        <div style="font-size: 8pt; color: #8b7355; margin-bottom: 3px;">${addr}</div>
        <div style="height: 1px; background: #1a2e3b;"></div>
      </div>
    </div>`;
}

/**
 * Build Puppeteer footerTemplate (inline-styled, rendered in margin area).
 * Accepts optional firm settings for contact details; falls back to CoreProp defaults.
 */
export function buildPuppeteerFooter(firmSettings?: {
  phone?: string;
  email?: string;
  address?: string;
}): string {
  const phone = firmSettings?.phone || '+44 (0)20 8050 5060';
  const email = firmSettings?.email || 'info@coreprop.co.uk';
  const address = firmSettings?.address || 'First Floor, 4 Pentonville Road, London, N1 9HF';

  return `
    <div style="width: 100%; margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif;">
      <div style="border-top: 1px solid #1a2e3b; margin: 0 25mm 3px;"></div>
      <div style="padding: 0 25mm 4px; display: flex; justify-content: space-between; align-items: center; font-size: 7pt; color: #666;">
        <div>
          <span style="margin-right: 6px;">p: ${phone}</span>
          <span style="margin-right: 6px;">e: ${email}</span>
          <span>w: www.coreprop.co.uk</span>
        </div>
        <div style="color: #1a2e3b; font-size: 7.5pt;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
        <div style="font-weight: 600; color: #1a2e3b;">RICS Regulated</div>
      </div>
    </div>`;
}

// ============================== COVER HTML (standalone) ==============================

export function buildCoverHTML(data: {
  reportType: ReportType;
  clientDetails: ClientDetails;
  variables: Record<string, string>;
}): string {
  const { reportType, clientDetails, variables } = data;
  const propertyAddress = variables['PROPERTY_ADDRESS'] ?? '';
  const referenceNumber = clientDetails.referenceNumber ?? '';
  const valuationDate = variables['VALUATION_DATE'] ?? clientDetails.valuationDate ?? '';
  const firmName = variables['FIRM_NAME'] ?? 'The CoreProp Group';
  const reportTitle = getReportTypeDisplay(reportType);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${getCoverStyles()}</style>
</head>
<body>
  ${buildCoverPageContent({
    reportType,
    reportTitle,
    propertyAddress,
    clientName: clientDetails.clientName,
    deceasedName: clientDetails.deceasedName,
    dateOfDeath: clientDetails.dateOfDeath,
    referenceNumber,
    valuationDate,
    firmName,
  })}
</body>
</html>`;
}

// ============================== BACK COVER HTML (standalone) ==============================

export function buildBackCoverHTMLDoc(firmSettings?: {
  phone?: string;
  email?: string;
  address?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${getBackCoverStyles()}</style>
</head>
<body>
  ${buildBackCoverContent(firmSettings)}
</body>
</html>`;
}

// ============================== CONTENT HTML (standalone) ==============================

/**
 * Build the full content pages HTML (sections 1-17 + signature + appendix).
 * No cover page, no back cover, no inline headers/footers.
 * Puppeteer adds repeating headers/footers via displayHeaderFooter.
 */
export function buildContentHTML(data: {
  reportType: ReportType;
  sections: Record<string, string>;
  templateSections: ReportTemplate;
  comparables: Comparable[];
  clientDetails: ClientDetails;
  propertyDetails: { [key: string]: unknown };
  googleMapsData: GoogleMapsData | null;
  valuationFigure: number;
  valuationFigureWords: string;
  auctionReserve?: number;
  auctionReserveWords?: string;
  variables: Record<string, string>;
  reportPhotos?: ReportPhoto[];
}): string {
  const {
    reportType,
    sections,
    templateSections,
    comparables,
    clientDetails,
    googleMapsData,
    valuationFigure,
    valuationFigureWords,
    auctionReserve,
    auctionReserveWords,
    variables,
    reportPhotos = [],
  } = data;

  const propertyAddress = variables['PROPERTY_ADDRESS'] ?? '';
  const valuationDate = variables['VALUATION_DATE'] ?? clientDetails.valuationDate ?? '';

  // Map image URLs
  const streetViewUrl = googleMapsData?.streetViewUrl ?? null;
  const locationMapUrl = googleMapsData?.locationMapUrl ?? null;
  const satelliteUrl = googleMapsData?.satelliteUrl ?? null;

  // IHT floor area title
  const isIHT = reportType === 'iht_inspected' || reportType === 'iht_desktop';
  const floorAreaTitle = isIHT ? 'Total Floor Area' : 'Total Superficial Floor Area';

  // Valuation conclusion text
  const valuationConclusionText = fillTemplate(templateSections.valuationConclusion, {
    ...variables,
    VALUATION_FIGURE: valuationFigure.toLocaleString('en-GB'),
    VALUATION_WORDS: valuationFigureWords,
  });

  // Auction reserve HTML
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

  // Signature block
  const signatureLines = templateSections.signatureBlock.split('\n');
  const sigName = signatureLines[0] ?? '';
  const sigTitles = signatureLines.slice(1).map((l) => l.trim()).filter(Boolean);

  const signatureHTML = `
    <div class="signature-block">
      <p>Signed:</p>
      <div class="sig-space"></div>
      <p class="sig-name">${escapeHTML(sigName)}</p>
      ${sigTitles.map((t) => `<p class="sig-title">${escapeHTML(t)}</p>`).join('\n')}
      <p class="sig-date">Date of Report: ${escapeHTML(valuationDate)}</p>
    </div>`;

  // --- Photo placement ---
  const frontPhotos = findPhotos(reportPhotos, 'front elevation', 'front');
  const exteriorPhotos = findPhotos(reportPhotos, 'building exterior', 'exterior', 'street');
  const kitchenPhotos = findPhotos(reportPhotos, 'kitchen');
  const bathroomPhotos = findPhotos(reportPhotos, 'bathroom');
  const gardenPhotos = findPhotos(reportPhotos, 'garden', 'rear');
  const conditionPhotos = findPhotos(reportPhotos, 'condition', 'damage', 'damp', 'crack');
  const floorPlanPhotos = findPhotos(reportPhotos, 'floor plan', 'floorplan');
  const placedUrls = new Set([
    ...frontPhotos, ...exteriorPhotos, ...kitchenPhotos,
    ...bathroomPhotos, ...gardenPhotos, ...conditionPhotos, ...floorPlanPhotos,
  ].map(p => p.url));
  const unplacedPhotos = reportPhotos.filter(p => !placedUrls.has(p.url));

  // --- EPC Card ---
  const epcData = data.propertyDetails as Record<string, unknown>;
  const epcCardHTML = buildEPCCard({
    rating: epcData?.epcRating as string,
    certificateNumber: epcData?.epcCertificateNumber as string,
  }, propertyAddress);

  // Photo counter for sequential numbering across the entire report
  let photoCounter = 0;

  const renderPhotos = (photos: ReportPhoto[]) =>
    photos.map((p) => {
      photoCounter++;
      return buildInlinePhoto(p.url, p.label, photoCounter);
    }).join('\n');

  // Photo appendix
  let photoAppendixHTML = '';
  if (unplacedPhotos.length > 0) {
    photoAppendixHTML = `
      <div class="photo-appendix">
        <div class="photo-grid">
          ${unplacedPhotos.map((p) => {
            photoCounter++;
            return `
            <div class="photo-grid-item">
              <img src="${escapeHTML(p.url)}" alt="${escapeHTML(p.label)}" />
              <div class="photo-label">Photo ${photoCounter}. ${escapeHTML(p.label)}</div>
            </div>`;
          }).join('\n')}
        </div>
      </div>
    `;
  }

  // Location map (not numbered — it's a reference map, not an inspection photo)
  const locationMapHTML = locationMapUrl
    ? buildInlinePhoto(locationMapUrl, 'Location map')
    : '';

  // --- Table of Contents ---
  const hasAuctionReserve = isAuctionType(reportType) && templateSections.auctionReserveSection && auctionReserve;
  const tocHTML = `
    <div class="content-area">
      <h1 class="toc-heading">Contents</h1>
      <div class="toc-list">
        <div class="toc-item"><span class="toc-num">1.</span><span class="toc-title">Instructions</span></div>
        <div class="toc-item"><span class="toc-num">2.</span><span class="toc-title">Basis of Valuation</span></div>
        <div class="toc-item"><span class="toc-num">3.</span><span class="toc-title">Assumptions and Sources of Information</span></div>
        <div class="toc-item"><span class="toc-num">4.</span><span class="toc-title">Inspection</span></div>
        <div class="toc-item"><span class="toc-num">5.</span><span class="toc-title">Description of Property</span></div>
        <div class="toc-item"><span class="toc-num">6.</span><span class="toc-title">Construction</span></div>
        <div class="toc-item"><span class="toc-num">7.</span><span class="toc-title">Accommodation</span></div>
        <div class="toc-item"><span class="toc-num">8.</span><span class="toc-title">Externally</span></div>
        <div class="toc-item"><span class="toc-num">9.</span><span class="toc-title">Services</span></div>
        <div class="toc-item"><span class="toc-num">10.</span><span class="toc-title">${escapeHTML(floorAreaTitle)}</span></div>
        <div class="toc-item"><span class="toc-num">11.</span><span class="toc-title">Tenure</span></div>
        <div class="toc-item"><span class="toc-num">12.</span><span class="toc-title">Roads</span></div>
        <div class="toc-item"><span class="toc-num">13.</span><span class="toc-title">Condition &amp; Further Details</span></div>
        <div class="toc-item"><span class="toc-num">14.</span><span class="toc-title">Structure and External</span></div>
        <div class="toc-item"><span class="toc-num">15.</span><span class="toc-title">Amenity</span></div>
        <div class="toc-item"><span class="toc-num">16.</span><span class="toc-title">Comparable Data</span></div>
        <div class="toc-item"><span class="toc-num">17.</span><span class="toc-title">Valuation Conclusions and Market Commentary</span></div>
        ${hasAuctionReserve ? '<div class="toc-item"><span class="toc-num"></span><span class="toc-title">Auction Reserve</span></div>' : ''}
        <div class="toc-item toc-appendix"><span class="toc-num"></span><span class="toc-title">Appendix 1 — RICS Standard Valuation Terms and Conditions</span></div>
      </div>
    </div>`;

  // --- Firm settings for footer ---
  const firmPhone = (data.propertyDetails as Record<string, unknown>)?.firmPhone as string || '+44 (0)20 8050 5060';
  const firmEmail = (data.propertyDetails as Record<string, unknown>)?.firmEmail as string || 'info@coreprop.co.uk';
  const firmAddress = 'First Floor, 4 Pentonville Road, London, N1 9HF';

  // --- Build the repeating header HTML (appears in <thead>) ---
  const headerHTML = `
    <div class="header-banner">
      <div class="header-brand">
        <img src="${getCorepropLogoDataUrl()}" alt="The CoreProp Group" />
      </div>
      <div class="header-right">
        <div class="h-cs">Chartered Surveyors</div>
        <div class="h-sv">Specialist Valuers &ndash; Regulated by RICS</div>
      </div>
    </div>
    <div class="header-address-bar">
      <div class="h-addr">${escapeHTML(propertyAddress)}</div>
    </div>`;

  // --- Build the repeating footer HTML (appears as fixed div) ---
  const footerHTML = `
    <div class="footer-bar">
      <div class="footer-left">
        <div class="footer-col footer-contact">
          p: ${escapeHTML(firmPhone)}<br>
          e: ${escapeHTML(firmEmail)}<br>
          w: www.coreprop.co.uk
        </div>
        <div class="footer-col footer-address">
          First Floor,<br>
          4 Pentonville Road,<br>
          London, N1 9HF
        </div>
      </div>
      <div class="footer-rics">
        <img src="${getRicsLogoGoldDataUrl()}" alt="Regulated by RICS" />
      </div>
    </div>`;

  // --- Helper: wrap content in the table row structure ---
  function wrapInPageBody(content: string): string {
    return `<tr class="page-body-row"><td>${content}</td></tr>`;
  }

  // --- Assemble all content sections ---
  // Sections 1-15 flow naturally without forced page breaks.
  // Breaks only before TOC end, section 16, section 17, and appendix.
  const allContent = `
    <!-- TOC -->
    ${tocHTML}
    <div class="page-break"></div>

    <!-- SECTIONS 1-15 (natural flow) -->
    <div class="content-area">
      ${buildNumberedSection(1, 'Instructions', templateSections.instructions, variables)}
      ${buildNumberedSection(2, 'Basis of Valuation', templateSections.basisOfValuation, variables)}
      ${buildNumberedSection(3, 'Assumptions and Sources of Information', templateSections.assumptionsAndSources, variables)}
      ${locationMapHTML}
      ${buildNumberedSection(4, 'Inspection', templateSections.inspection, variables)}
      ${buildNumberedSection(5, 'Description of Property', sections['section_5_description'] ?? '', variables)}
      ${buildNumberedSection(6, 'Construction', sections['section_6_construction'] ?? '', variables)}
      ${frontPhotos.length > 0
        ? renderPhotos(frontPhotos)
        : streetViewUrl
          ? (() => { photoCounter++; return buildInlinePhoto(streetViewUrl, 'Front elevation of the Property', photoCounter); })()
          : buildPhotoPlaceholder('Front elevation of the Property')
      }
      <div class="accommodation-section">
        ${buildNumberedSection(7, 'Accommodation', sections['section_7_accommodation'] ?? '', variables)}
      </div>
      ${floorPlanPhotos.length > 0 ? renderPhotos(floorPlanPhotos) : ''}
      ${buildNumberedSection(8, 'Externally', sections['section_8_externally'] ?? '', variables)}
      ${renderPhotos(exteriorPhotos)}
      ${renderPhotos(gardenPhotos)}
      ${buildNumberedSection(9, 'Services', sections['section_9_services'] ?? '', variables)}
      ${epcCardHTML}
      ${buildNumberedSection(10, floorAreaTitle, sections['section_10_floor_area'] ?? '', variables)}
      ${buildNumberedSection(11, 'Tenure', sections['section_11_tenure'] ?? '', variables)}
      ${buildNumberedSection(12, 'Roads', sections['section_12_roads'] ?? '', variables)}
      ${buildNumberedSection(13, 'Condition & Further Details', sections['section_13_condition'] ?? '', variables)}
      ${renderPhotos(kitchenPhotos)}
      ${renderPhotos(bathroomPhotos)}
      ${renderPhotos(conditionPhotos)}
      ${buildNumberedSection(14, 'Structure and External', sections['section_14_structure'] ?? '', variables)}
      ${satelliteUrl ? (() => { photoCounter++; return buildInlinePhoto(satelliteUrl, 'Satellite view of the Property', photoCounter); })() : ''}
      ${buildNumberedSection(15, 'Amenity', sections['section_15_amenity'] ?? '', variables)}
      ${photoAppendixHTML}
    </div>
    <div class="page-break"></div>

    <!-- SECTION 16: Comparable Data -->
    <div class="content-area">
      <div class="report-section">
        <h2 class="section-heading">16. &nbsp;Comparable Data</h2>
        <div class="section-body">
          ${textToHTML(fillTemplate(templateSections.comparableDataIntro, variables))}
        </div>
        ${buildComparableTable(comparables)}
      </div>
    </div>
    <div class="page-break"></div>

    <!-- SECTION 17: Valuation + Signature -->
    <div class="content-area">
      <div class="report-section">
        <h2 class="section-heading">17. &nbsp;Valuation Conclusions and Market Commentary</h2>
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
      ${signatureHTML}
    </div>
    <div class="page-break"></div>

    <!-- APPENDIX 1 -->
    <div class="content-area">
      <h1 class="appendix-heading">Appendix 1</h1>
      <div class="appendix-body">
        ${textToHTML(templateSections.appendix1)}
      </div>
    </div>`;

  // --- Assemble final HTML using table layout for repeating header/footer ---

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHTML(propertyAddress)}</title>
  <style>
    ${getContentStyles()}
  </style>
</head>
<body>

  <!-- Fixed footer repeats on every printed page -->
  <div class="fixed-footer">${footerHTML}</div>

  <!-- Table with thead for repeating header -->
  <table class="page-table">
    <thead>
      <tr class="page-header-row"><td>${headerHTML}</td></tr>
    </thead>
    <tbody>
      ${wrapInPageBody(allContent)}
    </tbody>
  </table>

</body>
</html>`;
}

// ============================== LEGACY EXPORT ==============================

/**
 * Build the complete report as a single HTML document.
 * @deprecated Use buildCoverHTML + buildContentHTML + buildBackCoverHTMLDoc for proper page structure.
 */
export function buildReportHTML(data: {
  reportType: ReportType;
  sections: Record<string, string>;
  templateSections: ReportTemplate;
  comparables: Comparable[];
  clientDetails: ClientDetails;
  propertyDetails: { [key: string]: unknown };
  googleMapsData: GoogleMapsData | null;
  valuationFigure: number;
  valuationFigureWords: string;
  auctionReserve?: number;
  auctionReserveWords?: string;
  variables: Record<string, string>;
  reportPhotos?: ReportPhoto[];
}): string {
  // For backward compat, return cover + content + back cover in one document
  const coverHtml = buildCoverHTML(data);
  const contentHtml = buildContentHTML(data);
  const backCoverHtml = buildBackCoverHTMLDoc();
  // Simple concatenation — not ideal for PDF but works for preview
  return contentHtml; // Return content only for preview
}
