import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence, useInView } from 'motion/react';
import {
  Send,
  CheckCircle2,
  Loader2,
  DollarSign,
  Sparkles,
  TrendingUp,
  Zap,
  MessageCircle,
  Phone,
  ChevronDown,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  getMetaBrowserContext,
  rememberMetaLeadIdentifiers,
  trackEngagedView,
  trackFormStart,
  trackLead,
  trackLeadFormView,
} from '../consent/consent';
import Modal from './Modal';
import PrivacyPolicyContent from './legal/PrivacyPolicyContent';
import OfferContent from './legal/OfferContent';
import LegalConsentCopy from './LegalConsentCopy';
import { API_ROUTES } from '../config';
import { COUNTRY_DIAL_CODES, COUNTRY_PHONE_OPTIONS } from '../utils/phoneCountry';

const budgetOptions = [
  {
    value: 'до $1000',
    label: 'до $1000',
    icon: Sparkles,
    color: 'from-primary/20 to-primary/10',
    bgGradient: 'rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.1)',
  },
  {
    value: '$1к-10к',
    label: '$1к-10к',
    icon: TrendingUp,
    color: 'from-accent/20 to-accent/10',
    bgGradient: 'rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.1)',
  },
  {
    value: '$10к-100к',
    label: '$10к-100к',
    icon: Zap,
    color: 'from-secondary/20 to-secondary/10',
    bgGradient: 'rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1)',
  },
  {
    value: '$100к+',
    label: '$100к+',
    icon: DollarSign,
    color: 'from-primary/20 to-accent/10',
    bgGradient: 'rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.1)',
  },
];


