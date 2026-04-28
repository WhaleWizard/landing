export type ConsentCategories = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentRecord = {
  version: number;
  source: 'user' | 'region_auto';
  timestamp: number;
  expiresAt: number;
  region: string;
  categories: ConsentCategories;
};

export type GeoResolution = {
  countryCode: string;
  requiresConsent: boolean;
  source: 'cloudflare' | 'ipwhois';
};

const CONSENT_VERSION = 1;
const CONSENT_KEY = 'ww_cookie_consent_v1';
const CONSENT_TTL_DAYS = 180;
const OPEN_SETTINGS_EVENT = 'open-cookie-settings';

const REGULATED_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH'
]);

function getExpiryTimestamp(days = CONSENT_TTL_DAYS): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

export function loadConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (!parsed?.categories || parsed.version !== CONSENT_VERSION) return null;
    if (parsed.expiresAt <= Date.now()) {
      clearConsent();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveConsent(
  categories: Omit<ConsentCategories, 'necessary'>,
  region: string,
  source: ConsentRecord['source']
): ConsentRecord {
  const consent: ConsentRecord = {
    version: CONSENT_VERSION,
    source,
    timestamp: Date.now(),
    expiresAt: getExpiryTimestamp(),
    region,
    categories: {
      necessary: true,
      analytics: !!categories.analytics,
      marketing: !!categories.marketing,
    },
  };

  localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  document.cookie = `${CONSENT_KEY}=1; Max-Age=${CONSENT_TTL_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax; Secure`;

  return consent;
}

export function clearConsent(): void {
  localStorage.removeItem(CONSENT_KEY);
  document.cookie = `${CONSENT_KEY}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
}

export function openCookieSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}

export function onOpenCookieSettings(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(OPEN_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

function evaluateCountry(countryCode: string): boolean {
  return REGULATED_COUNTRIES.has(countryCode.toUpperCase());
}

async function resolveViaCloudflare(): Promise<GeoResolution> {
  const response = await fetch('/api/geo', { method: 'GET', credentials: 'omit' });
  if (!response.ok) throw new Error('geo endpoint unavailable');
  const data = await response.json() as { countryCode?: string; requiresConsent?: boolean };
  if (!data?.countryCode || typeof data.requiresConsent !== 'boolean') {
    throw new Error('invalid geo payload');
  }

  return {
    countryCode: data.countryCode,
    requiresConsent: data.requiresConsent,
    source: 'cloudflare',
  };
}

async function resolveViaIpWhoIs(): Promise<GeoResolution> {
  const response = await fetch('https://ipwho.is/', { method: 'GET' });
  if (!response.ok) throw new Error('ipwho.is unavailable');
  const data = await response.json() as { success?: boolean; country_code?: string };

  if (!data?.success || !data.country_code) {
    throw new Error('ipwho.is invalid payload');
  }

  return {
    countryCode: data.country_code,
    requiresConsent: evaluateCountry(data.country_code),
    source: 'ipwhois',
  };
}

export async function resolveGeo(): Promise<GeoResolution | null> {
  try {
    return await withTimeout(resolveViaCloudflare(), 1200);
  } catch {
    try {
      return await withTimeout(resolveViaIpWhoIs(), 1400);
    } catch {
      return null;
    }
  }
}

export function requiresConsentByDefault(): boolean {
  return true;
}

let gaLoaded = false;
let ymLoaded = false;
let metaLoaded = false;
let ttLoaded = false;
let gtmLoaded = false;
let analyticsConfigLogged = false;
let lastTrackedPath = '';
let lastTrackedAt = 0;

const DEFAULT_GTM_ID = 'GTM-T88BWXVV';
const DEFAULT_GA_MEASUREMENT_ID = 'G-ZV18R9DLVC';
const DEFAULT_YANDEX_METRIKA_ID = 108699980;
const DEFAULT_META_PIXEL_ID = '926332213606723';

function appendExternalScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });
}

function env(name: string): string {
  const value = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[name];
  return (value || '').trim();
}

function getYandexMetrikaId(): number | null {
  const raw = env('VITE_YANDEX_METRIKA_ID');
  if (!raw) return DEFAULT_YANDEX_METRIKA_ID;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? DEFAULT_YANDEX_METRIKA_ID : parsed;
}

function getGoogleAnalyticsId(): string {
  return env('VITE_GA_MEASUREMENT_ID') || DEFAULT_GA_MEASUREMENT_ID;
}

function getGoogleTagManagerId(): string {
  return env('VITE_GTM_ID') || DEFAULT_GTM_ID;
}

function getMetaPixelId(): string {
  return env('VITE_META_PIXEL_ID') || DEFAULT_META_PIXEL_ID;
}

function getTiktokPixelId(): string {
  return env('VITE_TIKTOK_PIXEL_ID');
}

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
  }

  if (gaId && !gaLoaded) {
    try {
      await appendExternalScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`);
      (window as Window & { dataLayer?: unknown[] }).dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer || [];
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
  }

  if (ymId && !ymLoaded) {
    try {
      await appendExternalScript('https://mc.yandex.ru/metrika/tag.js');
      const win = window as Window & { ym?: (...args: unknown[]) => void; dataLayer?: unknown[] };
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
  }
}

