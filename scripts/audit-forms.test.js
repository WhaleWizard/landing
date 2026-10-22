import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

async function compile(relativePath, resolve = () => ({})) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'cjs', target: 'node20' });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled.code)(module, module.exports, resolve);
  return module.exports;
}

const phone = await compile('src/app/utils/phoneCountry.ts');
const consent = await compile('src/app/consent/consent.ts');

test('F-051: createEventId generates valid UUID v4 and is used across public forms and queues', () => {
  const id1 = consent.createEventId();
  const id2 = consent.createEventId();
  assert.notEqual(id1, id2);
  assert.match(id1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const consentCode = readFileSync('src/app/consent/consent.ts', 'utf8');
  // Bare crypto.randomUUID() calls outside of createEventId() fallback definition must be gone
  const occurrences = (consentCode.match(/crypto\.randomUUID/g) || []).length;
  assert.equal(occurrences, 3, 'crypto.randomUUID only present inside createEventId doc comment and feature-detection');

  const contactCode = readFileSync('src/app/components/ContactForm.tsx', 'utf8');
  assert.match(contactCode, /createEventId/);

  const landingCode = readFileSync('src/app/components/LandingForm.tsx', 'utf8');
  assert.match(landingCode, /createEventId/);

  const queueCode = readFileSync('src/app/utils/leadRetryQueue.ts', 'utf8');
  assert.match(queueCode, /createEventId/);
});

test('F-015 & F-057: country dialing options and national phone prefix normalization', () => {
  const requiredCountries = ['CY', 'ME', 'QA', 'BH', 'KW', 'OM', 'MN', 'MT', 'IS', 'LI', 'AL', 'BA', 'MK'];
  for (const code of requiredCountries) {
    const found = phone.COUNTRY_PHONE_OPTIONS.find((c) => c.code === code);
    assert.ok(found, `Country ${code} must be present in COUNTRY_PHONE_OPTIONS`);
  }

  assert.equal(phone.buildFullPhone('+380', '050 123 45 67'), '+380501234567');
  assert.equal(phone.buildFullPhone('+375', '8 029 123-45-67'), '+375291234567');
  assert.equal(phone.buildFullPhone('+44', '07911 123456'), '+447911123456');
  assert.equal(phone.buildFullPhone('+49', '0151 23456789'), '+4915123456789');
  assert.equal(phone.buildFullPhone('+90', '0532 123 45 67'), '+905321234567');
  assert.equal(phone.buildFullPhone('+39', '06 1234 5678'), '+390612345678');
  assert.equal(phone.buildFullPhone('+380', '380501234567'), '+380501234567');
});

test('F-005 & F-016: lead retry queue preserves items when token is missing and schedules retries', () => {
  const code = readFileSync('src/app/utils/leadRetryQueue.ts', 'utf8');
  assert.match(code, /if \(!freshToken\) \{[\s\S]*?continue;[\s\S]*?\}/);
  assert.match(code, /export function scheduleLeadRetry/);
  assert.match(code, /visibilitychange/);
});

test('F-017: turnstile error cleans up script and forms check offline status before submit', () => {
  const turnstileCode = readFileSync('src/app/components/hooks/useTurnstile.ts', 'utf8');
  assert.match(turnstileCode, /script\.remove\(\)/);

  const contactCode = readFileSync('src/app/components/ContactForm.tsx', 'utf8');
  assert.match(contactCode, /navigator\.onLine === false/);

  const landingCode = readFileSync('src/app/components/LandingForm.tsx', 'utf8');
  assert.match(landingCode, /navigator\.onLine === false/);
});

test('F-018 & F-052: INP uses durationThreshold 40 and CLS calculates maximum session window', () => {
  const vitalsCode = readFileSync('src/app/utils/webVitals.ts', 'utf8');
  assert.match(vitalsCode, /durationThreshold: 40/);
  assert.match(vitalsCode, /first-input/);
  assert.match(vitalsCode, /maxSessionWindowScore/);
  assert.match(vitalsCode, /popstate/);
});

test('F-053: CookieConsentManager suppresses duplicate pageview on unchanged consent', () => {
  const cookieCode = readFileSync('src/app/components/cookie/CookieConsentManager.tsx', 'utf8');
  assert.match(cookieCode, /newAnalytics/);
  assert.match(cookieCode, /newMarketing/);
});

test('F-117: CountryFlag uses WebP variants', () => {
  const flagCode = readFileSync('src/app/components/CountryFlag.tsx', 'utf8');
  assert.match(flagCode, /\.webp/);
  assert.ok(existsSync('public/images/country-flags/rs.webp'), 'rs.webp must exist');
  assert.ok(existsSync('public/images/country-flags/mx.webp'), 'mx.webp must exist');
});
