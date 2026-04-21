// ... (весь код выше без изменений)

export async function ensureAnalyticsLoaded(): Promise<void> {
  const gaId = getGoogleAnalyticsId();
  const ymId = getYandexMetrikaId();
  const gtmId = getGoogleTagManagerId();

  if (!analyticsConfigLogged) {
    console.info('[analytics] bootstrap config', {
      gtmId,
      gaId,
      ymId,
      hasDataLayer: Array.isArray((window as Window & { dataLayer?: unknown[] }).dataLayer),
    });
    analyticsConfigLogged = true;
  }

  // GTM
  if (gtmId && !gtmLoaded) {
    try {
      const win = window as Window & { dataLayer?: unknown[] };
      win.dataLayer = win.dataLayer || [];
      win.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      await appendExternalScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`);
      gtmLoaded = true;
    } catch (error) {
      console.warn('[analytics] GTM load failed', error);
    }
  } else if (!gtmId) {
    console.warn('[analytics] VITE_GTM_ID is not set. GTM is disabled.');
  }

  // GA4
  if (gaId && !gaLoaded) {
    try {
      await appendExternalScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`);
      (window as Window & { dataLayer?: unknown[] }).dataLayer =
        (window as Window & { dataLayer?: unknown[] }).dataLayer || [];

      function gtag(...args: unknown[]) {
        ((window as Window & { dataLayer: unknown[] }).dataLayer).push(args);
      }

      (window as Window & { gtag?: (...args: unknown[]) => void }).gtag = gtag;
      gtag('js', new Date());
      gtag('config', gaId, { anonymize_ip: true, send_page_view: false });

      gaLoaded = true;
    } catch (error) {
      console.warn('[analytics] Google Analytics load failed', error);
    }
  } else if (!gaId) {
    console.warn('[analytics] VITE_GA_MEASUREMENT_ID is not set. GA4 is disabled.');
  }

  // Yandex Metrika
  if (ymId && !ymLoaded) {
    try {
      await appendExternalScript('https://mc.yandex.ru/metrika/tag.js');

      const win = window as Window & {
        ym?: (...args: unknown[]) => void;
        dataLayer?: unknown[];
      };

      win.dataLayer = win.dataLayer || [];

      if (!win.ym) {
        win.ym = (...args: unknown[]) => {
          ((win as unknown as { yandex_metrika_calls?: unknown[][] }).yandex_metrika_calls ||= []).push(args);
        };
      }

      win.ym(ymId, 'init', {
        ssr: true,
        webvisor: true,
        clickmap: true,
        ecommerce: 'dataLayer',
        referrer: document.referrer,
        url: location.href,
        accurateTrackBounce: true,
        trackLinks: true,
      });

      ymLoaded = true;
    } catch (error) {
      console.warn('[analytics] Yandex Metrika load failed', error);
    }
  } else if (!ymId) {
    console.warn('[analytics] VITE_YANDEX_METRIKA_ID is not set. Yandex Metrika is disabled.');
  }
}

// ...

export function trackThankYouConversion(): void {
  const win = window as Window & {
    gtag?: (...args: unknown[]) => void;
    ym?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  };

  const gaId = getGoogleAnalyticsId();
  const ymId = getYandexMetrikaId();

  if (win.gtag && gaId) {
    win.gtag('event', 'thank_you_page_view', { send_to: gaId });
  }

  if (win.ym && ymId) {
    win.ym(ymId, 'reachGoal', 'thank_you_page_view');
  }

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: 'thank_you_page_view' });
  }
}