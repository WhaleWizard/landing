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
    <section className="relative py-12 md:py-16 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
        {/* Десктопная версия */}
        <div className="hidden md:flex items-stretch gap-0">
          <motion.button
            onClick={() => setIsBudgetModalOpen(true)}
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            whileHover={{ scale: 1.02 }}
            className="flex-1 group relative overflow-hidden rounded-l-2xl bg-card/40 backdrop-blur-md border border-primary/20 hover:border-primary/50 transition-all duration-300 p-6 md:p-8 text-left"
          >
            {/* ... содержимое кнопки ... */}
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Calculator className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl md:text-2xl font-bold mb-2">Оценить стоимость ведения</h3>
              <p className="text-muted-foreground text-sm mb-4">Предварительный ориентир по формату и стоимости работы</p>
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
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent/20 to-secondary/20 border border-accent/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-xl md:text-2xl font-bold mb-2">Посчитать ROAS и ROMI</h3>
              <p className="text-muted-foreground text-sm mb-4">Предварительная оценка по расходу, заказам и валовой прибыли</p>
              <div className="flex items-center gap-2 text-primary font-medium text-sm group-hover:gap-3 transition-all">
                <span>Открыть калькулятор</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.button>
        </div>

        {/* Мобильная версия (горизонтальный скролл) */}
        <div className="md:hidden relative">
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          <div
            ref={scrollContainerRef}
            className="roi-calculator-scroll scrollbar-brand flex gap-5 overflow-x-auto scroll-smooth pb-4"
            style={{
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
              <h3 className="text-lg font-bold mb-1">Оценить стоимость ведения</h3>
              <p className="text-xs text-muted-foreground mb-3">Предварительный ориентир</p>
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
              <h3 className="text-lg font-bold mb-1">Посчитать ROAS и ROMI</h3>
              <p className="text-xs text-muted-foreground mb-3">Оценка окупаемости</p>
              <div className="flex items-center gap-1 text-primary text-xs font-medium">
                <span>Открыть</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </motion.button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground/60">
            ← Листайте, чтобы увидеть все варианты →
          </p>
        </div>

        <style>{`
          .roi-calculator-scroll {
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            cursor: grab;
          }
          .roi-calculator-scroll:active {
            cursor: grabbing;
          }
        `}</style>
      </div>

      <Modal isOpen={isBudgetModalOpen} onClose={() => setIsBudgetModalOpen(false)} title="Оценка стоимости ведения" dialogClassName="marketing-typography">
        <BudgetCalculatorPopup onClose={() => setIsBudgetModalOpen(false)} />
      </Modal>

      <Modal isOpen={isRoiModalOpen} onClose={() => setIsRoiModalOpen(false)} title="Калькулятор ROAS / ROMI" dialogClassName="marketing-typography">
        <RoiCalculatorPopup onClose={() => setIsRoiModalOpen(false)} />
      </Modal>
    </section>
  );
}
