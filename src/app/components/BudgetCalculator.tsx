import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { Calculator, TrendingUp, Target, Users, Zap, CheckCircle2, DollarSign, BarChart3 } from 'lucide-react';

const platforms = [
  { id: 'google', name: 'Google Ads', icon: BarChart3, gradient: 'from-primary to-accent' },
  { id: 'meta', name: 'Meta Ads', icon: Target, gradient: 'from-accent to-secondary' },
];

const goals = [
  { id: 'leads', name: 'Лиды / Заявки', icon: Users, description: 'Сбор контактов для отдела продаж. Подходит для услуг, консультаций, b2b.' },
  { id: 'sales', name: 'Продажи', icon: TrendingUp, description: 'Прямые продажи в интернет-магазине. Оптимально для e-commerce.' },
  { id: 'traffic', name: 'Трафик', icon: Zap, description: 'Увеличение посещаемости сайта. Для блогов, медиа, информационных порталов.' },
];

export default function BudgetCalculator() {
  const navigate = useNavigate();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['google', 'meta']);
  const [budget, setBudget] = useState(1000);
  const [goal, setGoal] = useState('leads');
  const [showResult, setShowResult] = useState(false);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const calculatePrice = () => {
    let basePrice = 0;
    if (selectedPlatforms.length === 1) basePrice = 600;
    if (selectedPlatforms.length === 2) basePrice = 900;
    
    if (budget >= 5000) basePrice += 200;
    if (budget >= 10000) basePrice += 300;
    
    if (goal === 'sales') basePrice += 200;
    if (goal === 'leads') basePrice += 200;
    
    return basePrice;
  };

  const price = calculatePrice();

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
            <span className="text-xs md:text-sm text-primary font-semibold">Рассчитайте стоимость</span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            Калькулятор{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              бюджета рекламы
            </span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-2xl mx-auto">
            Подберите оптимальный пакет под ваш бизнес. Укажите параметры и получите примерную стоимость услуг.
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
              Месячный бюджет на рекламу: <span className="text-primary font-bold">${budget.toLocaleString()}</span>
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
                    onClick={() => setGoal(g.id)}
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
            Рассчитать стоимость
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
                  Примерная стоимость услуг
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-muted-foreground text-xs md:text-sm">Настройка и ведение</p>
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
                    <strong className="text-foreground">Что входит:</strong> полная настройка кампаний, создание креативов, ежедневная оптимизация, еженедельные отчёты, A/B тестирование.
                  </p>
                  <button
                    onClick={goToContact}
                    className="w-full py-2.5 md:py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    Заказать консультацию →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          *Стоимость является ориентировочной и может быть скорректирована после аудита.
        </p>
      </div>
    </section>
  );
}