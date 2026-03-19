// ============================================================
// CoreProp Valuation Report - Word Document (.docx) Generator
// Matches the exact structure of real CoreProp reports:
// Cover Page → Sections 1-17 → Signature → Appendix → Back Cover
// ============================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  PageBreak,
  ImageRun,
  convertMillimetersToTwip,
  Header,
  Footer,
  TabStopPosition,
  TabStopType,
  SectionType,
  VerticalAlign,
  HeightRule,
} from 'docx';
import { readFileSync } from 'fs';
import { join } from 'path';

import type {
  ReportType,
  Comparable,
  ClientDetails,
  GoogleMapsData,
} from '@/lib/types';
import { isAuctionType, isIHTType } from '@/lib/types';
import type { ReportTemplate } from '@/lib/report-templates';
import { fillTemplate } from '@/lib/report-templates';
import type { GeneratePDFInput } from '@/lib/pdf-generator';
import type { ReportPhoto } from '@/lib/pdf-template';
import { format, parseISO } from 'date-fns';

// Re-use the same input type as the PDF generator
export type GenerateDocxInput = GeneratePDFInput;

// --- Constants ---

const FONT = 'Arial';
const FONT_SIZE = 21; // 10.5pt in half-points
const NAVY = '1a2e3b';
const GOLD = 'c49a6c';
const GREY = '555555';
const LIGHT_BG = 'f4f1ec';

// --- Logo buffer helpers ---

function loadLogoBuffer(filename: string): Buffer | null {
  try {
    return readFileSync(join(process.cwd(), 'public', filename));
  } catch {
    return null;
  }
}

let _corepropLogoBuf: Buffer | null | undefined;
let _ricsLogoBuf: Buffer | null | undefined;

function getCorepropLogoBuffer(): Buffer | null {
  if (_corepropLogoBuf === undefined) _corepropLogoBuf = loadLogoBuffer('coreprop-logo.png');
  return _corepropLogoBuf;
}

function getRicsLogoBuffer(): Buffer | null {
  if (_ricsLogoBuf === undefined) _ricsLogoBuf = loadLogoBuffer('rics-logo-gold.png');
  return _ricsLogoBuf;
}

// --- Helpers ---

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

async function fetchImageBuffer(url: string | null, baseUrl: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const fullUrl = url.startsWith('/') ? `${baseUrl}${url}` : url;
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function splitParagraphs(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function textToRuns(text: string): TextRun[] {
  const parts = text.split(/(\[[^\]]+\])/g);
  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        return new TextRun({
          text: part,
          font: FONT,
          size: FONT_SIZE,
          bold: true,
          color: 'FF0000',
          highlight: 'yellow',
        });
      }
      return new TextRun({ text: part, font: FONT, size: FONT_SIZE });
    });
}

function textToParagraphs(text: string, variables?: Record<string, string>): Paragraph[] {
  const filled = variables ? fillTemplate(text, variables) : text;
  return splitParagraphs(filled).map(
    (p) =>
      new Paragraph({
        spacing: { after: 160 },
        children: textToRuns(p),
      }),
  );
}

// --- Section Builders ---

function buildNumberedSectionHeading(sectionNumber: number, title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text: `${sectionNumber}.  ${title}`,
        bold: true,
        font: FONT,
        size: FONT_SIZE, // 10.5pt — matching body text
        color: '000000',
      }),
    ],
  });
}

function buildNumberedSection(
  sectionNumber: number,
  title: string,
  content: string,
  variables: Record<string, string>,
): Paragraph[] {
  if (!content) return [];
  return [buildNumberedSectionHeading(sectionNumber, title), ...textToParagraphs(content, variables)];
}

// --- Photo Section Builder ---

function makePhotoSection(
  buf: Buffer | null,
  altText: string,
): Paragraph[] {
  if (!buf) {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [
          new TextRun({
            text: `[${altText} - image not available]`,
            italics: true,
            font: FONT,
            size: FONT_SIZE,
            color: '999999',
          }),
        ],
      }),
    ];
  }

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 240 },
      children: [
        new ImageRun({
          data: buf,
          transformation: { width: 480, height: 320 },
          type: 'png',
        }),
      ],
    }),
  ];
}

