import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { UPLOADS_PREFIX, normalizeFolderName, publicUploadUrl } from '../../_lib/media-folders';
import { dimensionSuffix, isValidImageDimension, variantKey, variantWidths } from '../../_lib/image-variants';
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

// Та же таблица, что у transliterate() в редакторе статей (Admin.tsx): файл
// «Договор.pdf» в медиатеке называется «dogovor.pdf», а не «upload.pdf».
const CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
  'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

function transliterate(value: string): string {
  return value.toLowerCase().split('').map((char) => (
    Object.prototype.hasOwnProperty.call(CYRILLIC_TO_LATIN, char) ? CYRILLIC_TO_LATIN[char] : char
  )).join('');
}

/**
 * Имя файла: расширение берётся из исходного имени ДО очистки, очищается
 * только основа.
 *
 * Раньше имя целиком проходило через замену всего, кроме латиницы, на «-»:
 * «Договор.pdf» превращался в «-.pdf», обрезка краёв оставляла «pdf» без
 * точки, и проверка расширения отвечала «File extension .unknown». Любой
 * файл с русским именем — договор в «Клиентах», обложка в редакторе — не
 * загружался, пока владелец не переименует его латиницей.
 */
function splitFilename(filename: string): { base: string; ext: string } {
  const raw = String(filename || '').normalize('NFKC').trim();
  const match = raw.match(/^(.*)\.([A-Za-z0-9]+)$/);
  return { base: match ? match[1] : raw, ext: (match ? match[2] : '').toLowerCase() };
}

function sanitizeBase(base: string): string {
  // Точка в основе не пропускается намеренно: иначе появлялось бы второе
  // расширение, а суффикс размеров копий ищет ровно одно в конце имени.
  const cleaned = transliterate(base)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'upload';
}

/** Одно имя на всё: проверку, ключ в R2, Content-Disposition и метаданные. */
function buildSafeName(filename: string): { safeName: string; ext: string } {
  const { base, ext } = splitFilename(filename);
  const safeBase = sanitizeBase(base);
  return { safeName: ext ? `${safeBase}.${ext}` : safeBase, ext };
}

function validateUpload(file: File, ext: string): string | null {
  if (file.size <= 0) return 'Файл пустой';
  if (file.size > MAX_UPLOAD_BYTES) return 'Файл слишком большой: не больше 15 МБ';

  const mime = String(file.type || '').toLowerCase();
  const allowedExtensions = ALLOWED_UPLOAD_TYPES[mime];
  if (!allowedExtensions) return `Такой тип файла загружать нельзя (${mime || 'тип не определён'})`;

  // Сверка расширения с типом не ослабляется: файл без расширения или с чужим
  // по-прежнему получает 400, а SVG/HTML/JS закрыты списком типов выше.
  if (!allowedExtensions.includes(ext)) {
    return `Расширение файла «.${ext || '?'}» не совпадает с его типом ${mime}`;
  }

  return null;
}

/** Картинки, у которых бывают копии: GIF не пережимается, документы — не картинки. */
const VARIANT_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VARIANT_FIELD = /^variant-(\d{1,5})$/;

type VariantPlan = { width: number; height: number; files: Array<{ width: number; file: File }> };

/**
 * Копии принимаются только полным набором: суффикс размеров в имени файла
 * обещает странице все ширины сразу, и одна недостающая дала бы в `srcset`
 * ссылку на пустоту. Набор ширин сервер выводит сам из ширины оригинала.
 */
