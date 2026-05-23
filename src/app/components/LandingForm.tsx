import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, useInView } from 'motion/react';
import {
  Send,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Mail,
  Phone,
  User,
  Globe,
  DollarSign,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { getMetaBrowserContext, rememberMetaLeadIdentifiers, trackEngagedView, trackFormStart, trackLead, trackLeadFormView } from '../consent/consent';
import { API_ROUTES } from '../config';
import { COUNTRY_DIAL_CODES, COUNTRY_PHONE_OPTIONS } from '../utils/phoneCountry';

type ServiceType = 'meta-ads' | 'google-ads' | 'consult';

interface LandingFormProps {
  service: ServiceType;
  title?: string;
  buttonText?: string;
}

const serviceLabels: Record<ServiceType, string> = {
  'meta-ads': 'Meta Ads',
  'google-ads': 'Google Ads',
  'consult': 'Консультация',
};

function normalizeContactForLead(contact: string): {
  email?: string;
  phone?: string;
  telegramUsername?: string;
  contactMethod: 'telegram' | 'whatsapp';
} {
  const value = contact.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const digits = value.replace(/\D/g, '');
  const looksLikeTelegram = value.startsWith('@') || /^https?:\/\/(t\.me|telegram\.me)\//i.test(value);
  const looksLikeEmail = emailPattern.test(value);
  const looksLikePhone = digits.length >= 8;

  return {
    email: looksLikeEmail ? value : undefined,
    phone: looksLikePhone ? value : undefined,
    telegramUsername: looksLikeTelegram || (!looksLikeEmail && !looksLikePhone) ? value : undefined,
    contactMethod: looksLikePhone && !looksLikeTelegram ? 'whatsapp' : 'telegram',
  };
}


function extractWebsiteDomain(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes('.')) return undefined;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return undefined;
  }
}

const budgetOptions = [
  { value: 'до $1000', label: 'до $1000' },
  { value: '$1k-$5k', label: '$1k-$5k' },
  { value: '$5k-$10k', label: '$5k-$10k' },
  { value: '$10k+', label: '$10k+' },
];

