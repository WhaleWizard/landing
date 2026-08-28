import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Справочник событий dataLayer сходится с настоящими отправками в коде.
 *
 * Раздел «События» в админке нужен, чтобы настраивать триггеры GTM, не открывая
 * исходники. Документация, которая разошлась с кодом, для этого хуже, чем её
 * отсутствие: по ней настроят триггер на событие, которого больше нет, и
 * молча потеряют конверсии.
 *
 * Поэтому имена сверяются автоматически. Описания остаются на человеке.
 */

const CONSENT_SOURCE = readFileSync('src/app/consent/consent.ts', 'utf8');
const CATALOG_SOURCE = readFileSync('src/app/data/dataLayerEvents.ts', 'utf8');

/** Имена событий из настоящих вызовов dataLayer.push({ event: '...' }). */
function eventsInCode() {
  const names = new Set();
  // Отправка бывает и однострочной, и разложенной на несколько строк, поэтому
  // ищем ключ `event` внутри каждого push, а не фиксированный шаблон целиком.
  for (const push of CONSENT_SOURCE.matchAll(/dataLayer\.push\(\{([\s\S]*?)\}\)/g)) {
    const match = push[1].match(/(?:^|[\s,{])event:\s*'([a-z_0-9]+)'/);
    if (match) names.add(match[1]);
  }
  return names;
}

/** Имена событий, описанные в справочнике. */
function eventsInCatalog() {
  return new Set([...CATALOG_SOURCE.matchAll(/^\s{4}event: '([a-z_0-9]+)',$/gm)].map((m) => m[1]));
}

test('в справочнике описаны все события, которые сайт действительно отправляет', () => {
  const code = eventsInCode();
  const catalog = eventsInCatalog();

  assert.ok(code.size > 0, 'в consent.ts не нашлось ни одной отправки — сломался разбор, а не код');

  const missing = [...code].filter((name) => !catalog.has(name)).sort();
  assert.deepEqual(
    missing,
    [],
    `эти события отправляются, но не описаны в src/app/data/dataLayerEvents.ts: ${missing.join(', ')}`,
  );
});

test('в справочнике нет выдуманных событий', () => {
  const code = eventsInCode();
  const catalog = eventsInCatalog();

  const extra = [...catalog].filter((name) => !code.has(name)).sort();
  assert.deepEqual(
    extra,
    [],
    `эти события описаны, но сайт их не отправляет — уберите из справочника: ${extra.join(', ')}`,
  );
});

test('служебное gtm.js в справочник не попадает', () => {
  // Это внутренний сигнал запуска самого GTM, а не событие сайта. Ему в
  // справочнике делать нечего, и разбор не должен его подхватывать.
  assert.ok(CONSENT_SOURCE.includes("'gtm.start'"), 'загрузчик GTM изменился — проверьте разбор');
  assert.ok(!eventsInCatalog().has('gtm.js'));
});

test('у каждого описанного события заполнены обязательные поля', () => {
  const required = ['title', 'meaning', 'firesWhen', 'consent', 'params', 'where'];
  // Разбираем по блокам между `event:` — так видно, какое именно описание неполно.
  const blocks = CATALOG_SOURCE.split(/^\s{4}event: '/m).slice(1);
  assert.equal(blocks.length, eventsInCatalog().size, 'разбор блоков разошёлся со списком событий');

  for (const block of blocks) {
    const name = block.slice(0, block.indexOf("'"));
    for (const field of required) {
      assert.ok(
        new RegExp(`^\\s{4}${field}:`, 'm').test(block),
        `у события ${name} не заполнено поле ${field}`,
      );
    }
  }
});

test('согласие указано только одним из двух допустимых значений', () => {
  const values = [...CATALOG_SOURCE.matchAll(/^\s{4}consent: '([a-z]+)',$/gm)].map((m) => m[1]);
  assert.ok(values.length > 0, 'не найдено ни одного указания согласия');
  for (const value of values) {
    assert.ok(['analytics', 'marketing'].includes(value), `недопустимое согласие: ${value}`);
  }
});
