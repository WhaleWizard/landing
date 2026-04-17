// functions/og.js
export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  const isBot = /Googlebot|YandexBot|Twitterbot|facebookexternalhit|TelegramBot|WhatsApp|Slackbot|Discordbot/i.test(userAgent);

  // Если не бот – отдаём обычный index.html (React-приложение)
  if (!isBot) {
    // Получаем статический файл из публичной папки
    return context.env.ASSETS.fetch(request);
  }

  // Для ботов генерируем SEO-страницу
  const path = url.pathname.slice(1); // убираем первый слэш
  // ... (остальная логика генерации HTML, как в предыдущей версии og.js)
  // Но нужно добавить получение статей из jsonbin и т.д.
}
