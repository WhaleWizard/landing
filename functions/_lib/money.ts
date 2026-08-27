/**
 * Разбор денежных сумм, введённых человеком.
 *
 * Владелец копирует числа из рекламных кабинетов, банка и таблиц, а там они
 * записаны по-разному: «1500.50», «1 500,50», «1,500.50», «$1500». Раньше
 * разбор существовал в трёх копиях — в расходах, в финансах и в клиентах, —
 * и только одна из них умела больше, чем `replace(',', '.')`. Остальные две
 * молча превращали «1 234,56» в ноль, и в отчёте появлялась дырка, которую
 * невозможно объяснить по цифрам на экране.
 *
 * Копий больше нет. Разные валюты этот модуль не пересчитывает и никогда не
 * будет: курсов в системе нет, а придуманный курс — это выдуманное число.
 */

export const MAX_MONEY = 1_000_000_000;

/**
 * Какой знак — разделитель дробной части, определяется по последнему из них:
 * в «1,234.56» дробную часть отделяет точка, в «1.234,56» — запятая.
 */
function normalizeSeparators(cleaned: string): string {
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  return lastComma >= 0 && lastComma > lastDot
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');
}

/** Сумма или `null`, если разобрать нечего. Отрицательные не принимаются. */
export function parseMoney(value: unknown, max: number = MAX_MONEY): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > max) return null;
    return Math.round(value * 100) / 100;
  }

  const cleaned = String(value ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return null;

  const parsed = Number(normalizeSeparators(cleaned));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return Math.round(parsed * 100) / 100;
}

/**
 * То же самое для полей, где «не заполнено» означает ноль, а не «неизвестно».
 * Там, где разница между нулём и незаполненным важна, нужен `parseMoney`.
 */
export function parseMoneyOrZero(value: unknown, max: number = MAX_MONEY): number {
  return parseMoney(value, max) ?? 0;
}

/** Код валюты из трёх латинских букв; иначе — запасной вариант. */
export function normalizeCurrencyCode(value: unknown, fallback = 'USD'): string {
  const text = String(value ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  return text.length === 3 ? text : fallback;
}
