import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import type { Env } from '../../_lib/types';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const password = url.searchParams.get('password') || '';
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return json({ success: false, error: 'No file uploaded' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const key = `uploads/${Date.now()}-${crypto.randomUUID()}-${file.name}`;
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const publicUrl = `https://${env.R2_PUBLIC_HOST || 'pub-0c68f065a6a3442c97a55535ba03e377.r2.dev'}/${key}`;
    return json({ success: true, url: publicUrl, key }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
