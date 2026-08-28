import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { router } from '../../routes';
import {
  ensureAnalyticsLoaded,
  ensureMarketingLoaded,
  isTrackingExcludedPath,
  loadConsent,
  onOpenCookieSettings,
  openCookieSettings,
  prepareTrackingQueues,
  requiresConsentByDefault,
  resolveGeo,
  saveConsent,
  setDefaultConsentState,
  trackPageView,
  trackServiceViewContent,
  updateConsentState,
  type ConsentCategories,
  type ConsentRecord,
} from '../../consent/consent';

// Полные тексты документов нужны только при открытии попапа — грузим лениво.
const PdConsentContent = lazy(() => import('../legal/PdConsentContent'));
const PrivacyPolicyContent = lazy(() => import('../legal/PrivacyPolicyContent'));
const CookiePolicyContent = lazy(() => import('../legal/CookiePolicyContent'));
import { LegalUpdatedAt } from '../legal/legalMeta';
const Modal = lazy(() => import('../Modal'));

type BannerMode = 'hidden' | 'banner' | 'modal';
type DocKey = 'pd' | 'privacy' | 'cookie';

const DOCS: Record<DocKey, { link: string; title: string }> = {
  pd: { link: 'Обработка ПД', title: 'Согласие на обработку персональных данных' },
  privacy: { link: 'Конфиденциальность', title: 'Политика конфиденциальности и обработки персональных данных' },
  cookie: { link: 'Cookie', title: 'Политика cookie' },
};

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (id: number) => void;
};

let pendingAnalyticsRuntime = false;
let pendingMarketingRuntime = false;
let cancelScheduledRuntimeLoad: (() => void) | null = null;
const TRACKING_RUNTIME_FALLBACK_DELAY_MS = 90_000;
const TRACKING_RUNTIME_SCROLL_IDLE_MS = 2_000;
const TRACKING_RUNTIME_SCROLL_INTENT_WINDOW_MS = 5_000;
const TRACKING_RUNTIME_MIN_SCROLL_DISTANCE_PX = 48;

function cancelPendingTrackingRuntimeLoad(): void {
  cancelScheduledRuntimeLoad?.();
  cancelScheduledRuntimeLoad = null;
  pendingAnalyticsRuntime = false;
  pendingMarketingRuntime = false;
}

function loadPendingTrackingRuntimes(): void {
  cancelScheduledRuntimeLoad?.();
  cancelScheduledRuntimeLoad = null;

  if (isTrackingExcludedPath(router.state.location.pathname)) {
    pendingAnalyticsRuntime = false;
    pendingMarketingRuntime = false;
    return;
  }

  const currentConsent = loadConsent();
  const loadAnalytics = pendingAnalyticsRuntime && currentConsent?.categories.analytics === true;
  const loadMarketing = pendingMarketingRuntime && currentConsent?.categories.marketing === true;
  pendingAnalyticsRuntime = false;
  pendingMarketingRuntime = false;

  const tasks: Promise<void>[] = [];
  if (loadAnalytics) tasks.push(ensureAnalyticsLoaded());
  if (loadMarketing) tasks.push(ensureMarketingLoaded());
  void Promise.allSettled(tasks);
}

