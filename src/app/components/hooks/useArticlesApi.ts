import { BIN_ID, API_KEY, READ_ONLY_URL, ADMIN_PASSWORD } from '../../config';

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
}

const CACHE_KEY = 'whale_wzrd_articles_cache';
const CACHE_EXPIRY = 3 * 60 * 60 * 1000; // 3 часа

interface CacheData {
  articles: Article[];
  timestamp: number;
}

const buildReadHeaders = (): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const accessKey = import.meta.env.VITE_JSONBIN_ACCESS_KEY;

  if (accessKey) {
    headers['X-Access-Key'] = accessKey;
  }

  return headers;
};

const readCache = (): CacheData | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached);

    if (!Array.isArray(parsed?.articles) || typeof parsed?.timestamp !== 'number') {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('readCache error:', error);
    return null;
  }
};

const writeCache = (articles: Article[]) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        articles,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.warn('writeCache error:', error);
  }
};

export const fetchArticles = async (forceRefresh = false): Promise<Article[]> => {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
      return cached.articles;
    }
  }

  try {
    const res = await fetch(READ_ONLY_URL, {
      headers: buildReadHeaders(),
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const articles = Array.isArray(json?.record) ? json.record : [];

    writeCache(articles);

    return articles;
  } catch (error) {
    console.error('fetchArticles error:', error);

    const cached = readCache();
    return cached?.articles || [];
  }
};

export const saveArticles = async (articles: Article[], password: string): Promise<boolean> => {
  if (password !== ADMIN_PASSWORD) throw new Error('Неверный пароль');

  const url = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
  console.log('Saving articles to jsonbin:', url);

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': API_KEY,
      },
      body: JSON.stringify(articles),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('jsonbin response error:', errorText);
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const result = await res.json();
    console.log('Save successful:', result);

    localStorage.removeItem(CACHE_KEY);

    await fetchArticles(true);

    return true;
  } catch (error) {
    console.error('saveArticles error:', error);
    return false;
  }
};