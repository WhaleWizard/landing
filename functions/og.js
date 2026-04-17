// functions/og.js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const userAgent = context.request.headers.get('user-agent') || '';
  const isBot = /Googlebot|YandexBot|Twitterbot|facebookexternalhit/i.test(userAgent);

  // Если обычный пользователь – отдаём React-приложение
  if (!isBot) {
    return context.env.ASSETS.fetch(context.request);
  }

  // Для ботов – генерируем SEO-страницу
  // Пока просто тестовая страница
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>SEO тест</title>
  <meta name="description" content="Это страница для поисковых роботов">
</head>
<body>
  <h1>Привет, бот!</h1>
  <p>Функция og.js работает.</p>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
