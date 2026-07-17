import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { Calculator, TrendingUp, Target, Users, Zap, CheckCircle2, DollarSign, BarChart3 } from 'lucide-react';
import { calculateServicePrice, type ServicePricingGoal } from '../utils/servicePricing';

const platforms = [
  { id: 'google', name: 'Google Ads', icon: BarChart3, gradient: 'from-primary to-accent' },
  { id: 'meta', name: 'Meta Ads', icon: Target, gradient: 'from-accent to-secondary' },
];

const goals = [
  { id: 'leads', name: 'Заявки', icon: Users, description: 'Контакты с последующей квалификацией. Для услуг, консультаций и B2B.' },
  { id: 'sales', name: 'Продажи', icon: TrendingUp, description: 'Оплаченные заказы в интернет-магазине или другом e-commerce-проекте.' },
  { id: 'traffic', name: 'Трафик', icon: Zap, description: 'Целевые посещения сайта без оптимизации кампаний по заявкам или покупкам.' },
];

export default function BudgetCalculator() {
  const navigate = useNavigate();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['google', 'meta']);
  const [budget, setBudget] = useState(1000);
  const [goal, setGoal] = useState<ServicePricingGoal>('leads');
  const [showResult, setShowResult] = useState(false);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) => {
      if (!prev.includes(id)) return [...prev, id];
      return prev.length === 1 ? prev : prev.filter((platform) => platform !== id);
    });
  };

  const price = calculateServicePrice(selectedPlatforms.length, budget, goal);

  const handleCalculate = () => {
    setShowResult(true);
    setTimeout(() => {
      const element = document.getElementById('calculator-result');
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const goToContact = () => {
    navigate('/');
    setTimeout(() => {
      const contactElement = document.getElementById('contact');
      if (contactElement) contactElement.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <section id="calculator" className="relative py-12 md:py-20 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8 md:mb-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4">
            <Calculator className="w-4 h-4 text-primary" />
            <span className="text-xs md:text-sm text-primary font-semibold">Ориентир по стоимости</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold">
            Оценка стоимости{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              ведения рекламы
            </span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-2xl mx-auto">
            Укажите площадки, рекламный бюджет и задачу. Калькулятор покажет ориентир по стоимости ведения — точный объём работ согласуем после разбора проекта.
          </p>
        </motion.div>

        <div className="bg-card/40 backdrop-blur-xl border border-primary/20 rounded-2xl p-5 md:p-8 shadow-2xl">
          {/* Выбор платформ */}
          <div className="mb-6 md:mb-8">
            <label className="block text-sm font-medium mb-3">Рекламные площадки</label>
            <div className="flex flex-wrap gap-3 md:gap-4">
              {platforms.map(p => {
                const Icon = p.icon;
                const isSelected = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-2 px-4 py-2.5 md:px-5 md:py-3 rounded-xl border transition-all duration-300 text-sm md:text-base ${
                      isSelected
                        ? `bg-gradient-to-r ${p.gradient} border-transparent shadow-lg shadow-primary/30 text-white`
                        : 'bg-background/50 border-border hover:border-primary/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 md:w-5 md:h-5" />
                    <span>{p.name}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Бюджет слайдер */}
          <div className="mb-6 md:mb-8">
            <label className="block text-sm font-medium mb-3">
              Рекламный бюджет в месяц: <span className="text-primary font-bold">${budget.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min="300"
              max="20000"
              step="100"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full h-2 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>$300</span>
              <span>$5k</span>
              <span>$10k</span>
              <span>$20k+</span>
            </div>
          </div>

          {/* Цель кампании */}
          <div className="mb-6 md:mb-8">
            <label className="block text-sm font-medium mb-3">Основная цель</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {goals.map(g => {
                const Icon = g.icon;
                const isSelected = goal === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setGoal(g.id as ServicePricingGoal)}
                    aria-pressed={isSelected}
                    className={`text-left p-3 md:p-4 rounded-xl border transition-all duration-300 ${
                      isSelected
                        ? 'bg-primary/10 border-primary shadow-lg shadow-primary/20'
                        : 'bg-background/50 border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                      <span className="font-semibold text-sm md:text-base">{g.name}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary ml-auto" />}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{g.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleCalculate}
            className="w-full py-3 md:py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2 group"
          >
            <Calculator className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
            Получить ориентир
          </button>

          <AnimatePresence>
            {showResult && (
              <motion.div
                id="calculator-result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-6 md:mt-8 p-5 md:p-6 rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10 border border-primary/30"
              >
                <h3 className="text-lg md:text-xl font-bold mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  Ориентировочная стоимость работы
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-muted-foreground text-xs md:text-sm">Ведение рекламы</p>
                    <p className="text-2xl md:text-3xl font-bold text-primary">${price}</p>
                    <p className="text-xs text-muted-foreground">в месяц</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs md:text-sm">Рекламный бюджет (ваш)</p>
                    <p className="text-2xl md:text-3xl font-bold text-primary">${budget.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">в месяц</p>
                  </div>
                </div>
                <div className="border-t border-border/50 pt-4 mt-2">
                  <p className="text-xs md:text-sm text-muted-foreground mb-3">
                    <strong className="text-foreground">Обычно входит:</strong> настройка и ведение кампаний, аналитика, проверка гипотез, офферы, ТЗ на креативы и отчёт. Дизайн, съёмка, монтаж и дополнительные интеграции — отдельно.
                  </p>
                  <button
                    onClick={goToContact}
                    className="w-full py-2.5 md:py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    Обсудить проект →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          *Это предварительный расчёт, а не публичная оферта. Точная стоимость зависит от структуры аккаунта, аналитики и объёма работ.
        </p>
      </div>
    </section>
  );
}
