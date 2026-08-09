const NBSP = '\u00A0';

// Предлог, союз или частица в конце строки — самая заметная ошибка русской
// вёрстки заголовка: строка обрывается на «на», «и», «до». Приклеиваем такое
// слово к следующему неразрывным пробелом, тогда перенос уходит в осмысленное
// место и заголовку чаще хватает меньшего числа строк.
const GLUED_WORD = /^[«"“(]*[A-Za-zА-Яа-яЁё]{1,2}$/;

// Тире не начинает новую строку: оно остаётся в конце предыдущей.
const DASH = /^[—–-]+$/;

/**
 * Расставляет неразрывные пробелы в заголовке. Текст не меняется — меняются
 * только места, где браузеру разрешено перенести строку.
 */
export function smartTitleBreaks(value: string): string {
  if (typeof value !== 'string' || !value.includes(' ')) return value;

  const words = value.split(' ');
  let result = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const glued = DASH.test(words[index]) || GLUED_WORD.test(words[index - 1]);
    result += (glued ? NBSP : ' ') + words[index];
  }

  return result;
}
