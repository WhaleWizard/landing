/**
 * Неразрывные пробелы в отображаемом тексте (CL-26, CL-30).
 *
 * Русский набор требует, чтобы тире не начинало строку, а число не
 * разрывалось между разрядами («$810» в конце строки и «000» на следующей),
 * как и название площадки («Meta» / «Ads»). Тексты приходят и из кода, и из
 * CMS, поэтому правило одно и применяется при выводе, а не правкой каждой
 * строки. Меняются только пробелы — буквы и цифры остаются прежними, а в
 * базу ничего не записывается.
 *
 * Функция чистая: на сборке и в браузере результат одинаковый, поэтому
 * гидратация первого экрана не расходится.
 */

const NBSP = ' ';

/** Тире отдельным словом: пробел перед ним становится неразрывным. */
const SPACE_BEFORE_DASH = / ([—–])(?=\s|$)/g;
/** Разряды числа: «810 000», «1 200 000». */
const SPACE_BETWEEN_DIGIT_GROUPS = /(\d) (?=\d{3}(?!\d))/g;
/** Число и валюта, процент или сокращение: «500 USD», «20 %», «3 млн». */
const SPACE_BEFORE_UNIT = /(\d) (?=(?:₽|\$|€|USD|EUR|RUB|UZS|руб\.?|сум|%|млн|млрд|тыс\.?)(?![\p{L}\d]))/gu;
/** Названия площадок и инструментов, которые нельзя разрывать. */
const BRAND_PAIRS = /\b(Meta|Google|Performance|Search|Tag|Events) (Ads|Apps|Pixel|Analytics|Max|Console|Manager)\b/g;

export function typographText(value: string): string {
  if (typeof value !== 'string' || !value.includes(' ')) return value;
  return value
    .replace(SPACE_BEFORE_DASH, `${NBSP}$1`)
    .replace(SPACE_BETWEEN_DIGIT_GROUPS, `$1${NBSP}`)
    .replace(SPACE_BEFORE_UNIT, `$1${NBSP}`)
    .replace(BRAND_PAIRS, (match, first: string, second: string) => (isBrandPair(first, second) ? `${first}${NBSP}${second}` : match));
}

const BRANDS = new Set([
  'Meta Ads', 'Meta Apps', 'Meta Pixel', 'Google Ads', 'Google Analytics', 'Performance Max',
  'Search Console', 'Tag Manager', 'Events Manager',
]);

function isBrandPair(first: string, second: string): boolean {
  return BRANDS.has(`${first} ${second}`);
}

/** Поля текстов сайта, которые не выводятся как текст: адреса, шрифты, эффекты. */
const STRUCTURAL_KEYS = new Set([
  'href', 'to', 'url', 'link', 'src', 'image', 'icon', 'id', 'key', 'slug', 'anchor',
  'font', 'effect', 'speed', 'color', 'typography', 'hiddenSections', 'sectionOrder',
]);

const contentCache = new WeakMap<object, unknown>();

/**
 * Тот же набор правил для всего объекта текстов страницы. Результат для
 * одного и того же объекта кэшируется: React получает стабильную ссылку и не
 * перерисовывает секцию без причины.
 */
export function typographContent<T>(value: T, key = ''): T {
  if (typeof value === 'string') return (STRUCTURAL_KEYS.has(key) ? value : typographText(value)) as T;
  if (!value || typeof value !== 'object' || STRUCTURAL_KEYS.has(key)) return value;
  const cached = contentCache.get(value as object);
  if (cached !== undefined) return cached as T;
  const result = Array.isArray(value)
    ? value.map((item) => typographContent(item, key))
    : Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([field, item]) => [field, typographContent(item, field)]));
  contentCache.set(value as object, result);
  return result as T;
}

/** Теги, внутри которых текст не трогается: код показывается как есть. */
const RAW_TAGS = /^<\s*(\/?)\s*(pre|code|script|style|textarea|kbd|samp)\b/i;

/**
 * Типографика для HTML статьи при выводе. Меняется только текст между
 * тегами, атрибуты и код в `<pre>`/`<code>` остаются как есть. Хранимый
 * текст статьи не меняется: редактор работает с исходником.
 */
export function typographHtml(html: string): string {
  if (typeof html !== 'string' || !html.includes(' ')) return html;
  let rawDepth = 0;
  return html.split(/(<[^>]*>)/).map((part) => {
    if (part.startsWith('<')) {
      const match = RAW_TAGS.exec(part);
      if (match && !part.endsWith('/>')) rawDepth = Math.max(0, rawDepth + (match[1] ? -1 : 1));
      return part;
    }
    return rawDepth > 0 ? part : typographText(part);
  }).join('');
}
