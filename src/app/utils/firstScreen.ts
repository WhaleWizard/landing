/**
 * Какой маршрут сборка отрисовала в HTML целиком — так, что React может его
 * гидратировать, а не перестраивать.
 *
 * В браузере маркер стоит на `<html data-ww-first-screen="/meta-ads">`: его
 * ставит генератор страниц, а не React, поэтому он не участвует в сверке
 * разметки при гидратации. На сборке (Node) тот же признак приходит через
 * `globalThis.__WW_SSR_ROUTE__` — его выставляет `scripts/ssr-entry.tsx`
 * перед рендером, чтобы первый экран рисовался в «готовом» состоянии: без
 * появлений через motion, которые без JavaScript оставили бы текст невидимым.
 *
 * Только исходная запись истории считается «уже показанной»: переходы внутри
 * сайта и предпросмотр редактора сохраняют свои появления.
 */
declare global {
  // eslint-disable-next-line no-var
  var __WW_SSR_ROUTE__: string | undefined;
}

function normalizeRoute(pathname: string): string {
  const trimmed = String(pathname || '').replace(/\/+$/, '');
  return trimmed || '/';
}

// В браузере маркер читается один раз: он не меняется за жизнь страницы.
// На сборке читается при каждом вызове — один процесс рендерит все страницы
// по очереди и переставляет значение перед каждой.
const browserGeneratedRoute = typeof document === 'undefined'
  ? null
  : (document.documentElement.dataset.wwFirstScreen
    ? normalizeRoute(document.documentElement.dataset.wwFirstScreen)
    : null);
const initialEntryKey = typeof window === 'undefined' ? 'default' : window.history.state?.key || 'default';

/** Маршрут, который страница получила готовым из HTML (или `null`). */
export function generatedFirstScreenRoute(): string | null {
  if (typeof document === 'undefined') {
    return typeof globalThis.__WW_SSR_ROUTE__ === 'string'
      ? normalizeRoute(globalThis.__WW_SSR_ROUTE__)
      : null;
  }
  return browserGeneratedRoute;
}

export function hasGeneratedFirstScreen(pathname: string, locationKey: string): boolean {
  const generatedRoute = generatedFirstScreenRoute();
  return locationKey === initialEntryKey && generatedRoute !== null && generatedRoute === normalizeRoute(pathname);
}
