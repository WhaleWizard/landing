import { motion } from 'motion/react';
import { BarChart3, Users, Globe, TrendingUp, Sparkles, Target, Zap, Info, type LucideIcon } from 'lucide-react';
import { useState, useRef, memo, useCallback, lazy, Suspense, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import Modal from './Modal';
import { useSiteSection } from '../hooks/useServiceContent';
import {
  managedBodyClasses,
  managedBodyStyle,
  managedTitleClasses,
  managedTitleStyle,
  useManagedTitleFit,
  type ContentTypography,
} from '../utils/contentTypography';
import { useIsMobile } from './ui/use-mobile';
import { useAmbientVisibility } from './hooks/useAmbientVisibility';

const PlexusBackdrop = lazy(() => import('./PlexusBackdrop'));

export type ServiceCardContent = {
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
  gradient: string;
};

export type ServiceDetailedSection = {
  title: string;
  icon: LucideIcon;
  text: string;
};

export type ServicesContent = {
  badge: string;
  titlePrefix: string;
  titleAccent: string;
  description: string;
  cards: ServiceCardContent[];
  detailed: {
    title: string;
    button: string;
    sections: ServiceDetailedSection[];
  };
  typography?: ContentTypography;
};

const servicesData: ServiceCardContent[] = [
  {
    icon: BarChart3,
    title: 'Google Ads',
    description: 'Поиск и Shopping — под сформированный спрос; Performance Max и YouTube — для дополнительного охвата. Все форматы связываю с конверсиями и допустимой стоимостью клиента.',
    features: ['Поиск', 'Shopping', 'PMax', 'YouTube'],
    gradient: 'from-primary to-accent',
  },
  {
    icon: Users,
    title: 'Meta Ads',
    description: 'Facebook и Instagram: оффер, креативы и ретаргетинг с передачей событий через Meta Pixel и Conversions API.',
    features: ['Креативы', 'Аудитории', 'Ретаргетинг', 'Pixel + CAPI'],
    gradient: 'from-accent to-secondary',
  },
  {
    icon: Globe,
    title: 'Аналитика и события',
    description: 'Настраиваю GA4/GTM, Метрику и конверсии рекламных систем. Если есть CRM, сверяю заявки с квалификацией и продажами.',
    features: ['GA4 + GTM', 'Метрика', 'CRM', 'События'],
    gradient: 'from-secondary to-primary',
  },
  {
    icon: TrendingUp,
    title: 'Оптимизация по качеству',
    description: 'Отключаю слабые сегменты, проверяю новые гипотезы и увеличиваю бюджет там, где сохраняется целевая экономика.',
    features: ['Качество лидов', 'CPL / CPA', 'A/B-тесты', 'Масштабирование'],
    gradient: 'from-primary via-accent to-secondary',
  },
];

// Детальное описание услуг (общее для всех карточек)
const detailedContent: ServicesContent['detailed'] = {
  title: 'Как я работаю',
  button: 'Обсудить проект',
  sections: [
    {
      title: '1. СТРАТЕГИЯ И АНАЛИЗ',
      icon: Target,
      text: 'До запуска договариваемся, какое действие связано с выручкой и сколько за него допустимо платить.\n\n• Разбираю продукт, спрос и цикл сделки\n• Сверяю средний чек, маржу и конверсию отдела продаж\n• Проверяю оффер и посадочную страницу\n• Выбираю канал и рамку тестового бюджета\n\nТак у первого теста появляются понятная цель и условие остановки.',
    },
    {
      title: '2. АНАЛИТИКА И ИНФРАСТРУКТУРА',
      icon: BarChart3,
      text: 'Проверяю, какие данные получают рекламные системы и можно ли связать заявку с дальнейшей продажей.\n\n• GA4, Google Tag Manager и Яндекс.Метрика\n• События Google Ads и Enhanced Conversions\n• Meta Pixel, Conversions API и дедупликация\n• UTM-метки и источник в CRM\n• Статусы квалификации и продажи — при наличии данных, технической возможности и согласия пользователя\n\nВ результате решения принимаются не только по кликам и отправленным формам.',
    },
    {
      title: '3. ЗАПУСК И ВЕДЕНИЕ РЕКЛАМЫ',
      icon: Zap,
      text: 'Каждому каналу и типу кампании задаю отдельную роль, чтобы не запускать всё одновременно без причины.\n\n• Search собирает сформированный спрос\n• Shopping и PMax работают с товарами и дополнительным охватом\n• В Meta тестирую офферы и креативные подачи\n• Ретаргетинг возвращает заинтересованных пользователей\n• Каждая гипотеза получает свою метрику и UTM-разметку\n\nПосле запуска видно, какой сигнал подтвердился, а где данных пока недостаточно.',
    },
    {
      title: '4. ОПТИМИЗАЦИЯ И МАСШТАБ',
      icon: TrendingUp,
      text: 'Меняю кампании, когда накопились данные, а не ради видимости активности.\n\n• Проверяю запросы, объявления, креативы и посадочные\n• Сверяю цену заявки с квалификацией и продажами\n• Отсекаю нецелевой трафик и подозрительные обращения\n• Фиксирую вывод по каждому тесту\n• Увеличиваю бюджет, пока качество и экономика остаются приемлемыми\n\nВ отчёте показываю не список действий, а решения и следующий шаг.',
    },
  ],
};

export const defaultServicesContent: ServicesContent = {
  badge: 'Что входит в работу',
  titlePrefix: 'Реклама, аналитика и',
  titleAccent: 'регулярная оптимизация',
  description: 'Собираю канал целиком: от экономики и отслеживания до запуска, тестов и решений по качеству продаж.',
  cards: servicesData,
  detailed: detailedContent,
};

function Services({ content, contentKey = null }: { content?: ServicesContent; contentKey?: string | null }) {
  const sectionContent = useSiteSection(contentKey, 'services', content ?? defaultServicesContent);
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(sectionContent.typography, { minFontSize: 16 });
  const serviceCards = sectionContent.cards;
  const modalContent = sectionContent.detailed;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const mobileScrollerRef = useRef<HTMLDivElement>(null);
  const mobileScrollFrameRef = useRef<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // Видимость секции живёт атрибутом на самой секции: фоновым петлям хватает
  // CSS, а React больше не перерисовывает весь блок при каждом пересечении
  // границы экрана.
  useAmbientVisibility(sectionRef);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const scrollToSlide = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const nextIndex = Math.max(0, Math.min(serviceCards.length - 1, index));
    const scroller = mobileScrollerRef.current;
    const slide = scroller?.querySelector<HTMLElement>(`[data-service-slide="${nextIndex}"]`);

    setCurrentIndex(nextIndex);
    if (!scroller || !slide) return;

    scroller.scrollTo({
      left: slide.offsetLeft - (scroller.clientWidth - slide.offsetWidth) / 2,
      behavior: behavior === 'smooth' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : behavior,
    });
  }, [serviceCards.length]);

  const nextSlide = useCallback(() => {
    scrollToSlide(currentIndex + 1);
  }, [currentIndex, scrollToSlide]);

  const prevSlide = useCallback(() => {
    scrollToSlide(currentIndex - 1);
  }, [currentIndex, scrollToSlide]);

  const handleMobileScroll = useCallback(() => {
    if (mobileScrollFrameRef.current !== null) return;
    mobileScrollFrameRef.current = window.requestAnimationFrame(() => {
      mobileScrollFrameRef.current = null;
      const scroller = mobileScrollerRef.current;
      if (!scroller) return;

      const viewportCenter = scroller.scrollLeft + scroller.clientWidth / 2;
      const slides = Array.from(scroller.querySelectorAll<HTMLElement>('[data-service-slide]'));
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      slides.forEach((slide, index) => {
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
        const distance = Math.abs(slideCenter - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setCurrentIndex((previous) => previous === closestIndex ? previous : closestIndex);
    });
  }, []);

  useEffect(() => () => {
    if (mobileScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(mobileScrollFrameRef.current);
    }
  }, []);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const scrollToContact = () => {
    closeModal();
    setTimeout(() => {
      const contactElement = document.getElementById('contact');
      if (contactElement) {
        contactElement.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/');
        setTimeout(() => {
          const el = document.getElementById('contact');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }, 150);
  };

  return (
    <>
      <section id="services" ref={sectionRef} className="relative py-16 md:py-24 overflow-x-clip overflow-y-visible">
        {/* Орбы без отрицательного z-index: с -z-10 они рисовались позади
            непрозрачного фона страницы и были не видны. Пауза вне вьюпорта. */}
        <div
          className="ww-ambient-motion absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-[120px] animate-pulse pointer-events-none"
          style={{ willChange: 'opacity' }}
        />
        <div
          className="ww-ambient-motion absolute bottom-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-[120px] animate-pulse pointer-events-none"
          style={{ animationDelay: '1s', willChange: 'opacity' }}
        />
        <div className="absolute inset-x-0 top-8 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent pointer-events-none md:hidden" />

        {/* Плексус-сеть, стягивающаяся к курсору (на тач — блуждает сама) */}
        <Suspense fallback={null}>
          <PlexusBackdrop className="absolute inset-0 h-full w-full" />
        </Suspense>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10 md:mb-14 relative z-20"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4 md:mb-6">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-semibold">{sectionContent.badge}</span>
            </div>
            <h2 ref={titleRef} style={managedTitleStyle(sectionContent.typography)} className={`mx-auto max-w-4xl text-balance text-[clamp(1.75rem,7.5vw,2.35rem)] md:text-4xl lg:text-[44px] font-semibold md:font-bold leading-[1.12] tracking-[-0.018em] md:tracking-[-0.02em] mb-3 md:mb-4 ${managedTitleClasses(sectionContent.typography)}`}>
              {sectionContent.titlePrefix}{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                {sectionContent.titleAccent}
              </span>
            </h2>
            <p style={managedBodyStyle(sectionContent.typography)} className={`mx-auto max-w-2xl text-pretty text-sm md:text-base lg:text-lg text-muted-foreground leading-relaxed ${managedBodyClasses(sectionContent.typography)}`}>
              {sectionContent.description}
            </p>
          </motion.div>

          {/* Desktop Grid */}
          {!isMobile && (
          <div className="hidden md:grid md:grid-cols-2 gap-6 lg:gap-8 overflow-visible">
            {serviceCards.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative"
              >
                <div className="relative p-6 md:p-8 rounded-3xl bg-card/50 backdrop-blur-sm border border-border hover:border-primary/50 transition-all duration-300 h-full flex flex-col overflow-hidden">
                  <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${service.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${service.gradient} opacity-0 group-hover:opacity-20 blur-2xl transition-opacity duration-500`} />
                  <div
                    aria-hidden="true"
                    className="ww-ambient-motion ww-card-ring-float absolute top-4 right-4 w-8 h-8 rounded-full border border-primary/20"
                    style={{ '--ww-card-ring-delay': `${index * 0.2}s` } as CSSProperties}
                  />
                  
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="relative inline-flex mb-6">
                      <div className={`p-4 rounded-2xl bg-gradient-to-br ${service.gradient} shadow-lg group-hover:shadow-2xl transition-shadow duration-300`}>
                        <service.icon className="w-6 h-6 md:w-8 md:h-8 text-white" />
                      </div>
                      <motion.div
                        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${service.gradient} opacity-0 group-hover:opacity-50 blur-xl`}
                        transition={{ duration: 0.3 }}
                      />
                    </div>

                    <h3 className={`min-h-[3.25rem] text-balance font-bold leading-tight mb-3 group-hover:text-primary transition-colors ${service.title.length > 20 ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'}`}>
                      {service.title}
                    </h3>
                    <p className="md:min-h-[4.5rem] text-pretty text-sm md:text-base text-muted-foreground mb-6 leading-relaxed">
                      {service.description}
                    </p>

                    <div className="space-y-3">
                      {service.features.map((feature, idx) => (
                        <motion.div 
                          key={idx} 
                          className="flex min-w-0 items-center gap-3"
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: index * 0.1 + idx * 0.05 }}
                        >
                          <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center">
                            <Sparkles className="w-3 h-3 text-primary" />
                          </div>
                          <span className="min-w-0 break-words text-pretty text-sm leading-snug text-foreground/80">{feature}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Кнопка "Подробнее о работе" */}
                  <div className="relative z-10 mt-8 pt-4 border-t border-border/50">
                    <button
                      onClick={openModal}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-2 text-sm font-semibold text-primary hover:bg-primary/[0.1] hover:border-primary/40 transition-all duration-200 group/btn"
                    >
                      <Info className="w-4 h-4" />
                      <span>Подробнее о работе</span>
                      <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </button>
                  </div>

                  <div className="absolute bottom-4 right-4 w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm border border-primary/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Zap className="w-5 h-5 text-primary animate-pulse" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          )}

          {/* Mobile Carousel */}
          {isMobile && (
          <div className="md:hidden relative">
            <div
              ref={mobileScrollerRef}
              className="relative -mx-4 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={handleMobileScroll}
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-x pan-y',
                scrollPaddingInline: '1rem',
                overscrollBehaviorInline: 'contain',
              }}
            >
              {serviceCards.map((service, index) => (
                  <div
                    key={index}
                    data-service-slide={index}
                    className="w-full flex-none snap-center px-2"
                    style={{ scrollSnapStop: 'always' }}
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5 }}
                      className="relative"
                    >
                      <div className="relative p-[1.125rem] rounded-2xl bg-card/70 backdrop-blur-md border border-primary/25 shadow-xl shadow-primary/10 overflow-hidden flex flex-col">
                        <div className={`absolute inset-0 bg-gradient-to-br ${service.gradient} opacity-5`} />
                        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${service.gradient}`} />
                        <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${service.gradient} opacity-10 blur-2xl`} />

                        <div className="relative z-10 min-w-0">
                          <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-xl bg-gradient-to-br ${service.gradient} shadow-lg`}>
                              <service.icon className="w-7 h-7 text-white" />
                            </div>
                            <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm">
                              <span className="text-xs font-bold text-primary">{index + 1}/{serviceCards.length}</span>
                            </div>
                          </div>

                          <h3 className={`text-balance font-semibold leading-[1.15] mb-2.5 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text ${service.title.length > 20 ? 'text-[1.02rem] sm:text-xl' : 'text-[1.18rem] sm:text-2xl'}`}>
                            {service.title}
                          </h3>
                          <p className="text-pretty text-[13px] sm:text-sm text-muted-foreground mb-4 leading-6">
                            {service.description}
                          </p>

                          <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-2">
                            {service.features.map((feature, idx) => (
                              <div key={idx} className="flex min-w-0 items-center gap-2 p-2.5 min-[390px]:p-2 rounded-lg bg-card/35 border border-primary/15">
                                <div className="flex-shrink-0 w-5 h-5 rounded bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                                  <Sparkles className="w-2.5 h-2.5 text-primary" />
                                </div>
                                <span className="min-w-0 break-words text-pretty text-[11px] sm:text-xs text-foreground/80 leading-snug font-normal">{feature}</span>
                              </div>
                            ))}
                          </div>

                          {/* Кнопка "Подробнее о работе" в мобильной версии */}
                          <div className="mt-6 pt-4 border-t border-border/50">
                            <button
                              onClick={openModal}
                              className="inline-flex min-h-11 w-full justify-center items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-2 text-sm font-semibold text-primary hover:bg-primary/[0.1] hover:border-primary/40 transition-all duration-200"
                            >
                              <Info className="w-4 h-4" />
                              <span>Подробнее о работе</span>
                              <span>→</span>
                            </button>
                          </div>
                        </div>

                        <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r ${service.gradient} opacity-30`} />
                      </div>
                    </motion.div>
                  </div>
              ))}
            </div>

            <div className="flex justify-center gap-2 mt-6">
              {serviceCards.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => scrollToSlide(index)}
                  className="relative group inline-flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Показать услугу ${index + 1}: ${serviceCards[index].title}`}
                  aria-current={currentIndex === index ? 'true' : undefined}
                >
                  <div aria-hidden="true" className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    currentIndex === index ? 'bg-primary w-8' : 'bg-primary/30'
                  }`} />
                  {currentIndex === index && (
                    <div
                      aria-hidden="true"
                      className={`absolute left-1/2 top-1/2 h-2 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/50 blur-sm${
                        isMobile ? '' : ' ww-ambient-motion ww-dot-pulse'
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="flex justify-center gap-4 mt-4">
              <button
                type="button"
                onClick={prevSlide}
                disabled={currentIndex === 0}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-card/50 border border-primary/30 backdrop-blur-sm active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Предыдущая услуга"
              >
                <svg aria-hidden="true" className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={nextSlide}
                disabled={currentIndex === serviceCards.length - 1}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-card/50 border border-primary/30 backdrop-blur-sm active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Следующая услуга"
              >
                <svg aria-hidden="true" className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
          )}
        </div>
      </section>

      {/* Модальное окно с кнопкой внизу (уменьшенной на мобильных) */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={modalContent.title} dialogClassName="marketing-typography">
        <div className="space-y-6 sm:space-y-8">
          {modalContent.sections.map((section, idx) => {
            const Icon = section.icon;
            const gradientClasses = [
              'from-primary to-accent',
              'from-accent to-secondary',
              'from-secondary to-primary',
              'from-primary via-accent to-secondary',
            ];
            return (
              <div key={idx} className="group/section">
                <div className="flex min-w-0 items-start gap-3 mb-3 sm:mb-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/30 group-hover/section:scale-110 transition-transform">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className={`min-w-0 break-words text-base md:text-xl font-semibold md:font-bold leading-tight text-balance bg-gradient-to-r ${gradientClasses[idx % gradientClasses.length]} bg-clip-text text-transparent`}>
                    {section.title}
                  </h3>
                </div>
                <div className="text-[13px] sm:text-sm text-muted-foreground whitespace-pre-line leading-6 sm:leading-relaxed pl-3 border-l border-primary/20 font-normal">
                  {section.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Кнопка внизу попапа (адаптивная) */}
        <div className="mt-8 pt-6 border-t border-border/50 flex justify-center">
          <button
            onClick={scrollToContact}
            className="group relative inline-flex items-center justify-center gap-2 sm:gap-3 px-4 py-2 sm:px-8 sm:py-3 rounded-xl font-semibold text-white 
                       bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/30 
                       overflow-hidden transition-all hover:scale-105 active:scale-95 w-full sm:w-auto text-sm sm:text-base"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-1000" />
            <span className="relative text-center leading-tight">{modalContent.button}</span>
            <span className="relative group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>
      </Modal>
    </>
  );
}

export default memo(Services);
