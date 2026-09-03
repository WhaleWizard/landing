import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import createDOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  DIST_DIR,
  BUILD_ARTICLES_PATH,
  BUILD_SITE_CONTENT_PATH,
  LOCAL_ARTICLES_PATH,
  PUBLIC_SITE_CONTENT_URL,
  SITE_URL,
  SITE_CONTENT_FETCH_TIMEOUT_MS,
  STRICT_SITE_CONTENT,
  STATIC_ROUTES,
} from './config.js';
import { loadPublishedSiteContent, mergePublishedContent } from './site-content-sync.js';
import { FONT_LIBRARY, cssFamilyName } from './font-library.manifest.js';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(SCRIPTS_DIR, '..', 'public');

// Собирает scripts/content-entry.tsx (реэкспорт реальных данных/легальных текстов
// из src/app) в обычный ESM-модуль, чтобы взять из него настоящий контент
// для статической генерации — без запуска React-рендера всего приложения.
async function loadSiteContent() {
  const esbuild = await import('esbuild');
  const outfile = join(SCRIPTS_DIR, '.content-entry.build.mjs');

  await esbuild.build({
    entryPoints: [join(SCRIPTS_DIR, 'content-entry.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    outfile,
    // Бандлим только локальные исходники сайта; все пакеты из node_modules
    // (react, radix, motion, three и их транзитивные зависимости) резолвятся
    // самим Node через обычный import — так не нужно перечислять их вручную.
    packages: 'external',
    // Из этой сборки берут только данные, стили в ней не нужны. А ещё они
    // ссылаются на шрифты абсолютными путями вида /fonts/..., которые вне
    // dev-сервера не резолвятся и валили генерацию страниц.
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });

  try {
    return await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  } finally {
    try { unlinkSync(outfile); } catch { /* временный файл, не критично */ }
  }
}

const BUILD_DATE = new Date().toISOString().split('T')[0];

const { window: sanitizerWindow } = parseHTML('<!doctype html><html><body></body></html>');
const domPurify = createDOMPurify(sanitizerWindow);


const SAFE_IFRAME_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'player.vimeo.com']);

function isSafeIframeSrc(src = '') {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && SAFE_IFRAME_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

domPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const src = node.getAttribute('src') || '';
    if (!isSafeIframeSrc(src)) node.remove();
  }
});

domPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName?.toLowerCase() === 'a') {
    const href = node.getAttribute('href') || '';
    const target = node.getAttribute('target') || '';
    if (target === '_blank' || /^https?:\/\//i.test(href)) node.setAttribute('rel', 'noopener noreferrer');
  }

  if (node.nodeName?.toLowerCase() === 'iframe') {
    const src = node.getAttribute('src') || '';
    if (isSafeIframeSrc(src)) {
      node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
      node.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    }
  }
});

const ARTICLE_HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'strong', 'em', 'b', 'i',
    'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'details', 'summary', 'aside', 'section', 'div', 'span',
    'video', 'source', 'iframe',
    'svg', 'defs', 'linearGradient', 'stop', 'path',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'loading', 'decoding', 'fetchpriority',
    'width', 'height', 'data-ww-block', 'data-ww-tone',
    'id', 'role', 'aria-label',
    'colspan', 'rowspan', 'scope',
    'srcset', 'sizes',
    'type', 'controls', 'autoplay', 'loop', 'muted', 'playsinline', 'poster', 'preload',
    'allow', 'allowfullscreen', 'frameborder', 'sandbox', 'referrerpolicy',
    'viewBox', 'preserveAspectRatio', 'd', 'fill', 'stroke', 'stroke-width',
    'stroke-linecap', 'x1', 'x2', 'y1', 'y2', 'offset', 'stop-color',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?):\/\/|data:image\/(?:png|jpe?g|webp|gif|avif);base64,|\/)/i,
  /**
   * Все остальные разрешённые атрибуты — не ссылки, и проверять их адресной
   * регуляркой нельзя.
   *
   * DOMPurify отбрасывает атрибут, если его значение не прошло
   * ALLOWED_URI_REGEXP и сам атрибут не числится «неадресным». Своя строгая
   * регулярка выше требует https://, data:image или ведущую косую черту —
   * поэтому width="640", colspan="2", loading="lazy", d="M0 0" и ещё три
   * десятка атрибутов молча вырезались, хотя стоят в списке разрешённых.
   *
   * Список выводится из ALLOWED_ATTR, а не пишется руками: иначе новый атрибут
   * добавили бы в один список и забыли про второй — и он снова оказался бы
   * мёртвым без единой ошибки.
   */
  ADD_URI_SAFE_ATTR: [],
};

// Ссылочные атрибуты остаются под проверкой адреса, остальные — нет.
const URL_BEARING_ATTR = new Set(['href', 'src', 'srcset', 'poster']);
ARTICLE_HTML_SANITIZE_CONFIG.ADD_URI_SAFE_ATTR = ARTICLE_HTML_SANITIZE_CONFIG.ALLOWED_ATTR.filter((attr) => !URL_BEARING_ATTR.has(attr));

function sanitizeArticleHtml(html = '') {
  return domPurify.sanitize(String(html || ''), ARTICLE_HTML_SANITIZE_CONFIG);
}

function isPublishedArticle(article, nowIso = new Date().toISOString()) {
  if (article.status === 'draft') return false;
  if (article.publishedAt && article.publishedAt > nowIso) return false;
  return true;
}

// Reads articles from build cache first, then local fallback for deterministic SEO output

function ensureDir(pathname) {
  if (!existsSync(pathname)) mkdirSync(pathname, { recursive: true });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toAbsoluteUrl(value = '') {
  const url = String(value || '').trim();
  if (!url) return `${SITE_URL}/og-image-v2.jpg`;
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith('/') ? `${SITE_URL}${url}` : `${SITE_URL}/${url}`;
}

function isCaseArticle(article) {
  return String(article?.category || '').trim().toLowerCase() === 'кейсы';
}

function getArticleSectionPath(article) {
  return isCaseArticle(article) ? '/cases' : '/blog';
}

function getArticlePath(article) {
  return `${getArticleSectionPath(article)}/${article.slug}`;
}

function getSectionLabel(sectionPath) {
  return sectionPath === '/cases' ? 'Кейсы' : 'Блог';
}

function toIsoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);

  const ddmmyyyy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function resolveArticleDate(article) {
  return toIsoDate(article.updatedAt) || toIsoDate(article.publishedAt) || toIsoDate(article.date);
}

