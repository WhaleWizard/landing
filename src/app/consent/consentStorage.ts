/**
 * Хранилище согласия на cookie — отдельно от остального трекинга.
 *
 * Очередь досылки заявок (`utils/leadRetryQueue.ts`) запускается из `main.tsx`
 * на каждой странице и ей нужно только прочитать согласие. Пока чтение жило
 * в `consent.ts`, вместе с ним во входной чанк попадали 24 КБ кода пикселей,
 * хеширования и атрибуции, которые на первом экране никому не нужны. Здесь
 * только запись, чтение и сброс; сам трекинг остаётся в `consent.ts` и
 * подгружается, когда до него доходит дело.
 *
 * Ключи Meta перечислены тут же: при отзыве маркетингового согласия стираются
 * именно они, и список обязан быть один на двоих.
 */

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

export const CONSENT_VERSION = 1;
export const CONSENT_KEY = 'ww_cookie_consent_v1';
export const META_EXTERNAL_ID_KEY = 'ww_meta_external_id_v1';
export const META_FIRST_TOUCH_KEY = 'ww_meta_first_touch_v1';
export const META_LAST_TOUCH_KEY = 'ww_meta_last_touch_v1';
export const META_SESSION_ID_KEY = 'ww_meta_session_id_v1';
export const META_FBC_KEY = 'ww_meta_fbc_v1';
export const META_FBP_KEY = 'ww_meta_fbp_v1';
export const META_ATTRIBUTION_KEY = 'ww_meta_attribution_v1';
export const META_USER_DATA_KEY = 'ww_meta_user_data_v1';
export const CONSENT_TTL_DAYS = 180;

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

  // Браузер с запретом на данные сайта бросает исключение прямо на записи.
  // Раньше оно вылетало из обработчика кнопки «Принять»: согласие не
  // применялось, пиксели не грузились, и в Meta не уходило ничего. Решение
  // посетителя важнее его сохранения — сначала применяем, потом запоминаем.
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  } catch {
    // Согласие проживёт текущую вкладку: cookie ниже ставится отдельно.
  }
  document.cookie = `${CONSENT_KEY}=1; Max-Age=${CONSENT_TTL_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax; Secure`;
  if (!consent.categories.marketing) clearMetaMarketingStorage();

  return consent;
}

export function clearConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Хранилище недоступно — стирать нечего, cookie снимается ниже.
  }
  document.cookie = `${CONSENT_KEY}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
  clearMetaMarketingStorage();
}

export function clearMetaMarketingStorage(): void {
  try {
    for (const key of [
      META_EXTERNAL_ID_KEY,
      META_FIRST_TOUCH_KEY,
      META_LAST_TOUCH_KEY,
      META_SESSION_ID_KEY,
      META_FBC_KEY,
      META_FBP_KEY,
      META_ATTRIBUTION_KEY,
      META_USER_DATA_KEY,
    ]) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in private/restricted browser contexts.
  }

  try {
    const host = window.location.hostname;
    const rootDomain = host.split('.').slice(-2).join('.');
    for (const cookieName of ['_fbp', '_fbc']) {
      document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
      if (host.includes('.') && !/^\d+(?:\.\d+){3}$/.test(host)) {
        document.cookie = `${cookieName}=; Max-Age=0; Path=/; Domain=.${rootDomain}; SameSite=Lax; Secure`;
      }
    }
  } catch {
    // Cookie access may be unavailable.
  }
}
