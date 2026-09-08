import { lazy, Suspense } from 'react';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import SEO from '../components/SEO';
import { LEGAL_UPDATED_AT } from '../components/legal/legalMeta';
import CookiePolicyContent from '../components/legal/CookiePolicyContent';
import '../../styles/route-reveal.css';
import { useManagedTitleFit } from '../utils/contentTypography';

const Footer = lazy(() => import('../components/Footer'));

/** Заголовок страницы на телефоне — не больше двух строк. */
const STATIC_TITLE_LINES = { titleMaxLinesMobile: 2 } as const;

export default function CookiePolicy() {
  const staticTitleFit = useManagedTitleFit<HTMLHeadingElement>(STATIC_TITLE_LINES, { minFontSize: 16 });
  return (
    <>
      <SEO
        title="Политика использования файлов cookie"
        description="Cookie, localStorage, аналитика, рекламные пиксели и управление согласием на сайте Whale Wizard."
        url="/cookie-policy"
      />
      <Navbar variant="content" />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <section className="px-4 pb-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            {/* Возврат к странице, с которой открыли документ. */}
            <PageNav
              crumbs={[
                { label: 'Главная', to: '/' },
                { label: 'Политика Cookie' },
              ]}
              className="mb-8"
            />

            <div className="route-intro-reveal text-center mb-12">
              <h1 ref={staticTitleFit} className="text-balance break-words text-2xl font-bold sm:text-4xl md:text-5xl">
                Политика<span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent"> использования файлов cookie</span>
              </h1>
              <p className="text-muted-foreground mt-4">Дата последнего обновления: {LEGAL_UPDATED_AT}</p>
            </div>

            <div className="prose prose-invert prose-lg prose-headings:text-foreground prose-a:text-primary max-w-none space-y-6">
              <CookiePolicyContent />
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
