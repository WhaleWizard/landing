import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, DollarSign, Percent, BarChart3, Wallet, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router';

interface RoiCalculatorPopupProps {
  onClose: () => void;
}

export default function RoiCalculatorPopup({ onClose }: RoiCalculatorPopupProps) {
  const navigate = useNavigate();
  const [budget, setBudget] = useState(1000);
  const [averageCheck, setAverageCheck] = useState(50);
  const [margin, setMargin] = useState(30);
  const [orders, setOrders] = useState(30);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState({ revenue: 0, profit: 0, roas: 0, romi: 0 });

  const calculate = useCallback(() => {
    const revenue = orders * averageCheck;
    const profit = revenue * (margin / 100);
    const roas = (revenue / budget) * 100;
    const romi = ((profit - budget) / budget) * 100;
    setResult({ revenue, profit, roas, romi });
    setShowResult(true);
  }, [budget, averageCheck, margin, orders]);

  const goToContact = () => {
    onClose();
    navigate('/');
    setTimeout(() => {
      const contact = document.getElementById('contact');
      if (contact) contact.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" /> Бюджет ($)
          </label>
          <input
            type="range"
            min="100"
            max="20000"
            step="100"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full h-2 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary mb-2"
          />
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border/50 focus:border-primary outline-none text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Средний чек ($)
          </label>
          <input
            type="range"
            min="10"
            max="500"
            step="5"
            value={averageCheck}
            onChange={(e) => setAverageCheck(Number(e.target.value))}
            className="w-full h-2 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary mb-2"
          />
          <input
            type="number"
            value={averageCheck}
            onChange={(e) => setAverageCheck(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border/50 focus:border-primary outline-none text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Percent className="w-4 h-4 text-primary" /> Маржинальность (%)
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            className="w-full h-2 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary mb-2"
          />
          <input
            type="number"
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border/50 focus:border-primary outline-none text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" /> Заказов / лидов
          </label>
          <input
            type="range"
            min="0"
            max="500"
            step="5"
            value={orders}
            onChange={(e) => setOrders(Number(e.target.value))}
            className="w-full h-2 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary mb-2"
          />
          <input
            type="number"
            value={orders}
            onChange={(e) => setOrders(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-background/60 border border-border/50 focus:border-primary outline-none text-right"
          />
        </div>

        <button
          onClick={calculate}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          Рассчитать
        </button>

        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 p-4 rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10 border border-primary/30"
            >
              <h3 className="font-bold mb-3">Результаты</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Выручка</p>
                  <p className="text-xl font-bold text-primary">${formatNumber(result.revenue)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Прибыль</p>
                  <p className="text-xl font-bold text-primary">${formatNumber(result.profit)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">ROAS</p>
                  <p className="text-xl font-bold text-primary">{result.roas.toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">ROMI</p>
                  <p className={`text-xl font-bold ${result.romi >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {result.romi > 0 ? `+${result.romi.toFixed(0)}` : result.romi.toFixed(0)}%
                  </p>
                </div>
              </div>
              <button
                onClick={goToContact}
                className="w-full mt-4 py-2 rounded-lg bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 transition-all"
              >
                Заказать консультацию
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}