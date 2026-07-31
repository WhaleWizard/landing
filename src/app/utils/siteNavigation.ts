import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';

// Единая карта разделов сайта. Отсюда берутся подписи для хлебных крошек
// и для кнопки «Назад в …», поэтому названия должны совпадать с тем, как
// раздел называется в навбаре и футере.
export const ROUTE_LABELS: Record<string, string> = {
  '/': 'Главная',
  '/meta-ads': 'Meta Ads',
  '/meta-apps': 'Продвижение приложений',
  '/google-ads': 'Google Ads',
  '/consult': 'Консультация',
  '/blog': 'Блог',
  '/cases': 'Кейсы',
  '/faq': 'FAQ',
  '/marketing-glossary': 'Словарь метрик',
  '/calculator': 'Калькулятор бюджета',
  '/roi-calculator': 'Калькулятор ROI',
  '/privacy-policy': 'Политика конфиденциальности',
  '/offer': 'Публичная оферта',
  '/cookie-policy': 'Политика Cookie',
  '/thank-you': 'Заявка отправлена',
};

// Короткие варианты для узких мест: мобильные крошки и подписи.
const SHORT_LABELS: Record<string, string> = {
  '/meta-apps': 'Meta Apps',
  '/marketing-glossary': 'Словарь',
  '/calculator': 'Калькулятор',
  '/roi-calculator': 'Калькулятор ROI',
};

// Готовая надпись кнопки «Назад». Отдельной картой, потому что по-русски
// нужен разный предлог и падеж: «в блог», но «к кейсам».
const BACK_LABELS: Record<string, string> = {
  '/': 'На главную',
  '/meta-ads': 'Назад в Meta Ads',
  '/meta-apps': 'Назад в Meta Apps',
  '/google-ads': 'Назад в Google Ads',
  '/consult': 'Назад к консультации',
  '/blog': 'Назад в блог',
  '/cases': 'Назад к кейсам',
  '/faq': 'Назад в FAQ',
  '/marketing-glossary': 'Назад в словарь',
  '/calculator': 'Назад в калькулятор',
  '/roi-calculator': 'Назад в калькулятор ROI',
  '/privacy-policy': 'Назад к политике',
  '/offer': 'Назад к оферте',
  '/cookie-policy': 'Назад к политике cookie',
  '/thank-you': 'Назад',
};

export function backLabel(pathOrUrl: string): string {
  const path = normalizePath(pathOrUrl.split('?')[0].split('#')[0]);
  if (BACK_LABELS[path]) return BACK_LABELS[path];
  if (path.startsWith('/blog/')) return 'Назад к статье';
  if (path.startsWith('/cases/')) return 'Назад к кейсу';
  return 'Назад';
}

// Короткие псевдонимы для ?from=. Появились на странице кейсов
// (/cases?from=meta-apps) и теперь работают на всём сайте.
export const FROM_ALIASES: Record<string, string> = {
  home: '/',
  'meta-ads': '/meta-ads',
  'meta-apps': '/meta-apps',
  'google-ads': '/google-ads',
  consult: '/consult',
  blog: '/blog',
  cases: '/cases',
  faq: '/faq',
  glossary: '/marketing-glossary',
  calculator: '/calculator',
  roi: '/roi-calculator',
};

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

/**
 * Пропускает только внутренние адреса. Пустая строка, внешний хост
 * и протокол-относительный «//evil.com» отбрасываются.
 */
function asInternalPath(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
}

/** Родительский раздел: /blog/статья → /blog, /cases/кейс → /cases. */
export function parentRouteOf(pathname: string): string {
  const path = normalizePath(pathname);
  if (path.startsWith('/blog/')) return '/blog';
  if (path.startsWith('/cases/')) return '/cases';
  return '/';
}

export function routeLabel(pathOrUrl: string, short = false): string {
  const path = normalizePath(pathOrUrl.split('?')[0].split('#')[0]);
  if (short && SHORT_LABELS[path]) return SHORT_LABELS[path];
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path];
  if (path.startsWith('/blog/')) return 'Блог';
  if (path.startsWith('/cases/')) return 'Кейсы';
  return 'Главная';
}

function sameOriginReferrer(currentPath: string): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.referrer) return null;
  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) return null;
    if (normalizePath(referrer.pathname) === normalizePath(currentPath)) return null;
    return `${referrer.pathname}${referrer.search}${referrer.hash}`;
  } catch {
    return null;
  }
}

export type ReturnTo = {
  /** Куда вернёт кнопка «Назад». */
  path: string;
  /** Подпись раздела без предлога: «Meta Ads», «Блог». */
  label: string;
  /** Готовая надпись кнопки: «Назад в Meta Ads», «Назад к кейсам», «На главную». */
  buttonLabel: string;
  /** true, если источник перехода известен точно (state или ?from=). */
  explicit: boolean;
  goBack: () => void;
};

/**
 * Откуда пользователь пришёл на текущую страницу. Порядок источников:
 * 1) state.from — его проставляют внутренние ссылки сайта;
 * 2) ?from= — переживает перезагрузку и работает в расшаренной ссылке;
 * 3) реферер того же домена — для переходов без явного контекста;
 * 4) fallback: родительский раздел, затем главная.
 */
export function useReturnTo(fallback?: string): ReturnTo {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = normalizePath(location.pathname);

  const resolved = useMemo(() => {
    const stateFrom = asInternalPath((location.state as { from?: string } | null)?.from);
    if (stateFrom && normalizePath(stateFrom.split('?')[0]) !== currentPath) {
      return { path: stateFrom, explicit: true, viaHistory: false };
    }

    const rawFrom = new URLSearchParams(location.search).get('from');
    const queryFrom = rawFrom ? (FROM_ALIASES[rawFrom] ?? asInternalPath(rawFrom)) : null;
    if (queryFrom && normalizePath(queryFrom.split('?')[0]) !== currentPath) {
      return { path: queryFrom, explicit: true, viaHistory: false };
    }

    const referrer = sameOriginReferrer(currentPath);
    if (referrer) return { path: referrer, explicit: false, viaHistory: true };

    return {
      path: fallback ?? parentRouteOf(currentPath),
      explicit: false,
      viaHistory: false,
    };
  }, [currentPath, fallback, location.search, location.state]);

  const label = routeLabel(resolved.path, true);
  const buttonLabel = backLabel(resolved.path);
  const goBack = useCallback(() => {
    // Возврат по истории сохраняет позицию прокрутки на странице-источнике.
    if (resolved.viaHistory && typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(resolved.path);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, [navigate, resolved]);

  return {
    path: resolved.path,
    label,
    buttonLabel,
    explicit: resolved.explicit,
    goBack,
  };
}

/**
 * Ссылка внутрь сайта, которая помнит страницу-источник.
 * Использовать в `<Link to={...} state={withReturnTo(location)}>`.
 */
export function withReturnTo(location: { pathname: string; search?: string }): { from: string } {
  return { from: `${location.pathname}${location.search || ''}` };
}
