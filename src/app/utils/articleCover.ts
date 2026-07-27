// Дефолтная обложка статей — брендовый og-image. Статьи без собственной
// картинки рендерятся с градиентной подложкой, а не с повторяющимся брендом.
export const PLACEHOLDER_IMAGE = '/og-image-v2.jpg';

export function hasCustomCover(image = ''): boolean {
  const value = String(image || '').trim();
  return Boolean(value) && value !== PLACEHOLDER_IMAGE;
}
