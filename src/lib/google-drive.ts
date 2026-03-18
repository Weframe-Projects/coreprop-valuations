// ============================================================
// Google Drive Integration
// OAuth 2.0 + Drive API v3 wrapper for uploading reports
// and photos to existing surveyor Drive folders.
// ============================================================

import { google, type drive_v3 } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- OAuth2 Client ---

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',     // Create/edit files the app creates
  'https://www.googleapis.com/auth/drive.readonly',  // Browse folders (for Picker)
];

/**
 * Create an OAuth2 client from env vars.
 * Optionally pre-load tokens from stored credentials.
 */
export function getOAuthClient(tokens?: {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error('Google Drive credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (tokens) {
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });
  }

  return oauth2Client;
}

/**
 * Generate the Google OAuth consent URL.
 */
export function getAuthUrl(state?: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: state || '',
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

// --- Token Management ---

/**
 * Load stored Google tokens from Supabase Auth user metadata.
 * Uses /auth/v1/ endpoint — completely bypasses PostgREST schema cache.
 */
export async function loadGoogleTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<{ access_token: string; refresh_token: string; expiry_date?: number } | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const tokens = user?.user_metadata?.google_tokens as Record<string, unknown> | undefined;
    // Require access_token (not refresh_token) — Google sometimes omits refresh_token on reconnects.
    // The OAuth2 client can still use access_token alone for short-lived calls (folder listing etc.).
    if (!tokens?.access_token) {
      console.error('[loadGoogleTokens] No access_token in user metadata');
      return null;
    }
    return {
      access_token: tokens.access_token as string,
      refresh_token: (tokens.refresh_token as string) || '',
      expiry_date: tokens.expiry_date as number | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Save Google tokens in Supabase Auth user metadata.
 * Uses /auth/v1/ endpoint — completely bypasses PostgREST schema cache.
 */
export async function saveGoogleTokens(
  supabase: SupabaseClient,
  userId: string,
  tokens: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { google_tokens: tokens },
  });
  if (error) {
    console.error('[saveGoogleTokens] Failed:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Clear Google tokens from Supabase Auth user metadata.
 */
export async function clearGoogleTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase.auth.updateUser({
    data: { google_tokens: null },
  });
}

// --- Drive Operations ---

/**
 * Get an authenticated Drive client.
 * Auto-refreshes expired tokens and saves them back.
 */
async function getDriveClient(
  supabase: SupabaseClient,
  userId: string
): Promise<drive_v3.Drive | null> {
  const tokens = await loadGoogleTokens(supabase, userId);
  if (!tokens) {
    console.error('[getDriveClient] No tokens found — Drive not connected or access_token missing');
    return null;
  }

  const oauth2Client = getOAuthClient(tokens);

  // Listen for token refresh events and persist new tokens
  oauth2Client.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await saveGoogleTokens(supabase, userId, merged);
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Upload a file buffer to a specific Drive folder.
 * Returns the file ID and web view link.
 */
export async function uploadFileToDrive(
  supabase: SupabaseClient,
  userId: string,
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  try {
    const drive = await getDriveClient(supabase, userId);
    if (!drive) return null;

    const { Readable } = await import('stream');
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: readable,
      },
      fields: 'id,webViewLink',
    });

    return {
      fileId: res.data.id || '',
      webViewLink: res.data.webViewLink || '',
    };
  } catch (error) {
    console.error('[google-drive] Upload failed:', error);
    return null;
  }
}

/**
 * Create a subfolder inside a parent folder.
 * Returns the new folder's ID, or the existing folder's ID if it already exists.
 */