function toSafeSlug(rawSlug, fallback) {
  const normalized = String(rawSlug || fallback || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized || fallback;
}

function escapeStructuredId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function fallbackFaqId(question) {
  let hash = 2166136261;
  const value = String(question || '');
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
}

function glossaryTermLabel(term) {
  const label = String(term?.term || '');
  const abbreviation = String(term?.abbreviation || '');
  const normalize = (value) => value.toLowerCase().replace(/[^a-zа-яё0-9]+/giu, '');
  return abbreviation && normalize(abbreviation) !== normalize(label)
    ? `${abbreviation} — ${label}`
    : label;
}

function readViteIndexHtml() {
  const indexPath = join(DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error('dist/index.html is missing. Run vite build before generate:pages.');
  }

  const html = readFileSync(indexPath, 'utf8');
  if (!/<div id="root"><\/div>/i.test(html)) {
    throw new Error('dist/index.html is already generated. Run vite build before generate:pages.');
  }
  return html;
}

function insertBeforeHeadClose(html, tag) {
  if (!html.includes('</head>')) return `${tag}\n${html}`;
  return html.replace('</head>', `  ${tag}\n</head>`);
}

// Какой модуль страницы отвечает за маршрут. Router грузит его лениво, поэтому
// браузер узнаёт о файле только после разбора index.js — загрузка выстраивается
// лесенкой и на мобильной сети стоит несколько сотен миллисекунд.
const ROUTE_ENTRY_MODULES = {
  // The Home hero mounts CosmicHeroScene through a nested React.lazy. Include
  // that chunk in the generated shell's critical preload set so the browser
  // can fetch the actual first-screen scene while the entry module evaluates,
  // instead of waiting for a second Suspense pass after hand-off.
  '/': [
    'src/app/pages/Home.tsx',
    'src/app/components/CosmicHeroScene.tsx',
  ],
  '/blog': ['src/app/pages/BlogPage.tsx'],
  '/cases': ['src/app/pages/CasesPage.tsx'],
  '/faq': ['src/app/pages/FAQPage.tsx'],
  '/marketing-glossary': ['src/app/pages/MarketingGlossaryPage.tsx'],
  '/calculator': ['src/app/pages/Calculator.tsx'],
  '/roi-calculator': ['src/app/pages/RoiPage.tsx'],
  '/meta-ads': [
    'src/app/pages/ServiceLandingPage.tsx',
    'src/app/components/service-heroes/MetaAdsEditorialHero.tsx',
  ],
  '/meta-apps': [
    'src/app/pages/ServiceLandingPage.tsx',
    'src/app/components/Hero.tsx',
    'src/app/components/MetaAppsHeroVisual.tsx',
  ],
  '/google-ads': ['src/app/pages/ServiceLandingPage.tsx', 'src/app/components/Hero.tsx'],
  '/consult': [
    'src/app/pages/ServiceLandingPage.tsx',
    'src/app/components/service-heroes/ConsultStudioHero.tsx',
  ],
  // Internal sentinel used only while generating dist/404.html. Its public
  // canonical is intentionally absent, but it still needs the real NotFound
  // route chunk/CSS instead of inheriting the much heavier Home preload set.
  '/__not-found': ['src/app/pages/NotFound.tsx'],
};

// JSON внутри <script> обязан пережить разбор HTML: незакрытый тег или
// разделитель строки Unicode оборвали бы элемент и сломали страницу.
function serializeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderSiteContentSeed(key, content) {
  return `<script type="application/json" id="ww-site-content-seed">${serializeInlineJson({
    schemaVersion: 1,
    key,
    content: content ?? null,
  })}</script>`;
}

const INLINE_ARTICLE_SUMMARY_KEYS = new Set([
  'slug',
  'title',
  'category',
  'readTime',
  'date',
  'description',
  'content',
  'image',
  'publishedAt',
  'updatedAt',
  'tags',
  'summary',
  'caseData',
  '_summary',
]);

function toInlineArticleSummary(article) {
  const summary = {
    slug: String(article.slug || ''),
    title: String(article.title || ''),
    category: String(article.category || ''),
    readTime: String(article.readTime || ''),
    date: String(article.date || ''),
    description: String(article.description || ''),
    content: '',
    image: String(article.image || ''),
    _summary: true,
  };

  for (const key of ['publishedAt', 'updatedAt', 'summary']) {
    if (typeof article[key] === 'string' && article[key]) summary[key] = article[key];
  }
  if (Array.isArray(article.tags) && article.tags.length > 0) summary.tags = article.tags;
  // An explicitly empty object suppresses the legacy case catalog, so it is
  // meaningful and must not be collapsed into an absent value.
  if (article.caseData !== undefined) summary.caseData = article.caseData;

  return summary;
}

function renderArticleSeed(value) {
  return `<script type="application/json" id="ww-article-seed">${serializeInlineJson(value)}</script>`;
}

let viteManifestCache;

function readViteManifest() {
  if (viteManifestCache !== undefined) return viteManifestCache;
  const manifestPath = join(DIST_DIR, '.vite', 'manifest.json');
  viteManifestCache = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : null;
  return viteManifestCache;
}

function resolveRouteEntries(route) {
  if (ROUTE_ENTRY_MODULES[route]) return ROUTE_ENTRY_MODULES[route];
  // Страницы статей и кейсов рисует тот же модуль, что и раздел блога.
  if (/^\/cases\/[^/]+$/.test(route)) {
    return ['src/app/pages/BlogPage.tsx', 'src/app/components/CaseArticleView.tsx'];
  }
  if (/^\/blog\/[^/]+$/.test(route)) return ['src/app/pages/BlogPage.tsx'];
  return [];
}

function normalizeManifestReference(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function manifestModuleName(moduleId = '') {
  const filename = normalizeManifestReference(moduleId).split('/').pop() || '';
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * Vite does not guarantee that a dynamic entry's manifest key is its source
 * pathname. When Rollup promotes it to a private chunk the key becomes, for
 * example, `_BlogPage-<hash>.js`, while the stable identity moves to `name`.
 * Resolve both shapes (and older/custom manifests that expose only src/file)
 * so route preloads do not silently disappear after a bundling change.
 */
function resolveManifestKey(manifest, reference) {
  if (!manifest || !reference) return null;
  if (manifest[reference]) return reference;

  const normalizedReference = normalizeManifestReference(reference);
  const expectedName = manifestModuleName(normalizedReference);
  let bestKey = null;
  let bestScore = 0;

  for (const [key, item] of Object.entries(manifest)) {
    if (!item || typeof item !== 'object') continue;

    const source = normalizeManifestReference(item.src);
    const file = normalizeManifestReference(item.file);
    const name = String(item.name || '');
    const fileName = file.split('/').pop() || '';
    const fileStem = fileName.replace(/\.[^.]+$/, '');
    let score = 0;

    if (normalizeManifestReference(key) === normalizedReference) score = 100;
    else if (source && source === normalizedReference) score = 90;
    else if (file && file === normalizedReference) score = 80;
    else if (name && (name === normalizedReference || name === expectedName)) score = 70;
    else if (
      expectedName
      && file.endsWith('.js')
      && (fileStem === expectedName || fileStem.startsWith(`${expectedName}-`))
    ) score = 60;

    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
    }
  }

  return bestKey;
}

function collectRouteManifestItems(route) {
  const manifest = readViteManifest();
  const entries = resolveRouteEntries(route);
  if (!manifest || entries.length === 0) return [];

  const items = [];
  const seen = new Set();
  const collect = (reference) => {
    const key = resolveManifestKey(manifest, reference);
    if (!key || seen.has(key)) return;
    const item = manifest[key];
    seen.add(key);
    items.push(item);
    for (const imported of item.imports || []) collect(imported);
  };
  for (const entry of entries) collect(entry);
  return items;
}

function renderModulePreloads(route, baseHtml) {
  const seenFiles = new Set();
  const files = collectRouteManifestItems(route)
    .map((item) => item.file)
    .filter((file) => file && !seenFiles.has(file) && seenFiles.add(file));

  return files
    // Файлы, уже объявленные в index.html, повторять незачем.
    .filter((file) => !baseHtml.includes(file))
    .map((file) => `<link rel="modulepreload" href="/${file}" />`)
    .join('\n  ');
}

function renderRouteStylesheets(route, baseHtml) {
  const seenFiles = new Set();
  const files = collectRouteManifestItems(route)
    .flatMap((item) => Array.isArray(item.css) ? item.css : [])
    .filter((file) => file && !seenFiles.has(file) && seenFiles.add(file));

  return files
    // Global CSS is already linked by Vite in the original HTML shell.
    .filter((file) => !baseHtml.includes(file))
    .map((file) => `<link rel="stylesheet" href="/${file}" />`)
    .join('\n  ');
}

function upsertTag(html, matcher, tag) {
  if (matcher.test(html)) return html.replace(matcher, tag);
  return insertBeforeHeadClose(html, tag);
}

function upsertNamedMeta(html, name, content) {
  return upsertTag(
    html,
    new RegExp(`<meta\\s+[^>]*name=["']${name}["'][^>]*>`, 'i'),
    `<meta name="${name}" content="${escapeHtml(content)}" />`,
  );
}

function upsertPropertyMeta(html, property, content) {
  return upsertTag(
    html,
    new RegExp(`<meta\\s+[^>]*property=["']${property}["'][^>]*>`, 'i'),
    `<meta property="${property}" content="${escapeHtml(content)}" />`,
  );
}

function upsertCanonical(html, canonicalUrl) {
  return upsertTag(
    html,
    /<link\s+[^>]*rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
  );
}

function upsertAlternate(html, hrefLang, href) {
  return upsertTag(
    html,
    new RegExp(`<link\\s+[^>]*rel=["']alternate["'][^>]*hreflang=["']${hrefLang}["'][^>]*>`, 'i'),
    `<link rel="alternate" hreflang="${escapeHtml(hrefLang)}" href="${escapeHtml(href)}" />`,
  );
}

function readArticles(pathname) {
  if (!existsSync(pathname)) return null;

  try {
    const payload = JSON.parse(readFileSync(pathname, 'utf8'));
    return Array.isArray(payload?.articles) ? payload.articles : null;
  } catch {
    return null;
  }
}

function loadArticles() {
  return readArticles(BUILD_ARTICLES_PATH) || readArticles(LOCAL_ARTICLES_PATH) || [];
}

function normalizeArticles(rawArticles) {
  const usedSlugs = new Set();

  return rawArticles.map((article, index) => {
    const baseSlug = toSafeSlug(article?.slug || article?.title, `article-${index + 1}`);
    let uniqueSlug = baseSlug;
    let suffix = 2;

    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    usedSlugs.add(uniqueSlug);

    const content = article?.content || '<p>Контент статьи отсутствует.</p>';
    const description = stripHtml(article?.description || content).slice(0, 160);
    const faq = Array.isArray(article?.faq)
      ? article.faq
        .map((item) => ({
          question: String(item?.question || '').trim(),
          answer: String(item?.answer || '').trim(),
        }))
        .filter((item) => item.question && item.answer)
      : [];

    return {
      slug: uniqueSlug,
      title: article?.title || `Статья ${index + 1}`,
      content,
      category: article?.category || 'Блог',
      date: article?.date || BUILD_DATE,
      readTime: article?.readTime || '',
      image: article?.image || `${SITE_URL}/og-image-v2.jpg`,
      description,
      seoTitle: article?.seoTitle || article?.title || `Статья ${index + 1}`,
      seoDescription: article?.seoDescription || description,
      publishedAt: article?.publishedAt || '',
      updatedAt: article?.updatedAt || article?.publishedAt || '',
      status: article?.status === 'draft' ? 'draft' : 'published',
      tags: Array.isArray(article?.tags) ? article.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      summary: article?.summary || '',
      keyTakeaways: Array.isArray(article?.keyTakeaways) ? article.keyTakeaways.map((item) => String(item).trim()).filter(Boolean) : [],
      faq,
    };
  });
}

// Cloudflare Pages отдаёт статические директории только по адресу со слэшем на
// конце (/meta-ads -> 308 -> /meta-ads/) — редиректит и файлы, и /blog/:slug тут
// не участвуют: они не пре-рендерятся статикой, их отдаёт functions/blog/[slug].ts
// напрямую, без редиректа. canonical/OG/sitemap должны указывать сразу на
// реально отдаваемый адрес, а не на тот, что тут же редиректит сам на себя.
function withTrailingSlashIfStaticRoute(path) {
  if (path === '/') return path;
  if (/\.[a-z0-9]+$/i.test(path)) return path;
  if (/^\/(blog|cases)\/.+/.test(path)) return path;
  return path.endsWith('/') ? path : `${path}/`;
}

function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: 'Whale Wizard',
    url: SITE_URL,
    logo: `${SITE_URL}/images/brand/whale-wizard.png`,
    image: `${SITE_URL}/og-image-v2.jpg`,
    description: 'Настройка и ведение Google Ads и Meta Ads с опорой на аналитику, качество заявок и продажи.',
    email: 'whalewzrd@gmail.com',
    // Услуга удалённая и на русском — это единственное, что здесь правда.
    // Прежний список RU/US/AE/TR/EU заявлял охват, которого нечем подтвердить:
    // география не упоминается ни в одном тексте сайта, локализованных версий
    // нет, а Узбекистан, откуда работает владелец, в список даже не входил.
    areaServed: 'Worldwide',
    availableLanguage: 'ru',
    serviceType: ['Google Ads', 'Meta Ads', 'Performance Marketing', 'Lead Generation'],
    sameAs: ['https://t.me/white_rsh'],
  };
}

function buildWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Whale Wizard',
    url: SITE_URL,
    inLanguage: 'ru',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/blog?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function buildFaqJsonLd(faqs = []) {
  if (!faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      '@id': `${SITE_URL}/faq/#faq-${escapeStructuredId(f.id || fallbackFaqId(f.question))}`,
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: [f.answer, ...(f.details || [])].filter(Boolean).join(' '),
      },
    })),
  };
}

function buildGlossaryJsonLd(terms = []) {
  if (!terms.length) return null;
  const termSetId = `${SITE_URL}/marketing-glossary/#glossary`;
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': termSetId,
    name: 'Словарь performance-маркетинга и рекламы приложений',
    description: 'Канонические определения метрик, рекламы, аналитики, CRM, SEO и продвижения приложений.',
    inLanguage: 'ru',
    hasDefinedTerm: terms.map((term) => ({
      '@type': 'DefinedTerm',
      '@id': `${SITE_URL}/marketing-glossary/#term-${escapeStructuredId(term.id)}`,
      name: glossaryTermLabel(term),
      ...(term.abbreviation ? { termCode: term.abbreviation } : {}),
      ...(term.aliases?.length ? { alternateName: term.aliases.map((alias) => alias.value).filter(Boolean) } : {}),
      description: term.definition,
      inDefinedTermSet: termSetId,
    })),
  };
}

