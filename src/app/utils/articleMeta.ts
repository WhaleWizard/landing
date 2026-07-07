// У старых статей readTime хранится как «11», у новых — «11 мин».
// Отображение приводим к единому виду, данные не трогаем (pillar-статья
// защищена от изменений на уровне API).
export function formatReadTime(value = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^\d+$/.test(raw) ? `${raw} мин` : raw;
}
