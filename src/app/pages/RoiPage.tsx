import RoiCalculator from '../components/RoiCalculator';
import SEO from '../components/SEO';

export default function RoiPage() {
  return (
    <>
      <SEO
        title="Калькулятор ROAS и ROMI"
        description="Рассчитайте окупаемость рекламы в Google Ads и Meta Ads. Введите бюджет, средний чек, маржинальность и количество заказов – получите ROAS и ROMI."
        url="/roi-calculator"
      />
      <div className="pt-16 md:pt-20">
        <RoiCalculator />
      </div>
    </>
  );
}