import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens, saveGoogleTokens } from '@/lib/google-drive';

// GET /api/auth/google/callback
// Handles the OAuth callback from Google, stores tokens, redirects to settings
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    console.error('[google-auth] OAuth error:', error);
    return NextResponse.redirect(new URL('/settings?drive=error', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?drive=error', request.url));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await saveGoogleTokens(supabase, user.id, tokens as Record<string, unknown>);

    return NextResponse.redirect(new URL('/settings?drive=connected', request.url));
  } catch (err) {
    console.error('[google-auth] Token exchange failed:', err);
    return NextResponse.redirect(new URL('/settings?drive=error', request.url));
  }
}
