import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

/**
 * Сборка кейса из помесячных результатов клиента.
 *
 * Кейс — публичная витрина: числа из него читают будущие клиенты и решают,
 * работать или нет. Ошибка здесь не роняет страницу, она врёт с ней заодно,
 * поэтому расчёт проверяется на конкретных значениях.
 */

const source = readFileSync('src/app/components/admin/caseFromClient.ts', 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
const { buildCaseFromMonths, toCaseData, toCaseOutline, monthLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(`${compiled.code}\n//${randomUUID()}`).toString('base64')}`
);

const month = (m, spend, leads, sales, revenue, currency = 'USD') => ({
  month: m, spend, leads, sales, revenue, spend_currency: currency,
});

test('считает итоги, цену заявки, ROMI и конверсию', () => {
  const result = buildCaseFromMonths([
    month('2026-02', 1000, 50, 5, 4000),
    month('2026-01', 1000, 40, 4, 3000),
  ]);

  assert.equal(result.ok, true, result.problem);
  assert.equal(result.months.length, 2);
  // Порядок от раннего к позднему, независимо от порядка на входе.
  assert.deepEqual(result.months.map((item) => item.month), ['2026-01', '2026-02']);

  assert.equal(result.totals.spend, 2000);
  assert.equal(result.totals.leads, 90);
  assert.equal(result.totals.sales, 9);
  assert.equal(result.totals.revenue, 7000);
  assert.ok(Math.abs(result.totals.cpl - 2000 / 90) < 1e-9, 'цена заявки = расход ÷ заявки');
  assert.equal(result.totals.romi, ((7000 - 2000) / 2000) * 100);
  assert.equal(result.totals.conversion, (9 / 90) * 100);
  assert.equal(result.period, 'январь 2026 — февраль 2026');
});

test('месяц без цифр пропускается и назван, а не превращён в ноль', () => {
  // Пустой месяц как ноль занизил бы и сумму, и среднее: получилось бы, что в
  // этом месяце ничего не сработало, хотя данных просто не внесли.
  const result = buildCaseFromMonths([
    month('2026-01', 1000, 40, 4, 3000),
    month('2026-02', null, null, null, null),
    month('2026-03', 1000, 60, 6, 5000),
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.months.length, 2, 'в расчёт идут только месяцы с цифрами');
  assert.deepEqual(result.skipped, ['февраль 2026']);
  assert.equal(result.totals.leads, 100);
  // Период считается по месяцам с данными, а не по всему диапазону.
  assert.equal(result.period, 'январь 2026 — март 2026');
});

test('разные валюты не складываются, а объясняются', () => {
  const result = buildCaseFromMonths([
    month('2026-01', 1000, 40, 4, 3000, 'USD'),
    month('2026-02', 900000, 50, 5, 2000000, 'UZS'),
  ]);

  assert.equal(result.ok, false);
  assert.match(result.problem, /разные валюты/i);
  assert.match(result.problem, /USD/);
  assert.equal(result.totals.spend, null, 'при отказе итогов быть не должно');
});

test('пустая валюта не считается отдельной — это записи до перехода на доллары', () => {
  const result = buildCaseFromMonths([
    month('2026-01', 1000, 40, 4, 3000, ''),
    month('2026-02', 1000, 50, 5, 4000, 'USD'),
  ]);

  assert.equal(result.ok, true, result.problem);
  assert.equal(result.currency, 'USD');
  assert.equal(result.totals.spend, 2000);
});

test('ноль заявок не даёт ни нуля, ни бесконечности в цене заявки', () => {
  const result = buildCaseFromMonths([month('2026-01', 5000, 0, 0, 0)]);

  assert.equal(result.ok, true);
  assert.equal(result.totals.cpl, null, 'делить на ноль нельзя, и подставлять ноль тоже');
  assert.equal(result.totals.conversion, null);
  // Расход есть, выручка ноль — это настоящий результат, а не отсутствие данных.
  assert.equal(result.totals.romi, -100);
});

test('незаполненная колонка остаётся неизвестной, а не нулём', () => {
  const result = buildCaseFromMonths([
    month('2026-01', 1000, 40, null, null),
    month('2026-02', 1200, 50, null, null),
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.totals.sales, null, 'продажи не вводили — их и не показываем');
  assert.equal(result.totals.revenue, null);
  assert.equal(result.totals.romi, null, 'без выручки окупаемость неизвестна');
  assert.equal(result.totals.leads, 90);
});

test('когда цифр нет вовсе, сборка отказывается и говорит почему', () => {
  const result = buildCaseFromMonths([month('2026-01', null, null, null, null)]);
  assert.equal(result.ok, false);
  assert.match(result.problem, /нет цифр/i);
  assert.deepEqual(result.skipped, ['январь 2026']);
});

test('тренд цены заявки считается только когда она известна в обоих концах', () => {
  const falling = buildCaseFromMonths([
    month('2026-01', 1000, 20, null, null),
    month('2026-02', 1000, 50, null, null),
  ]);
  assert.ok(falling.cplTrend, 'цена заявки известна в обоих месяцах');
  assert.equal(falling.cplTrend.from, 50);
  assert.equal(falling.cplTrend.to, 20);
  assert.equal(falling.cplTrend.changePercent, -60);

  const unknown = buildCaseFromMonths([
    month('2026-01', null, 20, null, null),
    month('2026-02', 1000, 50, null, null),
  ]);
  assert.equal(unknown.cplTrend, null, 'сравнивать посчитанное с непосчитанным нельзя');
});

test('в поля кейса не попадают показатели, которых нет', () => {
  const result = buildCaseFromMonths([
    month('2026-01', 1000, 40, null, null),
    month('2026-02', 1200, 50, null, null),
  ]);
  const data = toCaseData(result, { niche: 'Стоматология' });

  assert.equal(data.niche, 'Стоматология');
  assert.equal(data.period, 'январь 2026 — февраль 2026');
  assert.equal(data.budgetValue, 2200);
  assert.equal(data.leadsValue, 90);
  assert.equal(data.roiValue, undefined, 'ROMI не посчитан — его в кейсе быть не должно');

  const labels = (data.metrics || []).map((item) => item.label);
  assert.ok(labels.includes('заявок'));
  assert.ok(labels.includes('цена заявки'));
  assert.ok(!labels.includes('продаж'), 'продаж не вводили — строки быть не должно');
  assert.ok(!labels.includes('ROMI'));
});

test('заголовок кейса берёт ROMI, когда он есть, и заявки, когда нет', () => {
  const withRomi = toCaseData(buildCaseFromMonths([month('2026-01', 1000, 40, 4, 5000)]));
  assert.equal(withRomi.headline, '+400%');
  assert.equal(withRomi.headlineLabel, 'ROMI за период');

  const withoutRomi = toCaseData(buildCaseFromMonths([month('2026-01', 1000, 40, null, null)]));
  assert.equal(withoutRomi.headline, '40');
  assert.equal(withoutRomi.headlineLabel, 'заявок за период');
});

test('график строится по заявкам и только когда точек больше одной', () => {
  const many = toCaseData(buildCaseFromMonths([
    month('2026-01', 1000, 40, null, null),
    month('2026-02', 1000, 55, null, null),
    month('2026-03', 1000, 70, null, null),
  ]));
  assert.deepEqual(many.chartPoints, [40, 55, 70]);

  const single = toCaseData(buildCaseFromMonths([month('2026-01', 1000, 40, null, null)]));
  assert.equal(single.chartPoints, undefined, 'одна точка — это не график');
});

test('заготовка текста содержит только посчитанные факты', () => {
  const outline = toCaseOutline(buildCaseFromMonths([
    month('2026-01', 1000, 40, null, null),
    month('2026-02', 1200, 50, null, null),
  ]), { niche: 'Стоматология' });

  assert.match(outline, /Стоматология/);
  assert.match(outline, /заявок: 90/);
  assert.ok(!/выручка/.test(outline), 'выручку не вводили — её в тексте быть не должно');
  assert.ok(!/ROMI/.test(outline));
  assert.match(outline, /<table>/, 'помесячная таблица при двух и более месяцах');
});

test('названия месяцев по-русски, а непонятный формат не ломает разбор', () => {
  assert.equal(monthLabel('2026-03'), 'март 2026');
  assert.equal(monthLabel('2026-12'), 'декабрь 2026');
  assert.equal(monthLabel('2026-13'), '2026-13', 'несуществующий месяц возвращается как есть');
  assert.equal(monthLabel('черт-те что'), 'черт-те что');
});