export async function createSubfolder(
  supabase: SupabaseClient,
  userId: string,
  parentFolderId: string,
  folderName: string
): Promise<string | null> {
  try {
    const drive = await getDriveClient(supabase, userId);
    if (!drive) return null;

    // Check if folder already exists
    const existing = await drive.files.list({
      q: `'${parentFolderId}' in parents and name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });

    if (existing.data.files && existing.data.files.length > 0) {
      return existing.data.files[0].id || null;
    }

    // Create new folder
    const res = await drive.files.create({
      requestBody: {
        name: folderName,
        parents: [parentFolderId],
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    return res.data.id || null;
  } catch (error) {
    console.error('[google-drive] Create subfolder failed:', error);
    return null;
  }
}

/**
 * List folders inside a parent folder (for folder picker).
 * When no parentFolderId is given, lists root-level folders.
 * `source` controls whether to list My Drive root or Shared With Me folders.
 */
export async function listFolders(
  supabase: SupabaseClient,
  userId: string,
  parentFolderId?: string,
  source: 'myDrive' | 'shared' = 'myDrive'
): Promise<{ id: string; name: string }[] | null> {
  try {
    const drive = await getDriveClient(supabase, userId);
    if (!drive) return null; // null = not connected (distinct from [] = connected but empty)

    let query: string;
    if (parentFolderId) {
      // Navigating inside a specific folder
      query = `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    } else if (source === 'shared') {
      // Root level — Shared with me folders
      query = `mimeType = 'application/vnd.google-apps.folder' and sharedWithMe = true and trashed = false`;
    } else {
      // Root level — My Drive folders
      query = `mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;
    }

    const res = await drive.files.list({
      q: query,
      fields: 'files(id,name)',
      orderBy: 'name',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return (res.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
    }));
  } catch (error) {
    console.error('[google-drive] List folders failed:', error);
    return [];
  }
}

/**
 * High-level: Upload a report file (PDF/DOCX) to the report's linked Drive folder.
 * Creates a Photos subfolder if uploading photos.
 * Non-blocking — call with .catch() for fire-and-forget.
 */
export async function syncReportFile(params: {
  supabase: SupabaseClient;
  userId: string;
  reportFolderId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  isPhoto?: boolean;
}): Promise<{ fileId: string; webViewLink: string } | null> {
  const { supabase, userId, reportFolderId, fileName, buffer, mimeType, isPhoto } = params;

  let targetFolderId = reportFolderId;

  // If it's a photo, upload to Photos/ subfolder
  if (isPhoto) {
    const photosFolderId = await createSubfolder(supabase, userId, reportFolderId, 'Photos');
    if (photosFolderId) {
      targetFolderId = photosFolderId;
    }
  }

  return uploadFileToDrive(supabase, userId, targetFolderId, fileName, buffer, mimeType);
}

/**
 * Get the actual name for a single folder by ID.
 * Used when user pastes a Drive folder URL — resolves the real folder name
 * so we can parse the address from it (e.g. "P1 - 66 Swiftsden Way, Bromley, BR1 4NT").
 */
export async function getFolderName(
  supabase: SupabaseClient,
  userId: string,
  folderId: string
): Promise<string | null> {
  try {
    const drive = await getDriveClient(supabase, userId);
    if (!drive) return null;

    const res = await drive.files.get({
      fileId: folderId,
      fields: 'name',
      supportsAllDrives: true,
    });

    return res.data.name || null;
  } catch (error) {
    console.error('[google-drive] Get folder name failed:', error);
    return null;
  }
}

/**
 * List all files (non-folders) inside a folder.
 * Returns id, name, and mimeType for each file.
 */
export async function listFolderFiles(
  supabase: SupabaseClient,
  userId: string,
  folderId: string
): Promise<{ id: string; name: string; mimeType: string }[] | null> {
  try {
    const drive = await getDriveClient(supabase, userId);
    if (!drive) return null;

    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name,mimeType)',
      orderBy: 'name',
      pageSize: 50,
    });

    return (res.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
      mimeType: f.mimeType || '',
    }));
  } catch (error) {
    console.error('[google-drive] List folder files failed:', error);
    return null;
  }
}

/**
 * Check if Google Drive is connected for a user.
 */
export async function isDriveConnected(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const tokens = await loadGoogleTokens(supabase, userId);
  return tokens !== null;
}
