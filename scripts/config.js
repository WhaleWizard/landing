import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT_DIR = join(__dirname, '..');
export const DATA_DIR = join(ROOT_DIR, 'data');
export const DIST_DIR = join(ROOT_DIR, 'dist');

export const BUILD_ARTICLES_PATH = join(DATA_DIR, 'articles.build.json');
export const LOCAL_ARTICLES_PATH = join(DATA_DIR, 'articles.local.json');

export const SITE_URL = (process.env.SITE_URL || 'https://www.whalewzrd.com').replace(/\/$/, '');
export const JSONBIN_URL = process.env.JSONBIN_URL || 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';

export const STRICT_FETCH = process.env.STRICT_ARTICLES_FETCH === 'true';
export const RETRIES = Number(process.env.ARTICLES_FETCH_RETRIES || 3);
export const TIMEOUT_MS = Number(process.env.ARTICLES_FETCH_TIMEOUT_MS || 10000);

export const STATIC_ROUTES = ['/', '/blog', '/calculator', '/privacy-policy'];

export function buildJsonBinHeaders() {
  const headers = { 'Content-Type': 'application/json' };

  if (process.env.JSONBIN_MASTER_KEY) {
    headers['X-Master-Key'] = process.env.JSONBIN_MASTER_KEY;
  }

  if (process.env.JSONBIN_ACCESS_KEY) {
    headers['X-Access-Key'] = process.env.JSONBIN_ACCESS_KEY;
  }

  return headers;
}
