import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'data');
const OUTPUT_PATH = join(DATA_DIR, 'articles.json');
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

function getCachedArticles() {
  if (!existsSync(OUTPUT_PATH)) return null;

  try {
    const raw = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
    return Array.isArray(raw.articles) ? raw.articles : null;
  } catch {
    return null;
  }
}

function saveArticles(articles, source) {
  ensureDataDir();
  writeFileSync(
    OUTPUT_PATH,
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
      const articles = Array.isArray(payload?.record) ? payload.record : [];
      return articles;
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
    saveArticles(articles, 'jsonbin');
    console.log(`✅ Articles fetched: ${articles.length}`);
    return;
  } catch (error) {
    const cached = getCachedArticles();

    if (cached) {
      saveArticles(cached, 'cache-fallback');
      console.warn('⚠️ JSONBin unavailable, using cached data/articles.json');
      console.warn(error);
      return;
    }

    if (STRICT_FETCH) {
      console.error('❌ JSONBin unavailable and no cached articles.');
      console.error(error);
      process.exitCode = 1;
      return;
    }

    saveArticles([], 'empty-fallback');
    console.warn('⚠️ JSONBin unavailable and no cache. Generated empty article list.');
    console.warn(error);
  }
}

main();
