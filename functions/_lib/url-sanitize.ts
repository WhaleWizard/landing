// Query-параметры вида utm_*/gclid/fbclid/yclid нужны для атрибуции и должны
// сохраняться как есть. Но URL страницы (page_url, referrer, first/last touch)
// приходит от клиента без проверки — если в адресную строку случайно попадёт
// email/телефон/токен (например, через кривую ссылку из письма или чужого
// сервиса), это осядет в CRM-таблице и диагностических логах. Эта функция
// вырезает потенциально чувствительные параметры из query string, оставляя
// остальные (включая всю атрибуцию) нетронутыми.

const SENSITIVE_PARAM_NAME_PATTERN = /email|e-?mail|phone|tel|password|passwd|pwd|secret|token|otp|auth|session|api[-_]?key|credit|card|cvv|ssn/i;

const EMAIL_LIKE_VALUE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeUrlQueryParams(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  for (const key of [...url.searchParams.keys()]) {
    const values = url.searchParams.getAll(key);
    const isSensitiveKey = SENSITIVE_PARAM_NAME_PATTERN.test(key);
    const isSensitiveValue = values.some((value) => EMAIL_LIKE_VALUE_PATTERN.test(value.trim()));
    if (isSensitiveKey || isSensitiveValue) {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
}
