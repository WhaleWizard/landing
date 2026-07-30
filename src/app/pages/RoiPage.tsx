import RoiCalculatorPopup from '../components/RoiCalculatorPopup';
import SEO from '../components/SEO';

export default function RoiPage() {
  return (
    <>
      <SEO
        title="Калькулятор ROAS и ROMI с полными расходами"
        description="Рассчитайте ROAS, полный ROMI, вклад после маркетинга и точку безубыточности с учётом ведения, креативов, сервисов, налогов и комиссий."
        url="/roi-calculator"
      />
      <main className="marketing-typography min-h-screen bg-background pt-16 text-foreground">
        <RoiCalculatorPopup />
      </main>
    </>
  );
}
