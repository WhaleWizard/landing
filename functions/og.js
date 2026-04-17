// functions/og.js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const userAgent = context.request.headers.get('user-agent') || '';
  const isBot = /Googlebot|YandexBot/i.test(userAgent);
  
  // Если не бот – отдаём React (index.html)
  if (!isBot) {
    return context.env.ASSETS.fetch(context.request);
  }
  
  // Для ботов – простой HTML
  return new Response(`<!DOCTYPE html>
<html>
<head><title>Тест SEO</title><meta name="description" content="Тест"></head>
<body><h1>Привет, бот</h1></body>
</html>`, { headers: { 'Content-Type': 'text/html' } });
}
