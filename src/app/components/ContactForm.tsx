import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence, useInView } from 'motion/react';
import { Send, CheckCircle2, Loader2, DollarSign, Sparkles, TrendingUp, Zap, MessageCircle, Phone } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { trackLead } from '../consent/consent';
import Modal from './Modal';

const budgetOptions = [
  { value: '50-100k', label: 'до 1000 $', icon: Sparkles, color: 'from-primary/20 to-primary/10', bgGradient: 'rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.1)' },
  { value: '100-300k', label: '1к-10к $', icon: TrendingUp, color: 'from-accent/20 to-accent/10', bgGradient: 'rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.1)' },
  { value: '300-500k', label: '10к-50к $', icon: Zap, color: 'from-secondary/20 to-secondary/10', bgGradient: 'rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1)' },
  { value: '500k+', label: '50к+ $', icon: DollarSign, color: 'from-primary/20 to-accent/10', bgGradient: 'rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.1)' },
];

// Вынес статические данные левой части (преимущества)
const benefits = [
  { title: 'Бесплатный аудит', description: 'Анализ текущей ситуации и точек роста', icon: CheckCircle2, delay: 0 },
  { title: 'Стратегия роста', description: 'конкретные шаги для увеличения продаж с первого месяца.', icon: TrendingUp, delay: 0.1 },
  { title: 'Быстрый старт', description: 'Запуск рекламы в течение 4-6 дней', icon: Zap, delay: 0.2 },
];

// Хук для определения тач-устройства
const useTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);
  return isTouch;
};

function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    budget: '',
    message: '',
  });
  const [contactMethod, setContactMethod] = useState<'telegram' | 'whatsapp'>('telegram');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);

  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: false, margin: '0px 0px -10% 0px' });
  const isTouch = useTouchDevice();

  const handleChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      alert('Пожалуйста, подтвердите согласие с условиями');
      return;
    }
    setIsSubmitting(true);

    try {
      const proxyUrl = 'https://script.google.com/macros/s/AKfycbxE5dVWccxQ0Ga3MSUYeEZ8B6c-KEkbBNl3QPa-zbkyjBvFl5QnxZA2g5BIGmwe-7jNfA/exec';

      await fetch(proxyUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          budget: formData.budget,
          message: formData.message,
          contactMethod: contactMethod,
          telegramUsername: contactMethod === 'telegram' ? telegramUsername : undefined,
        })
      });

      setIsSubmitted(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        budget: '',
        message: '',
      });
      setTelegramUsername('');
      setContactMethod('telegram');
      setAgreed(false);
      trackLead();

      setTimeout(() => setIsSubmitted(false), 5000);
      setTimeout(() => navigate('/thank-you'), 800);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, navigate, agreed, contactMethod, telegramUsername]);

  const handleSetTelegramUsername = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTelegramUsername(e.target.value);
  }, []);

  const handleSetContactMethod = useCallback((method: 'telegram' | 'whatsapp') => {
    setContactMethod(method);
  }, []);

  // Отключаем hover-анимации на тач-устройствах (для радио-кнопок и левой части)
  const radioHover = !isTouch ? { whileHover: { scale: 1.05 } } : {};
  const benefitHover = !isTouch ? { whileHover: { scale: 1.1 } } : {};

  return (
    <section
      id="contact"
      ref={sectionRef}
      className="relative py-16 md:py-24 overflow-hidden"
      style={{ contain: 'layout style paint' }}
    >
      {/* Фоновые круги с пульсацией – активны только когда секция видна */}
      {inView && (
        <>
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
        </>
      )}

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8 md:gap-12 items-start">
          {/* Левая часть */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 backdrop-blur-sm">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm text-primary font-semibold">Бесплатная консультация</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold">
              Начните зарабатывать{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                больше сегодня
              </span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              Оставьте заявку на бесплатную консультацию. Проанализирую ваш бизнес и предложу стратегию роста.
            </p>
            <div className="space-y-4 pt-4">
              {benefits.map((item, index) => (
                <motion.div
                  key={index}
                  className="flex items-start gap-4 group"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: item.delay, duration: 0.5 }}
                >
                  <motion.div
                    className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center transition-transform"
                    {...benefitHover}
                  >
                    <item.icon className="w-6 h-6 text-primary" />
                  </motion.div>
                  <div>
                    <h4 className="font-semibold mb-1">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Правая часть – форма */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="relative p-6 md:p-8 rounded-3xl bg-card/50 backdrop-blur-xl border border-border shadow-2xl">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 opacity-50" />
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-primary/5 to-accent/5 animate-pulse" />
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-2xl" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-accent/20 to-transparent rounded-3xl blur-2xl" />

              <div className="relative">
                {isSubmitted ? (
                  <motion.div
                    className="text-center py-12 space-y-4"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    style={{ willChange: 'transform, opacity' }}
                  >
                    <div className="relative w-16 h-16 mx-auto">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-pulse">
                        <CheckCircle2 className="w-8 h-8 text-white" />
                      </div>
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent opacity-50 animate-ping" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold">Спасибо за заявку!</h3>
                    <p className="text-sm md:text-base text-muted-foreground">Я свяжусь с вами в ближайшее время</p>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* ... (весь оставшийся контент формы без изменений) */}
                  </form>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Модальные окна с полными текстами */}
      <Modal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Политика конфиденциальности"
        dialogClassName="max-w-4xl"
        bodyClassName="prose prose-invert prose-sm max-w-none"
      >
        {/* ... полный текст политики ... */}
      </Modal>

      <Modal
        isOpen={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        title="Публичная оферта"
        dialogClassName="max-w-4xl"
        bodyClassName="prose prose-invert prose-sm max-w-none"
      >
        {/* ... полный текст оферты ... */}
      </Modal>
    </section>
  );
}

export default memo(ContactForm);