// --- Comparable Table Builder ---

function buildComparableTable(comparables: Comparable[]): (Paragraph | Table)[] {
  const selected = comparables.filter((c) => c.isSelected);
  if (selected.length === 0) {
    return [
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: 'No comparable evidence selected.',
            italics: true,
            font: FONT,
            size: FONT_SIZE,
          }),
        ],
      }),
    ];
  }

  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
    left: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
    right: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Date', 'Address', 'Type', 'Sale Price'].map(
      (text) =>
        new TableCell({
          shading: { fill: NAVY, type: ShadingType.SOLID, color: NAVY },
          borders: cellBorders,
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  bold: true,
                  color: 'ffffff',
                  size: FONT_SIZE,
                  font: FONT,
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const dataRows = selected.map((comp, idx) => {
    const dateText = comp.status === 'SOLD'
      ? `SOLD  ${formatDate(comp.saleDate)}`
      : `${comp.status}  ${formatDate(comp.saleDate)}`;

    // AI descriptions already include floor area — don't duplicate it
    const descAlreadyHasArea = comp.description && comp.floorArea &&
      comp.description.toLowerCase().includes(`${comp.floorArea}m`);

    const floorAreaText = (!descAlreadyHasArea && comp.floorArea)
      ? `${comp.floorArea}m² (${comp.floorAreaSource === 'epc' ? 'EPC' : comp.floorAreaSource === 'agent_floorplan' ? 'agent floorplan' : 'estimated'})`
      : '';

    const typeDesc = [floorAreaText, comp.description].filter(Boolean).join('\n');

    const pricePerSqm = comp.pricePerSqm
      ? `${formatCurrency(Math.round(comp.pricePerSqm))}/m²`
      : '';

    const priceText = [formatCurrency(comp.salePrice), pricePerSqm]
      .filter(Boolean)
      .join('\n');

    const rowShading = idx % 2 === 1
      ? { fill: 'f8f7f5', type: ShadingType.SOLID, color: 'f8f7f5' }
      : undefined;

    const makeCell = (text: string, alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
      new TableCell({
        shading: rowShading,
        borders: cellBorders,
        children: text.split('\n').map(
          (line) =>
            new Paragraph({
              alignment,
              children: [
                new TextRun({ text: line, font: FONT, size: FONT_SIZE }),
              ],
            }),
        ),
      });

    return new TableRow({
      children: [
        makeCell(dateText),
        makeCell(comp.address),
        makeCell(typeDesc),
        makeCell(priceText, AlignmentType.RIGHT),
      ],
    });
  });

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
  ];
}

// --- Valuation Box ---

function buildValuationBox(
  amount: number,
  words: string,
): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 400, after: 80 },
      border: {
        left: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 },
      },
      shading: { fill: LIGHT_BG, type: ShadingType.SOLID, color: LIGHT_BG },
      children: [
        new TextRun({
          text: formatCurrency(amount),
          bold: true,
          font: FONT,
          size: 32,
          color: NAVY,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 400 },
      border: {
        left: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 },
      },
      shading: { fill: LIGHT_BG, type: ShadingType.SOLID, color: LIGHT_BG },
      children: [
        new TextRun({
          text: `(${words})`,
          italics: true,
          font: FONT,
          size: 20,
          color: GREY,
        }),
      ],
    }),
  ];
}

// --- Signature Block ---

