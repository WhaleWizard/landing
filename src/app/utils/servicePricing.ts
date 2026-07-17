export type ServicePricingGoal = 'leads' | 'sales' | 'traffic';

export function calculateServicePrice(
  platformCount: number,
  monthlyAdBudget: number,
  goal: ServicePricingGoal,
): number {
  const basePrice = platformCount >= 2 ? 900 : 600;
  const budgetAdjustment = monthlyAdBudget >= 10_000 ? 500 : monthlyAdBudget >= 5_000 ? 200 : 0;
  const goalAdjustment = goal === 'traffic' ? 0 : 200;

  return basePrice + budgetAdjustment + goalAdjustment;
}
