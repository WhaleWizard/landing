import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const SITE_CONTENT_KEYS = [
  'site:home',
  'service:meta-ads',
  'service:meta-apps',
  'service:google-ads',
  'service:consult',
  'site:faq',
];

const MAX_RESPONSE_BYTES = 100_000;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUsableContent(value) {
  return isRecord(value) && Object.keys(value).length > 0;
}

// The first deploy containing the canonical server-side compatibility reader
// is built while the previous production API can still return this superseded
// block. Keep the same exact fingerprint in the build path so that one deploy
// cannot bake the stale cards back into SEO HTML or the inline client seed.
export const LEGACY_META_ADS_CASES = {
  badge: 'С чем чаще всего приходят',
  titlePrefix: 'Где теряется результат',
  titleAccent: 'в Meta Ads',
  description: 'Лиды могут быть дорогими, не доходить до продаж, расходиться с аналитикой или перестать расти в объёме. Для каждой причины нужна своя проверка — универсальной «оптимизации кабинета» здесь нет.',
  items: [
    {
      title: 'Лиды есть, продаж мало',
      category: 'Услуги и B2B',
      description: 'Возвращаем из CRM статусы квалификации и продажи, чтобы видеть не только CPL, но и стоимость клиента.',
      stats: [
        { label: 'Заявка', value: 'CPL' },
        { label: 'Качество', value: 'CRM' },
        { label: 'Клиент', value: 'CAC' },
      ],
    },
    {
      title: 'Лиды слишком дорогие',
      category: 'Лидогенерация',
      description: 'Проверяем оффер, креатив, форму и посадочную по цепочке, чтобы понять, где именно теряется конверсия.',
      stats: [
        { label: 'Объявление', value: 'CTR' },
        { label: 'Страница', value: 'CR' },
        { label: 'Заявка', value: 'CPL' },
      ],
    },
    {
      title: 'Продажи есть, экономика не сходится',
      category: 'E-commerce',
      description: 'Проверяем Purchase, сумму покупки, CAPI, каталог и маржу. Оптимизируем кампании по продажам или выручке, когда данных уже достаточно.',
      stats: [
        { label: 'Покупка', value: 'CPA' },
        { label: 'Выручка', value: 'ROAS' },
        { label: 'Экономика', value: 'Маржа' },
      ],
    },
    {
      title: 'Кампании упёрлись в объём',
      category: 'Масштабирование',
      description: 'Добавляем новые креативные направления и увеличиваем бюджет поэтапно — с контролем цены и качества результата.',
      stats: [
        { label: 'Расход', value: 'Бюджет' },
        { label: 'Результат', value: 'CPA' },
        { label: 'Показы', value: 'Частота' },
      ],
    },
  ],
};

const LEGACY_DEFAULT_TYPOGRAPHY = {
  titleDesktop: 'standard',
  titleMobile: 'standard',
  body: 'standard',
  titleFont: 'auto',
  bodyFont: 'auto',
  titleMaxLinesDesktop: 0,
  titleMaxLinesMobile: 0,
  titleWeight: 'auto',
  titleLineHeight: 'auto',
  titleLetterSpacing: 'auto',
};

function exactLegacyTypography(value) {
  if (value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).length === 0) return false;
  return Object.entries(value).every(([key, current]) => (
    Object.prototype.hasOwnProperty.call(LEGACY_DEFAULT_TYPOGRAPHY, key)
    && LEGACY_DEFAULT_TYPOGRAPHY[key] === current
  ));
}

export function applyStoredSiteContentCompatibility(key, content) {
  if (key !== 'service:meta-ads' || !isRecord(content) || !isRecord(content.cases)) return content;
  const cases = content.cases;
  const exact = cases.badge === LEGACY_META_ADS_CASES.badge
    && cases.titlePrefix === LEGACY_META_ADS_CASES.titlePrefix
    && cases.titleAccent === LEGACY_META_ADS_CASES.titleAccent
    && cases.description === LEGACY_META_ADS_CASES.description
    && exactLegacyTypography(cases.typography)
    && Array.isArray(cases.items)
    && cases.items.length === LEGACY_META_ADS_CASES.items.length
    && LEGACY_META_ADS_CASES.items.every((expected, index) => {
      const item = cases.items[index];
      return isRecord(item)
        && item.title === expected.title
        && item.category === expected.category
        && item.description === expected.description
        && (item.visualSlot === undefined || item.visualSlot === index)
        && Array.isArray(item.stats)
        && item.stats.length === expected.stats.length
        && expected.stats.every((stat, statIndex) => (
          isRecord(item.stats[statIndex])
          && item.stats[statIndex].label === stat.label
          && item.stats[statIndex].value === stat.value
        ));
    });
  if (!exact) return content;
  const { cases: _legacyCases, ...current } = content;
  return current;
}

/**
 * Mirrors src/app/hooks/useServiceContent.ts. Keeping the same merge rules is
 * important: the interactive page and generated SEO HTML must resolve a
 * partial published override identically.
 */
