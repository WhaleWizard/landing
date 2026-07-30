export type CalculatorMode = 'forecast' | 'actual' | 'quote';
export type BusinessModel = 'leadgen' | 'ecommerce';
export type ScenarioId = 'conservative' | 'base' | 'strong';
export type ServiceGoal = 'traffic' | 'leads' | 'sales';

export type MarketingCosts = {
  mediaSpend: number;
  management: number;
  creative: number;
  tools: number;
  feesAndTax: number;
  other: number;
};

export type FinancialInput = MarketingCosts & {
  revenue: number;
  contributionMarginPct: number;
  units?: number;
  averageOrderValue?: number;
};

export type FinancialResult = {
  mediaSpend: number;
  marketingInvestment: number;
  revenue: number;
  contributionBeforeMarketing: number;
  netContributionAfterMarketing: number;
  roas: number | null;
  romi: number | null;
  breakEvenRevenue: number | null;
  breakEvenUnits: number | null;
  breakEvenTotalCac: number | null;
  breakEvenMediaRoas: number | null;
};

export type ForecastInput = MarketingCosts & {
  businessModel: BusinessModel;
  acquisitionCost: number;
  qualifiedLeadRatePct: number;
  closeRatePct: number;
  averageOrderValue: number;
  contributionMarginPct: number;
};

export type ForecastResult = FinancialResult & {
  id: ScenarioId;
  acquisitionCost: number;
  leads: number | null;
  customers: number;
};

export type QuoteInput = {
  platformCount: number;
  monthlyAdBudget: number;
  goal: ServiceGoal;
  marketCount: 1 | 2 | 3;
  tracking: 'basic' | 'advanced';
  creativeUnits: number;
  firstMonth: boolean;
};

export type QuoteLine = {
  label: string;
  value: number;
};

export type QuoteResult = {
  monthlyFee: number;
  lineItems: QuoteLine[];
  policy: 'house-v2-preview';
};

const safeDivide = (numerator: number, denominator: number) => (
  Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? numerator / denominator
    : null
);

const nonNegative = (value: number) => (
  Number.isFinite(value) && value > 0 ? value : 0
);

const clampRate = (value: number) => Math.min(100, Math.max(0, nonNegative(value)));

export function calculateFinancials(input: FinancialInput): FinancialResult {
  const mediaSpend = nonNegative(input.mediaSpend);
  const marketingInvestment = [
    mediaSpend,
    input.management,
    input.creative,
    input.tools,
    input.feesAndTax,
    input.other,
  ].reduce((sum, value) => sum + nonNegative(value), 0);
  const revenue = nonNegative(input.revenue);
  const marginRate = clampRate(input.contributionMarginPct) / 100;
  const contributionBeforeMarketing = revenue * marginRate;
  const netContributionAfterMarketing = contributionBeforeMarketing - marketingInvestment;
  const roas = safeDivide(revenue, mediaSpend);
  const romi = safeDivide(netContributionAfterMarketing, marketingInvestment);
  const breakEvenRevenue = marginRate > 0 ? marketingInvestment / marginRate : null;
  const averageOrderValue = nonNegative(input.averageOrderValue ?? 0);
  const breakEvenUnits = breakEvenRevenue !== null && averageOrderValue > 0
    ? breakEvenRevenue / averageOrderValue
    : null;
  const breakEvenTotalCac = averageOrderValue > 0 && marginRate > 0
    ? averageOrderValue * marginRate
    : null;
  const breakEvenMediaRoas = mediaSpend > 0 && marginRate > 0
    ? marketingInvestment / (mediaSpend * marginRate)
    : null;

  return {
    mediaSpend,
    marketingInvestment,
    revenue,
    contributionBeforeMarketing,
    netContributionAfterMarketing,
    roas,
    romi,
    breakEvenRevenue,
    breakEvenUnits,
    breakEvenTotalCac,
    breakEvenMediaRoas,
  };
}