function scheduleTrackingRuntimeLoad(
  categories: Pick<ConsentCategories, 'analytics' | 'marketing'>,
  immediate = false,
): void {
  if (isTrackingExcludedPath(router.state.location.pathname)) {
    cancelPendingTrackingRuntimeLoad();
    return;
  }

  pendingAnalyticsRuntime ||= categories.analytics;
  pendingMarketingRuntime ||= categories.marketing;
  if (!pendingAnalyticsRuntime && !pendingMarketingRuntime) return;

  if (immediate) {
    loadPendingTrackingRuntimes();
    return;
  }
  if (cancelScheduledRuntimeLoad) return;

  const idleWindow = window as IdleWindow;
  let delayId: number | undefined;
  let scrollDelayId: number | undefined;
  const idleIds = new Set<number>();
  let loadListenerAttached = false;
  let scrollIntentUntil = 0;
  let lastScrollY = window.scrollY;
  let scrollDistance = 0;

  const cancelIdleRuns = () => {
    idleIds.forEach((id) => idleWindow.cancelIdleCallback?.(id));
    idleIds.clear();
  };

  const cleanup = () => {
    if (delayId !== undefined) window.clearTimeout(delayId);
    if (scrollDelayId !== undefined) window.clearTimeout(scrollDelayId);
    cancelIdleRuns();
    if (loadListenerAttached) window.removeEventListener('load', scheduleAfterLoad);
    window.removeEventListener('scroll', scheduleAfterScroll);
    window.removeEventListener('wheel', markScrollIntent);
    window.removeEventListener('touchstart', markScrollIntent);
    window.removeEventListener('touchmove', markScrollIntent);
    window.removeEventListener('keydown', markKeyboardScrollIntent);
    document.removeEventListener('focusin', runOnLeadIntent, true);
  };
  const run = () => loadPendingTrackingRuntimes();
  const runWhenIdle = () => {
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const id = idleWindow.requestIdleCallback(() => {
        idleIds.delete(id);
        run();
      }, { timeout: 2_000 });
      idleIds.add(id);
    } else {
      run();
    }
  };
  const runOnLeadIntent = (event: FocusEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest('form')) run();
  };
  const markScrollIntent = (event: Event) => {
    if (!event.isTrusted) return;
    const now = performance.now();
    if (now > scrollIntentUntil) {
      lastScrollY = window.scrollY;
      scrollDistance = 0;
    }
    scrollIntentUntil = now + TRACKING_RUNTIME_SCROLL_INTENT_WINDOW_MS;
  };
  const markKeyboardScrollIntent = (event: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar'].includes(event.key)) {
      markScrollIntent(event);
    }
  };
  const scheduleAfterScroll = () => {
    if (scrollDelayId !== undefined) window.clearTimeout(scrollDelayId);
    cancelIdleRuns();

    const currentScrollY = window.scrollY;
    scrollDistance += Math.abs(currentScrollY - lastScrollY);
    lastScrollY = currentScrollY;
    if (
      performance.now() > scrollIntentUntil
      || scrollDistance < TRACKING_RUNTIME_MIN_SCROLL_DISTANCE_PX
    ) return;

    // Only a real wheel/touch/keyboard scroll can reach this branch. Initial
    // scroll restoration and synthetic layout scroll events stay lightweight.
    scrollDelayId = window.setTimeout(runWhenIdle, TRACKING_RUNTIME_SCROLL_IDLE_MS);
  };
  const scheduleAfterLoad = () => {
    loadListenerAttached = false;
    // Third-party analytics is deliberately outside the render path. Browser
    // events are already queued and server PageView/CAPI events are sent now.
    // The fallback covers an engaged reader who never scrolls or focuses a
    // form, while staying outside the initial interaction window.
    delayId = window.setTimeout(runWhenIdle, TRACKING_RUNTIME_FALLBACK_DELAY_MS);
  };

  cancelScheduledRuntimeLoad = cleanup;
  // A form focus is a high-value intent signal: start runtimes early enough
  // for GA/Yandex client IDs to be available by submit, without penalising
  // ordinary scrolling with several third-party scripts.
  document.addEventListener('focusin', runOnLeadIntent, true);
  window.addEventListener('wheel', markScrollIntent, { passive: true });
  window.addEventListener('touchstart', markScrollIntent, { passive: true });
  window.addEventListener('touchmove', markScrollIntent, { passive: true });
  window.addEventListener('keydown', markKeyboardScrollIntent);
  window.addEventListener('scroll', scheduleAfterScroll, { passive: true });

  if (document.readyState === 'complete') scheduleAfterLoad();
  else {
    loadListenerAttached = true;
    window.addEventListener('load', scheduleAfterLoad, { once: true });
  }
}

function applyConsent(consent: ConsentRecord, immediateRuntimeLoad = false): void {
  prepareTrackingQueues(consent.categories);
  updateConsentState(consent.categories);
  const location = router.state.location;
  const path = location.pathname;
  if (consent.categories.analytics || consent.categories.marketing) {
    trackPageView(path, { marketing: consent.categories.marketing });
    trackServiceViewContent(path, { marketing: consent.categories.marketing });
  }
  scheduleTrackingRuntimeLoad(consent.categories, immediateRuntimeLoad);
}

function Switch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
        checked ? 'bg-gradient-to-r from-primary to-accent' : 'bg-white/15'
      } ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

