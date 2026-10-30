export interface UnitEconomicsInput {
  targetRevenue: number;
  averageCheck: number;
  marginPercent: number;
  leadToDealPercent: number;
  siteConvPercent: number;
  cpc: number;
  repeatPurchases: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;
const ceilingPrice = (value: number) => Math.floor((value + Number.EPSILON) * 100) / 100;

/** First-purchase contribution after media spend; overhead and tax are not supplied. */
export function calculateAdminUnitEconomics(input: UnitEconomicsInput) {
  const { targetRevenue, averageCheck, marginPercent, leadToDealPercent, siteConvPercent, cpc, repeatPurchases } = input;
  if (Object.values(input).some(value => !Number.isFinite(value))
    || targetRevenue <= 0 || averageCheck < 0.01 || cpc < 0.01 || repeatPurchases < 1
    || [marginPercent, leadToDealPercent, siteConvPercent].some(value => value <= 0 || value > 100)) return null;

  const margin = marginPercent / 100;
  const leadRate = leadToDealPercent / 100;
  const siteRate = siteConvPercent / 100;
  const dealsNeeded = Math.ceil(targetRevenue / averageCheck);
  const leadsNeeded = Math.ceil(dealsNeeded / leadRate);
  const clicksNeeded = Math.ceil(leadsNeeded / siteRate);
  if (![dealsNeeded, leadsNeeded, clicksNeeded].every(Number.isSafeInteger)) return null;

  const budget = clicksNeeded * cpc;
  const revenue = dealsNeeded * averageCheck;
  const gross = revenue * margin;
  const cpl = cpc / siteRate;
  const cac = cpl / leadRate;
  const contributionPerDeal = averageCheck * margin;
  const lifetimeContribution = contributionPerDeal * repeatPurchases;
  const breakEvenCplRaw = contributionPerDeal * leadRate;
  if (![budget, revenue, gross, cpl, cac, lifetimeContribution].every(Number.isFinite)) return null;

  return {
    dealsNeeded, leadsNeeded, clicksNeeded,
    estimatedBudget: cents(budget),
    calculatedCpl: cents(cpl),
    calculatedCac: cents(cac),
    actualRevenue: cents(revenue),
    grossProfit: cents(gross),
    netProfit: cents(gross - budget),
    romi: Math.round((gross - budget) / budget * 100),
    roas: Math.round(revenue / budget * 100) / 100,
    ltv: cents(lifetimeContribution),
    ltvCacRatio: Math.round(lifetimeContribution / cac * 10) / 10,
    breakEvenCac: ceilingPrice(contributionPerDeal),
    breakEvenCpl: ceilingPrice(breakEvenCplRaw),
    breakEvenCpc: ceilingPrice(breakEvenCplRaw * siteRate),
    targetCplForRomi150: ceilingPrice(breakEvenCplRaw / 2.5),
  };
}
