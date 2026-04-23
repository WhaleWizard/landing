import type { Article, Env } from './types';

interface JsonBinConfig {
  binId: string;
  masterKey?: string;
  accessKey?: string;
}

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

function didArticleChange(previous: Article | undefined, next: Article): boolean {
  if (!previous) return true;

  const fieldsToCompare: Array<keyof Article> = [
    'title',
    'description',
    'content',
    'category',
    'readTime',
    'date',
    'image',
    'seoTitle',
    'seoDescription',
  ];

  if (fieldsToCompare.some((field) => String(previous[field] || '') !== String(next[field] || ''))) {
    return true;
  }

  const prevTags = JSON.stringify(previous.tags || []);
  const nextTags = JSON.stringify(next.tags || []);
  return prevTags !== nextTags;
}

export function normalizeArticles(rawArticles: unknown[]): Article[] {
  const usedSlugs = new Set<string>();
  const usedIds = new Set<number>();
  let nextGeneratedId = 1;

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

    const rawId = Number(article.id);
    let safeId = Number.isInteger(rawId) && rawId > 0 ? rawId : index + 1;
    while (usedIds.has(safeId) || safeId <= 0) {
      safeId = Math.max(nextGeneratedId, safeId + 1);
    }
    usedIds.add(safeId);
    nextGeneratedId = Math.max(nextGeneratedId, safeId + 1);

    return {
      id: safeId,
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
      updatedAt: normalizeIsoDate(article.updatedAt, nowIso),
      tags: extractTags(article),
    };
  });
}

function applyFreshnessMetadata(normalized: Article[], previousArticles: Article[]): Article[] {
  const previousBySlug = new Map(previousArticles.map((article) => [article.slug, article]));
  const nowIso = new Date().toISOString();

  return normalized.map((article) => {
    const previous = previousBySlug.get(article.slug);
    const publishedAt = previous?.publishedAt || previous?.updatedAt || article.publishedAt || nowIso;

    if (!previous) {
      return {
        ...article,
        publishedAt,
        updatedAt: article.updatedAt || nowIso,
      };
    }

    const changed = didArticleChange(previous, article);

    return {
      ...article,
      publishedAt,
      updatedAt: changed ? nowIso : (previous.updatedAt || previous.publishedAt || nowIso),
    };
  });
}

function buildPrimaryConfig(env: Env): JsonBinConfig {
  return {
    binId: env.JSONBIN_BIN_ID,
    masterKey: env.JSONBIN_MASTER_KEY,
    accessKey: env.JSONBIN_ACCESS_KEY,
  };
}

function buildBackupConfig(env: Env): JsonBinConfig | null {
  if (!env.JSONBIN_BACKUP_BIN_ID) return null;

  return {
    binId: env.JSONBIN_BACKUP_BIN_ID,
    masterKey: env.JSONBIN_BACKUP_MASTER_KEY || env.JSONBIN_MASTER_KEY,
    accessKey: env.JSONBIN_BACKUP_ACCESS_KEY || env.JSONBIN_ACCESS_KEY,
  };
}

function getJsonBinBase(config: JsonBinConfig): string {
  return `https://api.jsonbin.io/v3/b/${config.binId}`;
}

function getJsonBinReadHeaders(config: JsonBinConfig): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (config.accessKey) {
    headers['X-Access-Key'] = config.accessKey;
  }

  return headers;
}

function getJsonBinWriteHeaders(config: JsonBinConfig): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (config.masterKey) {
    headers['X-Master-Key'] = config.masterKey;
  }

  if (config.accessKey) {
    headers['X-Access-Key'] = config.accessKey;
  }

  return headers;
}

async function fetchArticlesFromConfig(config: JsonBinConfig): Promise<Article[]> {
  const response = await fetch(`${getJsonBinBase(config)}/latest`, {
    method: 'GET',
    headers: getJsonBinReadHeaders(config),
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });

  if (!response.ok) {
    throw new Error(`JSONBin read failed for ${config.binId}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { record?: unknown[] };
  const articles = Array.isArray(payload?.record) ? payload.record : [];
  return normalizeArticles(articles);
}

async function writeArticlesToConfig(config: JsonBinConfig, articles: Article[]): Promise<void> {
  const response = await fetch(getJsonBinBase(config), {
    method: 'PUT',
    headers: getJsonBinWriteHeaders(config),
    body: JSON.stringify(articles),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`JSONBin write failed for ${config.binId}: HTTP ${response.status} ${errorText}`);
  }
}

export async function fetchArticlesFromJsonBin(env: Env): Promise<Article[]> {
  const primaryConfig = buildPrimaryConfig(env);
  const backupConfig = buildBackupConfig(env);

  const readErrors: string[] = [];

  try {
    return await fetchArticlesFromConfig(primaryConfig);
  } catch (error) {
    readErrors.push(error instanceof Error ? error.message : 'Unknown primary JSONBin read error');
  }

  if (backupConfig) {
    try {
      return await fetchArticlesFromConfig(backupConfig);
    } catch (error) {
      readErrors.push(error instanceof Error ? error.message : 'Unknown backup JSONBin read error');
    }
  }

  throw new Error(readErrors.join(' | '));
}

export async function writeArticlesToJsonBin(env: Env, articles: Article[], previousArticles: Article[] = []): Promise<Article[]> {
  const normalizedArticles = normalizeArticles(articles);
  const freshnessSafeArticles = applyFreshnessMetadata(normalizedArticles, previousArticles);

  const primaryConfig = buildPrimaryConfig(env);
  const backupConfig = buildBackupConfig(env);
  const writeErrors: string[] = [];

  let primaryOk = false;

  try {
    await writeArticlesToConfig(primaryConfig, freshnessSafeArticles);
    primaryOk = true;
  } catch (error) {
    writeErrors.push(error instanceof Error ? error.message : 'Unknown primary JSONBin write error');
  }

  if (backupConfig) {
    try {
      await writeArticlesToConfig(backupConfig, freshnessSafeArticles);
    } catch (error) {
      writeErrors.push(error instanceof Error ? error.message : 'Unknown backup JSONBin write error');
    }
  }

  if (!primaryOk && (!backupConfig || writeErrors.length > 1)) {
    throw new Error(writeErrors.join(' | '));
  }

  return freshnessSafeArticles;
}
