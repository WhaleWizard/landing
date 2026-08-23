import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { UPLOADS_PREFIX, normalizeFolderName } from '../../_lib/media-folders';
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

// Пароль берётся только из заголовка: поле формы прочитать нельзя, не разобрав
// тело запроса целиком, а разбирать тело до проверки доступа — значит делать
// работу за неавторизованного отправителя. Все вызывающие стороны в админке
// передают заголовок.
function getPassword(request: Request): string {
  return request.headers.get('X-Admin-Password') || '';
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

  // Проверка доступа идёт до чтения тела. Раньше сюда сначала приходил
  // request.formData(), и неавторизованный запрос успевал заставить сервер
  // разобрать присланный файл; кривой запрос при этом падал в 500 с текстом
  // ошибки парсера наружу.
  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  // Тело обязано быть multipart-формой. Без этого request.formData() бросает
  // исключение, а не возвращает ошибку, и клиент получал 500 вместо 415.
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return json(
      { success: false, error: 'Expected multipart/form-data body' },
      { status: 415, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  // Объявленный размер отсекается до разбора тела: 15 МБ проверяются и после,
  // по факту, но незачем принимать гигабайт, чтобы затем его отклонить.
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return json(
      { success: false, error: 'Uploaded file is too large. Maximum size is 15 MB' },
      { status: 413, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  if (!env.BUCKET) {
    return json({ success: false, error: 'R2 bucket is not configured' }, { status: 503, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  try {
    const formData = await request.formData();

    const file = formData.get('file') as File | null;
    if (!file) {
      return json({ success: false, error: 'No file uploaded' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const validationError = validateUpload(file);
    if (validationError) {
      return json({ success: false, error: validationError }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const safeName = sanitizeFilename(file.name);
    // Папка выбирается в медиатеке; без неё раскладка остаётся прежней — по дате.
    const folder = normalizeFolderName(formData.get('folder'));
    const key = `${UPLOADS_PREFIX}${folder ? `${folder}/` : ''}${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
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
    // Внутренняя причина уходит в лог, а не в ответ: текст исключения парсера
    // рассказывал вызывающей стороне об устройстве обработчика.
    console.error('[Admin upload] Failed:', error);
    return json({ success: false, error: 'Upload failed' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
