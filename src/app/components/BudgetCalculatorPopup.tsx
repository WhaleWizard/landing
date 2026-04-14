import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator, DollarSign, TrendingUp, Target, Zap, BarChart3, Wallet, ShoppingCart, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router';

interface BudgetCalculatorPopupProps {
  onClose: () => void;
}

export default function BudgetCalculatorPopup({ onClose }: BudgetCalculatorPopupProps) {
  const navigate = useNavigate();
  const [budget, setBudget] = useState(1000);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['google', 'meta']);
  const [goal, setGoal] = useState('leads');
  const [showResult, setShowResult] = useState(false);
  const [price, setPrice] = useState(0);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const calculatePrice = useCallback(() => {
    let basePrice = 0;
    if (selectedPlatforms.length === 1) basePrice = 500;
    if (selectedPlatforms.length === 2) basePrice = 800;
    if (budget >= 5000) basePrice += 200;
    if (budget >= 10000) basePrice += 300;
    if (goal === 'sales') basePrice += 200;
    if (goal === 'leads') basePrice += 100;
    return basePrice;
  }, [selectedPlatforms, budget, goal]);

  const handleCalculate = () => {
    setPrice(calculatePrice());
    setShowResult(true);
  };

  const goToContact = () => {
    onClose();
    navigate('/');
    setTimeout(() => {
      const contact = document.getElementById('contact');
      if (contact) contact.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const platforms = [
    { id: 'google', name: 'Google Ads', icon: Target },
    { id: 'meta', name: 'Meta Ads', icon: TrendingUp },
  ];

  const goals = [
    { id: 'leads', name: 'Лиды / Заявки', icon: Target, description: 'Сбор контактов для отдела продаж' },
    { id: 'sales', name: 'Продажи', icon: TrendingUp, description: 'Прямые продажи в интернет-магазине' },
    { id: 'traffic', name: 'Трафик', icon: Zap, description: 'Увеличение посещаемости сайта' },
  ];

  return (
    <div>
      <div className="space-y-6">
        {/* Платформы */}
        <div>
          <label className="block text-sm font-medium mb-3">Рекламные площадки</label>
          <div className="flex flex-wrap gap-3">
            {platforms.map(p => {
              const Icon = p.icon;
              const isSelected = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-primary to-accent border-transparent text-white shadow-lg shadow-primary/30'
                      : 'bg-background/50 border-border hover:border-primary/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{p.name}</span>
                  {isSelected && <CheckCircle2 className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Бюджет */}
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            Месячный бюджет ($)
          </label>
          <input
            type="range"
            min="300"
            max="20000"
            step="100"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full h-2 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary mb-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>$300</span>
            <span>$5k</span>
            <span>$10k</span>
            <span>$20k+</span>
          </div>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-right"
            step="100"
          />
        </div>

        {/* Цель */}
        <div>
          <label className="block text-sm font-medium mb-3">Основная цель</label>
          <div className="grid grid-cols-1 gap-3">
            {goals.map(g => {
              const Icon = g.icon;
              const isSelected = goal === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setGoal(g.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-primary/10 border-primary shadow-lg shadow-primary/20'
                      : 'bg-background/50 border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="font-semibold">{g.name}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{g.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleCalculate}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2"
        >
          <Calculator className="w-4 h-4" />
          Рассчитать стоимость
        </button>

        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-4 p-5 rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10 border border-primary/30"
            >
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                Примерная стоимость услуг
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-muted-foreground text-xs">Настройка и ведение</p>
                  <p className="text-2xl font-bold text-primary">${price}</p>
                  <p className="text-xs text-muted-foreground">в месяц</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Рекламный бюджет (ваш)</p>
                  <p className="text-2xl font-bold text-primary">${budget.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">в месяц</p>
                </div>
              </div>
              <div className="border-t border-border/50 pt-4 mt-2">
                <p className="text-xs text-muted-foreground mb-3">
                  <strong>Что входит:</strong> полная настройка кампаний, создание креативов, ежедневная оптимизация, еженедельные отчёты, A/B тестирование.
                </p>
                <button
                  onClick={goToContact}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all"
                >
                  Заказать консультацию
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}