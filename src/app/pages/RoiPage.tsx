import { lazy, Suspense } from 'react';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import RoiCalculatorPopup from '../components/RoiCalculatorPopup';
import SEO from '../components/SEO';

const Footer = lazy(() => import('../components/Footer'));

export default function RoiPage() {
  return (
    <>
      <SEO
        title="Калькулятор ROAS и ROMI с полными расходами"
        description="Рассчитайте ROAS, полный ROMI, вклад после маркетинга и точку безубыточности с учётом ведения, креативов, сервисов, налогов и комиссий."
        url="/roi-calculator"
      />
      <Navbar variant="content" />
      <main className="marketing-typography min-h-screen bg-background pt-24 text-foreground md:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <PageNav
            crumbs={[
              { label: 'Главная', to: '/' },
              { label: 'Калькулятор ROI' },
            ]}
          />
        </div>
        <RoiCalculatorPopup />
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </main>
    </>
  );
}
