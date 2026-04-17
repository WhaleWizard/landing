import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'data');
const BUILD_OUTPUT_PATH = join(DATA_DIR, 'articles.build.json');
const LOCAL_FALLBACK_PATH = join(DATA_DIR, 'articles.local.json');

const JSONBIN_URL = process.env.JSONBIN_URL || 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';
const STRICT_FETCH = process.env.STRICT_ARTICLES_FETCH === 'true';
const RETRIES = Number(process.env.ARTICLES_FETCH_RETRIES || 3);
const TIMEOUT_MS = Number(process.env.ARTICLES_FETCH_TIMEOUT_MS || 10000);

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };

  if (process.env.JSONBIN_MASTER_KEY) {
    headers['X-Master-Key'] = process.env.JSONBIN_MASTER_KEY;
  }

  if (process.env.JSONBIN_ACCESS_KEY) {
    headers['X-Access-Key'] = process.env.JSONBIN_ACCESS_KEY;
  }

  return headers;
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
    BUILD_OUTPUT_PATH,
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
  const headers = buildHeaders();
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
      return Array.isArray(payload?.record) ? payload.record : [];
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
    const previousBuildArticles = readArticlesFromFile(BUILD_OUTPUT_PATH);
    if (previousBuildArticles) {
      writeBuildArticles(previousBuildArticles, 'build-cache-fallback');
      console.warn('⚠️ JSONBin unavailable. Using previous build cache.');
      console.warn(error);
      return;
    }

    const localFallbackArticles = readArticlesFromFile(LOCAL_FALLBACK_PATH);
    if (localFallbackArticles) {
      writeBuildArticles(localFallbackArticles, 'local-fallback');
      console.warn('⚠️ JSONBin unavailable. Using local fallback data/articles.local.json');
      console.warn(error);
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
