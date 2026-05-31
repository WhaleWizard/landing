import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/avif': ['avif'],
  'application/pdf': ['pdf'],
  'application/zip': ['zip'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
};

function getPassword(request: Request, formData: FormData): string {
  const headerPassword = request.headers.get('X-Admin-Password') || '';
  const formPassword = String(formData.get('password') || '');
  return headerPassword || formPassword;
}

function sanitizeFilename(filename: string): string {
  const fallback = 'upload';
  const cleaned = String(filename || fallback)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 96);
  return cleaned || fallback;
}

function getExtension(filename: string): string {
  const match = sanitizeFilename(filename).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function validateUpload(file: File): string | null {
  if (file.size <= 0) return 'Uploaded file is empty';
  if (file.size > MAX_UPLOAD_BYTES) return 'Uploaded file is too large. Maximum size is 15 MB';

  const mime = String(file.type || '').toLowerCase();
  const allowedExtensions = ALLOWED_UPLOAD_TYPES[mime];
  if (!allowedExtensions) return 'File type is not allowed';

  const extension = getExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    return `File extension .${extension || 'unknown'} does not match ${mime}`;
  }

  return null;
}

function getPublicHost(env: Env): string {
  return String(env.R2_PUBLIC_HOST || 'https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev').replace(/\/$/, '');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!env.BUCKET) {
    return json({ success: false, error: 'R2 bucket is not configured' }, { status: 503, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  try {
    const formData = await request.formData();
    const password = getPassword(request, formData);
    if (!verifyAdminPassword(password, env)) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return json({ success: false, error: 'No file uploaded' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const validationError = validateUpload(file);
    if (validationError) {
      return json({ success: false, error: validationError }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const safeName = sanitizeFilename(file.name);
    const key = `uploads/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const contentType = String(file.type || 'application/octet-stream').toLowerCase();
    const isImage = contentType.startsWith('image/');

    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
        contentDisposition: isImage ? 'inline' : `attachment; filename="${safeName}"`,
      },
      customMetadata: {
        originalName: safeName,
        uploadedBy: 'admin',
      },
    });

    const publicUrl = `${getPublicHost(env)}/${key}`;
    return json({ success: true, url: publicUrl, key, contentType, size: file.size }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
