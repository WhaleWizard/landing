import { lazy, Suspense } from 'react';
import ClientOnly from '../components/ClientOnly';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import RoiCalculatorPopup from '../components/RoiCalculatorPopup';
import SEO from '../components/SEO';

const Footer = lazy(() => import('../components/Footer'));

export default function RoiPage() {
  return (
    <>
      <SEO
        title="Калькулятор окупаемости рекламы: ROI, ROMI и ROAS"
        description="Калькулятор ROI, ROMI и ROAS рекламы: рассчитайте окупаемость и точку безубыточности с учётом ведения, креативов, сервисов, налогов и комиссий — по своим цифрам, а не по средним по рынку."
        url="/roi-calculator/"
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
        {/* Подвал — вне серверной разметки: страница приходит готовой из HTML и
            гидратируется, а ленивый модуль внутри renderToString отдавал бы
            границу «дорисовать с клиента» и ошибку гидратации. */}
        <ClientOnly>
          <Suspense fallback={null}>
            <Footer />
          </Suspense>
        </ClientOnly>
      </main>
    </>
  );
}
