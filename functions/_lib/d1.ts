import { normalizeArticles } from './jsonbin';
import type { Article, Env } from './types';

interface D1Row {
  id: number;
  slug: string;
  title: string;
  category: string;
  read_time: string;
  date: string;
  description: string;
  content: string;
  image: string;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  updated_at: string | null;
  tags_json: string | null;
  summary: string | null;
  key_takeaways_json: string | null;
  faq_json: string | null;
}

function hasD1(env: Env): boolean {
  return Boolean(env.DB);
}

function parseArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseFaq(value: string | null): Array<{ question: string; answer: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        question: String(item?.question || '').trim(),
        answer: String(item?.answer || '').trim(),
      }))
      .filter((item) => item.question && item.answer);
  } catch {
    return [];
  }
}

function mapRowToArticle(row: D1Row): Article {
  return {
    id: Number(row.id),
    slug: String(row.slug || ''),
    title: String(row.title || ''),
    category: String(row.category || 'Блог'),
    readTime: String(row.read_time || ''),
    date: String(row.date || new Date().toISOString().slice(0, 10)),
    description: String(row.description || ''),
    content: String(row.content || ''),
    image: String(row.image || '/og-image.jpg'),
    seoTitle: row.seo_title || undefined,
    seoDescription: row.seo_description || undefined,
    publishedAt: row.published_at || undefined,
    updatedAt: row.updated_at || undefined,
    tags: parseArray(row.tags_json),
    summary: row.summary || undefined,
    keyTakeaways: parseArray(row.key_takeaways_json),
    faq: parseFaq(row.faq_json),
  };
}

export async function fetchArticlesFromD1(env: Env): Promise<Article[]> {
  if (!hasD1(env)) return [];
  const result = await env.DB
    .prepare(`SELECT * FROM articles ORDER BY id ASC`)
    .all<D1Row>();
  return (result.results || []).map(mapRowToArticle);
}

export async function writeArticlesToD1(env: Env, rawArticles: Article[], existingArticles: Article[]): Promise<Article[]> {
  if (!hasD1(env)) {
    throw new Error('D1 is not configured');
  }

  const normalized = normalizeArticles(rawArticles);
  const nowIso = new Date().toISOString();
  const existingBySlug = new Map(existingArticles.map((article) => [article.slug, article]));

  const statements = [];
  const seen = new Set<string>();

  for (const article of normalized) {
    seen.add(article.slug);
    const previous = existingBySlug.get(article.slug);
    const publishedAt = previous?.publishedAt || article.publishedAt || nowIso;
    const updatedAt = article.updatedAt || nowIso;

    statements.push(
      env.DB.prepare(
        `INSERT INTO articles (
          id, slug, title, category, read_time, date, description, content, image,
          seo_title, seo_description, published_at, updated_at, tags_json, summary, key_takeaways_json, faq_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          id = excluded.id,
          title = excluded.title,
          category = excluded.category,
          read_time = excluded.read_time,
          date = excluded.date,
          description = excluded.description,
          content = excluded.content,
          image = excluded.image,
          seo_title = excluded.seo_title,
          seo_description = excluded.seo_description,
          published_at = COALESCE(articles.published_at, excluded.published_at),
          updated_at = excluded.updated_at,
          tags_json = excluded.tags_json,
          summary = excluded.summary,
          key_takeaways_json = excluded.key_takeaways_json,
          faq_json = excluded.faq_json`
      ).bind(
        article.id,
        article.slug,
        article.title,
        article.category,
        article.readTime || '',
        article.date,
        article.description,
        article.content,
        article.image || '/og-image.jpg',
        article.seoTitle || article.title,
        article.seoDescription || article.description,
        publishedAt,
        updatedAt,
        JSON.stringify(article.tags || []),
        article.summary || '',
        JSON.stringify(article.keyTakeaways || []),
        JSON.stringify(article.faq || []),
      ),
    );
  }

  if (existingArticles.length > 0 && normalized.length > 0) {
    const slugsToDelete = existingArticles.map((article) => article.slug).filter((slug) => !seen.has(slug));
    for (const slug of slugsToDelete) {
      statements.push(env.DB.prepare('DELETE FROM articles WHERE slug = ?').bind(slug));
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return fetchArticlesFromD1(env);
}