function buildArticleJsonLd(article) {
  const path = getArticlePath(article);
  const canonical = `${SITE_URL}${path}`;
  // datePublished — дата первой публикации, dateModified двигается при правках.
  const publishedDate = toIsoDate(article.publishedAt) || toIsoDate(article.date);
  const modifiedDate = toIsoDate(article.updatedAt) || publishedDate;
  return {
    '@context': 'https://schema.org',
    '@type': isCaseArticle(article) ? 'Article' : 'BlogPosting',
    headline: article.seoTitle || article.title,
    description: article.seoDescription || article.description,
    image: [toAbsoluteUrl(article.image || '/og-image-v2.jpg')],
    ...(publishedDate ? { datePublished: publishedDate } : {}),
    ...(modifiedDate ? { dateModified: modifiedDate } : {}),
    mainEntityOfPage: canonical,
    author: {
      '@type': 'Person',
      name: 'Whale Wizard',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Whale Wizard',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/images/brand/whale-wizard.png`,
      },
    },
    keywords: article.tags || [],
    articleSection: article.category,
  };
}

function buildBreadcrumbJsonLd(article) {
  const sectionPath = getArticleSectionPath(article);
  const sectionLabel = getSectionLabel(sectionPath);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Главная',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: sectionLabel,
        item: `${SITE_URL}${withTrailingSlashIfStaticRoute(sectionPath)}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: article.title,
        item: `${SITE_URL}${getArticlePath(article)}`,
      },
    ],
  };
}

// Хлебные крошки в разметке помогают поиску показывать путь до страницы
// вместо голого URL. Для статей они уже строились, для остальных страниц — нет.
function buildStaticBreadcrumbJsonLd(route, name) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name, item: `${SITE_URL}${withTrailingSlashIfStaticRoute(route)}` },
    ],
  };
}

// Описывает саму услугу, а не сайт: без этого лендинги услуг для поиска и
// ИИ-ответов ничем не отличались от обычной страницы.
function buildServiceJsonLd(route, { name, description, serviceType }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    serviceType,
    url: `${SITE_URL}${withTrailingSlashIfStaticRoute(route)}`,
    provider: {
      '@type': 'ProfessionalService',
      name: 'Whale Wizard',
      url: `${SITE_URL}/`,
    },
    inLanguage: 'ru',
  };
}

function renderJsonLdScripts(schemas = []) {
  const serializeJsonLd = (schema) => JSON.stringify(schema)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const schemaId = (schema) => {
    const type = String(schema?.['@type'] || '');
    if (type === 'ProfessionalService') return 'ld-organization';
    if (type === 'WebSite') return 'ld-website';
    if (type === 'FAQPage') return 'ld-faq-page';
    if (type === 'DefinedTermSet') return 'ld-marketing-glossary';
    if (type === 'Article' || type === 'BlogPosting') return 'ld-article';
    if (type === 'BreadcrumbList') return 'ld-breadcrumbs';
    if (type === 'Service') return 'ld-service';
    return '';
  };
  return schemas
    .filter(Boolean)
    .map((schema) => `<script${schemaId(schema) ? ` id="${schemaId(schema)}"` : ''} type="application/ld+json">${serializeJsonLd(schema)}</script>`)
    .join('\n  ');
}

/*
 * Картинки первого экрана, которые стоит начать грузить из HTML, не дожидаясь
 * JS. Сайт — SPA: без preload картинка героя стартует только после того, как
 * скачается и выполнится основной бандл, потом чанк роута, потом чанк самого
 * героя — четыре волны ожидания.
 *
 * Портрет (hero-portrait.jpg) рисует RightPanel в Hero.tsx — он остался у
 * Google Ads. На главной хиро теперь космическая сцена, её LCP-кадр это фон
 * и кит; портрет там не рисуется вовсе, и preload на него только отбирал
 * канал у настоящих картинок первого экрана. У Meta Ads и консультации свои
 * LCP-кадры, а у /meta-apps — подставка и корпус телефона.
 *
 * priority: true ставит fetchpriority="high" только фактическому LCP-кадру
 * маршрута. Картинкам /meta-apps высокий приоритет не даём: они всё равно не
 * отрисуются раньше JS, а канал у бандла отберут.
 */
const HERO_PRELOADS = {
  '/': [
    { href: '/images/cosmic/sky.webp', priority: true },
    { href: '/images/cosmic/whale.webp' },
  ],
  '/meta-ads': [
    { href: '/images/meta-proof/paper-stack-768.webp', priority: true },
    {
      href: '/images/meta-proof/ecommerce-photo.webp',
      imageSrcSet: '/images/meta-proof/ecommerce-photo-480.webp 480w, /images/meta-proof/ecommerce-photo-800.webp 800w, /images/meta-proof/ecommerce-photo.webp 1440w',
      imageSizes: '(max-width: 767px) 230px, 400px',
    },
  ],
  '/google-ads': [{ href: '/images/hero-portrait.jpg', priority: true }],
  '/consult': [
    {
      href: '/images/consult-proof/workspace-mobile.webp',
      priority: true,
      media: '(max-width: 1023px)',
    },
    {
      href: '/images/consult-proof/workspace-portrait.webp',
      priority: true,
      media: '(min-width: 1024px)',
    },
  ],
  '/meta-apps': [
    {
      href: '/images/meta-hero-pedestal-rack-mobile.webp',
      media: '(max-width: 767px)',
      imageSrcSet: '/images/meta-hero-pedestal-rack-mobile.webp 768w, /images/meta-hero-pedestal-rack-medium.webp 1152w, /images/meta-hero-pedestal-rack.webp 1536w',
      imageSizes: '100vw',
    },
    {
      href: '/images/meta-phone-3d-shell-mobile.webp',
      media: '(max-width: 767px)',
      imageSrcSet: '/images/meta-phone-3d-shell-mobile.webp 462w, /images/meta-phone-3d-shell-medium.webp 616w, /images/meta-phone-3d-shell.webp 770w',
      imageSizes: '210px',
    },
    { href: '/images/meta-hero-pedestal-rack.webp', media: '(min-width: 768px)' },
    { href: '/images/meta-phone-3d-shell.webp', media: '(min-width: 768px)' },
  ],
};

const FONT_LIBRARY_BY_ID = new Map(FONT_LIBRARY.map((font) => [font.id, font]));
const DISPLAY_SERIF_FONT_IDS = new Set([
  'prata',
  'cormorant-garamond',
  'oranienbaum',
  'playfair-display',
  'yeseva-one',
  'forum',
  'kelly-slab',
  'ruslan-display',
]);

function shellFontFamily(fontId, role = 'title') {
  if (!fontId || fontId === 'auto') return '';
  if (fontId === 'inter') {
    return "'Inter Variable',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  }

  const font = FONT_LIBRARY_BY_ID.get(fontId);
  if (!font || (role === 'body' && !font.bodySafe)) return '';
  const fallback = font.category === 'mono'
    ? "ui-monospace,'Cascadia Mono',Consolas,'Courier New',monospace"
    : font.category === 'serif' || DISPLAY_SERIF_FONT_IDS.has(font.id)
      ? "Georgia,'Times New Roman',Times,serif"
      : font.category === 'handwritten'
        ? "'Segoe Print','Bradley Hand',cursive"
        : "ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  return `'${cssFamilyName(font.family)}',${fallback}`;
}

function nearestFontWeight(font, requestedWeight) {
  const target = Number.isInteger(requestedWeight) ? requestedWeight : 700;
  return font.weights.reduce((nearest, weight) => (
    Math.abs(weight - target) < Math.abs(nearest - target) ? weight : nearest
  ), font.weights[0]);
}

function resolveHeroFontPreloads(hero = {}) {
  const typography = hero?.typography || {};
  const defaultWeight = Number.isInteger(typography.titleWeight) ? typography.titleWeight : 700;
  const requestedFonts = new Map();
  const register = (fontId, text, weight = defaultWeight) => {
    const font = FONT_LIBRARY_BY_ID.get(fontId);
    if (!font) return;
    const current = requestedFonts.get(fontId) || { font, text: '', weight };
    current.text += ` ${String(text || '')}`;
    requestedFonts.set(fontId, current);
  };

  register(typography.titleFont, heroHeading(hero), defaultWeight);
  register(
    FONT_LIBRARY_BY_ID.get(typography.bodyFont)?.bodySafe ? typography.bodyFont : undefined,
    Array.isArray(hero.paragraphs) ? hero.paragraphs.join(' ') : '',
    400,
  );
  if (Array.isArray(hero.titleLines)) {
    for (const line of hero.titleLines) {
      register(line?.font, line?.text, line?.tone === 'supporting' ? 500 : defaultWeight);
    }
  }

  const hrefs = new Set();
  for (const { font, text, weight } of requestedFonts.values()) {
    const resolvedWeight = nearestFontWeight(font, weight);
    const subsets = /[\u0400-\u052f]/u.test(text) ? ['cyrillic'] : [];
    if (/[A-Za-z0-9]/u.test(text) || subsets.length === 0) subsets.push('latin');
    const folder = font.dir === 'hero' ? 'hero' : 'library';
    for (const subset of subsets) {
      const fileName = `${font.id}-${resolvedWeight}-normal-${subset}.woff2`;
      if (existsSync(join(PUBLIC_DIR, 'fonts', folder, fileName))) {
        hrefs.add(`/fonts/${folder}/${fileName}`);
      }
    }
  }

  return [...hrefs];
}

function renderFontPreloads(preloads = []) {
  return preloads
    .map((href) => `<link rel="preload" as="font" type="font/woff2" href="${escapeHtml(href)}" crossorigin />`)
    .join('\n  ');
}

function renderImagePreloads(preloads = []) {
  return preloads
    .map(({ href, priority, media, imageSrcSet, imageSizes }) => {
      const fetchPriority = priority ? ' fetchpriority="high"' : '';
      const mediaAttribute = media ? ` media="${escapeHtml(media)}"` : '';
      const srcSetAttribute = imageSrcSet ? ` imagesrcset="${escapeHtml(imageSrcSet)}"` : '';
      const sizesAttribute = imageSizes ? ` imagesizes="${escapeHtml(imageSizes)}"` : '';
      return `<link rel="preload" as="image" href="${escapeHtml(href)}"${fetchPriority}${mediaAttribute}${srcSetAttribute}${sizesAttribute} />`;
    })
    .join('\n  ');
}

function htmlTemplate({
  baseHtml,
  title,
  description,
  canonicalPath,
  assetRoute = canonicalPath,
  bodyHtml,
  ogType = 'website',
  ogImage,
  noIndex = false,
  dropCanonical = false,
  headExtra = '',
  extraJsonLd = [],
  imagePreloads = [],
  fontPreloads = [],
  articlePublishedTime,
  articleModifiedTime,
  articleSection,
}) {
  const canonicalUrl = `${SITE_URL}${withTrailingSlashIfStaticRoute(canonicalPath)}`;
  const imageUrl = toAbsoluteUrl(ogImage || '/og-image-v2.jpg');
  let html = baseHtml;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = upsertNamedMeta(html, 'description', description);
  html = upsertNamedMeta(html, 'robots', noIndex ? 'noindex, nofollow, noarchive' : 'index, follow');
  html = upsertPropertyMeta(html, 'og:title', title);
  html = upsertPropertyMeta(html, 'og:description', description);
  html = upsertPropertyMeta(html, 'og:type', ogType);
  html = upsertPropertyMeta(html, 'og:url', canonicalUrl);
  html = upsertPropertyMeta(html, 'og:image', imageUrl);
  html = upsertPropertyMeta(html, 'og:site_name', 'Whale Wizard');
  html = upsertPropertyMeta(html, 'og:locale', 'ru_RU');
  if (articlePublishedTime) html = upsertPropertyMeta(html, 'article:published_time', articlePublishedTime);
  if (articleModifiedTime) html = upsertPropertyMeta(html, 'article:modified_time', articleModifiedTime);
  if (articleSection) html = upsertPropertyMeta(html, 'article:section', articleSection);
  html = upsertNamedMeta(html, 'twitter:card', 'summary_large_image');
  html = upsertNamedMeta(html, 'twitter:title', title);
  html = upsertNamedMeta(html, 'twitter:description', description);
  html = upsertNamedMeta(html, 'twitter:image', imageUrl);
  html = upsertNamedMeta(html, 'twitter:url', canonicalUrl);
  if (dropCanonical) {
    // Страница 404 отвечает по любому несуществующему адресу. Canonical здесь
    // объявил бы каждый такой адрес копией конкретной страницы.
    html = html.replace(/\s*<link\s+[^>]*rel=["'](?:canonical|alternate)["'][^>]*hreflang=[^>]*>/gi, '');
    html = html.replace(/\s*<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, '');
  } else {
    html = upsertCanonical(html, canonicalUrl);
    html = upsertAlternate(html, 'ru', canonicalUrl);
    html = upsertAlternate(html, 'x-default', canonicalUrl);
  }

  const preloadHtml = renderImagePreloads(imagePreloads);
  if (preloadHtml) html = insertBeforeHeadClose(html, preloadHtml);

  const fontPreloadHtml = renderFontPreloads(fontPreloads);
  if (fontPreloadHtml) html = insertBeforeHeadClose(html, fontPreloadHtml);

  const routeStylesheetHtml = renderRouteStylesheets(assetRoute, baseHtml);
  if (routeStylesheetHtml) html = insertBeforeHeadClose(html, routeStylesheetHtml);

  const modulePreloadHtml = renderModulePreloads(assetRoute, baseHtml);
  if (modulePreloadHtml) html = insertBeforeHeadClose(html, modulePreloadHtml);

  if (headExtra) html = insertBeforeHeadClose(html, headExtra);

  if (!noIndex) {
    const jsonLdHtml = renderJsonLdScripts([buildOrganizationJsonLd(), buildWebsiteJsonLd(), ...extraJsonLd]);
    if (jsonLdHtml) html = insertBeforeHeadClose(html, jsonLdHtml);
  }

  const rootHtml = `  <div id="root">\n${bodyHtml}\n  </div>`;
  if (/<div id="root"><\/div>/i.test(html)) {
    html = html.replace(/<div id="root"><\/div>/i, rootHtml.trim());
  } else {
    html = html.replace(/<div id="root">[\s\S]*?<\/div>/i, rootHtml.trim());
  }

  return html;
}

// Cloudflare Pages отдаёт этот файл с кодом 404 по любому несуществующему
// адресу. Без него не найденный путь возвращал 200 с разметкой главной —
// Google засчитывал это как soft 404 и как копию главной страницы.
function writeNotFoundPage(baseHtml) {
  const html = htmlTemplate({
    baseHtml,
    title: 'Страница не найдена | Whale Wizard',
    description: 'Такой страницы нет. Вернитесь на главную или загляните в блог и кейсы.',
    canonicalPath: '/',
    assetRoute: '/__not-found',
    noIndex: true,
    dropCanonical: true,
    bodyHtml: renderGeneratedShell({
      eyebrow: 'Ошибка 404',
      title: 'Страница не найдена',
      lead: 'Адрес устарел или введён с опечаткой. Проверьте ссылку или начните с главной страницы.',
      children: `        <div style="${generatedShellStyles.list}">
          <a href="/" style="${generatedShellStyles.item}"><strong>На главную</strong></a>
          <a href="/blog/" style="${generatedShellStyles.item}"><strong>Блог</strong></a>
          <a href="/cases/" style="${generatedShellStyles.item}"><strong>Кейсы</strong></a>
        </div>`,
    }),
  });

  writeFileSync(join(DIST_DIR, '404.html'), html, 'utf8');
}

function writeRoute(route, html) {
  const dir = route === '/' ? DIST_DIR : join(DIST_DIR, route.replace(/^\//, ''));
  ensureDir(dir);
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
}

const generatedShellStyles = {
  main: [
    'min-height:100vh',
    'box-sizing:border-box',
    'display:grid',
    'place-items:center',
    'padding:48px 20px',
    'background:radial-gradient(circle at 18% 18%, rgba(139,92,246,.30), transparent 34%),radial-gradient(circle at 82% 8%, rgba(56,189,248,.20), transparent 30%),linear-gradient(135deg,#07070e 0%,#101226 52%,#07070e 100%)',
    'color:#f8fafc',
    // Тот же системный стек, что и у живых страниц: Inter в проект не
    // подключён, и ссылка на него всё равно падала в этот же fallback.
    'font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  ].join(';'),
  card: [
    'width:min(100%,860px)',
    'box-sizing:border-box',
    'border:1px solid rgba(255,255,255,.14)',
    'border-radius:28px',
    'padding:clamp(28px,5vw,56px)',
    'background:linear-gradient(180deg,rgba(15,23,42,.78),rgba(15,23,42,.48))',
    'box-shadow:0 30px 90px rgba(0,0,0,.38)',
    'backdrop-filter:blur(18px)',
  ].join(';'),
  eyebrow: [
    'display:inline-flex',
    'align-items:center',
    'gap:8px',
    'margin:0 0 18px',
    'padding:8px 12px',
    'border-radius:999px',
    'border:1px solid rgba(129,140,248,.38)',
    'background:rgba(99,102,241,.14)',
    'color:#c4b5fd',
    'font-size:13px',
    'font-weight:700',
    'letter-spacing:.08em',
    'text-transform:uppercase',
  ].join(';'),
  title: [
    'margin:0',
    'max-width:760px',
    'font-size:clamp(34px,7vw,68px)',
    'line-height:.96',
    'letter-spacing:-.055em',
    'font-weight:850',
  ].join(';'),
  lead: [
    'margin:22px 0 0',
    'max-width:680px',
    'color:rgba(226,232,240,.78)',
    'font-size:clamp(16px,2vw,20px)',
    'line-height:1.7',
  ].join(';'),
  footer: [
    'margin-top:32px',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'color:rgba(148,163,184,.78)',
    'font-size:13px',
  ].join(';'),
  dot: 'width:8px;height:8px;border-radius:999px;background:linear-gradient(135deg,#8b5cf6,#38bdf8);box-shadow:0 0 24px rgba(99,102,241,.9)',
  list: 'display:grid;gap:14px;margin-top:28px',
  item: 'display:block;text-decoration:none;color:#f8fafc;padding:16px 18px;border-radius:18px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.055)',
  muted: 'display:block;margin-top:6px;color:rgba(203,213,225,.72);font-size:14px;line-height:1.55',
  articleMeta: 'margin:18px 0 0;color:rgba(203,213,225,.74);font-size:14px;line-height:1.6',
  articleBody: 'margin-top:34px;padding-top:28px;border-top:1px solid rgba(255,255,255,.12);color:rgba(226,232,240,.86);line-height:1.72;font-size:16px',
};

const SHELL_TITLE_LINE_HEIGHTS = {
  tight: 0.95,
  snug: 1.05,
  normal: 1.15,
  relaxed: 1.3,
};
const SHELL_TITLE_LETTER_SPACING = {
  tight: '-0.035em',
  normal: '0em',
  wide: '0.045em',
};

function shellTitleSize(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.min(240, Math.max(8, value));
  if (value === 'compact') return fallback - 3;
  if (value === 'large') return fallback + 5;
  return fallback;
}

function renderHeroShellTitle(hero, fallbackTitle) {
  if (!hero || typeof hero !== 'object') {
    return `<h1 style="${generatedShellStyles.title}">${escapeHtml(fallbackTitle)}</h1>`;
  }

  const typography = hero.typography || {};
  const hasTitleLines = Array.isArray(hero.titleLines) && hero.titleLines.length > 0;
  const mobileSize = shellTitleSize(typography.titleMobile, hasTitleLines ? 21 : 22);
  const desktopSize = shellTitleSize(typography.titleDesktop, hasTitleLines ? 35 : 38);
  const titleWeight = Number.isInteger(typography.titleWeight)
    && typography.titleWeight >= 100
    && typography.titleWeight <= 900
    ? typography.titleWeight
    : 700;
  const style = [
    generatedShellStyles.title,
    `font-size:clamp(${mobileSize}px,4vw,${desktopSize}px)`,
    `font-weight:${titleWeight}`,
    'line-height:1.12',
    'letter-spacing:-.03em',
  ];
  const family = shellFontFamily(typography.titleFont);
  if (family) style.push(`font-family:${family}`);
  if (SHELL_TITLE_LINE_HEIGHTS[typography.titleLineHeight]) {
    style.push(`line-height:${SHELL_TITLE_LINE_HEIGHTS[typography.titleLineHeight]}`);
  }
  if (SHELL_TITLE_LETTER_SPACING[typography.titleLetterSpacing]) {
    style.push(`letter-spacing:${SHELL_TITLE_LETTER_SPACING[typography.titleLetterSpacing]}`);
  }

  const renderLine = (line, index) => {
    const lineStyle = ['display:block'];
    const lineFamily = shellFontFamily(line?.font);
    if (lineFamily) lineStyle.push(`font-family:${lineFamily}`);
    if (line?.tone === 'accent') {
      lineStyle.push('background:linear-gradient(90deg,#8b5cf6,#38bdf8,#60a5fa)', 'background-clip:text', '-webkit-background-clip:text', 'color:transparent', 'padding-bottom:.18em', 'margin-bottom:-.18em');
    } else if (line?.tone === 'supporting') {
      lineStyle.push('margin-top:.7em', 'color:rgba(203,213,225,.78)', 'font-size:.48em', 'font-weight:500', 'line-height:1.35', 'letter-spacing:-.01em');
    }
    return `<span data-ww-shell-title-line="${index + 1}" style="${lineStyle.join(';')}">${escapeHtml(line?.text || '')}</span>`;
  };

  const lines = hasTitleLines
    ? hero.titleLines
    : [
      { text: hero.titlePrefix },
      { text: hero.titleAccent, tone: 'accent' },
    ];
  const titleHtml = lines.map(renderLine).join('');
  return `<h1 aria-label="${escapeHtml(fallbackTitle)}" style="${style.join(';')}">${titleHtml}</h1>`;
}

function heroShellLeadStyle(hero) {
  const family = shellFontFamily(hero?.typography?.bodyFont, 'body');
  return family ? `${generatedShellStyles.lead};font-family:${family}` : generatedShellStyles.lead;
}

function renderGeneratedShell({ eyebrow = 'Whale Wizard', title, lead, hero, children = '', sections = [] }) {
  const sectionsHtml = sections
    .map(
      (s) => `
        <section style="margin-top:30px;padding-top:24px;border-top:1px solid rgba(255,255,255,.10)">
          ${s.heading ? `<h2 style="margin:0 0 14px;font-size:19px;font-weight:800;letter-spacing:-.01em">${escapeHtml(s.heading)}</h2>` : ''}
          ${s.bodyHtml}
        </section>`,
    )
    .join('');

  return `    <main style="${generatedShellStyles.main}">
      <section style="${generatedShellStyles.card}${sections.length ? ';width:min(100%,920px)' : ''}">
        <p style="${generatedShellStyles.eyebrow}">${escapeHtml(eyebrow)}</p>
        ${renderHeroShellTitle(hero, title)}
        <p style="${heroShellLeadStyle(hero)}">${escapeHtml(lead)}</p>
${children}${sectionsHtml}
        <div style="${generatedShellStyles.footer}" aria-hidden="true"><span style="${generatedShellStyles.dot}"></span><span>Загружаем интерактивную версию сайта…</span></div>
      </section>
    </main>`;
}

// ─── Рендер разделов из реальных данных сайта (для ботов/ИИ без выполнения JS) ──

const contentStyles = {
  cardBox: 'padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03)',
  heading3: 'margin:0 0 6px;font-size:15px;font-weight:700',
  body: 'margin:0;color:rgba(226,232,240,.82);line-height:1.65',
  muted: 'color:rgba(148,163,184,.75);font-size:13px',
  statValue: 'font-weight:800;font-size:21px',
  statLabel: 'font-size:12px;color:rgba(148,163,184,.75)',
};

function renderStatsHtml(stats = []) {
  if (!stats.length) return '';
  return `<div style="display:flex;gap:26px;margin-top:18px;flex-wrap:wrap">${stats
    .map((s) => `<div><div style="${contentStyles.statValue}">${escapeHtml(s.value)}</div><div style="${contentStyles.statLabel}">${escapeHtml(s.label)}</div></div>`)
    .join('')}</div>`;
}

function renderParagraphsHtml(paragraphs = []) {
  return paragraphs.map((p) => `<p style="margin:0 0 12px;${contentStyles.body}">${escapeHtml(String(p))}</p>`).join('');
}

function renderBadgeHtml(badge) {
  if (!badge) return '';
  return `<p style="margin:0 0 10px;${contentStyles.muted};font-weight:700">${escapeHtml(badge)}</p>`;
}

function renderActionLabelsHtml(labels = []) {
  const visible = labels.map((label) => String(label || '').trim()).filter(Boolean);
  if (!visible.length) return '';
  return `<p style="margin:12px 0 0;${contentStyles.muted}">${visible.map((label) => escapeHtml(label)).join(' · ')}</p>`;
}

function renderBenefitsHtml(benefits = []) {
  if (!Array.isArray(benefits) || !benefits.length) return '';
  return `<div style="display:grid;gap:10px;margin-top:14px">${benefits.map((benefit) => `
    <div style="${contentStyles.cardBox}">
      <h3 style="${contentStyles.heading3}">${escapeHtml(benefit.title)}</h3>
      <p style="${contentStyles.body}">${escapeHtml(benefit.description)}</p>
    </div>`).join('')}</div>`;
}

function renderHeroBodyHtml(hero) {
  return `${renderBadgeHtml(hero.badge)}${renderStatsHtml(hero.stats)}${renderActionLabelsHtml([hero.primaryButton, hero.secondaryButton])}`;
}

function renderServiceCardsHtml(cards = []) {
  return `<div style="display:grid;gap:14px">${cards
    .map(
      (c) => `
        <div style="${contentStyles.cardBox}">
          <h3 style="${contentStyles.heading3}">${escapeHtml(c.title)}</h3>
          <p style="${contentStyles.body};margin-bottom:8px">${escapeHtml(c.description)}</p>
          <p style="${contentStyles.muted}">${(c.features || []).map((f) => escapeHtml(f)).join(' · ')}</p>
        </div>`,
    )
    .join('')}</div>`;
}

function renderCaseItemsHtml(items = []) {
  return `<div style="display:grid;gap:14px">${items
    .map(
      (c) => `
        <div style="${contentStyles.cardBox}">
          <h3 style="${contentStyles.heading3}">${escapeHtml(c.title)} <span style="font-weight:400;${contentStyles.muted}">· ${escapeHtml(c.category)}</span></h3>
          <p style="${contentStyles.body};margin-bottom:8px">${escapeHtml(c.description)}</p>
          <p style="${contentStyles.muted}">${(c.stats || []).map((s) => `${escapeHtml(s.label)}: <strong>${escapeHtml(s.value)}</strong>`).join(' · ')}</p>
        </div>`,
    )
    .join('')}</div>`;
}

function renderTestimonialsHtml(items = []) {
  return `<div style="display:grid;gap:14px">${items
    .map(
      (t) => `
        <div style="${contentStyles.cardBox}">
          <p style="${contentStyles.body};margin-bottom:8px">«${escapeHtml(t.text)}»</p>
          <p style="${contentStyles.muted}">${escapeHtml(t.name)}, ${escapeHtml(t.position)} — ${escapeHtml(t.company)}</p>
        </div>`,
    )
    .join('')}</div>`;
}

function renderTestimonialsSection(content, items = []) {
  return `${renderBadgeHtml(content.badge)}<p style="${contentStyles.body};margin-bottom:14px">${escapeHtml(content.description)}</p>${renderStatsHtml(content.stats)}${renderTestimonialsHtml(items)}`;
}

function renderFaqListHtml(faqs = [], categories = []) {
  const orderedCategories = [
    ...categories,
    ...faqs.map((item) => item.category).filter((category) => category && !categories.includes(category)),
  ];

  return [...new Set(orderedCategories)]
    .map((category) => {
      const items = faqs.filter((item) => item.category === category);
      if (!items.length) return '';
      const categoryId = escapeStructuredId(category) || fallbackFaqId(category);
      return `
        <section aria-labelledby="faq-category-${categoryId}" style="margin-bottom:28px">
          <h2 id="faq-category-${categoryId}" style="margin:0 0 12px;font-size:21px;font-weight:800">${escapeHtml(category)}</h2>
          ${items.map((item) => {
            const id = escapeStructuredId(item.id || fallbackFaqId(item.question));
            return `
              <details id="faq-${id}" style="${contentStyles.cardBox};margin-bottom:12px;scroll-margin-top:96px">
                <summary style="cursor:pointer;font-weight:700;font-size:15px">${escapeHtml(item.question)}</summary>
                <p style="margin:10px 0 0;${contentStyles.body}">${escapeHtml(item.answer)}</p>
                ${(item.details || []).length ? `<ul style="margin:8px 0 0;padding-left:20px;${contentStyles.body}">${item.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>` : ''}
                ${(item.relatedTermIds || []).length ? `<p style="margin:10px 0 0;${contentStyles.muted}"><strong>Термины:</strong> ${item.relatedTermIds.map((termId) => `<a href="/marketing-glossary/#term-${escapeStructuredId(termId)}">${escapeHtml(termId)}</a>`).join(' · ')}</p>` : ''}
              </details>`;
          }).join('')}
        </section>`;
    })
    .join('');
}

function renderGlossaryListHtml(terms = [], sections = [], sources = []) {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return sections
    .map((section) => {
      const sectionTerms = terms.filter((term) => term.primarySection === section.id);
      if (!sectionTerms.length) return '';
      return `
        <section aria-labelledby="glossary-section-${escapeStructuredId(section.id)}" style="margin-bottom:32px">
          <h2 id="glossary-section-${escapeStructuredId(section.id)}" style="margin:0 0 12px;font-size:21px;font-weight:800">${escapeHtml(section.label)}</h2>
          <div style="display:grid;gap:12px">
            ${sectionTerms.map((term) => {
              const termSources = (term.sourceIds || []).map((sourceId) => sourceById.get(sourceId)).filter(Boolean);
              return `
                <details id="term-${escapeStructuredId(term.id)}" style="${contentStyles.cardBox};scroll-margin-top:96px">
                  <summary style="cursor:pointer;font-weight:700;font-size:15px">
                    ${escapeHtml(glossaryTermLabel(term))}
                    <span style="font-weight:400;${contentStyles.muted}"> · ${escapeHtml(sectionById.get(term.primarySection)?.label || term.primarySection)} · ${escapeHtml(term.category)}</span>
                  </summary>
                  ${term.disambiguation ? `<p style="margin:10px 0 0;${contentStyles.muted}"><strong>Не путать:</strong> ${escapeHtml(term.disambiguation)}</p>` : ''}
                  <p style="margin:10px 0 0;${contentStyles.body}">${escapeHtml(term.definition)}</p>
                  ${term.simple ? `<p style="margin-top:6px;${contentStyles.body}"><strong>Просто:</strong> ${escapeHtml(term.simple)}</p>` : ''}
                  ${term.formula ? `<p style="margin-top:6px;${contentStyles.muted}"><strong>Формула:</strong> <code>${escapeHtml(term.formula)}</code></p>` : ''}
                  ${term.useWhen ? `<p style="margin-top:6px;${contentStyles.muted}"><strong>Практика:</strong> ${escapeHtml(term.useWhen)}</p>` : ''}
                  ${(term.caveats || []).length ? `<ul style="margin:8px 0 0;padding-left:20px;${contentStyles.muted}">${term.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join('')}</ul>` : ''}
                  ${(term.aliases || []).length ? `<p style="margin-top:6px;${contentStyles.muted}"><strong>Также ищут:</strong> ${term.aliases.map((alias) => escapeHtml(`${alias.value}${alias.scope ? ` (${alias.scope})` : ''}`)).join(', ')}</p>` : ''}
                  ${(term.relatedIds || []).length ? `<p style="margin-top:6px;${contentStyles.muted}"><strong>Связанные:</strong> ${term.relatedIds.map((relatedId) => `<a href="#term-${escapeStructuredId(relatedId)}">${escapeHtml(relatedId)}</a>`).join(' · ')}</p>` : ''}
                  ${termSources.length ? `<p style="margin-top:8px;${contentStyles.muted}"><strong>Официальные источники:</strong> ${termSources.map((source) => `<a href="${escapeHtml(source.url)}" rel="noopener noreferrer">${escapeHtml(source.publisher)}</a>`).join(' · ')} · проверено ${escapeHtml(term.reviewedAt)}</p>` : ''}
                </details>`;
            }).join('')}
          </div>
        </section>`;
    })
    .join('');
}

function renderServicePageSections(config) {
  const testimonialContent = config.service === 'meta-apps'
    ? config.metaAppsTestimonials
    : config.defaultTestimonials;
  return [
    { heading: null, bodyHtml: renderHeroBodyHtml(config.hero) },
    {
      heading: config.services.titlePrefix ? `${config.services.titlePrefix} ${config.services.titleAccent}` : 'Что входит',
      bodyHtml: `${renderBadgeHtml(config.services.badge)}<p style="${contentStyles.body};margin-bottom:14px">${escapeHtml(config.services.description)}</p>${renderServiceCardsHtml(config.services.cards)}`,
    },
    {
      heading: config.cases.titlePrefix ? `${config.cases.titlePrefix} ${config.cases.titleAccent}` : 'Кейсы',
      bodyHtml: `${renderBadgeHtml(config.cases.badge)}<p style="${contentStyles.body};margin-bottom:14px">${escapeHtml(config.cases.description)}</p>${renderCaseItemsHtml(config.cases.items)}`,
    },
    {
      heading: config.cta.title,
      bodyHtml: `${renderBadgeHtml(config.cta.badge)}<p style="${contentStyles.body}">${escapeHtml(config.cta.description)}</p>${renderActionLabelsHtml([config.cta.button])}`,
    },
    {
      heading: [testimonialContent.titlePrefix, testimonialContent.titleAccent].filter(Boolean).join(' ') || 'Отзывы клиентов',
      bodyHtml: renderTestimonialsSection({ ...testimonialContent, stats: config.defaultTestimonialsStats }, config.testimonialItems),
    },
    {
      heading: [config.contact.titlePrefix, config.contact.titleAccent].filter(Boolean).join(' ') || 'Обсудить задачу',
      bodyHtml: `${renderBadgeHtml(config.contact.badge)}<p style="${contentStyles.body};margin-bottom:10px">${escapeHtml(config.contact.description)}</p><ul style="margin:0;padding-left:20px;${contentStyles.body}">${config.contact.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`,
    },
  ];
}

function renderHomeSections(content, latestArticles) {
  const sections = [
    { heading: null, bodyHtml: renderHeroBodyHtml(content.hero) },
    {
      heading: [content.services.titlePrefix, content.services.titleAccent].filter(Boolean).join(' ') || 'Услуги',
      bodyHtml: `${renderBadgeHtml(content.services.badge)}<p style="${contentStyles.body};margin-bottom:14px">${escapeHtml(content.services.description)}</p>${renderServiceCardsHtml(content.services.cards)}`,
    },
    {
      heading: [content.cases.titlePrefix, content.cases.titleAccent].filter(Boolean).join(' ') || 'Кейсы',
      bodyHtml: `${renderBadgeHtml(content.cases.badge)}<p style="${contentStyles.body};margin-bottom:14px">${escapeHtml(content.cases.description)}</p>${renderCaseItemsHtml(content.cases.items)}`,
    },
    {
      heading: content.callToAction.title,
      bodyHtml: `${renderBadgeHtml(content.callToAction.badge)}<p style="${contentStyles.body}">${escapeHtml(content.callToAction.description)}</p>${renderActionLabelsHtml([content.callToAction.button])}`,
    },
    {
      heading: [content.testimonials.titlePrefix, content.testimonials.titleAccent].filter(Boolean).join(' ') || 'Отзывы клиентов',
      bodyHtml: renderTestimonialsSection(content.testimonials, content.testimonialItems),
    },
  ];

  if (latestArticles.length) {
    sections.push({
      heading: 'Последние статьи блога',
      bodyHtml: `<div style="display:grid;gap:10px">${latestArticles
        .slice(0, 6)
        .map((a) => `<a href="${getArticlePath(a)}" style="display:block;${contentStyles.cardBox};color:#f8fafc;text-decoration:none">${escapeHtml(a.title)}</a>`)
        .join('')}</div>`,
    });
  }

  sections.push({
    heading: [content.contact.titlePrefix, content.contact.titleAccent].filter(Boolean).join(' '),
    bodyHtml: `${renderBadgeHtml(content.contact.badge)}<p style="${contentStyles.body}">${escapeHtml(content.contact.description)}</p>${renderBenefitsHtml(content.contact.benefits)}`,
  });

  return sections;
}

function renderLegalSection(reactComponent) {
  const innerHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(reactComponent));
  return [
    {
      heading: null,
      bodyHtml: `<div style="color:rgba(226,232,240,.85);line-height:1.75">${innerHtml}</div><style>h2{margin:22px 0 10px;font-size:18px} ul,ol{padding-left:20px} table{border-collapse:collapse;width:100%} th,td{border:1px solid rgba(255,255,255,.14);padding:8px 10px;text-align:left;font-size:13px} code{background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px}</style>`,
    },
  ];
}

function documentTitle(title) {
  const normalized = String(title || '').trim();
  if (!normalized || normalized === 'Whale Wizard') return normalized || 'Whale Wizard';
  return `${normalized} | Whale Wizard`;
}

function heroHeading(hero = {}) {
  if (Array.isArray(hero.titleLines) && hero.titleLines.length > 0) {
    const lines = hero.titleLines.map((line) => String(line?.text || '').trim()).filter(Boolean);
    if (lines.length > 0) return lines.join(' ');
  }
  return [hero.titlePrefix, hero.titleAccent].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

const SERVICE_TYPE_LABELS = {
  'meta-ads': 'Реклама в Meta Ads',
  'meta-apps': 'Реклама мобильных приложений в Meta Ads',
  'google-ads': 'Реклама в Google Ads',
  consult: 'Консультация по контекстной и таргетированной рекламе',
};

const BREADCRUMB_LABELS = {
  '/blog': 'Блог',
  '/cases': 'Кейсы',
  '/faq': 'Вопросы и ответы',
  '/marketing-glossary': 'Словарь маркетинга',
  '/calculator': 'Калькулятор бюджета',
  '/roi-calculator': 'Калькулятор ROI',
  '/privacy-policy': 'Политика конфиденциальности',
  '/offer': 'Публичная оферта',
  '/cookie-policy': 'Политика cookie',
};

function renderStaticPages(baseHtml, { content, latestArticles, publishedContent = {} }) {
  const serviceStaticPage = (service) => {
    const sourceConfig = content.pageConfigs[service];
    if (!sourceConfig) throw new Error(`Missing page config for ${service}`);
    const contentKey = `service:${service}`;
    const publishedOverride = publishedContent[contentKey] ?? null;
    const config = {
      ...mergePublishedContent(sourceConfig, publishedOverride),
      service,
      defaultTestimonials: content.defaultTestimonialsContent,
      defaultTestimonialsStats: content.defaultTestimonialsStats,
      metaAppsTestimonials: content.META_APPS_TESTIMONIAL_CONTENT,
      testimonialItems: content.testimonialsData,
    };

    const route = `/${service}`;
    const serviceName = String(config.seo.title || '').trim() || heroHeading(config.hero);

    return {
      route,
      title: documentTitle(config.seo.title),
      description: config.seo.description,
      h1: heroHeading(config.hero),
      hero: config.hero,
      lead: config.hero.paragraphs.map((paragraph) => String(paragraph)).join(' '),
      sections: renderServicePageSections(config),
      siteContentSeed: { key: contentKey, content: publishedOverride },
      breadcrumbName: serviceName,
      extraJsonLd: [
        buildServiceJsonLd(route, {
          name: serviceName,
          description: config.seo.description,
          serviceType: SERVICE_TYPE_LABELS[service] || serviceName,
        }),
      ],
    };
  };

  const homeOverride = publishedContent['site:home'];
  const homeContent = {
    hero: mergePublishedContent(content.defaultHeroContent, homeOverride?.hero),
    services: mergePublishedContent(content.defaultServicesContent, homeOverride?.services),
    cases: mergePublishedContent(content.defaultCasesContent, homeOverride?.cases),
    callToAction: mergePublishedContent(content.defaultCallToActionContent, homeOverride?.callToAction),
    testimonials: mergePublishedContent({
      ...content.defaultTestimonialsContent,
      stats: content.defaultTestimonialsStats,
    }, homeOverride?.testimonials),
    testimonialItems: content.testimonialsData,
    contact: mergePublishedContent(content.defaultContactContent, homeOverride?.contact),
  };
  const homeSeo = mergePublishedContent({
    title: 'Google Ads, Meta Ads и аналитика',
    description: 'Настройка и ведение Google Ads и Meta Ads с опорой на аналитику, качество заявок и продажи: GA4, GTM, Meta Pixel, CAPI и данные CRM.',
  }, homeOverride?.seo);
  // Preserve the established home title format when the source default is in
  // use; an explicitly edited SEO title follows the same suffix convention as
  // the client-side SEO component.
  const homeDocumentTitle = homeSeo.title === 'Google Ads, Meta Ads и аналитика'
    ? 'Whale Wizard — Google Ads, Meta Ads и аналитика'
    : documentTitle(homeSeo.title);

  const faqOverride = publishedContent['site:faq'];
  const faqItems = Array.isArray(faqOverride?.items) && faqOverride.items.length > 0
    ? faqOverride.items
    : content.faqs;
  const faqSeo = mergePublishedContent({
    title: content.FAQ_SEO.title,
    description: content.FAQ_SEO.description,
  }, faqOverride?.seo);

  const staticPages = [
    {
      route: '/',
      title: homeDocumentTitle,
      description: homeSeo.description,
      h1: heroHeading(homeContent.hero),
      hero: homeContent.hero,
      lead: homeContent.hero.paragraphs.map((paragraph) => String(paragraph)).join(' '),
      sections: renderHomeSections(homeContent, latestArticles),
      siteContentSeed: { key: 'site:home', content: homeOverride ?? null },
      articleSeed: latestArticles,
    },
    {
      route: '/calculator',
      title: 'Стоимость ведения Google Ads и Meta Ads — расчёт | Whale Wizard',
      description: 'Предварительная оценка стоимости ведения Google Ads и Meta Ads с учётом площадок, рекламного бюджета и основной задачи проекта.',
      h1: 'Оценка стоимости ведения рекламы',
      lead: 'Укажите площадки, рекламный бюджет и задачу проекта. Расчёт даст ориентир, а точная стоимость зависит от аналитики, структуры аккаунта и объёма работ.',
    },
    {
      route: '/roi-calculator',
      title: 'Калькулятор ROAS и ROMI | Whale Wizard',
      description: 'Расчёт ROAS по выручке и ROMI по валовой прибыли на основе рекламного бюджета, среднего чека, маржи и числа оплаченных заказов.',
      h1: 'Калькулятор ROAS и ROMI',
      lead: 'Введите свои данные, чтобы отдельно увидеть отдачу по выручке и по валовой прибыли. Расчёт не учитывает операционные расходы и комиссии.',
    },
    serviceStaticPage('meta-ads'),
    serviceStaticPage('meta-apps'),
    serviceStaticPage('google-ads'),
    serviceStaticPage('consult'),
    {
      route: '/faq',
      title: documentTitle(faqSeo.title),
      description: faqSeo.description,
      h1: content.FAQ_SEO.h1,
      lead: content.FAQ_SEO.lead,
      sections: [{ heading: null, bodyHtml: renderFaqListHtml(faqItems, content.FAQ_CATEGORIES) }],
      siteContentSeed: { key: 'site:faq', content: faqOverride ?? null },
      extraJsonLd: [buildFaqJsonLd(faqItems)],
    },
    {
      route: '/marketing-glossary',
      title: documentTitle(content.MARKETING_GLOSSARY_SEO.title),
      description: content.MARKETING_GLOSSARY_SEO.description,
      h1: content.MARKETING_GLOSSARY_SEO.h1,
      lead: content.MARKETING_GLOSSARY_SEO.lead,
      sections: [{
        heading: null,
        bodyHtml: renderGlossaryListHtml(content.marketingGlossary, content.GLOSSARY_SECTIONS, content.glossarySources),
      }],
      extraJsonLd: [buildGlossaryJsonLd(content.marketingGlossary)],
    },
    {
      route: '/privacy-policy',
      title: 'Политика конфиденциальности | Whale Wizard',
      description: 'Правила обработки персональных данных.',
      h1: 'Политика конфиденциальности',
      lead: `Условия обработки персональных данных. Редакция от ${content.LEGAL_UPDATED_AT}`,
      sections: renderLegalSection(content.PrivacyPolicyContent),
    },
    {
      route: '/offer',
      title: 'Публичная оферта | Whale Wizard',
      description: 'Условия предоставления услуг и порядок взаимодействия.',
      h1: 'Публичная оферта',
      lead: `Официальные условия оказания услуг. Редакция от ${content.LEGAL_UPDATED_AT}`,
      sections: renderLegalSection(content.OfferContent),
    },
    {
      route: '/cookie-policy',
      title: 'Политика cookie | Whale Wizard',
      description: 'Информация о cookie и управлении согласиями.',
      h1: 'Политика cookie',
      lead: `Правила использования cookie и аналитических технологий. Редакция от ${content.LEGAL_UPDATED_AT}`,
      sections: renderLegalSection(content.CookiePolicyContent),
    },
    {
      route: '/thank-you',
      title: 'Спасибо за заявку | Whale Wizard',
      description: 'Страница подтверждения отправки заявки.',
      h1: 'Спасибо за заявку',
      lead: 'Заявка отправлена. Эта служебная страница закрыта от индексации.',
      noIndex: true,
    },
    {
      route: '/admin',
      title: 'Admin | Whale Wizard',
      description: 'Служебная панель управления контентом.',
      h1: 'Admin',
      lead: 'Служебная панель управления контентом. Эта страница закрыта от индексации.',
      noIndex: true,
    },
    {
      // Кадр точного предпросмотра редактора страниц. Без своего каталога
      // iframe получал бы в production 404: SPA-фолбэка в _redirects нет.
      route: '/admin/content-preview',
      title: 'Предпросмотр редактора | Whale Wizard',
      description: 'Служебный предпросмотр редактора страниц.',
      h1: 'Предпросмотр редактора',
      lead: 'Служебный кадр предпросмотра. Эта страница закрыта от индексации.',
      noIndex: true,
    },
  ];

  for (const page of staticPages) {
    const breadcrumbName = page.breadcrumbName || BREADCRUMB_LABELS[page.route];
    const pageJsonLd = [
      ...(page.extraJsonLd || []),
      ...(!page.noIndex && breadcrumbName
        ? [buildStaticBreadcrumbJsonLd(page.route, breadcrumbName)]
        : []),
    ];

    writeRoute(
      page.route,
      htmlTemplate({
        title: page.title,
        description: page.description,
        canonicalPath: page.route,
        noIndex: Boolean(page.noIndex),
        extraJsonLd: pageJsonLd,
        headExtra: [
          page.siteContentSeed
            ? renderSiteContentSeed(page.siteContentSeed.key, page.siteContentSeed.content)
            : '',
          page.articleSeed
            ? renderArticleSeed(page.articleSeed.map(toInlineArticleSummary))
            : '',
        ].filter(Boolean).join('\n'),
        imagePreloads: HERO_PRELOADS[page.route] || [],
        fontPreloads: resolveHeroFontPreloads(page.hero),
        baseHtml,
        bodyHtml: page.route === '/admin/content-preview'
          ? `    <h1 style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">${escapeHtml(page.h1)}</h1>`
          : renderGeneratedShell({
          title: page.h1,
          lead: page.lead,
          hero: page.hero,
          eyebrow: page.noIndex ? 'Служебная страница' : 'Whale Wizard',
          sections: page.sections || [],
        }),
      }),
    );
  }

  return staticPages;
}

