import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

const files = {
  contactForm: readFileSync('src/app/components/ContactForm.tsx', 'utf8'),
  pageview: readFileSync('functions/api/pageview.ts', 'utf8'),
  lead: readFileSync('functions/api/lead.ts', 'utf8'),
  metaEvent: readFileSync('functions/api/meta-event.ts', 'utf8'),
  consent: readFileSync('src/app/consent/consent.ts', 'utf8'),
  cookieConsentManager: readFileSync('src/app/components/cookie/CookieConsentManager.tsx', 'utf8'),
  landingForm: readFileSync('src/app/components/LandingForm.tsx', 'utf8'),
  metaTestEvent: readFileSync('functions/api/meta-test-event.ts', 'utf8'),
  diagnosticsSummary: readFileSync('functions/api/meta-diagnostics-summary.ts', 'utf8'),
  diagnosticsCoverage: readFileSync('functions/api/meta-diagnostics-coverage.ts', 'utf8'),
  diagnosticsAlerts: readFileSync('functions/api/meta-diagnostics-alerts.ts', 'utf8'),
  diagnosticsFunnel: readFileSync('functions/api/meta-diagnostics-funnel.ts', 'utf8'),
  diagnosticsAnomalies: readFileSync('functions/api/meta-diagnostics-anomalies.ts', 'utf8'),
  diagnosticsWriter: readFileSync('functions/_lib/meta-diagnostics.ts', 'utf8'),
  outbox: readFileSync('functions/_lib/meta-outbox.ts', 'utf8'),
  metaCapi: readFileSync('functions/_lib/meta-capi.ts', 'utf8'),
  leadStore: readFileSync('functions/_lib/leads.ts', 'utf8'),
  leadQuality: readFileSync('functions/_lib/lead-quality.ts', 'utf8'),
  leadConsentMigration: readFileSync('migrations/0015_lead_consent_receipts.sql', 'utf8'),
  leadIngestionMigration: readFileSync('migrations/0019_lead_ingestion_idempotency.sql', 'utf8'),
  diagnosticsRetentionMigration: readFileSync('migrations/0016_meta_diagnostics_retention.sql', 'utf8'),
  adminLeadsApi: readFileSync('functions/api/admin/leads.ts', 'utf8'),
  adminLeadQualityStatus: readFileSync('functions/_lib/admin-lead-quality-status.ts', 'utf8'),
  adminLeadsUi: readFileSync('src/app/components/admin/AdminLeads.tsx', 'utf8'),
  adminHealth: readFileSync('functions/api/admin/health.ts', 'utf8'),
  adminMetaCenter: readFileSync('functions/api/admin/meta-center.ts', 'utf8'),
  trackingSignature: readFileSync('functions/_lib/tracking-signature.ts', 'utf8'),
  trackingSignatureMigration: readFileSync('migrations/0018_tracking_request_nonces.sql', 'utf8'),
  leadRetryQueue: readFileSync('src/app/utils/leadRetryQueue.ts', 'utf8'),
  leadRetryConsent: readFileSync('src/app/utils/leadRetryConsent.ts', 'utf8'),
  routes: readFileSync('src/app/routes.tsx', 'utf8'),
  envTypes: readFileSync('functions/_lib/types.ts', 'utf8'),
  envExample: readFileSync('.env.example', 'utf8'),
  cloudflareSetupDoc: readFileSync('docs/META_CAPI_CLOUDFLARE_SETUP.md', 'utf8'),
};

function mustContain(name, source, needles) {
  for (const needle of needles) {
    assert.ok(source.includes(needle), `${name} must include ${needle}`);
  }
}

const compiledMetaCapi = await transform(files.metaCapi, {
  loader: 'ts',
  format: 'esm',
  target: 'es2022',
});
const metaCapiRuntime = await import(`data:text/javascript;base64,${Buffer.from(compiledMetaCapi.code).toString('base64')}`);

