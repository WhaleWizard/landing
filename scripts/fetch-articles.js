import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_DIR,
  BUILD_ARTICLES_PATH,
  LOCAL_ARTICLES_PATH,
  PUBLIC_SEED_PATH,
  PUBLIC_ARTICLES_URL,
  JSONBIN_URL,
  RETRIES,
  TIMEOUT_MS,
  buildJsonBinHeaders,
} from './config.js';

// Build-time authority follows the runtime storage mode. In D1 mode JSONBin is
// not a safe fallback: admin writes do not mirror D1 changes back to JSONBin.
const REQUIRE_FRESH_ARTICLES = process.env.REQUIRE_FRESH_ARTICLES === 'true'
  || process.env.STRICT_ARTICLES_FETCH === 'true';
const ALLOW_FALLBACK_BUILD = process.env.ALLOW_FALLBACK_BUILD === 'true';
const USE_D1_ARTICLES = process.env.USE_D1_ARTICLES === 'true';
const AUTHORITATIVE_BUILD_SOURCES = {
  d1: new Set(['public-api', 'd1', 'd1-public-api']),
  jsonbin: new Set(['public-api', 'jsonbin']),
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export function isUsableArticleList(value) {
  if (!Array.isArray(value) || value.length === 0) return false;

  const slugs = new Set();
  return value.every((article) => {
    if (!article || typeof article !== 'object' || Array.isArray(article)) return false;
    const slug = String(article.slug || '').trim();
    const title = String(article.title || '').trim();
    if (!slug || !title || slugs.has(slug)) return false;
    slugs.add(slug);
    return true;
  });
}

function hasValidSnapshotTimestamp(value) {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

export function readArticleSnapshot(pathname) {
  if (!existsSync(pathname)) return null;

  try {
    const payload = JSON.parse(readFileSync(pathname, 'utf8'));
    const articles = Array.isArray(payload) ? payload : payload?.articles;
    if (!isUsableArticleList(articles)) return null;
    if (Number.isFinite(Number(payload?.total)) && Number(payload.total) !== articles.length) return null;
    return {
      source: typeof payload?.source === 'string' ? payload.source : '',
      fetchedAt: typeof payload?.fetchedAt === 'string' ? payload.fetchedAt : '',
      articles,
    };
  } catch {
    return null;
  }
}

function isAuthoritativeBuildSnapshot(snapshot, useD1Articles) {
  if (!snapshot || !hasValidSnapshotTimestamp(snapshot.fetchedAt)) return false;
  const allowedSources = useD1Articles
    ? AUTHORITATIVE_BUILD_SOURCES.d1
    : AUTHORITATIVE_BUILD_SOURCES.jsonbin;
  return allowedSources.has(snapshot.source) && isUsableArticleList(snapshot.articles);
}

/**
 * Explicit priority is intentional. Article count is not freshness: choosing
 * the biggest snapshot can resurrect posts that were deleted in the CMS.
 */
export function selectFallbackSource({
  useD1Articles,
  buildSnapshot,
  publicSeedSnapshot,
  localSnapshot,
}) {
  if (isAuthoritativeBuildSnapshot(buildSnapshot, useD1Articles)) {
    return {
      source: 'build-cache-fallback',
      articles: buildSnapshot.articles,
      preserveBuildCache: true,
    };
  }

  if (publicSeedSnapshot && isUsableArticleList(publicSeedSnapshot.articles)) {
    return {
      source: 'public-seed-fallback',
      articles: publicSeedSnapshot.articles,
      preserveBuildCache: false,
    };
  }

  if (localSnapshot && isUsableArticleList(localSnapshot.articles)) {
    return {
      source: 'local-fallback',
      articles: localSnapshot.articles,
      preserveBuildCache: false,
    };
  }

  return null;
}

function readFallbackSources(useD1Articles) {
  return selectFallbackSource({
    useD1Articles,
    buildSnapshot: readArticleSnapshot(BUILD_ARTICLES_PATH),
    publicSeedSnapshot: readArticleSnapshot(PUBLIC_SEED_PATH),
    localSnapshot: readArticleSnapshot(LOCAL_ARTICLES_PATH),
  });
}

function writeBuildArticles(articles, source) {
  ensureDataDir();
  writeFileSync(
    BUILD_ARTICLES_PATH,
    JSON.stringify(
      {
        source,
        fetchedAt: new Date().toISOString(),
        total: articles.length,
        articles,
      },
      null,
      2,
    ),
    'utf8',
  );
}

/**
 * Повторы при сетевом сбое, общие для обоих источников.
 *
 * Повторяется только неудача самого запроса — обрыв связи или код ошибки.
 * Пустой или негодный список повторами не лечится: его проверяет
 * `isUsableArticleList` уже после возврата, и правило «пустой список — это
 * ответ, а не сбой» остаётся нетронутым.
 *
 * Раньше повторы были только у JSONBin. Публичный API опрашивается со сборки на
 * Cloudflare и обращается к тому же сайту, поэтому единичный сбой там вполне
 * обычен — холодный старт, гонка с предыдущим деплоем. Без повторов такой сбой
 * сразу уводил сборку на запасной источник, а при включённом
 * REQUIRE_FRESH_ARTICLES просто ронял её.
 */
async function withRetries(label, run) {
  let lastError = null;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ ${label} fetch attempt ${attempt}/${RETRIES} failed.`);
      if (attempt < RETRIES) await sleep(300 * attempt);
    }
  }

  throw lastError || new Error(`${label} fetch failed`);
}

async function fetchArticlesFromPublicApi() {
  return withRetries('Public articles API', async () => {
    const response = await fetchWithTimeout(
      PUBLIC_ARTICLES_URL,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WhaleWizard-SEO-Build/1.0',
        },
        method: 'GET',
      },
      TIMEOUT_MS,
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.articles) ? payload.articles : [];
  });
}

async function fetchArticlesFromJsonBin() {
  const headers = buildJsonBinHeaders();

  return withRetries('JSONBin', async () => {
    const response = await fetchWithTimeout(
      JSONBIN_URL,
      {
        headers,
        method: 'GET',
      },
      TIMEOUT_MS,
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    if (Array.isArray(payload?.record)) return payload.record;
    if (Array.isArray(payload?.record?.articles)) return payload.record.articles;
    return [];
  });
}

/**
 * Resolve live content without mutating the build snapshot. Tests inject the
 * fetchers so the D1/JSONBin authority boundary stays covered without network.
 */
export async function resolveArticlesForBuild({
  useD1Articles,
  fetchPublicArticles,
  fetchJsonBinArticles,
  fallback,
}) {
  try {
    const articles = await fetchPublicArticles();
    if (isUsableArticleList(articles)) {
      return { source: 'public-api', articles, fallback: false, preserveBuildCache: false };
    }
  } catch (error) {
    console.warn('⚠️ Public articles API unavailable.');
    console.warn(error);
  }

  if (!useD1Articles) {
    try {
      const articles = await fetchJsonBinArticles();
      if (isUsableArticleList(articles)) {
        return { source: 'jsonbin', articles, fallback: false, preserveBuildCache: false };
      }
    } catch (error) {
      console.warn('⚠️ JSONBin unavailable.');
      console.warn(error);
    }
  }

  if (!fallback) return null;
  return { ...fallback, fallback: true };
}

export function fallbackViolatesFreshness(requireFresh, allowFallback) {
  return requireFresh && !allowFallback;
}

export async function main() {
  const fallback = readFallbackSources(USE_D1_ARTICLES);
  const result = await resolveArticlesForBuild({
    useD1Articles: USE_D1_ARTICLES,
    fetchPublicArticles: fetchArticlesFromPublicApi,
    fetchJsonBinArticles: fetchArticlesFromJsonBin,
    fallback,
  });

  if (!result) {
    console.error('❌ Article sources are unavailable or invalid; refusing to generate an empty blog build.');
    process.exitCode = 1;
    return;
  }

  if (!result.preserveBuildCache) {
    writeBuildArticles(result.articles, result.source);
  }

  if (!result.fallback) {
    console.log(`✅ Articles fetched from ${result.source}: ${result.articles.length}`);
    return;
  }

  console.warn(`⚠️ Live article source unavailable. Using ${result.source}: ${result.articles.length} articles.`);
  if (fallbackViolatesFreshness(REQUIRE_FRESH_ARTICLES, ALLOW_FALLBACK_BUILD)) {
    console.error('❌ Fresh article content is required. Set ALLOW_FALLBACK_BUILD=true only for an explicit emergency build.');
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath && resolve(fileURLToPath(import.meta.url)) === entryPath) {
  main().catch((error) => {
    console.error('❌ Article build fetch failed.');
    console.error(error);
    process.exitCode = 1;
  });
}
