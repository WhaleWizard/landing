import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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

// Fallback chain: JSONBin -> previous build cache -> committed local fallback.
// Production can require fresh JSONBin content without relying on provider-specific CI flags.
const REQUIRE_FRESH_ARTICLES = process.env.REQUIRE_FRESH_ARTICLES === 'true' || process.env.STRICT_ARTICLES_FETCH === 'true';
const ALLOW_FALLBACK_BUILD = process.env.ALLOW_FALLBACK_BUILD === 'true';
const USE_D1_ARTICLES = process.env.USE_D1_ARTICLES === 'true';
const HAS_EXPLICIT_JSONBIN_SOURCE = Boolean(process.env.JSONBIN_URL || process.env.JSONBIN_BIN_ID);
// When D1 is the runtime source of truth, build-time JSONBin is only a static SEO fallback.
// Runtime Pages Functions will read current articles from D1 after deploy.
const FAIL_ON_FALLBACK = REQUIRE_FRESH_ARTICLES && !ALLOW_FALLBACK_BUILD && !USE_D1_ARTICLES;

function markFallbackBuildDisallowed() {
  console.error('❌ Fresh article content is required, but JSONBin was unavailable.');
  console.error('ℹ️ Keep REQUIRE_FRESH_ARTICLES=true for JSONBin-backed production. D1-backed production can build from static fallback because runtime reads D1.');
  process.exitCode = 1;
}

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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readArticlesFromFile(pathname) {
  if (!existsSync(pathname)) return null;

  try {
    const raw = JSON.parse(readFileSync(pathname, 'utf8'));
    return Array.isArray(raw?.articles) ? raw.articles : null;
  } catch {
    return null;
  }
}

function pickFallbackSource() {
  const candidates = [
    { source: 'public-seed-fallback', articles: readArticlesFromFile(PUBLIC_SEED_PATH) },
    { source: 'local-fallback', articles: readArticlesFromFile(LOCAL_ARTICLES_PATH) },
    { source: 'build-cache-fallback', articles: readArticlesFromFile(BUILD_ARTICLES_PATH) },
  ].filter((candidate) => Array.isArray(candidate.articles));

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const byCount = b.articles.length - a.articles.length;
    if (byCount !== 0) return byCount;
    return ['public-seed-fallback', 'local-fallback', 'build-cache-fallback'].indexOf(a.source) -
      ['public-seed-fallback', 'local-fallback', 'build-cache-fallback'].indexOf(b.source);
  })[0];
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

async function fetchArticlesFromJsonBin() {
  const headers = buildJsonBinHeaders();
  let lastError = null;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        JSONBIN_URL,
        {
          headers,
          method: 'GET',
        },
        TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (Array.isArray(payload?.record)) return payload.record;
      if (Array.isArray(payload?.record?.articles)) return payload.record.articles;
      return [];
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ JSONBin fetch attempt ${attempt}/${RETRIES} failed.`);
      if (attempt < RETRIES) await sleep(300 * attempt);
    }
  }

  throw lastError;
}

async function main() {
  try {
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
    const articles = Array.isArray(payload?.articles) ? payload.articles : [];
    if (articles.length > 0) {
      writeBuildArticles(articles, 'public-api');
      console.log(`✅ Articles fetched from public API: ${articles.length}`);
      return;
    }

    console.warn('⚠️ Public articles API returned an empty dataset. Falling back to JSONBin.');
  } catch (error) {
    console.warn('⚠️ Public articles API unavailable. Falling back to JSONBin.');
    console.warn(error);
  }

  try {
    const articles = await fetchArticlesFromJsonBin();
    const fallback = pickFallbackSource();
    if (!HAS_EXPLICIT_JSONBIN_SOURCE && fallback && fallback.articles.length > articles.length) {
      writeBuildArticles(fallback.articles, fallback.source);
      console.warn(`⚠️ Default JSONBin returned ${articles.length} articles. Using richer ${fallback.source}: ${fallback.articles.length} articles.`);
      return;
    }

    writeBuildArticles(articles, 'jsonbin');
    console.log(`✅ Articles fetched from JSONBin: ${articles.length}`);
    return;
  } catch (error) {
    const fallback = pickFallbackSource();
    if (fallback) {
      writeBuildArticles(fallback.articles, fallback.source);
      console.warn(`⚠️ JSONBin unavailable. Using ${fallback.source}: ${fallback.articles.length} articles.`);
      console.warn(error);
      if (FAIL_ON_FALLBACK) {
        markFallbackBuildDisallowed();
      }
      return;
    }

    if (REQUIRE_FRESH_ARTICLES) {
      console.error('❌ JSONBin unavailable and no fallback source found.');
      console.error(error);
      process.exitCode = 1;
      return;
    }

    writeBuildArticles([], 'empty-fallback');
    console.warn('⚠️ JSONBin unavailable and no fallback source found. Generated empty article list.');
    console.warn(error);
  }
}

main();
