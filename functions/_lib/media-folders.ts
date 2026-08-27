// Папки медиатеки живут прямо в ключах R2: uploads/<папка>/<дата>/<файл>.
// Старые загрузки лежат как uploads/<дата>/<файл> — они считаются файлами
// без папки, переносить их принудительно нельзя: ссылка на файл изменится
// и картинка в уже опубликованной статье сломается.

export const UPLOADS_PREFIX = 'uploads/';
/** Пустая папка существует только благодаря этому служебному объекту. */
export const FOLDER_MARKER = '.keep';
export const MAX_FOLDER_NAME_LENGTH = 40;

const DATE_SEGMENT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Имя папки приводится к безопасному сегменту пути. Дата запрещена, иначе
 * папку нельзя было бы отличить от старой раскладки по датам.
 */
export function normalizeFolderName(value: unknown): string {
  const cleaned = String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, MAX_FOLDER_NAME_LENGTH);
  if (!cleaned || cleaned === FOLDER_MARKER || DATE_SEGMENT.test(cleaned)) return '';
  return cleaned;
}

export function folderPrefix(folder: string): string {
  const normalized = normalizeFolderName(folder);
  return normalized ? `${UPLOADS_PREFIX}${normalized}/` : UPLOADS_PREFIX;
}

export function isFolderMarker(key: string): boolean {
  return key.endsWith(`/${FOLDER_MARKER}`);
}

/** Папка файла по его ключу; пустая строка — файл лежит вне папок. */
export function folderFromKey(key: string): string {
  if (!key.startsWith(UPLOADS_PREFIX)) return '';
  const parts = key.slice(UPLOADS_PREFIX.length).split('/');
  if (parts.length < 2) return '';
  const first = parts[0];
  if (!first || DATE_SEGMENT.test(first)) return '';
  return normalizeFolderName(first);
}

/**
 * Публичная ссылка на объект R2.
 *
 * Имя файла приводится к латинице при загрузке, а имя папки может быть
 * кириллическим — `normalizeFolderName` это разрешает. Раньше ссылка
 * собиралась простой склейкой, и в неё попадали неэкранированные символы.
 * Браузер такую ссылку обычно вытягивает, но она же уходит в очистку кэша
 * Cloudflare, где несовпадение кодировки означает, что кэш не почистится, —
 * и сохраняется в HTML статьи на годы.
 */
export function publicUploadUrl(host: string, key: string): string {
  const path = key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${host.replace(/\/$/, '')}/${path}`;
}

export function isSafeUploadKey(key: string): boolean {
  return key.startsWith(UPLOADS_PREFIX)
    && !key.includes('..')
    && !key.includes('//')
    && !key.endsWith('/');
}

/** Ключ того же файла в другой папке: меняется только сегмент папки. */
export function reKeyToFolder(key: string, folder: string): string | null {
  if (!isSafeUploadKey(key)) return null;
  const parts = key.slice(UPLOADS_PREFIX.length).split('/');
  const current = folderFromKey(key);
  const tail = current ? parts.slice(1) : parts;
  if (!tail.length) return null;
  const normalized = normalizeFolderName(folder);
  return `${UPLOADS_PREFIX}${normalized ? `${normalized}/` : ''}${tail.join('/')}`;
}
