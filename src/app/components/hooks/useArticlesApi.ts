import { API_ROUTES, JSONBIN_PUBLIC_URL } from '../../config';

const LOCAL_ARTICLES_BACKUP_KEY = 'ww_articles_backup_v1';

export interface Article {
  id: number;
  slug: string;
  sortOrder?: number;
  title: string;
  category: string;
  readTime: string;
  date: string;
  description: string;
  content: string;
  image: string;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: string;
  updatedAt?: string;
  tags?: string[];
  summary?: string;
  keyTakeaways?: string[];
  faq?: Array<{
    question: string;
    answer: string;
  }>;
}

interface ArticlesResponse {
  articles: Article[];
}

interface AdminUpdateResponse {
  success: boolean;
  articles: Article[];
  cacheInvalidationAttempted?: boolean;
  siteUrlUsed?: string;
  requestOrigin?: string;
  invalidatedPathsCount?: number;
  invalidationTargetsCount?: number;
  invalidationFailedCount?: number;
}

function articleIdentityKey(article: Article, index: number): string {
  const slug = String(article?.slug || '').trim();
  if (slug) return `slug:${slug}`;

  const id = Number(article?.id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;

  const title = String(article?.title || '').trim().toLowerCase();
  if (title) return `title:${title}`;

  return `index:${index}`;
}

function dedupeBySlug(articles: Article[]): Article[] {
  const map = new Map<string, Article>();
  const source = Array.isArray(articles) ? articles : [];

  source.forEach((article, index) => {
    map.set(articleIdentityKey(article, index), article);
  });

  return Array.from(map.values());
}

function asArticleArray(value: unknown): Article[] {
  return Array.isArray(value) ? (value as Article[]) : [];
}


function hasValidSlug(slug?: string): boolean {
  const normalized = String(slug || '').trim();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized);
}

function hasImage(image?: string): boolean {
  return String(image || '').trim().length > 0;
}

function sanitizeArticles(source: Article[]): Article[] {
  const unique = dedupeBySlug(asArticleArray(source));
  return unique.filter((article) => hasValidSlug(article?.slug) && hasImage(article?.image));
}

function asIsoTimestamp(value?: string): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function articleRecencyScore(article?: Article): number {
  if (!article) return 0;
  return Math.max(
    asIsoTimestamp(article.updatedAt),
    asIsoTimestamp(article.publishedAt),
  );
}

function pickPreferredArticle(current: Article | undefined, incoming: Article): Article {
  if (!current) return incoming;

  const currentScore = articleRecencyScore(current);
  const incomingScore = articleRecencyScore(incoming);

  if (incomingScore > currentScore) return incoming;
  if (incomingScore < currentScore) return current;

  const currentContentLength = String(current.content || '').length;
  const incomingContentLength = String(incoming.content || '').length;
  if (incomingContentLength > currentContentLength) return incoming;

  return current;
}

function saveLocalArticlesBackup(articles: Article[]): void {
  if (typeof window === 'undefined') return;

  try {
    const safeArticles = Array.isArray(articles) ? articles : [];
    window.localStorage.setItem(LOCAL_ARTICLES_BACKUP_KEY, JSON.stringify(safeArticles));
  } catch {
    // noop: localStorage can be unavailable in private mode
  }
}

function fetchLocalArticlesBackup(): Article[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_ARTICLES_BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchLocalSeedFallback(): Promise<Article[]> {
  try {
    const res = await fetch('/articles.seed.json', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'force-cache',
    });

    if (!res.ok) return [];
    const json = await res.json();
    return asArticleArray(json?.articles);
  } catch {
    return [];
  }
}

async function fetchPublicJsonBinFallback(): Promise<Article[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1800);
  try {
    const res = await fetch(JSONBIN_PUBLIC_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'force-cache',
      signal: controller.signal,
    });

    if (!res.ok) return [];
    const json = await res.json();
    if (Array.isArray(json?.record)) return asArticleArray(json.record);
    return asArticleArray(json?.record?.articles);
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function resolveFallbackArticles(): Promise<Article[]> {
  const localBackup = sanitizeArticles(fetchLocalArticlesBackup());
  const localSeed = await fetchLocalSeedFallback().then((articles) => sanitizeArticles(articles));

  // Быстрый путь: если уже есть локальные данные — возвращаем их сразу,
  // чтобы не блокировать UI медленными внешними запросами.
  const quickSource = [localSeed, localBackup].find((source) => source.length > 0) || [];
  if (quickSource.length > 0) {
    saveLocalArticlesBackup(quickSource);
    return quickSource;
  }

  const publicFallback = await fetchPublicJsonBinFallback().then((articles) => sanitizeArticles(articles));

  // Prefer a single freshest non-empty fallback source to avoid mixing stale and current datasets.
  const preferredSource = [publicFallback, localSeed, localBackup].find((source) => source.length > 0) || [];
  if (preferredSource.length > 0) {
    saveLocalArticlesBackup(preferredSource);
    return preferredSource;
  }

  // Last-resort merge for rare edge-cases where all sources are tiny/partial.
  const mergedMap = new Map<string, Article>();
  [publicFallback, localSeed, localBackup].forEach((candidate) => {
    candidate.forEach((article, index) => {
      const key = articleIdentityKey(article, index);
      const preferred = pickPreferredArticle(mergedMap.get(key), article);
      mergedMap.set(key, preferred);
    });
  });

  const merged = Array.from(mergedMap.values());
  if (merged.length > 0) saveLocalArticlesBackup(merged);
  return merged;
}

export const fetchArticles = async (options?: { bypassCache?: boolean }): Promise<Article[]> => {
  try {
    const endpoint = options?.bypassCache
      ? `${API_ROUTES.articles}${API_ROUTES.articles.includes('?') ? '&' : '?'}_=${Date.now()}`
      : API_ROUTES.articles;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: options?.bypassCache ? 'no-store' : 'default',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as ArticlesResponse;
    const primaryArticles = dedupeBySlug(asArticleArray(json?.articles));

    if (primaryArticles.length > 0) {
      // API is source of truth for admin operations. Do not restore deleted records from stale fallbacks.
      saveLocalArticlesBackup(primaryArticles);
      return primaryArticles;
    }

    return resolveFallbackArticles();
  } catch (error) {
    console.error('fetchArticles error:', error);
    return resolveFallbackArticles();
  }
};

export const saveArticles = async (articles: Article[], password: string): Promise<AdminUpdateResponse> => {
  try {
    const res = await fetch(API_ROUTES.adminArticles, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        password,
        articles,
      }),
    });

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => null);
      throw new Error(errorPayload?.error || `HTTP ${res.status}`);
    }

    const result = (await res.json()) as AdminUpdateResponse;
    if (result?.success) {
      const savedArticles = Array.isArray(result.articles) ? result.articles : articles;
      saveLocalArticlesBackup(savedArticles);
      return { success: true, articles: savedArticles };
    }

    return { success: false, articles: [] };
  } catch (error) {
    console.error('saveArticles error:', error);
    throw error;
  }
};
