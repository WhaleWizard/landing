import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import createDOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';
import {
  DIST_DIR,
  BUILD_ARTICLES_PATH,
  LOCAL_ARTICLES_PATH,
  SITE_URL,
  STATIC_ROUTES,
} from './config.js';

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
    'width', 'height', 'data-ww-block',
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

    return {
      slug: uniqueSlug,
      title: article?.title || `Статья ${index + 1}`,
      content,
      category: article?.category || 'Блог',
      date: article?.date || BUILD_DATE,
      readTime: article?.readTime || '',
      image: article?.image || `${SITE_URL}/og-image.jpg`,
      description: stripHtml(article?.description || content).slice(0, 160),
    };
  });
}

function htmlTemplate({ baseHtml, title, description, canonicalPath, bodyHtml, ogType = 'website', ogImage, noIndex = false }) {
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
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
  html = upsertPropertyMeta(html, 'og:site_name', 'Whale Wzrd');
  html = upsertPropertyMeta(html, 'og:locale', 'ru_RU');
  html = upsertNamedMeta(html, 'twitter:card', 'summary_large_image');
  html = upsertNamedMeta(html, 'twitter:title', title);
  html = upsertNamedMeta(html, 'twitter:description', description);
  html = upsertNamedMeta(html, 'twitter:image', imageUrl);
  html = upsertNamedMeta(html, 'twitter:url', canonicalUrl);
  html = upsertCanonical(html, canonicalUrl);

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

function renderGeneratedShell({ eyebrow = 'Whale Wzrd', title, lead, children = '' }) {
  return `    <main style="${generatedShellStyles.main}">
      <section style="${generatedShellStyles.card}">
        <p style="${generatedShellStyles.eyebrow}">${escapeHtml(eyebrow)}</p>
        <h1 style="${generatedShellStyles.title}">${escapeHtml(title)}</h1>
        <p style="${generatedShellStyles.lead}">${escapeHtml(lead)}</p>
${children}
        <div style="${generatedShellStyles.footer}" aria-hidden="true"><span style="${generatedShellStyles.dot}"></span><span>Загружаем интерактивную версию сайта…</span></div>
      </section>
    </main>`;
}

function renderStaticPages(baseHtml) {
  const staticPages = [
    {
      route: '/',
      title: 'Whale Wzrd | Performance-таргетолог',
      description: 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. $2M+ рекламного бюджета, 500 000+ лидов, средняя окупаемость — 240%. Бесплатный аудит и стратегия.',
      h1: 'Performance-таргетолог',
      lead: 'Настраиваю и масштабирую рекламу в Google Ads и Meta Ads с фокусом на заявки, продажи и окупаемость.',
    },
    {
      route: '/calculator',
      title: 'Калькулятор рекламы | Whale Wzrd',
      description: 'Калькулятор бюджета и стоимости рекламных работ.',
      h1: 'Калькулятор рекламы',
      lead: 'Оценка бюджета и стоимости работ.',
    },
    {
      route: '/roi-calculator',
      title: 'Калькулятор ROAS и ROMI | Whale Wzrd',
      description: 'Расчёт окупаемости рекламы по ключевым метрикам.',
      h1: 'Калькулятор ROAS и ROMI',
      lead: 'Прогноз окупаемости рекламных кампаний и unit-экономики.',
    },
    {
      route: '/meta-ads',
      title: 'Платный трафик из Meta Ads (Facebook/Instagram) | Whale Wzrd',
      description: 'Стабильные заявки из Facebook и Instagram без слива бюджета. Настрою Meta Ads по системе: оффер, креативы, Pixel, CAPI и оптимизация лидов.',
      h1: 'Платный трафик из Meta Ads',
      lead: 'Уникальная страница услуги Meta Ads: Facebook/Instagram, креативы, Pixel/CAPI, ретаргетинг и заявка на аудит Meta Ads.',
    },
    {
      route: '/google-ads',
      title: 'Контекстная реклама Google Ads | Whale Wzrd',
      description: 'Настрою Google Ads, который приносит клиентов из горячего спроса. Search, Shopping, Performance Max, YouTube, аналитика и оптимизация CPA/ROAS.',
      h1: 'Контекстная реклама Google Ads',
      lead: 'Уникальная страница услуги Google Ads: Search, Shopping, Performance Max, аналитика, оптимизация CPA/ROAS и заявка на аудит.',
    },
    {
      route: '/consult',
      title: 'Консультация для таргетологов | Whale Wzrd',
      description: 'Личная консультация для таргетологов: позиционирование, упаковка услуг, поиск клиентов, оффер, продажи и план роста дохода.',
      h1: 'Консультация для таргетологов',
      lead: 'Уникальная страница консультации: упаковка специалиста, поиск клиентов, продажи и заявка на личный разбор.',
    },
    {
      route: '/meta-apps',
      title: 'Трафик для приложений из Meta Ads (Facebook/Instagram) | Whale Wzrd',
      description: 'Привлекаю установки и целевые события в мобильных приложениях через Meta Ads: App Install, App Events, MMP/SKAN, креативы и масштабирование.',
      h1: 'Трафик для приложений из Meta Ads',
      lead: 'Уникальная страница app growth: установки, app events, MMP/SKAN, mobile-креативы и масштабирование по KPI приложения.',
    },
    {
      route: '/faq',
      title: 'FAQ по рекламе | Whale Wzrd',
      description: 'Ответы по бюджетам, срокам, аналитике и масштабированию.',
      h1: 'FAQ по рекламе',
      lead: 'Практические ответы по Google Ads, Meta Ads, GEO и AEO.',
    },
    {
      route: '/marketing-glossary',
      title: 'Словарь маркетинговых метрик | Whale Wzrd',
      description: 'Справочник терминов по SEO, AEO, GEO, аналитике и рекламе.',
      h1: 'Словарь маркетинговых метрик',
      lead: 'База терминов с простыми объяснениями и формулами.',
    },
    {
      route: '/privacy-policy',
      title: 'Политика конфиденциальности | Whale Wzrd',
      description: 'Правила обработки персональных данных.',
      h1: 'Политика конфиденциальности',
      lead: 'Условия обработки персональных данных.',
    },
    {
      route: '/offer',
      title: 'Публичная оферта | Whale Wzrd',
      description: 'Условия предоставления услуг и порядок взаимодействия.',
      h1: 'Публичная оферта',
      lead: 'Официальные условия оказания услуг.',
    },
    {
      route: '/cookie-policy',
      title: 'Политика cookie | Whale Wzrd',
      description: 'Информация о cookie и управлении согласиями.',
      h1: 'Политика cookie',
      lead: 'Правила использования cookie и аналитических технологий.',
    },
    {
      route: '/thank-you',
      title: 'Спасибо за заявку | Whale Wzrd',
      description: 'Страница подтверждения отправки заявки.',
      h1: 'Спасибо за заявку',
      lead: 'Заявка отправлена. Эта служебная страница закрыта от индексации.',
      noIndex: true,
    },
    {
      route: '/admin',
      title: 'Admin | Whale Wzrd',
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
        baseHtml,
        bodyHtml: renderGeneratedShell({
          title: page.h1,
          lead: page.lead,
          eyebrow: page.noIndex ? 'Служебная страница' : 'Whale Wzrd',
        }),
      }),
    );
  }
}

