import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { json, readCappedJsonBody } from '../../_lib/http';
import { fetchArticlesFromJsonBin, writeArticlesToJsonBin } from '../../_lib/jsonbin';
import { writeFeaturedOrderToD1 } from '../../_lib/d1';
import { persistD1ArticlesSnapshot, shouldUseD1Articles } from '../../_lib/articles';
import { buildSeoCacheTargets, invalidateSeoCaches, purgeCloudflareEdgeCache } from '../../_lib/article-cache';
import { isMissingSchemaError, migrationRequiredResponse } from '../../_lib/migration-guard';
import type { Env } from '../../_lib/types';
import { HOME_ARTICLES_LIMIT, isFeaturedArticle } from '../../../src/app/utils/homeArticles';
import { isCaseArticle } from '../../_lib/seo';

/**
 * Закрепление статей на главной в порядке владельца. Ранее можно было
 * закрепить 15 статей, поэтому старый список можно сокращать и переставлять.
 *
 * Один запрос на весь список — перечисленным статьям порядок 1..N, всем
 * остальным пусто. Так нумерация никогда не расходится, а «убрать» и
 * «переставить» — тот же запрос с другим списком.
 *
 * Хранится в колонке `articles.featured_order` (миграция 0042). Без неё
 * эндпоинт отвечает 503 с кодом MIGRATION_REQUIRED, а не падает: раздел
 * админки показывает, какую миграцию применить.
 */
const MIGRATION = '0042_articles_featured_order.sql';
const REASON = 'закрепление статей на главной хранится в колонке articles.featured_order';
const LEGACY_FEATURED_LIMIT = 15;

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

interface FeaturedPayload {
  password?: string;
  slugs?: unknown;
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;
}

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const payload = (await readCappedJsonBody(request)) as FeaturedPayload;
  const password = String(request.headers.get('X-Admin-Password') || payload?.password || '');
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  if (!Array.isArray(payload?.slugs)) {
    return json({ success: false, error: 'Invalid payload: slugs[] required' }, { status: 400, headers: noStore });
  }
  const slugs = payload.slugs.map((value) => String(value || '').trim());
  if (slugs.length > LEGACY_FEATURED_LIMIT) {
    return json({ success: false, error: `На главной можно закрепить до ${HOME_ARTICLES_LIMIT} статей.` }, { status: 400, headers: noStore });
  }
  if (new Set(slugs).size !== slugs.length || !slugs.every(isValidSlug)) {
    return json({ success: false, error: 'Invalid slugs: must be unique and well-formed' }, { status: 400, headers: noStore });
  }

  try {
    const conflict = () => json({
      success: false,
      error: `Список не сохранён. Обновите список статей. Закреплять можно только статьи блога, лимит — ${HOME_ARTICLES_LIMIT}.`,
    }, { status: 409, headers: noStore });
    if (shouldUseD1Articles(env)) {
      if (!await writeFeaturedOrderToD1(env, slugs, HOME_ARTICLES_LIMIT)) return conflict();
      waitUntil(persistD1ArticlesSnapshot(env));
    } else {
      const all = await fetchArticlesFromJsonBin(env);
      const bySlug = new Map(all.map((article) => [article.slug, article]));
      if (slugs.some((slug) => {
        const article = bySlug.get(slug);
        return !article || isCaseArticle(article) || (slugs.length > HOME_ARTICLES_LIMIT && !isFeaturedArticle(article));
      })) return conflict();
      const next = all.map((article) => {
        const index = slugs.indexOf(article.slug);
        return { ...article, featuredOrder: index >= 0 ? index + 1 : undefined };
      });
      await writeArticlesToJsonBin(env, next, all);
    }

    // Меняются только списки и главная: страницы самих статей прежние.
    const siteUrl = getSiteUrl(env, request);
    const targets = [...buildSeoCacheTargets(siteUrl, []), `${siteUrl}/`];
    waitUntil(invalidateSeoCaches(targets).then(() => undefined));
    waitUntil(purgeCloudflareEdgeCache(env, targets).then(() => undefined));

    return json({ success: true, slugs }, { headers: noStore });
  } catch (error) {
    if (isMissingSchemaError(error)) return migrationRequiredResponse(error, MIGRATION, REASON);
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save featured articles' },
      { status: 502, headers: noStore },
    );
  }
};
