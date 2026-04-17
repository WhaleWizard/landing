// netlify/functions/og.js
exports.handler = async (event) => {
  // 1. Получаем User-Agent и проверяем, является ли посетитель роботом
  const userAgent = event.headers['user-agent'] || '';
  const isBot = /Googlebot|YandexBot|Twitterbot|facebookexternalhit|TelegramBot|WhatsApp|Slackbot|Discordbot/i.test(userAgent);

  // 2. Если посетитель НЕ робот (обычный пользователь) -> отдаём React-приложение
  if (!isBot) {
    // Это полный код твоего index.html, вставленный сюда.
    const reactAppHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Сайт Whale Wzrd</title>
    <style>html, body { height: 100%; margin: 0; } #root { height: 100%; }</style>
    <script type="module" crossorigin src="/assets/index-BeLNbxFj.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-Cjo_GnTI.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: reactAppHtml,
    };
  }

  // 3. Если посетитель — робот -> генерируем SEO-страницу
  // --- ТВОЙ СТАРЫЙ КОД ДЛЯ БОТОВ НАЧИНАЕТСЯ ЗДЕСЬ ---
  const path = event.queryStringParameters?.path || '';
  const cleanPath = path.replace(/^\/+/, '');
  const SITE_URL = 'https://whalewzrd.com';
  const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';

  let title = 'Whale Wzrd | Performance-таргетолог';
  let description = 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. Средняя окупаемость — 240%. Бесплатный аудит и стратегия.';
  let image = 'https://whalewzrd.com/og-image.jpg';
  let url = SITE_URL;
  let type = 'website';

  // ... (весь остальной твой код для обработки разных страниц: blog, services, calculator и т.д.) ...
  // !!! ВАЖНО: Не забудь сюда вставить ВЕСЬ твой код, который был ниже, для обработки статей и других страниц.
  // Например, вот часть для главной страницы, а для остальных нужно вставить твои условия.
  if (cleanPath === '' || cleanPath === 'index.html') {
    title = 'Whale Wzrd | Performance-таргетолог';
    description = 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. $2M+ рекламного бюджета, 500 000+ лидов, средняя окупаемость — 240%. Бесплатный аудит и стратегия.';
  } else if (cleanPath === 'blog') {
    title = 'Блог о маркетинге | Whale Wzrd';
    description = 'Экспертные статьи о таргетированной рекламе, стратегиях, аналитике и кейсах. Полезные материалы для роста бизнеса.';
  }
  // ... сюда нужно вставить твои условия для services, calculator, roi-calculator, blog/stati и т.д. ...

  // Формируем SEO-страницу для бота
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="${type}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${url}">
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <p>Пожалуйста, включите JavaScript, чтобы увидеть полную версию сайта.</p>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html,
  };
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
