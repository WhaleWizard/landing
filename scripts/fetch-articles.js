import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  DATA_DIR,
  BUILD_ARTICLES_PATH,
  LOCAL_ARTICLES_PATH,
  JSONBIN_URL,
  STRICT_FETCH,
  RETRIES,
  TIMEOUT_MS,
  buildJsonBinHeaders,
} from './config.js';

// Fallback chain: JSONBin -> previous build cache -> committed local fallback
// Strict CI behavior is now opt-in to avoid hard-failing Cloudflare Pages builds
// when JSONBin is temporarily unavailable.
const CI_STRICT_FALLBACK = process.env.CI_STRICT_FALLBACK === 'true' && process.env.ALLOW_FALLBACK_BUILD !== 'true';

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
    const articles = await fetchArticlesFromJsonBin();
    writeBuildArticles(articles, 'jsonbin');
    console.log(`✅ Articles fetched from JSONBin: ${articles.length}`);
    return;
  } catch (error) {
    const previousBuildArticles = readArticlesFromFile(BUILD_ARTICLES_PATH);
    if (previousBuildArticles) {
      writeBuildArticles(previousBuildArticles, 'build-cache-fallback');
      console.warn('⚠️ JSONBin unavailable. Using previous build cache.');
      console.warn(error);
      if (CI_STRICT_FALLBACK) {
        console.error('❌ CI strict mode: fallback content is not allowed. Set ALLOW_FALLBACK_BUILD=true to override.');
        process.exitCode = 1;
      }
      return;
    }

    const localFallbackArticles = readArticlesFromFile(LOCAL_ARTICLES_PATH);
    if (localFallbackArticles) {
      writeBuildArticles(localFallbackArticles, 'local-fallback');
      console.warn('⚠️ JSONBin unavailable. Using local fallback data/articles.local.json');
      console.warn(error);
      if (CI_STRICT_FALLBACK) {
        console.error('❌ CI strict mode: fallback content is not allowed. Set ALLOW_FALLBACK_BUILD=true to override.');
        process.exitCode = 1;
      }
      return;
    }

    if (STRICT_FETCH) {
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
