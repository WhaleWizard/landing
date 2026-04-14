import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calculator, TrendingUp, ArrowRight } from 'lucide-react';
import Modal from './Modal';
import BudgetCalculatorPopup from './BudgetCalculatorPopup';
import RoiCalculatorPopup from './RoiCalculatorPopup';

export default function CalculatorButtons() {
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isRoiModalOpen, setIsRoiModalOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && window.innerWidth < 768) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <section 
      id="calculator-section" 
      className="relative py-16 md:py-24 overflow-hidden"
      style={{ scrollMarginTop: '80px' }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary/5 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        {/* Заголовок */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10 md:mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-xs md:text-sm text-primary font-semibold">Полезные инструменты</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">
            Калькуляторы для вашего{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">бизнеса</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            Узнайте примерную стоимость услуг или оцените окупаемость рекламы. Просто заполните несколько полей.
          </p>
        </motion.div>

        {/* Десктопная версия */}
        <div className="hidden md:flex items-stretch gap-0 max-w-4xl mx-auto">
          <motion.button
            onClick={() => setIsBudgetModalOpen(true)}
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            whileHover={{ scale: 1.02 }}
            className="flex-1 group relative overflow-hidden rounded-l-2xl bg-card/40 backdrop-blur-md border border-primary/20 hover:border-primary/50 transition-all duration-300 p-6 md:p-8 text-left"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 to-transparent rounded-full blur-2xl group-hover:opacity-100 opacity-0 transition-opacity" />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Calculator className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl md:text-2xl font-bold mb-2">Рассчитать бюджет</h3>
              <p className="text-muted-foreground text-sm mb-4">Узнайте примерную стоимость услуг под ваш бюджет</p>
              <div className="flex items-center gap-2 text-primary font-medium text-sm group-hover:gap-3 transition-all">
                <span>Открыть калькулятор</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.button>

          <div className="relative w-px bg-gradient-to-b from-transparent via-primary/50 to-transparent mx-2" />

          <motion.button
            onClick={() => setIsRoiModalOpen(true)}
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ scale: 1.02 }}
            className="flex-1 group relative overflow-hidden rounded-r-2xl bg-card/40 backdrop-blur-md border border-primary/20 hover:border-primary/50 transition-all duration-300 p-6 md:p-8 text-left"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-accent/10 to-transparent rounded-full blur-2xl group-hover:opacity-100 opacity-0 transition-opacity" />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent/20 to-secondary/20 border border-accent/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-xl md:text-2xl font-bold mb-2">Рассчитать ROAS/ROMI</h3>
              <p className="text-muted-foreground text-sm mb-4">Оцените окупаемость рекламы по вашим показателям</p>
              <div className="flex items-center gap-2 text-primary font-medium text-sm group-hover:gap-3 transition-all">
                <span>Открыть калькулятор</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.button>
        </div>

        {/* Мобильная версия */}
        <div className="md:hidden relative">
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto scroll-smooth pb-4 -mx-4 px-4"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(139, 92, 246, 0.5) rgba(255, 255, 255, 0.05)',
              WebkitOverflowScrolling: 'touch',
              cursor: 'grab',
            }}
          >
            <motion.button
              onClick={() => setIsBudgetModalOpen(true)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="flex-shrink-0 w-[280px] group relative overflow-hidden rounded-2xl bg-card/40 backdrop-blur-md border border-primary/20 hover:border-primary/50 transition-all duration-300 p-5 text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center mb-3">
                <Calculator className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-1">Рассчитать бюджет</h3>
              <p className="text-xs text-muted-foreground mb-3">Примерная стоимость услуг</p>
              <div className="flex items-center gap-1 text-primary text-xs font-medium">
                <span>Открыть</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </motion.button>

            <motion.button
              onClick={() => setIsRoiModalOpen(true)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex-shrink-0 w-[280px] group relative overflow-hidden rounded-2xl bg-card/40 backdrop-blur-md border border-accent/20 hover:border-accent/50 transition-all duration-300 p-5 text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-secondary/20 border border-accent/30 flex items-center justify-center mb-3">
                <TrendingUp className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-bold mb-1">Рассчитать ROAS/ROMI</h3>
              <p className="text-xs text-muted-foreground mb-3">Окупаемость рекламы</p>
              <div className="flex items-center gap-1 text-primary text-xs font-medium">
                <span>Открыть</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </motion.button>
          </div>
        </div>

        <style>{`
          .overflow-x-auto::-webkit-scrollbar {
            height: 3px;
          }
          .overflow-x-auto::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb {
            background: linear-gradient(90deg, #8b5cf6, #6366f1, #3b82f6);
            border-radius: 10px;
          }
          .overflow-x-auto {
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            cursor: grab;
          }
          .overflow-x-auto:active {
            cursor: grabbing;
          }
        `}</style>
      </div>

      <Modal isOpen={isBudgetModalOpen} onClose={() => setIsBudgetModalOpen(false)} title="Калькулятор бюджета">
        <BudgetCalculatorPopup onClose={() => setIsBudgetModalOpen(false)} />
      </Modal>

      <Modal isOpen={isRoiModalOpen} onClose={() => setIsRoiModalOpen(false)} title="Калькулятор ROAS / ROMI">
        <RoiCalculatorPopup onClose={() => setIsRoiModalOpen(false)} />
      </Modal>
    </section>
  );
}