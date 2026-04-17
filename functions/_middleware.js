// functions/_middleware.js
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  const isBot = /Googlebot|YandexBot|Twitterbot|facebookexternalhit|TelegramBot|WhatsApp|Slackbot|Discordbot/i.test(userAgent);

  // Пропускаем статические файлы и sitemap
  if (url.pathname.startsWith('/assets/') || url.pathname === '/sitemap.xml') {
    return context.next();
  }

  // Боты → отдаём SEO-страницу через функцию og
  if (isBot) {
    const ogUrl = new URL('/og' + url.pathname + url.search, url.origin);
    return context.env.ASSETS.fetch(ogUrl);
  }

  // Обычные пользователи → отдаём index.html (React-приложение)
  const indexPath = new URL('/index.html', url.origin);
  return context.env.ASSETS.fetch(indexPath);
}
