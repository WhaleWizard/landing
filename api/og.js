// api/og.js
export default async function handler(req, res) {
  const { path } = req.query;
  const requestPath = Array.isArray(path) ? path.join('/') : (path || '');
  const cleanPath = requestPath.replace(/^\/+/, '');
  
  const SITE_URL = 'https://whalewzrd.com';
  const BIN_URL = 'https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest';
  
  let meta = {
    title: 'Whale Wzrd | Performance-таргетолог',
    description: 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. $2M+ рекламного бюджета. Средняя окупаемость — 240%.',
    image: 'https://whalewzrd.com/og-image.jpg',
    url: SITE_URL,
    contentHtml: ''
  };
  
  // -------------------- ГЛАВНАЯ СТРАНИЦА (ВСЕ БЛОКИ) --------------------
  if (cleanPath === '' || cleanPath === 'index.html') {
    meta.title = 'Whale Wzrd | Performance-таргетолог';
    meta.description = 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи. $2M+ рекламного бюджета, 500 000+ лидов, средняя окупаемость — 240%. Бесплатный аудит и стратегия.';
    
    meta.contentHtml = `
      <!-- HERO блок -->
      <div style="margin-bottom: 2rem;">
        <h1>Увеличу поток клиентов через <span style="color: #8b5cf6;">Google Ads & Meta Ads</span></h1>
        <p>Настраиваю рекламу, которая приводит первые заявки уже в период теста и масштабируется в прибыль.</p>
        <ul>
          <li>$2M+ рекламного бюджета в управлении</li>
          <li>500 000+ лидов</li>
          <li>Средняя окупаемость — 240% (e-commerce и B2C)</li>
        </ul>
        <p>Беру на себя всё: стратегия, креативы, аналитика и оптимизация.</p>
      </div>
      
      <!-- УСЛУГИ (Services) -->
      <div style="margin-bottom: 2rem;">
        <h2>Услуги Performance-таргетолога</h2>
        <div style="display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(250px,1fr));">
          <div><strong>Google Ads</strong><br>Настройка и ведение: поиск, YouTube, Google Shopping, ретаргетинг.</div>
          <div><strong>Meta Ads</strong><br>Таргетированная реклама: Facebook, Instagram, ретаргетинг, lookalike.</div>
          <div><strong>Аналитика</strong><br>Google Analytics, Яндекс.Метрика, Meta Pixel, серверный трекинг, A/B тесты.</div>
          <div><strong>Оптимизация</strong><br>CRO, тестирование, масштабирование, аудит, снижение стоимости лида.</div>
        </div>
      </div>
      
      <!-- КЕЙСЫ (Cases) -->
      <div style="margin-bottom: 2rem;">
        <h2>Кейсы с наилучшей результативностью</h2>
        <div style="display: grid; gap: 1rem;">
          <div><strong>Premium Concierge Service (Meta Ads)</strong><br>4 года работы, 65к+ лидов, $1M+ ad spend.</div>
          <div><strong>E-commerce (Google Ads + Meta Ads)</strong><br>120 000+ add to cart, 30 000+ покупок, ROI 210%.</div>
          <div><strong>Инфобизнес (Google Ads + Meta Ads)</strong><br>$600k+ ad spend, CPL до $5, ROI 180%.</div>
          <div><strong>B2C услуги (Google Ads + Meta Ads)</strong><br>50+ проектов, CPL до $25, ROI до 300%.</div>
        </div>
      </div>
      
      <!-- ОТЗЫВЫ (Testimonials) -->
      <div style="margin-bottom: 2rem;">
        <h2>Что говорят мои клиенты</h2>
        <div style="display: grid; gap: 1rem;">
          <div><strong>Светлана, Digital Producer</strong><br>«Мне нравится, что ты вникаешь в проект. По заявкам стало лучше, чем было.»</div>
          <div><strong>Кэтрин, Project Manager</strong><br>«Работаем уже 4 год, результаты устраивают. Твои результаты лучшие.»</div>
          <div><strong>Дмитрий, CEO</strong><br>«Результат есть, заявки есть. Пока все устраивает в сотрудничестве.»</div>
        </div>
      </div>
      
      <!-- КОНТАКТНАЯ ФОРМА -->
      <div style="margin-bottom: 2rem;">
        <h2>Бесплатная консультация</h2>
        <p>Оставьте заявку – я проанализирую ваш бизнес и предложу стратегию роста.</p>
        <p>Связь: Telegram, WhatsApp, email. Отвечаю обычно в течение 24 часов.</p>
      </div>
    `;
  }
  // -------------------- /SERVICES --------------------
  else if (cleanPath === 'services') {
    meta.title = 'Услуги таргетолога | Whale Wzrd';
    meta.description = 'Настройка и ведение рекламы в Google Ads и Meta Ads. Стратегия, аналитика, запуск, оптимизация и масштабирование. Бесплатный аудит.';
    meta.contentHtml = `
      <h2>Услуги Performance-таргетолога</h2>
      <ul>
        <li><strong>Google Ads</strong> – поиск, YouTube, карты, Performance Max</li>
        <li><strong>Meta Ads</strong> – таргетинг, lookalike, ретаргетинг, AI-алгоритмы</li>
        <li><strong>Аналитика</strong> – GA4, GTM, Meta Pixel, Яндекс.Метрика, серверный трекинг</li>
        <li><strong>Оптимизация</strong> – снижение стоимости лида, масштабирование, защита бюджета</li>
      </ul>
      <p>Комплексное управление рекламными кампаниями для максимального результата.</p>
    `;
  }
  // -------------------- КАЛЬКУЛЯТОРЫ --------------------
  else if (cleanPath === 'calculator') {
    meta.title = 'Калькулятор бюджета рекламы | Whale Wzrd';
    meta.description = 'Рассчитайте примерную стоимость услуг по настройке Google Ads и Meta Ads. Укажите бюджет и цели – получите цену.';
    meta.contentHtml = `<p>Калькулятор бюджета рекламы. Выберите платформы, бюджет и цель – узнайте стоимость настройки и ведения.</p>`;
  }
  else if (cleanPath === 'roi-calculator') {
    meta.title = 'Калькулятор ROAS и ROMI | Whale Wzrd';
    meta.description = 'Рассчитайте окупаемость рекламы в Google Ads и Meta Ads. Введите бюджет, средний чек, маржинальность и количество заказов.';
    meta.contentHtml = `<p>Калькулятор окупаемости рекламы. Введите параметры – получите ROAS и ROMI.</p>`;
  }
  // -------------------- БЛОГ --------------------
  else if (cleanPath === 'blog') {
    meta.title = 'Блог о маркетинге | Whale Wzrd';
    meta.description = 'Экспертные статьи о таргетированной рекламе, стратегиях, аналитике и кейсах. Полезные материалы для роста бизнеса.';
    meta.contentHtml = `<p>Читайте статьи о таргетированной рекламе, Google Ads, Meta Ads, аналитике и автоматизации маркетинга.</p>`;
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
        const plainText = article.content.replace(/<[^>]*>/g, '').substring(0, 1000);
        meta.contentHtml = `<h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.description)}</p><div>${escapeHtml(plainText)}...</div>`;
      } else {
        meta.title = 'Статья не найдена | Whale Wzrd';
        meta.description = 'Запрашиваемая статья не найдена.';
        meta.contentHtml = `<p>Статья не найдена.</p>`;
      }
    } catch (err) {
      console.error('Ошибка загрузки статьи:', err);
      meta.title = 'Блог | Whale Wzrd';
      meta.description = 'Статьи о рекламе и маркетинге.';
      meta.contentHtml = `<p>Не удалось загрузить статью. Попробуйте позже.</p>`;
    }
  }
  // -------------------- ЮРИДИЧЕСКИЕ --------------------
  else if (cleanPath === 'privacy-policy') {
    meta.title = 'Политика конфиденциальности | Whale Wzrd';
    meta.description = 'Условия обработки персональных данных на сайте Whale Wzrd. Минимальный сбор данных, отсутствие ответственности за утечки.';
    meta.contentHtml = `<p>Политика конфиденциальности сайта Whale Wzrd.</p>`;
  }
  else if (cleanPath === 'offer') {
    meta.title = 'Публичная оферта | Whale Wzrd';
    meta.description = 'Официальный документ, регулирующий условия предоставления услуг по настройке и ведению рекламных кампаний.';
    meta.contentHtml = `<p>Публичная оферта на оказание услуг.</p>`;
  }
  else if (cleanPath === 'cookie-policy') {
    meta.title = 'Политика использования файлов cookie | Whale Wzrd';
    meta.description = 'Управление cookie на сайте Whale Wzrd. Вы можете контролировать их использование.';
    meta.contentHtml = `<p>Информация об использовании cookie.</p>`;
  }
  // -------------------- ОСТАЛЬНЫЕ (404 -> главная) --------------------
  else {
    meta.title = 'Whale Wzrd | Performance-таргетолог';
    meta.description = 'Настраиваю рекламу в Google Ads и Meta Ads, которая приводит заявки и продажи.';
    meta.contentHtml = `<p>Страница не найдена, но вы можете ознакомиться с услугами и блогом.</p><p><a href="${SITE_URL}">Вернуться на главную</a></p>`;
  }

  // Генерация HTML
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
  <div style="max-width: 1000px; margin: 0 auto; padding: 2rem; font-family: system-ui, -apple-system, sans-serif; line-height: 1.5;">
    ${meta.contentHtml}
    <hr style="margin: 2rem 0;">
    <p style="color: #666; font-size: 0.9rem;">Полная версия сайта с анимациями и калькуляторами доступна в браузере с включенным JavaScript.</p>
  </div>
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
