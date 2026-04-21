import { API_ROUTES, JSONBIN_PUBLIC_URL } from '../../config';

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

async function fetchPublicJsonBinFallback(): Promise<Article[]> {
  try {
    const res = await fetch(JSONBIN_PUBLIC_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.record) ? json.record : [];
  } catch {
    return [];
  }
}

export const fetchArticles = async (): Promise<Article[]> => {
  try {
    const res = await fetch(API_ROUTES.articles, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as ArticlesResponse;
    const primaryArticles = Array.isArray(json?.articles) ? json.articles : [];

    if (primaryArticles.length > 0) return primaryArticles;
    return fetchPublicJsonBinFallback();
  } catch (error) {
    console.error('fetchArticles error:', error);
    return fetchPublicJsonBinFallback();
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
    return Boolean(result?.success);
  } catch (error) {
    console.error('saveArticles error:', error);
    throw error;
  }
};
