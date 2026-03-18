import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listFolders } from '@/lib/google-drive';

// GET /api/google-drive/folders?parentId=xxx&source=shared
// Lists folders inside a parent folder (for browsing Drive structure).
// At root level, `source` controls "myDrive" (default) or "shared" (Shared with me).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get('parentId') || undefined;
  const source = (searchParams.get('source') || 'myDrive') as 'myDrive' | 'shared';

  try {
    const folders = await listFolders(supabase, user.id, parentId, source);
    if (folders === null) {
      return NextResponse.json({ error: 'Google Drive not connected. Please reconnect in Settings.' }, { status: 401 });
    }
    return NextResponse.json({ folders });
  } catch (error) {
    console.error('[google-drive] List folders failed:', error);
    return NextResponse.json({ error: 'Failed to list folders' }, { status: 500 });
  }
}
