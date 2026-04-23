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

function dedupeBySlug(articles: Article[]): Article[] {
  const map = new Map<string, Article>();

  for (const article of Array.isArray(articles) ? articles : []) {
    if (!article?.slug) continue;
    map.set(article.slug, article);
  }

  return Array.from(map.values());
}

function asArticleArray(value: unknown): Article[] {
  return Array.isArray(value) ? (value as Article[]) : [];
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

  const candidates = [localBackup, localSeed, publicFallback].map(dedupeBySlug);
  const best = candidates.reduce<Article[]>((current, candidate) => {
    return candidate.length > current.length ? candidate : current;
  }, []);

  if (best.length > 0) saveLocalArticlesBackup(best);
  return best;
}

export const fetchArticles = async (): Promise<Article[]> => {
  try {
    const res = await fetch(API_ROUTES.articles, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as ArticlesResponse;
    const primaryArticles = dedupeBySlug(asArticleArray(json?.articles));

    if (primaryArticles.length > 0) {
      saveLocalArticlesBackup(primaryArticles);
      return primaryArticles;
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
