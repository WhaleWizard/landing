import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` для компонентов, которые рендерятся и на сборке.
 *
 * На сервере эффекты не выполняются вовсе, а React в режиме разработки пишет
 * об этом предупреждение на каждый `useLayoutEffect` — шум в тестах и логах
 * генератора. В браузере это тот же `useLayoutEffect`, поведение не меняется.
 */
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
