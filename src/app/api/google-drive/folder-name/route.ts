import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getFolderName } from '@/lib/google-drive';

/**
 * GET /api/google-drive/folder-name?folderId=xxx
 *
 * Resolves a Google Drive folder ID to its actual name.
 * Used when user pastes a Drive URL — we fetch the real folder name
 * so address can be parsed from it (e.g. "P1 - 66 Swiftsden Way, Bromley, BR1 4NT").
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folderId');

  if (!folderId) {
    return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
  }

  const name = await getFolderName(supabase, user.id, folderId);

  if (name === null) {
    return NextResponse.json(
      { error: 'Could not fetch folder name. Drive may not be connected or folder is inaccessible.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ name });
}
