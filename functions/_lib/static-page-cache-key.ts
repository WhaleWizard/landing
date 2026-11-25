import { STATIC_CACHE_RELEASE } from './static-cache-release.generated';

/**
 * Ключ готовой страницы со сборки в Cache API дата-центра.
 *
 * Адрес без параметров (?utm и прочие хвосты не плодят копии) плюс
 * идентификатор выкладки: новая сборка читает свои ключи. Функция общая для
 * `_middleware.ts`, который кладёт страницу в кэш, и для публикации текстов,
 * которая её оттуда убирает (DA-91): раньше публикация удаляла запись по
 * обычному адресу, а страница лежала под ключом с `__ww_release`, и старый
 * HTML жил до пяти минут после публикации.
 */
export function staticPageCacheKey(url: URL): Request {
  const key = new URL(url.pathname, url.origin);
  if (STATIC_CACHE_RELEASE) key.searchParams.set('__ww_release', STATIC_CACHE_RELEASE);
  return new Request(key, { method: 'GET' });
}
