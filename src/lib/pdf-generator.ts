// ============================================================
// CoreProp Valuation Report - PDF Generator (Puppeteer)
// ============================================================

import type {
  ReportType,
  Comparable,
  ClientDetails,
  PropertyDetails,
  GoogleMapsData,
} from '@/lib/types';
import type { ReportTemplate } from '@/lib/report-templates';
import { buildReportHTML } from '@/lib/pdf-template';

// --- Types ---

export interface GeneratePDFInput {
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
}

// --- PDF Generation ---

/**
 * Generate a PDF buffer from the full report data.
 *
 * 1. Builds an HTML string from the report data using `buildReportHTML`.
 * 2. Launches a headless Puppeteer browser and renders the HTML to an A4 PDF.
 * 3. Returns the PDF as a Node.js Buffer.
 *
 * Puppeteer is imported dynamically so that Next.js does not attempt to bundle
 * it during client-side compilation.
 */
export async function generatePDF(data: GeneratePDFInput): Promise<Buffer> {
  // Build the complete HTML document
  let html = buildReportHTML(data);

  // Convert relative image paths to absolute URLs so Puppeteer can resolve them.
  // In development this is http://localhost:3000, in production it would be the
  // actual domain.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  html = html.replace(/src="\/(?!\/)/g, `src="${baseUrl}/`);

  // Dynamic import for Next.js compatibility (Puppeteer is server-only)
  const puppeteer = await import('puppeteer');

  let browser;
  try {
    browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // Set the HTML content. waitUntil: 'networkidle2' allows up to 2 open
    // connections (more forgiving than networkidle0 for slow image loads).
    await page.setContent(html, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    });

    // Generate the PDF
    const pdfUint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '25mm',
        right: '25mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width: 100%; text-align: center; font-size: 8pt; color: #999; padding: 0 25mm;">
          <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
    });

    // Puppeteer returns a Uint8Array; convert to a Node Buffer
    return Buffer.from(pdfUint8Array);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
