import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { renderPageLockHtml } from '../../_lib/page-lock-page';
import {
  emptyLock,
  isLockablePath,
  LOCK_MESSAGE_MAX,
  LOCK_TITLE_MAX,
  normalizeCtaPaths,
  normalizeEta,
  normalizePagePath,
  normalizePreset,
  readSubscriberFields,
  sanitizeLockText,
} from '../../_lib/page-locks';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

/**
 * Живой предпросмотр заглушки для админки.
 *
 * Отдаёт ровно тот HTML, который увидит посетитель, — раздел показывает его в
 * кадре без сохранения. Тексты приходят из формы, поэтому эндпоинт закрыт
 * паролем: иначе на своём домене можно было бы собрать страницу с чужим
 * текстом и разослать ссылку.
 */

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || String(body.password || ''), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  const path = normalizePagePath(String(body.path || '/'));
  if (!isLockablePath(path)) {
    return json({ success: false, error: 'Неизвестный адрес страницы' }, { status: 400, headers: noStore });
  }

  const lock = {
    ...emptyLock(path),
    preset: normalizePreset(body.preset),
    title: sanitizeLockText(body.title, LOCK_TITLE_MAX),
    message: sanitizeLockText(body.message, LOCK_MESSAGE_MAX),
    eta: normalizeEta(body.eta),
    showSubscribe: body.showSubscribe !== false,
    ctaPaths: normalizeCtaPaths(body.ctaPaths ?? body.ctaPath),
  };

  return json({
    success: true,
    html: renderPageLockHtml({
      lock,
      path,
      fields: await readSubscriberFields(env),
      // В кадре предпросмотра подсказки считаются так, будто закрыта только
      // эта страница: владелец видит набор, который получит посетитель.
      otherLocks: [lock],
      formState: 'idle',
      // Подпись в кадре предпросмотра не нужна: форма здесь ничего не отправляет.
      formStamp: lock.showSubscribe ? 'preview' : '',
    }),
  }, { headers: noStore });
};
