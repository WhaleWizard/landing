/**
 * Сбор реальных Core Web Vitals у посетителей.
 *
 * Раньше скорость измерялась только лабораторно через PageSpeed, а Google
 * ранжирует по данным настоящих пользователей. Здесь нет ни идентификаторов,
 * ни cookies: уходит только название метрики, число и адрес страницы, а
 * сервер складывает это в суточный агрегат.
 *
 * Правила осторожности: метрика никогда не важнее самого сайта. Любая
 * неподдержанная возможность браузера или ошибка молча выключает сбор.
 */

type MetricName = 'LCP' | 'CLS' | 'INP' | 'TTFB';

interface Sample {
  metric: MetricName;
  value: number;
  path: string;
}

const ENDPOINT = '/api/vitals';

/**
 * Доля просмотров, с которых уходят метрики.
 *
 * Каждый отчёт — до четырёх строк в D1, а суточный лимит записей на бесплатном
 * тарифе Cloudflare конечный: при тысячах посетителей полный сбор съедал бы его
 * раньше, чем всё остальное вместе взятое. Средние значения от выборки не
 * меняются, меняется только число замеров под ними. Вернуть на 1 после
 * перехода на платный тариф.
 */
const SAMPLE_RATE = 0.25;

function pagePath(): string {
  try {
    return window.location.pathname || '/';
  } catch {
    return '/';
  }
}

function send(samples: Sample[]): void {
  if (!samples.length) return;
  const body = JSON.stringify({ metrics: samples });
  try {
    // sendBeacon переживает закрытие вкладки; fetch с keepalive — запасной путь.
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } })
      .catch(() => undefined);
  } catch {
    // молча: телеметрия не должна мешать странице
  }
}

function observe(type: string, handler: (entries: PerformanceEntryList) => void, extra?: Record<string, unknown>): PerformanceObserver | null {
  try {
    const observer = new PerformanceObserver((list) => handler(list.getEntries()));
    // buffered даёт события, случившиеся до подписки — иначе LCP теряется.
    observer.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    return observer;
  } catch {
    return null;
  }
}

export function startWebVitals(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  // Решение принимается один раз на загрузку страницы: наблюдатели у
  // непопавшего в выборку просмотра даже не создаются.
  if (Math.random() >= SAMPLE_RATE) return;

  const path = pagePath();
  let largestPaint = 0;
  let maxSessionWindowScore = 0;
  let currentSessionWindowScore = 0;
  let sessionWindowStart = 0;
  let sessionWindowEnd = 0;
  let slowestInteraction = 0;
  let hadInteraction = false;
  let sent = false;

  const observers: Array<PerformanceObserver | null> = [];

  observers.push(observe('largest-contentful-paint', (entries) => {
    for (const entry of entries) {
      largestPaint = Math.max(largestPaint, entry.startTime);
    }
  }));

  // CLS по сессионным окнам: разрыв не более 1 с, окно не более 5 с (F-052).
  observers.push(observe('layout-shift', (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean; startTime: number }>) {
      if (entry.hadRecentInput) continue;
      const value = Number(entry.value || 0);
      if (currentSessionWindowScore > 0 && entry.startTime - sessionWindowEnd < 1000 && entry.startTime - sessionWindowStart < 5000) {
        currentSessionWindowScore += value;
        sessionWindowEnd = entry.startTime;
      } else {
        currentSessionWindowScore = value;
        sessionWindowStart = entry.startTime;
        sessionWindowEnd = entry.startTime;
      }
      if (currentSessionWindowScore > maxSessionWindowScore) {
        maxSessionWindowScore = currentSessionWindowScore;
      }
    }
  }));

  // INP: порог 40 мс + first-input для быстрых взаимодействий (F-018).
  const handleInteraction = (entries: PerformanceEntryList) => {
    for (const entry of entries as Array<PerformanceEntry & { interactionId?: number; duration?: number }>) {
      if (!entry.interactionId) continue;
      hadInteraction = true;
      slowestInteraction = Math.max(slowestInteraction, Number(entry.duration || 0));
    }
  };
  observers.push(observe('event', handleInteraction, { durationThreshold: 40 }));
  observers.push(observe('first-input', handleInteraction));

  const timeToFirstByte = (): number => {
    try {
      const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      return navigation ? Math.max(0, navigation.responseStart) : 0;
    } catch {
      return 0;
    }
  };

  const flush = () => {
    if (sent) return;
    sent = true;
    for (const observer of observers) {
      try { observer?.disconnect(); } catch { /* уже отключён */ }
    }

    const samples: Sample[] = [];
    if (largestPaint > 0) samples.push({ metric: 'LCP', value: Math.round(largestPaint), path });
    if (maxSessionWindowScore > 0) samples.push({ metric: 'CLS', value: Math.round(maxSessionWindowScore * 1000) / 1000, path });
    if (hadInteraction) samples.push({ metric: 'INP', value: Math.round(slowestInteraction), path });
    const ttfb = timeToFirstByte();
    if (ttfb > 0) samples.push({ metric: 'TTFB', value: Math.round(ttfb), path });
    send(samples);
  };

  // Отправляем один раз, когда вкладку скрывают: к этому моменту метрики
  // уже устаканились, а страница всё ещё жива.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  }, { once: false });
  window.addEventListener('pagehide', flush, { once: true });
  window.addEventListener('popstate', flush, { once: true });
}