function LandingForm({ 
  service, 
  title = 'Оставить заявку',
  buttonText = 'Отправить заявку'
}: LandingFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    contact: '',
    website: '',
    budget: '',
    experience: '',
    problem: '',
  });
  const [hpTrap, setHpTrap] = useState('');
  const [phoneCode, setPhoneCode] = useState('+1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const formStartTrackedRef = useRef(false);
  const formViewTrackedRef = useRef(false);

  const navigate = useNavigate();
  const formRef = useRef<HTMLDivElement>(null);
  const inView = useInView(formRef, { once: true, margin: '-100px' });

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
    formViewTrackedRef.current = trackLeadFormView(service);
    if (formViewTrackedRef.current) {
      trackEngagedView('form_view');
    }
  }, [inView, service]);

  const trackFirstFormInteraction = useCallback((fieldName: string) => {
    if (formStartTrackedRef.current) return;
    formStartTrackedRef.current = trackFormStart(service, { form_field: fieldName });
  }, [service]);

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
      const contactPayload = normalizeContactForLead(formData.contact);
      const email = formData.email.trim();
      const phone = `${phoneCode}${formData.phone.replace(/\D/g, '')}`;
      const websiteDomain = extractWebsiteDomain(formData.website);

      try {
        const res = await fetch(API_ROUTES.lead, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...metaBrowserContext,
            ...contactPayload,
            email,
            phone,
            name: formData.name,
            message: service === 'consult' 
              ? `Опыт: ${formData.experience}\nПроблема: ${formData.problem}`
              : `Сайт: ${formData.website}\nБюджет: ${formData.budget}`,
            budget: formData.budget,
            website: formData.website,
            website_domain: websiteDomain,
            experience: formData.experience,
            problem: formData.problem,
            service: serviceLabels[service],
            service_slug: service,
            form_id: 'service_landing_form',
            form_variant: 'service_landing_v1',
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
        await rememberMetaLeadIdentifiers({ email, phone, name: formData.name });
        setFormData({ name: '', email: '', phone: '', contact: '', website: '', budget: '', experience: '', problem: '' });
        setHpTrap('');
        setAgreed(false);
        trackLead(eventId, {
          ...metaBrowserContext,
          budget: formData.budget || undefined,
          contact_method: contactPayload.contactMethod,
          phone_collected: Boolean(phone),
          service: serviceLabels[service],
          service_slug: service,
          form_id: 'service_landing_form',
          form_variant: 'service_landing_v1',
          website_domain: websiteDomain,
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
    [formData, navigate, agreed, service, hpTrap],
  );

  const renderField = (
    name: string,
    label: string,
    icon: React.ReactNode,
    placeholder: string,
    required = true,
    type = 'text'
  ) => (
    <div className="relative">
      <label className="block text-sm mb-2 font-medium flex items-center gap-2">
        {icon}
        {label} {required && '*'}
      </label>
      <div className="relative">
        <Input
          name={name}
          type={type}
          required={required}
          value={formData[name as keyof typeof formData]}
          onChange={handleChange}
          onFocus={() => {
              setFocusedField(name);
              trackFirstFormInteraction(name);
            }}
          onBlur={() => setFocusedField(null)}
          placeholder={placeholder}
          className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all backdrop-blur-sm pl-4"
        />
        {focusedField === name && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
          />
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      ref={formRef}
      initial={{ opacity: 0, rotateX: 15, y: 40 }}
      animate={inView ? { opacity: 1, rotateX: 0, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
      style={{ perspective: '1000px' }}
    >
      <div className="relative p-6 md:p-8 rounded-3xl bg-card/50 backdrop-blur-xl border border-border shadow-2xl overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 opacity-50" />
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-primary/5 to-accent/5 animate-pulse" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-2xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-accent/20 to-transparent rounded-3xl blur-2xl" />

        <div className="relative z-10">
          {isSubmitted ? (
            <motion.div
              className="text-center py-12 space-y-4"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
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
              {/* Title */}
              <div className="text-center mb-6">
                <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  {title}
                </h3>
              </div>

              {/* Honeypot */}
              <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
                <input
                  type="text"
                  name="hp_trap"
                  value={hpTrap}
                  onChange={(e) => setHpTrap(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Hidden service field */}
              <input type="hidden" name="service" value={service} />

              {/* Name */}
              {renderField('name', 'Имя', <User className="w-4 h-4 text-primary" />, 'Ваше имя')}

              {/* Email */}
              {renderField('email', 'Email', <Mail className="w-4 h-4 text-primary" />, 'you@example.com', true, 'email')}

              {/* Phone */}
              <div className="relative">
                <label className="block text-sm mb-2 font-medium flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  Телефон / WhatsApp *
                </label>
                <div className="group relative flex items-stretch gap-2 rounded-xl border border-border/60 bg-gradient-to-br from-background/70 via-background/50 to-background/70 p-1.5 backdrop-blur-md transition-all focus-within:border-primary/50 focus-within:shadow-lg focus-within:shadow-primary/20">
                  <div className="w-[160px] sm:w-[210px]">
                    <Select value={phoneCode} onValueChange={setPhoneCode}>
                      <SelectTrigger
                        aria-label="Код страны"
                        className="h-10 rounded-lg border-border/40 bg-background/70 text-xs sm:text-sm font-medium backdrop-blur-sm hover:border-primary/40 focus-visible:ring-primary/25"
                      >
                        <SelectValue />
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
                    placeholder="555 000 0000"
                    className="h-10 border-border/40 bg-background/70 focus:border-primary/50 focus:bg-background/80 transition-all backdrop-blur-sm pl-4"
                  />
                </div>
              </div>

              {/* Contact */}
              {renderField(
                'contact',
                'Telegram / дополнительный контакт',
                <MessageCircle className="w-4 h-4 text-primary" />,
                '@username или ссылка на мессенджер',
                false
              )}

              {/* Service-specific fields */}
              {service !== 'consult' && (
                <>
                  {renderField(
                    'website',
                    'Сайт / Ниша',
                    <Globe className="w-4 h-4 text-primary" />,
                    'example.com или описание ниши'
                  )}

                  {/* Budget Select */}
                  <div className="relative">
                    <label className="block text-sm mb-2 font-medium flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-primary" />
                      Месячный бюджет
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {budgetOptions.map((option) => (
                        <motion.button
                          key={option.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, budget: option.value }))}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                            formData.budget === option.value
                              ? 'bg-primary/20 border-primary text-primary shadow-lg shadow-primary/20'
                              : 'bg-background/50 border-border/50 hover:border-primary/50'
                          }`}
                        >
                          {option.label}
                          {formData.budget === option.value && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="ml-2 inline-block"
                            >
                              <CheckCircle2 className="w-4 h-4 inline" />
                            </motion.span>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {service === 'consult' && (
                <>
                  {renderField(
                    'experience',
                    'Опыт в таргете',
                    <Briefcase className="w-4 h-4 text-primary" />,
                    'Новичок / 1 год / 3+ года...'
                  )}

                  <div className="relative">
                    <label className="block text-sm mb-2 font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-primary" />
                      Главная проблема *
                    </label>
                    <div className="relative">
                      <Textarea
                        name="problem"
                        required
                        value={formData.problem}
                        onChange={handleChange}
                        onFocus={() => setFocusedField('problem')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Опишите вашу главную проблему..."
                        rows={3}
                        className="bg-background/50 border-border/50 focus:border-primary focus:bg-background/70 transition-all resize-none backdrop-blur-sm"
                      />
                      {focusedField === 'problem' && (
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Agreement */}
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setAgreed(!agreed)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    agreed
                      ? 'bg-primary border-primary'
                      : 'border-border/50 hover:border-primary/50'
                  }`}
                >
                  {agreed && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
                <label className="text-xs text-muted-foreground leading-relaxed">
                  Я согласен с{' '}
                  <a href="/privacy-policy" className="text-primary hover:underline">
                    политикой конфиденциальности
                  </a>{' '}
                  и{' '}
                  <a href="/offer" className="text-primary hover:underline">
                    публичной офертой
                  </a>
                </label>
              </div>

              {/* Submit */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  type="submit"
                  disabled={isSubmitting || !agreed}
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30 h-12 text-base"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span className="relative">{buttonText}</span>
                      <Send className="ml-2 w-4 h-4 relative group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </motion.div>
            </form>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default memo(LandingForm);
