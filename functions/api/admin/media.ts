import { json } from '../../_lib/http';
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
  reKeyToFolder,
} from '../../_lib/media-folders';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MAX_BULK_KEYS = 50;

interface MediaFile {
  key: string;
  url: string;
  size: number;
  uploaded: string;
  contentType: string;
  name: string;
  folder: string;
  alt: string;
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

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
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
      files.push({
        key: object.key,
        url: `${publicHost}/${object.key}`,
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
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.BUCKET) {
    return json({ success: false, error: 'Хранилище R2 не подключено (доступно только на продакшене)' }, { status: 503, headers: noStore });
  }

  try {
    const { files, markedFolders } = await listUploads(env);
    const { map: altTexts, migration: altMigration } = await readAltTexts(env);
    for (const file of files) file.alt = altTexts.get(file.key) || '';
    return json(
      { success: true, files, folders: collectFolders(files, markedFolders), altMigration },
      { headers: noStore },
    );
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to list media' }, { status: 500, headers: noStore });
  }
};

/**
 * Действия медиатеки: удаление файлов, создание и удаление папок, перенос
 * файла между папками. Перенос меняет публичную ссылку, поэтому вызывать его
 * можно только для файлов, которые нигде не используются, — это проверяет
 * интерфейс, а сервер дополнительно ограничивает область префиксом uploads/.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as {
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
        .filter((key) => isSafeUploadKey(key) && !isFolderMarker(key))
        .slice(0, MAX_BULK_KEYS);
      if (!keys.length) return json({ success: false, error: 'Не указан ни один корректный файл' }, { status: 400, headers: noStore });
      for (const key of keys) await bucket.delete(key);
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
      if (!isSafeUploadKey(key) || isFolderMarker(key)) {
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
      const files = listing.objects.filter((object) => !isFolderMarker(object.key));
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
      const key = String(body.key || '');
      if (!isSafeUploadKey(key) || isFolderMarker(key)) {
        return json({ success: false, error: 'Некорректный файл' }, { status: 400, headers: noStore });
      }
      const target = reKeyToFolder(key, body.folder ?? '');
      if (!target) return json({ success: false, error: 'Не удалось построить новый путь файла' }, { status: 400, headers: noStore });
      if (target === key) return json({ success: true, key, moved: false }, { headers: noStore });

      const source = await bucket.get(key);
      if (!source) return json({ success: false, error: 'Файл не найден' }, { status: 404, headers: noStore });
      // R2 не умеет переименовывать: копируем с теми же заголовками, и только
      // после подтверждённой записи удаляем исходный объект.
      await bucket.put(target, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      });
      const written = await bucket.head(target);
      if (!written) return json({ success: false, error: 'Копия не создалась, файл оставлен на месте' }, { status: 500, headers: noStore });
      await bucket.delete(key);
      // Подпись привязана к ключу объекта — переносим её вслед за файлом.
      if (env.DB) {
        try {
          await env.DB.prepare('UPDATE media_alt SET object_key = ? WHERE object_key = ?').bind(target, key).run();
        } catch { /* таблицы может не быть — перенос файла это не отменяет */ }
      }
      return json({ success: true, key: target, previousKey: key, moved: true }, { headers: noStore });
    }

    return json({ success: false, error: 'Invalid action or key' }, { status: 400, headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось выполнить действие' }, { status: 500, headers: noStore });
  }
};
