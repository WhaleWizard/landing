// functions/_middleware.js
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  const isBot = /Googlebot|YandexBot|Twitterbot|facebookexternalhit|TelegramBot|WhatsApp|Slackbot|Discordbot/i.test(userAgent);

  // Не трогаем sitemap и статические файлы
  if (url.pathname === '/sitemap.xml' || url.pathname.startsWith('/assets/')) {
    return context.next();
  }

  // Если бот – перенаправляем на функцию og.js с параметром path
  if (isBot) {
    const path = url.pathname.slice(1); // убираем начальный слэш
    const ogUrl = new URL(url.origin + '/og?path=' + encodeURIComponent(path));
    const ogRequest = new Request(ogUrl, request);
    return context.env.ASSETS.fetch(ogRequest);
  }

  // Обычные пользователи – отдаём index.html (SPA)
  return context.next();
}
