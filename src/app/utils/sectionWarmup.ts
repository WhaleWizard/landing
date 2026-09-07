import { useEffect } from 'react';
import type { MemoizedLoader } from './memoizedImport';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

// Собирается внутри эффекта: этот модуль попадает и в сборку генератора
// страниц под Node, где `window` на верхнем уровне модуля не существует.
function intentEvents(): Array<[EventTarget, string]> {
  return [
    [window, 'scroll'],
    [window, 'wheel'],
    [window, 'touchstart'],
    [window, 'keydown'],
    [document, 'pointerdown'],
  ];
}

/**
 * Прогревает код секций ниже первого экрана после первого жеста посетителя.
 *
 * Секции монтируются лениво за 720px до появления на экране. При быстром
 * пролистывании телефон проходит эти 720px быстрее, чем с сети приезжает
 * чанк секции, и на экране на мгновение оказывается пустая заглушка, после
 * чего блок «впрыгивает». Чанки маленькие (10–25 КБ каждый), поэтому после
 * первого скролла или касания их можно скачать заранее: монтирование тогда
 * стоит только отрисовку, а не сеть.
 *
 * Почему не сразу после загрузки: до первого жеста страница ещё рисует хиро и
 * грузит его картинки, а Lighthouse считает время до интерактивности — лишние
 * запросы там только ухудшали бы замер, ничего не давая посетителю, который
 * ещё не начал листать. Загрузка идёт по одному чанку в порядке секций.
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
      for (const [target, type] of events) target.removeEventListener(type, start);
    };

    const warm = async () => {
      for (const loader of loaders) {
        if (cancelled) return;
        try {
          await loader();
        } catch {
          // Сеть подвела — секция попробует сама, когда подойдёт к экрану.
        }
      }
    };

    const start = () => {
      if (started) return;
      started = true;
      detach();
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleHandle = idleWindow.requestIdleCallback(() => { void warm(); }, { timeout: 1_500 });
      } else {
        timerHandle = window.setTimeout(() => { void warm(); }, 200);
      }
    };

    for (const [target, type] of events) target.addEventListener(type, start, { passive: true });

    return () => {
      cancelled = true;
      detach();
      if (idleHandle) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timerHandle) window.clearTimeout(timerHandle);
    };
  }, [loaders]);
}
