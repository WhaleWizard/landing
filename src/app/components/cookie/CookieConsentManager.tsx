import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { router } from '../../routes';
import Modal from '../Modal';
import {
  ensureAnalyticsLoaded,
  ensureMarketingLoaded,
  loadConsent,
  onOpenCookieSettings,
  openCookieSettings,
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

type BannerMode = 'hidden' | 'banner' | 'modal';
type DocKey = 'pd' | 'privacy' | 'cookie';

const DOCS: Record<DocKey, { link: string; title: string }> = {
  pd: { link: 'Обработка ПД', title: 'Согласие на обработку персональных данных' },
  privacy: { link: 'Конфиденциальность', title: 'Политика конфиденциальности и обработки персональных данных' },
  cookie: { link: 'Cookie', title: 'Политика cookie' },
};

function applyConsent(consent: ConsentRecord): void {
  updateConsentState(consent.categories);
  const tasks: Promise<void>[] = [];

  if (consent.categories.analytics) {
    tasks.push(ensureAnalyticsLoaded());
  }

  if (consent.categories.marketing) {
    tasks.push(ensureMarketingLoaded());
  }

  void Promise.allSettled(tasks).then(() => {
    const location = router.state.location;
    const path = `${location.pathname}${location.search}`;
    if (consent.categories.analytics || consent.categories.marketing) {
      trackPageView(path, { marketing: consent.categories.marketing });
      trackServiceViewContent(path, { marketing: consent.categories.marketing });
    }
  });
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

  const saveAndApply = useCallback(
    (categories: Omit<ConsentCategories, 'necessary'>, source: ConsentRecord['source']) => {
      const consent = saveConsent(categories, region, source);
      consentRef.current = consent;
      applyConsent(consent);
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

  useEffect(() => {
    const unsubscribe = router.subscribe((state) => {
      const consent = consentRef.current;
      if (!consent) return;
      if (!consent.categories.analytics && !consent.categories.marketing) return;
      const path = `${state.location.pathname}${state.location.search}`;
      trackPageView(path, { marketing: consent.categories.marketing });
      trackServiceViewContent(path, { marketing: consent.categories.marketing });
    });

    return unsubscribe;
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

  const docDialog = (
    <Modal
      isOpen={docModal !== null}
      onClose={() => setDocModal(null)}
      title={docModal ? DOCS[docModal].title : ''}
      dialogClassName="max-w-4xl"
      bodyClassName="prose prose-invert prose-sm max-w-none"
    >
      <Suspense fallback={null}>
        {docModal === 'pd' && <PdConsentContent />}
        {docModal === 'privacy' && <PrivacyPolicyContent />}
        {docModal === 'cookie' && <CookiePolicyContent />}
      </Suspense>
    </Modal>
  );

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
        className="ww-banner-enter pointer-events-auto absolute bottom-3 md:bottom-5 left-1/2 w-[min(94vw,440px)] -translate-x-1/2"
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
