import { useState, useCallback, memo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence, useInView } from 'motion/react';
import { Send, CheckCircle2, Loader2, DollarSign, Sparkles, TrendingUp, Zap, X, MessageCircle, Phone } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { trackLead } from '../consent/consent';

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
  useState(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  });
  return isTouch;
};

// Компонент модального окна (добавлен will-change)
function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            style={{ willChange: 'transform, opacity' }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl max-h-[85vh] bg-card border border-primary/30 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            <div className="flex justify-between items-center p-4 border-b border-border">
              <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{title}</h2>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-primary/10 transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto prose prose-invert prose-sm max-w-none">
              {children}
            </div>
            <div className="p-4 border-t border-border flex justify-end">
              <Button onClick={onClose} variant="outline" className="border-primary/30">Закрыть</Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

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
                    {/* Поля формы – без изменений */}
                    <div className="relative">
                      <label className="block text-sm mb-2 font-medium">Имя *</label>
                      <div className="relative">
                        <Input name="name" type="text" required value={formData.name} onChange={handleChange} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)} placeholder="Ваше имя" className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all backdrop-blur-sm" />
                        {focusedField === 'name' && <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none" />}
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-sm mb-2 font-medium">Email *</label>
                      <div className="relative">
                        <Input name="email" type="email" required value={formData.email} onChange={handleChange} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} placeholder="your@email.com" className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all backdrop-blur-sm" />
                        {focusedField === 'email' && <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none" />}
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-sm mb-2 font-medium">Телефон *</label>
                      <div className="relative">
                        <Input name="phone" type="tel" required value={formData.phone} onChange={handleChange} onFocus={() => setFocusedField('phone')} onBlur={() => setFocusedField(null)} placeholder="+111 11 123-45-67" className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all backdrop-blur-sm" />
                        {focusedField === 'phone' && <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none" />}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm mb-3 font-medium">Месячный бюджет</label>
                      <div className="grid grid-cols-2 gap-3">
                        {budgetOptions.map((option) => (
                          <motion.div key={option.value} {...radioHover} whileTap={{ scale: 0.95 }} className="relative">
                            <input type="radio" id={option.value} name="budget" value={option.value} checked={formData.budget === option.value} onChange={handleChange} className="peer sr-only" />
                            <label htmlFor={option.value} className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all duration-300 bg-background/50 border border-border/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/70 peer-checked:border-primary peer-checked:shadow-lg peer-checked:shadow-primary/20`} style={formData.budget === option.value ? { backgroundImage: `linear-gradient(to bottom right, ${option.bgGradient})` } : {}}>
                              <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${option.color} border border-primary/30 flex items-center justify-center`}><option.icon className="w-4 h-4 text-primary" /></div>
                              <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{option.label}</div></div>
                              {formData.budget === option.value && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex-shrink-0"><CheckCircle2 className="w-5 h-5 text-primary" /></motion.div>}
                            </label>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-sm mb-2 font-medium">О вашем проекте</label>
                      <div className="relative">
                        <Textarea name="message" value={formData.message} onChange={handleChange} onFocus={() => setFocusedField('message')} onBlur={() => setFocusedField(null)} placeholder="Расскажите кратко о вашем проекте..." rows={4} className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all resize-none backdrop-blur-sm" />
                        {focusedField === 'message' && <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none" />}
                      </div>
                    </div>

                    {/* Способ связи */}
                    <div>
                      <label className="block text-sm mb-2 font-medium">Предпочитаемый способ связи</label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleSetContactMethod('telegram')}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                            contactMethod === 'telegram'
                              ? 'bg-primary/20 border-primary shadow-lg shadow-primary/20'
                              : 'bg-background/50 border-border hover:border-primary/50'
                          }`}
                        >
                          <MessageCircle className="w-4 h-4 text-primary" />
                          <span>Telegram</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetContactMethod('whatsapp')}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                            contactMethod === 'whatsapp'
                              ? 'bg-primary/20 border-primary shadow-lg shadow-primary/20'
                              : 'bg-background/50 border-border hover:border-primary/50'
                          }`}
                        >
                          <Phone className="w-4 h-4 text-primary" />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    </div>

                    {/* Условный блок с фиксированной высотой */}
                    <div className="min-h-[70px] md:min-h-[60px] transition-all duration-300">
                      <AnimatePresence mode="wait">
                        {contactMethod === 'telegram' && (
                          <motion.div
                            key="telegram"
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.15 }}
                            className="mt-2"
                          >
                            <label className="block text-sm mb-2 font-medium">Telegram username (необязательно)</label>
                            <Input
                              type="text"
                              value={telegramUsername}
                              onChange={handleSetTelegramUsername}
                              placeholder="@username"
                              className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all backdrop-blur-sm"
                            />
                          </motion.div>
                        )}
                        {contactMethod === 'whatsapp' && (
                          <motion.div
                            key="whatsapp"
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.15 }}
                            className="mt-2"
                          >
                            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                              💡 Убедитесь, что указанный выше номер телефона зарегистрирован в WhatsApp.
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Чекбокс согласия */}
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="consent"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="mt-1 w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary/20"
                      />
                      <label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed">
                        Я даю согласие на обработку моих персональных данных в соответствии с{' '}
                        <span onClick={() => setShowPrivacyModal(true)} className="text-primary hover:underline cursor-pointer">
                          Политикой конфиденциальности
                        </span>{' '}
                        и принимаю условия{' '}
                        <span onClick={() => setShowOfferModal(true)} className="text-primary hover:underline cursor-pointer">
                          Публичной оферты
                        </span>.
                      </label>
                    </div>

                    {/* Кнопка отправки */}
                    <Button
                      type="submit"
                      disabled={isSubmitting || !agreed}
                      className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
                      size="lg"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                      {isSubmitting ? (
                        <><Loader2 className="mr-2 w-5 h-5 animate-spin relative" /><span className="relative">Отправка...</span></>
                      ) : (
                        <><span className="relative">Отправить заявку</span><Send className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform relative" /></>
                      )}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      Нажимая кнопку, вы подтверждаете своё согласие с условиями выше.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Модальные окна с полными текстами (без изменений) */}
      <Modal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} title="Политика конфиденциальности">
        <div className="space-y-4">
          <p>Настоящая Политика конфиденциальности описывает, как сайт <strong>Whale Wzrd</strong> (далее – «Мы», «Сайт») обрабатывает информацию, которую вы предоставляете при использовании сайта <a href="https://whalewzrd.com" target="_blank" rel="noopener noreferrer">https://whalewzrd.com</a>. Мы не собираем, не храним и не передаём персональные данные, за исключением минимальной информации, необходимой для работы формы обратной связи.</p>
          <h3>1. Какие данные мы собираем</h3>
          <p>Когда вы заполняете форму обратной связи, вы добровольно предоставляете:</p>
          <ul><li>Имя (псевдоним или любое имя)</li><li>Контактные данные (email, телефон) — по вашему желанию</li></ul>
          <p>Техническая информация (IP-адрес, тип браузера, файлы cookie) может собираться автоматически системами аналитики и рекламными пикселями (Google Analytics, Meta Pixel) в обезличенном виде.</p>
          <p>Мы <strong>не собираем</strong> паспортные данные, ИНН, адреса проживания, данные банковских карт и любые иные сведения, позволяющие однозначно идентифицировать вас как физическое лицо.</p>
          <h3>2. Как мы используем ваши данные</h3>
          <ul><li>Для ответа на ваши заявки и консультации.</li><li>Для улучшения работы сайта на основе анонимной аналитики.</li><li>Для показа релевантной рекламы (при вашем согласии на cookie).</li></ul>
          <h3>3. Передача данных третьим лицам</h3>
          <p>Мы не продаём и не передаём ваши персональные данные третьим лицам, за исключением:</p>
          <ul><li>Платформ аналитики и рекламы (Google, Meta и др.), которые могут обрабатывать обезличенные данные о ваших действиях на сайте.</li><li>Случаев, предусмотренных законодательством (по требованию уполномоченных органов).</li></ul>
          <h3>4. Файлы cookie и системы аналитики</h3>
          <p>Сайт использует файлы cookie и пиксели для сбора статистики и ретаргетинга. Вы можете управлять cookie через баннер при первом посещении или настройки браузера. Подробнее — в <a href="/cookie-policy" target="_blank" rel="noopener noreferrer">Политике cookie</a>.</p>
          <h3>5. Хранение и защита данных</h3>
          <p>Мы храним ваши данные (имя, контакт) только в течение времени, необходимого для обработки вашего запроса, после чего они удаляются. Мы принимаем стандартные меры для защиты данных (SSL-шифрование, ограниченный доступ), но <strong>не гарантируем абсолютную безопасность</strong> в интернете.</p>
          <h3>6. Ваши права</h3>
          <p>Вы можете запросить удаление своих данных, отправив нам запрос по контактам ниже. Мы рассмотрим его в разумный срок.</p>
          <h3>7. Ограничение ответственности за утечку данных</h3>
          <p><strong>Вы используете сайт на свой страх и риск. Мы не несём ответственности за любые утечки персональных данных, вызванные:</strong></p>
          <ul><li>Действиями третьих лиц (взлом, хакерские атаки, перехват трафика);</li><li>Форс-мажорными обстоятельствами;</li><li>Нарушением вами правил безопасности (передача учётных данных, заражение устройства);</li><li>Сбоями в работе хостинга, провайдеров, рекламных платформ (Google, Meta).</li></ul>
          <p>Даже если утечка произойдёт по нашей вине, при предоставлении всех доказательств, наша ответственность ограничивается суммой <strong>не более 5 долларов США</strong> (или эквивалента) и не включает возмещение упущенной выгоды, морального вреда или штрафов. Вы принимаете это условие, продолжая использовать сайт.</p>
          <h3>8. Контакты</h3>
          <p>По всем вопросам, связанным с конфиденциальностью, вы можете связаться с нами:</p>
          <ul><li>Email: <a href="mailto:whalewzrd@gmail.com">whalewzrd@gmail.com</a></li><li>Telegram: <a href="https://t.me/white_rsh">@white_rsh</a></li></ul>
          <p>Никакие иные персональные данные владельца сайта (ФИО, ИНН, адрес) не разглашаются и не подлежат предоставлению по запросу.</p>
        </div>
      </Modal>

      <Modal isOpen={showOfferModal} onClose={() => setShowOfferModal(false)} title="Публичная оферта">
        <div className="space-y-4">
          <p>Настоящий документ является официальной публичной офертой (далее – «Оферта») Индивидуального предпринимателя <strong>Whale Wzrd</strong> (далее – «Исполнитель»), адресованная любому лицу (далее – «Заказчик»), о заключении договора на оказание информационно-консультационных услуг и услуг по настройке, ведению и оптимизации рекламных кампаний в системах <strong>Google Ads</strong> и <strong>Meta Ads</strong> (далее – «Услуги»).</p>
          <h3>1. Термины и определения</h3>
          <ul><li><strong>Оферта</strong> – настоящее предложение Исполнителя заключить договор.</li><li><strong>Акцепт</strong> – полное и безоговорочное принятие условий Оферты путём совершения действий, указанных в п. 2.4.</li><li><strong>Договор</strong> – договор между Исполнителем и Заказчиком, заключенный на условиях Оферты.</li><li><strong>Услуги</strong> – комплекс услуг по настройке, ведению и оптимизации рекламных кампаний в Google Ads и Meta Ads, включая создание креативов, копирайтинг, аналитику и отчётность.</li><li><strong>Сайт</strong> – интернет-сайт Исполнителя, расположенный по адресу: <a href="https://whalewzrd.com" target="_blank" rel="noopener noreferrer">https://whalewzrd.com</a>.</li><li><strong>Креатив</strong> – рекламный материал (текст, изображение, видео, аудио, макет), созданный Исполнителем в рамках оказания Услуг.</li></ul>
          <h3>2. Предмет Договора</h3>
          <p>2.1. Исполнитель обязуется оказать Заказчику Услуги в соответствии с выбранным тарифом или индивидуальным заданием, согласованным сторонами в переписке (мессенджеры, электронная почта).</p>
          <p>2.2. Конкретный перечень, объём и стоимость Услуг согласовываются сторонами в процессе переговоров и фиксируются в задании или подтверждаются оплатой Заказчиком счёта.</p>
          <p>2.3. Сроки оказания Услуг согласовываются индивидуально и указываются в задании. При отсутствии указания сроков Услуги оказываются в разумный срок, не превышающий 14 рабочих дней с момента получения предоплаты.</p>
          <p>2.4. Акцептом настоящей Оферты является осуществление Заказчиком 100% предоплаты стоимости Услуг, если иной порядок оплаты не согласован сторонами. Совершение Акцепта означает полное и безоговорочное согласие Заказчика со всеми условиями Договора.</p>
          <h3>3. Права и обязанности сторон</h3>
          <p><strong>3.1. Исполнитель обязуется:</strong> оказывать Услуги качественно, предоставлять отчёты, обеспечивать конфиденциальность информации, не разглашать персональные данные Заказчика.</p>
          <p><strong>3.2. Заказчик обязуется:</strong> своевременно предоставлять информацию и доступы, оплатить Услуги, не препятствовать Исполнителю, подписать акт в течение 3 рабочих дней.</p>
          <p><strong>3.3. Исполнитель вправе:</strong> привлекать третьих лиц, приостановить оказание Услуг при нарушении оплаты, изменять тарифы с предварительным уведомлением.</p>
          <p><strong>3.4. Заказчик вправе:</strong> требовать надлежащего оказания Услуг, запрашивать информацию, расторгнуть договор с предупреждением за 5 рабочих дней.</p>
          <h3>4. Стоимость Услуг и порядок расчётов</h3>
          <p>4.1. Стоимость определяется на основании действующих тарифов Исполнителя.</p>
          <p>4.2. Заказчик производит 100% предоплату. Обязательства Исполнителя возникают после поступления денежных средств.</p>
          <p>4.3. Оплата производится в любой валюте по договорённости. Все комиссии платёжных систем уплачивает Заказчик.</p>
          <p>4.4. При просрочке оплаты более 3 рабочих дней Исполнитель вправе расторгнуть договор без возврата предоплаты (если предоплата была частичной).</p>
          <p>4.5. Возврат денежных средств – только в случае неоказания Услуг по вине Исполнителя. При расторжении по инициативе Заказчика возвращается стоимость неоказанных Услуг за вычетом фактически понесённых расходов (не менее 30%).</p>
          <h3>5. Ответственность сторон и ограничение ответственности</h3>
          <p>5.1. Стороны несут ответственность в соответствии с законодательством РУз, но с учётом ограничений, установленных настоящим разделом.</p>
          <p>5.2. <strong>Исполнитель НЕ гарантирует достижение каких-либо конкретных финансовых результатов.</strong></p>
          <p>5.3. Исполнитель НЕ несёт ответственности за блокировку рекламных кабинетов, изменение алгоритмов площадок, сбои в работе интернета, действия третьих лиц.</p>
          <p>5.4. <strong>Совокупная ответственность Исполнителя ограничена суммой оплаты, полученной от Заказчика за последний месяц.</strong> Исполнитель не возмещает упущенную выгоду, косвенные убытки или штрафы.</p>
          <p>5.5. За просрочку оплаты Заказчик уплачивает пеню 0,5% в день, но не более 10% от стоимости Услуг.</p>
          <p>5.6. Заказчик не вправе требовать предоставления исходных файлов креативов, согласования каждого объявления или прекращения тестирования.</p>
          <p>5.7. Если Заказчик настаивает на обязательном согласовании каждого креатива, Исполнитель вправе увеличить стоимость на 50% и/или продлить сроки.</p>
          <h3>6. Креативы и тестирование гипотез</h3>
          <p>6.1. Все креативы являются <strong>собственностью Исполнителя</strong> и не передаются Заказчику в исходных форматах. Заказчик получает право использовать готовые креативы только в рамках размещения в рекламных системах на период действия Договора.</p>
          <p>6.2. Исполнитель <strong>не обязан</strong> предоставлять исходные файлы или согласовывать каждый элемент.</p>
          <p>6.3. Исполнитель имеет право <strong>тестировать любые креативы, гипотезы, аудитории, объявления и стратегии</strong> без предварительного согласования с Заказчиком.</p>
          <p>6.4. Исполнитель не обязан направлять Заказчику каждый креатив на утверждение.</p>
          <p>6.5. Заказчик не вправе требовать прекращения тестирования или удаления креативов.</p>
          <p>6.6. После окончания Договора Заказчик не имеет права использовать креативы без письменного разрешения Исполнителя. Исполнитель вправе использовать креативы в своём портфолио.</p>
          <h3>7. Интеллектуальная собственность</h3>
          <p>7.1. Все созданные материалы являются объектами интеллектуальной собственности Исполнителя до момента полной оплаты. После оплаты права переходят к Заказчику, за исключением исходных файлов креативов.</p>
          <p>7.2. Исполнитель вправе использовать созданные материалы в портфолио и кейсах.</p>
          <h3>8. Конфиденциальность и защита данных</h3>
          <p>8.1. Исполнитель обязуется не разглашать доступы к рекламным кабинетам Заказчика.</p>
          <p>8.2. Заказчик даёт согласие на обработку своих персональных данных (имя, телефон, email) в целях исполнения Договора.</p>
          <p>8.3. Исполнитель не несёт ответственности за утечку данных, произошедшую не по его вине (взлом переписки, компрометация кабинетов самим Заказчиком).</p>
          <h3>9. Форс-мажор</h3>
          <p>Стороны освобождаются от ответственности при обстоятельствах непреодолимой силы (война, стихийные бедствия, эпидемии, решения органов власти, сбои в работе глобальных сетей и рекламных платформ). Если форс-мажор длится более 30 дней, любая сторона вправе расторгнуть Договор без возмещения убытков.</p>
          <h3>10. Порядок изменения и расторжения Договора</h3>
          <p>10.1. Исполнитель вправе изменять условия Оферты в одностороннем порядке, публикуя новую версию на Сайте. Изменения вступают в силу для новых заказов.</p>
          <p>10.2. Заказчик вправе расторгнуть Договор, письменно уведомив Исполнителя за 5 рабочих дней. Возврат средств – по п. 4.5.</p>
          <p>10.3. Исполнитель вправе расторгнуть Договор в одностороннем порядке при нарушении Заказчиком сроков оплаты, предоставления недостоверной информации или иных действий, препятствующих оказанию Услуг. При этом предоплата не возвращается.</p>
          <h3>11. Разрешение споров</h3>
          <p>11.1. Споры разрешаются путём переговоров. Претензия рассматривается в течение 10 рабочих дней.</p>
          <p>11.2. Если спор не урегулирован, он подлежит рассмотрению в суде по месту нахождения Исполнителя (город Ташкент, Республика Узбекистан). Подача иска в иной юрисдикции не допускается.</p>
          <h3>12. Заключительные положения</h3>
          <p>12.1. Договор вступает в силу с момента Акцепта и действует до полного исполнения обязательств.</p>
          <p>12.2. Признание недействительным какого-либо условия не влечёт недействительность остальных условий.</p>
          <p>12.3. Стороны признают юридическую силу переписки по электронной почте, в мессенджерах (Telegram, WhatsApp) и документам, подписанным простой электронной подписью.</p>
          <p>12.4. Все приложения, задания, счета и акты являются неотъемлемой частью Договора.</p>
          <h3>13. Контакты</h3>
          <p>Email: <a href="mailto:whalewzrd@gmail.com">whalewzrd@gmail.com</a> | Telegram: <a href="https://t.me/white_rsh">@white_rsh</a></p>
        </div>
      </Modal>
    </section>
  );
}

export default memo(ContactForm);
