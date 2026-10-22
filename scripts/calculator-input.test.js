import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

/**
 * Разбор сумм, вставленных в поля калькулятора (F-055), и формат чисел
 * первого экрана: страницы калькуляторов приходят готовыми из HTML, и
 * строка в разметке сборки обязана совпасть с той, что нарисует браузер.
 */
const sourceUrl = new URL('../src/app/calculator/engine.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiled = await transform(source, {
  loader: 'ts',
  format: 'cjs',
  target: 'node20',
});

const calculatorModule = { exports: {} };
new Function('module', 'exports', compiled.code)(
  calculatorModule,
  calculatorModule.exports,
);

const { parseNumberInput, calculateQuote } = calculatorModule.exports;

test('pasted amounts from ad accounts survive: currency, letters and spaces are dropped', () => {
  assert.equal(parseNumberInput('$1200'), 1200);
  assert.equal(parseNumberInput('1 234,56 $'), 1234.56);
  assert.equal(parseNumberInput('1 234,56 $'), 1234.56);
  assert.equal(parseNumberInput('1 234,56'), 1234.56);
  assert.equal(parseNumberInput('650 000 сум'), 650000);
  assert.equal(parseNumberInput('USD 300'), 300);
});

test('thousands separators are recognised in money fields', () => {
  assert.equal(parseNumberInput('10,000'), 10000);
  assert.equal(parseNumberInput('1,000,000'), 1000000);
  assert.equal(parseNumberInput('1.000.000'), 1000000);
  assert.equal(parseNumberInput('10,000.50'), 10000.5);
  assert.equal(parseNumberInput('1.234.567,89'), 1234567.89);
});

test('a single comma stays decimal when it cannot be thousands', () => {
  assert.equal(parseNumberInput('1234,56'), 1234.56);
  assert.equal(parseNumberInput('0,125'), 0.125);
  assert.equal(parseNumberInput('2,5'), 2.5);
  assert.equal(parseNumberInput(',5'), 0.5);
  // Одна точка — десятичная, как и раньше.
  assert.equal(parseNumberInput('10.000'), 10);
  assert.equal(parseNumberInput('1000'), 1000);
});

test('percent fields read a comma as decimal even with three digits after it', () => {
  assert.equal(parseNumberInput('2,5', 'percent'), 2.5);
  assert.equal(parseNumberInput('12,500', 'percent'), 12.5);
  assert.equal(parseNumberInput('10,000', 'percent'), 10);
  assert.equal(parseNumberInput('65', 'percent'), 65);
});

test('a string without digits is empty, not a made-up number', () => {
  assert.equal(parseNumberInput(''), null);
  assert.equal(parseNumberInput('   '), null);
  assert.equal(parseNumberInput('$'), null);
  assert.equal(parseNumberInput('неизвестно'), null);
  assert.equal(parseNumberInput('-'), null);
  assert.equal(parseNumberInput('-50'), -50);
});

test('the default quote of /calculator formats the same way the browser does', () => {
  // Первый экран /calculator — смета по умолчанию: одна площадка, 1000 USD,
  // заявки, первый месяц. Эти строки уходят в HTML сборки и сверяются при
  // гидратации; ru-RU в ICU Node и Chrome разделяет разряды и символ валюты
  // неразрывным пробелом U+00A0.
  const quote = calculateQuote({
    platformCount: 1,
    monthlyAdBudget: 1000,
    goal: 'leads',
    marketCount: 1,
    tracking: 'basic',
    creativeUnits: 4,
    firstMonth: true,
  });
  const format = (value) => new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
  assert.equal(format(quote.monthlyFee), '1 000 $');
  assert.equal(format(quote.monthlyFee + 1000), '2 000 $');
  assert.deepEqual(quote.lineItems.map((item) => format(item.value)), ['600 $', '200 $', '200 $']);
});