assert.equal(metaCapiRuntime.isRetryableMetaResponse(400, { error: { is_transient: true, code: 100 } }), true, 'Meta is_transient=true must retry even on HTTP 400');
assert.equal(metaCapiRuntime.isRetryableMetaResponse(400, { error: { is_transient: 'true' } }), true, 'String Meta transient flag must be accepted');
assert.equal(metaCapiRuntime.isRetryableMetaResponse(400, { error: { code: 613 } }), true, 'Known Meta rate-limit code must retry');
assert.equal(metaCapiRuntime.isRetryableMetaResponse(400, { error: { error_subcode: 1815107 } }), true, 'Known transient Meta subcode must retry');
assert.equal(metaCapiRuntime.isRetryableMetaResponse(400, { error: { code: 100, error_subcode: 2804019, is_transient: false } }), false, 'Explicit permanent CAPI validation error must dead-letter');
assert.equal(metaCapiRuntime.isRetryableMetaResponse(429, null), true, 'HTTP 429 must retry');
assert.equal(metaCapiRuntime.isRetryableMetaResponse(503, null), true, 'HTTP 5xx must retry');
assert.equal(metaCapiRuntime.parseMetaApiReceipt('not-json'), null, 'Malformed Graph body must not be treated as structured error data');

mustContain('PageView CAPI payload', files.pageview, [
  "event_name: 'PageView'",
  'event_id: eventId',
  "action_source: 'website'",
  'event_source_url: eventSourceUrl',
  'referrer_url: sanitizeUrlForMeta(payload.referrer)',
  'const eventSourceUrl = payload.page_url || payload.page_location',
  'marketing_consent: payload.marketing_consent === true',
  "error_message: 'marketing_consent_not_granted'",
  '...getMetaDataProcessingOptions(env)',
  'client_ip_address: clientIp',
  'client_user_agent: userAgent',
  'fbp: fbp || undefined',
  'fbc: fbc || undefined',
  'em: isSha256Hex(payload.em)',
  'ph: isSha256Hex(payload.ph)',
  'fn: isSha256Hex(payload.fn)',
  'ln: isSha256Hex(payload.ln)',
  'utm_source:',
  'fbclid:',
  'first_touch_url:',
  'last_touch_url:',
  'session_id:',
  'consent_version:',
  'recordMetaDiagnostics',
  'wasMetaEventAlreadySent',
]);

mustContain('Lead request normalization regression', files.lead, [
  'const normalized = normalizeLeadPayload',
  'event_source_url: eventSourceUrl',
  'referrer_url: sanitizeUrlForMeta(payload.referrer)',
  'const eventSourceUrl = payload.page_url || payload.page_location',
  '...getMetaDataProcessingOptions(env)',
]);
assert.ok(!files.lead.includes('const payload = (await request.json().catch(() => ({}))) as LeadPayload'), 'Lead handler must normalize payload before using normalized fields');

