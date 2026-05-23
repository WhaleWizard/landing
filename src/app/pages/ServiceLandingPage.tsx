import { lazy, Suspense, useEffect, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';

const Services = lazy(() => import('../components/Services'));
const Cases = lazy(() => import('../components/Cases'));
const CallToAction = lazy(() => import('../components/CallToAction'));
const Testimonials = lazy(() => import('../components/Testimonials'));
const Footer = lazy(() => import('../components/Footer'));

type ServiceType = 'meta-ads' | 'google-ads' | 'consult';

type LandingTheme = {
  primary: string;
  accent: string;
  secondary: string;
  orbFrom: string;
  orbTo: string;
  badgeClassName: string;
  sparkleClassName: string;
  labelClassName: string;
  titleGradientClassName: string;
  checkGradientClassName: string;
  shadowClassName: string;
};

type ServiceLandingPageProps = {
  service: ServiceType;
  seo: {
    title: string;
    description: string;
    url: string;
  };
  contact: {
    badge: string;
    titlePrefix: string;
    titleAccent: string;
    description: string;
    bullets: string[];
  };
  theme: LandingTheme;
};

const themes: Record<ServiceType, LandingTheme> = {
  'meta-ads': {
    // Soft Meta-like pastel palette: blue + violet + airy highlights for better readability.
    primary: '#5B7CFA',
    accent: '#8B7CFF',
    secondary: '#9AD7FF',
    orbFrom: 'rgba(91, 124, 250, 0.20)',
    orbTo: 'rgba(154, 215, 255, 0.18)',
    badgeClassName: 'bg-[#5B7CFA]/10 border-[#5B7CFA]/20',
    sparkleClassName: 'text-[#5B7CFA]',
    labelClassName: 'text-[#5B7CFA]',
    titleGradientClassName: 'from-[#5B7CFA] via-[#8B7CFF] to-[#9AD7FF]',
    checkGradientClassName: 'from-[#5B7CFA] to-[#8B7CFF]',
    shadowClassName: 'shadow-[#5B7CFA]/20',
  },
  'google-ads': {
    primary: '#4285F4',
    accent: '#34A853',
    secondary: '#FBBC04',
    orbFrom: 'rgba(66, 133, 244, 0.22)',
    orbTo: 'rgba(52, 168, 83, 0.2)',
    badgeClassName: 'bg-[#4285F4]/10 border-[#4285F4]/20',
    sparkleClassName: 'text-[#4285F4]',
    labelClassName: 'text-[#4285F4]',
    titleGradientClassName: 'from-[#4285F4] via-[#34A853] to-[#FBBC04]',
    checkGradientClassName: 'from-[#4285F4] to-[#34A853]',
    shadowClassName: 'shadow-[#4285F4]/20',
  },
  consult: {
    primary: '#8B5CF6',
    accent: '#6366F1',
    secondary: '#3B82F6',
    orbFrom: 'rgba(139, 92, 246, 0.22)',
    orbTo: 'rgba(59, 130, 246, 0.2)',
    badgeClassName: 'bg-primary/10 border-primary/20',
    sparkleClassName: 'text-primary',
    labelClassName: 'text-primary',
    titleGradientClassName: 'from-primary via-accent to-secondary',
    checkGradientClassName: 'from-primary to-accent',
    shadowClassName: 'shadow-primary/20',
  },
};

const pageConfigs: Record<ServiceType, Omit<ServiceLandingPageProps, 'service' | 'theme'>> = {
  'meta-ads': {
    seo: {
      title: 'Платный трафик из Meta Ads (Facebook/Instagram)',
      description: 'Стабильные заявки из Facebook и Instagram без слива бюджета. Настрою рекламу по системе: кастдев, оффер, креативы, трекинг.',
      url: '/meta-ads',
    },
    contact: {
      badge: 'Бесплатно',
      titlePrefix: 'Получите бесплатный',
      titleAccent: 'аудит рекламы',
      description: 'Разберу вашу текущую рекламу и покажу точки роста. Без воды и общих фраз — только конкретика.',
      bullets: [
        'Анализ рекламного кабинета',
        'Оценка креативов и офферов',
        'Рекомендации по оптимизации',
        'Прогноз результатов',
      ],
    },
  },
  'google-ads': {
    seo: {
      title: 'Контекстная реклама Google Ads',
      description: 'Настрою Google Ads, который приносит клиентов, а не просто тратит бюджет. Поиск, Shopping, Performance Max.',
      url: '/google-ads',
    },
    contact: {
      badge: 'Бесплатно',
      titlePrefix: 'Получите бесплатный',
      titleAccent: 'аудит кампаний',
      description: 'Разберу ваши текущие кампании и покажу точки роста. Найду, где сливается бюджет и как это исправить.',
      bullets: [
        'Анализ структуры кампаний',
        'Проверка Quality Score',
        'Аудит минус-слов и ключевых фраз',
        'Рекомендации по оптимизации',
      ],
    },
  },
  consult: {
    seo: {
      title: 'Консультация для таргетологов',
      description: 'Помогу таргетологу найти стабильный поток клиентов и выйти на доход от $1000/мес. Разбор стратегии, упаковка услуг, сильный оффер.',
      url: '/consult',
    },
    contact: {
      badge: 'Личная консультация',
      titlePrefix: 'Запишитесь на',
      titleAccent: 'консультацию',
      description: '60-90 минут личной работы над вашей стратегией поиска клиентов. Разберу ситуацию и дам пошаговый план.',
      bullets: [
        'Разбор вашего позиционирования',
        'Анализ портфолио и офферов',
        'Стратегия поиска клиентов',
        'Шаблоны и скрипты продаж',
      ],
    },
  },
};

function SectionSkeleton({ height = 'min-h-[180px]' }: { height?: string }) {
  return <div className={`w-full ${height}`} aria-hidden="true" />;
}

function DeferredSection({
  children,
  height = 'min-h-[180px]',
}: {
  children: ReactNode;
  height?: string;
}) {
  return (
    <section style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 720px' }}>
      <Suspense fallback={<SectionSkeleton height={height} />}>{children}</Suspense>
    </section>
  );
}

function ContactSection({ service, contact, theme }: Pick<ServiceLandingPageProps, 'service' | 'contact' | 'theme'>) {
  return (
    <section id="contact" className="relative py-16 md:py-24 overflow-hidden">
      <div
        className="absolute top-0 left-1/4 w-80 h-80 md:w-96 md:h-96 rounded-full blur-[128px] animate-pulse pointer-events-none"
        style={{ backgroundColor: theme.orbFrom }}
      />
      <div
        className="absolute bottom-0 right-1/4 w-80 h-80 md:w-96 md:h-96 rounded-full blur-[128px] animate-pulse pointer-events-none"
        style={{ backgroundColor: theme.orbTo, animationDelay: '1s' }}
      />
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60`} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px', amount: 0.2 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="text-center lg:text-left"
          >
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-6 backdrop-blur-sm ${theme.badgeClassName}`}>
              <Sparkles className={`w-4 h-4 ${theme.sparkleClassName}`} />
              <span className={`text-sm font-semibold ${theme.labelClassName}`}>{contact.badge}</span>
            </div>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight text-balance">
              {contact.titlePrefix}{' '}
              <span className={`bg-gradient-to-r ${theme.titleGradientClassName} bg-clip-text text-transparent`}>
                {contact.titleAccent}
              </span>
            </h2>

            <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto lg:mx-0 text-balance leading-relaxed">
              {contact.description}
            </p>

            <div className="space-y-4 max-w-md mx-auto lg:mx-0">
              {contact.bullets.map((item, i) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.35 }}
                  className="flex items-center gap-3 text-left"
                >
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${theme.checkGradientClassName} flex items-center justify-center shrink-0 shadow-lg ${theme.shadowClassName}`}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-foreground">{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px', amount: 0.2 }}
            transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <LandingForm service={service} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function ServiceLandingPage({ service }: { service: ServiceType }) {
  const config = pageConfigs[service];
  const theme = themes[service];
  const cssVars = {
    '--primary': theme.primary,
    '--accent': theme.accent,
    '--secondary': theme.secondary,
    '--ring': theme.primary,
  } as CSSProperties;

  useEffect(() => {
    const root = document.documentElement;
    const previous = {
      primary: root.style.getPropertyValue('--primary'),
      accent: root.style.getPropertyValue('--accent'),
      secondary: root.style.getPropertyValue('--secondary'),
      ring: root.style.getPropertyValue('--ring'),
    };

    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--ring', theme.primary);

    return () => {
      const restore = (name: string, value: string) => {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      };

      restore('--primary', previous.primary);
      restore('--accent', previous.accent);
      restore('--secondary', previous.secondary);
      restore('--ring', previous.ring);
    };
  }, [theme]);

  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden" style={cssVars}>
      <SEO {...config.seo} />
      <Navbar variant="service" />
      <Hero />

      <DeferredSection><Services /></DeferredSection>
      <DeferredSection><Cases /></DeferredSection>
      <DeferredSection><CallToAction /></DeferredSection>
      <DeferredSection><Testimonials /></DeferredSection>
      <ContactSection service={service} contact={config.contact} theme={theme} />
      <DeferredSection height="min-h-[160px]"><Footer /></DeferredSection>
    </main>
  );
}
