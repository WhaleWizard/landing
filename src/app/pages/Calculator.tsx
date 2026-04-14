import BudgetCalculator from '../components/BudgetCalculator';
import SEO from '../components/SEO';

export default function CalculatorPage() {
  return (
    <>
      <SEO
        title="Калькулятор бюджета рекламы"
        description="Рассчитайте примерную стоимость услуг по настройке Google Ads и Meta Ads. Укажите бюджет и цели – получите цену."
        url="/calculator"
      />
      <div className="pt-16">
        <BudgetCalculator />
      </div>
    </>
  );
}