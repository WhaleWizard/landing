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
const META_EXTERNAL_ID_KEY = 'ww_meta_external_id_v1';
const META_FIRST_TOUCH_KEY = 'ww_meta_first_touch_v1';
const META_LAST_TOUCH_KEY = 'ww_meta_last_touch_v1';
const META_SESSION_ID_KEY = 'ww_meta_session_id_v1';
const META_FBC_KEY = 'ww_meta_fbc_v1';
const META_ATTRIBUTION_KEY = 'ww_meta_attribution_v1';
const META_USER_DATA_KEY = 'ww_meta_user_data_v1';
const CONSENT_TTL_DAYS = 180;
const META_SESSION_TTL_MS = 30 * 60 * 1000;
const META_FBC_TTL_MS = 90 * 24 * 60 * 60 * 1000;
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


function shouldUseTagManagerForAnalytics(): boolean {
  const mode = env('VITE_ANALYTICS_RUNTIME').toLowerCase();
  if (mode === 'direct') return false;
  if (mode === 'gtm') return true;
  return true;
}

export async function ensureAnalyticsLoaded(): Promise<void> {
  const gaId = getGoogleAnalyticsId();
  const ymId = getYandexMetrikaId();
  const gtmId = getGoogleTagManagerId();
  const useTagManagerRuntime = shouldUseTagManagerForAnalytics();

  if (!analyticsConfigLogged) {
    console.info('[analytics] bootstrap config', {
      gtmId,
      gaId,
      ymId,
      hasDataLayer: Array.isArray((window as Window & { dataLayer?: unknown[] }).dataLayer),
      analyticsRuntime: useTagManagerRuntime ? 'gtm' : 'direct',
    });
    analyticsConfigLogged = true;
  }

  if (useTagManagerRuntime && gtmId && !gtmLoaded) {
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

  if (!useTagManagerRuntime && gaId && !gaLoaded) {
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

  if (!useTagManagerRuntime && ymId && !ymLoaded) {
    try {
      await appendExternalScript('https://mc.yandex.ru/metrika/tag.js');
      const win = window as Window & {
        ym?: (...args: unknown[]) => void;
        dataLayer?: unknown[];
        [key: `yaCounter${number}`]: unknown;
      };
      win.dataLayer = win.dataLayer || [];

      if (!win.ym) {
        win.ym = (...args: unknown[]) => {
          ((win as unknown as { yandex_metrika_calls?: unknown[][] }).yandex_metrika_calls ||= []).push(args);
        };
      }

      const existingCounterKey = `yaCounter${ymId}` as const;
      const hasExistingCounter = typeof win[existingCounterKey] !== 'undefined';

      if (!hasExistingCounter) {
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
      }
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
    const browserContext = getMetaBrowserContext(window.location.pathname);
    const advancedMatching = {
      external_id: browserContext.external_id,
      em: browserContext.em,
      ph: browserContext.ph,
      fn: browserContext.fn,
      ln: browserContext.ln,
    };
    const hasAdvancedMatching = Object.values(advancedMatching).some(Boolean);
    if (hasAdvancedMatching) {
      win.fbq?.('init', metaId, advancedMatching);
    } else {
      win.fbq?.('init', metaId);
    }
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

export type MetaBrowserContext = {
  page_title?: string;
  page_path?: string;
  page_location?: string;
  referrer?: string;
  external_id?: string;
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  landing_page_url?: string;
  first_touch_url?: string;
  first_touch_at?: string;
  last_touch_url?: string;
  last_touch_at?: string;
  session_id?: string;
  browser_language?: string;
  screen_width?: number;
  screen_height?: number;
  viewport_width?: number;
  viewport_height?: number;
  device_pixel_ratio?: number;
  timezone_offset?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  yclid?: string;
  marketing_consent?: boolean;
  consent_version?: number;
  consent_source?: ConsentRecord['source'];
  consent_region?: string;
  consent_timestamp?: number;
  event_time?: number;
};


function safeReadLocalStorage(key: string): string | undefined {
  try {
    return localStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
}

function safeWriteLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in private mode; analytics still works without it.
  }
}


type StoredMetaUserData = {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  updatedAt: number;
  expiresAt: number;
};

const META_USER_DATA_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function normalizeEmailForMeta(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhoneForMeta(value: string): string {
  return value.trim().replace(/\D/g, '');
}

function normalizeTextForMeta(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function splitNameForMeta(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
  };
}

function isSha256Hex(value: string | undefined): boolean {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getStoredMetaUserData(now = Date.now()): Pick<StoredMetaUserData, 'em' | 'ph' | 'fn' | 'ln'> {
  const raw = safeReadLocalStorage(META_USER_DATA_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as StoredMetaUserData;
    if (!parsed || parsed.expiresAt <= now) return {};
    return {
      em: isSha256Hex(parsed.em) ? parsed.em : undefined,
      ph: isSha256Hex(parsed.ph) ? parsed.ph : undefined,
      fn: isSha256Hex(parsed.fn) ? parsed.fn : undefined,
      ln: isSha256Hex(parsed.ln) ? parsed.ln : undefined,
    };
  } catch {
    return {};
  }
}

export async function rememberMetaLeadIdentifiers(input: { email?: string; phone?: string; name?: string }): Promise<void> {
  if (!hasMarketingConsent()) return;

  const now = Date.now();
  const existing = getStoredMetaUserData(now);
  const email = input.email ? normalizeEmailForMeta(input.email) : '';
  const phone = input.phone ? normalizePhoneForMeta(input.phone) : '';
  const { firstName, lastName } = input.name ? splitNameForMeta(input.name) : {};

  const [em, ph, fn, ln] = await Promise.all([
    email ? sha256Hex(email) : Promise.resolve(existing.em),
    phone ? sha256Hex(phone) : Promise.resolve(existing.ph),
    firstName ? sha256Hex(normalizeTextForMeta(firstName)) : Promise.resolve(existing.fn),
    lastName ? sha256Hex(normalizeTextForMeta(lastName)) : Promise.resolve(existing.ln),
  ]);

  if (!em && !ph && !fn && !ln) return;

  safeWriteLocalStorage(META_USER_DATA_KEY, JSON.stringify({
    em,
    ph,
    fn,
    ln,
    updatedAt: now,
    expiresAt: now + META_USER_DATA_TTL_MS,
  } satisfies StoredMetaUserData));
}

function getCookieValue(name: string): string | undefined {
  const encodedName = `${name}=`;
  const pair = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName));
  if (!pair) return undefined;
  try {
    return decodeURIComponent(pair.slice(encodedName.length));
  } catch {
    return pair.slice(encodedName.length);
  }
}

function getUrlParam(url: URL, name: string): string | undefined {
  return url.searchParams.get(name)?.trim() || undefined;
}

function createFbcFromFbclid(fbclid: string | undefined, timestampMs = Date.now()): string | undefined {
  return fbclid ? `fb.1.${timestampMs}.${fbclid}` : undefined;
}

type StoredFbc = {
  fbclid: string;
  value: string;
  expiresAt: number;
};

function readStoredFbc(now = Date.now()): StoredFbc | undefined {
  const raw = safeReadLocalStorage(META_FBC_KEY);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as StoredFbc;
    if (!parsed?.value || !parsed.fbclid || parsed.expiresAt <= now) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function getOrCreateFbc(fbclid: string | undefined): string | undefined {
  const now = Date.now();
  const stored = readStoredFbc(now);

  if (!fbclid) return stored?.value;
  if (stored?.fbclid === fbclid && stored.expiresAt > now) return stored.value;

  const value = createFbcFromFbclid(fbclid, now);
  if (value) {
    safeWriteLocalStorage(META_FBC_KEY, JSON.stringify({
      fbclid,
      value,
      expiresAt: now + META_FBC_TTL_MS,
    } satisfies StoredFbc));
  }

  return value;
}

type StoredSession = {
  id: string;
  lastSeenAt: number;
  expiresAt: number;
};

function persistSession(id: string, now = Date.now()): string {
  safeWriteLocalStorage(META_SESSION_ID_KEY, JSON.stringify({
    id,
    lastSeenAt: now,
    expiresAt: now + META_SESSION_TTL_MS,
  } satisfies StoredSession));
  return id;
}

function getOrCreateSessionId(): string | undefined {
  const now = Date.now();
  const existing = safeReadLocalStorage(META_SESSION_ID_KEY);

  if (existing) {
    try {
      const parsed = JSON.parse(existing) as StoredSession;
      if (parsed?.id && parsed.expiresAt > now) {
        return persistSession(parsed.id, now);
      }
    } catch {
      // Backward compatibility with the previous plain-string session ID format.
      return persistSession(existing, now);
    }
  }

  try {
    return persistSession(crypto.randomUUID(), now);
  } catch {
    return undefined;
  }
}

type TouchPoint = {
  url: string;
  at: string;
};

function captureTouchPoint(url: string): { firstTouch: TouchPoint; lastTouch: TouchPoint } {
  const now = new Date().toISOString();
  const firstRaw = safeReadLocalStorage(META_FIRST_TOUCH_KEY);
  let firstTouch: TouchPoint | undefined;
  if (firstRaw) {
    try {
      firstTouch = JSON.parse(firstRaw) as TouchPoint;
    } catch {
      firstTouch = undefined;
    }
  }

  if (!firstTouch?.url) {
    firstTouch = { url, at: now };
    safeWriteLocalStorage(META_FIRST_TOUCH_KEY, JSON.stringify(firstTouch));
  }

  const lastTouch = { url, at: now };
  safeWriteLocalStorage(META_LAST_TOUCH_KEY, JSON.stringify(lastTouch));
  return { firstTouch, lastTouch };
}

function getOrCreateMetaExternalId(): string | undefined {
  const existing = safeReadLocalStorage(META_EXTERNAL_ID_KEY);
  if (existing) return existing;

  try {
    const id = crypto.randomUUID();
    safeWriteLocalStorage(META_EXTERNAL_ID_KEY, id);
    return id;
  } catch {
    return undefined;
  }
}

type StoredAttribution = {
  values: Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term' | 'utm_id' | 'fbclid' | 'gclid' | 'wbraid' | 'gbraid' | 'yclid', string>>;
  expiresAt: number;
};

function readStoredAttribution(now = Date.now()): StoredAttribution['values'] {
  const raw = safeReadLocalStorage(META_ATTRIBUTION_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed?.values || parsed.expiresAt <= now) return {};
    return parsed.values;
  } catch {
    return {};
  }
}

function getAttributionWithFallback(currentUrl: URL): StoredAttribution['values'] {
  const current = {
    utm_source: getUrlParam(currentUrl, 'utm_source'),
    utm_medium: getUrlParam(currentUrl, 'utm_medium'),
    utm_campaign: getUrlParam(currentUrl, 'utm_campaign'),
    utm_content: getUrlParam(currentUrl, 'utm_content'),
    utm_term: getUrlParam(currentUrl, 'utm_term'),
    utm_id: getUrlParam(currentUrl, 'utm_id'),
    fbclid: getUrlParam(currentUrl, 'fbclid'),
    gclid: getUrlParam(currentUrl, 'gclid'),
    wbraid: getUrlParam(currentUrl, 'wbraid'),
    gbraid: getUrlParam(currentUrl, 'gbraid'),
    yclid: getUrlParam(currentUrl, 'yclid'),
  };

  const stored = readStoredAttribution();
  const merged = { ...stored };
  let hasCurrentValue = false;

  for (const [key, value] of Object.entries(current)) {
    if (value) {
      merged[key as keyof StoredAttribution['values']] = value;
      hasCurrentValue = true;
    }
  }

  if (hasCurrentValue) {
    safeWriteLocalStorage(META_ATTRIBUTION_KEY, JSON.stringify({
      values: merged,
      expiresAt: Date.now() + META_FBC_TTL_MS,
    } satisfies StoredAttribution));
  }

  return merged;
}

function getConsentSnapshot(): Pick<MetaBrowserContext, 'marketing_consent' | 'consent_version' | 'consent_source' | 'consent_region' | 'consent_timestamp'> {
  const consent = loadConsent();
  return {
    marketing_consent: consent?.categories.marketing === true,
    consent_version: consent?.version,
    consent_source: consent?.source,
    consent_region: consent?.region,
    consent_timestamp: consent?.timestamp,
  };
}

function hasMarketingConsent(): boolean {
  return getConsentSnapshot().marketing_consent === true;
}

export function getMetaBrowserContext(pagePath = window.location.pathname): MetaBrowserContext {
  const currentUrl = new URL(window.location.href);
  const attribution = getAttributionWithFallback(currentUrl);
  const fbclid = attribution.fbclid;
  const { firstTouch, lastTouch } = captureTouchPoint(window.location.href);
  const consentSnapshot = getConsentSnapshot();
  const storedUserData = getStoredMetaUserData();

  return {
    page_title: document.title || undefined,
    page_path: pagePath,
    page_location: window.location.href,
    referrer: document.referrer || undefined,
    external_id: getOrCreateMetaExternalId(),
    em: storedUserData.em,
    ph: storedUserData.ph,
    fn: storedUserData.fn,
    ln: storedUserData.ln,
    fbp: getCookieValue('_fbp'),
    fbc: getCookieValue('_fbc') || getOrCreateFbc(fbclid),
    fbclid,
    ...consentSnapshot,
    landing_page_url: firstTouch.url,
    first_touch_url: firstTouch.url,
    first_touch_at: firstTouch.at,
    last_touch_url: lastTouch.url,
    last_touch_at: lastTouch.at,
    session_id: getOrCreateSessionId(),
    browser_language: navigator.language || undefined,
    screen_width: window.screen?.width,
    screen_height: window.screen?.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    device_pixel_ratio: window.devicePixelRatio,
    timezone_offset: new Date().getTimezoneOffset(),
    event_time: Math.floor(Date.now() / 1000),
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_content: attribution.utm_content,
    utm_term: attribution.utm_term,
    utm_id: attribution.utm_id,
    gclid: attribution.gclid,
    wbraid: attribution.wbraid,
    gbraid: attribution.gbraid,
    yclid: attribution.yclid,
  };
}

type ServerPageViewPayload = MetaBrowserContext & {
  event_id: string;
  page_url: string;
};

function sendServerPageView(payload: ServerPageViewPayload): void {
  const body = JSON.stringify(payload);

  // 1) Prefer sendBeacon when available to survive quick navigations/unloads.
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      const queued = navigator.sendBeacon('/api/pageview', blob);
      if (queued) return;
    } catch {
      // fallback to fetch below
    }
  }

  // 2) keepalive fetch + single retry for transient failures.
  fetch('/api/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'same-origin',
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    })
    .catch((e) => {
      console.warn('[PageView] Failed to send server event, retrying once', e);
      window.setTimeout(() => {
        fetch('/api/pageview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
          credentials: 'same-origin',
        }).catch((err) => console.warn('[PageView] Retry failed', err));
      }, 800);
    });
}


