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
        title="Калькулятор рекламного бюджета и стоимости ведения"
        description="Прогноз заявок и продаж по медиабюджету в трёх сценариях и ориентир по стоимости ведения Google Ads и Meta Ads. Считает по вашим цифрам, а не по средним по рынку."
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
