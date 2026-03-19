// Auto-generated base64 logo data for PDF/DOCX embedding
// These are embedded directly to avoid network dependency during PDF generation

import { readFileSync } from 'fs';
import { join } from 'path';

function loadBase64(filename: string): string {
  try {
    const filePath = join(process.cwd(), 'public', filename);
    const buffer = readFileSync(filePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

// Lazy-loaded and cached
let _corepropLogo: string | null = null;
let _ricsLogo: string | null = null;
let _ricsLogoWhite: string | null = null;
let _ricsLogoGold: string | null = null;

/** CoreProp "The CoreProp Group" logo (brown/gold textured text, transparent bg) — works on any background */
export function getCorepropLogoDataUrl(): string {
  if (_corepropLogo === null) _corepropLogo = loadBase64('coreprop-logo.png');
  return _corepropLogo;
}

/** @deprecated Use getCorepropLogoDataUrl() — same logo works on all backgrounds */
export function getCorepropLogoWhiteDataUrl(): string {
  return getCorepropLogoDataUrl();
}

/** RICS "Regulated by RICS" logo (black) */
export function getRicsLogoDataUrl(): string {
  if (_ricsLogo === null) _ricsLogo = loadBase64('rics-logo.png');
  return _ricsLogo;
}

/** RICS "Regulated by RICS" logo (white — for dark backgrounds) */
export function getRicsLogoWhiteDataUrl(): string {
  if (_ricsLogoWhite === null) _ricsLogoWhite = loadBase64('rics-logo-white.png');
  return _ricsLogoWhite;
}

/** RICS "Regulated by RICS" logo (gold — for footer, matches DOCX template) */
export function getRicsLogoGoldDataUrl(): string {
  if (_ricsLogoGold === null) _ricsLogoGold = loadBase64('rics-logo-gold.png');
  return _ricsLogoGold;
}
