import BudgetCalculator from '../components/BudgetCalculator';
import SEO from '../components/SEO';

export default function CalculatorPage() {
  return (
    <>
      <SEO
        title="Калькулятор бюджета, ROAS и ROMI для Google Ads и Meta Ads"
        description="Прогноз воронки, фактические ROAS и ROMI, точка безубыточности и прозрачная оценка ведения Google Ads и Meta Ads для рынков СНГ."
        url="/calculator"
      />
      <main className="marketing-typography min-h-screen bg-background text-foreground pt-16">
        <BudgetCalculator />
      </main>
    </>
  );
}