export function mergePublishedContent(base, override) {
  if (Array.isArray(base)) {
    if (!Array.isArray(override)) return base;
    if (base.every((item) => !isRecord(item))) return override;
    if (base.length === 0) return override;
    return override.map((item, index) => {
      const requestedSlot = isRecord(item) && Number.isInteger(item.visualSlot)
        ? Number(item.visualSlot)
        : index;
      const safeSlot = requestedSlot >= 0 ? requestedSlot % base.length : index % base.length;
      return mergePublishedContent(base[safeSlot], item);
    });
  }

  if (isRecord(base)) {
    if (!isRecord(override)) return base;
    const next = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      next[key] = Object.prototype.hasOwnProperty.call(base, key)
        ? mergePublishedContent(base[key], value)
        : value;
    }
    return next;
  }

  return override === undefined || override === null ? base : override;
}

export function readSiteContentSnapshot(pathname) {
  if (!pathname || !existsSync(pathname)) return {};
  try {
    const parsed = JSON.parse(readFileSync(pathname, 'utf8'));
    // Version the cache format so ad-hoc/manual test fixtures from older
    // iterations can never leak into generated production HTML.
    if (parsed?.schemaVersion !== 1) return {};
    if (!isRecord(parsed?.sections)) return {};
    const sections = {};
    for (const key of SITE_CONTENT_KEYS) {
      const content = applyStoredSiteContentCompatibility(key, parsed.sections[key]);
      if (isUsableContent(content)) sections[key] = content;
    }
    return sections;
  } catch {
    return {};
  }
}

export function writeSiteContentSnapshot(pathname, sections) {
  if (!pathname) return;
  const safeSections = {};
  for (const key of SITE_CONTENT_KEYS) {
    const content = sections[key];
    if (isUsableContent(content)) safeSections[key] = content;
  }
  writeFileSync(pathname, `${JSON.stringify({ schemaVersion: 1, fetchedAt: new Date().toISOString(), sections: safeSections }, null, 2)}\n`, 'utf8');
}

async function fetchSection({ endpoint, key, fetchImpl, timeoutMs, buildToken }) {
  const url = new URL(endpoint);
  url.searchParams.set('key', key);
  // A unique build URL avoids reusing the public endpoint's short edge cache
  // immediately after an editor publication.
  url.searchParams.set('_seo_build', buildToken);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'WhaleWizard-SEO-Build/1.0',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_BYTES) throw new Error('response is too large');
    const payload = JSON.parse(raw);
    if (!payload?.success) throw new Error('endpoint returned success=false');

    // `source: static` is an authoritative answer that no published D1
    // override exists. It must clear a potentially stale local snapshot.
    const content = applyStoredSiteContentCompatibility(key, payload.content);
    if (payload.source !== 'd1' || !isUsableContent(content)) {
      return { key, status: 'static', content: null };
    }

    return { key, status: 'd1', content };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches published D1 text for SEO generation. The fallback chain is:
 * live public endpoint -> last successful local build snapshot -> source copy.
 * A network or schema failure is deliberately non-fatal so a code deployment
 * can never be blocked by the content endpoint.
 */
export async function loadPublishedSiteContent({
  endpoint,
  snapshotPath,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
  strict = false,
  logger = console,
} = {}) {
  const previous = readSiteContentSnapshot(snapshotPath);
  const resolved = { ...previous };
  const buildToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8_000;

  if (!endpoint || typeof fetchImpl !== 'function') {
    if (strict) throw new Error('[site-content] Public content endpoint is unavailable in strict mode.');
    logger.warn?.('[site-content] Public content endpoint is unavailable; using snapshot/source fallback.');
    return resolved;
  }

  const results = await Promise.allSettled(SITE_CONTENT_KEYS.map((key) => fetchSection({
    endpoint,
    key,
    fetchImpl,
    timeoutMs: effectiveTimeoutMs,
    buildToken,
  })));

  let successfulRequests = 0;
  const failedKeys = [];
  for (let index = 0; index < results.length; index += 1) {
    const key = SITE_CONTENT_KEYS[index];
    const result = results[index];
    if (result.status === 'rejected') {
      failedKeys.push(key);
      continue;
    }

    successfulRequests += 1;
    if (result.value.status === 'd1') resolved[key] = result.value.content;
    else delete resolved[key];
  }

  if (failedKeys.length) {
    if (strict) {
      throw new Error(`[site-content] Strict refresh failed for ${failedKeys.join(', ')}.`);
    }
    logger.warn?.(`[site-content] Could not refresh ${failedKeys.join(', ')}; using snapshot/source fallback.`);
  }

  // Do not overwrite a useful snapshot on a total outage. Partial success is
  // safe: successful `static` answers remove stale entries, failed keys retain
  // their last known published value.
  if (successfulRequests > 0) {
    try {
      writeSiteContentSnapshot(snapshotPath, resolved);
    } catch {
      logger.warn?.('[site-content] Could not update the local build snapshot; continuing with in-memory content.');
    }
  }

  return resolved;
}
