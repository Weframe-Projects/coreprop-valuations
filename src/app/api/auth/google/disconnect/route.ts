import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { clearGoogleTokens } from '@/lib/google-drive';

// POST /api/auth/google/disconnect
// Disconnects Google Drive by clearing stored tokens
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await clearGoogleTokens(supabase, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[google-auth] Disconnect failed:', error);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
