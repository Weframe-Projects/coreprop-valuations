// ============================================================
// CoreProp Valuation Report - PDF Generator (Puppeteer)
// Generates 3 separate PDFs (cover, content, back cover) and
// merges them with pdf-lib for proper page headers/footers.
//
// Environment-aware: uses @sparticuz/chromium on Vercel/serverless,
// falls back to full puppeteer for local development.
// ============================================================

import type {
  ReportType,
  Comparable,
  ClientDetails,
  GoogleMapsData,
} from '@/lib/types';
import type { ReportTemplate } from '@/lib/report-templates';
import {
  buildCoverHTML,
  buildContentHTML,
  buildBackCoverHTMLDoc,
} from '@/lib/pdf-template';
import type { ReportPhoto } from '@/lib/pdf-template';
import { PDFDocument } from 'pdf-lib';

// --- Types ---

export interface GeneratePDFInput {
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
  firmSettings?: {
    phone?: string;
    email?: string;
    address?: string;
  };
}

// --- Helpers ---

/** Convert relative image paths (/api/...) to absolute URLs for Puppeteer */
function absoluteImageUrls(html: string, baseUrl: string): string {
  return html.replace(/src="\/(?!\/)/g, `src="${baseUrl}/`);
}

/**
 * Launch a headless browser.
 * On Vercel/AWS Lambda: uses puppeteer-core + @sparticuz/chromium
 * Locally: uses full puppeteer with its bundled Chromium
 */
async function launchBrowser() {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteerCore = await import('puppeteer-core');
    return puppeteerCore.default.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    const puppeteer = await import('puppeteer');
    return puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
}

// --- PDF Generation ---

/**
 * Generate a PDF buffer from the full report data.
 *
 * Three-part strategy for professional page layout:
 *  1. Cover page    → zero margins, full-bleed dark background
 *  2. Content pages → zero margins, header/footer embedded in HTML via CSS table trick
 *  3. Back cover    → zero margins, full-bleed dark background
 *
 * The three PDFs are merged with pdf-lib into a single document.
 */
export async function generatePDF(data: GeneratePDFInput): Promise<Buffer> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  // Build 3 HTML documents
  const coverHtml = absoluteImageUrls(buildCoverHTML(data), baseUrl);
  const contentHtml = absoluteImageUrls(buildContentHTML(data), baseUrl);
  const backCoverHtml = absoluteImageUrls(buildBackCoverHTMLDoc(data.firmSettings), baseUrl);

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Helper: load HTML content into the page.
    async function loadPageContent(html: string, imageWaitMs = 3_000) {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await new Promise((resolve) => setTimeout(resolve, imageWaitMs));
    }

    // --------------------------------------------------
    // 1. COVER PAGE (full-bleed, no header/footer)
    // --------------------------------------------------
    await loadPageContent(coverHtml, 8_000);
    const coverPdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    });

    // --------------------------------------------------
    // 2. CONTENT PAGES
    // Header/footer are embedded directly in the HTML using a CSS
    // table layout trick (<thead>/<tfoot> repeat on every printed page).
    // This gives full control over backgrounds, colors, and layout
    // without Puppeteer's quirky displayHeaderFooter.
    // --------------------------------------------------
    await loadPageContent(contentHtml, 15_000);
    const contentPdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '0mm', bottom: '16mm', left: '0mm', right: '0mm' },
    });

    // --------------------------------------------------
    // 3. BACK COVER (full-bleed, no header/footer)
    // --------------------------------------------------
    await loadPageContent(backCoverHtml, 5_000);
    const backCoverPdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    });

    // --------------------------------------------------
    // 4. MERGE all three PDFs
    // --------------------------------------------------
    const mergedDoc = await PDFDocument.create();

    for (const pdfBytes of [coverPdf, contentPdf, backCoverPdf]) {
      const doc = await PDFDocument.load(pdfBytes);
      const pages = await mergedDoc.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => mergedDoc.addPage(p));
    }

    const mergedBytes = await mergedDoc.save();
    return Buffer.from(mergedBytes);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