type MetaEventName = 'ViewContent' | 'FormStart' | 'Contact' | 'LeadFormView' | 'EngagedView';

type ServerMetaEventPayload = MetaBrowserContext & {
  event_name: MetaEventName;
  event_id: string;
  page_url: string;
  service?: string;
  service_slug?: string;
  form_id?: string;
  form_step?: string;
  form_field?: string;
  engagement_type?: string;
  engagement_seconds?: number;
  scroll_depth?: number;
  contact_channel?: string;
  placement?: string;
  content_name?: string;
  content_category?: string;
  content_type?: string;
  content_ids?: string[];
};

type MetaPageContent = {
  service: string;
  content_name: string;
  content_category: string;
  content_type: string;
  content_ids: string[];
};

const SERVICE_CONTENT: Record<string, MetaPageContent> = {
  '/': {
    service: 'WhaleWzrd main landing',
    content_name: 'WhaleWzrd main landing',
    content_category: 'main_landing',
    content_type: 'website',
    content_ids: ['home'],
  },
  '/meta-ads': {
    service: 'Meta Ads',
    content_name: 'Meta Ads audit landing',
    content_category: 'paid_social_service',
    content_type: 'service',
    content_ids: ['meta-ads'],
  },
  '/google-ads': {
    service: 'Google Ads',
    content_name: 'Google Ads audit landing',
    content_category: 'paid_search_service',
    content_type: 'service',
    content_ids: ['google-ads'],
  },
  '/consult': {
    service: 'Консультация',
    content_name: 'Expert consultation landing',
    content_category: 'consulting_service',
    content_type: 'service',
    content_ids: ['consult'],
  },
  '/calculator': {
    service: 'Budget calculator',
    content_name: 'Budget calculator page',
    content_category: 'calculator',
    content_type: 'tool',
    content_ids: ['calculator'],
  },
  '/roi-calculator': {
    service: 'ROI calculator',
    content_name: 'ROI calculator page',
    content_category: 'calculator',
    content_type: 'tool',
    content_ids: ['roi-calculator'],
  },
  '/thank-you': {
    service: 'Lead confirmation',
    content_name: 'Thank you page',
    content_category: 'conversion_confirmation',
    content_type: 'page',
    content_ids: ['thank-you'],
  },
  '/blog': {
    service: 'Marketing blog',
    content_name: 'Blog listing page',
    content_category: 'blog',
    content_type: 'article_index',
    content_ids: ['blog'],
  },
  '/faq': {
    service: 'FAQ',
    content_name: 'FAQ page',
    content_category: 'support_content',
    content_type: 'page',
    content_ids: ['faq'],
  },
  '/marketing-glossary': {
    service: 'Marketing glossary',
    content_name: 'Marketing glossary page',
    content_category: 'education_content',
    content_type: 'page',
    content_ids: ['marketing-glossary'],
  },
  '/privacy-policy': {
    service: 'Privacy policy',
    content_name: 'Privacy policy page',
    content_category: 'legal_page',
    content_type: 'page',
    content_ids: ['privacy-policy'],
  },
  '/offer': {
    service: 'Offer',
    content_name: 'Offer page',
    content_category: 'legal_page',
    content_type: 'page',
    content_ids: ['offer'],
  },
  '/cookie-policy': {
    service: 'Cookie policy',
    content_name: 'Cookie policy page',
    content_category: 'legal_page',
    content_type: 'page',
    content_ids: ['cookie-policy'],
  },
};

