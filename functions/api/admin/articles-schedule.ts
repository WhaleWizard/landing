import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { json, readCappedJsonBody } from '../../_lib/http';
import { fetchArticlesFromJsonBin, writeArticlesToJsonBin } from '../../_lib/jsonbin';
import { writeScheduleToD1 } from '../../_lib/d1';
import { persistD1ArticlesSnapshot, shouldUseD1Articles } from '../../_lib/articles';
import { buildSeoCacheTargets, invalidateSeoCaches, purgeCloudflareEdgeCache } from '../../_lib/article-cache';
import type { Env } from '../../_lib/types';

/**
 * Расписание публикаций: статьям назначаются статус «опубликована» и дата
 * публикации в будущем. До этой даты статья невидима на сайте (фильтр
 * `isPublishedArticle`), после — появляется сама, без пересборки: списки
 * и страницы статей отдаёт Functions, кэш списка живёт две минуты.
 *
 * Меняются только статус и дата — не текст. Сохранять статью целиком здесь
 * нельзя: список в админке приходит без текстов, и полная запись затёрла бы
 * тела статей.
 *
 * Перепланировать можно только черновик или ещё не вышедшую статью. Дата
 * уже вышедшей — это дата её первой публикации, и сдвигать её нельзя.
 */
const MAX_ITEMS = 200;
const PROTECTED_ARTICLE_SLUG = 'kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh';
const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

interface ScheduleItem {
  slug: string;
  publishedAt: string;
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;
}

function parseItems(value: unknown): ScheduleItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) return null;
  const seen = new Set<string>();
  const items: ScheduleItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const slug = String((raw as Record<string, unknown>).slug || '').trim();
    const publishedAt = String((raw as Record<string, unknown>).publishedAt || '').trim();
    const parsed = Date.parse(publishedAt);
    if (!isValidSlug(slug) || seen.has(slug) || !Number.isFinite(parsed)) return null;
    seen.add(slug);
    items.push({ slug, publishedAt: new Date(parsed).toISOString() });
  }
  return items;
}

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const payload = (await readCappedJsonBody(request)) as { password?: string; items?: unknown };
  const password = String(request.headers.get('X-Admin-Password') || payload?.password || '');
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  const items = parseItems(payload?.items);
  if (!items) {
    return json(
      { success: false, error: `Invalid payload: 1–${MAX_ITEMS} unique items with slug and ISO publishedAt required` },
      { status: 400, headers: noStore },
    );
  }

  const nowIso = new Date().toISOString();
  try {
    let scheduled: string[] = [];
    let skipped: string[] = [];

    if (shouldUseD1Articles(env)) {
      ({ scheduled, skipped } = await writeScheduleToD1(env, items, nowIso, PROTECTED_ARTICLE_SLUG));
      if (scheduled.length > 0) waitUntil(persistD1ArticlesSnapshot(env));
    } else {
      const all = await fetchArticlesFromJsonBin(env);
      const bySlug = new Map(items.map((item) => [item.slug, item.publishedAt]));
      const next = all.map((article) => {
        const at = bySlug.get(article.slug);
        const reschedulable = article.slug !== PROTECTED_ARTICLE_SLUG
          && (article.status === 'draft' || Boolean(article.publishedAt && article.publishedAt > nowIso));
        if (!at || !reschedulable) return article;
        scheduled.push(article.slug);
        return { ...article, status: 'published' as const, publishedAt: at };
      });
      skipped = items.map((item) => item.slug).filter((slug) => !scheduled.includes(slug));
      if (scheduled.length > 0) await writeArticlesToJsonBin(env, next, all);
    }

    if (scheduled.length > 0) {
      const siteUrl = getSiteUrl(env, request);
      const targets = buildSeoCacheTargets(siteUrl, scheduled);
      waitUntil(invalidateSeoCaches(targets).then(() => undefined));
      waitUntil(purgeCloudflareEdgeCache(env, targets).then(() => undefined));
    }

    return json({ success: true, scheduled, skipped }, { headers: noStore });
  } catch (error) {
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save schedule' },
      { status: 502, headers: noStore },
    );
  }
};
