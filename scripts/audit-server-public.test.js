import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';

/**
 * Находки построчного аудита в публичной части сервера: заявки и Telegram,
 * Meta CAPI, аудит подписи, страницы статей, RSS, карта сайта и /api/articles.
 *
 * Всё проверяется поведением — настоящий обработчик, настоящий SQLite с
 * настоящими миграциями, — а не поиском строк в исходниках.
 */

globalThis.crypto ??= webcrypto;

const ALL_MIGRATIONS = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort();
const SITE = 'https://www.whalewzrd.com';
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ADMIN_PASSWORD = 'server-public-test-secret-with-enough-entropy';

/** Каждый вызов — свежий модуль: состояние в памяти воркера не переезжает между тестами. */
async function loadModule(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

// ---------------------------------------------------------------------------
// Cache API воркера: общий на все ключи, как `caches.default` в дата-центре.
// ---------------------------------------------------------------------------
const cacheStore = new Map();
globalThis.caches = {
  default: {
    match: async (request) => {
      const hit = cacheStore.get(typeof request === 'string' ? request : request.url);
      return hit ? hit.clone() : undefined;
    },
    put: async (request, response) => {
      cacheStore.set(typeof request === 'string' ? request : request.url, response.clone());
    },
    delete: async (request) => cacheStore.delete(typeof request === 'string' ? request : request.url),
  },
};

// ---------------------------------------------------------------------------
// HTMLRewriter воркера поверх linkedom: ровно те методы, что использует код.
// ---------------------------------------------------------------------------
class TestHTMLRewriter {
  constructor() { this.handlers = []; }

  on(selector, handlers) {
    this.handlers.push({ selector, handlers });
    return this;
  }

  transform(response) {
    const registered = this.handlers;
    const body = new ReadableStream({
      async start(controller) {
        try {
          const { document } = parseHTML(await response.text());
          for (const { selector, handlers } of registered) {
            for (const node of document.querySelectorAll(selector)) {
              const element = {
                setAttribute(name, value) { node.setAttribute(name, value); return element; },
                getAttribute(name) { return node.getAttribute(name); },
                setInnerContent(content, options) {
                  if (options?.html) node.innerHTML = content; else node.textContent = content;
                  return element;
                },
                append(content, options) {
                  if (options?.html) node.insertAdjacentHTML('beforeend', content);
                  else node.append(document.createTextNode(content));
                  return element;
                },
                remove() { node.remove(); return element; },
              };
              await handlers.element?.(element);
            }
          }
          controller.enqueue(new TextEncoder().encode(`<!doctype html>${document.documentElement.outerHTML}`));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(body, { status: response.status, headers: response.headers });
  }
}
globalThis.HTMLRewriter = TestHTMLRewriter;

// ---------------------------------------------------------------------------
// D1 поверх настоящего SQLite — для заявок и аудита подписи.
// ---------------------------------------------------------------------------
class D1Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new D1Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { success: true, results: this.db.prepare(this.sql).all(...this.values) }; }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
  }
}

class D1Database {
  constructor(db) { this.db = db; }
  prepare(sql) { return new D1Statement(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function freshDatabase(migrations = ALL_MIGRATIONS) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of migrations) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return { sqlite, d1: new D1Database(sqlite) };
}

// ---------------------------------------------------------------------------
// D1 статей — в памяти, как в scripts/articles-runtime.test.js. Остальные
// таблицы (замки страниц) отвечают пустым результатом.
// ---------------------------------------------------------------------------
class FakeArticlesD1 {
  constructor(rows = []) { this.rows = rows; this.reads = 0; }

  prepare(sql) {
    if (/PRAGMA table_info\(articles\)/i.test(sql)) {
      return { all: async () => ({ results: Object.keys(this.rows[0] || d1Row('schema')).map((name) => ({ name })) }) };
    }
    const isArticles = /FROM articles/i.test(sql);
    const query = { bindings: [] };
    const statement = {
      bind: (...bindings) => { query.bindings = bindings; return statement; },
      first: async () => null,
      run: async () => ({ success: true, meta: { changes: 0 } }),
      all: async () => {
        if (!isArticles) return { results: [] };
        this.reads += 1;
        if (!/\bWHERE\b/i.test(sql)) {
          const summary = /''\s+AS\s+content/i.test(sql);
          return { results: summary ? this.rows.map((row) => ({ ...row, content: '' })) : this.rows };
        }
        const [slug, prefixStart] = query.bindings;
        const exactOnly = query.bindings.length === 1;
        return {
          results: this.rows.filter((row) => row.slug === slug || (!exactOnly && row.slug.startsWith(String(prefixStart || '')))),
        };
      },
    };
    return statement;
  }
}

class FakeBucket {
  constructor() { this.objects = new Map(); }
  async put(key, value) { this.objects.set(key, String(value)); }
  async get(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = new TextEncoder().encode(stored);
    return { key, size: bytes.byteLength, uploaded: new Date(), arrayBuffer: async () => bytes.buffer };
  }
}

function d1Row(slug, overrides = {}) {
  return {
    id: 1,
    slug,
    title: `Title ${slug}`,
    category: 'Blog',
    read_time: '5 min',
    date: '2026-08-09',
    description: `Description ${slug}`,
    content: `<p>${slug}</p>`,
    image: '/og-image-v2.jpg',
    seo_title: null,
    seo_description: null,
    published_at: '2026-08-09T10:00:00.000Z',
    updated_at: '2026-08-09T10:00:00.000Z',
    tags_json: '[]',
    summary: '',
    key_takeaways_json: '[]',
    faq_json: '[]',
    status: 'published',
    case_data_json: null,
    ...overrides,
  };
}

function articlesEnv(db, bucket = new FakeBucket()) {
  return {
    DB: db,
    BUCKET: bucket,
    ADMIN_PASSWORD,
    SITE_URL: SITE,
    USE_D1_ARTICLES: 'true',
    ALLOW_EMERGENCY_ARTICLE_SEED: 'false',
  };
}

function makeWaitUntil() {
  const pending = [];
  return {
    waitUntil: (promise) => pending.push(promise),
    flush: async () => { await Promise.all(pending.splice(0)); },
    pending,
  };
}

function sectionShellHtml() {
  return `<!doctype html><html lang="ru"><head>
    <title>Блог — статьи о рекламе | Whale Wizard</title>
    <meta name="description" content="Section description">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${SITE}/blog/">
    <link rel="alternate" hreflang="ru" href="${SITE}/blog/">
    <link rel="modulepreload" href="/assets/BlogPage-test.js">
    <script id="ld-organization" type="application/ld+json">{"@type":"ProfessionalService"}</script>
    <script id="ld-breadcrumbs" type="application/ld+json">{"@type":"BreadcrumbList"}</script>
  </head><body><div id="root"><ul data-marker="section-list"><li>list</li></ul></div></body></html>`;
}

function homeShellHtml() {
  return `<!doctype html><html lang="ru"><head>
    <title>Whale Wizard — таргетолог и реклама в Google | главная</title>
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${SITE}/">
    <link rel="preload" as="image" href="/images/cosmic/sky-1600.webp" fetchpriority="high">
    <link rel="modulepreload" href="/assets/Home-test.js">
  </head><body><div id="root" data-marker="home-shell"><section>hero</section></div></body></html>`;
}

function htmlAsset(html, status = 200) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function runArticleHandler(createArticlePageHandler, { section = '/blog', slug, url, db, next, userAgent = BROWSER_UA }) {
  const handler = createArticlePageHandler(section);
  return handler({
    request: new Request(url, { headers: { 'user-agent': userAgent } }),
    params: { slug },
    env: articlesEnv(db),
    next: next || (async () => { throw new Error('asset must not be requested'); }),
    waitUntil: () => {},
    data: {},
  });
}

function receipt() {
  return { consent_version: 1, consent_source: 'user', consent_region: 'UZ', consent_timestamp: Date.now() };
}

// ===========================================================================
// F-086 — город, регион и часовой пояс для Meta CAPI берутся из request.cf
// ===========================================================================

test('F-086: extractRequestContext falls back to request.cf when Cloudflare sends no location headers', async () => {
  const { extractRequestContext } = await loadModule('functions/_lib/meta-request.ts');

  const bare = new Request(`${SITE}/api/lead`, { headers: { 'CF-IPCountry': 'UZ' } });
  bare.cf = { city: 'Tashkent', region: 'Tashkent City', regionCode: 'TK', timezone: 'Asia/Tashkent', postalCode: '100000' };
  const fromCf = extractRequestContext(bare);
  assert.equal(fromCf.country, 'UZ');
  assert.equal(fromCf.city, 'Tashkent');
  assert.equal(fromCf.region, 'Tashkent City');
  assert.equal(fromCf.regionCode, 'TK');
  assert.equal(fromCf.timezone, 'Asia/Tashkent');
  assert.equal('postalCode' in fromCf, false, 'zp — новый сигнал, он здесь не добавляется');

  // Заголовок зоны остаётся главнее request.cf (на localhost его ставит прокси).
  const withHeaders = new Request(`${SITE}/api/lead`, {
    headers: { 'CF-IPCountry': 'DE', 'CF-IPCity': 'Berlin', 'CF-Region': 'Berlin', 'CF-Region-Code': 'BE', 'CF-Timezone': 'Europe/Berlin' },
  });
  withHeaders.cf = { city: 'Hamburg', region: 'Hamburg', regionCode: 'HH', timezone: 'Europe/Amsterdam' };
  const fromHeaders = extractRequestContext(withHeaders);
  assert.deepEqual(
    { city: fromHeaders.city, region: fromHeaders.region, regionCode: fromHeaders.regionCode, timezone: fromHeaders.timezone },
    { city: 'Berlin', region: 'Berlin', regionCode: 'BE', timezone: 'Europe/Berlin' },
  );

  // Пустые и нестроковые значения cf не превращаются в «город».
  const empty = new Request(`${SITE}/api/lead`);
  empty.cf = { city: '  ', region: 42, regionCode: null, timezone: undefined };
  const fromEmpty = extractRequestContext(empty);
  assert.equal(fromEmpty.city, undefined);
  assert.equal(fromEmpty.region, undefined);
  assert.equal(fromEmpty.regionCode, undefined);
  assert.equal(fromEmpty.timezone, undefined);

  // Без cf вовсе (локальный Vite) — как раньше.
  const none = extractRequestContext(new Request(`${SITE}/api/lead`));
  assert.equal(none.city, undefined);
  assert.equal(none.timezone, undefined);
});

// ===========================================================================
// F-087 — уведомление о заявке с длинным сообщением приходит в Telegram
// ===========================================================================

function unescapeTelegram(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

test('F-087: a 4000-character brief with every other field at its limit still fits the Telegram message limit', async () => {
  const { buildLeadTelegramText, TELEGRAM_MESSAGE_LIMIT } = await loadModule('functions/_lib/leads.ts');
  assert.equal(TELEGRAM_MESSAGE_LIMIT, 4096);

  const longMessage = `${'Бриф & детали <проекта> '.repeat(170)}😀`.slice(0, 3999).concat('😀');
  assert.ok(longMessage.length >= 4000);
  const lead = {
    name: 'И'.repeat(100),
    email: `${'e'.repeat(108)}@example.com`,
    phone: '+'.concat('9'.repeat(59)),
    budget: 'б'.repeat(40),
    message: longMessage,
    contactMethod: 'telegram',
    telegramUsername: '@'.concat('u'.repeat(119)),
    service: 'с'.repeat(80),
    page_path: '/'.concat('p'.repeat(511)),
    utm_source: 's'.repeat(200),
    utm_medium: 'm'.repeat(200),
    utm_campaign: 'c'.repeat(200),
    utm_content: 'k'.repeat(500),
  };

  const text = buildLeadTelegramText(lead, { repeat: true, submissionsCount: 3 });
  const parsed = unescapeTelegram(text);
  assert.ok(parsed.length <= TELEGRAM_MESSAGE_LIMIT, `after entity parsing: ${parsed.length} > ${TELEGRAM_MESSAGE_LIMIT}`);
  assert.match(parsed, /обрезано, полный текст — в карточке заявки в админке/);
  assert.match(parsed, /^Сообщение: Бриф & детали <проекта> /m, 'the beginning of the brief is kept');
  assert.doesNotMatch(parsed, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/, 'no half of a surrogate pair (broken emoji)');
  assert.doesNotMatch(parsed, /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/, 'no orphan low surrogate');
  // Разрез не попал внутрь HTML-сущности: в отправляемом тексте нет «&am», «&l» без завершения.
  assert.doesNotMatch(text, /&(?!amp;|lt;|gt;)/, 'every & in the sent text is an escaped entity');
  // Остальные поля на месте — обрезается только сообщение.
  assert.match(parsed, new RegExp(`^Имя: ${'И'.repeat(100)}$`, 'm'));
  assert.match(parsed, new RegExp(`^Объявление: ${'k'.repeat(500)}$`, 'm'));
  assert.match(parsed, /^Telegram username: @u+$/m);
});

test('F-087: a short message is sent exactly as before, without any cut note', async () => {
  const { buildLeadTelegramText } = await loadModule('functions/_lib/leads.ts');
  const text = buildLeadTelegramText({
    name: 'Анна', email: 'anna@example.com', phone: '+998901234567', budget: '$500',
    message: 'Нужна реклама & аналитика <срочно>', contactMethod: 'whatsapp', service: 'Meta Ads',
    page_path: '/meta-ads', utm_source: 'meta', utm_medium: 'cpc', utm_campaign: 'spring', utm_content: 'ad-1',
  });
  assert.equal(text, [
    '🚀 Новая заявка',
    'Имя: Анна',
    'Email: anna@example.com',
    'Телефон: +998901234567',
    'Бюджет: $500',
    'Сообщение: Нужна реклама &amp; аналитика &lt;срочно&gt;',
    'Способ связи: WhatsApp',
    'Услуга: Meta Ads',
    'Страница: /meta-ads',
    '📍 Источник: meta / cpc / spring',
    'Объявление: ad-1',
  ].join('\n'));
});

// ===========================================================================
// F-088 — повторная заявка без UTM не стирает рекламный источник первой
// ===========================================================================

test('F-088: a repeat lead without UTM keeps the first ad source; a new source replaces the whole UTM set; no consent clears it', async () => {
  const { storeLead } = await loadModule('functions/_lib/leads.ts');
  const { sqlite, d1 } = freshDatabase();
  const base = { name: 'Repeat Lead', email: 'repeat@example.com', phone: '+998 90 111 22 33', contactMethod: 'telegram' };

  const first = await storeLead({ DB: d1 }, {
    ...base, event_id: 'utm-1', marketing_consent: true, message: 'first',
    utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'spring', utm_content: 'ad-1', utm_term: 'kw', ...receipt(),
  });
  assert.equal(first.repeat, false);

  // Через месяц человек заходит напрямую: ни одного UTM в заявке.
  const direct = await storeLead({ DB: d1 }, {
    ...base, event_id: 'utm-2', marketing_consent: true, message: 'second', ...receipt(),
  });
  assert.equal(direct.repeat, true);
  let row = sqlite.prepare('SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term FROM leads').get();
  assert.deepEqual({ ...row }, { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'spring', utm_content: 'ad-1', utm_term: 'kw' });

  // Новый визит с рекламы Google без кампании: набор заменяется целиком,
  // старая кампания Meta не склеивается с новым источником.
  await storeLead({ DB: d1 }, {
    ...base, event_id: 'utm-3', marketing_consent: true, message: 'third', utm_source: 'google', ...receipt(),
  });
  row = sqlite.prepare('SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term FROM leads').get();
  assert.deepEqual({ ...row }, { utm_source: 'google', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' });

  // Без согласия на маркетинг атрибуция по-прежнему стирается.
  await storeLead({ DB: d1 }, {
    ...base, event_id: 'utm-4', marketing_consent: false, message: 'fourth', utm_source: 'must-not-stay', ...receipt(),
  });
  row = sqlite.prepare('SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term FROM leads').get();
  assert.deepEqual({ ...row }, { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1, 'still a single lead row');
});

// ===========================================================================
// F-131 — «повторная заявка ДАТА» по времени владельца, а не по Гринвичу
// ===========================================================================

test('F-131: the repeat-lead date label uses the owner timezone (Tashkent), not UTC', async () => {
  const { storeLead, OWNER_TIME_ZONE } = await loadModule('functions/_lib/leads.ts');
  assert.equal(OWNER_TIME_ZONE, 'Asia/Tashkent');
  const { sqlite, d1 } = freshDatabase();

  const RealDate = globalThis.Date;
  // 24.09.2026 21:30 UTC — это уже 25.09.2026 02:30 по Ташкенту.
  const fixed = RealDate.UTC(2026, 8, 24, 21, 30, 0);
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  }
  globalThis.Date = FixedDate;
  try {
    const base = { name: 'Night Lead', email: 'night@example.com', contactMethod: 'telegram', marketing_consent: true };
    await storeLead({ DB: d1 }, { ...base, event_id: 'night-1', message: 'first', ...receipt() });
    await storeLead({ DB: d1 }, { ...base, event_id: 'night-2', message: 'again', ...receipt() });
  } finally {
    globalThis.Date = RealDate;
  }

  const { message } = sqlite.prepare('SELECT message FROM leads').get();
  assert.match(message, /— повторная заявка 25\.09\.2026: again/);
  assert.doesNotMatch(message, /24\.09\.2026/);
});

// ===========================================================================
// F-104 — аудит подписи не пишет строку на каждый неподписанный запрос
// ===========================================================================

test('F-104: unsigned tracking requests and mode off write nothing; only signed attempts reach D1', async () => {
  const { recordTrackingSignatureAudit } = await loadModule('functions/_lib/tracking-signature.ts');
  const { sqlite, d1 } = freshDatabase(['0018_tracking_request_nonces.sql']);
  const env = { DB: d1 };
  const count = () => sqlite.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM tracking_signature_daily').get().n;

  // Так выглядит каждый запрос с настоящего сайта: браузер подпись не ставит.
  for (const endpoint of ['lead', 'meta-event', 'pageview']) {
    await recordTrackingSignatureAudit(env, { endpoint, mode: 'monitor', verification: { ok: false, reason: 'missing_headers' } });
    await recordTrackingSignatureAudit(env, { endpoint, mode: 'enforce', verification: { ok: false, reason: 'missing_headers' } });
    await recordTrackingSignatureAudit(env, { endpoint, mode: 'monitor', verification: { ok: false, reason: 'signature_not_configured' } });
    await recordTrackingSignatureAudit(env, { endpoint, mode: 'off' });
    await recordTrackingSignatureAudit(env, { endpoint, mode: 'monitor' });
  }
  assert.equal(count(), 0, 'no D1 write for requests that carried no signature');

  await recordTrackingSignatureAudit(env, { endpoint: 'lead', mode: 'monitor', verification: { ok: true, replayProtection: 'd1' } });
  await recordTrackingSignatureAudit(env, { endpoint: 'pageview', mode: 'enforce', verification: { ok: false, reason: 'invalid_signature' } });
  await recordTrackingSignatureAudit(env, { endpoint: 'pageview', mode: 'enforce', verification: { ok: false, reason: 'replayed_nonce' } });
  await recordTrackingSignatureAudit(env, { endpoint: 'pageview', mode: 'enforce', verification: { ok: false, reason: 'replayed_nonce' } });
  const rows = sqlite.prepare('SELECT endpoint, mode, result, reason, count FROM tracking_signature_daily ORDER BY endpoint, reason').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { endpoint: 'lead', mode: 'monitor', result: 'valid', reason: 'replay_protection_d1', count: 1 },
    { endpoint: 'pageview', mode: 'enforce', result: 'invalid', reason: 'invalid_signature', count: 1 },
    { endpoint: 'pageview', mode: 'enforce', result: 'invalid', reason: 'replayed_nonce', count: 2 },
  ]);
});

test('F-104: forged-signature floods are capped by a daily write budget and the day is marked incomplete', async () => {
  const { recordTrackingSignatureAudit, AUDIT_BUDGET_EXHAUSTED_REASON, AUDIT_BUDGET_MARKER_ENDPOINT } = await loadModule('functions/_lib/tracking-signature.ts');
  const { sqlite, d1 } = freshDatabase(['0018_tracking_request_nonces.sql']);
  const env = { DB: d1 };
  const day = new Date().toISOString().slice(0, 10);
  const budgetKey = `https://internal-tracking-signature.local/budget/${day}`;
  cacheStore.clear();

  const forged = { endpoint: 'meta-event', mode: 'monitor', verification: { ok: false, reason: 'invalid_signature' } };
  await recordTrackingSignatureAudit(env, forged);
  assert.equal(await (await caches.default.match(budgetKey)).text(), '1', 'each write spends the budget');

  // Бюджет на сегодня потрачен (200 записей).
  await caches.default.put(budgetKey, new Response('200'));
  await recordTrackingSignatureAudit(env, forged);
  await recordTrackingSignatureAudit(env, forged);
  await recordTrackingSignatureAudit(env, forged);

  const rows = sqlite.prepare('SELECT endpoint, result, reason, count FROM tracking_signature_daily ORDER BY reason').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { endpoint: AUDIT_BUDGET_MARKER_ENDPOINT, result: 'disabled', reason: AUDIT_BUDGET_EXHAUSTED_REASON, count: 1 },
    { endpoint: 'meta-event', result: 'invalid', reason: 'invalid_signature', count: 1 },
  ], 'one marker row, no further counting once the budget is gone');
  assert.ok(!['lead', 'meta-event', 'pageview'].includes(AUDIT_BUDGET_MARKER_ENDPOINT), 'the shared budget is not attributed to one endpoint');

  // Так эту таблицу читает раздел «Проверка» (getTrackingSignatureAudit в
  // functions/api/admin/health.ts): суммы по result и по endpoint. Отметка
  // обязана попасть только в `disabled` — ни в счётчик точки, ни в valid/invalid.
  const aggregate = sqlite.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN result = 'valid' THEN count ELSE 0 END), 0) AS valid,
       COALESCE(SUM(CASE WHEN result = 'invalid' THEN count ELSE 0 END), 0) AS invalid,
       COALESCE(SUM(CASE WHEN result = 'disabled' THEN count ELSE 0 END), 0) AS disabled,
       COALESCE(SUM(CASE WHEN endpoint = 'lead' THEN count ELSE 0 END), 0) AS lead,
       COALESCE(SUM(CASE WHEN endpoint = 'meta-event' THEN count ELSE 0 END), 0) AS meta_event,
       COALESCE(SUM(CASE WHEN endpoint = 'pageview' THEN count ELSE 0 END), 0) AS pageview
     FROM tracking_signature_daily
     WHERE mode = ?
       AND updated_at >= strftime('%s','now','-1 day')`,
  ).get('monitor');
  assert.deepEqual({ ...aggregate }, { valid: 0, invalid: 1, disabled: 1, lead: 0, meta_event: 1, pageview: 0 },
    'the marker counts once as disabled and does not inflate the endpoint that happened to exhaust the budget');
  cacheStore.clear();
});

// ===========================================================================
// F-105 — статья, перенесённая между блогом и кейсами, отвечает 301
// ===========================================================================

test('F-105: an article moved to the other section redirects 301 to its new address and keeps the query', async () => {
  const { createArticlePageHandler } = await loadModule('functions/_lib/article-page.ts');

  const db = new FakeArticlesD1([d1Row('became-a-case', { category: 'Кейсы' })]);
  const asBlog = await runArticleHandler(createArticlePageHandler, {
    section: '/blog', slug: 'became-a-case', url: `${SITE}/blog/became-a-case?utm_source=tg&fbclid=abc`, db,
  });
  assert.equal(asBlog.status, 301);
  assert.equal(asBlog.headers.get('location'), `${SITE}/cases/became-a-case?utm_source=tg&fbclid=abc`);

  const asBot = await runArticleHandler(createArticlePageHandler, {
    section: '/blog', slug: 'became-a-case', url: `${SITE}/blog/became-a-case`, db, userAgent: GOOGLEBOT_UA,
  });
  assert.equal(asBot.status, 301, 'bots get the same permanent redirect');
  assert.equal(asBot.headers.get('location'), `${SITE}/cases/became-a-case`);

  const backToBlog = await runArticleHandler(createArticlePageHandler, {
    section: '/cases', slug: 'back-to-blog', url: `${SITE}/cases/back-to-blog`,
    db: new FakeArticlesD1([d1Row('back-to-blog', { category: 'Google Ads' })]),
  });
  assert.equal(backToBlog.status, 301);
  assert.equal(backToBlog.headers.get('location'), `${SITE}/blog/back-to-blog`);

  // Черновик в другом разделе через редирект не просачивается.
  const draft = await runArticleHandler(createArticlePageHandler, {
    section: '/blog', slug: 'hidden-case', url: `${SITE}/blog/hidden-case`, userAgent: GOOGLEBOT_UA,
    db: new FakeArticlesD1([d1Row('hidden-case', { category: 'Кейсы', status: 'draft' })]),
  });
  assert.equal(draft.status, 404);
});

// ===========================================================================
// F-113 / F-121 — несуществующая статья не отдаёт человеку оболочку главной
// ===========================================================================

test('F-113/F-121: a missing article answers 404 on the neutral section shell, never the home shell', async () => {
  const { createArticlePageHandler } = await loadModule('functions/_lib/article-page.ts');
  const requested = [];
  const response = await runArticleHandler(createArticlePageHandler, {
    slug: 'deleted-long-ago', url: `${SITE}/blog/deleted-long-ago`, db: new FakeArticlesD1([]),
    next: async (asset) => {
      const pathname = new URL(asset.url).pathname;
      requested.push(pathname);
      if (pathname === '/blog/index.html') return htmlAsset(sectionShellHtml());
      if (pathname === '/index.html') return htmlAsset(homeShellHtml());
      return htmlAsset('<html><body>missing</body></html>', 404);
    },
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(requested, ['/blog/index.html'], 'the home shell is never even requested');

  const html = await response.text();
  const { document } = parseHTML(html);
  assert.doesNotMatch(html, /главная/i, 'no home title');
  assert.doesNotMatch(html, /\/images\/cosmic\//, 'no hero image preload');
  assert.equal(document.querySelector('link[href="/assets/Home-test.js"]'), null);
  assert.equal(document.querySelector('[data-marker="home-shell"]'), null);
  assert.equal(document.querySelector('[data-marker="section-list"]'), null, 'neutral shell: empty root');
  assert.equal(document.querySelector('#root')?.textContent, '');
  assert.equal(document.querySelector('link[rel="canonical"]'), null, 'markup must not contradict X-Robots-Tag');
  assert.equal(document.querySelector('link[rel="alternate"][hreflang]'), null);
  assert.equal(document.querySelector('meta[name="robots"]')?.getAttribute('content'), 'noindex, follow');
  assert.equal(document.querySelector('#ld-breadcrumbs'), null);
  assert.ok(document.querySelector('link[href="/assets/BlogPage-test.js"]'), 'section shell keeps the BlogPage preload');
  assert.ok(document.querySelector('#ld-organization'));
});

test('F-113/F-121: without a usable section shell the person gets the plain not-found page, not the home shell', async () => {
  const { createArticlePageHandler } = await loadModule('functions/_lib/article-page.ts');
  const requested = [];
  const response = await runArticleHandler(createArticlePageHandler, {
    slug: 'gone', url: `${SITE}/cases/gone`, section: '/cases', db: new FakeArticlesD1([]),
    next: async (asset) => {
      requested.push(new URL(asset.url).pathname);
      return new Response('Missing', { status: 404, headers: { 'content-type': 'text/plain' } });
    },
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.deepEqual(requested, ['/cases/index.html']);
  const html = await response.text();
  assert.match(html, /Статья не найдена/);
  assert.match(html, /href="\/cases\/"/);
});

// ===========================================================================
// F-106 — HEAD отвечает тем же, что GET
// ===========================================================================

test('F-106: HEAD on an article, a moved article, the feed and /api/articles mirrors GET status and headers with an empty body', async () => {
  const blog = await loadModule('functions/blog/[slug].ts');
  const cases = await loadModule('functions/cases/[slug].ts');
  const feed = await loadModule('functions/feed.xml.ts');
  const sitemap = await loadModule('functions/sitemap.xml.ts');
  const api = await loadModule('functions/api/articles.ts');
  cacheStore.clear();
  for (const module of [blog, cases, feed, sitemap, api]) {
    assert.equal(typeof module.onRequestHead, 'function', 'every public route exports onRequestHead');
  }

  const db = new FakeArticlesD1([d1Row('head-article')]);
  const context = (url, method, params = {}) => ({
    request: new Request(url, { method, headers: { 'user-agent': GOOGLEBOT_UA } }),
    params,
    env: articlesEnv(db),
    next: async () => { throw new Error('bot path must not request assets'); },
    waitUntil: () => {},
    data: {},
  });

  const articleGet = await blog.onRequestGet(context(`${SITE}/blog/head-article`, 'GET', { slug: 'head-article' }));
  cacheStore.clear();
  const articleHead = await blog.onRequestHead(context(`${SITE}/blog/head-article`, 'HEAD', { slug: 'head-article' }));
  assert.equal(articleGet.status, 200);
  assert.equal(articleHead.status, 200);
  assert.equal(articleHead.headers.get('content-type'), articleGet.headers.get('content-type'));
  assert.equal(articleHead.headers.get('cache-control'), articleGet.headers.get('cache-control'));
  assert.equal(articleHead.headers.get('vary'), 'User-Agent');
  assert.equal(await articleHead.text(), '');
  assert.ok((await articleGet.text()).length > 0);

  const movedHead = await cases.onRequestHead(context(`${SITE}/cases/head-article`, 'HEAD', { slug: 'head-article' }));
  assert.equal(movedHead.status, 301);
  assert.equal(movedHead.headers.get('location'), `${SITE}/blog/head-article`);
  assert.equal(await movedHead.text(), '');

  const slashHead = await blog.onRequestHead(context(`${SITE}/blog/head-article/`, 'HEAD', { slug: 'head-article' }));
  assert.equal(slashHead.status, 301, 'trailing slash: same permanent redirect as GET');
  assert.equal(slashHead.headers.get('location'), `${SITE}/blog/head-article`);

  for (const [module, url, type] of [
    [feed, `${SITE}/feed.xml`, 'application/xml'],
    [sitemap, `${SITE}/sitemap.xml`, 'application/xml'],
    [api, `${SITE}/api/articles?view=summary`, 'application/json'],
  ]) {
    cacheStore.clear();
    const head = await module.onRequestHead(context(url, 'HEAD'));
    assert.equal(head.status, 200, `${url} HEAD`);
    assert.match(head.headers.get('content-type') || '', new RegExp(type), url);
    assert.equal(await head.text(), '', `${url} HEAD carries no body`);
  }
  cacheStore.clear();
});

// ===========================================================================
// F-107 — ссылки на раздел в бот-версии ведут на канонический адрес со слешем
// ===========================================================================

test('F-107: section links in the bot article and the not-found page use the canonical trailing slash', async () => {
  const { renderArticleHtml, renderArticleNotFoundHtml } = await loadModule('functions/_lib/seo.ts');
  const article = { id: 1, slug: 'x', title: 'X', category: 'Google Ads', content: '<p>x</p>', publishedAt: '2026-08-09T10:00:00.000Z' };
  for (const section of ['/blog', '/cases']) {
    const html = renderArticleHtml(SITE, article, section);
    assert.doesNotMatch(html, /href="\/(?:blog|cases)"/, `${section}: no section link without the slash`);
    assert.match(html, new RegExp(`href="${section}/"`));
    const notFound = renderArticleNotFoundHtml(SITE, section);
    assert.doesNotMatch(notFound, /href="\/(?:blog|cases)"/);
    assert.match(notFound, new RegExp(`href="${section}/"`));
  }
});

// ===========================================================================
// F-108 / F-128 — RSS отбирает и сортирует по дате публикации
// ===========================================================================

function feedArticle(slug, publishedAt, updatedAt, id) {
  return { id, slug, title: `T ${slug}`, category: 'Blog', content: '<p>x</p>', description: 'd', publishedAt, updatedAt };
}

function feedLinks(xmlText) {
  return [...xmlText.matchAll(/<link>https:\/\/www\.whalewzrd\.com\/blog\/([^<]+)<\/link>/g)].map((m) => m[1]);
}

test('F-108/F-128: an edited old article does not jump to the top, and a fresh publication stays in a 100-item feed', async () => {
  const { renderFeedXml } = await loadModule('functions/_lib/seo.ts');
  const day = (offset) => new Date(Date.UTC(2026, 0, 1 + offset, 12, 0, 0)).toISOString();

  // 110 статей, все недавно правленные (массовое обновление), и одна свежая
  // по расписанию, которую с момента написания не трогали.
  const bulk = Array.from({ length: 110 }, (_, i) => feedArticle(`bulk-${i}`, day(i), day(300), i + 1));
  const fresh = feedArticle('fresh', day(250), day(200), 500);
  const oldEdited = feedArticle('old-edited', day(0), day(400), 501);
  const sameDayMorning = feedArticle('same-day-morning', day(250).replace('T12:00', 'T08:00'), day(200), 502);

  const links = feedLinks(renderFeedXml(SITE, [...bulk, oldEdited, fresh, sameDayMorning]));
  assert.equal(links.length, 100);
  assert.equal(links[0], 'fresh', 'the newest publication is first');
  assert.equal(links[1], 'same-day-morning', 'same day: later time first');
  assert.ok(!links.includes('old-edited'), 'a freshly edited old article is neither first nor in the 100 at all');
  assert.equal(links[2], 'bulk-109');
  assert.equal(links[99], 'bulk-12');
});

test('F-108/F-128: legacy articles with only a DD.MM.YYYY date still sort by publication date', async () => {
  const { renderFeedXml } = await loadModule('functions/_lib/seo.ts');
  const legacy = { id: 1, slug: 'legacy', title: 'L', category: 'Blog', content: '<p>x</p>', date: '20.04.2026', updatedAt: '2026-09-30T00:00:00.000Z' };
  const modern = feedArticle('modern', '2026-06-01T09:00:00.000Z', '2026-06-01T09:00:00.000Z', 2);
  assert.deepEqual(feedLinks(renderFeedXml(SITE, [legacy, modern])), ['modern', 'legacy']);
});

// ===========================================================================
// F-109 — каждый ИИ-агент из robots.txt распознаётся как бот
// ===========================================================================

test('F-109: Claude-User and every AI agent allowed in robots.txt receive the bot article version', async () => {
  const { isBotRequest } = await loadModule('functions/_lib/seo.ts');
  const asBot = (userAgent) => isBotRequest(new Request(`${SITE}/blog/x`, { headers: { 'user-agent': userAgent } }));

  assert.ok(asBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)'));
  assert.ok(asBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)'));

  const generator = readFileSync('scripts/generate-pages.js', 'utf8');
  const listMatch = generator.match(/const aiAgents = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'aiAgents list must stay in generate-pages.js');
  const agents = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(agents.includes('Claude-User'));
  for (const agent of agents) {
    assert.ok(asBot(`Mozilla/5.0 (compatible; ${agent}/1.0; +https://example.com/bot)`), `allowed in robots.txt but served the empty shell: ${agent}`);
  }
  assert.equal(asBot(BROWSER_UA), false);
});