function normalizePathnameForMeta(path: string): string {
  const pathname = path.split('?')[0].split('#')[0] || '/';
  if (pathname === '/') return pathname;
  return pathname.replace(/\/$/, '');
}

function slugifyContentId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9а-яё_-]+/giu, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'unknown-page';
}

function getMetaPageContent(path: string): MetaPageContent {
  const pathname = normalizePathnameForMeta(path);
  const staticContent = SERVICE_CONTENT[pathname];
  if (staticContent) return staticContent;

  if (pathname.startsWith('/blog/')) {
    const articleSlug = slugifyContentId(pathname.slice('/blog/'.length));
    return {
      service: 'Marketing blog article',
      content_name: document.title || `Blog article ${articleSlug}`,
      content_category: 'blog_article',
      content_type: 'article',
      content_ids: [`blog-${articleSlug}`],
    };
  }

  const genericId = slugifyContentId(pathname);
  return {
    service: 'WhaleWzrd site page',
    content_name: document.title || `WhaleWzrd ${genericId}`,
    content_category: 'site_page',
    content_type: 'page',
    content_ids: [`page-${genericId}`],
  };
}

function sendServerMetaEvent(payload: ServerMetaEventPayload): void {
  if (!payload.marketing_consent) return;

  const body = JSON.stringify(payload);
  fetch('/api/meta-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'same-origin',
  }).catch((err) => console.warn(`[Meta ${payload.event_name}] Server event failed`, err));
}

