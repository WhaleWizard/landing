import { useState, useCallback, memo, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { motion, useInView } from 'motion/react';
import {
  Send,
  CheckCircle2,
  Check,
  Loader2,
  MessageCircle,
  Mail,
  Phone,
  ChevronDown,
  User,
  Globe,
  DollarSign,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select';
import CountryFlag from './CountryFlag';
import { getAnalyticsClientIds, getMetaBrowserContext, rememberMetaLeadIdentifiers, trackEngagedView, trackFormStart, trackLead, trackLeadFormView } from '../consent/consent';
import Modal from './Modal';
import LegalConsentCopy from './LegalConsentCopy';
import { useTurnstile } from './hooks/useTurnstile';
// Тексты политики и оферты (~65 КБ кода) нужны только при открытии модалок —
// грузим лениво, а не в общем чанке формы на каждом визите.
const PrivacyPolicyContent = lazy(() => import('./legal/PrivacyPolicyContent'));
const OfferContent = lazy(() => import('./legal/OfferContent'));
import { API_ROUTES } from '../config';
import {
  buildFullPhone,
  COUNTRY_PHONE_OPTIONS,
  DEFAULT_COUNTRY_PHONE_CODE,
  getCountryPhoneName,
  getCountryPhoneOption,
} from '../utils/phoneCountry';
import { queueLeadForRetry } from '../utils/leadRetryQueue';
import { saveLeadContext } from '../utils/leadContext';

type ServiceType = 'meta-ads' | 'google-ads' | 'consult' | 'meta-apps';

interface LandingFormProps {
  service: ServiceType;
  title?: string;
  buttonText?: string;
}

const serviceLabels: Record<ServiceType, string> = {
  'meta-ads': 'Meta Ads',
  'google-ads': 'Google Ads',
  'consult': 'Консультация',
  'meta-apps': 'Продвижение приложения в Meta',
};

const formCopy: Record<ServiceType, { title: string; button: string }> = {
  'google-ads': { title: 'Обсудить Google Ads', button: 'Отправить на разбор' },
  'meta-ads': { title: 'Обсудить Meta Ads', button: 'Отправить на разбор' },
  'meta-apps': { title: 'Обсудить продвижение приложения', button: 'Отправить на разбор' },
  consult: { title: 'Записаться на разбор', button: 'Отправить запрос' },
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
  const hasTelegramContact = Boolean(value) && (
    looksLikeTelegram || (!looksLikeEmail && !looksLikePhone)
  );

  return {
    email: looksLikeEmail ? value : undefined,
    phone: looksLikePhone ? value : undefined,
    telegramUsername: hasTelegramContact ? value : undefined,
    contactMethod: hasTelegramContact ? 'telegram' : 'whatsapp',
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

const websiteFieldConfig: Record<'meta-ads' | 'google-ads' | 'meta-apps', { label: string; placeholder: string }> = {
  'google-ads': { label: 'Ссылка на ваш сайт', placeholder: 'example.com' },
  'meta-ads': { label: 'Ссылка на сайт или Instagram', placeholder: 'example.com или @account' },
  'meta-apps': { label: 'Приложение: ссылка или название', placeholder: 'App Store / Google Play — или расскажите о нём' },
};

const budgetOptions = [
  { value: 'до $1000', label: 'до $1 000' },
  { value: '$1к-10к', label: '$1 000–10 000' },
  { value: '$10к-100к', label: '$10 000–100 000' },
  { value: '$100к+', label: '$100 000+' },
];

function LandingForm({ 
  service, 
  title,
  buttonText,
}: LandingFormProps) {
  const resolvedTitle = title ?? formCopy[service].title;
  const resolvedButtonText = buttonText ?? formCopy[service].button;
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
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_COUNTRY_PHONE_CODE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const { containerRef: turnstileRef, getToken: getTurnstileToken } = useTurnstile();
  const formStartTrackedRef = useRef(false);
  const formViewTrackedRef = useRef(false);
  const selectedPhoneOption = getCountryPhoneOption(phoneCountryCode)
    ?? getCountryPhoneOption(DEFAULT_COUNTRY_PHONE_CODE);
  const phoneCode = selectedPhoneOption?.dial ?? '+1';
  const selectedPhoneName = selectedPhoneOption ? getCountryPhoneName(selectedPhoneOption) : '';

  const navigate = useNavigate();
  const formRef = useRef<HTMLDivElement>(null);
  const inView = useInView(formRef, { once: true, margin: '-100px' });

  useEffect(() => {
    let active = true;
    void fetch('/api/geo')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.countryCode) return;
        const countryCode = String(data.countryCode).toUpperCase();
        if (getCountryPhoneOption(countryCode)) setPhoneCountryCode(countryCode);
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

      // Проверка «человек или бот» — в момент отправки, а не при открытии
      // страницы: токен живёт минуты и успел бы протухнуть.
      const turnstileToken = await getTurnstileToken();
      if (!turnstileToken) {
        setIsSubmitting(false);
        setVerificationFailed(true);
        return;
      }
      setVerificationFailed(false);

      const eventId = crypto.randomUUID();
      const metaBrowserContext = getMetaBrowserContext(window.location.pathname);
      const analyticsClientIds = await getAnalyticsClientIds();
      const contactPayload = normalizeContactForLead(formData.contact);
      const email = formData.email.trim();
      const phone = buildFullPhone(phoneCode, formData.phone);
      const websiteDomain = extractWebsiteDomain(formData.website);
      const leadPayload = {
        ...metaBrowserContext,
        ...analyticsClientIds,
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
        turnstile_token: turnstileToken,
        page_url: window.location.href,
        referrer: document.referrer || undefined,
      };

      try {
        const res = await fetch(API_ROUTES.lead, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadPayload),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null) as { error?: string; retryable?: boolean } | null;
          throw Object.assign(new Error(payload?.error || `HTTP ${res.status}`), {
            retryable: payload?.retryable === true,
          });
        }

        setIsSubmitted(true);
        await rememberMetaLeadIdentifiers({ email, phone, name: formData.name });
        setFormData({ name: '', email: '', phone: '', contact: '', website: '', budget: '', experience: '', problem: '' });
        setHpTrap('');
        setAgreed(false);
        trackLead(eventId, {
          ...metaBrowserContext,
          contact_method: contactPayload.contactMethod,
          phone_collected: Boolean(phone),
          service: serviceLabels[service],
          service_slug: service,
          form_id: 'service_landing_form',
          form_variant: 'service_landing_v1',
          website_domain: websiteDomain,
        });

        // Страница благодарности одна на весь сайт — без этого слепка она не
        // знает ни имени, ни услуги, ни канала связи. В заявку и в трекинг
        // эти данные уже ушли отдельно, здесь они только для текста страницы.
        saveLeadContext({
          name: formData.name,
          serviceSlug: service,
          serviceLabel: serviceLabels[service],
          channel: contactPayload.contactMethod,
          hasEmail: Boolean(email),
        });

        setTimeout(() => setIsSubmitted(false), 5000);
        setTimeout(() => navigate('/thank-you'), 800);
      } catch (error) {
        console.error(error);
        const retryable = error instanceof TypeError
          || (error instanceof Error && (error as Error & { retryable?: boolean }).retryable === true);
        if (retryable) {
          queueLeadForRetry(API_ROUTES.lead, leadPayload);
          setFormData({ name: '', email: '', phone: '', contact: '', website: '', budget: '', experience: '', problem: '' });
          setHpTrap('');
          setAgreed(false);
          alert('Сейчас нет связи. Заявка сохранена в этом браузере; после восстановления интернета сайт попробует отправить её автоматически.');
        } else {
          const message = error instanceof Error ? error.message : 'Ошибка отправки формы';
          alert(message);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, navigate, agreed, service, hpTrap, phoneCode],
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
      <label htmlFor={`field-${name}`} className="flex min-w-0 items-start gap-2 text-sm mb-2 font-medium leading-snug">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 text-pretty">{label} {required && '*'}</span>
      </label>
      <div className="relative">
        <Input
          id={`field-${name}`}
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
          autoComplete={name === 'name' ? 'name' : name === 'email' ? 'email' : name === 'phone' ? 'tel' : name === 'website' ? 'url' : 'off'}
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
      <div className="relative p-4 sm:p-6 md:p-8 rounded-3xl bg-card/50 backdrop-blur-xl border border-border shadow-2xl overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 opacity-50" />
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-primary/5 to-accent/5 animate-pulse" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-2xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-accent/20 to-transparent rounded-3xl blur-2xl" />

        <div className="relative z-10">
          {isSubmitted ? (
            <motion.div
              role="status"
              aria-live="polite"
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
              <h3 className="text-xl md:text-2xl font-bold">Заявка отправлена</h3>
              <p className="text-sm md:text-base text-muted-foreground">Посмотрю вводные и свяжусь по указанному контакту.</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="space-y-5">
              {/* Title */}
              <div className="text-center mb-6">
                <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  {resolvedTitle}
                </h3>
              </div>

              {/* Honeypot */}
              <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
                <input
                  id="landing-hp-trap"
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
              {/* Regression marker for Meta CAPI smoke-tests: renderField('phone', 'Телефон / WhatsApp' */}
              <div className="relative">
                <label htmlFor="landing-phone" className="block text-sm mb-2 font-medium flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  Телефон / WhatsApp *
                </label>
                <div className="group relative flex items-stretch gap-2 rounded-xl border border-border/60 bg-gradient-to-br from-background/70 via-background/50 to-background/70 p-1.5 backdrop-blur-md transition-all focus-within:border-primary/50 focus-within:shadow-lg focus-within:shadow-primary/20">
                  <div className="w-[116px] shrink-0 sm:w-[220px]">
                    <Select value={phoneCountryCode} onValueChange={setPhoneCountryCode}>
                      <SelectTrigger
                        aria-label="Страна и код телефона"
                        style={{ height: '2.75rem' }}
                        className="h-11 gap-1.5 rounded-lg border-border/40 bg-background/70 px-2 text-xs font-medium backdrop-blur-sm hover:border-primary/40 focus-visible:ring-primary/25 sm:gap-2 sm:px-3 sm:text-sm"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <CountryFlag countryCode={phoneCountryCode} alt={selectedPhoneName} className="inline-block h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover shadow-sm" />
                          <span className="shrink-0 sm:hidden">{phoneCode}</span>
                          <span className="hidden min-w-0 flex-1 truncate sm:block">{selectedPhoneName}</span>
                          <span className="hidden shrink-0 sm:block">({phoneCode})</span>
                        </span>
                      </SelectTrigger>
                      <SelectContent className="max-h-80 rounded-2xl border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl">
                        {COUNTRY_PHONE_OPTIONS.map((option) => (
                          <SelectItem key={option.code} value={option.code} className="rounded-lg py-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <CountryFlag countryCode={option.code} className="inline-block h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover shadow-sm" />
                              <span className="min-w-0 flex-1 truncate">{getCountryPhoneName(option)}</span>
                              <span className="shrink-0">({option.dial})</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    id="landing-phone"
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
                    autoComplete="tel-national"
                    className="h-11 min-w-0 flex-1 border-border/40 bg-background/70 focus:border-primary/50 focus:bg-background/80 transition-all backdrop-blur-sm pl-3 sm:pl-4"
                  />
                </div>
              </div>

              {/* Contact */}
              {renderField(
                'contact',
                'Telegram, если удобнее',
                <MessageCircle className="w-4 h-4 text-primary" />,
                '@username или ссылка на Telegram',
                false
              )}

              {/* Service-specific fields */}
              {service !== 'consult' && (
                <>
                  {renderField(
                    'website',
                    websiteFieldConfig[service].label,
                    <Globe className="w-4 h-4 text-primary" />,
                    websiteFieldConfig[service].placeholder
                  )}

                  {/* Budget Select */}
                  <div className="relative">
                    <p className="flex min-w-0 items-start gap-2 text-sm mb-2 font-medium leading-snug">
                      <DollarSign className="w-4 h-4 text-primary" />
                      Бюджет на рекламу в месяц
                    </p>
                    <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-2">
                      {budgetOptions.map((option) => (
                        <motion.button
                          key={option.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, budget: option.value }))}
                          aria-pressed={formData.budget === option.value}
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
                    'Кто вы',
                    <Briefcase className="w-4 h-4 text-primary" />,
                    'Владелец бизнеса / веду рекламу сам / таргетолог'
                  )}

                  <div className="relative">
                    <label htmlFor="landing-problem" className="block text-sm mb-2 font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-primary" />
                      Что хотите разобрать? *
                    </label>
                    <div className="relative">
                      <Textarea
                        id="landing-problem"
                        name="problem"
                        required
                        value={formData.problem}
                        onChange={handleChange}
                        onFocus={() => setFocusedField('problem')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Например: заявки дорожают, хочу понять, где утекает бюджет"
                        autoComplete="off"
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
              <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2.5 sm:gap-3 rounded-xl border border-border/30 bg-background/20 px-3 py-2.5 sm:border-0 sm:bg-transparent sm:p-0">
                <label htmlFor="landing-form-consent" className="relative flex h-11 w-11 shrink-0 cursor-pointer items-start justify-start pt-3">
                  <input
                    id="landing-form-consent"
                    name="consent"
                    type="checkbox"
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                    aria-label="Согласие на обработку персональных данных"
                    aria-describedby="landing-form-consent-copy"
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 items-center justify-center rounded-[4px] border-2 bg-white transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${
                      agreed
                        ? 'border-primary shadow-[0_0_0_3px_rgba(139,92,246,0.14)]'
                        : 'border-primary/45 shadow-sm hover:border-primary/70'
                    }`}
                  >
                    {agreed && <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />}
                  </span>
                </label>
                <LegalConsentCopy
                  id="landing-form-consent-copy"
                  onPrivacyClick={() => setShowPrivacyModal(true)}
                  onOfferClick={() => setShowOfferModal(true)}
                />
              </div>

              {/*
                Место для проверки Turnstile. У обычного посетителя контейнер
                пустой и нулевой высоты — форма не «прыгает». Виджет появится
                здесь, только если Cloudflare решил проверить человека.
              */}
              <div ref={turnstileRef} className="empty:hidden" />

              {verificationFailed && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  <p className="mb-2">
                    Не удалось подтвердить, что вы не робот. Обновите страницу и попробуйте ещё раз.
                  </p>
                  <p>
                    Если не помогает — напишите напрямую:{' '}
                    <a
                      href="https://t.me/white_rsh"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 font-medium"
                    >
                      Telegram @white_rsh
                    </a>
                  </p>
                </div>
              )}

              {/* Submit */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  type="submit"
                  disabled={isSubmitting || !agreed}
                  aria-busy={isSubmitting}
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30 h-12 text-base"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                  {isSubmitting ? (
                    <>
                      <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />
                      <span className="relative">Отправка…</span>
                    </>
                  ) : (
                    <>
                      <span className="relative">{resolvedButtonText}</span>
                      <Send className="ml-2 w-4 h-4 relative group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </motion.div>
            </form>
          )}
        </div>
      </div>

      <Modal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Политика конфиденциальности и обработки персональных данных"
        dialogClassName="max-w-4xl"
        bodyClassName="prose prose-invert prose-sm max-w-none"
      >
        <Suspense fallback={null}>
          <PrivacyPolicyContent />
        </Suspense>
      </Modal>

      <Modal
        isOpen={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        title="Публичная оферта"
        dialogClassName="max-w-4xl"
        bodyClassName="prose prose-invert prose-sm max-w-none"
      >
        <Suspense fallback={null}>
          <OfferContent />
        </Suspense>
      </Modal>
    </motion.div>
  );
}

export default memo(LandingForm);