const scenarioRules: Array<{
  id: ScenarioId;
  costFactor: number;
  rateFactor: number;
}> = [
  { id: 'conservative', costFactor: 1.2, rateFactor: 0.85 },
  { id: 'base', costFactor: 1, rateFactor: 1 },
  { id: 'strong', costFactor: 0.8, rateFactor: 1.15 },
];

export function calculateForecast(input: ForecastInput): ForecastResult[] {
  const acquisitionCost = nonNegative(input.acquisitionCost);
  const mediaSpend = nonNegative(input.mediaSpend);
  const averageOrderValue = nonNegative(input.averageOrderValue);

  return scenarioRules.map(({ id, costFactor, rateFactor }) => {
    const scenarioAcquisitionCost = acquisitionCost * costFactor;
    const acquired = scenarioAcquisitionCost > 0 ? mediaSpend / scenarioAcquisitionCost : 0;
    const qualifiedRate = clampRate(input.qualifiedLeadRatePct * rateFactor) / 100;
    const closeRate = clampRate(input.closeRatePct * rateFactor) / 100;
    const leads = input.businessModel === 'leadgen' ? acquired : null;
    const customers = input.businessModel === 'leadgen'
      ? acquired * qualifiedRate * closeRate
      : acquired;
    const revenue = customers * averageOrderValue;
    const financials = calculateFinancials({
      ...input,
      revenue,
      units: customers,
      averageOrderValue,
    });

    return {
      ...financials,
      id,
      acquisitionCost: scenarioAcquisitionCost,
      leads,
      customers,
    };
  });
}

const roundToTen = (value: number) => Math.round(value / 10) * 10;

export function calculateQuote(input: QuoteInput): QuoteResult {
  const lineItems: QuoteLine[] = [];
  const platformCount = Math.max(1, Math.min(2, Math.round(input.platformCount)));
  const basePlatformFee = 600 + (platformCount - 1) * 300;
  lineItems.push({
    label: platformCount === 1 ? 'Одна рекламная система' : 'Две рекламные системы',
    value: basePlatformFee,
  });

  if (input.goal !== 'traffic') {
    lineItems.push({ label: 'Оптимизация по заявкам или продажам', value: 200 });
  }

  const budget = nonNegative(input.monthlyAdBudget);
  const middleBand = Math.max(0, Math.min(budget, 10_000) - 5_000);
  const upperBand = Math.max(0, budget - 10_000);
  const spendSurcharge = roundToTen(middleBand * 0.04 + upperBand * 0.03);
  if (spendSurcharge > 0) {
    lineItems.push({ label: 'Нагрузка по рекламному бюджету', value: spendSurcharge });
  }

  const marketSurcharge = input.marketCount === 1 ? 0 : input.marketCount === 2 ? 150 : 300;
  if (marketSurcharge > 0) {
    lineItems.push({
      label: input.marketCount === 2 ? 'Два рынка или языка' : 'Три и более рынков или языков',
      value: marketSurcharge,
    });
  }

  if (input.tracking === 'advanced') {
    lineItems.push({ label: 'CRM, offline events, CAPI или MMP', value: 250 });
  }

  const includedCreativeUnits = 4;
  const additionalCreativeUnits = Math.max(0, Math.round(input.creativeUnits) - includedCreativeUnits);
  const creativeSurcharge = roundToTen(additionalCreativeUnits * 25);
  if (creativeSurcharge > 0) {
    lineItems.push({
      label: `Дополнительные креативные единицы: ${additionalCreativeUnits}`,
      value: creativeSurcharge,
    });
  }

  if (input.firstMonth) {
    lineItems.push({ label: 'Первичная сборка и запуск', value: 200 });
  }

  return {
    monthlyFee: lineItems.reduce((sum, item) => sum + item.value, 0),
    lineItems,
    policy: 'house-v2-preview',
  };
}
