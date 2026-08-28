import { applyFreshnessMetadata, normalizeArticles, normalizeCaseData } from './jsonbin';
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
  status: string | null;
  case_data_json?: string | null;
}

/**
 * Есть ли подключённая база. Это не просто проверка, а сужение типа: после
 * неё TypeScript знает, что `env.DB` уже не может быть пустым, и перестаёт
 * требовать восклицательные знаки в каждом обращении.
 */
function hasD1(env: Env): env is Env & { DB: D1Database } {
  return Boolean(env.DB);
}

// Колонка case_data_json появляется миграцией 0007. Проверяем её наличие,
// чтобы код работал и до применения миграции (кейс-поля просто не сохранятся).
let articlesColumnsCache: { columns: Set<string>; expiresAt: number } | null = null;

async function getArticlesColumns(db: D1Database): Promise<Set<string>> {
  const now = Date.now();
  if (articlesColumnsCache && articlesColumnsCache.expiresAt > now) {
    return articlesColumnsCache.columns;
  }
  const result = await db.prepare('PRAGMA table_info(articles)').all<{ name: string }>();
  const columns = new Set((result.results || []).map((column) => column.name).filter(Boolean));
  articlesColumnsCache = { columns, expiresAt: now + 5 * 60 * 1000 };
  return columns;
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

function parseCaseData(value: string | null | undefined): Article['caseData'] {
  if (!value) return undefined;
  try {
    return normalizeCaseData(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function normalizeArticleStatus(value: string | null | undefined): Article['status'] {
  return value === 'draft' ? 'draft' : 'published';
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
    image: String(row.image || '/og-image-v2.jpg'),
    seoTitle: row.seo_title || undefined,
    seoDescription: row.seo_description || undefined,
    publishedAt: row.published_at || undefined,
    updatedAt: row.updated_at || undefined,
    tags: parseArray(row.tags_json),
    summary: row.summary || undefined,
    keyTakeaways: parseArray(row.key_takeaways_json),
    faq: parseFaq(row.faq_json),
    status: normalizeArticleStatus(row.status),
    caseData: parseCaseData(row.case_data_json),
  };
}

export async function fetchArticlesFromD1(env: Env): Promise<Article[]> {
  if (!hasD1(env)) return [];
  const result = await env.DB
    .prepare(`SELECT * FROM articles ORDER BY id ASC`)
    .all<D1Row>();
  return (result.results || []).map(mapRowToArticle);
}

/**
 * Public article detail requests know the canonical slug already. Read exactly
 * that row so a short slug cannot pull every legacy-prefix candidate (and all
 * of their HTML bodies) through the API response path.
 */
export async function fetchArticleFromD1(env: Env, rawSlug: string): Promise<Article | null> {
  if (!hasD1(env)) return null;

  const slug = String(rawSlug || '').trim();
  if (!slug) return null;

  const result = await env.DB
    .prepare(`SELECT * FROM articles WHERE slug = ? LIMIT 1`)
    .bind(slug)
    .all<D1Row>();

  const row = result.results?.[0];
  return row ? mapRowToArticle(row) : null;
}

/**
 * Listing cards need article metadata, not every HTML body. Selecting an empty
 * content alias keeps the shared Article mapper/contract while avoiding the
 * largest column in the D1 result and in the public response pipeline.
 */
export async function fetchArticleSummariesFromD1(env: Env): Promise<Article[]> {
  if (!hasD1(env)) return [];

  const articleColumns = await getArticlesColumns(env.DB);
  const hasCaseColumn = articleColumns.has('case_data_json');
  const statusSelection = articleColumns.has('status')
    ? 'status'
    : "'published' AS status";
  const result = await env.DB
    .prepare(`SELECT
      id, slug, title, category, read_time, date, description,
      '' AS content, image, seo_title, seo_description, published_at, updated_at,
      tags_json, summary, key_takeaways_json, faq_json, ${statusSelection}
      ${hasCaseColumn ? ', case_data_json' : ''}
      FROM articles
      ORDER BY id ASC`)
    .all<D1Row>();

  return (result.results || []).map(mapRowToArticle);
}

/**
 * Read only the rows that can satisfy an article route. Besides the exact slug,
 * the route supports a legacy shortened-slug redirect when exactly one article
 * starts with `${slug}-`. The range predicate stays index-friendly and avoids
 * treating `%`/`_` from an untrusted URL as LIKE wildcards.
 */
export async function fetchArticleCandidatesFromD1(env: Env, rawSlug: string): Promise<Article[]> {
  if (!hasD1(env)) return [];

  const slug = String(rawSlug || '').trim();
  if (!slug) return [];

  const prefixStart = `${slug}-`;
  const prefixEnd = `${slug}.`;
  const result = await env.DB
    .prepare(`SELECT * FROM articles
      WHERE slug = ? OR (slug >= ? AND slug < ?)
      ORDER BY id ASC`)
    .bind(slug, prefixStart, prefixEnd)
    .all<D1Row>();

  return (result.results || []).map(mapRowToArticle);
}

export async function writeArticlesToD1(env: Env, rawArticles: Article[], existingArticles: Article[]): Promise<Article[]> {
  if (!hasD1(env)) {
    throw new Error('D1 is not configured');
  }

  const normalized = applyFreshnessMetadata(normalizeArticles(rawArticles), existingArticles);
  const nowIso = new Date().toISOString();
  const hasCaseColumn = (await getArticlesColumns(env.DB)).has('case_data_json');

  const baseColumns = [
    'id', 'slug', 'title', 'category', 'read_time', 'date', 'description', 'content', 'image',
    'seo_title', 'seo_description', 'published_at', 'updated_at', 'tags_json', 'summary',
    'key_takeaways_json', 'faq_json', 'status',
  ];
  const columns = hasCaseColumn ? [...baseColumns, 'case_data_json'] : baseColumns;
  const placeholders = columns.map(() => '?').join(', ');
  const updateSet = columns
    .filter((column) => column !== 'id' && column !== 'slug')
    .map((column) => (
      // Дату публикации разрешает applyFreshnessMetadata: там уже учтено и
      // введённое значение, и прежнее. Здесь прежнее значение больше не
      // выигрывает — иначе правка даты не доезжала бы до базы. COALESCE
      // оставлен как страховка от NULL: обнулять сохранённую дату нельзя.
      column === 'published_at'
        ? 'published_at = COALESCE(excluded.published_at, articles.published_at)'
        : `${column} = excluded.${column}`
    ));
  updateSet.unshift('id = excluded.id');

  const insertSql = `INSERT INTO articles (${columns.join(', ')}) VALUES (${placeholders})
    ON CONFLICT(slug) DO UPDATE SET ${updateSet.join(', ')}`;

  const statements: D1PreparedStatement[] = [];
  const seen = new Set<string>();

  for (const article of normalized) {
    seen.add(article.slug);
    // `normalized` уже прошёл applyFreshnessMetadata, где дата публикации
    // разрешена по правилу «введённое важнее прежнего». Повторно сверяться с
    // прежним значением здесь нельзя: именно это и отменяло правку даты.
    const publishedAt = article.publishedAt || nowIso;
    const updatedAt = article.updatedAt || nowIso;

    const values: Array<string | number | null> = [
      article.id,
      article.slug,
      article.title,
      article.category,
      article.readTime || '',
      article.date,
      article.description,
      article.content,
      article.image || '/og-image-v2.jpg',
      article.seoTitle || article.title,
      article.seoDescription || article.description,
      publishedAt,
      updatedAt,
      JSON.stringify(article.tags || []),
      article.summary || '',
      JSON.stringify(article.keyTakeaways || []),
      JSON.stringify(article.faq || []),
      normalizeArticleStatus(article.status) as string,
    ];
    if (hasCaseColumn) {
      values.push(article.caseData ? JSON.stringify(article.caseData) : null);
    }

    statements.push(env.DB.prepare(insertSql).bind(...values));
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
