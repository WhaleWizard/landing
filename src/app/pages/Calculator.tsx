import { lazy, Suspense } from 'react';
import BudgetCalculator from '../components/BudgetCalculator';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import SEO from '../components/SEO';

const Footer = lazy(() => import('../components/Footer'));

export default function CalculatorPage() {
  return (
    <>
      <SEO
        title="Калькулятор бюджета, ROAS и ROMI для Google Ads и Meta Ads"
        description="Прогноз воронки, фактические ROAS и ROMI, точка безубыточности и прозрачная оценка ведения Google Ads и Meta Ads для рынков СНГ."
        url="/calculator"
      />
      <Navbar variant="content" />
      <main className="marketing-typography min-h-screen bg-background pt-24 text-foreground md:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <PageNav
            crumbs={[
              { label: 'Главная', to: '/' },
              { label: 'Калькулятор бюджета' },
            ]}
          />
        </div>
        <BudgetCalculator />
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </main>
    </>
  );
}
