import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(__dirname, '..', 'dist');
const DATA_PATH = join(__dirname, '..', 'data', 'articles.json');
const SITE_URL = (process.env.SITE_URL || 'https://whalewzrd.com').replace(/\/$/, '');
const BUILD_DATE = new Date().toISOString().split('T')[0];

const STATIC_ROUTES = ['/', '/blog', '/services', '/calculator', '/privacy-policy'];

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

function getViteAssetLinks() {
  const indexPath = join(DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) return '';

  const indexHtml = readFileSync(indexPath, 'utf8');
  const css = [...indexHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
  const scripts = [...indexHtml.matchAll(/<script[^>]+type="module"[^>]*><\/script>/g)].map((m) => m[0]);

  return [...css, ...scripts].join('\n  ');
}

function loadArticles() {
  if (!existsSync(DATA_PATH)) return [];

  try {
    const payload = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    return Array.isArray(payload?.articles) ? payload.articles : [];
  } catch {
    return [];
  }
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

function htmlTemplate({ title, description, canonicalPath, bodyHtml, ogType = 'website', ogImage, assetLinks = '' }) {
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="${escapeHtml(ogType)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImage || `${SITE_URL}/og-image.jpg`)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage || `${SITE_URL}/og-image.jpg`)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <style>.js #seo-static-content { display: none; }</style>
  <script>document.documentElement.classList.add('js');</script>
  ${assetLinks}
</head>
<body>
  <div id="root"></div>
  <main id="seo-static-content">
${bodyHtml}
  </main>
</body>
</html>`;
}

function writeRoute(route, html) {
  const dir = route === '/' ? DIST_DIR : join(DIST_DIR, route.replace(/^\//, ''));
  ensureDir(dir);
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
}

function renderStaticPages(assetLinks) {
  writeRoute(
    '/',
    htmlTemplate({
      title: 'Whale Wzrd | Performance-маркетинг',
      description: 'Настройка и ведение рекламы в Google Ads и Meta Ads.',
      canonicalPath: '/',
      assetLinks,
      bodyHtml: `    <h1>Performance-маркетинг</h1>
    <p>Запуск, оптимизация и масштабирование рекламных кампаний.</p>`,
    }),
  );

  writeRoute(
    '/services',
    htmlTemplate({
      title: 'Услуги | Whale Wzrd',
      description: 'Услуги по запуску и ведению рекламы в Google Ads и Meta Ads.',
      canonicalPath: '/services',
      assetLinks,
      bodyHtml: `    <h1>Услуги</h1>
    <p>Стратегия, настройка и рост рекламных кампаний.</p>`,
    }),
  );

  writeRoute(
    '/calculator',
    htmlTemplate({
      title: 'Калькулятор рекламы | Whale Wzrd',
      description: 'Калькулятор бюджета и стоимости рекламных работ.',
      canonicalPath: '/calculator',
      assetLinks,
      bodyHtml: `    <h1>Калькулятор</h1>
    <p>Оценка бюджета и стоимости работ.</p>`,
    }),
  );

  writeRoute(
    '/privacy-policy',
    htmlTemplate({
      title: 'Политика конфиденциальности | Whale Wzrd',
      description: 'Правила обработки персональных данных.',
      canonicalPath: '/privacy-policy',
      assetLinks,
      bodyHtml: `    <h1>Политика конфиденциальности</h1>
    <p>Условия обработки персональных данных.</p>`,
    }),
  );
}

function renderBlogPages(articles, assetLinks) {
  const articleItems = articles
    .map(
      (article) => `    <article>
      <h2><a href="/blog/${article.slug}">${escapeHtml(article.title)}</a></h2>
      <p>${escapeHtml(article.description)}</p>
    </article>`,
    )
    .join('\n');

  writeRoute(
    '/blog',
    htmlTemplate({
      title: 'Блог | Whale Wzrd',
      description: 'Статьи про маркетинг, рекламу и аналитику.',
      canonicalPath: '/blog',
      assetLinks,
      bodyHtml: `    <h1>Блог</h1>
${articleItems || '    <p>Статьи скоро появятся.</p>'}`,
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
        assetLinks,
        bodyHtml: `    <article>
      <header>
        <h1>${escapeHtml(article.title)}</h1>
        <p>${escapeHtml(article.description)}</p>
        <p><strong>Категория:</strong> ${escapeHtml(article.category)} | <strong>Дата:</strong> ${escapeHtml(article.date)}${article.readTime ? ` | <strong>Время чтения:</strong> ${escapeHtml(article.readTime)}` : ''}</p>
      </header>
      <section>
${article.content}
      </section>
    </article>`,
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

function main() {
  ensureDir(DIST_DIR);

  const assetLinks = getViteAssetLinks();
  const articles = normalizeArticles(loadArticles());

  renderStaticPages(assetLinks);
  renderBlogPages(articles, assetLinks);

  const articleRoutes = articles.map((article) => `/blog/${article.slug}`);
  const allRoutes = [...STATIC_ROUTES, ...articleRoutes];

  writeSitemap(allRoutes);
  writeRobots();

  console.log(`✅ Generated ${allRoutes.length} static routes`);
}

main();
