import { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import SEO from '../components/SEO';
import PrivacyPolicyContent from '../components/legal/PrivacyPolicyContent';

const Footer = lazy(() => import('../components/Footer'));

export default function PrivacyPolicy() {
  return (
    <>
      <SEO
        title="Политика конфиденциальности и обработки персональных данных"
        description="Порядок обработки персональных данных, cookie, аналитики и заявок на сайте Whale Wizard."
        url="/privacy-policy"
      />
      <Navbar variant="content" />
      <main className="min-h-screen bg-background pt-24 md:pt-28">
        <section className="px-4 pb-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            {/* Возврат к странице, с которой открыли документ. */}
            <PageNav
              crumbs={[
                { label: 'Главная', to: '/' },
                { label: 'Политика конфиденциальности' },
              ]}
              className="mb-8"
            />

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12"
            >
              {/* На 320px длинное «конфиденциальности» не влезало в строку и обрезалось. */}
              <h1 className="text-balance break-words text-2xl font-bold sm:text-4xl md:text-5xl">
                Политика<span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent"> конфиденциальности и обработки персональных данных</span>
              </h1>
              <p className="text-muted-foreground mt-4">Дата последнего обновления: 29 мая 2026 г.</p>
            </motion.div>

            <div className="prose prose-invert prose-lg prose-headings:text-foreground prose-a:text-primary max-w-none space-y-6">
              <PrivacyPolicyContent />
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
