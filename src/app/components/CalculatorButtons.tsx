import { lazy, Suspense, useState } from 'react';
import { motion } from 'motion/react';
import { Calculator, TrendingUp, ArrowRight } from 'lucide-react';
import Modal from './Modal';

const BudgetCalculatorPopup = lazy(() => import('./BudgetCalculatorPopup'));
const RoiCalculatorPopup = lazy(() => import('./RoiCalculatorPopup'));

export default function CalculatorButtons() {
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isRoiModalOpen, setIsRoiModalOpen] = useState(false);

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
            <span className="text-xs md:text-sm text-primary font-semibold">Расчёты перед запуском</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">
            Два ориентира перед запуском{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">рекламы</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            Оцените стоимость ведения и посчитайте ROAS или ROMI по своим цифрам. Это отправная точка, а не прогноз результата.
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
              <h3 className="text-xl md:text-2xl font-bold mb-2">Оценить стоимость ведения</h3>
              <p className="text-muted-foreground text-sm mb-4">Ориентир с учётом площадок, рекламного бюджета и задачи</p>
              <div className="flex items-center gap-2 text-primary font-medium text-sm group-hover:gap-3 transition-all">
                <span>Открыть расчёт</span>
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
              <h3 className="text-xl md:text-2xl font-bold mb-2">Посчитать ROAS и ROMI</h3>
              <p className="text-muted-foreground text-sm mb-4">Расчёт по выручке, марже и числу оплаченных заказов</p>
              <div className="flex items-center gap-2 text-primary font-medium text-sm group-hover:gap-3 transition-all">
                <span>Открыть расчёт</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.button>
        </div>

        {/* Мобильная версия: обе задачи сразу видны, вертикальный скролл не перехватывается. */}
        <div className="relative grid gap-3 md:hidden">
            <motion.button
              onClick={() => setIsBudgetModalOpen(true)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35 }}
              whileTap={{ scale: 0.98 }}
              className="group relative w-full overflow-hidden rounded-2xl border border-primary/25 bg-card/50 p-5 text-left backdrop-blur-md transition-all duration-300 hover:border-primary/50"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/20 to-accent/20">
                  <Calculator className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold">Стоимость и медиаплан</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Объём работ, бюджет, площадки и рынки
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                    <span>Открыть дашборд</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </motion.button>

            <motion.button
              onClick={() => setIsRoiModalOpen(true)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.08 }}
              whileTap={{ scale: 0.98 }}
              className="group relative w-full overflow-hidden rounded-2xl border border-accent/25 bg-card/50 p-5 text-left backdrop-blur-md transition-all duration-300 hover:border-accent/50"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-gradient-to-br from-accent/20 to-secondary/20">
                  <TrendingUp className="h-6 w-6 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold">ROAS и полный ROMI</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Выручка, маржа, все расходы и безубыточность
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                    <span>Открыть дашборд</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </motion.button>
        </div>
      </div>

      <Modal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        title="Медиаплан и стоимость ведения"
        dialogClassName="marketing-typography"
        size="wide"
        hideFooter
        mobileFullscreen
        flushBody
      >
        <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Загружаю калькулятор…</div>}>
          <BudgetCalculatorPopup onClose={() => setIsBudgetModalOpen(false)} />
        </Suspense>
      </Modal>

      <Modal
        isOpen={isRoiModalOpen}
        onClose={() => setIsRoiModalOpen(false)}
        title="ROAS, ROMI и безубыточность"
        dialogClassName="marketing-typography"
        size="wide"
        hideFooter
        mobileFullscreen
        flushBody
      >
        <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Загружаю калькулятор…</div>}>
          <RoiCalculatorPopup onClose={() => setIsRoiModalOpen(false)} />
        </Suspense>
      </Modal>
    </section>
  );
}
