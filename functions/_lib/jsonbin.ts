import type { Article, Env } from './types';

function toSafeSlug(rawSlug: string, fallback: string): string {
  const normalized = String(rawSlug || fallback || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized || fallback;
}

function stripHtml(html = ''): string {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeArticleContent(content: string): string {
  return String(content || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function normalizeIsoDate(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function extractTags(article: Partial<Article>): string[] {
  if (Array.isArray(article.tags)) {
    return article.tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  return [];
}

export function normalizeArticles(rawArticles: unknown[]): Article[] {
  const usedSlugs = new Set<string>();

  return rawArticles.map((rawArticle, index) => {
    const article = (rawArticle ?? {}) as Partial<Article>;
    const baseSlug = toSafeSlug(article.slug || article.title || '', `article-${index + 1}`);
    let uniqueSlug = baseSlug;
    let suffix = 2;

    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    usedSlugs.add(uniqueSlug);

    const nowIso = new Date().toISOString();
    const safeContent = sanitizeArticleContent(article.content || '<p>Контент статьи отсутствует.</p>');
    const fallbackDescription = stripHtml(article.description || safeContent).slice(0, 160);
    const seoDescription = (article.seoDescription || fallbackDescription).slice(0, 170);

    return {
      id: Number(article.id || index + 1),
      slug: uniqueSlug,
      title: article.title || `Статья ${index + 1}`,
      category: article.category || 'Блог',
      readTime: article.readTime || '',
      date: article.date || new Date().toISOString().slice(0, 10),
      description: fallbackDescription,
      content: safeContent,
      image: article.image || '/og-image.jpg',
      seoTitle: (article.seoTitle || article.title || `Статья ${index + 1}`).slice(0, 70),
      seoDescription,
      publishedAt: normalizeIsoDate(article.publishedAt, nowIso),
      updatedAt: nowIso,
      tags: extractTags(article),
    };
  });
}

function getJsonBinBase(env: Env): string {
  return `https://api.jsonbin.io/v3/b/${env.JSONBIN_BIN_ID}`;
}

function getJsonBinHeaders(env: Env): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Master-Key': env.JSONBIN_MASTER_KEY,
  };

  if (env.JSONBIN_ACCESS_KEY) {
    headers['X-Access-Key'] = env.JSONBIN_ACCESS_KEY;
  }

  return headers;
}

export async function fetchArticlesFromJsonBin(env: Env): Promise<Article[]> {
  const response = await fetch(`${getJsonBinBase(env)}/latest`, {
    method: 'GET',
    headers: getJsonBinHeaders(env),
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });

  if (!response.ok) {
    throw new Error(`JSONBin read failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { record?: unknown[] };
  const articles = Array.isArray(payload?.record) ? payload.record : [];
  return normalizeArticles(articles);
}

export async function writeArticlesToJsonBin(env: Env, articles: Article[]): Promise<Article[]> {
  const normalizedArticles = normalizeArticles(articles);

  const response = await fetch(getJsonBinBase(env), {
    method: 'PUT',
    headers: getJsonBinHeaders(env),
    body: JSON.stringify(normalizedArticles),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`JSONBin write failed: HTTP ${response.status} ${errorText}`);
  }

  return normalizedArticles;
}
