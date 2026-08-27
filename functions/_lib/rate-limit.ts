import { getClientIp } from './http';

type RateLimitProfile = {
  windowSeconds: number;
  maxRequests: number;
};

const RATE_LIMIT_PROFILES: Record<string, RateLimitProfile> = {
  default: { windowSeconds: 60, maxRequests: 30 },
  pageview: { windowSeconds: 60, maxRequests: 120 },
  meta_event: { windowSeconds: 60, maxRequests: 120 },
  lead: { windowSeconds: 600, maxRequests: 20 },
  meta_test_event: { windowSeconds: 60, maxRequests: 20 },
  admin: { windowSeconds: 60, maxRequests: 30 },
  // Вход в админку. Человек ошибается паролем несколько раз, перебор пробует
  // тысячи вариантов — окно намеренно длинное, а порог низкий. Профиль
  // отдельный: иначе попытки входа делили бы лимит с обычной работой в
  // админке и перебор выбивал бы владельца из уже открытых разделов.
  admin_login: { windowSeconds: 900, maxRequests: 15 },
  // A cached full PageSpeed pass can legitimately request up to
  // MAX_SITEMAP_URLS * 2 results in one minute. Authentication is still
  // mandatory in the route; this profile only prevents the shared admin
  // limiter from cutting a valid batch off after request 30.
  admin_performance: { windowSeconds: 60, maxRequests: 500 },
  // Планер сохраняется автоматически после каждой паузы в наборе: при живом
  // заполнении недели общий лимит админки в 30 запросов/мин упирался бы в 429
  // прямо во время работы. Роут по-прежнему требует пароль администратора.
  admin_planner: { windowSeconds: 60, maxRequests: 240 },
  // Форма «сообщить, когда откроется» на заглушке закрытой страницы. Отдельный
  // профиль намеренно: общий с заявками лимит означал бы, что бот, долбящий
  // заглушку, отнимает попытки у настоящей заявки с того же адреса.
  page_lock_notify: { windowSeconds: 600, maxRequests: 10 },
};

// Ключ включает номер окна: у каждого окна свой счётчик, который истекает сам.
// Раньше TTL продлевался при каждом запросе, из-за чего счётчик не сбрасывался,
// пока запросы шли чаще windowSeconds, и честный трафик со временем получал 429.
function makeRateLimitCacheKey(scope: string, ip: string, windowIndex: number): Request {
  return new Request(`https://internal-rate-limit.local/${scope}/ip/${ip}/window/${windowIndex}`);
}

export function getRateLimitProfile(scope?: string): RateLimitProfile {
  if (!scope) return RATE_LIMIT_PROFILES.default;
  // Только свой ключ: обычный поиск по объекту нашёл бы и унаследованные
  // свойства, и `getRateLimitProfile('constructor')` вернул бы функцию вместо
  // профиля. Тогда порог стал бы `undefined`, сравнение с ним — всегда ложным,
  // и ограничитель молча выключился бы. Сейчас область вызова всегда своя,
  // но цена проверки — одна строка, а цена ошибки — снятая защита.
  return Object.prototype.hasOwnProperty.call(RATE_LIMIT_PROFILES, scope)
    ? RATE_LIMIT_PROFILES[scope]
    : RATE_LIMIT_PROFILES.default;
}

export async function enforceRateLimit(request: Request, scope = 'default'): Promise<Response | null> {
  const ip = getClientIp(request);
  const cache = caches.default;
  const profile = getRateLimitProfile(scope);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSeconds / profile.windowSeconds);
  const secondsUntilWindowEnd = profile.windowSeconds - (nowSeconds % profile.windowSeconds);
  const key = makeRateLimitCacheKey(scope, ip, windowIndex);

  const existing = await cache.match(key);
  const currentCount = existing ? Number(await existing.text()) || 0 : 0;
  const nextCount = currentCount + 1;

  if (nextCount > profile.maxRequests) {
    // `retryable` здесь не украшение, а условие приёма заявки. Формы считают
    // отказ окончательным, если сервер не сказал обратного: 429 без этого поля
    // означал «покажите человеку английский текст Too many requests и выбросьте
    // заявку». А 429 по определению временный — рядом уже стоит `Retry-After`.
    // Лимит на заявки — двадцать за десять минут с одного адреса, и упереться
    // в него может не только бот: за одним адресом сидят все абоненты
    // мобильного оператора.
    return new Response(JSON.stringify({
      error: 'Too many requests',
      scope,
      retryable: true,
      retry_after: secondsUntilWindowEnd,
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(secondsUntilWindowEnd),
      },
    });
  }

  const counterResponse = new Response(String(nextCount), {
    headers: {
      'Cache-Control': `max-age=${profile.windowSeconds}`,
    },
  });

  await cache.put(key, counterResponse);

  return null;
}
