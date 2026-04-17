import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SITE_URL = 'https://whalewzrd.com';
const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : (m === '<' ? '&lt;' : '&gt;'));
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '');
}

function generateMainPage() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Whale Wzrd | Performance-таргетолог</title>
  <meta name="description" content="Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. $2M+ рекламного бюджета, 500 000+ лидов, средняя окупаемость — 240%. Бесплатный аудит и стратегия.">
  <meta property="og:title" content="Whale Wzrd | Performance-таргетолог">
  <meta property="og:description" content="Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. $2M+ рекламного бюджета, 500 000+ лидов, средняя окупаемость — 240%. Бесплатный аудит и стратегия.">
  <meta property="og:image" content="https://whalewzrd.com/og-image.jpg">
  <meta property="og:url" content="https://whalewzrd.com/">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="https://whalewzrd.com/">
  <style>html, body { height: 100%; margin: 0; } #root { height: 100%; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/assets/index-BeLNbxFj.js"></script>
  <link rel="stylesheet" href="/assets/index-Cjo_GnTI.css">
</body>
</html>`;
}

function generateBlogListPage() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Блог о маркетинге | Whale Wzrd</title>
  <meta name="description" content="Экспертные статьи о таргетированной рекламе, стратегиях, аналитике и кейсах. Полезные материалы для роста бизнеса.">
  <meta property="og:title" content="Блог о маркетинге | Whale Wzrd">
  <meta property="og:description" content="Экспертные статьи о таргетированной рекламе, стратегиях, аналитике и кейсах. Полезные материалы для роста бизнеса.">
  <meta property="og:image" content="https://whalewzrd.com/og-image.jpg">
  <meta property="og:url" content="https://whalewzrd.com/blog">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="https://whalewzrd.com/blog">
  <style>html, body { height: 100%; margin: 0; } #root { height: 100%; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/assets/index-BeLNbxFj.js"></script>
  <link rel="stylesheet" href="/assets/index-Cjo_GnTI.css">
</body>
</html>`;
}

function generateStaticPage(title, description, url) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="https://whalewzrd.com/og-image.jpg">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${escapeHtml(url)}">
  <style>html, body { height: 100%; margin: 0; } #root { height: 100%; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/assets/index-BeLNbxFj.js"></script>
  <link rel="stylesheet" href="/assets/index-Cjo_GnTI.css">
</body>
</html>`;
}

function generateArticlePage(article) {
  const plainDescription = stripHtml(article.description || article.content.slice(0, 160));
  const title = `${article.title} | Whale Wzrd`;
  const url = `${SITE_URL}/blog/${article.slug}`;
  const contentHtml = article.content;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(plainDescription.slice(0, 160))}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(plainDescription.slice(0, 160))}">
  <meta property="og:image" content="${escapeHtml(article.image)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${escapeHtml(url)}">
  <style>html, body { height: 100%; margin: 0; } #root { height: 100%; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/assets/index-BeLNbxFj.js"></script>
  <link rel="stylesheet" href="/assets/index-Cjo_GnTI.css">
  <!-- Контент для индексации (скрыт, но читается ботами) -->
  <div style="display: none;" aria-hidden="true">
    ${contentHtml}
  </div>
</body>
</html>`;
}

function generateSitemap(articles) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/blog</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`;
  articles.forEach(article => {
    xml += `\n  <url><loc>${SITE_URL}/blog/${article.slug}</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
  });
  const staticPages = ['services', 'calculator', 'roi-calculator', 'privacy-policy', 'offer', 'cookie-policy'];
  staticPages.forEach(page => {
    xml += `\n  <url><loc>${SITE_URL}/${page}</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
  });
  xml += `\n</urlset>`;
  return xml;
}

function generateRobotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /admin
Sitemap: ${SITE_URL}/sitemap.xml`;
}

async function generatePages() {
  console.log('📡 Загрузка статей...');
  const res = await fetch(BIN_URL);
  const data = await res.json();
  const articles = data.record || [];
  console.log(`✅ Загружено ${articles.length} статей.`);

  const outputDir = join(__dirname, '..', 'dist');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Главная
  writeFileSync(join(outputDir, 'index.html'), generateMainPage());
  // Блог (список)
  const blogDir = join(outputDir, 'blog');
  if (!existsSync(blogDir)) mkdirSync(blogDir, { recursive: true });
  writeFileSync(join(blogDir, 'index.html'), generateBlogListPage());

  // Статические страницы
  const staticPages = [
    { slug: 'services', title: 'Услуги таргетолога | Whale Wzrd', description: 'Настройка и ведение рекламы в Google Ads и Meta Ads. Стратегия, аналитика, запуск, оптимизация и масштабирование. Бесплатный аудит.', url: `${SITE_URL}/services` },
    { slug: 'calculator', title: 'Калькулятор бюджета рекламы | Whale Wzrd', description: 'Рассчитайте примерную стоимость услуг по настройке Google Ads и Meta Ads. Укажите бюджет и цели – получите цену.', url: `${SITE_URL}/calculator` },
    { slug: 'roi-calculator', title: 'Калькулятор ROAS и ROMI | Whale Wzrd', description: 'Рассчитайте окупаемость рекламы в Google Ads и Meta Ads. Введите бюджет, средний чек, маржинальность и количество заказов.', url: `${SITE_URL}/roi-calculator` },
    { slug: 'privacy-policy', title: 'Политика конфиденциальности | Whale Wzrd', description: 'Условия обработки персональных данных на сайте Whale Wzrd. Минимальный сбор данных, отсутствие ответственности за утечки.', url: `${SITE_URL}/privacy-policy` },
    { slug: 'offer', title: 'Публичная оферта | Whale Wzrd', description: 'Официальный документ, регулирующий условия предоставления услуг по настройке и ведению рекламных кампаний.', url: `${SITE_URL}/offer` },
    { slug: 'cookie-policy', title: 'Политика использования файлов cookie | Whale Wzrd', description: 'Управление cookie на сайте Whale Wzrd. Вы можете контролировать их использование.', url: `${SITE_URL}/cookie-policy` }
  ];

  for (const page of staticPages) {
    const html = generateStaticPage(page.title, page.description, page.url);
    const pageDir = join(outputDir, page.slug);
    if (!existsSync(pageDir)) mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, 'index.html'), html);
  }

  // Статьи
  for (const article of articles) {
    const html = generateArticlePage(article);
    const articleDir = join(outputDir, 'blog', article.slug);
    if (!existsSync(articleDir)) mkdirSync(articleDir, { recursive: true });
    writeFileSync(join(articleDir, 'index.html'), html);
  }

  // sitemap.xml
  writeFileSync(join(outputDir, 'sitemap.xml'), generateSitemap(articles));
  // robots.txt
  writeFileSync(join(outputDir, 'robots.txt'), generateRobotsTxt());

  console.log('🎉 Генерация завершена!');
}

generatePages().catch(console.error);