export async function ensureMarketingLoaded(): Promise<void> {
  const metaId = getMetaPixelId();
  const tiktokId = getTiktokPixelId();

  // Meta Pixel — создаём fbq правильно
  if (metaId && !metaLoaded) {
    const win = window as Window & { fbq?: (...args: unknown[]) => void; _fbq?: (...args: unknown[]) => void };
    if (!win.fbq) {
      const fbq = (...args: unknown[]) => {
        (fbq as any).callMethod
          ? (fbq as any).callMethod.apply(fbq, args)
          : (fbq as any).queue.push(args);
      };
      (fbq as any).loaded = true;
      (fbq as any).version = '2.0';
      (fbq as any).queue = []; // обязательно массив
      win.fbq = fbq;
      win._fbq = fbq;
    }
    await appendExternalScript('https://connect.facebook.net/en_US/fbevents.js');
    win.fbq?.('init', metaId);
    metaLoaded = true;
  }

  // TikTok Pixel — без изменений, если нужен
  if (tiktokId && !ttLoaded) {
    const win = window as Window & { ttq?: any };
    if (!win.ttq || typeof win.ttq.load !== 'function') {
      const ttq: any = ((window as Window & { ttq?: any }).ttq = (window as Window & { ttq?: any }).ttq || {});
      const ttMethods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      ttMethods.forEach((method) => {
        ttq[method] = (...args: unknown[]) => {
          ((ttq as unknown as { _q?: unknown[][] })._q ||= []).push([method, ...args]);
        };
      });
      ttq.load = (id: string) => {
        ttq._t = ttq._t || {};
        ttq._t[id] = [];
        ttq._o = ttq._o || {};
        ttq._o[id] = {};
        ttq._partner = 'whalewzrd';
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        const first = document.getElementsByTagName('script')[0];
        first?.parentNode?.insertBefore(script, first);
      };
    }
    win.ttq.load?.(tiktokId);
    win.ttq.page?.();
    ttLoaded = true;
  }
}

export function trackPageView(path: string): void {
  const now = Date.now();
  if (path === lastTrackedPath && now - lastTrackedAt < 1200) return;
  lastTrackedPath = path;
  lastTrackedAt = now;

  const eventId = crypto.randomUUID(); // уникальный ID для дедупликации

  const win = window as Window & {
    gtag?: (...args: unknown[]) => void;
    ym?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { page?: (...args: unknown[]) => void; track?: (...args: unknown[]) => void };
    dataLayer?: unknown[];
  };

  const gaId = getGoogleAnalyticsId();
  const ymId = getYandexMetrikaId();

  if (win.gtag && gaId) {
    win.gtag('config', gaId, { page_path: path });
  }

  if (win.ym && ymId) {
    win.ym(ymId, 'hit', path);
  }

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({
      event: 'virtual_pageview',
      page_path: path,
      page_location: window.location.href,
    });
  }

  // Браузерный PageView с eventID для дедупликации
  win.fbq?.('track', 'PageView', { eventID: eventId });
  win.ttq?.page?.();

  // Отправляем серверный PageView через наш API
  fetch('/api/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      page_url: window.location.href,
      referrer: document.referrer || undefined,
    }),
  }).catch((e) => console.warn('[PageView] Failed to send server event', e));
}

export function trackFaqOpen(question: string): void {
  const win = window as Window & {
    gtag?: (...args: unknown[]) => void;
    ym?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  };

  const gaId = getGoogleAnalyticsId();
  const ymId = getYandexMetrikaId();

  if (win.gtag && gaId) {
    win.gtag('event', 'faq_open', {
      send_to: gaId,
      faq_question: question,
    });
  }

  if (win.ym && ymId) {
    win.ym(ymId, 'reachGoal', 'faq_open');
    win.ym(ymId, 'params', { faq_question: question });
  }

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({
      event: 'faq_open',
      faq_question: question,
    });
  }
}

export function trackLead(eventId?: string): void {
  const win = window as Window & {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { track?: (...args: unknown[]) => void };
    ym?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  };

  const gaId = getGoogleAnalyticsId();
  const ymId = getYandexMetrikaId();

  if (win.gtag && gaId) {
    win.gtag('event', 'generate_lead', { send_to: gaId });
    win.gtag('event', 'form_submit', { send_to: gaId });
  }

  if (win.ym && ymId) {
    win.ym(ymId, 'reachGoal', 'lead');
    win.ym(ymId, 'reachGoal', 'form_submit');
  }

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: 'lead_submitted' });
    win.dataLayer.push({ event: 'form_submit' });
  }

  // Передаём eventID для дедупликации с серверным событием
  if (eventId) {
    win.fbq?.('track', 'Lead', { eventID: eventId });
  } else {
    win.fbq?.('track', 'Lead');
  }
  win.ttq?.track?.('SubmitForm');
}

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
