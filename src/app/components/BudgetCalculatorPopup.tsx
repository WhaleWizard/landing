import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator, DollarSign, TrendingUp, Target, Zap, BarChart3, Wallet, ShoppingCart, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { calculateServicePrice, type ServicePricingGoal } from '../utils/servicePricing';

interface BudgetCalculatorPopupProps {
  onClose: () => void;
}

export default function BudgetCalculatorPopup({ onClose }: BudgetCalculatorPopupProps) {
  const navigate = useNavigate();
  const [budget, setBudget] = useState(1000);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['google', 'meta']);
  const [goal, setGoal] = useState<ServicePricingGoal>('leads');
  const [showResult, setShowResult] = useState(false);
  const [price, setPrice] = useState(0);
  const canCalculate = Number.isFinite(budget) && budget >= 300;

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) => {
      if (!prev.includes(id)) return [...prev, id];
      return prev.length === 1 ? prev : prev.filter((platform) => platform !== id);
    });
  };

  const calculatePrice = useCallback(
    () => calculateServicePrice(selectedPlatforms.length, budget, goal),
    [selectedPlatforms.length, budget, goal],
  );

  const handleCalculate = () => {
    if (!canCalculate) return;
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
    { id: 'leads', name: 'Заявки', icon: Target, description: 'Контакты с последующей квалификацией' },
    { id: 'sales', name: 'Продажи', icon: TrendingUp, description: 'Оплаченные заказы в e-commerce' },
    { id: 'traffic', name: 'Трафик', icon: Zap, description: 'Целевые посещения без оптимизации по продажам' },
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
                  aria-pressed={isSelected}
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
            Рекламный бюджет в месяц ($)
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
            min="300"
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
                  onClick={() => setGoal(g.id as ServicePricingGoal)}
                  aria-pressed={isSelected}
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
          disabled={!canCalculate}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Calculator className="w-4 h-4" />
          Получить ориентир
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
                Ориентировочная стоимость работы
              </h3>
              <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-muted-foreground text-xs">Ведение рекламы</p>
                  <p className="text-2xl font-bold text-primary">${price}</p>
                  <p className="text-xs text-muted-foreground">в месяц</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Рекламный бюджет (ваш)</p>
                  <p className="text-2xl font-bold text-primary">${budget.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">в месяц</p>
                </div>
              </div>
              <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">
                Это предварительный расчёт. Точная стоимость зависит от структуры аккаунта, аналитики и объёма работ.
              </p>
              <div className="border-t border-border/50 pt-4 mt-2">
                <p className="text-xs text-muted-foreground mb-3">
                  <strong>Обычно входит:</strong> настройка и ведение кампаний, аналитика, проверка гипотез, офферы, ТЗ на креативы и отчёт. Дизайн, съёмка, монтаж и интеграции — отдельно.
                </p>
                <button
                  onClick={goToContact}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all"
                >
                  Обсудить проект
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
