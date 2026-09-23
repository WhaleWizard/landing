import { variantWidths } from './imageVariants';

/**
 * Подготовка картинки к загрузке в R2: облегчённый оригинал и копии под
 * разные экраны.
 *
 * Картинки — главный тормоз страниц: из генератора и с телефона прилетают
 * файлы по 2–10 МБ, а телефону в ленте блога нужна картинка шириной 480px.
 * Браузер владельца пережимает оригинал в WebP и делает копии ширин из
 * `imageVariants.ts`; сервер кладёт их рядом, а страница сама выбирает
 * подходящую через `srcset`. Пересборка сайта для этого не нужна.
 *
 * Правила осторожности:
 * — GIF и SVG не трогаем: анимация схлопнется, вектор испортится;
 * — пережатый файл не меньше исходного — остаётся оригинал;
 * — любая ошибка означает «грузим как есть», а не «не грузим». Без копий
 *   картинка просто показывается оригиналом, как раньше.
 */

const MAX_DIMENSION = 2200;
const QUALITY = 0.82;
const SKIP_TYPES = new Set(['image/gif', 'image/svg+xml']);
/** Мельче этого оригинал не пережимаем: выигрыш меньше погрешности. */
const MIN_COMPRESS_BYTES = 120 * 1024;
/** Сервер принимает до 15 МБ на запрос; копии не должны вытеснить оригинал. */
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;
const MIN_VARIANT_SOURCE = 16;

export interface PreparedImageUpload {
  file: File;
  /** Размеры оригинала — только когда есть полный набор копий. */
  width?: number;
  height?: number;
  variants: Array<{ width: number; file: File }>;
  compressed: boolean;
  savedBytes: number;
}

type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'image';
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('image decode failed'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(source: Drawable, width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * WebP из холста. Safari до 17-й версии молча отдаёт PNG вместо WebP —
 * такой результат считается неудачей, иначе PNG уехал бы в хранилище под
 * видом WebP.
 */
async function encodeWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
  return blob && blob.type === 'image/webp' ? blob : null;
}

export async function prepareImageUpload(file: File): Promise<PreparedImageUpload> {
  const asIs: PreparedImageUpload = { file, variants: [], compressed: false, savedBytes: 0 };
  if (!file.type.startsWith('image/') || SKIP_TYPES.has(file.type)) return asIs;
  if (typeof document === 'undefined') return asIs;

  let bitmap: ImageBitmap | HTMLImageElement | null = null;
  try {
    bitmap = await decode(file);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (!sourceWidth || !sourceHeight) return asIs;

    // Оригинал: не больше 2200px по длинной стороне и в WebP, если так легче.
    const scale = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    let main = file;
    let width = sourceWidth;
    let height = sourceHeight;
    let top: HTMLCanvasElement | null = null;
    if (scale < 1 || file.size >= MIN_COMPRESS_BYTES) {
      const targetWidth = Math.round(sourceWidth * scale);
      const targetHeight = Math.round(sourceHeight * scale);
      top = drawScaled(bitmap, targetWidth, targetHeight);
      const blob = top ? await encodeWebp(top) : null;
      if (blob && blob.size < file.size) {
        main = new File([blob], `${baseName(file.name)}.webp`, { type: 'image/webp', lastModified: Date.now() });
        width = targetWidth;
        height = targetHeight;
      } else {
        top = null;
      }
    }

    const result: PreparedImageUpload = {
      file: main,
      variants: [],
      compressed: main !== file,
      savedBytes: main !== file ? file.size - main.size : 0,
    };
    if (width < MIN_VARIANT_SOURCE || height < MIN_VARIANT_SOURCE) return result;

    // Копии от крупной к мелкой, каждая из предыдущей: так уменьшение идёт
    // ступенями и мелкая копия не рябит.
    const variants: Array<{ width: number; file: File }> = [];
    let source: Drawable = top && top.width === width ? top : bitmap;
    for (const variantWidth of [...variantWidths(width)].reverse()) {
      const variantHeight = Math.max(1, Math.round((height * variantWidth) / width));
      const canvas = drawScaled(source, variantWidth, variantHeight);
      const blob = canvas ? await encodeWebp(canvas) : null;
      if (!canvas || !blob) return result;
      variants.push({ width: variantWidth, file: new File([blob], `${variantWidth}.webp`, { type: 'image/webp' }) });
      source = canvas;
    }

    const total = variants.reduce((sum, item) => sum + item.file.size, main.size);
    if (total > MAX_TOTAL_BYTES) return result;
    return { ...result, width, height, variants: variants.reverse() };
  } catch {
    // Подготовить не вышло — грузим оригинал, а не теряем файл.
    return asIs;
  } finally {
    if (bitmap && 'close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

/** Поля формы для `/api/admin/upload`: оригинал, его размеры и копии. */
export function appendImageUpload(form: FormData, prepared: PreparedImageUpload): void {
  form.append('file', prepared.file);
  if (!prepared.variants.length || !prepared.width || !prepared.height) return;
  form.append('width', String(prepared.width));
  form.append('height', String(prepared.height));
  for (const variant of prepared.variants) {
    form.append(`variant-${variant.width}`, variant.file, variant.file.name);
  }
}
