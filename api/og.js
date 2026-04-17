export default async function handler(req, res) {
  const { path } = req.query;
  const requestPath = Array.isArray(path) ? path.join('/') : (path || '');
  const cleanPath = requestPath.replace(/^\/+/, '');

  const SITE_URL = 'https://whalewzrd.com';
  const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';

  let meta = {
    title: 'Whale Wzrd | Performance-таргетолог',
    description: 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. Средняя окупаемость — 240%. Бесплатный аудит и стратегия.',
    image: 'https://whalewzrd.com/og-image.jpg',
    url: SITE_URL,
  };

  if (cleanPath === '' || cleanPath === 'index.html') {
    meta.title = 'Whale Wzrd | Performance-таргетолог';
    meta.description = 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. $2M+ рекламного бюджета, 500 000+ лидов, средняя окупаемость — 240%. Бесплатный аудит и стратегия.';
  }
  else if (cleanPath === 'services') {
    meta.title = 'Услуги таргетолога | Whale Wzrd';
    meta.description = 'Настройка и ведение рекламы в Google Ads и Meta Ads. Стратегия, аналитика, запуск, оптимизация и масштабирование. Бесплатный аудит.';
  }
  else if (cleanPath === 'calculator') {
    meta.title = 'Калькулятор бюджета рекламы | Whale Wzrd';
    meta.description = 'Рассчитайте примерную стоимость услуг по настройке Google Ads и Meta Ads. Укажите бюджет и цели – получите цену.';
  }
  else if (cleanPath === 'roi-calculator') {
    meta.title = 'Калькулятор ROAS и ROMI | Whale Wzrd';
    meta.description = 'Рассчитайте окупаемость рекламы в Google Ads и Meta Ads. Введите бюджет, средний чек, маржинальность и количество заказов.';
  }
  else if (cleanPath === 'blog') {
    meta.title = 'Блог о маркетинге | Whale Wzrd';
    meta.description = 'Экспертные статьи о таргетированной рекламе, стратегиях, аналитике и кейсах. Полезные материалы для роста бизнеса.';
  }
  else if (cleanPath.startsWith('blog/')) {
    const slug = cleanPath.replace('blog/', '');
    try {
      const response = await fetch(BIN_URL);
      const data = await response.json();
      const articles = data.record || [];
      const article = articles.find(a => a.slug === slug);
      if (article) {
        meta.title = `${article.title} | Whale Wzrd`;
        meta.description = article.description;
        meta.image = article.image;
        meta.url = `${SITE_URL}/blog/${slug}`;
      } else {
        meta.title = 'Статья не найдена | Whale Wzrd';
        meta.description = 'Запрашиваемая статья не найдена.';
      }
    } catch (err) {
      console.error('Ошибка загрузки статьи:', err);
      meta.title = 'Блог | Whale Wzrd';
      meta.description = 'Статьи о рекламе и маркетинге.';
    }
  }
  else if (cleanPath === 'privacy-policy') {
    meta.title = 'Политика конфиденциальности | Whale Wzrd';
    meta.description = 'Условия обработки персональных данных на сайте Whale Wzrd. Минимальный сбор данных, отсутствие ответственности за утечки.';
  }
  else if (cleanPath === 'offer') {
    meta.title = 'Публичная оферта | Whale Wzrd';
    meta.description = 'Официальный документ, регулирующий условия предоставления услуг по настройке и ведению рекламных кампаний.';
  }
  else if (cleanPath === 'cookie-policy') {
    meta.title = 'Политика использования файлов cookie | Whale Wzrd';
    meta.description = 'Управление cookie на сайте Whale Wzrd. Вы можете контролировать их использование.';
  }

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
  <meta property="og:type" content="${cleanPath.startsWith('blog/') ? 'article' : 'website'}">
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

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}
