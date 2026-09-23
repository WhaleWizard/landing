/**
 * Уменьшенные копии картинок, загруженных через админку.
 *
 * Обложки статей раньше попадали на сайт как есть — PNG по 1–2 МБ — и
 * облегчались только на сборке (`scripts/optimize-article-images.js`). При
 * шестистах статьях и публикации по расписанию сборка не успевает за
 * контентом, поэтому копии делает браузер владельца прямо при загрузке, а
 * сервер кладёт их в R2 рядом с оригиналом.
 *
 * Соглашение об именах — единственный источник знания «какие копии есть»:
 *
 *   оригинал  …/<имя>--<Ш>x<В>.<расширение>
 *   копия     …/<имя>--<Ш>x<В>-<ширина>.webp
 *
 * Размеры в имени дают странице `width`/`height` без запроса к хранилищу, а
 * набор ширин однозначно выводится из ширины оригинала. Файл получает суффикс
 * размеров только вместе с полным набором копий — сервер отклоняет неполный
 * набор, иначе у картинки появился бы `srcset` на несуществующие файлы.
 *
 * Те же правила повторены в `src/app/utils/imageVariants.ts` (браузер) и
 * `scripts/article-image-manifest.js` (сборка); совпадение стережёт
 * `npm run test:image-variants`.
 */

/** Ширины копий; последняя — потолок, крупнее оригинала не масштабируем. */
export const IMAGE_VARIANT_WIDTHS = [480, 768, 1200, 1600] as const;

export const MIN_IMAGE_DIMENSION = 16;
export const MAX_IMAGE_DIMENSION = 10000;

const MAIN_KEY = /--(\d{2,5})x(\d{2,5})\.(?:webp|png|jpe?g|avif)$/i;
const VARIANT_KEY = /--\d{2,5}x\d{2,5}-\d{2,5}\.webp$/i;

export function variantWidths(originalWidth: number): number[] {
  const cap = Math.min(Math.floor(originalWidth), IMAGE_VARIANT_WIDTHS[IMAGE_VARIANT_WIDTHS.length - 1]);
  const widths: number[] = IMAGE_VARIANT_WIDTHS.filter((width) => width < cap);
  widths.push(cap);
  return widths;
}

export function isValidImageDimension(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_IMAGE_DIMENSION && value <= MAX_IMAGE_DIMENSION;
}

export function dimensionSuffix(width: number, height: number): string {
  return `--${width}x${height}`;
}

/** Копия — служебный файл: в медиатеке её не показывают и не трогают отдельно. */
export function isImageVariantKey(key: string): boolean {
  return VARIANT_KEY.test(key);
}

/** Ключ копии нужной ширины для оригинала с суффиксом размеров. */
export function variantKey(mainKey: string, width: number): string | null {
  const match = MAIN_KEY.exec(mainKey);
  if (!match) return null;
  return `${mainKey.slice(0, match.index)}--${match[1]}x${match[2]}-${width}.webp`;
}

/** Все копии оригинала; пусто, если файл загружен без копий. */
export function variantKeysFor(mainKey: string): string[] {
  const match = MAIN_KEY.exec(mainKey);
  if (!match) return [];
  return variantWidths(Number(match[1]))
    .map((width) => variantKey(mainKey, width))
    .filter((key): key is string => Boolean(key));
}