function buildSignatureBlock(
  signatureBlock: string,
  valuationDate: string,
): Paragraph[] {
  const lines = signatureBlock.split('\n');
  const sigName = lines[0] ?? '';
  const sigTitles = lines.slice(1).map((l) => l.trim()).filter(Boolean);

  return [
    new Paragraph({
      spacing: { before: 600 },
      children: [
        new TextRun({ text: 'Signed:', font: FONT, size: FONT_SIZE }),
      ],
    }),
    // Signature space
    new Paragraph({ spacing: { after: 600 }, children: [] }),
    // Name
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: sigName,
          bold: true,
          font: FONT,
          size: FONT_SIZE,
          color: NAVY,
        }),
      ],
    }),
    // Titles
    ...sigTitles.map(
      (t) =>
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: t, font: FONT, size: FONT_SIZE, color: GREY }),
          ],
        }),
    ),
    // Date
    new Paragraph({
      spacing: { before: 240, after: 200 },
      children: [
        new TextRun({
          text: `Date of Report: ${valuationDate}`,
          font: FONT,
          size: FONT_SIZE,
          color: GREY,
        }),
      ],
    }),
  ];
}

// --- Cover Page ---

function buildCoverPage(data: {
  reportType: ReportType;
  propertyAddress: string;
  clientName: string;
  deceasedName: string;
  dateOfDeath: string;
  referenceNumber: string;
  valuationDate: string;
}): Paragraph[] {
  const { reportType, propertyAddress, clientName, deceasedName, dateOfDeath, referenceNumber, valuationDate } = data;

  const reportTypeDisplay = getReportTypeDisplay(reportType);

  // Build all cover content as paragraphs inside ONE table cell with navy shading.
  // This is the only way to get a true full-page background color in Word.
  const cellChildren: Paragraph[] = [];
  const navyCellShading = { type: ShadingType.CLEAR, fill: NAVY };

  // Spacing at top
  cellChildren.push(new Paragraph({ spacing: { after: 1600 }, children: [new TextRun({ text: ' ', font: FONT, size: 4, color: NAVY })] }));

  // Brand logo
  const coverLogoBuf = getCorepropLogoBuffer();
  if (coverLogoBuf) {
    cellChildren.push(
      new Paragraph({
        spacing: { after: 600 },
        children: [
          new ImageRun({ data: coverLogoBuf, transformation: { width: 180, height: 132 }, type: 'png' }),
        ],
      }),
    );
  } else {
    cellChildren.push(
      new Paragraph({ children: [new TextRun({ text: 'The', font: FONT, size: 36, color: GOLD })] }),
      new Paragraph({ children: [new TextRun({ text: 'CoreProp', font: FONT, size: 56, bold: true, color: 'FFFFFF' })] }),
      new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: 'Group', font: FONT, size: 36, color: GOLD })] }),
    );
  }

  // Report type
  cellChildren.push(
    new Paragraph({
      spacing: { after: 600 },
      children: [new TextRun({ text: reportTypeDisplay, font: FONT, size: 32, color: 'FFFFFF' })],
    }),
  );

  // Property address
  cellChildren.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: `Valuation advice on ${propertyAddress} ('the Property')`, font: FONT, size: 22, color: 'E0E0E0' })],
    }),
  );

  // Client / Estate line
  if (isIHTType(reportType) && deceasedName) {
    cellChildren.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: `On behalf of the Estate of the late ${deceasedName} c/o ${clientName}`, font: FONT, size: 22, color: 'E0E0E0' })],
      }),
    );
    if (dateOfDeath) {
      cellChildren.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `Date of death \u2013 ${formatDateLong(dateOfDeath)}`, font: FONT, size: 22, color: 'E0E0E0' })],
        }),
      );
    }
  } else {
    cellChildren.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: `On behalf of ${clientName}`, font: FONT, size: 22, color: 'E0E0E0' })],
      }),
    );
  }

  // Reference and date
  cellChildren.push(
    new Paragraph({
      spacing: { before: 400, after: 40 },
      children: [new TextRun({ text: `Our ref: ${referenceNumber}`, font: FONT, size: FONT_SIZE, color: GOLD })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: formatDateLong(valuationDate), font: FONT, size: FONT_SIZE, color: GOLD })],
    }),
  );

  // Spacers to push footer to bottom
  for (let i = 0; i < 12; i++) {
    cellChildren.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: ' ', font: FONT, size: 4, color: NAVY })] }));
  }

  // Contact info at bottom
  cellChildren.push(
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: '3a5a6b', space: 4 } },
      spacing: { after: 0 },
      children: [
        new TextRun({ text: 'p: +44 (0)20 8050 5060', font: FONT, size: 14, color: 'C0C0C0' }),
        new TextRun({ text: '    ', font: FONT, size: 14 }),
        new TextRun({ text: 'First Floor, 4 Pentonville Road, London, N1 9HF', font: FONT, size: 14, color: 'C0C0C0' }),
      ],
    }),
    new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'e: info@coreprop.co.uk', font: FONT, size: 14, color: 'C0C0C0' })] }),
    new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'w: www.coreprop.co.uk', font: FONT, size: 14, color: 'C0C0C0' })] }),
  );

  // Wrap everything in a single full-page table with navy cell shading
  const fullPageWidth = convertMillimetersToTwip(210);
  // Slightly less than full page to avoid overflow onto a blank second page
  const fullPageHeight = convertMillimetersToTwip(290);
  const noCellBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: NAVY },
    bottom: { style: BorderStyle.NONE, size: 0, color: NAVY },
    left: { style: BorderStyle.NONE, size: 0, color: NAVY },
    right: { style: BorderStyle.NONE, size: 0, color: NAVY },
  };

  const coverTable = new Table({
    width: { size: fullPageWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        height: { value: fullPageHeight, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            shading: navyCellShading,
            borders: noCellBorders,
            width: { size: fullPageWidth, type: WidthType.DXA },
            margins: {
              top: convertMillimetersToTwip(15),
              bottom: convertMillimetersToTwip(10),
              left: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25),
            },
            children: cellChildren,
          }),
        ],
      }),
    ],
  });

  return [coverTable] as unknown as Paragraph[];
}

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

