import { json, readCappedJsonBody } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import {
  FOLDER_MARKER,
  MAX_FOLDER_NAME_LENGTH,
  UPLOADS_PREFIX,
  folderFromKey,
  isFolderMarker,
  isSafeUploadKey,
  normalizeFolderName,
  publicUploadUrl,
  reKeyToFolder,
} from '../../_lib/media-folders';
import { isImageVariantKey, variantKeysFor } from '../../_lib/image-variants';
import { fetchArticlesWithFallback, shouldUseD1Articles } from '../../_lib/articles';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MAX_BULK_KEYS = 50;

/**
 * Бюджет обращений к хранилищу на один запрос переноса.
 *
 * Каждый вызов binding R2 и D1 — подзапрос воркера, а на бесплатном тарифе
 * Workers их 50 на запрос. Перенос картинки с четырьмя копиями стоит ~21
 * вызов (см. `moveCost`), документа без копий — 5. Сверх лимита R2 бросает
 * «Too many subrequests» посреди переноса, и файл остаётся в двух папках
 * сразу, поэтому пачка режется заранее по стоимости, а не по числу ключей:
 * две картинки с полным набором копий или около восьми документов. Остаток
 * возвращается в `skipped` — клиент шлёт его следующим запросом. Запас до 50
 * оставлен ограничителю частоты (Cache API), одному запросу к статьям
 * (проверка «файл используется», `readUsageSources`) и самому ответу.
 */
const MOVE_BUDGET = 42;

/** Сколько вызовов хранилища стоит перенос одного файла (`moveUpload`). */
function moveCost(key: string): number {
  // Оригинал: get, put, head, delete; каждая копия: get, put, head, delete;
  // плюс одна строка D1 — перенос подписи.
  return 5 + 4 * variantKeysFor(key).length;
}

interface MediaFile {
  key: string;
  url: string;
  size: number;
  uploaded: string;
  contentType: string;
  name: string;
  folder: string;
  alt: string;
  /**
   * Заголовки публикаций, где файл используется. Считает сервер по полным
   * текстам; поля нет вовсе, если статьи прочитать не удалось — клиент верит
   * даже пустому списку, и `[]` сделало бы все файлы кандидатами на удаление.
   */
  usage?: string[];
}

const ALT_MIGRATION = '0031_media_alt.sql';
const MAX_ALT_LENGTH = 300;
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

function cleanAlt(value: unknown): string {
  return String(value ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_ALT_LENGTH);
}

/** Подписи ко всем файлам разом: их десятки, отдельный запрос на файл лишний. */
async function readAltTexts(env: Env): Promise<{ map: Map<string, string>; migration: string }> {
  if (!env.DB) return { map: new Map(), migration: '' };
  try {
    const rows = await env.DB.prepare('SELECT object_key, alt FROM media_alt').all<{ object_key: string; alt: string }>();
    return { map: new Map((rows.results || []).map((row) => [row.object_key, row.alt])), migration: '' };
  } catch (error) {
    return { map: new Map(), migration: isMissingTableError(error) ? ALT_MIGRATION : '' };
  }
}

function getPublicHost(env: Env): string {
  return String(env.R2_PUBLIC_HOST || 'https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev').replace(/\/$/, '');
}

/**
 * Файл, с которым владелец работает в медиатеке: не метка папки и не
 * уменьшенная копия. Копии живут и умирают вместе со своим оригиналом.
 */
function isManagedKey(key: string): boolean {
  return isSafeUploadKey(key) && !isFolderMarker(key) && !isImageVariantKey(key);
}

/**
 * Где используется файл — считает сервер, а не интерфейс.
 *
 * Список статей в админке приходит без текстов (под шестьсот статей), и по
 * нему видно только обложки: картинка из тела статьи считалась свободной, и
 * медиатека разрешала её удалить. Поэтому источник правды здесь: полные
 * тексты, обложки и цифры кейсов всех публикаций — опубликованных,
 * черновиков, запланированных — одним запросом `SELECT … FROM articles`.
 * Ссылки ищутся и по публичному адресу (`publicUploadUrl`), и по самому
 * ключу; уменьшенная копия (`…--<Ш>x<В>-<ширина>.webp`) засчитывается
 * оригиналу, потому что в медиатеке живёт только он.
 *
 * Разбор делается в коде, а не `LIKE` в SQL: в ключах бывают `_` и `%`, а
 * один проход по текстам дешевле запроса на каждый файл.
 */