export function trackServiceViewContent(path: string, options: { marketing?: boolean } = {}): void {
  if (options.marketing === false) return;

  const content = getMetaPageContent(path);

  const eventId = crypto.randomUUID();
  const browserContext = getMetaBrowserContext(path);
  if (!browserContext.marketing_consent) return;

  const eventData = {
    ...content,
    service_slug: content.content_ids[0],
    page_path: browserContext.page_path,
    page_location: browserContext.page_location,
  };

  const win = window as Window & {
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  };

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: 'view_content', event_id: eventId, ...eventData });
  }

  win.fbq?.('track', 'ViewContent', eventData, { eventID: eventId });

  sendServerMetaEvent({
    event_name: 'ViewContent',
    event_id: eventId,
    page_url: window.location.href,
    ...browserContext,
    ...eventData,
  });
}

export function trackFormStart(serviceSlug: string, extraData: Record<string, unknown> = {}): boolean {
  const browserContext = getMetaBrowserContext(window.location.pathname);
  if (!browserContext.marketing_consent) return false;

  const eventId = crypto.randomUUID();
  const serviceContent = getMetaPageContent(window.location.pathname);
  const eventData = {
    form_id: 'service_landing_form',
    form_step: 'first_interaction',
    service_slug: serviceSlug,
    service: serviceContent?.service || serviceSlug,
    content_name: serviceContent?.content_name || document.title,
    content_category: serviceContent?.content_category || 'lead_form',
    content_type: serviceContent?.content_type || 'service',
    content_ids: serviceContent?.content_ids || [serviceSlug],
    page_path: browserContext.page_path,
    page_location: browserContext.page_location,
    ...extraData,
  };

  const win = window as Window & {
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  };

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: 'form_start', event_id: eventId, ...eventData });
  }

  win.fbq?.('trackCustom', 'FormStart', eventData, { eventID: eventId });

  sendServerMetaEvent({
    event_name: 'FormStart',
    event_id: eventId,
    page_url: window.location.href,
    ...browserContext,
    ...(eventData as Omit<ServerMetaEventPayload, keyof MetaBrowserContext | 'event_name' | 'event_id' | 'page_url'>),
  });

  return true;
}


