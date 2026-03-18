import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadGoogleTokens, getOAuthClient, saveGoogleTokens } from '@/lib/google-drive';

// GET /api/auth/google/token
// Returns a fresh access token for the Google Picker API (client-side use)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokens = await loadGoogleTokens(supabase, user.id);
  if (!tokens) {
    return NextResponse.json({ error: 'Google Drive not connected' }, { status: 400 });
  }

  try {
    const oauth2Client = getOAuthClient(tokens);

    // Force refresh if token is expired or about to expire
    const now = Date.now();
    if (!tokens.expiry_date || tokens.expiry_date < now + 60_000) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const merged = { ...tokens, ...credentials };
      await saveGoogleTokens(supabase, user.id, merged as Record<string, unknown>);
      return NextResponse.json({ access_token: credentials.access_token });
    }

    return NextResponse.json({ access_token: tokens.access_token });
  } catch (error) {
    console.error('[google-auth] Token refresh failed:', error);
    return NextResponse.json({ error: 'Token refresh failed. Please reconnect Google Drive.' }, { status: 401 });
  }
}
