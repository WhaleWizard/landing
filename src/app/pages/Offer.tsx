import { lazy, Suspense } from 'react';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import SEO from '../components/SEO';
import { LEGAL_UPDATED_AT } from '../components/legal/legalMeta';
import OfferContent from '../components/legal/OfferContent';
import '../../styles/route-reveal.css';
import { useManagedTitleFit } from '../utils/contentTypography';

const Footer = lazy(() => import('../components/Footer'));

/** Заголовок страницы на телефоне — не больше двух строк. */
const STATIC_TITLE_LINES = { titleMaxLinesMobile: 2 } as const;

export default function Offer() {
  const staticTitleFit = useManagedTitleFit<HTMLHeadingElement>(STATIC_TITLE_LINES, { minFontSize: 16 });
  return (
    <>
      <SEO
        title="Публичная оферта"
        description="Официальный документ, регулирующий условия предоставления услуг по настройке и ведению рекламных кампаний Whale Wizard. Порядок оплаты, ответственность сторон, права на креативы."
        url="/offer"
      />
      <Navbar variant="content" />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <section className="px-4 pb-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            {/* Возврат к странице, с которой открыли документ. */}
            <PageNav
              crumbs={[
                { label: 'Главная', to: '/' },
                { label: 'Публичная оферта' },
              ]}
              className="mb-8"
            />

            <div className="route-intro-reveal text-center mb-12">
              <h1 ref={staticTitleFit} className="text-balance break-words text-2xl font-bold sm:text-4xl md:text-5xl">
                Публичная<span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent"> оферта</span>
              </h1>
              <p className="text-muted-foreground mt-4">Дата последнего обновления: {LEGAL_UPDATED_AT}</p>
            </div>

            <div className="prose prose-invert prose-lg prose-headings:text-foreground prose-a:text-primary max-w-none space-y-6">
              <OfferContent />
            </div>
          </div>
        </section>
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </main>
    </>
  );
}