const benefits = [
  { title: 'Бесплатный аудит', description: 'Анализ текущей ситуации и точек роста', icon: CheckCircle2, delay: 0 },
  {
    title: 'Стратегия роста',
    description: 'конкретные шаги для увеличения продаж с первого месяца.',
    icon: TrendingUp,
    delay: 0.1,
  },
  { title: 'Быстрый старт', description: 'Запуск рекламы в течение 4-6 дней', icon: Zap, delay: 0.2 },
];

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
  const [phoneCode, setPhoneCode] = useState('+1');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [hpTrap, setHpTrap] = useState(''); // honeypot
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const selectedPhoneOption = COUNTRY_PHONE_OPTIONS.find((option) => option.dial === phoneCode);
  const selectedPhoneFlag = selectedPhoneOption?.label.split(' ')[0] ?? '';
  const selectedPhoneCodeLabel = selectedPhoneOption ? `${selectedPhoneOption.code} ${selectedPhoneOption.dial}` : phoneCode;
  const formStartTrackedRef = useRef(false);
  const formViewTrackedRef = useRef(false);

  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: false, margin: '0px 0px -10% 0px' });
  const isTouch = useTouchDevice();

  useEffect(() => {
    let active = true;
    void fetch('/api/geo')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.countryCode) return;
        const dial = COUNTRY_DIAL_CODES[String(data.countryCode).toUpperCase()];
        if (dial) setPhoneCode(dial);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!inView || formViewTrackedRef.current) return;
    formViewTrackedRef.current = trackLeadFormView('home');
    if (formViewTrackedRef.current) {
      trackEngagedView('form_view');
    }
  }, [inView]);

  const trackFirstFormInteraction = useCallback((fieldName: string) => {
    if (formStartTrackedRef.current) return;
    formStartTrackedRef.current = trackFormStart('home', {
      form_id: 'home_contact_form',
      form_field: fieldName,
    });
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      trackFirstFormInteraction(e.target.name);
      setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    },
    [trackFirstFormInteraction],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!agreed) {
        alert('Пожалуйста, подтвердите согласие с условиями');
        return;
      }
      setIsSubmitting(true);

      const eventId = crypto.randomUUID();
      const metaBrowserContext = getMetaBrowserContext(window.location.pathname);

      try {
        const res = await fetch(API_ROUTES.lead, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...metaBrowserContext,
            name: formData.name,
            email: formData.email,
            phone: `${phoneCode}${formData.phone.replace(/\D/g, '')}`,
            budget: formData.budget,
            message: formData.message,
            contactMethod: contactMethod,
            telegramUsername: contactMethod === 'telegram' ? telegramUsername : undefined,
            service: 'WhaleWzrd main landing',
            service_slug: 'home',
            form_id: 'home_contact_form',
            form_variant: 'home_contact_v1',
            lead_source_page: window.location.pathname,
            event_id: eventId,
            hp_trap: hpTrap,
            page_url: window.location.href,
            referrer: document.referrer || undefined,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }

        setIsSubmitted(true);
        await rememberMetaLeadIdentifiers({ email: formData.email, phone: `${phoneCode}${formData.phone.replace(/\D/g, '')}`, name: formData.name });
        setFormData({ name: '', email: '', phone: '', budget: '', message: '' });
        setTelegramUsername('');
        setHpTrap('');
        setContactMethod('telegram');
        setAgreed(false);
        trackLead(eventId, {
          ...metaBrowserContext,
          contact_method: contactMethod,
          service: 'WhaleWzrd main landing',
          service_slug: 'home',
          form_id: 'home_contact_form',
          form_variant: 'home_contact_v1',
        });

        setTimeout(() => setIsSubmitted(false), 5000);
        setTimeout(() => navigate('/thank-you'), 800);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'Ошибка отправки формы';
        alert(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, navigate, agreed, contactMethod, telegramUsername, hpTrap],
  );

  const handleSetTelegramUsername = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    trackFirstFormInteraction('telegramUsername');
    setTelegramUsername(e.target.value);
  }, [trackFirstFormInteraction]);

  const handleSetContactMethod = useCallback((method: 'telegram' | 'whatsapp') => {
    trackFirstFormInteraction('contactMethod');
    setContactMethod(method);
  }, [trackFirstFormInteraction]);

  const handleSetHpTrap = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setHpTrap(e.target.value);
  }, []);

  const radioHover = !isTouch ? { whileHover: { scale: 1.05 } } : {};
  const benefitHover = !isTouch ? { whileHover: { scale: 1.1 } } : {};

  return (
    <section
      id="contact"
      ref={sectionRef}
      className="relative py-16 md:py-24 overflow-hidden"
      style={{ contain: 'layout style paint' }}
    >
      {inView && (
        <>
          <div className="pointer-events-none absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] animate-pulse" />
          <div
            className="pointer-events-none absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[128px] animate-pulse"
            style={{ animationDelay: '1s' }}
          />
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
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 opacity-50" />
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-tr from-primary/5 to-accent/5 animate-pulse" />
              <div className="pointer-events-none absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-2xl" />
              <div className="pointer-events-none absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-accent/20 to-transparent rounded-3xl blur-2xl" />

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
                    {/* Honeypot – невидимое поле для ботов */}
                    <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
                      <label htmlFor="hp_trap">Оставьте пустым</label>
                      <input
                        type="text"
                        id="hp_trap"
                        name="hp_trap"
                        value={hpTrap}
                        onChange={handleSetHpTrap}
                        tabIndex={-1}
                        autoComplete="off"
                      />
                    </div>

                    {/* Имя */}
                    <div className="relative">
                      <label htmlFor="contact-name" className="block text-sm mb-2 font-medium">Имя *</label>
                      <div className="relative">
                        <Input
                          id="contact-name"
                          name="name"
                          type="text"
                          required
                          value={formData.name}
                          onChange={handleChange}
                          onFocus={() => {
                            setFocusedField('name');
                            trackFirstFormInteraction('name');
                          }}
                          onBlur={() => setFocusedField(null)}
                          placeholder="Ваше имя"
                          autoComplete="name"
                          className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all backdrop-blur-sm"
                        />
                        {focusedField === 'name' && (
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
                          />
                        )}
                      </div>
                    </div>

                    {/* Email */}
                    <div className="relative">
                      <label htmlFor="contact-email" className="block text-sm mb-2 font-medium">Email *</label>
                      <div className="relative">
                        <Input
                          id="contact-email"
                          name="email"
                          type="email"
                          required
                          value={formData.email}
                          onChange={handleChange}
                          onFocus={() => {
                            setFocusedField('email');
                            trackFirstFormInteraction('email');
                          }}
                          onBlur={() => setFocusedField(null)}
                          placeholder="your@email.com"
                          autoComplete="email"
                          className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all backdrop-blur-sm"
                        />
                        {focusedField === 'email' && (
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
                          />
                        )}
                      </div>
                    </div>

                    {/* Телефон */}
                    <div className="relative">
                      <label htmlFor="contact-phone" className="block text-sm mb-2 font-medium">Телефон *</label>
                      <div className="group relative flex items-stretch gap-2 rounded-xl border border-border/60 bg-gradient-to-br from-background/70 via-background/50 to-background/70 p-1.5 backdrop-blur-md transition-all focus-within:border-primary/50 focus-within:shadow-lg focus-within:shadow-primary/20">
                        <div className="w-[118px] sm:w-[220px] shrink-0">
                        <Select value={phoneCode} onValueChange={setPhoneCode}>
                          <SelectTrigger
                            aria-label="Код страны"
                            className="h-10 rounded-lg border-border/40 bg-background/70 text-xs sm:text-sm font-medium backdrop-blur-sm hover:border-primary/40 focus-visible:ring-primary/25"
                          >
                            <span className="truncate sm:hidden">{selectedPhoneFlag ? `${selectedPhoneFlag} ${phoneCode}` : phoneCode}</span>
                            <span className="hidden truncate sm:inline">{selectedPhoneCodeLabel}</span>
                          </SelectTrigger>
                          <SelectContent className="max-h-80 rounded-2xl border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl">
                            {COUNTRY_PHONE_OPTIONS.map((option) => (
                              <SelectItem key={`${option.code}-${option.dial}`} value={option.dial} className="rounded-lg py-2 text-sm">
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        </div>
                        <Input
                          id="contact-phone"
                          name="phone"
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={handleChange}
                          onFocus={() => {
                            setFocusedField('phone');
                            trackFirstFormInteraction('phone');
                          }}
                          onBlur={() => setFocusedField(null)}
                          placeholder="555 123 4567"
                          autoComplete="tel-national"
                          className="h-10 border-border/40 bg-background/70 focus:border-primary/50 focus:bg-background/80 transition-all backdrop-blur-sm"
                        />
                      </div>
                    </div>

                    {/* Бюджет */}
                    <div>
                      <p className="block text-sm mb-3 font-medium">Месячный бюджет</p>
                      <div className="grid grid-cols-2 gap-3">
                        {budgetOptions.map((option) => (
                          <motion.div
                            key={option.value}
                            {...radioHover}
                            whileTap={{ scale: 0.95 }}
                            className="relative"
                          >
                            <input
                              type="radio"
                              id={`budget-${option.value.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                              name="budget"
                              value={option.value}
                              checked={formData.budget === option.value}
                              onChange={handleChange}
                              className="peer sr-only"
                            />
                            <label
                              htmlFor={`budget-${option.value.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                              className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all duration-300 bg-background/50 border border-border/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/70 peer-checked:border-primary peer-checked:shadow-lg peer-checked:shadow-primary/20`}
                              style={
                                formData.budget === option.value
                                  ? { backgroundImage: `linear-gradient(to bottom right, ${option.bgGradient})` }
                                  : {}
                              }
                            >
                              <div
                                className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${option.color} border border-primary/30 flex items-center justify-center`}
                              >
                                <option.icon className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold truncate">{option.label}</div>
                              </div>
                              {formData.budget === option.value && (
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex-shrink-0">
                                  <CheckCircle2 className="w-5 h-5 text-primary" />
                                </motion.div>
                              )}
                            </label>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* О проекте */}
                    <div className="relative">
                      <label htmlFor="contact-message" className="block text-sm mb-2 font-medium">О вашем проекте</label>
                      <div className="relative">
                        <Textarea
                          id="contact-message"
                          name="message"
                          value={formData.message}
                          onChange={handleChange}
                          onFocus={() => {
                            setFocusedField('message');
                            trackFirstFormInteraction('message');
                          }}
                          onBlur={() => setFocusedField(null)}
                          placeholder="Расскажите кратко о вашем проекте..."
                          autoComplete="off"
                          rows={4}
                          className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all resize-none backdrop-blur-sm"
                        />
                        {focusedField === 'message' && (
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
                          />
                        )}
                      </div>
                    </div>

                    {/* Способ связи */}
                    <div>
                      <p className="block text-sm mb-2 font-medium">Предпочитаемый способ связи</p>
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

                    {/* Условный блок */}
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
                            <label htmlFor="telegram-username" className="block text-sm mb-2 font-medium">
                              Telegram username (необязательно)
                            </label>
                            <Input
                              id="telegram-username"
                              name="telegram_username"
                              type="text"
                              value={telegramUsername}
                              onChange={handleSetTelegramUsername}
                              placeholder="@username"
                              autoComplete="off"
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
                    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2.5 sm:gap-3 rounded-xl border border-border/30 bg-background/20 px-3 py-2.5 sm:border-0 sm:bg-transparent sm:p-0">
                      <label htmlFor="consent" className="flex h-11 w-11 cursor-pointer items-start justify-start pt-3">
                        <input
                          type="checkbox"
                          id="consent"
                          name="consent"
                          checked={agreed}
                          onChange={(e) => setAgreed(e.target.checked)}
                          aria-describedby="contact-form-consent-copy"
                          className="h-5 w-5 accent-primary bg-background border-border/70 rounded focus:ring-primary/20"
                        />
                      </label>
                      <LegalConsentCopy
                        id="contact-form-consent-copy"
                        className="max-w-[64ch]"
                        onPrivacyClick={() => setShowPrivacyModal(true)}
                        onOfferClick={() => setShowOfferModal(true)}
                      />
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
                        <>
                          <Loader2 className="mr-2 w-5 h-5 animate-spin relative" />
                          <span className="relative">Отправка...</span>
                        </>
                      ) : (
                        <>
                          <span className="relative">Отправить заявку</span>
                          <Send className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform relative" />
                        </>
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

      {/* Модальное окно Политики конфиденциальности */}
      <Modal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Политика конфиденциальности и обработки персональных данных"
        dialogClassName="max-w-4xl"
        bodyClassName="prose prose-invert prose-sm max-w-none"
      >
        <PrivacyPolicyContent />
      </Modal>

      {/* Модальное окно Публичной оферты */}
      <Modal
        isOpen={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        title="Публичная оферта"
        dialogClassName="max-w-4xl"
        bodyClassName="prose prose-invert prose-sm max-w-none"
      >
        <OfferContent />
      </Modal>
    </section>
  );
}

export default memo(ContactForm);