interface UsageSource {
  title: string;
  /** Всё, где может лежать адрес файла: обложка, текст, цифры кейса. */
  haystack: string;
}

type UsageIndex = Map<string, Set<string>>;

const UPLOAD_REFERENCE = /uploads\/[^\s"'<>()\\]+/g;

async function readArticleUsageRows(db: D1Database): Promise<Array<{ slug: string; title: string | null; image: string | null; content: string | null; case_data_json?: string | null }>> {
  try {
    const rows = await db.prepare('SELECT slug, title, image, content, case_data_json FROM articles').all<{ slug: string; title: string | null; image: string | null; content: string | null; case_data_json: string | null }>();
    return rows.results || [];
  } catch (error) {
    // До миграции 0007 колонки цифр кейса нет — обложки и тексты есть всегда.
    if (!/no such column/i.test(error instanceof Error ? error.message : String(error))) throw error;
    const rows = await db.prepare('SELECT slug, title, image, content FROM articles').all<{ slug: string; title: string | null; image: string | null; content: string | null }>();
    return rows.results || [];
  }
}

/**
 * Публикации для проверки использования. `null` — проверить не удалось:
 * база статей недоступна или запрос упал. Это не «ничего не используется».
 */
async function readUsageSources(env: Env, request: Request): Promise<UsageSource[] | null> {
  try {
    if (shouldUseD1Articles(env)) {
      if (!env.DB) return null;
      const rows = await readArticleUsageRows(env.DB);
      return rows.map((row) => ({
        title: String(row.title || row.slug || ''),
        haystack: [row.image, row.content, row.case_data_json].filter(Boolean).join('\n'),
      }));
    }
    // Статьи живут в JSONBin: читаем тем же путём, что публичный сайт. Пустой
    // список здесь означает, что ни один источник не ответил (JSONBin пустой
    // продолжает цепочку, а недоступный seed даёт пусто), а не «статей нет».
    const articles = await fetchArticlesWithFallback(env, request);
    if (articles.length === 0) return null;
    return articles.map((article) => ({
      title: String(article.title || article.slug || ''),
      haystack: [article.image, article.content, article.caseData ? JSON.stringify(article.caseData) : ''].filter(Boolean).join('\n'),
    }));
  } catch (error) {
    console.error('[media] usage check failed', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Варианты записи одной ссылки: как есть, раскодированная, без хвостовой пунктуации из текста. */
function referenceKeys(token: string): string[] {
  const keys = new Set<string>([token]);
  try { keys.add(decodeURIComponent(token)); } catch { /* ссылка не в URL-кодировке */ }
  for (const key of [...keys]) {
    const trimmed = key.replace(/[.,;:!?]+$/, '');
    if (trimmed) keys.add(trimmed);
  }
  return [...keys];
}

function buildUsageIndex(sources: UsageSource[]): UsageIndex {
  const index: UsageIndex = new Map();
  for (const source of sources) {
    for (const match of source.haystack.matchAll(UPLOAD_REFERENCE)) {
      for (const key of referenceKeys(match[0])) {
        const titles = index.get(key) || new Set<string>();
        titles.add(source.title);
        index.set(key, titles);
      }
    }
  }
  return index;
}

/** Заголовки публикаций, где встречается файл или любая из его копий. */
function usageFor(index: UsageIndex, key: string): string[] {
  const titles = new Set<string>();
  for (const candidate of [key, ...variantKeysFor(key)]) {
    for (const title of index.get(candidate) || []) titles.add(title);
  }
  return [...titles];
}

/**
 * Заслон перед удалением и переносом: ни одно действие не выполняется, если
 * хоть один файл пачки используется (409) или проверить это нечем (503).
 * Перенос меняет публичную ссылку, удаление — тем более: картинка в статье
 * превратилась бы в пустое место, и узнать об этом владелец мог бы только с
 * сайта.
 */
async function refuseIfUsed(env: Env, request: Request, keys: string[], action: 'delete' | 'move'): Promise<Response | null> {
  const sources = await readUsageSources(env, request);
  if (!sources) {
    return json({
      success: false,
      code: 'USAGE_UNAVAILABLE',
      error: 'Не удалось проверить, используются ли файлы в публикациях: база статей недоступна. '
        + (action === 'delete' ? 'Удаление' : 'Перенос')
        + ' отложен — вслепую ссылки из статей ломать нельзя, попробуйте позже.',
    }, { status: 503, headers: noStore });
  }
  const index = buildUsageIndex(sources);
  const blocked = keys
    .map((key) => ({ key, usage: usageFor(index, key) }))
    .filter((entry) => entry.usage.length > 0);
  if (blocked.length === 0) return null;
  const usage = [...new Set(blocked.flatMap((entry) => entry.usage))];
  const names = blocked.slice(0, 3).map((entry) => `«${entry.key.split('/').pop()}»`).join(', ') + (blocked.length > 3 ? '…' : '');
  const titles = usage.slice(0, 3).map((title) => `«${title}»`).join(', ') + (usage.length > 3 ? ` и ещё ${usage.length - 3}` : '');
  return json({
    success: false,
    code: 'MEDIA_IN_USE',
    usage,
    files: blocked,
    error: `${blocked.length > 1 ? 'Файлы' : 'Файл'} ${names} использу${blocked.length > 1 ? 'ются' : 'ется'} в публикациях: ${titles}. `
      + (action === 'delete' ? 'Ничего не удалено' : 'Ничего не перенесено')
      + ' — сначала замените картинку в самой публикации.',
  }, { status: 409, headers: noStore });
}

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
}

type MoveOutcome =
  | { ok: true; key: string; previousKey: string; moved: boolean }
  | { ok: false; error: string; status: number };

/**
 * Перенос одного файла в другую папку.
 *
 * R2 не умеет переименовывать: объект копируется с теми же заголовками, и
 * только после подтверждённой записи удаляется исходный. Уменьшенные копии
 * едут первыми: имя копии выводится из имени оригинала, и оригинал на новом
 * месте без них показывал бы srcset на пустоту. Если копия не записалась,
 * всё записанное откатывается, а файл остаётся на месте.
 */
async function moveUpload(env: Env, bucket: R2Bucket, key: string, folder: string): Promise<MoveOutcome> {
  if (!isManagedKey(key)) return { ok: false, error: 'Некорректный файл', status: 400 };
  const target = reKeyToFolder(key, folder);
  if (!target) return { ok: false, error: 'Не удалось построить новый путь файла', status: 400 };
  if (target === key) return { ok: true, key, previousKey: key, moved: false };

  const source = await bucket.get(key);
  if (!source) return { ok: false, error: 'Файл не найден', status: 404 };

  const targetVariants = variantKeysFor(target);
  const variantMoves = variantKeysFor(key)
    .map((from, index) => ({ from, to: targetVariants[index] }))
    .filter((pair): pair is { from: string; to: string } => Boolean(pair.to));
  const writtenVariants: string[] = [];
  for (const pair of variantMoves) {
    const variant = await bucket.get(pair.from);
    if (!variant) continue;
    await bucket.put(pair.to, variant.body, { httpMetadata: variant.httpMetadata, customMetadata: { ...variant.customMetadata, variantOf: target } });
    if (!(await bucket.head(pair.to))) {
      for (const written of writtenVariants) await bucket.delete(written);
      return { ok: false, error: 'Копия картинки не перенеслась, файл оставлен на месте', status: 500 };
    }
    writtenVariants.push(pair.to);
  }

  await bucket.put(target, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: source.customMetadata,
  });
  const written = await bucket.head(target);
  if (!written) {
    for (const variant of writtenVariants) await bucket.delete(variant);
    return { ok: false, error: 'Копия не создалась, файл оставлен на месте', status: 500 };
  }
  await bucket.delete(key);
  for (const pair of variantMoves) await bucket.delete(pair.from);
  // Подпись привязана к ключу объекта — переносим её вслед за файлом.
  if (env.DB) {
    try {
      await env.DB.prepare('UPDATE media_alt SET object_key = ? WHERE object_key = ?').bind(target, key).run();
    } catch { /* таблицы может не быть — перенос файла это не отменяет */ }
  }
  return { ok: true, key: target, previousKey: key, moved: true };
}

async function listUploads(env: Env): Promise<{ files: MediaFile[]; markedFolders: string[] }> {
  const publicHost = getPublicHost(env);
  const files: MediaFile[] = [];
  const markedFolders = new Set<string>();
  let cursor: string | undefined;
  // R2 отдаёт максимум 1000 объектов за запрос; страховка от бесконечного цикла.
  for (let page = 0; page < 5; page += 1) {
    const listing = await env.BUCKET.list({ prefix: UPLOADS_PREFIX, limit: 1000, cursor, include: ['httpMetadata', 'customMetadata'] });
    for (const object of listing.objects) {
      const folder = folderFromKey(object.key);
      if (isFolderMarker(object.key)) {
        if (folder) markedFolders.add(folder);
        continue;
      }
      // Уменьшенные копии — служебные файлы оригинала, в списке их не показываем.
      if (isImageVariantKey(object.key)) continue;
      files.push({
        key: object.key,
        url: publicUploadUrl(publicHost, object.key),
        size: object.size,
        uploaded: object.uploaded instanceof Date ? object.uploaded.toISOString() : String(object.uploaded || ''),
        contentType: object.httpMetadata?.contentType || '',
        name: object.customMetadata?.originalName || object.key.split('/').pop() || object.key,
        folder,
        alt: '',
      });
    }
    if (!listing.truncated) break;
    cursor = listing.cursor;
  }
  files.sort((a, b) => (a.uploaded < b.uploaded ? 1 : -1));
  return { files, markedFolders: [...markedFolders] };
}

function collectFolders(files: MediaFile[], markedFolders: string[]): Array<{ name: string; count: number; size: number }> {
  const folders = new Map<string, { name: string; count: number; size: number }>();
  for (const folder of markedFolders) folders.set(folder, { name: folder, count: 0, size: 0 });
  for (const file of files) {
    if (!file.folder) continue;
    const entry = folders.get(file.folder) || { name: file.folder, count: 0, size: 0 };
    entry.count += 1;
    entry.size += file.size;
    folders.set(file.folder, entry);
  }
  return [...folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// Список загруженных файлов и папок (новые файлы сверху)
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin_media');
  if (rateLimited) return rateLimited;

  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.BUCKET) {
    return json({ success: false, error: 'Хранилище R2 не подключено (доступно только на продакшене)' }, { status: 503, headers: noStore });
  }

  try {
    const { files, markedFolders } = await listUploads(env);
    const [{ map: altTexts, migration: altMigration }, usageSources] = await Promise.all([
      readAltTexts(env),
      readUsageSources(env, request),
    ]);
    const usageIndex = usageSources ? buildUsageIndex(usageSources) : null;
    for (const file of files) {
      file.alt = altTexts.get(file.key) || '';
      if (usageIndex) file.usage = usageFor(usageIndex, file.key);
    }
    return json(
      {
        success: true,
        files,
        folders: collectFolders(files, markedFolders),
        altMigration,
        // false — статьи прочитать не удалось, у файлов нет `usage`, и клиент
        // считает использование сам по списку статей (видны только обложки).
        usageChecked: usageIndex !== null,
      },
      { headers: noStore },
    );
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to list media' }, { status: 500, headers: noStore });
  }
};

/**
 * Действия медиатеки: удаление файлов, создание и удаление папок, перенос
 * файла между папками. Перенос меняет публичную ссылку, а удаление ломает её
 * совсем, поэтому оба разрешены только файлам, которых нет ни в одной
 * публикации, — это проверяет сам сервер по полным текстам статей
 * (`refuseIfUsed`), интерфейсу тут верить нельзя: его список статей без
 * текстов. Область действий ограничена префиксом uploads/.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Профиль `admin_media` (rate-limit.ts): перенос сорока файлов по одному
  // запросу упирался в общие 30 запросов/мин админки. Пароль по-прежнему
  // обязателен; без профиля действует общий лимит по умолчанию.
  const rateLimited = await enforceRateLimit(request, 'admin_media');
  if (rateLimited) return rateLimited;

  const body = await readCappedJsonBody(request) as {
    password?: string; action?: string; key?: string; keys?: string[]; folder?: string; name?: string; alt?: string;
  };
  if (!verifyAdminPassword(getPassword(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.BUCKET) {
    return json({ success: false, error: 'Хранилище R2 не подключено' }, { status: 503, headers: noStore });
  }

  const bucket = env.BUCKET;
  const action = String(body.action || '');

  try {
    if (action === 'delete') {
      const keys = (Array.isArray(body.keys) ? body.keys : [body.key])
        .map((key) => String(key || ''))
        .filter(isManagedKey)
        .slice(0, MAX_BULK_KEYS);
      if (!keys.length) return json({ success: false, error: 'Не указан ни один корректный файл' }, { status: 400, headers: noStore });
      const refused = await refuseIfUsed(env, request, keys, 'delete');
      if (refused) return refused;
      for (const key of keys) {
        // Копии удаляются вместе с оригиналом, иначе остались бы сиротами.
        for (const variant of variantKeysFor(key)) await bucket.delete(variant);
        await bucket.delete(key);
      }
      // Подпись без файла не нужна, но её потеря не должна ронять удаление.
      if (env.DB) {
        for (const key of keys) {
          try {
            await env.DB.prepare('DELETE FROM media_alt WHERE object_key = ?').bind(key).run();
          } catch { /* таблицы может не быть — это не мешает удалить файл */ }
        }
      }
      return json({ success: true, deleted: keys.length }, { headers: noStore });
    }

    if (action === 'set_alt') {
      const key = String(body.key || '');
      if (!isManagedKey(key)) {
        return json({ success: false, error: 'Некорректный файл' }, { status: 400, headers: noStore });
      }
      if (!env.DB) {
        return json({ success: false, error: 'База D1 не подключена' }, { status: 503, headers: noStore });
      }
      const alt = cleanAlt(body.alt);
      try {
        if (alt) {
          await env.DB
            .prepare('INSERT OR REPLACE INTO media_alt (object_key, alt, updated_at) VALUES (?, ?, ?)')
            .bind(key, alt, new Date().toISOString())
            .run();
        } else {
          await env.DB.prepare('DELETE FROM media_alt WHERE object_key = ?').bind(key).run();
        }
      } catch (error) {
        if (isMissingTableError(error)) {
          return json(
            {
              success: false,
              migrationRequired: true,
              migration: ALT_MIGRATION,
              error: `Примените миграцию ${ALT_MIGRATION} — до неё alt-тексты негде хранить.`,
            },
            { status: 503, headers: noStore },
          );
        }
        throw error;
      }
      return json({ success: true, key, alt }, { headers: noStore });
    }

    if (action === 'create_folder') {
      const folder = normalizeFolderName(body.name ?? body.folder);
      if (!folder) {
        return json({
          success: false,
          error: `Название папки — латиница или кириллица, цифры, дефис; до ${MAX_FOLDER_NAME_LENGTH} символов и не в виде даты.`,
        }, { status: 400, headers: noStore });
      }
      // Пустая папка в объектном хранилище существует только как объект-метка.
      await bucket.put(`${UPLOADS_PREFIX}${folder}/${FOLDER_MARKER}`, new Uint8Array(0), {
        httpMetadata: { contentType: 'application/x-empty', cacheControl: 'no-store' },
        customMetadata: { folderMarker: 'true' },
      });
      return json({ success: true, folder }, { headers: noStore });
    }

    if (action === 'delete_folder') {
      const folder = normalizeFolderName(body.name ?? body.folder);
      if (!folder) return json({ success: false, error: 'Некорректное имя папки' }, { status: 400, headers: noStore });
      const listing = await bucket.list({ prefix: `${UPLOADS_PREFIX}${folder}/`, limit: 20 });
      const files = listing.objects.filter((object) => !isFolderMarker(object.key) && !isImageVariantKey(object.key));
      if (files.length > 0) {
        return json({
          success: false,
          error: 'Папка не пуста. Сначала перенесите или удалите файлы из неё.',
        }, { status: 409, headers: noStore });
      }
      for (const object of listing.objects) await bucket.delete(object.key);
      return json({ success: true, folder }, { headers: noStore });
    }

    if (action === 'move') {
      const folder = String(body.folder ?? '');
      // Пачка ключей одним запросом: перенос сорока файлов по одному
      // запросу на файл упирался в лимит запросов на 31-м. Один ключ
      // (`key`) по-прежнему принимается — так ходит медиатека сейчас.
      if (Array.isArray(body.keys)) {
        const keys = body.keys.map((key) => String(key || '')).filter(Boolean).slice(0, MAX_BULK_KEYS);
        if (!keys.length) return json({ success: false, error: 'Не указан ни один файл' }, { status: 400, headers: noStore });
        const refused = await refuseIfUsed(env, request, keys, 'move');
        if (refused) return refused;
        const moved: Array<{ key: string; previousKey: string; moved: boolean }> = [];
        const failed: Array<{ key: string; error: string }> = [];
        // Не тронутые этим запросом: не уместились в бюджет или идут после
        // прерванного переноса. Клиент шлёт их следующим запросом.
        const skipped: string[] = [];
        let spent = 0;
        let interrupted = '';
        for (const key of keys) {
          const cost = moveCost(key);
          if (interrupted || spent + cost > MOVE_BUDGET) {
            skipped.push(key);
            continue;
          }
          spent += cost;
          let outcome: MoveOutcome;
          try {
            outcome = await moveUpload(env, bucket, key, folder);
          } catch (error) {
            // Бросок хранилища посреди переноса (сеть, лимит подзапросов):
            // дальше не идём — следующий вызов упал бы так же, а этот файл
            // мог успеть скопироваться без удаления исходника.
            const message = error instanceof Error ? error.message : String(error);
            failed.push({ key, error: `Перенос прерван: ${message}` });
            interrupted = key;
            continue;
          }
          if (outcome.ok) moved.push({ key: outcome.key, previousKey: outcome.previousKey, moved: outcome.moved });
          else failed.push({ key, error: outcome.error });
        }
        const error = interrupted
          ? `${failed[failed.length - 1].error}. Обновите список — «${interrupted.split('/').pop()}» мог остаться в обеих папках.`
          : failed.length
            ? `Не перенесено ${failed.length} из ${keys.length}: ${failed[0].error}`
            : '';
        return json({
          success: failed.length === 0 || moved.length > 0,
          moved,
          failed,
          skipped,
          ...(error ? { error } : {}),
        }, { headers: noStore });
      }

      const singleKey = String(body.key || '');
      const refused = await refuseIfUsed(env, request, [singleKey], 'move');
      if (refused) return refused;
      const outcome = await moveUpload(env, bucket, singleKey, folder);
      if (!outcome.ok) return json({ success: false, error: outcome.error }, { status: outcome.status, headers: noStore });
      return json({ success: true, key: outcome.key, previousKey: outcome.previousKey, moved: outcome.moved }, { headers: noStore });
    }

    return json({ success: false, error: 'Invalid action or key' }, { status: 400, headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось выполнить действие' }, { status: 500, headers: noStore });
  }
};
