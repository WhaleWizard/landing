import { API_ROUTES } from '../../config';

export interface CaseMetric {
  value: string;
  label: string;
}

export interface CaseBeforeAfter {
  label: string;
  from: string;
  to: string;
  delta?: string;
}

// Структурированные поля кейса (заполняются в админке, категория «Кейсы»).
export interface CaseData {
  niche?: string;
  sources?: string[];
  period?: string;
  budgetLabel?: string;
  budgetValue?: number;
  leadsValue?: number;
  roiValue?: number;
  headline?: string;
  headlineLabel?: string;
  trend?: string;
  metrics?: CaseMetric[];
  beforeAfter?: CaseBeforeAfter;
  chartPoints?: number[];
  featured?: boolean;
}

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
  status?: 'draft' | 'published';
  caseData?: CaseData;
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

interface AdminArticlesResponse {
  success: boolean;
  articles: Article[];
  error?: string;
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

function sanitizeAdminArticles(source: Article[]): Article[] {
  const unique = dedupeBySlug(asArticleArray(source));
  return unique.filter((article) => hasValidSlug(article?.slug));
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
    if (!Array.isArray(json?.articles)) throw new Error('Invalid articles response');
    const primaryArticles = dedupeBySlug(asArticleArray(json.articles));

    if (primaryArticles.length > 0) {
      return primaryArticles;
    }

    return [];
  } catch (error) {
    console.error('fetchArticles error:', error);
    // Runtime Pages Functions already maintain an authoritative last-known-good
    // D1 snapshot. A second client fallback to old seed/JSONBin would resurrect
    // deleted posts exactly when the server intentionally returns 503.
    throw error instanceof Error ? error : new Error('Failed to load articles');
  }
};

export const fetchAdminArticles = async (password: string): Promise<Article[]> => {
  const res = await fetch(`${API_ROUTES.adminArticles}?_=${Date.now()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': password,
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const payload = (await res.json().catch(() => null)) as AdminArticlesResponse | null;
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error || `HTTP ${res.status}`);
  }

  return sanitizeAdminArticles(asArticleArray(payload.articles));
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
      return { success: true, articles: savedArticles };
    }

    return { success: false, articles: [] };
  } catch (error) {
    console.error('saveArticles error:', error);
    throw error;
  }
};
