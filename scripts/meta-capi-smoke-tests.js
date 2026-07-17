import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

const files = {
  contactForm: readFileSync('src/app/components/ContactForm.tsx', 'utf8'),
  pageview: readFileSync('functions/api/pageview.ts', 'utf8'),
  lead: readFileSync('functions/api/lead.ts', 'utf8'),
  metaEvent: readFileSync('functions/api/meta-event.ts', 'utf8'),
  consent: readFileSync('src/app/consent/consent.ts', 'utf8'),
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
  leadQuality: readFileSync('functions/_lib/lead-quality.ts', 'utf8'),
  adminLeadsApi: readFileSync('functions/api/admin/leads.ts', 'utf8'),
  adminLeadsUi: readFileSync('src/app/components/admin/AdminLeads.tsx', 'utf8'),
  adminHealth: readFileSync('functions/api/admin/health.ts', 'utf8'),
  adminMetaCenter: readFileSync('functions/api/admin/meta-center.ts', 'utf8'),
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

mustContain('Persistent lead quality delivery status', files.adminLeadsApi + files.adminLeadsUi, [
  'quality_meta_status',
  'quality_meta_event_id',
  "Meta: доставлено",
  "Meta: повторная отправка",
  "Meta: не доставлено",
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
assert.ok(!files.consent.includes('getExtendedMetaContext'), 'Unverified sensitive URL parameters must not be forwarded to Meta');
assert.ok(!files.lead.includes('lead_crm_http_'), 'CRM delivery must not be written as a Meta CAPI diagnostic');
assert.ok(!files.lead.includes('lead_crm_network_error'), 'CRM network failures must not be written as Meta CAPI diagnostics');

console.log('Meta CAPI smoke tests passed');
