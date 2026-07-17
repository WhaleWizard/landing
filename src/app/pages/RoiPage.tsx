import { motion } from 'motion/react';
import { BarChart3 } from 'lucide-react';
import RoiCalculatorPopup from '../components/RoiCalculatorPopup';
import SEO from '../components/SEO';

export default function RoiPage() {
  return (
    <>
      <SEO
        title="Калькулятор ROAS и ROMI"
        description="Рассчитайте ROAS по выручке и ROMI по валовой прибыли: укажите рекламный бюджет, средний чек, маржинальность и число оплаченных заказов."
        url="/roi-calculator"
      />
      <main className="marketing-typography relative min-h-screen overflow-hidden bg-background px-4 pb-16 pt-24 text-foreground sm:px-6 md:pb-20 md:pt-28">
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-[110px]" />

        <div className="relative mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 text-center md:mb-10"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary md:px-4 md:py-2 md:text-sm">
              <BarChart3 className="h-4 w-4" />
              Окупаемость рекламы
            </div>
            <h1 className="text-balance text-3xl leading-tight sm:text-4xl md:text-5xl">
              Посчитайте{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                ROAS и ROMI
              </span>
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Введите фактический бюджет, средний чек, маржинальность и число оплаченных заказов. Калькулятор покажет отдачу по выручке и по валовой прибыли.
            </p>
          </motion.div>

          <div className="mx-auto max-w-2xl rounded-2xl border border-primary/20 bg-card/40 p-5 shadow-2xl backdrop-blur-xl md:p-8">
            <RoiCalculatorPopup />
          </div>

          <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
            Расчёт даёт предварительный ориентир. Комиссии, стоимость ведения, производство креативов, налоги и другие расходы в формулу не входят.
          </p>
        </div>
      </main>
    </>
  );
}
