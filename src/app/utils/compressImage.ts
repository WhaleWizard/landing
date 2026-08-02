/**
 * Сжатие картинки перед загрузкой в медиатеку.
 *
 * Картинки — главный тормоз страниц, а из телефона и с камеры прилетают
 * файлы по 5–10 МБ, которые потом отдаются посетителям как есть. Браузер
 * умеет пережать их сам, поэтому сервер и хранилище остаются нетронутыми:
 * туда приходит уже готовый WebP.
 *
 * Правила осторожности:
 * — GIF не трогаем: анимация схлопнется в один кадр;
 * — если пережатый файл не меньше исходного, возвращаем оригинал;
 * — любая ошибка означает «грузим как есть», а не «не грузим».
 */

const MAX_DIMENSION = 2200;
const QUALITY = 0.82;
const SKIP_TYPES = new Set(['image/gif', 'image/svg+xml']);
/** Мельче этого пережимать бессмысленно: выигрыш меньше погрешности. */
const MIN_BYTES = 120 * 1024;

export interface CompressionResult {
  file: File;
  compressed: boolean;
  savedBytes: number;
}

function replaceExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '') + '.webp';
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
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

export async function compressImage(file: File): Promise<CompressionResult> {
  const asIs: CompressionResult = { file, compressed: false, savedBytes: 0 };
  if (!file.type.startsWith('image/') || SKIP_TYPES.has(file.type)) return asIs;
  if (file.size < MIN_BYTES) return asIs;
  if (typeof document === 'undefined') return asIs;

  try {
    const bitmap = await loadBitmap(file);
    const width = 'width' in bitmap ? bitmap.width : 0;
    const height = 'height' in bitmap ? bitmap.height : 0;
    if (!width || !height) return asIs;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) return asIs;
    context.drawImage(bitmap as CanvasImageSource, 0, 0, targetWidth, targetHeight);
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', QUALITY);
    });
    if (!blob || blob.size >= file.size) return asIs;

    return {
      file: new File([blob], replaceExtension(file.name), { type: 'image/webp', lastModified: Date.now() }),
      compressed: true,
      savedBytes: file.size - blob.size,
    };
  } catch {
    // Пережать не вышло — грузим оригинал, а не теряем файл.
    return asIs;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}
