// Дефолтная обложка статей — брендовый og-image. Статьи без собственной
// картинки рендерятся с градиентной подложкой, а не с повторяющимся брендом.
export const PLACEHOLDER_IMAGE = '/og-image-v2.jpg';

const DEFAULT_COVER_PATTERNS = new Set([
  PLACEHOLDER_IMAGE,
  '/og-image.jpg',
  '/og-image.png',
  'og-image-v2.jpg',
  'og-image.jpg',
  'og-image.png',
]);

export function hasCustomCover(image = ''): boolean {
  const value = String(image || '').trim();
  if (!value) return false;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return !DEFAULT_COVER_PATTERNS.has(value) && !DEFAULT_COVER_PATTERNS.has(normalized);
}
