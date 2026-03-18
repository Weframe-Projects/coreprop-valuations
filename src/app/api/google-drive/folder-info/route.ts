import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listFolderFiles, getFolderName } from '@/lib/google-drive';

/**
 * GET /api/google-drive/folder-info?folderId=xxx
 *
 * Returns the folder name and lists files inside a Drive folder.
 * Useful for showing what's already in a folder when linking.
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

  const [folderName, files] = await Promise.all([
    getFolderName(supabase, user.id, folderId),
    listFolderFiles(supabase, user.id, folderId),
  ]);

  if (files === null) {
    return NextResponse.json(
      { error: 'Google Drive not connected. Please reconnect in Settings.' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    folderName,
    files: files.map((f) => f.name),
  });
}
