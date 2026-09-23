/**
 * Уменьшенные копии картинок, загруженных через админку, — сторона браузера.
 *
 * Админка при загрузке делает WebP-копии нескольких ширин и кладёт их в R2
 * рядом с оригиналом; размеры оригинала записаны в его имени:
 *
 *   оригинал  …/uploads/…/<имя>--<Ш>x<В>.<расширение>
 *   копия     …/uploads/…/<имя>--<Ш>x<В>-<ширина>.webp
 *
 * Поэтому новая статья получает `srcset` и размеры сразу после публикации,
 * без пересборки и без манифеста. Правила повторяют
 * `functions/_lib/image-variants.ts` и `scripts/article-image-manifest.js`;
 * совпадение стережёт `npm run test:image-variants`.
 */

/** Ширины копий; последняя — потолок, крупнее оригинала не масштабируем. */
export const IMAGE_VARIANT_WIDTHS = [480, 768, 1200, 1600] as const;

/** Ширина запасного `src` для браузеров без `srcset` и для предпросмотров. */
const FALLBACK_WIDTH = 1200;

/**
 * Копии бывают только у файлов из нашего хранилища: у чужого адреса с похожим
 * именем их нет, и `srcset` вёл бы на пустоту. Разрешены публичный адрес R2
 * (`*.r2.dev`) и домены сайта — на случай, если хранилище подключат к ним.
 */
const UPLOADED_IMAGE = /^(https:\/\/(?:[a-z0-9-]+\.r2\.dev|(?:[a-z0-9-]+\.)*whalewzrd\.com)\/uploads\/[^?#]+?--(\d{2,5})x(\d{2,5}))\.(?:webp|png|jpe?g|avif)$/i;

export function variantWidths(originalWidth: number): number[] {
  const cap = Math.min(Math.floor(originalWidth), IMAGE_VARIANT_WIDTHS[IMAGE_VARIANT_WIDTHS.length - 1]);
  const widths: number[] = IMAGE_VARIANT_WIDTHS.filter((width) => width < cap);
  widths.push(cap);
  return widths;
}

export type UploadedImage = {
  src: string;
  srcSet: string;
  width: number;
  height: number;
};

export function resolveUploadedImage(url: string | null | undefined): UploadedImage | null {
  const match = UPLOADED_IMAGE.exec(String(url || '').trim());
  if (!match) return null;
  const [, base, rawWidth, rawHeight] = match;
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!width || !height) return null;
  const widths = variantWidths(width);
  const at = (value: number) => `${base}-${value}.webp`;
  const fallbackCandidates = widths.filter((value) => value <= FALLBACK_WIDTH);
  const fallback = fallbackCandidates.length > 0 ? fallbackCandidates[fallbackCandidates.length - 1] : widths[0];
  return {
    src: at(fallback),
    srcSet: widths.map((value) => `${at(value)} ${value}w`).join(', '),
    width,
    height,
  };
}