function renderArticleListPage({ articles, seedArticles = articles, route, title, description, h1, lead, eyebrow, emptyText }, baseHtml) {
  const articleItems = articles
    .map(
      (article) => `          <a href="${getArticlePath(article)}" style="${generatedShellStyles.item}">
            <strong>${escapeHtml(article.title)}</strong>
            <span style="${generatedShellStyles.muted}">${escapeHtml(article.description)}</span>
          </a>`,
    )
    .join('\n');

  writeRoute(
    route,
    htmlTemplate({
      title,
      description,
      canonicalPath: route,
      extraJsonLd: [buildStaticBreadcrumbJsonLd(route, BREADCRUMB_LABELS[route] || h1)],
      // The generated list and React's first frame use the same build snapshot.
      // Runtime summaries then revalidate it silently after mount.
      headExtra: renderArticleSeed(seedArticles.map(toInlineArticleSummary)),
      baseHtml,
      bodyHtml: renderGeneratedShell({
        title: h1,
        lead,
        eyebrow,
        children: articleItems
          ? `        <div style="${generatedShellStyles.list}">
${articleItems}
        </div>`
          : `        <p style="${generatedShellStyles.lead}">${escapeHtml(emptyText)}</p>`,
      }),
    }),
  );
}

function renderArticlePages(articles, baseHtml) {
  for (const article of articles) {
    const path = getArticlePath(article);
    const articleTitle = `${article.seoTitle || article.title} | Whale Wizard`;
    const articleDescription = article.seoDescription || article.description;
    const articleFaqJsonLd = buildFaqJsonLd(article.faq || []);

    writeRoute(
      path,
      htmlTemplate({
        title: articleTitle,
        description: articleDescription,
        canonicalPath: path,
        ogType: 'article',
        ogImage: article.image,
        articlePublishedTime: toIsoDate(article.publishedAt) || toIsoDate(article.date),
        articleModifiedTime: toIsoDate(article.updatedAt) || toIsoDate(article.publishedAt) || toIsoDate(article.date),
        articleSection: article.category,
        extraJsonLd: [
          buildArticleJsonLd(article),
          buildBreadcrumbJsonLd(article),
          articleFaqJsonLd,
        ],
        // Данные самой статьи едут вместе со страницей. Раньше приложение
        // рисовало текст только после ответа /api/articles — лишний запрос
        // стоял ровно посреди пути к первой отрисовке.
        headExtra: renderArticleSeed(article),
        baseHtml,
        bodyHtml: renderGeneratedShell({
          title: article.title,
          lead: articleDescription,
          eyebrow: article.category,
          children: `        <p style="${generatedShellStyles.articleMeta}"><strong>Дата:</strong> ${escapeHtml(article.date)}${article.readTime ? ` · <strong>Время чтения:</strong> ${escapeHtml(article.readTime)}` : ''}</p>
        <section style="${generatedShellStyles.articleBody}">
${sanitizeArticleHtml(article.content)}
        </section>`,
        }),
      }),
    );
  }
}

