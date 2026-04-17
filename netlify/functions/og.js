// netlify/functions/og.js
exports.handler = async (event) => {
  const userAgent = event.headers['user-agent'] || '';
  const isBot = /Googlebot|YandexBot|Twitterbot|facebookexternalhit|TelegramBot|WhatsApp|Slackbot|Discordbot/i.test(userAgent);

  // Если не бот – возвращаем index.html (React-приложение)
  if (!isBot) {
    // Здесь нужно вернуть содержимое вашего index.html
    // Проще всего – перенаправить на реальный index.html
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
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
</html>`
    };
  }

  // Для ботов – генерируем HTML с мета-тегами (ваша старая логика)
  const path = event.queryStringParameters?.path || '';
  const cleanPath = path.replace(/^\/+/, '');
  const SITE_URL = 'https://whalewzrd.com';
  const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';

  let title = 'Whale Wzrd | Performance-таргетолог';
  let description = 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. Средняя окупаемость — 240%. Бесплатный аудит и стратегия.';
  let image = 'https://whalewzrd.com/og-image.jpg';
  let url = SITE_URL;
  let type = 'website';

  // ... (ваша полная логика для статей, услуг и т.д.) ...
  // (здесь должен быть весь ваш код из предыдущей версии og.js)

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
