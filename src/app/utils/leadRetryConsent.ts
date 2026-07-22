export type RetryConsentSnapshot = {
  categories: { marketing: boolean };
} | null;

const MARKETING_CONTEXT_FIELDS = [
  'external_id',
  'em',
  'ph',
  'fn',
  'ln',
  'zp',
  'ge',
  'dobd',
  'dobm',
  'doby',
  'madid',
  'fbp',
  'fbc',
  'fbclid',
  'landing_page_url',
  'first_touch_url',
  'first_touch_at',
  'last_touch_url',
  'last_touch_at',
  'session_id',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'gclid',
  'wbraid',
  'gbraid',
  'yclid',
  'ga_client_id',
  'yandex_client_id',
  'page_url',
  'page_location',
  'page_path',
  'page_title',
  'lead_source_page',
  'referrer',
  'event_source_url',
  'browser_language',
  'screen_width',
  'screen_height',
  'viewport_width',
  'viewport_height',
  'device_pixel_ratio',
  'timezone_offset',
  'value',
  'currency',
  'order_id',
  'contents',
  'num_items',
  'predicted_ltv',
  'status',
  'lead_id',
  'search_string',
  'content_ids',
  'content_type',
] as const;

function isPayloadRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}

export function applyConsentDowngrade(payload: unknown, consent: RetryConsentSnapshot): unknown {
  if (!isPayloadRecord(payload)) return payload;

  const nextPayload: Record<string, unknown> = { ...payload };
  const originallyGranted = payload.marketing_consent === true;
  const currentlyGranted = consent?.categories.marketing === true;
  const hasMarketingConsent = originallyGranted && currentlyGranted;
  nextPayload.marketing_consent = hasMarketingConsent;

  if (!hasMarketingConsent) {
    // Preserve the original consent receipt for audit, but only allow consent
    // to move from granted to denied. Contact and form fields stay intact;
    // marketing identifiers, attribution, page/referrer and device context do not.
    for (const field of MARKETING_CONTEXT_FIELDS) delete nextPayload[field];
  }

  return nextPayload;
}
