#!/usr/bin/env node
/**
 * Скрипт мгновенной отправки URL сайта в IndexNow (Bing, Yandex, Seznam, Naver).
 * 
 *   node scripts/ping-indexnow.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || 'cf36e6767e3b180da717b912b2b9ea84';
const HOST = 'www.whalewzrd.com';
const SITE_URL = `https://${HOST}`;

const STATIC_ROUTES = [
  '/',
  '/meta-ads',
  '/meta-apps',
  '/google-ads',
  '/consult',
  '/calculator',
  '/roi-calculator',
  '/blog',
  '/cases',
  '/about',
  '/faq',
  '/marketing-glossary',
];

// Читаем статьи из сида
let articleUrls = [];
try {
  const seedPath = resolve('public/articles.seed.json');
  if (existsSync(seedPath)) {
    const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
    const articles = seed.articles || [];
    for (const a of articles) {
      if (a.status === 'draft') continue;
      const isCase = String(a.category || '').toLowerCase() === 'кейсы';
      const section = isCase ? 'cases' : 'blog';
      articleUrls.push(`/${section}/${a.slug}`);
    }
  }
} catch (err) {
  console.warn('[IndexNow] Не удалось прочитать статьи из сида:', err.message);
}

const allUrls = Array.from(new Set([...STATIC_ROUTES, ...articleUrls])).map((path) => `${SITE_URL}${path}`);

console.log(`[IndexNow] Подготовка отправки ${allUrls.length} URL для ${HOST}...`);
console.log(`[IndexNow] Ключ: ${INDEXNOW_KEY}`);
console.log(`[IndexNow] Расположение ключа: ${SITE_URL}/${INDEXNOW_KEY}.txt`);

const payload = {
  host: HOST,
  key: INDEXNOW_KEY,
  keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
  urlList: allUrls,
};

async function pingEndpoint(endpointUrl, name) {
  console.log(`\nОтправка в ${name} (${endpointUrl})...`);
  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    const status = res.status;
    let message = '';
    if (status === 200) message = '200 OK — Все URL успешно приняты и отправлены в очередь индексации';
    else if (status === 202) message = '202 Accepted — URL приняты, ключ в процессе валидации';
    else if (status === 400) message = '400 Bad Request — Неверный формат запроса';
    else if (status === 403) message = '403 Forbidden — Ключ не найден или не совпадает с файлом keyLocation';
    else if (status === 422) message = '422 Unprocessable — URL не принадлежат указанному хосту';
    else message = `HTTP ${status}`;

    console.log(`Ответ ${name}: ${message}`);
    if (!res.ok && status !== 202) {
      const text = await res.text().catch(() => '');
      if (text) console.log(`Детали: ${text}`);
    }
  } catch (err) {
    console.error(`Ошибка при отправке в ${name}:`, err.message);
  }
}

async function run() {
  await pingEndpoint('https://api.indexnow.org/indexnow', 'IndexNow API Hub');
  await pingEndpoint('https://www.bing.com/indexnow', 'Bing IndexNow Direct');
}

run();