const leadFormViewTracked = new Set<string>();
const engagedViewTracked = new Set<string>();

export function trackLeadFormView(serviceSlug: string): boolean {
  const browserContext = getMetaBrowserContext(window.location.pathname);
  if (!browserContext.marketing_consent) return false;

  const key = `${window.location.pathname}:${serviceSlug}`;
  if (leadFormViewTracked.has(key)) return false;
  leadFormViewTracked.add(key);

  const eventId = crypto.randomUUID();
  const serviceContent = getMetaPageContent(window.location.pathname);
  const eventData = {
    form_id: 'service_landing_form',
    form_step: 'view',
    service_slug: serviceSlug,
    service: serviceContent?.service || serviceSlug,
    content_name: serviceContent?.content_name || document.title,
    content_category: serviceContent?.content_category || 'lead_form',
    content_type: serviceContent?.content_type || 'service',
    content_ids: serviceContent?.content_ids || [serviceSlug],
    page_path: browserContext.page_path,
    page_location: browserContext.page_location,
  };

  const win = window as Window & { fbq?: (...args: unknown[]) => void; dataLayer?: unknown[] };
  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: 'lead_form_view', event_id: eventId, ...eventData });
  }
  win.fbq?.('trackCustom', 'LeadFormView', eventData, { eventID: eventId });

  sendServerMetaEvent({
    event_name: 'LeadFormView',
    event_id: eventId,
    page_url: window.location.href,
    ...browserContext,
    ...(eventData as Omit<ServerMetaEventPayload, keyof MetaBrowserContext | 'event_name' | 'event_id' | 'page_url'>),
  });

  return true;
}

