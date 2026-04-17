exports.handler = async (event) => {
  const SITE_URL = 'https://whalewzrd.com';
  const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';

  try {
    const res = await fetch(BIN_URL);
    const data = await res.json();
    const articles = data.record || [];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/blog</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`;

    articles.forEach(article => {
      xml += `\n  <url><loc>${SITE_URL}/blog/${article.slug}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
    });

    // Добавьте другие статические страницы при необходимости
    const staticPages = ['services', 'calculator', 'roi-calculator', 'privacy-policy', 'offer', 'cookie-policy'];
    staticPages.forEach(page => {
      xml += `\n  <url><loc>${SITE_URL}/${page}</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
    });

    xml += `\n</urlset>`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: 'Error generating sitemap',
    };
  }
};