function DocLinks({ onOpen, className = '' }: { onOpen: (doc: DocKey) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 ${className}`}>
      {(Object.keys(DOCS) as DocKey[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onOpen(key)}
          className="text-[11px] text-muted-foreground/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
        >
          {DOCS[key].link}
        </button>
      ))}
    </div>
  );
}

export default function CookieConsentManager() {
  const [mode, setMode] = useState<BannerMode>('hidden');
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [region, setRegion] = useState('UNKNOWN');
  const [docModal, setDocModal] = useState<DocKey | null>(null);

  const consentRef = useRef<ConsentRecord | null>(null);

  useEffect(() => () => cancelPendingTrackingRuntimeLoad(), []);

  const saveAndApply = useCallback(
    (categories: Omit<ConsentCategories, 'necessary'>, source: ConsentRecord['source']) => {
      const consent = saveConsent(categories, region, source);
      consentRef.current = consent;
      applyConsent(consent, true);
      setMode('hidden');
    },
    [region],
  );

  useEffect(() => {
    // Google Consent Mode v2: default-состояние должно быть выставлено раньше
    // любого решения по согласию — до того, как мы даже узнаем регион/выбор пользователя.
    setDefaultConsentState();

    const existing = loadConsent();
    if (existing) {
      consentRef.current = existing;
      setRegion(existing.region || 'UNKNOWN');
      setAnalytics(existing.categories.analytics);
      setMarketing(existing.categories.marketing);
      applyConsent(existing);
      setLoadingGeo(false);
      return;
    }

    let alive = true;

    void resolveGeo()
      .then((geo) => {
        if (!alive) return;

        const resolvedRegion = geo?.countryCode || 'UNKNOWN';
        setRegion(resolvedRegion);

        const requiresConsent = geo?.requiresConsent ?? requiresConsentByDefault();

        if (requiresConsent) {
          setMode('banner');
        } else {
          // НАМЕРЕННОЕ решение владельца, НЕ баг: для нерегулируемых регионов
          // (и когда geo вообще не определился) баннер не показывается, а
          // аналитика/маркетинг включаются автоматически — см. requiresConsentByDefault().
          const autoConsent = saveConsent({ analytics: true, marketing: true }, resolvedRegion, 'region_auto');
          consentRef.current = autoConsent;
          setAnalytics(true);
          setMarketing(true);
          applyConsent(autoConsent);
          setMode('hidden');
        }
      })
      .finally(() => {
        if (alive) setLoadingGeo(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return onOpenCookieSettings(() => {
      const stored = consentRef.current ?? loadConsent();
      if (stored) {
        setAnalytics(stored.categories.analytics);
        setMarketing(stored.categories.marketing);
      }
      setMode('modal');
    });
  }, []);

  /*
   * Открытие настроек по адресу `?cookies=settings`.
   *
   * Заглушка закрытой страницы намеренно живёт без JavaScript и своего баннера
   * там нет — ставить его было бы обманом, потому что на заглушке не ставится
   * ни одна cookie. Но человеку, который не хочет cookie, нужен работающий
   * выход, и ссылка с заглушки ведёт сюда. Параметр сразу убирается из адреса,
   * чтобы окно не открывалось заново при обновлении и не попало в закладки.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cookies') !== 'settings') return;

    params.delete('cookies');
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
    openCookieSettings();
  }, []);

  useEffect(() => {
    let previousPathname = router.state.location.pathname;
    let lastTrackedTitle = document.title;
    let pendingRouteTimer: number | undefined;

    const trackRouteWhenTitleIsReady = (pathname: string, attempt = 0) => {
      if (router.state.location.pathname !== pathname) return;
      if (document.title === lastTrackedTitle && attempt < 20) {
        pendingRouteTimer = window.setTimeout(() => trackRouteWhenTitleIsReady(pathname, attempt + 1), 50);
        return;
      }

      lastTrackedTitle = document.title;
      const consent = consentRef.current;
      if (!consent) return;
      if (!consent.categories.analytics && !consent.categories.marketing) return;
      trackPageView(pathname, { marketing: consent.categories.marketing });
      trackServiceViewContent(pathname, { marketing: consent.categories.marketing });
    };

    const unsubscribe = router.subscribe((state) => {
      const pathname = state.location.pathname;
      if (pathname === previousPathname) return;
      previousPathname = pathname;
      if (pendingRouteTimer !== undefined) window.clearTimeout(pendingRouteTimer);
      if (isTrackingExcludedPath(pathname)) {
        cancelPendingTrackingRuntimeLoad();
        return;
      }

      const consent = consentRef.current;
      if (consent) scheduleTrackingRuntimeLoad(consent.categories);
      trackRouteWhenTitleIsReady(pathname);
    });

    return () => {
      if (pendingRouteTimer !== undefined) window.clearTimeout(pendingRouteTimer);
      unsubscribe();
    };
  }, []);

  const acceptAll = useCallback(() => {
    setAnalytics(true);
    setMarketing(true);
    saveAndApply({ analytics: true, marketing: true }, 'user');
  }, [saveAndApply]);

  const rejectAll = useCallback(() => {
    setAnalytics(false);
    setMarketing(false);
    saveAndApply({ analytics: false, marketing: false }, 'user');
  }, [saveAndApply]);

  const saveCustom = useCallback(() => {
    saveAndApply({ analytics, marketing }, 'user');
  }, [analytics, marketing, saveAndApply]);

  const backFromSettings = useCallback(() => {
    // С первого визита «Назад» возвращает к баннеру; если согласие уже дано
    // (настройки открыты чипом) — просто закрываем окно без изменений.
    setMode(consentRef.current ? 'hidden' : 'banner');
  }, []);

  const isVisible = mode !== 'hidden';
  const blocked = loadingGeo || isVisible || docModal !== null;

  useEffect(() => {
    document.documentElement.dataset.wwCookieUi = blocked ? 'blocked' : 'ready';
    window.dispatchEvent(new CustomEvent('ww:cookie-ui-change', { detail: { blocked } }));

    return () => {
      delete document.documentElement.dataset.wwCookieUi;
      window.dispatchEvent(new CustomEvent('ww:cookie-ui-change', { detail: { blocked: true } }));
    };
  }, [blocked]);

  const docDialog =
    docModal !== null ? (
      <Suspense fallback={null}>
        <Modal
          isOpen
          onClose={() => setDocModal(null)}
          title={DOCS[docModal].title}
          dialogClassName="max-w-4xl"
          bodyClassName="prose prose-invert prose-sm max-w-none"
        >
          <LegalUpdatedAt className="mb-4" />
          <Suspense fallback={null}>
            {docModal === 'pd' && <PdConsentContent />}
            {docModal === 'privacy' && <PrivacyPolicyContent />}
            {docModal === 'cookie' && <CookiePolicyContent />}
          </Suspense>
        </Modal>
      </Suspense>
    ) : null;

  if (!isVisible && !loadingGeo) {
    return (
      <>
        <button
          type="button"
          onClick={openCookieSettings}
          className="fixed bottom-2 left-2 md:bottom-4 md:left-4 z-[55] inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/85 px-3 py-2 text-[11px] md:text-xs font-semibold text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-primary"
          aria-label="Открыть настройки cookie"
        >
          <span aria-hidden="true">🍪</span>
          <span>Cookie</span>
        </button>
        {docDialog}
      </>
    );
  }

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px] pointer-events-auto"
        onClick={() => setMode('modal')}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Настройки cookie"
        className="ww-banner-enter pointer-events-auto absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:bottom-5 mx-auto w-[min(94vw,440px)]"
      >
        <div className="ww-cookie-frame shadow-2xl">
          <div className="relative rounded-[19px] bg-[#0b0c1a]/95 px-4 py-4 backdrop-blur-xl sm:px-5">
            {mode === 'banner' ? (
              <>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 flex-none rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_0_12px_var(--primary)]"
                  />
                  <h3 className="text-[15px] font-extrabold tracking-tight">Приватность под контролем</h3>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Используем cookie, чтобы честно считать заявки и рекламу. Принимая, вы соглашаетесь с документами:
                </p>
                <DocLinks onOpen={setDocModal} className="mt-2" />
                <div className="mt-3.5 flex gap-2">
                  <button
                    type="button"
                    onClick={rejectAll}
                    className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted/40"
                  >
                    Отклонить
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="relative flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-opacity hover:opacity-95"
                  >
                    Принять всё
                    <span className="ww-sheen" aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setMode('modal')}
                  className="mt-2.5 text-[11.5px] text-muted-foreground/70 underline decoration-dotted underline-offset-2 transition-colors hover:text-muted-foreground"
                >
                  Выбрать вручную
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 flex-none rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_0_12px_var(--primary)]"
                  />
                  <h3 className="text-[15px] font-extrabold tracking-tight">Что разрешаем</h3>
                </div>

                <div className="mt-2 divide-y divide-white/10">
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <b className="block text-xs font-bold">Необходимые</b>
                      <span className="text-[10px] text-muted-foreground/70">работа сайта, форм и настроек</span>
                    </span>
                    <Switch checked disabled label="Необходимые cookie всегда включены" />
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <b className="block text-xs font-bold">Аналитика</b>
                      <span className="text-[10px] text-muted-foreground/70">посещаемость: GA4, Метрика</span>
                    </span>
                    <Switch checked={analytics} label="Аналитика" onToggle={() => setAnalytics((v) => !v)} />
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <b className="block text-xs font-bold">Маркетинг</b>
                      <span className="text-[10px] text-muted-foreground/70">оценка рекламы: Meta, TikTok</span>
                    </span>
                    <Switch checked={marketing} label="Маркетинг" onToggle={() => setMarketing((v) => !v)} />
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={backFromSettings}
                    className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted/40"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    onClick={saveCustom}
                    className="relative flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-opacity hover:opacity-95"
                  >
                    Сохранить
                    <span className="ww-sheen" aria-hidden="true" />
                  </button>
                </div>
                <DocLinks onOpen={setDocModal} className="mt-2.5" />
              </>
            )}
          </div>
        </div>
      </section>

      {docDialog}
    </div>
  );
}