export function trackEngagedView(reason: 'time_10s' | 'scroll_50' | 'form_view', extraData: Record<string, unknown> = {}): boolean {
  const browserContext = getMetaBrowserContext(window.location.pathname);
  if (!browserContext.marketing_consent) return false;

  const key = `${window.location.pathname}:${reason}`;
  if (engagedViewTracked.has(key)) return false;
  engagedViewTracked.add(key);

  const eventId = crypto.randomUUID();
  const serviceContent = getMetaPageContent(window.location.pathname);
  const eventData = {
    engagement_type: reason,
    service: serviceContent?.service,
    service_slug: serviceContent?.content_ids?.[0],
    content_name: serviceContent?.content_name || document.title,
    content_category: serviceContent?.content_category || 'engagement',
    content_type: serviceContent?.content_type || 'page',
    content_ids: serviceContent?.content_ids,
    page_path: browserContext.page_path,
    page_location: browserContext.page_location,
    ...extraData,
  };

  const win = window as Window & { fbq?: (...args: unknown[]) => void; dataLayer?: unknown[] };
  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: 'engaged_view', event_id: eventId, ...eventData });
  }
  win.fbq?.('trackCustom', 'EngagedView', eventData, { eventID: eventId });

  sendServerMetaEvent({
    event_name: 'EngagedView',
    event_id: eventId,
    page_url: window.location.href,
    ...browserContext,
    ...(eventData as Omit<ServerMetaEventPayload, keyof MetaBrowserContext | 'event_name' | 'event_id' | 'page_url'>),
  });

  return true;
}