function readVariantPlan(formData: FormData, file: File): VariantPlan | null | string {
  const fields = [...formData.keys()].filter((name) => VARIANT_FIELD.test(name));
  const hasSize = formData.has('width') || formData.has('height');
  if (!fields.length && !hasSize) return null;

  const mime = String(file.type || '').toLowerCase();
  if (!VARIANT_SOURCE_TYPES.has(mime)) return 'Image variants are allowed only for JPEG, PNG, WebP or AVIF';
  const width = Number(formData.get('width'));
  const height = Number(formData.get('height'));
  if (!isValidImageDimension(width) || !isValidImageDimension(height)) return 'Invalid image width or height';

  const expected = variantWidths(width);
  const provided = new Set(fields.map((name) => Number(VARIANT_FIELD.exec(name)?.[1])));
  if (provided.size !== expected.length || expected.some((value) => !provided.has(value))) {
    return `Image variants must be exactly: ${expected.join(', ')}`;
  }

  const files: Array<{ width: number; file: File }> = [];
  for (const value of expected) {
    const variant = formData.get(`variant-${value}`);
    if (!(variant instanceof File)) return `Variant ${value} is not a file`;
    if (String(variant.type || '').toLowerCase() !== 'image/webp') return `Variant ${value} must be image/webp`;
    if (variant.size <= 0 || variant.size > MAX_UPLOAD_BYTES) return `Variant ${value} has invalid size`;
    files.push({ width: value, file: variant });
  }
  return { width, height, files };
}

function getPublicHost(env: Env): string {
  return String(env.R2_PUBLIC_HOST || 'https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev').replace(/\/$/, '');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Свой профиль ограничения (`admin_media` в rate-limit.ts): сорок
  // скриншотов подряд упирались в общие 30 запросов/мин админки на 31-м
  // файле. Пароль роут проверяет по-прежнему; без профиля в rate-limit.ts
  // действует общий лимит по умолчанию.
  const rateLimited = await enforceRateLimit(request, 'admin_media');
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

    const { safeName, ext } = buildSafeName(file.name);
    const validationError = validateUpload(file, ext);
    if (validationError) {
      return json({ success: false, error: validationError }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const plan = readVariantPlan(formData, file);
    if (typeof plan === 'string') {
      return json({ success: false, error: plan }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    // Папка выбирается в медиатеке; без неё раскладка остаётся прежней — по дате.
    const folder = normalizeFolderName(formData.get('folder'));
    // Суффикс размеров получает только файл с полным набором копий.
    const storedName = plan
      ? safeName.replace(/(\.[a-z0-9]+)$/i, `${dimensionSuffix(plan.width, plan.height)}$1`)
      : safeName;
    const key = `${UPLOADS_PREFIX}${folder ? `${folder}/` : ''}${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}-${storedName}`;
    const contentType = String(file.type || 'application/octet-stream').toLowerCase();
    const isImage = contentType.startsWith('image/');
    const immutable = 'public, max-age=31536000, immutable';

    // Сначала копии, оригинал последним: ссылка уходит в статью, только когда
    // на месте всё, на что она укажет. Сбой посередине убирает записанное.
    const writtenVariants: string[] = [];
    if (plan) {
      try {
        for (const variant of plan.files) {
          const target = variantKey(key, variant.width);
          if (!target) throw new Error('variant key');
          await env.BUCKET.put(target, variant.file.stream(), {
            httpMetadata: { contentType: 'image/webp', cacheControl: immutable, contentDisposition: 'inline' },
            customMetadata: { originalName: safeName, uploadedBy: 'admin', variantOf: key, variantWidth: String(variant.width) },
          });
          writtenVariants.push(target);
        }
      } catch (error) {
        for (const target of writtenVariants) await env.BUCKET.delete(target).catch(() => undefined);
        throw error;
      }
    }

    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType,
        cacheControl: immutable,
        contentDisposition: isImage ? 'inline' : `attachment; filename="${safeName}"`,
      },
      customMetadata: {
        originalName: safeName,
        uploadedBy: 'admin',
      },
    });

    const publicUrl = publicUploadUrl(getPublicHost(env), key);
    return json(
      { success: true, url: publicUrl, key, contentType, size: file.size, variants: plan ? plan.files.map((item) => item.width) : [] },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  } catch (error) {
    // Внутренняя причина уходит в лог, а не в ответ: текст исключения парсера
    // рассказывал вызывающей стороне об устройстве обработчика.
    console.error('[Admin upload] Failed:', error);
    return json({ success: false, error: 'Upload failed' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