function renderBlogPages(articles, baseHtml) {
  const blogArticles = articles.filter((article) => !isCaseArticle(article));
  const caseArticles = articles.filter(isCaseArticle);

  renderArticleListPage({
    articles: blogArticles,
    seedArticles: articles,
    route: '/blog',
    title: 'Блог о рекламе и аналитике | Whale Wizard',
    description: 'Практические материалы о Google Ads, Meta Ads, аналитике и экономике рекламы.',
    h1: 'Решения для реальных задач',
    lead: 'Выберите, что нужно решить. Покажу разборы, которые помогают принять решение, а не пересказывают справку рекламного кабинета.',
    eyebrow: 'Практический блог',
    emptyText: 'Статьи скоро появятся.',
  }, baseHtml);

  renderArticleListPage({
    articles: caseArticles,
    seedArticles: articles,
    route: '/cases',
    title: 'Кейсы рекламных проектов — задачи, решения и результаты | Whale Wizard',
    description: 'Опубликованные проекты Whale Wizard: исходная задача, рекламные каналы, бюджет, ключевые метрики и логика решений.',
    h1: 'Проекты с цифрами и контекстом',
    lead: 'Фильтруйте по нише и каналу. В карточках указаны только опубликованные показатели проекта.',
    eyebrow: 'Кейсы Whale Wizard',
    emptyText: 'Кейсы скоро появятся.',
  }, baseHtml);

  renderArticlePages(articles, baseHtml);
}

