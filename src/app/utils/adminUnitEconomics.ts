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

function snapInteger(value: number): number {
  const nearest = Math.round(value);
  const tolerance = Math.min(1e-7, Math.abs(value) * Number.EPSILON * 4);
  return Math.abs(nearest - value) <= tolerance ? nearest : value;
}

const ceilingPrice = (value: number) => Math.floor(snapInteger(value * 100)) / 100;

/** First-purchase contribution after media spend; overhead and tax are not supplied. */
export function calculateAdminUnitEconomics(input: UnitEconomicsInput) {
  const { targetRevenue, averageCheck, marginPercent, leadToDealPercent, siteConvPercent, cpc, repeatPurchases } = input;
  if (Object.values(input).some(value => !Number.isFinite(value))
    || targetRevenue <= 0 || averageCheck < 0.01 || cpc < 0.01 || repeatPurchases < 1
    || [marginPercent, leadToDealPercent, siteConvPercent].some(value => value <= 0 || value > 100)) return null;

  const margin = marginPercent / 100;
  const leadRate = leadToDealPercent / 100;
  const siteRate = siteConvPercent / 100;
  const dealsNeeded = Math.ceil(snapInteger(targetRevenue / averageCheck));
  const leadsNeeded = Math.ceil(snapInteger(dealsNeeded / leadRate));
  const clicksNeeded = Math.ceil(snapInteger(leadsNeeded / siteRate));
  if (![dealsNeeded, leadsNeeded, clicksNeeded].every(Number.isSafeInteger)) return null;

  const budget = clicksNeeded * cpc;
  const revenue = dealsNeeded * averageCheck;
  const gross = revenue * margin;
  const cpl = cpc / siteRate;
  const cac = cpl / leadRate;
  const contributionPerDeal = averageCheck * margin;
  const lifetimeContribution = contributionPerDeal * repeatPurchases;
  const breakEvenCplRaw = contributionPerDeal * leadRate;
  const netProfit = gross - budget;
  const romi = netProfit / budget * 100;
  const roas = revenue / budget;
  const ltvCacRatio = lifetimeContribution / cac;
  if (![budget, revenue, gross, cpl, cac, lifetimeContribution, romi, roas, ltvCacRatio]
    .every(value => Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100)) return null;

  return {
    dealsNeeded, leadsNeeded, clicksNeeded,
    estimatedBudget: cents(budget),
    calculatedCpl: cents(cpl),
    calculatedCac: cents(cac),
    actualRevenue: cents(revenue),
    grossProfit: cents(gross),
    netProfit: cents(netProfit),
    isLoss: budget > gross * (1 + Number.EPSILON * 4),
    romi: Math.round(romi),
    roas: cents(roas),
    ltv: cents(lifetimeContribution),
    ltvCacRatio: Math.round(ltvCacRatio * 10) / 10,
    hasLtvHeadroom: ltvCacRatio >= 3,
    breakEvenCac: ceilingPrice(contributionPerDeal),
    breakEvenCpl: ceilingPrice(breakEvenCplRaw),
    breakEvenCpc: ceilingPrice(breakEvenCplRaw * siteRate),
    targetCplForRomi150: ceilingPrice(breakEvenCplRaw / 2.5),
  };
}
