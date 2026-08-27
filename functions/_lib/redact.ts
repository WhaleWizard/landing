/**
 * Очистка технических сообщений перед показом в админке.
 *
 * Тексты ошибок Meta и наши собственные причины отказа попадают владельцу
 * на экран, а иногда содержат то, чему там не место: токен из адреса запроса,
 * почту или телефон отправителя заявки, хеш идентификатора.
 *
 * Раньше эта чистка существовала в двух копиях — в `admin-lead-quality-status`
 * и в разделе Meta CAPI, — и они успели разойтись: одна уже умела отличать
 * телефон от метки времени, вторая ещё нет. Копий больше нет.
 */

/** Телефон — 9–15 цифр. Меньше — код ошибки, больше — уже не телефон. */
const PHONE_MIN_DIGITS = 9;
const PHONE_MAX_DIGITS = 15;

/** Дата в начале совпадения означает метку времени, а не номер. */
const LOOKS_LIKE_DATE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/;

const PHONE_SHAPED = /\+?\d[\d\s().-]{6,}\d/g;

/**
 * Номер телефона заменяется целиком, а числовые коды и метки времени
 * остаются: именно ради них владелец и открывает сообщение об ошибке.
 */
function hidePhones(text: string): string {
  return text.replace(PHONE_SHAPED, (match) => {
    if (LOOKS_LIKE_DATE.test(match)) return match;
    const digits = match.replace(/\D/g, '').length;
    if (digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) return match;
    return '[телефон скрыт]';
  });
}

export interface RedactOptions {
  /** Обрезка по длине; 0 — не обрезать. */
  maxLength?: number;
  /** Убирать ли из ссылок query string (нужно там, где в тексте бывают URL). */
  stripUrlQuery?: boolean;
}

export function redactSensitiveText(value: unknown, options: RedactOptions = {}): string {
  const { maxLength = 0, stripUrlQuery = false } = options;

  let text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  if (!text) return '';

  text = text
    .replace(/([?&](?:access_token|token|secret|key)=)[^\s&]+/gi, '$1[скрыто]')
    .replace(/(["']?(?:access_token|token|secret|key)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[скрыто]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email скрыт]');

  text = hidePhones(text);

  text = text
    .replace(/\b[a-f0-9]{64}\b/gi, '[идентификатор скрыт]')
    .replace(/\bfb\.1\.\d+\.\d+\b/gi, '[Meta browser id скрыт]');

  if (stripUrlQuery) {
    text = text.replace(/https?:\/\/[^\s]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return '[URL скрыт]';
      }
    });
  }

  return maxLength > 0 ? text.slice(0, maxLength) : text;
}
