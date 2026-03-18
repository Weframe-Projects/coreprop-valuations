import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncReportFile } from '@/lib/google-drive';

// GET /api/reports/[id]/photos — list photos for a report
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify report ownership
  const { data: report } = await supabase
    .from('reports')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const { data: photos, error } = await supabase
    .from('report_photos')
    .select('*')
    .eq('report_id', id)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ photos });
}

// POST /api/reports/[id]/photos — upload photos
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify report ownership and load Drive folder info
  const { data: report } = await supabase
    .from('reports')
    .select('id, property_details')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const propertyDetails = (report.property_details as Record<string, unknown> | null) || {};
  const driveFolderId = (propertyDetails.driveFolderId as string | undefined);

  const formData = await request.formData();
  const photos = formData.getAll('photos') as File[];
  const labels = formData.getAll('labels') as string[];

  if (photos.length === 0) {
    return NextResponse.json({ error: 'No photos provided' }, { status: 400 });
  }

  // Get current max sort_order
  const { data: existing } = await supabase
    .from('report_photos')
    .select('sort_order')
    .eq('report_id', id)
    .order('sort_order', { ascending: false })
    .limit(1);

  let sortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const uploadedPhotos = [];

  for (let i = 0; i < photos.length; i++) {
    const file = photos[i];
    const label = labels[i] || 'Property Photo';
    const ext = file.name.split('.').pop() || 'jpg';
    const storagePath = `${user.id}/${id}/${sortOrder}-${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('report-photos')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Photo upload error:', uploadError);
      continue; // Skip failed uploads, don't fail the whole batch
    }

    // Create DB record
    const { data: photoRecord, error: dbError } = await supabase
      .from('report_photos')
      .insert({
        report_id: id,
        storage_path: storagePath,
        label,
        sort_order: sortOrder,
      })
      .select('id, storage_path, label, sort_order')
      .single();

    if (!dbError && photoRecord) {
      uploadedPhotos.push(photoRecord);

      // Fire-and-forget upload to Google Drive Photos/ subfolder
      if (driveFolderId) {
        syncReportFile({
          supabase,
          userId: user.id,
          reportFolderId: driveFolderId,
          fileName: file.name || `photo-${sortOrder}.${ext}`,
          buffer: Buffer.from(arrayBuffer),
          mimeType: file.type || 'image/jpeg',
          isPhoto: true,
        }).catch((err) => console.error('[photos] Drive sync failed (non-blocking):', err));
      }
    }

    sortOrder++;
  }

  return NextResponse.json({ photos: uploadedPhotos, count: uploadedPhotos.length }, { status: 201 });
}

// DELETE /api/reports/[id]/photos — delete a specific photo
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { photoId } = await request.json();
  if (!photoId) {
    return NextResponse.json({ error: 'Missing photoId' }, { status: 400 });
  }

  // Get the photo record (verified via RLS policy — report must be owned by user)
  const { data: photo } = await supabase
    .from('report_photos')
    .select('id, storage_path')
    .eq('id', photoId)
    .eq('report_id', id)
    .single();

  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  // Delete from storage
  await supabase.storage.from('report-photos').remove([photo.storage_path]);

  // Delete DB record
  await supabase.from('report_photos').delete().eq('id', photoId);

  return NextResponse.json({ ok: true });
}
