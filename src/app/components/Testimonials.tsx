import { motion, useInView, useReducedMotion } from 'motion/react';
import { Sparkles, Users, ChevronLeft, ChevronRight, Quote, Building2, MoveHorizontal } from 'lucide-react';
import { useState, useEffect, useRef, memo, useCallback, lazy, Suspense, useMemo } from 'react';
import { useSiteSection } from '../hooks/useServiceContent';
import { managedBodyClasses, managedTitleClasses, type ContentTypography } from '../utils/contentTypography';
import { useIsMobile } from './ui/use-mobile';

const PlexusBackdrop = lazy(() => import('./PlexusBackdrop'));

export type Testimonial = {
  name: string;
  company: string;
  position: string;
  text: string;
};

export type TestimonialStat = {
  value: string;
  label: string;
};

export type TestimonialsContent = {
  badge: string;
  titlePrefix: string;
  titleAccent: string;
  description: string;
  /** Сами карточки отзывов. Редактируются в админке. */
  items?: Testimonial[];
  typography?: ContentTypography;
};

export const defaultTestimonialsStats: TestimonialStat[] = [
  { value: '150+', label: 'кейсов с результатом' },
  { value: '5 лет', label: 'Опыта в маркетинге' },
  { value: '79%', label: 'проектов окупаются и масштабируются' },
  { value: '$2М+', label: 'откручено в рекламе' },
];

export const testimonialsData: Testimonial[] = [
  {
    name: 'Радмир',
    company: 'StepN',
    position: 'StepN Partner',
    text: 'Реально вникаешь в проект, не для галочки. Заявок стало больше, и они адекватнее, чем раньше.',
  },
  {
    name: 'Тина',
    company: 'Inter Agency',
    position: 'Head of Marketing',
    text: 'Работаем четвёртый год. Пробовали параллельно ещё пару таргетологов для сравнения — у тебя стабильно лучше цифры, так и оставили только тебя.',
  },
  {
    name: 'Макс',
    company: 'Toor',
    position: 'Head of Marketing',
    text: 'Всё устраивает. Заявки есть, отчёты понятные, правки быстро.',
  },
  {
    name: 'Кетрин',
    company: 'BlackF',
    position: 'Head of Marketing',
    text: 'До этого заявок было много, но толку от них мало. После того как поменяли креативы и аудитории — стало реально лучше, администраторы говорят, что записи теперь закрываются быстрее.',
  },
  {
    name: 'Анатолий',
    company: 'Spectre',
    position: 'Founder',
    text: 'Открывали новый филиал, боялся хаоса в рекламе. По факту всё разложили по полочкам: отдельные кампании под абонементы и стабильный поток заявок.',
  },
  {
    name: 'Дмитрий',
    company: 'Vectrum',
    position: 'CEO',
    text: 'Сначала разобрали экономику и путь клиента, а потом уже запускали рекламу — это подкупило. Лиды стали предсказуемее, менеджерам проще планировать нагрузку на неделю.',
  },
  {
    name: 'Олег',
    company: 'TakeProfit',
    position: 'Owner',
    text: 'У нас B2B, клики сами по себе не нужны. После тестов офферов и ретаргетинга пошли обращения от адекватных компаний.',
  },
  {
    name: 'Евгений',
    company: 'Korolev School',
    position: 'Founder',
    text: 'Набор был в сжатые сроки, но кампании быстро донастраивали под реальные заявки. Бюджет не разлетелся впустую.',
  },
  {
    name: 'Руслан',
    company: 'Buyuk Zamon',
    position: 'CEO',
    text: 'Стало понятно, какие связки реально работают, а какие нет. Результаты тестов видно быстро, планировать следующие шаги проще.',
  },
  {
    name: 'Юрий',
    company: 'Sky Monsion',
    position: 'Founder',
    text: 'Подход понравился: сначала цели и аудитории, потом тесты гипотез. Стало спокойнее, без лишней суеты в рекламе.',
  },
  {
    name: 'Джасур',
    company: 'CTI Invest',
    position: 'Head of Marketing',
    text: 'Важно было получать не трафик ради трафика, а людей, которым реально интересен продукт. После оптимизации качество заявок выросло заметно.',
  },
  {
    name: 'Навид',
    company: 'New Reality',
    position: 'Founder',
    text: 'Быстро нашли рабочие аудитории и креативы. Отчёты понятные, решения по бюджету — по цифрам, а не на глаз.',
  },
  {
    name: 'Ева',
    company: 'Obnimat',
    position: 'Founder',
    text: 'Запуск прошёл без стресса, структура кампаний понятная, правки быстро. В итоге заявки стабильнее и бюджет не перегревается.',
  },
  {
    name: 'Натэлла',
    company: 'MillionZaEfir',
    position: 'Founder',
    text: 'Хорошо, что копались не только в рекламе, но и в самом оффере. После доработок заявки стали идти ровнее — людям стало понятнее, зачем к нам обращаться.',
  },
  {
    name: 'Анна',
    company: 'Bliss Agency',
    position: 'CEO',
    text: 'Общаемся быстро и по делу. Кампании запускаются аккуратно, тесты фиксируются — сразу видно, что масштабировать.',
  },
];

