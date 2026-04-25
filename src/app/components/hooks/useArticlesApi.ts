import { API_ROUTES, JSONBIN_PUBLIC_URL } from '../../config';

const LOCAL_ARTICLES_BACKUP_KEY = 'ww_articles_backup_v1';

export interface Article {
  id: number;
  slug: string;
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

function toTimestamp(article: Article | undefined): number {
  const value = String(article?.updatedAt || article?.publishedAt || '').trim();
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickFresherArticle(primary: Article, backup: Article): Article {
  const primaryTs = toTimestamp(primary);
  const backupTs = toTimestamp(backup);

  if (backupTs > primaryTs) return backup;
  if (primaryTs > backupTs) return primary;

  const primaryContentSize = String(primary?.content || '').length;
  const backupContentSize = String(backup?.content || '').length;
  if (backupContentSize > primaryContentSize) return backup;
  return primary;
}

function mergeArticlesPreferFresh(primary: Article[], backup: Article[]): Article[] {
  const merged = new Map<string, Article>();

  dedupeBySlug(primary).forEach((article, index) => {
    merged.set(articleIdentityKey(article, index), article);
  });

  dedupeBySlug(backup).forEach((article, index) => {
    const key = articleIdentityKey(article, index);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, article);
      return;
    }
    merged.set(key, pickFresherArticle(current, article));
  });

  return Array.from(merged.values());
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
      cache: 'no-store',
    });

    if (!res.ok) return [];
    const json = await res.json();
    return asArticleArray(json?.articles);
  } catch {
    return [];
  }
}

async function fetchPublicJsonBinFallback(): Promise<Article[]> {
  try {
    const res = await fetch(JSONBIN_PUBLIC_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) return [];
    const json = await res.json();
    if (Array.isArray(json?.record)) return asArticleArray(json.record);
    return asArticleArray(json?.record?.articles);
  } catch {
    return [];
  }
}

async function resolveFallbackArticles(): Promise<Article[]> {
  const localBackup = fetchLocalArticlesBackup();
  const [localSeed, publicFallback] = await Promise.all([
    fetchLocalSeedFallback(),
    fetchPublicJsonBinFallback(),
  ]);

  const mergedMap = new Map<string, Article>();
  const candidates = [publicFallback, localSeed, localBackup].map(dedupeBySlug);

  candidates.forEach((candidate) => {
    candidate.forEach((article, index) => {
      mergedMap.set(articleIdentityKey(article, index), article);
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
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as ArticlesResponse;
    const primaryArticles = dedupeBySlug(asArticleArray(json?.articles));
    const localBackup = dedupeBySlug(fetchLocalArticlesBackup());

    if (primaryArticles.length > 0) {
      const merged = mergeArticlesPreferFresh(primaryArticles, localBackup);
      saveLocalArticlesBackup(merged);
      return merged;
    }

    return resolveFallbackArticles();
  } catch (error) {
    console.error('fetchArticles error:', error);
    return resolveFallbackArticles();
  }
};

export const saveArticles = async (articles: Article[], password: string): Promise<boolean> => {
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
      saveLocalArticlesBackup(Array.isArray(result.articles) ? result.articles : articles);
    }
    return Boolean(result?.success);
  } catch (error) {
    console.error('saveArticles error:', error);
    throw error;
  }
};
