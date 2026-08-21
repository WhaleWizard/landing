import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import { readPageLockSnapshot } from '../_lib/page-locks';
import type { Env } from '../_lib/types';

/**
 * Публичный список закрытых страниц — только чтение.
 *
 * Нужен вкладке, которая открыта давно: разметка первой загрузки могла быть
 * получена до того, как страницу закрыли. Отдаёт ровно то, что и так видно
 * глазами: адрес и признак «вместе с вложенными». Изменить отсюда ничего
 * нельзя — метод только GET, и никаких параметров эндпоинт не принимает.
 */

export const onRequestGet: PagesFunction<Env> = async ({ env, waitUntil }) => {
  const snapshot = await readPageLockSnapshot(env, waitUntil);

  return json({
    locks: snapshot.locks.map((lock) => ({
      path: lock.path,
      includeChildren: lock.includeChildren,
      hideInNav: lock.hideInNav,
    })),
  }, {
    headers: {
      'Cache-Control': snapshot.source === 'db' || snapshot.source === 'cache'
        ? 'public, s-maxage=60, stale-while-revalidate=120'
        : CACHE_CONTROL.noStore,
    },
  });
};