export function trackContact(channel: 'telegram' | 'whatsapp' | 'email' | 'phone' | 'social', placement: string, extraData: Record<string, unknown> = {}): boolean {
  const browserContext = getMetaBrowserContext(window.location.pathname);
  if (!browserContext.marketing_consent) return false;

  const eventId = crypto.randomUUID();
  const serviceContent = getMetaPageContent(window.location.pathname);
  const eventData = {
    contact_channel: channel,
    placement,
    service: serviceContent?.service,
    service_slug: serviceContent?.content_ids?.[0],
    content_name: serviceContent?.content_name || document.title,
    content_category: 'contact_intent',
    content_type: 'contact_link',
    content_ids: serviceContent?.content_ids,
    page_path: browserContext.page_path,
    page_location: browserContext.page_location,
    ...extraData,
  };

  const win = window as Window & { fbq?: (...args: unknown[]) => void; dataLayer?: unknown[] };
  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: 'contact', event_id: eventId, ...eventData });
  }
  win.fbq?.('track', 'Contact', eventData, { eventID: eventId });

  sendServerMetaEvent({
    event_name: 'Contact',
    event_id: eventId,
    page_url: window.location.href,
    ...browserContext,
    ...(eventData as Omit<ServerMetaEventPayload, keyof MetaBrowserContext | 'event_name' | 'event_id' | 'page_url'>),
  });

  return true;
}

export function trackPageView(path: string, options: { marketing?: boolean } = {}): void {
  const now = Date.now();
  const shouldTrackMarketing = options.marketing !== false;
  const trackingKey = `${path}|marketing:${shouldTrackMarketing ? 'on' : 'off'}`;
  if (trackingKey === lastTrackedPath && now - lastTrackedAt < 1200) return;
  lastTrackedPath = trackingKey;
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
      event_id: eventId,
      page_path: path,
      page_location: window.location.href,
    });
  }

  if (!shouldTrackMarketing) return;

  const browserContext = getMetaBrowserContext(path);
  if (!browserContext.marketing_consent) return;

  const pageViewData = {
    page_title: browserContext.page_title,
    page_path: browserContext.page_path,
    page_location: browserContext.page_location,
    referrer: browserContext.referrer,
  };

  // Браузерный PageView с eventID для дедупликации
  win.fbq?.('track', 'PageView', pageViewData, { eventID: eventId });
  win.ttq?.page?.();

  // Отправляем серверный PageView через наш API (устойчиво к быстрым переходам)
  sendServerPageView({
    event_id: eventId,
    page_url: window.location.href,
    ...browserContext,
  });

  window.setTimeout(() => {
    trackEngagedView('time_10s', { engagement_seconds: 10 });
  }, 10_000);
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

export function trackLead(eventId?: string, eventData: Record<string, unknown> = {}): void {
  const win = window as Window & {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { track?: (...args: unknown[]) => void };
    ym?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  };

  const hasLeadMarketingConsent = eventData.marketing_consent === true;
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
    win.dataLayer.push({ event: 'lead_submitted', ...eventData, event_id: eventId });
    win.dataLayer.push({ event: 'form_submit', ...eventData, event_id: eventId });
  }

  if (!hasLeadMarketingConsent) return;

  // Передаём eventID 4-м аргументом fbq для дедупликации с серверным событием
  if (eventId) {
    win.fbq?.('track', 'Lead', eventData, { eventID: eventId });
  } else {
    win.fbq?.('track', 'Lead', eventData);
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