import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import SEO from '../components/SEO';
import OfferContent from '../components/legal/OfferContent';

export default function Offer() {
  const navigate = useNavigate();

  const goHome = () => {
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <SEO
        title="Публичная оферта"
        description="Официальный документ, регулирующий условия предоставления услуг по настройке и ведению рекламных кампаний Whale Wzrd. Порядок оплаты, ответственность сторон, права на креативы."
        url="/offer"
      />
      <section className="min-h-screen bg-background py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Кнопка "На главную" — над заголовком, слева */}
          <div className="mb-6">
            <button
              onClick={goHome}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent border-none"
            >
              ← На главную
            </button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold">
              Публичная<span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent"> оферта</span>
            </h1>
            <p className="text-muted-foreground mt-4">Дата последнего обновления: 29 мая 2026 г.</p>
          </motion.div>

          <div className="prose prose-invert prose-lg prose-headings:text-foreground prose-a:text-primary max-w-none space-y-6">
            <OfferContent />
          </div>
        </div>
      </section>
    </>
  );
}