mustContain('Lead CAPI payload', files.lead, [
  "event_name: 'Lead'",
  'payload.email ? sha256Normalized(normalizeEmailForMeta(payload.email)) : undefined',
  'payload.phone ? sha256Normalized(normalizePhoneForMeta(payload.phone)) : undefined',
  'em: hashedEmail ? [hashedEmail] : undefined',
  'ph: hashedPhone ? [hashedPhone] : undefined',
  'last_touch_url:',
  'event_time_client:',
  'marketing_consent',
  'recordMetaDiagnostics',
  'wasMetaEventAlreadySent',
]);
assert.ok(!/user_data:\s*{[\s\S]{0,500}email:/m.test(files.lead), 'Lead user_data must not include raw email');
assert.ok(!/user_data:\s*{[\s\S]{0,500}phone:/m.test(files.lead), 'Lead user_data must not include raw phone');
assert.ok(files.lead.includes("if (normalized.marketing_consent)"), 'Lead CAPI must require marketing consent');

mustContain('ViewContent/FormStart/Contact payloads', files.metaEvent, [
  "'ViewContent'",
  "'FormStart'",
  "'Contact'",
  "'LeadFormView'",
  "'EngagedView'",
  'form_id: payload.form_id',
  'form_step: payload.form_step',
  'form_field: payload.form_field',
  'content_ids: payload.content_ids',
  'recordMetaDiagnostics',
  'wasMetaEventAlreadySent',
  'const eventSourceUrl = payload.page_url || payload.page_location',
  'referrer_url: sanitizeUrlForMeta(payload.referrer)',
  '...getMetaDataProcessingOptions(env)',
]);

mustContain('Client service content ids and dedupe ids', files.consent, [
  "content_ids: ['meta-ads']",
  "content_ids: ['google-ads']",
  "content_ids: ['consult']",
  "content_ids: ['home']",
  "content_ids: ['calculator']",
  "content_ids: ['blog']",
  "content_ids: ['faq']",
  'function getMetaPageContent',
  "pathname.startsWith('/blog/')",
  'page-${genericId}',
  "win.fbq?.('track', 'ViewContent', eventData, { eventID: eventId })",
  'if (!browserContext.marketing_consent) return;',
  "event_name: 'ViewContent'",
  "event_id: eventId",
  "win.fbq?.('trackCustom', 'FormStart', eventData, { eventID: eventId })",
  'const hasLeadMarketingConsent = eventData.marketing_consent === true',
  'if (!hasLeadMarketingConsent) return;',
  "event_name: 'FormStart'",
  'rememberMetaLeadIdentifiers',
  'META_USER_DATA_KEY',
  'fn: storedUserData.fn',
  'ln: storedUserData.ln',
]);

mustContain('Landing form email and context', files.landingForm, [
  "email: ''",
  "phone: ''",
  "renderField('email', 'Email'",
  "renderField('phone', 'Телефон / WhatsApp'",
  'website_domain: websiteDomain',
  "form_id: 'service_landing_form'",
  "form_variant: 'service_landing_v1'",
  'rememberMetaLeadIdentifiers',
  'trackLeadFormView',
]);

mustContain('Home contact form Meta tracking', files.contactForm, [
  'trackLeadFormView',
  'trackFormStart',
  'rememberMetaLeadIdentifiers',
  "service_slug: 'home'",
  "form_id: 'home_contact_form'",
  "form_variant: 'home_contact_v1'",
]);


mustContain('Meta LDU env configuration', files.envTypes + files.envExample, [
  'META_CAPI_DATA_PROCESSING_OPTIONS',
  'META_CAPI_DATA_PROCESSING_OPTIONS_COUNTRY',
  'META_CAPI_DATA_PROCESSING_OPTIONS_STATE',
]);


mustContain('Meta Cloudflare setup docs', files.cloudflareSetupDoc, [
  'META_CAPI_ACCESS_TOKEN',
  'VITE_META_PIXEL_ID',
  'META_CAPI_TEST_CODE',
  'META_CAPI_DEBUG_SECRET',
  'META_CAPI_IDEMPOTENCY',
  'META_CAPI_DIAGNOSTICS',
  '/api/meta-test-event',
  '/api/meta-diagnostics-health',
  'обычные live handlers при этом всё равно не будут добавлять `test_event_code`',
]);


assert.ok(!files.pageview.includes('test_event_code'), 'Live PageView CAPI must not include test_event_code');
assert.ok(!files.metaEvent.includes('test_event_code'), 'Live meta-event CAPI must not include test_event_code');
assert.ok(!files.lead.includes('test_event_code'), 'Live Lead CAPI must not include test_event_code');

mustContain('Meta CAPI test endpoint coverage', files.metaTestEvent, [
  "'LeadFormView'",
  "'EngagedView'",
  "'Contact'",
  "'QualifiedLead'",
  "'UnqualifiedLead'",
  'original_event_data',
  'isConfirmedMetaReceipt',
  'test_event_code: testCode',
  'recordMetaDiagnostics',
]);

// Тестовый Lead существует ради одного: показать владельцу, какие параметры
// реально уходят с заявки. Как только он перестаёт повторять набор полей
// настоящего события, он начинает врать — поэтому наборы сверяются здесь.
{
  const extractObjectKeys = (source, marker) => {
    const start = source.indexOf(marker);
    assert.ok(start !== -1, `smoke test could not find ${marker}`);
    let depth = 0;
    let end = start + marker.length - 1;
    for (let i = start + marker.length - 1; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    const body = source.slice(start + marker.length, end);
    return new Set(
      [...body.matchAll(/^\s{2,}([a-z_][a-z0-9_]*)\s*:/gim)].map((match) => match[1]),
    );
  };

  const testUserDataBuilder = files.metaTestEvent.slice(
    files.metaTestEvent.indexOf('async function buildLeadUserData'),
  );

  const liveLeadUserData = extractObjectKeys(files.lead, 'user_data: {');
  const testLeadUserData = extractObjectKeys(testUserDataBuilder, 'return {');

  // Поля, которых нет без соответствующих вопросов в форме: их отсутствие в
  // тесте — не расхождение, а честность (индекс, дата рождения, пол, madid).
  const optionalForTest = new Set(['zp', 'dobd', 'dobm', 'doby', 'ge', 'madid']);
  const missing = [...liveLeadUserData].filter(
    (key) => !optionalForTest.has(key) && !testLeadUserData.has(key),
  );

  assert.deepEqual(
    missing,
    [],
    `Meta CAPI test Lead must cover the same user_data keys as the live Lead; missing: ${missing.join(', ')}`,
  );
  assert.ok(
    files.metaTestEvent.includes('describeSentFields'),
    'Meta CAPI test endpoint must report which fields were actually sent',
  );
  assert.ok(
    !/describeSentFields[\s\S]{0,900}TEST_CONTACT\.email/.test(files.metaTestEvent),
    'The sent-fields report must not echo raw contact values',
  );
}

mustContain('Meta diagnostics summary endpoint', files.diagnosticsSummary, [
  'META_CAPI_DEBUG_SECRET',
  'meta_capi_diagnostics',
  'sent_rate',
  'failed_rate',
  'fbp_rate',
  'fbc_rate',
  'marketing_consent_rate',
  'avg_match_quality_score',
  'form_id',
]);

mustContain('Meta diagnostics writer quality fields', files.diagnosticsWriter, [
  'computeMatchQualityScore',
  'match_quality_score',
  'form_id',
  'form_variant',
  'contact_method',
  'lead_source_page',
  'PRAGMA table_info(meta_capi_diagnostics)',
  'score_identity',
  'page_path_normalized',
]);

mustContain('Meta diagnostics coverage endpoint', files.diagnosticsCoverage, [
  'CORE_EVENTS',
  'missing_core_events',
  'PageView',
  'LeadFormView',
  'Contact',
]);

mustContain('Meta diagnostics alerts endpoint', files.diagnosticsAlerts, [
  'no_pageviews_sent',
  'failed_events_present',
  'low_fbc_rate',
  'traffic_without_leads',
]);

mustContain('Meta diagnostics funnel endpoint', files.diagnosticsFunnel, [
  'FUNNEL_STEPS',
  'conversion_from_prev_rate',
  'dropoff_from_prev',
]);

mustContain('Meta diagnostics anomalies endpoint', files.diagnosticsAnomalies, [
  'failed_rate_spike',
  'fbc_rate_drop',
  'consent_rate_drop',
]);

// Outbox: очередь недоставленных событий должна иметь обработчик повторов,
// а «sent» должен ставиться только при успешном ответе Meta.
mustContain('Meta outbox replay', files.outbox, [
  'processMetaOutbox',
  'getOutboxRetryDelaySeconds',
  "status='dead_letter'",
  'wasMetaEventAlreadySent',
  'ON CONFLICT(id) DO UPDATE SET',
  "WHERE meta_outbox.status='dead_letter'",
  'payload_json=excluded.payload_json',
  'attempts=0',
  "next_retry_at=strftime('%s','now')",
  'last_error=NULL',
  "created_at=strftime('%s','now')",
  'sent_at=NULL',
]);
mustContain('Meta Graph transient error classification', files.metaCapi + files.outbox + files.leadQuality, [
  'parseMetaApiReceipt',
  'isRetryableMetaResponse',
  'is_transient',
  'error_subcode',
  'RETRYABLE_META_ERROR_CODES',
  'RETRYABLE_META_ERROR_SUBCODES',
  'markOutboxDeadLetter',
]);
assert.ok(
  files.outbox.includes("response.status >= 400 && response.status < 500 && !isRetryableMetaResponse(response.status, receipt)"),
  'Outbox must analyze the Graph error body before dead-lettering a 4xx response',
);
mustContain('Lead outbox stores final Graph API body', files.lead, [
  'payload_json: body',
  'markOutboxRetry',
  'markOutboxSent(env, outboxId)',
]);
mustContain('PageView outbox stores final Graph API body', files.pageview, [
  'payload_json: body',
  'markOutboxRetry',
  'markOutboxSent(env, outboxId)',
  'processMetaOutbox(env, 3)',
]);
mustContain('Meta-event outbox stores final Graph API body', files.metaEvent, [
  'payload_json: body',
  'markOutboxRetry',
  'markOutboxSent(env, outboxId)',
]);
assert.ok(!files.lead.includes('.then(() => markOutboxSent'), 'Lead must not mark outbox sent unconditionally');
assert.ok(!files.pageview.includes('.then(() => markOutboxSent'), 'PageView must not mark outbox sent unconditionally');
assert.ok(!files.metaEvent.includes('.then(() => markOutboxSent'), 'Meta-event must not mark outbox sent unconditionally');

mustContain('Confirmed Meta receipt gate', files.metaCapi + files.outbox + files.lead + files.pageview + files.metaEvent, [
  'isConfirmedMetaReceipt',
  'events_received',
  'Meta 2xx without events_received confirmation',
]);

mustContain('Lead quality CAPI payload', files.leadQuality, [
  "'QualifiedLead'",
  "'UnqualifiedLead'",
  'original_event_data',
  "event_name: 'Lead'",
  'event_id: originalLeadEventId',
  'getMetaDataProcessingOptions(env)',
  'hashedFirstName',
  'hashedLastName',
  'Number(lead.marketing_consent || 0) !== 1',
  'isConfirmedMetaReceipt(receipt)',
]);

mustContain('Durable lead consent receipt', files.leadStore + files.leadQuality + files.leadConsentMigration, [
  'consent_version',
  'consent_source',
  'consent_region',
  'consent_timestamp',
  'consent_recorded_at',
  'consent_receipt_missing',
  'consent_receipt_invalid',
  'consent_receipt_expired',
  'LEAD_QUALITY_CONSENT_MAX_AGE_DAYS = 180',
]);

mustContain('Persistent lead quality delivery status', files.adminLeadsApi + files.adminLeadQualityStatus + files.adminLeadsUi, [
  'quality_meta_status',
  'quality_meta_event_id',
  "Meta: доставлено",
  "quality_meta_status === 'queued'",
  "quality_meta_queue_status === 'retry'",
  "Meta: повтор",
  "quality_meta_status === 'failed'",
  "Meta: ошибка",
]);

mustContain('Tracking signature secret validation', files.trackingSignature, [
  'HMAC_SECRET_HEX_LENGTH = 64',
  '/^[0-9a-f]+$/i',
  "reason: 'invalid_secret_format'",
  "reason: 'signature_verification_failed'",
]);

mustContain('Tracking signature and lead-ingestion health', files.adminHealth + files.trackingSignatureMigration + files.leadIngestionMigration, [
  'tracking_request_nonces',
  'tracking_signature_daily',
  'lead_ingestions',
  'tracking-signature-schema',
  'tracking-signature-config',
  'lead-ingestion-schema',
  "updated_at >= strftime('%s','now','-1 day')",
  '/^[0-9a-f]{64}$/i',
  '0018',
  '0019_lead_ingestion_idempotency.sql',
  'retryable 503',
]);
assert.ok(
  files.adminHealth.includes("signatureMode === 'enforce' ? 'fail' : 'warn'"),
  'Missing signature schema/config must fail in enforce and warn in monitor/off modes',
);
assert.ok(
  !/\$\{\s*env\.TRACKING_HMAC_SECRET\b/.test(files.adminHealth),
  'Admin health must never interpolate the tracking HMAC secret into its response',
);
const healthWithoutSecretValidator = files.adminHealth.replace(
  /function hasValidTrackingHmacSecret[\s\S]*?\n}\n/,
  '',
);
assert.ok(
  !healthWithoutSecretValidator.includes('env.TRACKING_HMAC_SECRET'),
  'Admin health may access the HMAC secret only inside its format validator',
);

mustContain('Offline lead retry consent downgrade', files.leadRetryQueue + files.leadRetryConsent, [
  'loadConsent()',
  'originallyGranted && currentlyGranted',
  'nextPayload.marketing_consent = hasMarketingConsent',
  'MARKETING_CONTEXT_FIELDS',
  'delete nextPayload[field]',
]);

mustContain('Durable idempotent lead ingestion', files.lead + files.leadStore + files.leadIngestionMigration, [
  'await storeLead(env, normalized)',
  "error: 'lead_storage_unavailable'",
  'retryable: true',
  'stored.duplicate',
  'lead_ingestions',
  'claim_token',
  'submissions_count = submissions_count + 1',
  "pipeline_stage = 'new'",
  "quality = ''",
]);

mustContain('Admin tracking exclusion', files.consent + files.routes, [
  'isTrackingExcludedPath',
  '/^\\/admin(?:\\/|$)/',
  '!isAdmin',
]);

for (const [name, source] of [
  ['PageView', files.pageview],
  ['Lead', files.lead],
  ['Meta event', files.metaEvent],
]) {
  assert.ok(!source.includes('country: ctx.country'), `${name} custom_data must not repeat raw country`);
  assert.ok(!source.includes('city: ctx.city'), `${name} custom_data must not repeat raw city`);
  assert.ok(!source.includes('region: ctx.region'), `${name} custom_data must not repeat raw region`);
}

for (const [name, source] of [
  ['summary', files.diagnosticsSummary],
  ['coverage', files.diagnosticsCoverage],
  ['alerts', files.diagnosticsAlerts],
  ['funnel', files.diagnosticsFunnel],
  ['anomalies', files.diagnosticsAnomalies],
]) {
  assert.ok(!source.includes("searchParams.get('secret')"), `Diagnostics ${name} must not accept secrets in URLs`);
  assert.ok(source.includes("COALESCE(service, '') NOT IN ('meta_capi_test_event', 'meta_capi_diagnostics_health')"), `Diagnostics ${name} must exclude test/probe rows`);
}
assert.ok(!files.metaTestEvent.includes("searchParams.get('secret')"), 'Meta test endpoint must not accept its debug secret in the URL');
assert.ok(files.adminMetaCenter.includes("COALESCE(service, '') NOT IN ('meta_capi_test_event', 'meta_capi_diagnostics_health')"), 'Admin Meta center must exclude test/probe rows');
assert.ok(files.adminHealth.includes("COALESCE(service, '') NOT IN ('meta_capi_test_event', 'meta_capi_diagnostics_health')"), 'Admin health must exclude test/probe rows');

mustContain('Meta diagnostics retention', files.diagnosticsRetentionMigration + files.adminHealth, [
  'trg_meta_capi_diagnostics_retention',
  "datetime('now', '-90 days')",
  'AFTER INSERT ON meta_capi_diagnostics',
  '0016_meta_diagnostics_retention.sql',
]);

mustContain('Meta outbox operational health', files.outbox + files.adminHealth, [
  'configuration_error',
  "status = 'dead_letter'",
  "status = 'retry'",
  'recordOutboxDelivery',
]);
mustContain('Honest outbox retry recovery proof', files.adminMetaCenter, [
  "status='sent' AND attempts > 1",
  'recovered_after_retry',
  'latest_recovered',
]);
assert.ok(
  !files.adminMetaCenter.includes('sent_at >= created_at'),
  'Admin Meta center must not infer a retry from elapsed grace time alone',
);

mustContain('Consent-gated advertising storage', files.consent, [
  'if (!consentSnapshot.marketing_consent) return baseContext;',
  'if (!hasMarketingConsent()) return undefined;',
  'clearMetaMarketingStorage',
  "win.fbq?.('consent', categories.marketing ? 'grant' : 'revoke')",
]);

mustContain('Deferred tracking keeps browser queues ready', files.consent, [
  'export function prepareTrackingQueues',
  'function prepareDirectAnalyticsQueues',
  'function prepareMetaQueue',
  'function prepareTiktokQueue',
  'queuedYm.a.push(args)',
  '(fbq as any).queue.push(args)',
]);

const applyConsentSource = files.cookieConsentManager.slice(
  files.cookieConsentManager.indexOf('function applyConsent('),
  files.cookieConsentManager.indexOf('\nfunction Switch('),
);
mustContain('Consent records events before loading third-party runtimes', applyConsentSource, [
  'prepareTrackingQueues(consent.categories)',
  'trackPageView(path',
  'trackServiceViewContent(path',
  'scheduleTrackingRuntimeLoad(consent.categories',
]);
assert.ok(
  applyConsentSource.indexOf('trackPageView(path') < applyConsentSource.indexOf('scheduleTrackingRuntimeLoad(consent.categories'),
  'PageView/CAPI must be recorded before third-party runtimes are scheduled',
);
assert.ok(
  files.cookieConsentManager.includes("currentConsent?.categories.marketing === true"),
  'Deferred marketing runtime must re-check current consent before loading',
);
mustContain('Deferred runtimes stay consent-safe across races and route changes', files.consent + files.cookieConsentManager, [
  "hasCurrentTrackingConsent('analytics')",
  "hasCurrentTrackingConsent('marketing')",
  'externalScriptLoads',
  'analyticsLoadPromise',
  'marketingLoadPromise',
  'cancelPendingTrackingRuntimeLoad',
  'isTrackingExcludedPath(router.state.location.pathname)',
]);
assert.ok(
  (files.consent.match(/hasCurrentTrackingConsent\('analytics'\)/g) || []).length >= 2,
  'Analytics consent must be checked again before a subsequent vendor runtime',
);
assert.ok(
  (files.consent.match(/hasCurrentTrackingConsent\('marketing'\)/g) || []).length >= 2,
  'Marketing consent must be checked again before a subsequent vendor runtime',
);
assert.ok(
  files.cookieConsentManager.includes('const TRACKING_RUNTIME_FALLBACK_DELAY_MS = 90_000')
    && files.cookieConsentManager.includes('const TRACKING_RUNTIME_SCROLL_IDLE_MS = 2_000'),
  'Third-party runtimes must stay outside the initial interaction window',
);
assert.ok(
  !files.cookieConsentManager.includes("window.addEventListener('pointerdown', runEarly")
    && !files.cookieConsentManager.includes("window.addEventListener('touchstart', runEarly"),
  'The first scroll/touch must not trigger all third-party runtimes',
);
assert.ok(
  files.cookieConsentManager.includes("window.addEventListener('scroll', scheduleAfterScroll, { passive: true })")
    && files.cookieConsentManager.includes('window.setTimeout(runWhenIdle, TRACKING_RUNTIME_SCROLL_IDLE_MS)')
    && files.cookieConsentManager.includes('const idleIds = new Set<number>()')
    && files.cookieConsentManager.includes('cancelIdleRuns()'),
  'Runtime loading after scroll must be debounced until the interaction is idle',
);
assert.ok(
  files.cookieConsentManager.includes("window.addEventListener('wheel', markScrollIntent, { passive: true })")
    && files.cookieConsentManager.includes("window.addEventListener('touchstart', markScrollIntent, { passive: true })")
    && files.cookieConsentManager.includes("window.addEventListener('touchmove', markScrollIntent, { passive: true })")
    && files.cookieConsentManager.includes("window.addEventListener('keydown', markKeyboardScrollIntent)")
    && files.cookieConsentManager.includes('const TRACKING_RUNTIME_MIN_SCROLL_DISTANCE_PX = 48')
    && files.cookieConsentManager.includes('if (!event.isTrusted) return')
    && files.cookieConsentManager.includes('performance.now() > scrollIntentUntil')
    && files.cookieConsentManager.includes('scrollDistance < TRACKING_RUNTIME_MIN_SCROLL_DISTANCE_PX')
    && files.cookieConsentManager.includes("window.removeEventListener('touchmove', markScrollIntent)")
    && files.cookieConsentManager.includes("window.removeEventListener('keydown', markKeyboardScrollIntent)"),
  'Synthetic or initial scroll events must not start third-party runtimes without real scroll intent',
);
assert.ok(
  files.cookieConsentManager.indexOf('cancelIdleRuns();', files.cookieConsentManager.indexOf('const scheduleAfterScroll'))
    < files.cookieConsentManager.indexOf('performance.now() > scrollIntentUntil'),
  'Continued scrolling must cancel a pending runtime even after the intent window expires',
);
assert.ok(
  files.cookieConsentManager.includes("document.addEventListener('focusin', runOnLeadIntent, true)")
    && files.cookieConsentManager.includes("target.closest('form')"),
  'Form intent must start runtimes early enough to recover analytics client IDs before submit',
);
assert.ok(!files.consent.includes('getExtendedMetaContext'), 'Unverified sensitive URL parameters must not be forwarded to Meta');
assert.ok(!files.lead.includes('lead_crm_http_'), 'CRM delivery must not be written as a Meta CAPI diagnostic');
assert.ok(!files.lead.includes('lead_crm_network_error'), 'CRM network failures must not be written as Meta CAPI diagnostics');

console.log('Meta CAPI smoke tests passed');
