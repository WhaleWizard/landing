import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from '../../routes';
import {
  ensureAnalyticsLoaded,
  ensureMarketingLoaded,
  loadConsent,
  onOpenCookieSettings,
  openCookieSettings,
  requiresConsentByDefault,
  resolveGeo,
  saveConsent,
  trackPageView,
  type ConsentCategories,
  type ConsentRecord,
} from '../../consent/consent';

type BannerMode = 'hidden' | 'banner' | 'modal';

function applyConsent(consent: ConsentRecord): void {
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
      trackPageView(path);
    }
  });
}

function Preferences({
  analytics,
  marketing,
  onAnalyticsChange,
  onMarketingChange,
}: {
  analytics: boolean;
  marketing: boolean;
  onAnalyticsChange: (value: boolean) => void;
  onMarketingChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Necessary</p>
            <p className="text-muted-foreground text-xs">Всегда активны: базовая работа сайта.</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">Always on</span>
        </div>
      </div>

      <label className="rounded-xl border border-border/70 bg-background/70 p-3 flex items-start justify-between gap-4 cursor-pointer">
        <div>
          <p className="font-semibold">Analytics</p>
          <p className="text-muted-foreground text-xs">Google Analytics / Яндекс Метрика.</p>
        </div>
        <input
          type="checkbox"
          checked={analytics}
          onChange={(event) => onAnalyticsChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-primary"
        />
      </label>

      <label className="rounded-xl border border-border/70 bg-background/70 p-3 flex items-start justify-between gap-4 cursor-pointer">
        <div>
          <p className="font-semibold">Marketing</p>
          <p className="text-muted-foreground text-xs">Meta Pixel / TikTok Pixel / Ads tags.</p>
        </div>
        <input
          type="checkbox"
          checked={marketing}
          onChange={(event) => onMarketingChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-primary"
        />
      </label>
    </div>
  );
}

export default function CookieConsentManager() {
  const [mode, setMode] = useState<BannerMode>('hidden');
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [region, setRegion] = useState('UNKNOWN');

  const consentRef = useRef<ConsentRecord | null>(null);

  const saveAndApply = useCallback((categories: Omit<ConsentCategories, 'necessary'>, source: ConsentRecord['source']) => {
    const consent = saveConsent(categories, region, source);
    consentRef.current = consent;
    applyConsent(consent);
    setMode('hidden');
  }, [region]);

  useEffect(() => {
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

    void resolveGeo().then((geo) => {
      if (!alive) return;

      const resolvedRegion = geo?.countryCode || 'UNKNOWN';
      setRegion(resolvedRegion);

      const requiresConsent = geo?.requiresConsent ?? requiresConsentByDefault();

      if (requiresConsent) {
        setMode('banner');
      } else {
        const autoConsent = saveConsent({ analytics: true, marketing: true }, resolvedRegion, 'region_auto');
        consentRef.current = autoConsent;
        setAnalytics(true);
        setMarketing(true);
        applyConsent(autoConsent);
        setMode('hidden');
      }
    }).finally(() => {
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
      trackPageView(path);
    });

    return unsubscribe;
  }, []);

  const isVisible = mode !== 'hidden';
  const panelTitle = mode === 'banner' ? 'Мы используем cookie' : 'Настройки cookie';

  const description = useMemo(() => (
    'Нужны для аналитики, маркетинга и корректной работы сайта. Вы можете изменить выбор в любой момент.'
  ), []);

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

  if (!isVisible && !loadingGeo) {
    return (
      <button
        type="button"
        onClick={openCookieSettings}
        className="fixed bottom-4 left-4 z-[60] rounded-full border border-border/60 bg-card/85 px-3 py-2 text-xs text-muted-foreground backdrop-blur hover:text-primary transition-colors"
        aria-label="Открыть настройки cookie"
      >
        Cookie settings
      </button>
    );
  }

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] pointer-events-auto" onClick={() => setMode('modal')} />
      <section className="pointer-events-auto absolute bottom-4 left-1/2 w-[min(96vw,680px)] -translate-x-1/2 rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-4 md:p-5">
        <h3 className="text-base md:text-lg font-semibold">{panelTitle}</h3>
        <p className="mt-1 text-xs md:text-sm text-muted-foreground">{description}</p>

        {(mode === 'modal' || mode === 'banner') && (
          <div className="mt-4">
            <Preferences
              analytics={analytics}
              marketing={marketing}
              onAnalyticsChange={setAnalytics}
              onMarketingChange={setMarketing}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={rejectAll} className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted/40 transition-colors">
            Отклонить все
          </button>
          <button type="button" onClick={() => setMode('modal')} className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted/40 transition-colors">
            Настроить
          </button>
          <button type="button" onClick={mode === 'modal' ? saveCustom : acceptAll} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity">
            {mode === 'modal' ? 'Сохранить выбор' : 'Принять все'}
          </button>
        </div>
      </section>
    </div>
  );
}