// ===========================================================================
// F-110 — защита кэша /api/articles, карты сайта и ленты
// ===========================================================================

test('F-110: a public cache bypass reads D1 without rewriting the R2 snapshot; only the admin bypass persists it', async () => {
  const { onRequestGet } = await loadModule('functions/api/articles.ts');
  cacheStore.clear();
  const call = async (url, headers = {}) => {
    const db = new FakeArticlesD1([d1Row('one')]);
    const bucket = new FakeBucket();
    const background = makeWaitUntil();
    const response = await onRequestGet({
      request: new Request(url, { headers }),
      env: articlesEnv(db, bucket),
      waitUntil: background.waitUntil,
      params: {},
      data: {},
      next: async () => { throw new Error('no assets'); },
    });
    await background.flush();
    return { status: response.status, reads: db.reads, snapshots: bucket.objects.size };
  };

  const noStore = await call(`${SITE}/api/articles?cache=no-store`);
  assert.deepEqual(noStore, { status: 200, reads: 1, snapshots: 0 }, 'open bypass: live read, no snapshot write');

  const random = await call(`${SITE}/api/articles?_=${randomUUID()}`);
  assert.deepEqual(random, { status: 200, reads: 1, snapshots: 0 }, 'unauthenticated ?_= is a normal miss: no snapshot write');
  assert.ok(cacheStore.has(`${SITE}/api/articles`), 'cache key ignores the random parameter');

  cacheStore.clear();
  const admin = await call(`${SITE}/api/articles?_=1`, { 'X-Admin-Password': ADMIN_PASSWORD });
  assert.deepEqual(admin, { status: 200, reads: 1, snapshots: 1 }, 'admin bypass still refreshes the snapshot');
  cacheStore.clear();
});