/**
 * Find photos matching a label (case-insensitive partial match)
 */
function findPhotos(photos: ReportPhoto[], ...labelPatterns: string[]): ReportPhoto[] {
  return photos.filter((p) =>
    labelPatterns.some((pattern) =>
      p.label.toLowerCase().includes(pattern.toLowerCase()),
    ),
  );
}

// ============================================================
// Main Export
// ============================================================

export async function generateDocx(data: GenerateDocxInput): Promise<Buffer> {
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

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || 3000}`;

  const propertyAddress = variables['PROPERTY_ADDRESS'] ?? '';
  const referenceNumber = clientDetails.referenceNumber ?? '';
  const valuationDate =
    variables['VALUATION_DATE'] ?? clientDetails.valuationDate ?? '';

  const isIHT =
    reportType === 'iht_inspected' || reportType === 'iht_desktop';
  const floorAreaTitle = isIHT
    ? 'Total Floor Area'
    : 'Total Superficial Floor Area';

  // Valuation conclusion text
  const valuationConclusionText = fillTemplate(
    templateSections.valuationConclusion,
    {
      ...variables,
      VALUATION_FIGURE: valuationFigure.toLocaleString('en-GB'),
      VALUATION_WORDS: valuationFigureWords,
    },
  );

  // --- Fetch images in parallel ---
  const photoBuffers = new Map<string, Buffer | null>();

  // Fetch Google Maps images
  const [streetViewBuf, locationMapBuf] = await Promise.all([
    fetchImageBuffer(googleMapsData?.streetViewUrl ?? null, baseUrl),
    fetchImageBuffer(googleMapsData?.locationMapUrl ?? null, baseUrl),
  ]);

  // Fetch report photos in parallel
  const photoFetchPromises = reportPhotos.map(async (p) => {
    const buf = await fetchImageBuffer(p.url, baseUrl);
    photoBuffers.set(p.url, buf);
  });
  await Promise.all(photoFetchPromises);

  // Find photos by category
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

  // Helper to render photos as paragraphs
  function renderPhotoParagraphs(photos: ReportPhoto[]): Paragraph[] {
    const paras: Paragraph[] = [];
    for (const p of photos) {
      const buf = photoBuffers.get(p.url);
      paras.push(...makePhotoSection(buf ?? null, p.label));
    }
    return paras;
  }

  // --- Build all document children ---

  // ===== COVER PAGE (Section 1 — no header/footer) =====
  const coverChildren: Paragraph[] = buildCoverPage({
    reportType,
    propertyAddress,
    clientName: clientDetails.clientName,
    deceasedName: clientDetails.deceasedName,
    dateOfDeath: clientDetails.dateOfDeath,
    referenceNumber,
    valuationDate: clientDetails.valuationDate,
  });

  // ===== CONTENT PAGES (Section 2 — branded header/footer) =====
  const children: Paragraph[] = [];

  // ===== NUMBERED SECTIONS 1-4 (Template) =====
  children.push(
    ...buildNumberedSection(1, 'Instructions', templateSections.instructions, variables),
  );
  children.push(
    ...buildNumberedSection(2, 'Basis of Valuation', templateSections.basisOfValuation, variables),
  );
  children.push(
    ...buildNumberedSection(3, 'Assumptions and Sources of Information', templateSections.assumptionsAndSources, variables),
  );

  // Location map after assumptions (if available)
  if (locationMapBuf) {
    children.push(...makePhotoSection(locationMapBuf, 'Location map'));
  }

  children.push(
    ...buildNumberedSection(4, 'Inspection', templateSections.inspection, variables),
  );

  // ===== NUMBERED SECTIONS 5-15 (AI Generated) =====
  children.push(
    ...buildNumberedSection(5, 'Description of Property', sections['section_5_description'] ?? '', variables),
  );
  children.push(
    ...buildNumberedSection(6, 'Construction', sections['section_6_construction'] ?? '', variables),
  );

  // Front Elevation Photo (inline before Accommodation)
  if (frontPhotos.length > 0) {
    children.push(...renderPhotoParagraphs(frontPhotos));
  } else {
    children.push(...makePhotoSection(streetViewBuf, 'Front elevation of the Property'));
  }

  children.push(
    ...buildNumberedSection(7, 'Accommodation', sections['section_7_accommodation'] ?? '', variables),
  );

  // Floor plan photos after Accommodation
  if (floorPlanPhotos.length > 0) {
    children.push(...renderPhotoParagraphs(floorPlanPhotos));
  }

  children.push(
    ...buildNumberedSection(8, 'Externally', sections['section_8_externally'] ?? '', variables),
  );

  // Exterior / garden photos
  children.push(...renderPhotoParagraphs(exteriorPhotos));
  children.push(...renderPhotoParagraphs(gardenPhotos));

  children.push(
    ...buildNumberedSection(9, 'Services', sections['section_9_services'] ?? '', variables),
  );
  children.push(
    ...buildNumberedSection(10, floorAreaTitle, sections['section_10_floor_area'] ?? '', variables),
  );
  children.push(
    ...buildNumberedSection(11, 'Tenure', sections['section_11_tenure'] ?? '', variables),
  );
  children.push(
    ...buildNumberedSection(12, 'Roads', sections['section_12_roads'] ?? '', variables),
  );
  children.push(
    ...buildNumberedSection(13, 'Condition & Further Details', sections['section_13_condition'] ?? '', variables),
  );

  // Condition / Kitchen / Bathroom photos
  children.push(...renderPhotoParagraphs(kitchenPhotos));
  children.push(...renderPhotoParagraphs(bathroomPhotos));
  children.push(...renderPhotoParagraphs(conditionPhotos));

  children.push(
    ...buildNumberedSection(14, 'Structure and External', sections['section_14_structure'] ?? '', variables),
  );
  children.push(
    ...buildNumberedSection(15, 'Amenity', sections['section_15_amenity'] ?? '', variables),
  );

  // Unplaced photos
  if (unplacedPhotos.length > 0) {
    children.push(...renderPhotoParagraphs(unplacedPhotos));
  }

  // ===== 16. COMPARABLE DATA =====
  children.push(buildNumberedSectionHeading(16, 'Comparable Data'));
  children.push(
    ...textToParagraphs(templateSections.comparableDataIntro, variables),
  );

  const compElements = buildComparableTable(comparables);
  for (const el of compElements) {
    (children as unknown as (Paragraph | Table)[]).push(el);
  }

  // ===== 17. VALUATION CONCLUSIONS & MARKET COMMENTARY =====
  children.push(
    buildNumberedSectionHeading(17, 'Valuation Conclusions and Market Commentary'),
  );
  children.push(...textToParagraphs(templateSections.marketCommentary));
  children.push(...textToParagraphs(valuationConclusionText));
  children.push(...buildValuationBox(valuationFigure, valuationFigureWords));

  // ===== AUCTION RESERVE (if applicable) =====
  if (
    isAuctionType(reportType) &&
    templateSections.auctionReserveSection &&
    auctionReserve
  ) {
    const auctionText = fillTemplate(templateSections.auctionReserveSection, {
      ...variables,
      AUCTION_RESERVE: auctionReserve.toLocaleString('en-GB'),
      AUCTION_RESERVE_WORDS: auctionReserveWords ?? '',
    });
    children.push(buildNumberedSectionHeading(18, 'Auction Reserve'));
    children.push(...textToParagraphs(auctionText));
    children.push(
      ...buildValuationBox(auctionReserve, auctionReserveWords ?? ''),
    );
  }

  // ===== SIGNATURE =====
  children.push(
    ...buildSignatureBlock(templateSections.signatureBlock, valuationDate),
  );

  // ===== PAGE BREAK + APPENDIX 1 =====
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
  );

  children.push(
    new Paragraph({
      spacing: { after: 320 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 6 },
      },
      children: [
        new TextRun({
          text: 'Appendix 1',
          bold: true,
          font: FONT,
          size: 26,
          color: NAVY,
        }),
      ],
    }),
  );

  // Appendix body
  const appendixParas = splitParagraphs(templateSections.appendix1);
  for (const p of appendixParas) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: p, font: FONT, size: FONT_SIZE }),
        ],
      }),
    );
  }

  // ===== BUILD DOCUMENT (two sections) =====

  // Load logo buffers for header/footer
  const corepropLogoBuf = getCorepropLogoBuffer();
  const ricsLogoBuf = getRicsLogoBuffer();

  // Header: Navy banner as a full-width TABLE (reliable full-bleed in Word)
  // then spacer + address bar as regular paragraphs.
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };
  const navyCellShading = { type: ShadingType.CLEAR, fill: NAVY };
  const marginTwip = convertMillimetersToTwip(25);
  const fullPageWidthTwip = convertMillimetersToTwip(210);

  // Header: single full-bleed navy table containing logo, text, and address bar
  const headerCellChildren: Paragraph[] = [];

  // Logo
  if (corepropLogoBuf) {
    headerCellChildren.push(
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new ImageRun({
            data: corepropLogoBuf,
            transformation: { width: 95, height: 70 },
            type: 'png',
          }),
        ],
      }),
    );
  } else {
    headerCellChildren.push(
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new TextRun({ text: 'The ', font: FONT, size: 16, color: GOLD }),
          new TextRun({ text: 'CoreProp ', font: FONT, size: 20, bold: true, color: 'FFFFFF' }),
          new TextRun({ text: 'Group', font: FONT, size: 16, color: GOLD }),
        ],
      }),
    );
  }

  // Chartered Surveyors + Specialist Valuers (right-aligned using tab)
  headerCellChildren.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: '\t', font: FONT }),
        new TextRun({ text: 'Chartered Surveyors', font: FONT, size: FONT_SIZE, bold: true, color: 'FFFFFF' }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: convertMillimetersToTwip(170) }],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: '\t', font: FONT }),
        new TextRun({ text: 'Specialist Valuers \u2013 Regulated by RICS', font: FONT, size: 16, color: 'C0C0C0' }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: convertMillimetersToTwip(170) }],
    }),
  );

  // Address bar with gold divider
  headerCellChildren.push(
    new Paragraph({
      spacing: { before: 120, after: 0 },
      border: { top: { style: BorderStyle.SINGLE, size: 2, color: GOLD, space: 4 } },
      children: [
        new TextRun({ text: propertyAddress, font: FONT, size: 20, color: GOLD }),
      ],
    }),
  );

  const headerTable = new Table({
    width: { size: fullPageWidthTwip, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    indent: { size: -marginTwip, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: navyCellShading,
            borders: noBorders,
            width: { size: fullPageWidthTwip, type: WidthType.DXA },
            margins: {
              top: convertMillimetersToTwip(3),
              bottom: convertMillimetersToTwip(3),
              left: convertMillimetersToTwip(20),
              right: convertMillimetersToTwip(10),
            },
            children: headerCellChildren,
          }),
        ],
      }),
    ],
  });

  const headerChildren: (Paragraph | Table)[] = [headerTable];

  // Footer: full-bleed navy table with contact info + RICS logo inside
  const footerCellChildren: Paragraph[] = [
    // Divider line
    new Paragraph({
      spacing: { after: 80 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: '3a5a6b', space: 4 } },
      children: [],
    }),
    // Phone + address
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: `p: ${data.firmSettings?.phone || '+44 (0)20 8050 5060'}`, font: FONT, size: 15, color: 'C0C0C0' }),
        new TextRun({ text: '          ', font: FONT, size: 15 }),
        new TextRun({ text: 'First Floor,', font: FONT, size: 15, color: 'C0C0C0' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: `e: ${data.firmSettings?.email || 'info@coreprop.co.uk'}`, font: FONT, size: 15, color: 'C0C0C0' }),
        new TextRun({ text: '          ', font: FONT, size: 15 }),
        new TextRun({ text: '4 Pentonville Road,', font: FONT, size: 15, color: 'C0C0C0' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({ text: 'w: www.coreprop.co.uk', font: FONT, size: 15, color: 'C0C0C0' }),
        new TextRun({ text: '          ', font: FONT, size: 15 }),
        new TextRun({ text: 'London, N1 9HF', font: FONT, size: 15, color: 'C0C0C0' }),
      ],
    }),
  ];

  // Add RICS logo floating right
  if (ricsLogoBuf) {
    footerCellChildren[1].addChildElement(
      new ImageRun({
        data: ricsLogoBuf,
        transformation: { width: 80, height: 32 },
        type: 'png',
        floating: {
          horizontalPosition: { relative: 'margin', align: 'right' },
          verticalPosition: { relative: 'paragraph', offset: 0 },
          wrap: { type: 1, side: 'left' },
        },
      }),
    );
  }

  const footerTable = new Table({
    width: { size: fullPageWidthTwip, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    indent: { size: -marginTwip, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: navyCellShading,
            borders: noBorders,
            width: { size: fullPageWidthTwip, type: WidthType.DXA },
            margins: {
              top: convertMillimetersToTwip(3),
              bottom: convertMillimetersToTwip(3),
              left: convertMillimetersToTwip(20),
              right: convertMillimetersToTwip(20),
            },
            children: footerCellChildren,
          }),
        ],
      }),
    ],
  });
  const footerChildren: (Paragraph | Table)[] = [footerTable];

  const pageSize = {
    width: convertMillimetersToTwip(210),
    height: convertMillimetersToTwip(297),
  };
  const pageMargins = {
    top: convertMillimetersToTwip(35),
    bottom: convertMillimetersToTwip(30),
    left: convertMillimetersToTwip(25),
    right: convertMillimetersToTwip(25),
    header: 0,  // header starts at very top edge
    footer: 0,  // footer starts at very bottom edge
  };

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: FONT_SIZE },
          paragraph: { spacing: { after: 160 } },
        },
      },
    },
    sections: [
      // Section 1: Cover page — no header/footer, zero margins (table handles padding)
      {
        properties: {
          page: {
            size: pageSize,
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
          },
        },
        children: coverChildren as unknown as (Paragraph | Table)[],
      },
      // Section 2: Content pages — branded header & footer
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { size: pageSize, margin: pageMargins },
        },
        headers: {
          default: new Header({ children: headerChildren }),
        },
        footers: {
          default: new Footer({ children: footerChildren }),
        },
        children: children as unknown as (Paragraph | Table)[],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
