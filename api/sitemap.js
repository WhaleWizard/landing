// api/sitemap.js

export default async function handler(req, res) {
  // Устанавливаем заголовок для XML
  res.setHeader('Content-Type', 'application/xml');

  // Базовый URL твоего сайта
  const SITE_URL = 'https://whalewzrd.com';

  // Публичный URL для получения статей (без ключа)
  const ARTICLES_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';

  try {
    // Загружаем данные из jsonbin.io
    const response = await fetch(ARTICLES_URL);
    const data = await response.json();
    const articles = data.record || [];

    // Начинаем формировать XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Главная -->
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Страница блога (список) -->
  <url>
    <loc>${SITE_URL}/blog</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;

    // Добавляем каждую статью
    articles.forEach(article => {
      xml += `
  <url>
    <loc>${SITE_URL}/blog/${article.slug}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    // Добавляем калькуляторы и юридические страницы (можно вынести в массив)
    const staticPages = [
      { loc: '/calculator', priority: 0.7, changefreq: 'monthly' },
      { loc: '/roi-calculator', priority: 0.7, changefreq: 'monthly' },
      { loc: '/privacy-policy', priority: 0.3, changefreq: 'yearly' },
      { loc: '/offer', priority: 0.3, changefreq: 'yearly' },
      { loc: '/cookie-policy', priority: 0.3, changefreq: 'yearly' },
    ];

    staticPages.forEach(page => {
      xml += `
  <url>
    <loc>${SITE_URL}${page.loc}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
    });

    xml += `
</urlset>`;

    res.status(200).send(xml);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating sitemap');
  }
}
