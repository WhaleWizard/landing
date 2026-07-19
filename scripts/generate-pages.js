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
  LOCAL_ARTICLES_PATH,
  SITE_URL,
  STATIC_ROUTES,
} from './config.js';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

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
    'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'loading',
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
};

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
  if (!url) return `${SITE_URL}/og-image.jpg`;
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

function readViteIndexHtml() {
  const indexPath = join(DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error('dist/index.html is missing. Run vite build before generate:pages.');
  }

  return readFileSync(indexPath, 'utf8');
}

function insertBeforeHeadClose(html, tag) {
  if (!html.includes('</head>')) return `${tag}\n${html}`;
  return html.replace('</head>', `  ${tag}\n</head>`);
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
      image: article?.image || `${SITE_URL}/og-image.jpg`,
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
    image: `${SITE_URL}/og-image.jpg`,
    description: 'Настройка и ведение Google Ads и Meta Ads с опорой на аналитику, качество заявок и продажи.',
    email: 'whalewzrd@gmail.com',
    areaServed: ['RU', 'US', 'AE', 'TR', 'EU'],
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
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: [f.answer, ...(f.details || [])].filter(Boolean).join(' '),
      },
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
    image: [toAbsoluteUrl(article.image || '/og-image.jpg')],
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

function renderJsonLdScripts(schemas = []) {
  return schemas
    .filter(Boolean)
    .map((schema) => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`)
    .join('\n  ');
}

function htmlTemplate({ baseHtml, title, description, canonicalPath, bodyHtml, ogType = 'website', ogImage, noIndex = false, extraJsonLd = [] }) {
  const canonicalUrl = `${SITE_URL}${withTrailingSlashIfStaticRoute(canonicalPath)}`;
  const imageUrl = toAbsoluteUrl(ogImage || '/og-image.jpg');
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
  html = upsertNamedMeta(html, 'twitter:card', 'summary_large_image');
  html = upsertNamedMeta(html, 'twitter:title', title);
  html = upsertNamedMeta(html, 'twitter:description', description);
  html = upsertNamedMeta(html, 'twitter:image', imageUrl);
  html = upsertNamedMeta(html, 'twitter:url', canonicalUrl);
  html = upsertCanonical(html, canonicalUrl);
  html = upsertAlternate(html, 'ru', canonicalUrl);
  html = upsertAlternate(html, 'x-default', canonicalUrl);

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
    'font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
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

function renderGeneratedShell({ eyebrow = 'Whale Wizard', title, lead, children = '', sections = [] }) {
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
        <h1 style="${generatedShellStyles.title}">${escapeHtml(title)}</h1>
        <p style="${generatedShellStyles.lead}">${escapeHtml(lead)}</p>
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

function renderHeroBodyHtml(hero) {
  const headline = hero.titlePrefix || hero.titleAccent
    ? `<p style="margin:0 0 14px;font-size:19px;font-weight:800;letter-spacing:-.01em">${escapeHtml(hero.titlePrefix || '')} ${escapeHtml(hero.titleAccent || '')}</p>`
    : '';
  return `${headline}${renderParagraphsHtml(hero.paragraphs)}${renderStatsHtml(hero.stats)}`;
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

function renderFaqListHtml(faqs = []) {
  return faqs
    .map(
      (f) => `
        <details style="${contentStyles.cardBox};margin-bottom:12px">
          <summary style="cursor:pointer;font-weight:700;font-size:15px">${escapeHtml(f.question)}</summary>
          <p style="margin:10px 0 0;${contentStyles.body}">${escapeHtml(f.answer)}</p>
          ${(f.details || []).length ? `<ul style="margin:8px 0 0;padding-left:20px;${contentStyles.body}">${f.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
        </details>`,
    )
    .join('');
}

function renderGlossaryListHtml(terms = []) {
  return `<div style="display:grid;gap:12px">${terms
    .map(
      (t) => `
        <div style="${contentStyles.cardBox}">
          <h3 style="${contentStyles.heading3}">${escapeHtml(t.term)}${t.abbreviation ? ` (${escapeHtml(t.abbreviation)})` : ''} <span style="font-weight:400;${contentStyles.muted}">· ${escapeHtml(t.channel)}</span></h3>
          <p style="${contentStyles.body}">${escapeHtml(t.definition)}</p>
          ${t.simple ? `<p style="margin-top:6px;${contentStyles.body}"><strong>Просто:</strong> ${escapeHtml(t.simple)}</p>` : ''}
          ${t.formula ? `<p style="margin-top:6px;${contentStyles.muted}"><code>${escapeHtml(t.formula)}</code></p>` : ''}
          ${t.seoHint ? `<p style="margin-top:6px;${contentStyles.muted}"><strong>Практика:</strong> ${escapeHtml(t.seoHint)}</p>` : ''}
        </div>`,
    )
    .join('')}</div>`;
}

function renderServicePageSections(config) {
  return [
    { heading: null, bodyHtml: renderHeroBodyHtml(config.hero) },
    {
      heading: config.services.titlePrefix ? `${config.services.titlePrefix} ${config.services.titleAccent}` : 'Что входит',
      bodyHtml: `<p style="${contentStyles.body};margin-bottom:14px">${escapeHtml(config.services.description)}</p>${renderServiceCardsHtml(config.services.cards)}`,
    },
    {
      heading: config.cases.titlePrefix ? `${config.cases.titlePrefix} ${config.cases.titleAccent}` : 'Кейсы',
      bodyHtml: `<p style="${contentStyles.body};margin-bottom:14px">${escapeHtml(config.cases.description)}</p>${renderCaseItemsHtml(config.cases.items)}`,
    },
    { heading: config.cta.title, bodyHtml: `<p style="${contentStyles.body}">${escapeHtml(config.cta.description)}</p>` },
    {
      heading: 'Обсудить задачу',
      bodyHtml: `<p style="${contentStyles.body};margin-bottom:10px">${escapeHtml(config.contact.description)}</p><ul style="margin:0;padding-left:20px;${contentStyles.body}">${config.contact.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`,
    },
  ];
}

function renderHomeSections(content, latestArticles) {
  const sections = [
    { heading: null, bodyHtml: renderHeroBodyHtml(content.hero) },
    { heading: 'Услуги', bodyHtml: renderServiceCardsHtml(content.services.cards) },
    { heading: 'Кейсы', bodyHtml: renderCaseItemsHtml(content.cases.items) },
    { heading: 'Отзывы клиентов', bodyHtml: renderTestimonialsHtml(content.testimonials) },
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

function renderStaticPages(baseHtml, { content, latestArticles }) {
  const serviceStaticPage = (service) => {
    const config = content.pageConfigs[service];
    if (!config) throw new Error(`Missing page config for ${service}`);

    return {
      route: `/${service}`,
      title: `${config.seo.title} | Whale Wizard`,
      description: config.seo.description,
      h1: `${String(config.hero.titlePrefix)} ${String(config.hero.titleAccent)}`,
      lead: config.hero.paragraphs.map((paragraph) => String(paragraph)).join(' '),
      sections: renderServicePageSections(config),
    };
  };

  const staticPages = [
    {
      route: '/',
      title: 'Whale Wizard — Google Ads, Meta Ads и аналитика',
      description: 'Настройка и ведение Google Ads и Meta Ads с опорой на аналитику, качество заявок и продажи: GA4, GTM, Meta Pixel, CAPI и данные CRM.',
      h1: 'Увеличу поток клиентов через Google Ads и Meta Ads',
      lead: content.defaultHeroContent.paragraphs.map((paragraph) => String(paragraph)).join(' '),
      sections: renderHomeSections(
        { hero: content.defaultHeroContent, services: content.defaultServicesContent, cases: content.defaultCasesContent, testimonials: content.testimonialsData },
        latestArticles,
      ),
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
    serviceStaticPage('google-ads'),
    serviceStaticPage('consult'),
    serviceStaticPage('meta-apps'),
    {
      route: '/faq',
      title: 'Вопросы о рекламе, аналитике и продвижении приложений | Whale Wizard',
      description: 'Понятные ответы о Google Ads, Meta Ads, аналитике, бюджетах, запуске рекламы и продвижении мобильных приложений.',
      h1: 'Ответы на вопросы о рекламе и аналитике',
      lead: 'Без универсальных обещаний: что нужно для старта, как оценивается результат и от чего зависят сроки и стоимость.',
      sections: [{ heading: null, bodyHtml: renderFaqListHtml(content.faqs) }],
      extraJsonLd: [buildFaqJsonLd(content.faqs)],
    },
    {
      route: '/marketing-glossary',
      title: 'Словарь рекламных и маркетинговых метрик | Whale Wizard',
      description: 'Понятные определения метрик рекламы, аналитики, CRM и SEO: что означает показатель, как считается и когда полезен.',
      h1: 'Метрики без лишнего жаргона',
      lead: 'Найдите нужный термин, посмотрите формулу и разберитесь, для какого решения показатель действительно полезен.',
      sections: [{ heading: null, bodyHtml: renderGlossaryListHtml(content.marketingGlossary) }],
    },
    {
      route: '/privacy-policy',
      title: 'Политика конфиденциальности | Whale Wizard',
      description: 'Правила обработки персональных данных.',
      h1: 'Политика конфиденциальности',
      lead: 'Условия обработки персональных данных.',
      sections: renderLegalSection(content.PrivacyPolicyContent),
    },
    {
      route: '/offer',
      title: 'Публичная оферта | Whale Wizard',
      description: 'Условия предоставления услуг и порядок взаимодействия.',
      h1: 'Публичная оферта',
      lead: 'Официальные условия оказания услуг.',
      sections: renderLegalSection(content.OfferContent),
    },
    {
      route: '/cookie-policy',
      title: 'Политика cookie | Whale Wizard',
      description: 'Информация о cookie и управлении согласиями.',
      h1: 'Политика cookie',
      lead: 'Правила использования cookie и аналитических технологий.',
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
  ];

  for (const page of staticPages) {
    writeRoute(
      page.route,
      htmlTemplate({
        title: page.title,
        description: page.description,
        canonicalPath: page.route,
        noIndex: Boolean(page.noIndex),
        extraJsonLd: page.extraJsonLd || [],
        baseHtml,
        bodyHtml: renderGeneratedShell({
          title: page.h1,
          lead: page.lead,
          eyebrow: page.noIndex ? 'Служебная страница' : 'Whale Wizard',
          sections: page.sections || [],
        }),
      }),
    );
  }
}

function renderArticleListPage({ articles, route, title, description, h1, lead, eyebrow, emptyText }, baseHtml) {
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
        extraJsonLd: [
          buildArticleJsonLd(article),
          buildBreadcrumbJsonLd(article),
          articleFaqJsonLd,
        ],
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
    route: '/blog',
    title: 'Блог о рекламе и аналитике | Whale Wizard',
    description: 'Практические материалы о Google Ads, Meta Ads, аналитике и экономике рекламы.',
    h1: 'Практика рекламы и аналитики',
    lead: 'Разборы настройки, измерения и решений по данным — без пересказа справки рекламных кабинетов.',
    eyebrow: 'Материалы Whale Wizard',
    emptyText: 'Статьи скоро появятся.',
  }, baseHtml);

  renderArticleListPage({
    articles: caseArticles,
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
  const robots = `User-agent: *
Allow: /
Disallow: /admin
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

function validateGeneratedOutput() {
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

  assertFileContains(routeIndexPath('/meta-apps'), [
    'качественные установки',
    `${SITE_URL}/meta-apps/`,
  ], 'Generated /meta-apps HTML');

  assertFileContains(routeIndexPath('/faq'), [
    'application/ld+json',
    '"@type":"FAQPage"',
  ], 'Generated /faq HTML');

  assertFileContains(routeIndexPath('/cases'), [
    `${SITE_URL}/cases/`,
    'Проекты с цифрами и контекстом',
  ], 'Generated /cases HTML');

  assertFileContains(routeIndexPath('/thank-you'), [
    'noindex, nofollow, noarchive',
    `${SITE_URL}/thank-you/`,
  ], 'Generated /thank-you HTML');

  assertFileContains(routeIndexPath('/admin'), [
    'noindex, nofollow, noarchive',
    `${SITE_URL}/admin/`,
  ], 'Generated /admin HTML');

  // og-image.jpg теперь реальный файл в public/, редирект на images/meta.jpg удалён
  if (!existsSync(join(DIST_DIR, 'og-image.jpg'))) {
    throw new Error('dist/og-image.jpg is missing. OG image is unavailable.');
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

  const existing = readFileSync(llmsPath, 'utf8');
  writeFileSync(llmsPath, `${existing.trimEnd()}\n${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  ensureDir(DIST_DIR);

  const baseHtml = readViteIndexHtml();
  const articles = normalizeArticles(loadArticles()).filter((article) => isPublishedArticle(article));
  const content = await loadSiteContent();

  // Для блока «Последние статьи блога» — действительно последние по дате,
  // а не первые по порядку массива из админки.
  const latestArticles = [...articles].sort((a, b) =>
    String(resolveArticleDate(b) || '').localeCompare(String(resolveArticleDate(a) || '')));

  renderStaticPages(baseHtml, { content, latestArticles });
  renderBlogPages(articles, baseHtml);

  const articleRoutes = articles.map((article) => getArticlePath(article));
  const allRoutes = [...new Set([...STATIC_ROUTES, ...articleRoutes])];

  writeSitemap(allRoutes);
  writeRobots();
  appendLlmsContentIndex(articles);
  validateGeneratedOutput();

  console.log(`✅ Generated ${allRoutes.length} static routes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
