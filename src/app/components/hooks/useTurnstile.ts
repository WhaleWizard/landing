import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Проверка «человек или бот» на формах заявки (Cloudflare Turnstile).
 *
 * Три решения, на которых всё держится:
 *
 * 1. `appearance: 'interaction-only'` — обычный посетитель не видит НИЧЕГО.
 *    Ни белого поля, ни галочки, ни спиннера. Виджет появляется только если
 *    Cloudflare реально захотел проверить человека, и тогда это одна галочка.
 *
 * 2. `execution: 'execute'` — проверка запускается в момент отправки формы, а
 *    не при открытии страницы. Токен всегда свежий (он живёт минуты), и на
 *    посетителя, который до формы не дошёл, работа не тратится.
 *
 * 3. Виджет пересоздаётся перед каждой проверкой, а не сбрасывается через
 *    `turnstile.reset()`. У Turnstile известная особенность: в режиме
 *    interaction-only после reset виджет может остаться скрытым, даже когда
 *    участие человека уже требуется — то есть посетитель упирается в
 *    невидимую стену и не понимает, почему форма не отправляется.
 *
 * Если скрипт не загрузился, хук честно возвращает `unavailable`, а форма
 * показывает человеку запасной путь. Молча терять заявку нельзя.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const DEFAULT_SITE_KEY = '0x4AAAAAAEZQ_DqE3BMc30PD';

/** Столько ждём ответа. С запасом на то, что человек ставит галочку руками. */
const TOKEN_TIMEOUT_MS = 90_000;

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

export type TurnstileStatus = 'idle' | 'ready' | 'unavailable';

function getSiteKey(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_TURNSTILE_SITE_KEY;
  return (fromEnv || '').trim() || DEFAULT_SITE_KEY;
}

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function loadTurnstileScript(): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const win = window as TurnstileWindow;
  if (win.turnstile) return Promise.resolve(win.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi | null>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing || document.createElement('script');

    const done = () => resolve((window as TurnstileWindow).turnstile || null);
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => resolve(null), { once: true });

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  // Неудачную попытку не кэшируем: следующая отправка формы попробует снова.
  void scriptPromise.then((api) => { if (!api) scriptPromise = null; });
  return scriptPromise;
}

export function useTurnstile() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<TurnstileStatus>('idle');

  // Скрипт подтягивается заранее, чтобы отправка не ждала сеть. Если не
  // получилось — не страшно, попробуем ещё раз в момент отправки.
  useEffect(() => {
    let cancelled = false;
    void loadTurnstileScript().then((api) => {
      if (!cancelled) setStatus(api ? 'ready' : 'unavailable');
    });
    return () => { cancelled = true; };
  }, []);

  const removeWidget = useCallback((api: TurnstileApi) => {
    if (!widgetIdRef.current) return;
    try { api.remove(widgetIdRef.current); } catch { /* уже удалён */ }
    widgetIdRef.current = null;
  }, []);

  /**
   * Запускает проверку и ждёт токен. `null` означает «проверка недоступна» —
   * решение, что показать человеку, принимает форма.
   */
  const getToken = useCallback(async (): Promise<string | null> => {
    const api = await loadTurnstileScript();
    const container = containerRef.current;
    if (!api || !container) {
      setStatus('unavailable');
      return null;
    }
    setStatus('ready');

    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (token: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(token);
      };

      const timer = window.setTimeout(() => finish(null), TOKEN_TIMEOUT_MS);

      try {
        removeWidget(api);
        widgetIdRef.current = api.render(container, {
          sitekey: getSiteKey(),
          appearance: 'interaction-only',
          execution: 'execute',
          size: 'flexible',
          // Тема берётся из оформления страницы, чтобы галочка не оказалась
          // белым пятном на тёмном фоне в редком случае показа.
          theme: 'auto',
          callback: (token: string) => finish(token || null),
          'error-callback': () => finish(null),
          'timeout-callback': () => finish(null),
          'expired-callback': () => finish(null),
        });
        api.execute(widgetIdRef.current);
      } catch {
        finish(null);
      }
    });
  }, [removeWidget]);

  return { containerRef, getToken, status };
}