test('F-110: sitemap.xml and feed.xml cache by path only, so random parameters do not re-read D1', async () => {
  const sitemap = await loadModule('functions/sitemap.xml.ts');
  const feed = await loadModule('functions/feed.xml.ts');
  for (const [module, path] of [[sitemap, '/sitemap.xml'], [feed, '/feed.xml']]) {
    cacheStore.clear();
    const db = new FakeArticlesD1([d1Row('one')]);
    const call = async (url) => {
      const background = makeWaitUntil();
      const response = await module.onRequestGet({
        request: new Request(url), env: articlesEnv(db), waitUntil: background.waitUntil, params: {}, data: {},
        next: async () => { throw new Error('no assets'); },
      });
      await background.flush();
      return response;
    };
    assert.equal((await call(`${SITE}${path}?_=${randomUUID()}`)).status, 200);
    assert.ok(cacheStore.has(`${SITE}${path}`), `${path}: cache key is the bare path`);
    assert.equal((await call(`${SITE}${path}?cache=no-store&x=${randomUUID()}`)).status, 200);
    assert.equal(db.reads, 1, `${path}: the second request with different parameters is served from cache`);
    assert.equal([...cacheStore.keys()].filter((key) => key.includes(path)).length, 1, `${path}: a single cache entry`);
  }
  cacheStore.clear();
});
