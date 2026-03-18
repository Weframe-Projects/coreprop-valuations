import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthUrl } from '@/lib/google-drive';

// GET /api/auth/google/redirect
// Redirects user to Google OAuth consent screen
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = getAuthUrl(user.id);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('[google-auth] Failed to generate auth URL:', error);
    return NextResponse.json(
      { error: 'Google Drive not configured. Contact admin.' },
      { status: 500 }
    );
  }
}
