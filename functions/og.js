// functions/og.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  const isBot = /Googlebot|YandexBot|Twitterbot|facebookexternalhit|TelegramBot|WhatsApp|Slackbot|Discordbot/i.test(userAgent);

  // 1. Если обычный пользователь – отдаём React-приложение
  if (!isBot) {
    return env.ASSETS.fetch(request);
  }

  // 2. Для ботов генерируем SEO-страницу
  const path = url.pathname.slice(1); // убираем начальный слеш
  const SITE_URL = 'https://whalewzrd.com';
  const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';

  // Дефолтные мета-теги (главная)
  let title = 'Whale Wzrd | Performance-таргетолог';
  let description = 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. $2M+ рекламного бюджета, 500 000+ лидов, средняя окупаемость — 240%. Бесплатный аудит и стратегия.';
  let image = 'https://whalewzrd.com/og-image.jpg';
  let canonicalUrl = SITE_URL;
  let type = 'website';
  let contentHtml = '';

  // Определяем, какая страница запрошена
  if (path === '' || path === 'index.html') {
    // главная – оставляем дефолтные значения
  } 
  else if (path === 'services') {
    title = 'Услуги таргетолога | Whale Wzrd';
    description = 'Настройка и ведение рекламы в Google Ads и Meta Ads. Стратегия, аналитика, запуск, оптимизация и масштабирование. Бесплатный аудит.';
  } 
  else if (path === 'calculator') {
    title = 'Калькулятор бюджета рекламы | Whale Wzrd';
    description = 'Рассчитайте примерную стоимость услуг по настройке Google Ads и Meta Ads. Укажите бюджет и цели – получите цену.';
  } 
  else if (path === 'roi-calculator') {
    title = 'Калькулятор ROAS и ROMI | Whale Wzrd';
    description = 'Рассчитайте окупаемость рекламы в Google Ads и Meta Ads. Введите бюджет, средний чек, маржинальность и количество заказов.';
  } 
  else if (path === 'blog') {
    title = 'Блог о маркетинге | Whale Wzrd';
    description = 'Экспертные статьи о таргетированной рекламе, стратегиях, аналитике и кейсах. Полезные материалы для роста бизнеса.';
  } 
  else if (path.startsWith('blog/')) {
    type = 'article';
    const slug = path.replace('blog/', '');
    try {
      const res = await fetch(BIN_URL);
      const data = await res.json();
      const articles = data.record || [];
      const article = articles.find(a => a.slug === slug);
      if (article) {
        title = `${article.title} | Whale Wzrd`;
        description = article.description;
        image = article.image;
        canonicalUrl = `${SITE_URL}/blog/${slug}`;
        // Добавляем текст статьи для индексации
        const plainText = article.content.replace(/<[^>]*>/g, '').slice(0, 1500);
        contentHtml = `<div>${escapeHtml(plainText)}</div>`;
      } else {
        title = 'Статья не найдена | Whale Wzrd';
        description = 'Запрашиваемая статья не найдена.';
      }
    } catch (err) {
      console.error('Ошибка загрузки статьи:', err);
      title = 'Блог | Whale Wzrd';
      description = 'Статьи о рекламе и маркетинге.';
    }
  } 
  else if (path === 'privacy-policy') {
    title = 'Политика конфиденциальности | Whale Wzrd';
    description = 'Условия обработки персональных данных на сайте Whale Wzrd. Минимальный сбор данных, отсутствие ответственности за утечки.';
  } 
  else if (path === 'offer') {
    title = 'Публичная оферта | Whale Wzrd';
    description = 'Официальный документ, регулирующий условия предоставления услуг по настройке и ведению рекламных кампаний.';
  } 
  else if (path === 'cookie-policy') {
    title = 'Политика использования файлов cookie | Whale Wzrd';
    description = 'Управление cookie на сайте Whale Wzrd. Вы можете контролировать их использование.';
  }

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
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="${type}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonicalUrl}">
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  ${contentHtml}
  <p>Пожалуйста, включите JavaScript, чтобы увидеть полную версию сайта.</p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