function renderBlogPages(articles, baseHtml) {
  const articleItems = articles
    .map(
      (article) => `          <a href="/blog/${article.slug}" style="${generatedShellStyles.item}">
            <strong>${escapeHtml(article.title)}</strong>
            <span style="${generatedShellStyles.muted}">${escapeHtml(article.description)}</span>
          </a>`,
    )
    .join('\n');

  writeRoute(
    '/blog',
    htmlTemplate({
      title: 'Блог | Whale Wzrd',
      description: 'Статьи про маркетинг, рекламу и аналитику.',
      canonicalPath: '/blog',
      baseHtml,
      bodyHtml: renderGeneratedShell({
        title: 'Блог',
        lead: 'Статьи про маркетинг, рекламу и аналитику.',
        eyebrow: 'Материалы Whale Wzrd',
        children: articleItems
          ? `        <div style="${generatedShellStyles.list}">
${articleItems}
        </div>`
          : `        <p style="${generatedShellStyles.lead}">Статьи скоро появятся.</p>`,
      }),
    }),
  );

  for (const article of articles) {
    const path = `/blog/${article.slug}`;

    writeRoute(
      path,
      htmlTemplate({
        title: `${article.title} | Whale Wzrd`,
        description: article.description,
        canonicalPath: path,
        ogType: 'article',
        ogImage: article.image,
        baseHtml,
        bodyHtml: renderGeneratedShell({
          title: article.title,
          lead: article.description,
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

function writeSitemap(routes) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((route) => `  <url><loc>${xmlEscape(`${SITE_URL}${route}`)}</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join('\n')}
</urlset>`;

  writeFileSync(join(DIST_DIR, 'sitemap.xml'), xml, 'utf8');
}

function writeRobots() {
  const robots = `User-agent: *
Allow: /
Disallow: /admin
Sitemap: ${SITE_URL}/sitemap.xml
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
  ], 'Generated home HTML');

  assertFileContains(routeIndexPath('/meta-apps'), [
    'Трафик для приложений из Meta Ads',
    `${SITE_URL}/meta-apps`,
  ], 'Generated /meta-apps HTML');

  assertFileContains(routeIndexPath('/thank-you'), [
    'noindex, nofollow, noarchive',
    `${SITE_URL}/thank-you`,
  ], 'Generated /thank-you HTML');

  assertFileContains(routeIndexPath('/admin'), [
    'noindex, nofollow, noarchive',
    `${SITE_URL}/admin`,
  ], 'Generated /admin HTML');

  assertFileContains(join(DIST_DIR, '_redirects'), [
    '/og-image.jpg /images/meta.jpg 200',
  ], 'Generated redirects');
  if (!existsSync(join(DIST_DIR, 'images', 'meta.jpg'))) {
    throw new Error('dist/images/meta.jpg is missing. OG image rewrite target is unavailable.');
  }
}

function main() {
  ensureDir(DIST_DIR);

  const baseHtml = readViteIndexHtml();
  const articles = normalizeArticles(loadArticles()).filter((article) => isPublishedArticle(article));

  renderStaticPages(baseHtml);
  renderBlogPages(articles, baseHtml);

  const articleRoutes = articles.map((article) => `/blog/${article.slug}`);
  const allRoutes = [...STATIC_ROUTES, ...articleRoutes];

  writeSitemap(allRoutes);
  writeRobots();
  validateGeneratedOutput();

  console.log(`✅ Generated ${allRoutes.length} static routes`);
}

main();