export const defaultTestimonialsContent: TestimonialsContent = {
  badge: 'Отзывы о работе',
  titlePrefix: 'Что клиенты ценят',
  titleAccent: 'в работе со мной',
  description: 'В отзывах чаще всего говорят о качестве заявок, понятных отчётах и быстрой реакции на изменения.',
  items: testimonialsData,
};

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const cardStyles = [
  {
    accent: 'bg-primary',
    chip: 'bg-primary/10 text-primary border-primary/15',
    avatar: 'bg-primary/10 border-primary/20 text-primary',
    hover: 'hover:border-primary/35 hover:shadow-primary/10',
  },
  {
    accent: 'bg-accent',
    chip: 'bg-accent/10 text-accent border-accent/15',
    avatar: 'bg-accent/10 border-accent/20 text-accent',
    hover: 'hover:border-accent/35 hover:shadow-accent/10',
  },
  {
    accent: 'bg-secondary',
    chip: 'bg-secondary/10 text-secondary border-secondary/15',
    avatar: 'bg-secondary/10 border-secondary/20 text-secondary',
    hover: 'hover:border-secondary/35 hover:shadow-secondary/10',
  },
  {
    accent: 'bg-foreground/70',
    chip: 'bg-card/80 text-foreground border-border',
    avatar: 'bg-card/90 border-border text-foreground',
    hover: 'hover:border-foreground/20 hover:shadow-foreground/5',
  },
];

// Хук для определения тач-устройства
const useTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);
  return isTouch;
};

