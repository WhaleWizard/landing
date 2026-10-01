/*
 * Подгонка кегля заголовка до первого кадра.
 *
 * Страница статьи приходит готовой разметкой и гидратируется. Потолок строк
 * заголовка («не больше трёх на телефоне») выполняет `useManagedTitleFit` —
 * но он живёт в React и срабатывает после первого кадра: заголовок в 70
 * знаков рисовался в пять строк, через две секунды ужимался до трёх, и весь
 * текст под ним прыгал вверх (CLS 0,06 на каждой длинной статье).
 *
 * Этот скрипт встраивается генератором в конец <head> страниц с
 * `[data-ww-title-fit]` — после таблиц стилей, чтобы к его запуску стили уже
 * были применены (встроенный скрипт ждёт их сам), — и делает ту же подгонку в
 * момент, когда разборщик дошёл до заголовка: до первого кадра. Алгоритм и константы повторяют `useManagedTitleFit`
 * (`src/app/utils/contentTypography.ts`): тот же подсчёт строк по
 * перекрытию прямоугольников, тот же двоичный поиск от минимума, то же
 * округление — чтобы после гидратации хук пришёл к тому же числу и ничего
 * не сдвинул. Результат помечается `data-ww-title-prefit`: хук понимает,
 * что это его собственный результат, а не авторский размер, и на повороте
 * экрана заголовок снова растёт до CSS.
 *
 * Только ES5 и только DOM: скрипт исполняется до любого бандла.
 */
(function () {
  var doc = document;
  var FIT_ATTR = 'data-ww-title-fit';
  var MIN_ATTR = 'data-ww-title-fit-min';
  var DONE_ATTR = 'data-ww-title-prefit';
  var DESKTOP_MIN_WIDTH = 768;

  function countLines(el) {
    if (!el.textContent || !el.textContent.replace(/\s+/g, '')) return 0;
    var range = doc.createRange();
    range.selectNodeContents(el);
    var rects = Array.prototype.slice.call(range.getClientRects()).filter(function (r) {
      return r.width > 0.5 && r.height > 0.5;
    }).sort(function (a, b) { return a.top - b.top || a.left - b.left; });
    var lines = 0;
    var lineTop = 0;
    var lineBottom = 0;
    for (var i = 0; i < rects.length; i += 1) {
      var top = rects[i].top;
      var bottom = rects[i].bottom;
      if (lines === 0) { lines = 1; lineTop = top; lineBottom = bottom; continue; }
      var overlap = Math.min(lineBottom, bottom) - Math.max(lineTop, top);
      var smaller = Math.min(lineBottom - lineTop, bottom - top);
      if (smaller > 0 && overlap > smaller / 2) {
        lineTop = Math.min(lineTop, top);
        lineBottom = Math.max(lineBottom, bottom);
        continue;
      }
      lines += 1;
      lineTop = top;
      lineBottom = bottom;
    }
    return lines;
  }

  function fits(el, maxLines) {
    if (el.clientWidth <= 0) return true;
    if (el.scrollWidth > el.clientWidth + 1) return false;
    var lines = countLines(el);
    return lines === 0 || lines <= maxLines;
  }

  function fitOne(el) {
    var limits = String(el.getAttribute(FIT_ATTR) || '').split('/');
    var mobile = parseInt(limits[0], 10);
    var desktop = parseInt(limits[1], 10);
    var maxLines = window.innerWidth >= DESKTOP_MIN_WIDTH ? desktop : mobile;
    var minFontSize = Math.max(4, parseFloat(el.getAttribute(MIN_ATTR)) || 8);
    if (!(maxLines > 0) || el.clientWidth <= 0) return;
    var authored = parseFloat(window.getComputedStyle(el).fontSize);
    if (!(authored > 0) || fits(el, maxLines)) return;

    var floor = Math.min(authored, minFontSize);
    el.style.setProperty('font-size', floor + 'px', 'important');
    if (!fits(el, maxLines)) {
      // Даже минимальный кегль не укладывает текст в лимит — хук в этом случае
      // оставляет авторский размер. Делаем то же самое.
      el.style.removeProperty('font-size');
      return;
    }
    var low = floor;
    var high = authored;
    var best = floor;
    for (var i = 0; i < 12 && high - low > 0.1; i += 1) {
      var candidate = (low + high) / 2;
      el.style.setProperty('font-size', candidate + 'px', 'important');
      if (fits(el, maxLines)) { best = candidate; low = candidate; } else { high = candidate; }
    }
    el.style.setProperty('font-size', (Math.floor(best * 10) / 10) + 'px', 'important');
    el.setAttribute(DONE_ATTR, '');
  }

  function stylesReady() {
    var links = doc.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i += 1) {
      if (!links[i].sheet) {
        links[i].addEventListener('load', run);
        return false;
      }
    }
    return true;
  }

  function run() {
    var pending = doc.querySelectorAll('[' + FIT_ATTR + ']:not([' + DONE_ATTR + '])');
    if (!pending.length) return;
    if (!stylesReady()) return;
    for (var i = 0; i < pending.length; i += 1) {
      // Пока у заголовка нет соседа, разборщик ещё внутри него: текст неполный.
      if (pending[i].nextSibling) fitOne(pending[i]);
    }
  }

  if (typeof MutationObserver === 'function') {
    var observer = new MutationObserver(run);
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    doc.addEventListener('DOMContentLoaded', function () {
      run();
      observer.disconnect();
    });
  }
})();
