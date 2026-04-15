// api/og.js
export default async function handler(req, res) {
  // Получаем slug из URL: /api/og?slug=strategii-targetinga-2026
  const { slug } = req.query;
  
  // Публичный URL твоего bin (без ключа)
  const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';
  
  // Значения по умолчанию (для главной или если статья не найдена)
  let meta = {
    title: 'Whale Wzrd | Performance-таргетолог',
    description: 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. Средняя окупаемость — 240%. Бесплатный аудит и стратегия.',
    image: 'https://whalewzrd.com/og-image.jpg',
    url: 'https://whalewzrd.com/'
  };

  // Если передан slug, пытаемся найти статью
  if (slug) {
    try {
      const response = await fetch(BIN_URL);
      const data = await response.json();
      const articles = data.record || [];
      const article = articles.find(a => a.slug === slug);
      if (article) {
        meta = {
          title: `${article.title} | Whale Wzrd`,
          description: article.description,
          image: article.image,
          url: `https://whalewzrd.com/blog/${slug}`
        };
      }
    } catch (error) {
      console.error('Ошибка загрузки статьи:', error);
    }
  }

  // Генерируем HTML только для поисковых роботов
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}">
  <meta property="og:title" content="${escapeHtml(meta.title)}">
  <meta property="og:description" content="${escapeHtml(meta.description)}">
  <meta property="og:image" content="${meta.image}">
  <meta property="og:url" content="${meta.url}">
  <meta property="og:type" content="${slug ? 'article' : 'website'}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${meta.url}">
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <p>${escapeHtml(meta.description)}</p>
  <p>Пожалуйста, включите JavaScript, чтобы увидеть полную версию сайта.</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}

// Простая защита от XSS
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
