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
let _corepropLogoWhite: string | null = null;
let _ricsLogo: string | null = null;
let _ricsLogoWhite: string | null = null;

/** CoreProp logo on dark background (for dark navy headers/covers) */
export function getCorepropLogoDataUrl(): string {
  if (_corepropLogo === null) _corepropLogo = loadBase64('coreprop-logo-small.png');
  return _corepropLogo;
}

/** CoreProp logo on white/light background (gold/brown text, transparent bg) */
export function getCorepropLogoWhiteDataUrl(): string {
  if (_corepropLogoWhite === null) _corepropLogoWhite = loadBase64('coreprop-logo-white.png');
  return _corepropLogoWhite;
}

export function getRicsLogoDataUrl(): string {
  if (_ricsLogo === null) _ricsLogo = loadBase64('rics-logo.png');
  return _ricsLogo;
}

export function getRicsLogoWhiteDataUrl(): string {
  if (_ricsLogoWhite === null) _ricsLogoWhite = loadBase64('rics-logo-white.png');
  return _ricsLogoWhite;
}
