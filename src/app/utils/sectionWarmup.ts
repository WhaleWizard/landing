import { useEffect } from 'react';
import type { MemoizedLoader } from './memoizedImport';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

// Собирается внутри эффекта: этот модуль попадает и в сборку генератора
// страниц под Node, где `window` на верхнем уровне модуля не существует.
function intentEvents(): Array<[EventTarget, string]> {
  if (typeof window === 'undefined') return [];
  return [
    [window, 'scroll'],
    [window, 'wheel'],
    [window, 'touchstart'],
    [window, 'keydown'],
    [document, 'pointerdown'],
  ];
}

/**
 * Прогревает код секций ниже первого экрана после первого жеста посетителя
 * или через секунду простоя, пока человек читает заголовок.
 *
 * Секции монтируются лениво за 1200px до появления на экране. Чанки маленькие
 * (10–25 КБ каждый), поэтому скачиваются заранее параллельно: монтирование
 * тогда стоит только отрисовку, а не сеть.
 */
export function useWarmSections(loaders: ReadonlyArray<MemoizedLoader<unknown>>): void {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const idleWindow = window as IdleWindow;
    const events = intentEvents();
    let cancelled = false;
    let started = false;
    let idleHandle = 0;
    let timerHandle = 0;

    const detach = () => {
      if (typeof window === 'undefined') return;
      for (const [target, type] of events) {
        try {
          target.removeEventListener(type, start);
        } catch {
          // ignore
        }
      }
    };

    const warm = async () => {
      if (cancelled || typeof window === 'undefined') return;
      // Загружаем чанки секций параллельно, чтобы не устраивать водопад ожидания:
      await Promise.all(loaders.map(async (loader) => {
        if (cancelled || typeof window === 'undefined') return;
        try {
          await loader();
        } catch {
          // Сеть подвела — секция попробует сама, когда подойдёт к экрану.
        }
      }));
    };

    const start = () => {
      if (cancelled || started || typeof window === 'undefined') return;
      started = true;
      detach();
      const currentWindow = window as IdleWindow;
      if (typeof currentWindow.requestIdleCallback === 'function') {
        idleHandle = currentWindow.requestIdleCallback(() => { void warm(); }, { timeout: 1_500 });
      } else if (typeof currentWindow.setTimeout === 'function') {
        timerHandle = currentWindow.setTimeout(() => { void warm(); }, 200);
      }
    };

    for (const [target, type] of events) {
      target.addEventListener(type, start, { passive: true });
    }

    // Если посетитель читает заголовок и ещё не начал листать, через секунду
    // всё равно фоново прогреваем секции в свободный такт браузера:
    const autoWarmTimer = typeof idleWindow.setTimeout === 'function'
      ? idleWindow.setTimeout(start, 1200)
      : 0;

    return () => {
      cancelled = true;
      detach();
      if (typeof window !== 'undefined') {
        if (idleHandle && typeof idleWindow.cancelIdleCallback === 'function') {
          idleWindow.cancelIdleCallback(idleHandle);
        }
        if (timerHandle) idleWindow.clearTimeout(timerHandle);
        if (autoWarmTimer) idleWindow.clearTimeout(autoWarmTimer);
      }
    };
  }, [loaders]);
}
