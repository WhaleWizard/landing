import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(__dirname, '..', 'dist');
const DATA_PATH = join(__dirname, '..', 'data', 'articles.json');

const SITE_URL = (process.env.SITE_URL || 'https://whalewzrd.com').replace(/\/$/, '');

const BUILD_DATE = new Date().toISOString().split('T')[0];

const STATIC_ROUTES = ['/', '/blog', '/services', '/calculator', '/privacy-policy'];

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function escapeHtml(str = '') {
  return String(str)
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

function toSlug(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function loadArticles() {
  if (!existsSync(DATA_PATH)) return [];

  try {
    const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    return Array.isArray(data.articles) ? data.articles : [];
  } catch {
    return [];
  }
}

function normalizeArticles(articles) {
  const used = new Set();

  return articles.map((a, i) => {
    let slug = toSlug(a.slug || a.title || `article-${i}`);

    if (used.has(slug)) slug = `${slug}-${i}`;
    used.add(slug);

    return {
      slug,
      title: a.title || `Article ${i + 1}`,
      content: a.content || '<p>No content</p>',
      description: stripHtml(a.description || a.content || '').slice(0, 160),
      category: a.category || 'Blog',
      date: a.date || BUILD_DATE,
      image: a.image || `${SITE_URL}/og-image.jpg`,
    };
  });
}

function html({ title, description, path, body }) {
  const url = `${SITE_URL}${path}`;

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}"/>
<link rel="canonical" href="${url}"/>
</head>
<body>
<div id="root">
${body}
</div>
</body>
</html>`;
}

function writeRoute(route, content) {
  const dir = route === '/' ? DIST_DIR : join(DIST_DIR, route);
  ensureDir(dir);
  writeFileSync(join(dir, 'index.html'), content, 'utf8');
}

function main() {
  ensureDir(DIST_DIR);

  const articles = normalizeArticles(loadArticles());

  // home
  writeRoute(
    '/',
    html({
      title: 'Whale Wzrd',
      description: 'Marketing agency',
      path: '/',
      body: `<h1>Performance Marketing</h1>`,
    })
  );

  // blog index
  writeRoute(
    '/blog',
    html({
      title: 'Blog',
      description: 'Articles',
      path: '/blog',
      body: articles
        .map((a) => `<p><a href="/blog/${a.slug}">${escapeHtml(a.title)}</a></p>`)
        .join(''),
    })
  );

  // articles
  for (const a of articles) {
    writeRoute(
      `/blog/${a.slug}`,
      html({
        title: a.title,
        description: a.description,
        path: `/blog/${a.slug}`,
        body: `<h1>${escapeHtml(a.title)}</h1>${a.content}`,
      })
    );
  }

  // sitemap
  const routes = [
    ...STATIC_ROUTES,
    '/blog',
    ...articles.map((a) => `/blog/${a.slug}`),
  ];

  writeFileSync(
    join(DIST_DIR, 'sitemap.xml'),
    `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map(r => `<url><loc>${SITE_URL}${r}</loc></url>`).join('')}
</urlset>`
  );

  console.log(`✅ Generated ${routes.length} pages`);
}

main();