function writeSitemap(routes) {
  const uniqueRoutes = [...new Set(routes)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniqueRoutes.map((route) => `  <url><loc>${xmlEscape(`${SITE_URL}${withTrailingSlashIfStaticRoute(route)}`)}</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join('\n')}
</urlset>`;

  writeFileSync(join(DIST_DIR, 'sitemap.xml'), xml, 'utf8');
}

function writeRobots() {
  // `/admin` закрыт от индексации заголовком `noindex` в самой разметке, а не
  // запретом обхода. Причина та же, по которой так же поступили с `/api/*`:
  // запрещённую в robots.txt страницу робот не скачивает и потому не видит
  // `noindex` — и адрес может попасть в выдачу пустым, если на него откуда-то
  // сошлётся ссылка. Разрешённый обход служебной страницы безвреден: там
  // статическая оболочка, а `noindex` робот прочитает и выполнит.
  const robots = `User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml

# AI assistants: machine-readable site context and content index
# ${SITE_URL}/llms.txt
`;

  writeFileSync(join(DIST_DIR, 'robots.txt'), robots, 'utf8');
}

function routeIndexPath(route) {
  return route === '/' ? join(DIST_DIR, 'index.html') : join(DIST_DIR, route.replace(/^\//, ''), 'index.html');
}

function assertFileContains(pathname, markers, label) {
  if (!existsSync(pathname)) throw new Error(`${label} is missing at ${pathname}`);
  const html = readFileSync(pathname, 'utf8');
  const missing = markers.filter((marker) => !html.includes(marker));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required markers: ${missing.join(', ')}`);
  }
}

function validateGeneratedOutput(staticPages = [], latestArticles = []) {
  assertFileContains(routeIndexPath('/'), [
    'facebook-domain-verification',
    'feed.xml',
    'googletagmanager.com',
    'mc.yandex.ru',
    'connect.facebook.net',
    '<div id="root"',
    'type="module"',
    'application/ld+json',
    '"@type":"ProfessionalService"',
    '"@type":"WebSite"',
  ], 'Generated home HTML');

  const metaAppsPage = staticPages.find((page) => page.route === '/meta-apps');
  assertFileContains(routeIndexPath('/meta-apps'), [
    escapeHtml(metaAppsPage?.h1 || ''),
    escapeHtml(metaAppsPage?.description || ''),
    `${SITE_URL}/meta-apps/`,
  ], 'Generated /meta-apps HTML');

  assertFileContains(routeIndexPath('/faq'), [
    'application/ld+json',
    '"@type":"FAQPage"',
  ], 'Generated /faq HTML');

  for (const page of staticPages.filter((candidate) => candidate.siteContentSeed)) {
    const html = readFileSync(routeIndexPath(page.route), 'utf8');
    const seeds = [...html.matchAll(/<script\b[^>]*\bid=["']ww-site-content-seed["'][^>]*>([\s\S]*?)<\/script>/gi)];
    if (seeds.length !== 1) {
      throw new Error(`Generated ${page.route} HTML must contain exactly one site-content seed; found ${seeds.length}.`);
    }

    let seed;
    try {
      seed = JSON.parse(seeds[0][1]);
    } catch {
      throw new Error(`Generated ${page.route} HTML contains an invalid site-content seed.`);
    }
    if (seed?.schemaVersion !== 1 || seed?.key !== page.siteContentSeed.key) {
      throw new Error(`Generated ${page.route} HTML contains a mismatched site-content seed.`);
    }
  }

  assertFileContains(routeIndexPath('/marketing-glossary'), [
    'application/ld+json',
    'id="ld-marketing-glossary"',
    '"@type":"DefinedTermSet"',
    'id="term-meta-app-event-optimization"',
    'id="term-app-tracking-transparency"',
  ], 'Generated /marketing-glossary HTML');

  assertFileContains(routeIndexPath('/cases'), [
    `${SITE_URL}/cases/`,
    'Проекты с цифрами и контекстом',
  ], 'Generated /cases HTML');

  const expectedSummarySlugs = latestArticles.map((article) => article.slug);
  for (const route of ['/', '/blog', '/cases']) {
    const html = readFileSync(routeIndexPath(route), 'utf8');
    const seeds = [...html.matchAll(/<script\b[^>]*\bid=["']ww-article-seed["'][^>]*>([\s\S]*?)<\/script>/gi)];
    if (seeds.length !== 1) {
      throw new Error(`Generated ${route} HTML must contain exactly one article seed; found ${seeds.length}.`);
    }

    let seed;
    try {
      seed = JSON.parse(seeds[0][1]);
    } catch {
      throw new Error(`Generated ${route} HTML contains an invalid article seed.`);
    }

    if (!Array.isArray(seed) || seed.length !== latestArticles.length) {
      throw new Error(`Generated ${route} HTML contains an incomplete article-list seed.`);
    }
    if (seed.some((article) => (
      article?._summary !== true
      || article?.content !== ''
      || Object.keys(article || {}).some((key) => !INLINE_ARTICLE_SUMMARY_KEYS.has(key))
    ))) {
      throw new Error(`Generated ${route} HTML article-list seed must contain summaries only.`);
    }
    if (seed.map((article) => article.slug).join('\n') !== expectedSummarySlugs.join('\n')) {
      throw new Error(`Generated ${route} HTML article-list seed is not synchronized with published articles.`);
    }
  }

  for (const article of latestArticles) {
    const route = getArticlePath(article);
    const html = readFileSync(routeIndexPath(route), 'utf8');
    const seeds = [...html.matchAll(/<script\b[^>]*\bid=["']ww-article-seed["'][^>]*>([\s\S]*?)<\/script>/gi)];
    if (seeds.length !== 1) {
      throw new Error(`Generated ${route} HTML must contain exactly one article seed; found ${seeds.length}.`);
    }
    const seed = JSON.parse(seeds[0][1]);
    if (Array.isArray(seed) || seed?.slug !== article.slug || seed?._summary === true) {
      throw new Error(`Generated ${route} HTML contains a mismatched article detail seed.`);
    }
  }

  assertFileContains(routeIndexPath('/thank-you'), [
    'noindex, nofollow, noarchive',
    `${SITE_URL}/thank-you/`,
  ], 'Generated /thank-you HTML');

  assertFileContains(routeIndexPath('/admin'), [
    'noindex, nofollow, noarchive',
    `${SITE_URL}/admin/`,
  ], 'Generated /admin HTML');

  // Имя файла версионируем: Telegram/соцсети кэшируют превью по URL, и без
  // смены адреса они месяцами показывают старую картинку.
  if (!existsSync(join(DIST_DIR, 'og-image-v2.jpg'))) {
    throw new Error('dist/og-image-v2.jpg is missing. OG image is unavailable.');
  }
}

// Дописывает в dist/llms.txt автогенерируемый индекс всех статей и кейсов,
// чтобы ИИ-ассистенты видели полное оглавление контента без обхода сайта.
function appendLlmsContentIndex(articles) {
  const llmsPath = join(DIST_DIR, 'llms.txt');
  if (!existsSync(llmsPath)) return;

  const lines = [
    '',
    '## 14) Content index (auto-generated at build)',
    '',
    `Generated: ${BUILD_DATE}. Total published items: ${articles.length}.`,
    '',
  ];

  const blogArticles = articles.filter((article) => !isCaseArticle(article));
  const caseArticles = articles.filter((article) => isCaseArticle(article));

  lines.push('### Blog articles');
  for (const article of blogArticles) {
    lines.push(`- ${SITE_URL}${getArticlePath(article)} — ${article.seoTitle || article.title}: ${article.seoDescription || article.description}`);
  }

  if (caseArticles.length > 0) {
    lines.push('', '### Case studies');
    for (const article of caseArticles) {
      lines.push(`- ${SITE_URL}${getArticlePath(article)} — ${article.seoTitle || article.title}: ${article.seoDescription || article.description}`);
    }
  }

  const marker = '## 14) Content index (auto-generated at build)';
  const existing = readFileSync(llmsPath, 'utf8').split(marker)[0].trimEnd();
  writeFileSync(llmsPath, `${existing.trimEnd()}\n${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  ensureDir(DIST_DIR);

  const baseHtml = readViteIndexHtml();
  const articles = normalizeArticles(loadArticles()).filter((article) => isPublishedArticle(article));
  const content = await loadSiteContent();
  const publishedContent = await loadPublishedSiteContent({
    endpoint: PUBLIC_SITE_CONTENT_URL,
    snapshotPath: BUILD_SITE_CONTENT_PATH,
    timeoutMs: SITE_CONTENT_FETCH_TIMEOUT_MS,
    strict: STRICT_SITE_CONTENT,
  });

  // Для блока «Последние статьи блога» — действительно последние по дате,
  // а не первые по порядку массива из админки.
  const latestArticles = [...articles].sort((a, b) =>
    String(resolveArticleDate(b) || '').localeCompare(String(resolveArticleDate(a) || '')));

  const staticPages = renderStaticPages(baseHtml, { content, latestArticles, publishedContent });
  renderBlogPages(latestArticles, baseHtml);
  writeNotFoundPage(baseHtml);

  const articleRoutes = articles.map((article) => getArticlePath(article));
  const allRoutes = [...new Set([...STATIC_ROUTES, ...articleRoutes])];

  writeSitemap(allRoutes);
  writeRobots();
  appendLlmsContentIndex(articles);
  validateGeneratedOutput(staticPages, latestArticles);

  console.log(`✅ Generated ${allRoutes.length} static routes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
