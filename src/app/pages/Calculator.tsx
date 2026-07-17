import BudgetCalculator from '../components/BudgetCalculator';
import SEO from '../components/SEO';

export default function CalculatorPage() {
  return (
    <>
      <SEO
        title="Стоимость ведения Google Ads и Meta Ads — расчёт"
        description="Предварительная оценка стоимости ведения Google Ads и Meta Ads с учётом площадок, рекламного бюджета и основной задачи проекта."
        url="/calculator"
      />
      <main className="marketing-typography min-h-screen bg-background text-foreground pt-16">
        <BudgetCalculator />
      </main>
    </>
  );
}
