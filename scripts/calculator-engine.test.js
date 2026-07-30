import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

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

const {
  calculateFinancials,
  calculateForecast,
  calculateQuote,
} = calculatorModule.exports;

test('financials calculate ROAS, full-cost ROMI and break-even points', () => {
  const result = calculateFinancials({
    mediaSpend: 1_000,
    management: 600,
    creative: 200,
    tools: 0,
    feesAndTax: 0,
    other: 0,
    revenue: 5_000,
    contributionMarginPct: 40,
    averageOrderValue: 500,
  });

  assert.equal(result.marketingInvestment, 1_800);
  assert.equal(result.contributionBeforeMarketing, 2_000);
  assert.equal(result.netContributionAfterMarketing, 200);
  assert.equal(result.roas, 5);
  assert.ok(Math.abs(result.romi - (200 / 1_800)) < 1e-12);
  assert.equal(result.breakEvenRevenue, 4_500);
  assert.equal(result.breakEvenUnits, 9);
  assert.equal(result.breakEvenTotalCac, 200);
  assert.equal(result.breakEvenMediaRoas, 4.5);
});

test('financials remain honest for empty, negative and out-of-range values', () => {
  const result = calculateFinancials({
    mediaSpend: 0,
    management: -500,
    creative: Number.NaN,
    tools: 0,
    feesAndTax: 0,
    other: 0,
    revenue: -1,
    contributionMarginPct: 150,
    averageOrderValue: 0,
  });

  assert.equal(result.marketingInvestment, 0);
  assert.equal(result.revenue, 0);
  assert.equal(result.roas, null);
  assert.equal(result.romi, null);
  assert.equal(result.breakEvenRevenue, 0);
  assert.equal(result.breakEvenUnits, null);
  assert.equal(result.breakEvenTotalCac, null);
  assert.equal(result.breakEvenMediaRoas, null);
});

test('forecast scenarios preserve conservative-to-strong ordering', () => {
  const scenarios = calculateForecast({
    businessModel: 'leadgen',
    mediaSpend: 10_000,
    management: 1_000,
    creative: 500,
    tools: 0,
    feesAndTax: 0,
    other: 0,
    acquisitionCost: 20,
    qualifiedLeadRatePct: 60,
    closeRatePct: 20,
    averageOrderValue: 400,
    contributionMarginPct: 50,
  });

  const [conservative, base, strong] = scenarios;
  assert.deepEqual(scenarios.map((scenario) => scenario.id), [
    'conservative',
    'base',
    'strong',
  ]);
  assert.ok(conservative.customers < base.customers);
  assert.ok(base.customers < strong.customers);
  assert.ok(conservative.revenue < base.revenue);
  assert.ok(base.revenue < strong.revenue);
  assert.equal(base.leads, 500);
  assert.equal(base.customers, 60);
  assert.equal(base.revenue, 24_000);
});

test('quote defaults and progressive budget bands do not jump at thresholds', () => {
  const quote = (monthlyAdBudget) => calculateQuote({
    platformCount: 1,
    monthlyAdBudget,
    goal: 'leads',
    marketCount: 1,
    tracking: 'basic',
    creativeUnits: 4,
    firstMonth: true,
  });

  assert.equal(quote(1_000).monthlyFee, 1_000);
  assert.equal(quote(5_000).monthlyFee, 1_000);
  assert.equal(quote(10_000).monthlyFee, 1_200);
  assert.equal(quote(10_010).monthlyFee, 1_200);
  assert.equal(quote(20_000).monthlyFee, 1_500);
});

test('quote adds only the selected scope', () => {
  const result = calculateQuote({
    platformCount: 2,
    monthlyAdBudget: 15_000,
    goal: 'sales',
    marketCount: 3,
    tracking: 'advanced',
    creativeUnits: 8,
    firstMonth: false,
  });

  assert.equal(result.monthlyFee, 2_100);
  assert.deepEqual(result.lineItems.map((item) => item.label), [
    'Две рекламные системы',
    'Оптимизация по заявкам или продажам',
    'Нагрузка по рекламному бюджету',
    'Три и более рынков или языков',
    'CRM, offline events, CAPI или MMP',
    'Дополнительные креативные единицы: 4',
  ]);
});
