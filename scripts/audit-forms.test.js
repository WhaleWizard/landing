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

test('F-118: Budget selector uses 2-column grid across Android (360px) and iPhone without 390px breakpoint', () => {
  const landingCode = readFileSync('src/app/components/LandingForm.tsx', 'utf8');
  assert.ok(!landingCode.includes('min-[390px]:grid-cols-2'), 'LandingForm must not restrict 2-col budget grid to 390px+');
  assert.match(landingCode, /grid grid-cols-2 gap-2/, 'LandingForm budget options must use 2-column grid');

  const contactCode = readFileSync('src/app/components/ContactForm.tsx', 'utf8');
  assert.ok(!contactCode.includes('min-[390px]:grid-cols-2'), 'ContactForm must not restrict 2-col budget grid to 390px+');
  assert.match(contactCode, /grid grid-cols-2 gap-2/, 'ContactForm budget options must use 2-column grid');

  const socialCode = readFileSync('src/app/components/SocialBar.tsx', 'utf8');
  assert.match(socialCode, /https:\/\/x\.com\/whalewzrd/, 'SocialBar must link to x.com/whalewzrd');
  assert.ok(!socialCode.includes('twitter.com/whalewzrd'), 'SocialBar must not use legacy twitter.com domain');
});

test('DA-19: INP отбрасывает по одному самому медленному взаимодействию на каждые 50', async () => {
  const { interactionToNextPaint } = await compile('src/app/utils/webVitals.ts');
  assert.equal(interactionToNextPaint([800], 1), 800, 'одно действие — оно и есть INP');
  assert.equal(interactionToNextPaint([800, 80], 49), 800, 'до 50 действий выброс не отбрасывается');
  assert.equal(interactionToNextPaint([800, 80, 80], 50), 80, 'на 50 действий один максимум отбрасывается');
  assert.equal(interactionToNextPaint([900, 800, 80], 100), 80, 'на 100 — два');
  assert.equal(interactionToNextPaint([], 10), 0);
});

test('DA-18: стабильная видимая страница отправляет CLS 0, фоновая загрузка — нет', async () => {
  const { startWebVitals } = await compile('src/app/utils/webVitals.ts');
  const run = ({ hidden, supported = true, shifts = [] }) => {
    const sent = [];
    const listeners = {};
    const observers = [];
    const saved = {};
    for (const key of ['window', 'document', 'PerformanceObserver', 'navigator', 'performance', 'Blob']) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    class FakeObserver {
      static supportedEntryTypes = supported ? ['largest-contentful-paint', 'layout-shift', 'event', 'first-input'] : ['largest-contentful-paint', 'event'];
      constructor(callback) { this.callback = callback; }
      observe({ type }) {
        if (!FakeObserver.supportedEntryTypes.includes(type)) throw new Error('unsupported');
        this.type = type;
        observers.push(this);
      }
      disconnect() {}
    }
    const define = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    define('window', { location: { pathname: '/meta-ads' }, addEventListener: (type, handler) => { listeners[type] = handler; } });
    define('document', {
      visibilityState: hidden ? 'hidden' : 'visible',
      addEventListener: (type, handler) => { (listeners[`doc:${type}`] ||= []).push(handler); },
    });
    define('PerformanceObserver', FakeObserver);
    define('navigator', { sendBeacon: (_url, blob) => { sent.push(JSON.parse(blob.text)); return true; } });
    define('performance', { getEntriesByType: () => [] });
    define('Blob', class { constructor(parts) { this.text = parts.join(''); } });
    const random = Math.random;
    Math.random = () => 0;
    try {
      startWebVitals();
      const emit = (type, entries) => observers.filter((item) => item.type === type).forEach((item) => item.callback({ getEntries: () => entries }));
      emit('largest-contentful-paint', [{ startTime: 1200 }]);
      if (shifts.length) emit('layout-shift', shifts);
      listeners.pagehide();
    } finally {
      Math.random = random;
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
    return sent.flatMap((item) => item.metrics);
  };

  const stable = run({ hidden: false });
  assert.deepEqual(stable.find((item) => item.metric === 'CLS'), { metric: 'CLS', value: 0, path: '/meta-ads' }, 'ноль — тоже замер');
  const shifted = run({ hidden: false, shifts: [{ value: 0.26, startTime: 100 }] });
  assert.equal(shifted.find((item) => item.metric === 'CLS').value, 0.26);
  const background = run({ hidden: true });
  assert.equal(background.find((item) => item.metric === 'CLS'), undefined, 'вкладка открыта в фоне — CLS не отправляется');
  assert.equal(background.find((item) => item.metric === 'LCP'), undefined, 'и LCP тоже');
  const unsupported = run({ hidden: false, supported: false });
  assert.equal(unsupported.find((item) => item.metric === 'CLS'), undefined, 'браузер не считает сдвиги — нуля не выдумываем');
});
