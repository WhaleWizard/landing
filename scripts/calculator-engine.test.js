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

const adminSource = await readFile(new URL('../src/app/utils/adminUnitEconomics.ts', import.meta.url), 'utf8');
const adminCompiled = await transform(adminSource, { loader: 'ts', format: 'cjs', target: 'node20' });
const adminModule = { exports: {} };
new Function('module', 'exports', adminCompiled.code)(adminModule, adminModule.exports);
const { calculateAdminUnitEconomics } = adminModule.exports;
const adminBase = { targetRevenue: 10000, averageCheck: 1200, marginPercent: 65, leadToDealPercent: 18, siteConvPercent: 4, cpc: 1.2, repeatPurchases: 5.5 };

test('admin unit economics: independently checked B2B funnel and contribution', () => {
  const result = calculateAdminUnitEconomics(adminBase);
  assert.deepEqual([result.dealsNeeded, result.leadsNeeded, result.clicksNeeded], [9, 50, 1250]);
  assert.equal(result.estimatedBudget, 1500);
  assert.equal(result.actualRevenue, 10800);
  assert.equal(result.grossProfit, 7020);
  assert.equal(result.netProfit, 5520);
  assert.equal(result.romi, 368);
  assert.equal(result.roas, 7.2);
  assert.equal(result.calculatedCpl, 30);
  assert.equal(result.calculatedCac, 166.67);
  assert.equal(result.ltv, 4290);
  assert.equal(result.breakEvenCpc, 5.61);
  assert.equal(result.targetCplForRomi150, 56.16);
});

test('admin unit economics: incomplete or invalid plans cannot produce a recommendation', () => {
  for (const [key, values] of Object.entries({ targetRevenue: [0,-1,NaN,Infinity], averageCheck: [0,-1], cpc: [0,-1], marginPercent: [0,101], siteConvPercent: [0,101], leadToDealPercent: [0,101], repeatPurchases: [0] })) {
    for (const value of values) assert.equal(calculateAdminUnitEconomics({ ...adminBase, [key]: value }), null, key);
  }
  assert.equal(calculateAdminUnitEconomics({ ...adminBase, targetRevenue: Number.MAX_VALUE }), null);
});

test('admin unit economics: fractional media spend and thresholds retain cents', () => {
  const result = calculateAdminUnitEconomics({ targetRevenue: 1, averageCheck: 1, marginPercent: 50, leadToDealPercent: 100, siteConvPercent: 100, cpc: 0.01, repeatPurchases: 1 });
  assert.equal(result.estimatedBudget, 0.01);
  assert.equal(result.netProfit, 0.49);
  assert.equal(result.roas, 100);
  assert.equal(result.romi, 4900);
  assert.equal(result.breakEvenCpl, 0.5);
  assert.equal(result.breakEvenCac, 0.5);
  assert.equal(result.targetCplForRomi150, 0.2);
});

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