function TestimonialCard({ testimonial, index, compact = false }: { testimonial: Testimonial; index: number; compact?: boolean }) {
  const initials = getInitials(testimonial.name);
  const style = cardStyles[index % cardStyles.length];

  return (
    <article className={`relative h-full overflow-hidden rounded-3xl border border-border/80 bg-card/55 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${style.hover}`}>
      <div className={`absolute left-6 top-6 h-10 w-1 rounded-full ${style.accent}`} />

      <div className={`relative flex h-full flex-col ${compact ? 'p-5 pl-9' : 'p-6 pl-10 lg:p-7 lg:pl-11'}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${style.chip}`}>
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{testimonial.company}</span>
          </div>
          <Quote className="h-7 w-7 flex-shrink-0 text-foreground/15" aria-hidden="true" />
        </div>

        <p className={`${compact ? 'text-sm' : 'text-base lg:text-[17px]'} flex-1 leading-relaxed text-foreground/90`}>
          {testimonial.text}
        </p>

        <div className="mt-7 flex items-center gap-4 border-t border-border/45 pt-5">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border ${style.avatar}`}>
            <span className="text-base font-semibold">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className={`${compact ? 'text-sm' : 'text-base'} truncate font-semibold text-foreground`}>{testimonial.name}</div>
            <div className="mt-0.5 truncate text-xs md:text-sm text-muted-foreground">{testimonial.position}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Testimonials({
  stats: statsProp = defaultTestimonialsStats,
  content: contentProp = defaultTestimonialsContent,
  contentKey = null,
}: {
  stats?: TestimonialStat[];
  content?: TestimonialsContent;
  contentKey?: string | null;
}) {
  const fallback = useMemo(
    () => ({ ...contentProp, stats: statsProp, items: contentProp.items ?? testimonialsData }),
    [contentProp, statsProp],
  );
  const sectionContent = useSiteSection(contentKey, 'testimonials', fallback);
  const content: TestimonialsContent = sectionContent;
  const stats = sectionContent.stats ?? statsProp;
  // Карточки отзывов приходят из CMS; статический список — запасной вариант,
  // если раздел ещё не сохраняли или запрос не дошёл.
  const items = sectionContent.items?.length ? sectionContent.items : testimonialsData;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDesktopScrollbarVisible, setIsDesktopScrollbarVisible] = useState(false);
  const [isMobileAutoplayDisabled, setIsMobileAutoplayDisabled] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const desktopScrollerRef = useRef<HTMLDivElement>(null);
  const mobileScrollerRef = useRef<HTMLDivElement>(null);
  const mobileScrollFrameRef = useRef<number | null>(null);
  const inView = useInView(sectionRef, { once: false, margin: '0px 0px -10% 0px' });
  const isMobile = useIsMobile();
  const isTouch = useTouchDevice();
  const prefersReducedMotion = Boolean(useReducedMotion());

  const desktopScrollbarTimerRef = useRef<number | null>(null);

  const revealDesktopScrollbar = useCallback(() => {
    setIsDesktopScrollbarVisible(true);
    if (desktopScrollbarTimerRef.current !== null) {
      window.clearTimeout(desktopScrollbarTimerRef.current);
    }
    desktopScrollbarTimerRef.current = window.setTimeout(() => {
      setIsDesktopScrollbarVisible(false);
      desktopScrollbarTimerRef.current = null;
    }, 900);
  }, []);

  const disableMobileAutoplay = useCallback(() => {
    setIsMobileAutoplayDisabled(true);
  }, []);

  const syncMobileIndex = useCallback(() => {
    const scroller = mobileScrollerRef.current;
    if (!scroller) return;

    const cards = Array.from(scroller.querySelectorAll<HTMLElement>('[data-mobile-testimonial-card]'));
    if (cards.length === 0) return;

    const viewportCenter = scroller.scrollLeft + scroller.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setCurrentIndex((previousIndex) => previousIndex === closestIndex ? previousIndex : closestIndex);
  }, []);

  const handleMobileScroll = useCallback(() => {
    if (mobileScrollFrameRef.current !== null) return;

    mobileScrollFrameRef.current = window.requestAnimationFrame(() => {
      mobileScrollFrameRef.current = null;
      syncMobileIndex();
    });
  }, [syncMobileIndex]);

  const scrollMobileTestimonials = useCallback((index: number, behavior?: ScrollBehavior) => {
    const scroller = mobileScrollerRef.current;
    if (!scroller || items.length === 0) return;

    const normalizedIndex = Math.max(0, Math.min(items.length - 1, index));
    const cards = scroller.querySelectorAll<HTMLElement>('[data-mobile-testimonial-card]');
    const card = cards[normalizedIndex];
    if (!card) return;

    const paddingLeft = parseFloat(window.getComputedStyle(scroller).paddingLeft) || 0;
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const targetLeft = Math.max(0, Math.min(maxScrollLeft, card.offsetLeft - paddingLeft));

    setCurrentIndex(normalizedIndex);
    scroller.scrollTo({
      left: targetLeft,
      behavior: behavior ?? (prefersReducedMotion ? 'auto' : 'smooth'),
    });
  }, [prefersReducedMotion]);

  const selectMobileSlide = useCallback((index: number) => {
    disableMobileAutoplay();
    scrollMobileTestimonials(index);
  }, [disableMobileAutoplay, scrollMobileTestimonials]);

  const nextSlide = useCallback(() => {
    selectMobileSlide(currentIndex + 1);
  }, [currentIndex, selectMobileSlide]);

  const prevSlide = useCallback(() => {
    selectMobileSlide(currentIndex - 1);
  }, [currentIndex, selectMobileSlide]);

  const scrollDesktopTestimonials = useCallback((direction: 'prev' | 'next') => {
    const scroller = desktopScrollerRef.current;
    if (!scroller) return;

    revealDesktopScrollbar();

    const card = scroller.querySelector<HTMLElement>('[data-testimonial-card]');
    const gap = parseFloat(window.getComputedStyle(scroller).columnGap) || 28;
    const cardWidth = card?.offsetWidth ?? 380;
    scroller.scrollBy({
      left: direction === 'next' ? cardWidth + gap : -(cardWidth + gap),
      behavior: 'smooth',
    });
  }, [revealDesktopScrollbar]);

  useEffect(() => {
    if (isMobile) return;

    const scroller = desktopScrollerRef.current;
    if (!scroller) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      if (maxScrollLeft <= 0) return;

      const nextScrollLeft = scroller.scrollLeft + e.deltaY;
      const edgeEpsilon = 2;
      const isAtStart = scroller.scrollLeft <= edgeEpsilon;
      const isAtEnd = scroller.scrollLeft >= maxScrollLeft - edgeEpsilon;

      if ((e.deltaY < 0 && isAtStart) || (e.deltaY > 0 && isAtEnd)) return;

      e.preventDefault();
      revealDesktopScrollbar();
      scroller.scrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
    };

    scroller.addEventListener('wheel', handleWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', handleWheel);
  }, [isMobile, revealDesktopScrollbar]);

  useEffect(() => {
    return () => {
      if (desktopScrollbarTimerRef.current !== null) {
        window.clearTimeout(desktopScrollbarTimerRef.current);
      }
      if (mobileScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(mobileScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    const frame = window.requestAnimationFrame(syncMobileIndex);
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, syncMobileIndex]);

  useEffect(() => {
    if (!isMobile || !inView || isMobileAutoplayDisabled || prefersReducedMotion) return;

    const timer = window.setTimeout(() => {
      const nextIndex = (currentIndex + 1) % items.length;
      scrollMobileTestimonials(nextIndex, nextIndex === 0 ? 'auto' : undefined);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [
    currentIndex,
    inView,
    isMobile,
    isMobileAutoplayDisabled,
    prefersReducedMotion,
    scrollMobileTestimonials,
  ]);

  // Отключаем whileHover на тач-устройствах
  const statHover = !isTouch ? { whileHover: { y: -5 } } : {};

  return (
    <section
      id="about"
      ref={sectionRef}
      className="relative py-16 md:py-24 overflow-x-clip overflow-y-visible"
      style={{ contain: 'layout style' }}
    >
      {/* Без -z-10: с ним слои рисовались позади непрозрачного фона страницы и были не видны */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-10 h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent pointer-events-none md:top-14" />

      {/* Плексус-сеть, стягивающаяся к курсору (на тач — блуждает сама) */}
      <Suspense fallback={null}>
        <PlexusBackdrop inView={inView} className="absolute inset-0 h-full w-full" />
      </Suspense>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
        {/* Заголовок */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 md:mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 backdrop-blur-sm mb-4 md:mb-6">
            <Users className="w-4 h-4 text-accent" />
            <span className="text-sm text-accent font-semibold">{content.badge}</span>
          </div>
          <h2 className={`text-balance text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4 ${managedTitleClasses(content.typography)}`}>
            {content.titlePrefix}{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {content.titleAccent}
            </span>
          </h2>
          <p className={`text-pretty text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto ${managedBodyClasses(content.typography)}`}>
            {content.description}
          </p>
        </motion.div>

        {/* Десктопная версия — горизонтальная лента карточек */}
        {!isMobile && (
        <div className="relative left-1/2 hidden w-screen -translate-x-1/2 md:block">
          <div className="mx-auto mb-4 flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 0.8, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35 }}
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/40 px-3 py-1 backdrop-blur-sm"
            >
              <MoveHorizontal className="h-3.5 w-3.5 text-primary" />
              <motion.div
                className="h-1.5 w-10 rounded-full bg-gradient-to-r from-primary/30 via-primary/80 to-primary/30"
                animate={{ x: [-4, 4, -4] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>

            <div className="flex gap-3">
              <button
                onClick={() => scrollDesktopTestimonials('prev')}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-card/50 border border-primary/30 backdrop-blur-sm hover:bg-primary/10 active:scale-95 transition-all"
                aria-label="Предыдущие отзывы"
              >
                <ChevronLeft className="w-5 h-5 text-primary" />
              </button>
              <button
                onClick={() => scrollDesktopTestimonials('next')}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-card/50 border border-primary/30 backdrop-blur-sm hover:bg-primary/10 active:scale-95 transition-all"
                aria-label="Следующие отзывы"
              >
                <ChevronRight className="w-5 h-5 text-primary" />
              </button>
            </div>
          </div>

          <div className="relative w-screen">
            <div className="testimonials-edge-fade pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-background via-background/55 to-transparent lg:w-40" />
            <div className="testimonials-edge-fade pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-background via-background/55 to-transparent lg:w-40" />
            <div
              ref={desktopScrollerRef}
              className="testimonials-desktop-scroller flex snap-x snap-proximity gap-5 overflow-x-auto overflow-y-hidden px-5 pb-10 pt-6 md:gap-7 md:px-10"
              data-scrollbar-visible={isDesktopScrollbarVisible ? 'true' : 'false'}
              onScroll={revealDesktopScrollbar}
              style={{
                scrollPaddingInline: '2.5rem',
                scrollbarWidth: 'thin',
                scrollbarColor: isDesktopScrollbarVisible ? 'rgba(139, 92, 246, 0.65) transparent' : 'rgba(139, 92, 246, 0) transparent',
                WebkitOverflowScrolling: 'touch',
                cursor: 'grab',
              }}
            >
              {items.map((testimonial, index) => (
                <motion.div
                  key={`${testimonial.company}-${testimonial.name}`}
                  data-testimonial-card
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: (index % 4) * 0.08 }}
                  className="min-h-[340px] w-[min(380px,calc(100vw-4rem))] flex-shrink-0 snap-start group"
                >
                  <TestimonialCard testimonial={testimonial} index={index} />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
        )}

        <style>{`
          .testimonials-edge-fade {
            -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%);
            mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%);
          }
          .testimonials-desktop-scroller::-webkit-scrollbar {
            height: 4px;
          }
          .testimonials-desktop-scroller::-webkit-scrollbar-track {
            background: transparent;
            border-radius: 10px;
          }
          .testimonials-desktop-scroller::-webkit-scrollbar-thumb {
            background: linear-gradient(90deg, #8b5cf6, #6366f1, #3b82f6);
            border-radius: 10px;
            opacity: 0;
            transition: opacity 220ms ease;
          }
          .testimonials-desktop-scroller[data-scrollbar-visible='true']::-webkit-scrollbar-thumb {
            opacity: 1;
          }
          .testimonials-desktop-scroller[data-scrollbar-visible='false']::-webkit-scrollbar-thumb {
            background: transparent;
          }
          .testimonials-desktop-scroller:active {
            cursor: grabbing;
          }
          .testimonials-mobile-scroller {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          .testimonials-mobile-scroller::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {/* Мобильная версия — карусель с тач-свайпом */}
        {isMobile && (
        <div className="md:hidden relative">
          <div
            ref={mobileScrollerRef}
            className="testimonials-mobile-scroller relative -m-4 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden p-4"
            onScroll={handleMobileScroll}
            onPointerDown={disableMobileAutoplay}
            onWheel={disableMobileAutoplay}
            role="region"
            aria-label="Отзывы клиентов"
            style={{
              scrollPaddingInline: '1rem',
              overscrollBehaviorX: 'contain',
              touchAction: 'pan-x pan-y',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {items.map((testimonial, index) => (
              <div
                key={`${testimonial.company}-${testimonial.name}`}
                data-mobile-testimonial-card
                className="w-full flex-shrink-0 snap-start px-2"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                  className="relative min-h-[360px]"
                >
                  <TestimonialCard testimonial={testimonial} index={index} compact />
                </motion.div>
              </div>
            ))}
          </div>

          {/* Индикаторы (точки) */}
          <div className="flex justify-center gap-2 mt-6">
            {items.map((_, index) => (
              <button
                key={index}
                onClick={() => selectMobileSlide(index)}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Перейти к отзыву ${index + 1}`}
                aria-current={currentIndex === index ? 'true' : undefined}
              >
                <div className={`h-2 rounded-full transition-all duration-300 ${
                  currentIndex === index
                    ? 'bg-primary w-8'
                    : 'bg-primary/30 w-2'
                }`} />
                {currentIndex === index && (
                  <motion.div
                    className="absolute left-1/2 top-1/2 h-2 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/50 blur-sm"
                    animate={inView && !prefersReducedMotion ? { scale: [1, 1.5, 1] } : {}}
                    transition={{ duration: 2, repeat: inView && !prefersReducedMotion ? Infinity : 0 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Кнопки навигации */}
          <div className="flex justify-center gap-3 mt-5">
            <button
              onClick={prevSlide}
              disabled={currentIndex === 0}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-card/50 border border-primary/30 backdrop-blur-sm hover:bg-primary/10 active:scale-95 transition-all"
              aria-label="Предыдущий отзыв"
            >
              <ChevronLeft className="w-5 h-5 text-primary" />
            </button>
            <button
              onClick={nextSlide}
              disabled={currentIndex === items.length - 1}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-card/50 border border-primary/30 backdrop-blur-sm hover:bg-primary/10 active:scale-95 transition-all"
              aria-label="Следующий отзыв"
            >
              <ChevronRight className="w-5 h-5 text-primary" />
            </button>
          </div>
        </div>
        )}

        {/* Блок доверия (статистика) */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 md:mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              className="relative min-w-0 text-center p-4 md:p-6 rounded-2xl bg-card/30 backdrop-blur-sm border border-border hover:border-primary/50 transition-all duration-300 group"
              {...statHover}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl -z-10" />
              <div className="absolute top-2 right-2 hidden w-7 h-7 rounded-lg bg-primary/10 md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="relative">
                <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2 whitespace-nowrap">
                  {stat.value}
                </div>
                <div className="text-pretty text-xs md:text-sm text-muted-foreground leading-tight">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export default memo(Testimonials);
