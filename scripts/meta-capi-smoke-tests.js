import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
};

function mustContain(name, source, needles) {
  for (const needle of needles) {
    assert.ok(source.includes(needle), `${name} must include ${needle}`);
  }
}

mustContain('PageView CAPI payload', files.pageview, [
  "event_name: 'PageView'",
  'event_id: eventId',
  "action_source: 'website'",
  'event_source_url: eventSourceUrl',
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
  "event_name: 'ViewContent'",
  "event_id: eventId",
  "win.fbq?.('trackCustom', 'FormStart', eventData, { eventID: eventId })",
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

mustContain('Meta CAPI test endpoint coverage', files.metaTestEvent, [
  "'LeadFormView'",
  "'EngagedView'",
  "'Contact'",
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

console.log('Meta CAPI smoke tests passed');


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
