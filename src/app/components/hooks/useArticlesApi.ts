// src/app/components/hooks/useArticlesApi.ts
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

export const fetchArticles = async (forceRefresh = false): Promise<Article[]> => {
  if (!forceRefresh) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data: CacheData = JSON.parse(cached);
      if (Date.now() - data.timestamp < CACHE_EXPIRY) {
        return data.articles;
      }
    }
  }
  try {
    const res = await fetch(READ_ONLY_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const articles = json.record || [];
    localStorage.setItem(CACHE_KEY, JSON.stringify({ articles, timestamp: Date.now() }));
    return articles;
  } catch (error) {
    console.error('fetchArticles error:', error);
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data: CacheData = JSON.parse(cached);
      return data.articles;
    }
    return [];
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