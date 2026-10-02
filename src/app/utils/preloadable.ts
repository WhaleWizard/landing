import { createElement, type ComponentType } from 'react';
import type { MemoizedLoader } from './memoizedImport';

/** Render an already prepared module in the first commit. React.lazy cannot
 * synchronously inspect a fulfilled promise and otherwise commits fallback
 * once more, even after bootstrap has awaited this very same module. */
export function preloadable<P extends object>(
  loader: MemoizedLoader<{ default: ComponentType<P> }>,
): ComponentType<P> {
  let Loaded = loader.resolved?.default;
  let pending: Promise<unknown> | undefined;
  let failed = false;
  let failure: unknown;

  return function PreloadedComponent(props: P) {
    // Ошибка загрузки запоминается насовсем и бросается при следующей отрисовке
    // — так же устроен React.lazy. Сброс перед броском возвращал бы цикл:
    // React сразу повторяет отрисовку, loader() вызывается снова, и страница
    // висит на скелетоне, пока не разрядится телефон. Теперь ошибка доходит до
    // RouteErrorBoundary, который один раз перезагружает страницу на свежую
    // сборку, а при повторном сбое показывает «Страница не загрузилась».
    if (failed) throw failure;
    if (!Loaded) Loaded = loader.resolved?.default;
    if (Loaded) return createElement(Loaded, props);

    if (!pending) {
      // Промис обязан завершиться успешно: отклонённый промис React считает
      // ошибкой самого Suspense и перерисовывает без конца.
      pending = loader().then(
        (module) => { Loaded = module.default; },
        (error: unknown) => { failed = true; failure = error; },
      );
    }
    throw pending;
  };
}
