import { motion } from 'motion/react';
import { ArrowUpRight, ArrowRight, TrendingUp, Sparkles, BarChart3, Target } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useState, useRef, memo, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
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
import { withReturnTo } from '../utils/siteNavigation';

export type CaseStat = { label: string; value: string };

export type CaseItem = {
  title: string;
  category: string;
  description: string;
  image: string;
  stats: CaseStat[];
};

export type CasesContent = {
  badge: string;
  titlePrefix: string;
  titleAccent: string;
  description: string;
  items: CaseItem[];
  sourceLinks?: Array<{ label: string; href: string }>;
  typography?: ContentTypography;
};

const casesData: CaseItem[] = [
  {
    title: 'Консьерж-сервис премиум-класса',
    category: 'Meta Ads',
    description: 'Проект, который со мной уже четыре года. Задача — не дешёвые лиды, а платёжеспособные клиенты: реклама оптимизируется на квалифицированные обращения из CRM.',
    image: '/images/case-concierge.jpg',
    stats: [
      { label: 'Срок', value: '4 года' },
      { label: 'Лиды', value: '65к+' },
      { label: 'Бюджет', value: '$1 млн+' },
    ],
  },
  {
    title: 'Интернет-магазин',
    category: 'Google Ads + Meta Ads',
    description: 'Google и Meta в связке: поиск ловит горячий спрос, Shopping продаёт с витрины, Meta возвращает тех, кто не дошёл до оплаты. Экономика считается до маржи.',
    image: '/images/case-ecommerce.jpg',
    stats: [
      { label: 'В корзину', value: '120 000+' },
      { label: 'Покупки', value: '30 000+' },
      { label: 'ROI', value: '210%' },
    ],
  },
  {
    title: 'Онлайн-курсы и инфопродукты',
    category: 'Google Ads + Meta Ads',
    description: 'Русскоязычная аудитория по всему миру: США, Европа, СНГ. Дешёвых лидов в нише много, окупаемых — мало: держим CPL до $5 без потери качества оплат.',
    image: '/images/case-infobusiness.jpg',
    stats: [
      { label: 'Бюджет', value: '$600к+' },
      { label: 'CPL', value: 'до $5' },
      { label: 'ROI', value: '180%' },
    ],
  },
  {
    title: 'Услуги: салоны, клиники, фитнес',
    category: 'Google Ads + Meta Ads',
    description: '50+ проектов на одной системе: локальный спрос, понятный оффер, быстрая обработка заявок. Поэтому результат повторяется, а не случается.',
    image: '/images/case-b2c.jpg',
    stats: [
      { label: 'Проектов', value: '50+' },
      { label: 'CPL', value: 'до $25' },
      { label: 'ROI', value: 'до 300%' },
    ],
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

export const defaultCasesContent: CasesContent = {
  badge: 'Проекты и результаты',
  titlePrefix: 'Кейсы: что запускал',
  titleAccent: 'и что из этого вышло',
  description: 'Четыре направления, в которых работаю чаще всего. В каждом — бюджет, цена заявки и окупаемость без прикрас. Полные разборы — на отдельной странице.',
  items: casesData,
};

function Cases({
  content,
  moreHref,
  contentKey = null,
  staticMotion = false,
}: {
  content?: CasesContent;
  moreHref?: string;
  contentKey?: string | null;
  staticMotion?: boolean;
}) {
  const fallbackContent = content ?? defaultCasesContent;
  const storedContent = useSiteSection(
    contentKey,
    'cases',
    contentKey ? fallbackContent : defaultCasesContent,
  );
  // Explicit content (not a CMS key) already is the source of truth. Returning
  // the hook's state here used to leave the preview one render behind because
  // useSiteContent synchronizes a changed fallback from an effect.
  const sectionContent = contentKey ? storedContent : fallbackContent;
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(sectionContent.typography, { minFontSize: 16 });
  const caseItems = sectionContent.items;
  const navigate = useNavigate();
  const location = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const mobileScrollerRef = useRef<HTMLDivElement>(null);
  const mobileScrollFrameRef = useRef<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useAmbientVisibility(sectionRef);
  const isTouch = useTouchDevice();
  const isMobile = useIsMobile();

  const scrollToSlide = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const nextIndex = Math.max(0, Math.min(caseItems.length - 1, index));
    const scroller = mobileScrollerRef.current;
    const slide = scroller?.querySelector<HTMLElement>(`[data-case-slide="${nextIndex}"]`);

    setCurrentIndex(nextIndex);
    if (!scroller || !slide) return;

    scroller.scrollTo({
      left: slide.offsetLeft - (scroller.clientWidth - slide.offsetWidth) / 2,
      behavior: behavior === 'smooth' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : behavior,
    });
  }, [caseItems.length]);

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
      const slides = Array.from(scroller.querySelectorAll<HTMLElement>('[data-case-slide]'));
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

  useEffect(() => {
    setCurrentIndex((previous) => {
      const lastIndex = Math.max(0, caseItems.length - 1);
      return previous > lastIndex ? lastIndex : previous;
    });
  }, [caseItems.length]);

  // Отключаем hover-анимации на тач-устройствах
  const desktopHover = !staticMotion && !isTouch ? { whileHover: { scale: 1.05 } } : {};
  const cardHover = !staticMotion && !isTouch ? { whileHover: { scale: 1.1 } } : {};

  // Бесконечная пульсация рамки только на десктопе. За «секция видна» отвечает
  // CSS: класс ww-ambient-motion внутри секции с data-ambient="off" встаёт на
  // паузу, и React больше не перерисовывает блок на каждом пересечении границы.
  const enablePulse = !staticMotion && !isMobile;

  return (
    <section
      id="cases"
      ref={sectionRef}
      className="relative py-16 md:py-24 overflow-x-clip overflow-y-visible bg-muted/30"
      style={{ contain: 'layout style' }}
    >
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] md:w-[800px] md:h-[800px] bg-gradient-radial from-primary/5 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={staticMotion ? false : { opacity: 0, y: 30 }}
          whileInView={staticMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={staticMotion ? undefined : { duration: 0.6 }}
          className="text-center mb-10 md:mb-14"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4 md:mb-6">
            <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-primary" />
            <span className="text-xs md:text-sm text-primary">{sectionContent.badge}</span>
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
          {sectionContent.sourceLinks?.length ? (
            <p className="mx-auto mt-3 max-w-3xl text-pretty text-xs leading-relaxed text-muted-foreground/80">
              Основа допущений:{' '}
              {sectionContent.sourceLinks.map((source, index) => (
                <span key={source.href}>
                  {index > 0 ? ' · ' : ''}
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline decoration-primary/35 underline-offset-2 transition-colors hover:text-accent"
                  >
                    {source.label}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </motion.div>

        {/* Desktop Grid */}
        {!isMobile && (
        <div className="hidden md:grid md:grid-cols-2 gap-6 lg:gap-8 overflow-visible">
          {caseItems.map((item, index) => (
            <motion.div
              key={index}
              initial={staticMotion ? false : { opacity: 0, y: 30 }}
              whileInView={staticMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={staticMotion ? undefined : { duration: 0.5, delay: index * 0.1 }}
              className={`group relative overflow-hidden rounded-3xl bg-card border border-border ${staticMotion ? '' : 'hover:border-primary/50 transition-all duration-300'}`}
              style={{ transform: 'translateZ(0)' }}
            >
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent opacity-0 blur-2xl pointer-events-none ${staticMotion ? '' : 'group-hover:opacity-100 transition-opacity duration-500'}`} />
              <motion.div
                className={`absolute top-4 left-4 w-10 h-10 rounded-lg bg-primary/10 backdrop-blur-sm border border-primary/30 flex items-center justify-center opacity-0 z-10 ${staticMotion ? '' : 'group-hover:opacity-100 transition-opacity'}`}
                initial={staticMotion ? false : { scale: 0.8 }}
                {...cardHover}
              >
                <BarChart3 className="w-5 h-5 text-primary" />
              </motion.div>

              <div className="relative h-48 sm:h-56 md:h-64 overflow-hidden">
                <ImageWithFallback
                  src={item.image}
                  alt={item.title}
                  className={`w-full h-full object-cover ${staticMotion ? '' : 'transition-transform duration-500 group-hover:scale-110'}`}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                <div
                  aria-hidden="true"
                  className={`absolute inset-0 border-2 border-primary/0 ${staticMotion ? '' : 'transition-all duration-300 group-hover:border-primary/30'}${
                    enablePulse ? ' ww-ambient-motion ww-case-frame-pulse' : ''
                  }`}
                />
                <div className="absolute top-4 right-4 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center gap-2">
                  <Target className="w-3 h-3 md:w-4 md:h-4 shrink-0 text-primary" />
                  <span className="text-xs md:text-sm text-primary font-semibold">{item.category}</span>
                </div>
              </div>

              <div className="p-5 md:p-6 space-y-4">
                <h3 className={`min-h-[3rem] text-balance text-lg md:text-xl font-bold leading-tight flex items-start justify-between gap-3 ${staticMotion ? '' : 'group-hover:text-primary transition-colors'}`}>
                  <span className="min-w-0">{item.title}</span>
                  <ArrowUpRight className={`w-4 h-4 md:w-5 md:h-5 shrink-0 opacity-0 ${staticMotion ? '' : 'group-hover:opacity-100 transition-all transform group-hover:-translate-y-1 group-hover:translate-x-1'}`} />
                </h3>
                <p className="md:min-h-[4.25rem] text-pretty text-sm md:text-base text-muted-foreground leading-relaxed">
                  {item.description}
                </p>

                {item.stats.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3 md:gap-4 pt-4 border-t border-border/50">
                    {item.stats.map((stat, idx) => (
                      <motion.div
                        key={idx}
                        className="relative space-y-1 p-2 rounded-lg bg-gradient-to-br from-primary/5 to-accent/5 backdrop-blur-sm"
                        {...desktopHover}
                        transition={staticMotion ? undefined : { duration: 0.2 }}
                        style={{ transform: 'translateZ(0)' }}
                      >
                        <div className="absolute top-1 right-1 w-4 h-4 rounded bg-primary/20 flex items-center justify-center">
                          <Sparkles className="w-2 h-2 text-primary" />
                        </div>
                        <div className="min-h-8 break-words [overflow-wrap:anywhere] pr-6 text-pretty text-xs leading-tight text-muted-foreground">{stat.label}</div>
                        <div className="break-words text-sm md:text-base font-bold leading-tight text-primary">{stat.value}</div>
                      </motion.div>
                    ))}
                  </div>
                ) : null}
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
            {caseItems.map((item, index) => (
                <div
                  key={index}
                  data-case-slide={index}
                  className="w-full flex-none snap-center px-2"
                  style={{ scrollSnapStop: 'always' }}
                >
                  <motion.div
                    initial={staticMotion ? false : { opacity: 0, scale: 0.9 }}
                    whileInView={staticMotion ? undefined : { opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={staticMotion ? undefined : { duration: 0.5 }}
                    className="relative overflow-hidden rounded-2xl bg-card/90 border border-primary/25 shadow-xl shadow-primary/10"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <div className="relative h-52 overflow-hidden">
                      <ImageWithFallback
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-secondary" />
                      <div className="absolute top-3 right-3 flex max-w-[68%] min-w-0 items-center gap-2 rounded-full border border-primary/30 bg-background/90 px-3 py-1.5 backdrop-blur-sm">
                        <Target className="w-3 h-3 shrink-0 text-primary" />
                        <span className="min-w-0 text-pretty text-[10px] min-[390px]:text-xs leading-tight text-primary font-semibold">{item.category}</span>
                      </div>
                      <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm">
                        <span className="text-xs font-bold text-primary">{index + 1}/{caseItems.length}</span>
                      </div>
                    </div>

                    <div className="p-[1.125rem] space-y-3.5">
                      <h3 className="text-balance text-[1.18rem] font-semibold leading-[1.15]">{item.title}</h3>
                      <p className="text-pretty text-[13px] text-muted-foreground leading-6">{item.description}</p>
                      {item.stats.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5 min-[390px]:gap-2 pt-3 border-t border-border/50">
                          {item.stats.map((stat, idx) => (
                            <div key={idx} className="relative p-2 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm border border-primary/15 overflow-hidden">
                              <div className="min-h-8 break-words [overflow-wrap:anywhere] text-pretty text-[9px] min-[390px]:text-[10px] leading-tight text-muted-foreground mb-1">{stat.label}</div>
                              <div className="break-words text-[11px] min-[390px]:text-sm font-semibold leading-tight text-primary tracking-[-0.01em]">{stat.value}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-primary via-accent to-secondary opacity-30" />
                  </motion.div>
                </div>
            ))}
          </div>

          <div className="flex justify-center gap-2 mt-6">
            {caseItems.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => scrollToSlide(index)}
                className="relative group inline-flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Показать кейс ${index + 1}: ${caseItems[index].title}`}
                aria-current={currentIndex === index ? 'true' : undefined}
              >
                <div aria-hidden="true" className={`w-2 h-2 rounded-full ${staticMotion ? '' : 'transition-all duration-300'} ${
                  currentIndex === index ? 'bg-primary w-8' : 'bg-primary/30'
                }`} />
                {currentIndex === index && !isMobile && (
                  <div
                    aria-hidden="true"
                    className="ww-ambient-motion ww-dot-pulse absolute left-1/2 top-1/2 h-2 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/50 blur-sm"
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
              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg bg-card/50 border border-primary/30 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${staticMotion ? '' : 'active:scale-95 transition-transform'}`}
              aria-label="Предыдущий кейс"
            >
              <svg aria-hidden="true" className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={nextSlide}
              disabled={currentIndex === caseItems.length - 1}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg bg-card/50 border border-primary/30 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${staticMotion ? '' : 'active:scale-95 transition-transform'}`}
              aria-label="Следующий кейс"
            >
              <svg aria-hidden="true" className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        )}

        {moreHref && (
          <div className="relative mt-12 md:mt-16 flex justify-center">
            <button
              type="button"
              onClick={() => navigate(moreHref, { state: withReturnTo(location) })}
              data-route-preload={moreHref}
              className={`group relative inline-flex w-full sm:w-auto items-center justify-center gap-3 px-8 md:px-14 py-4 md:py-5 rounded-2xl font-semibold text-white bg-gradient-to-r from-primary to-accent shadow-xl shadow-primary/30 overflow-hidden cursor-pointer ${staticMotion ? '' : 'transition-all hover:scale-105 active:scale-95'}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-120%] ${staticMotion ? '' : 'group-hover:translate-x-[120%] transition-transform duration-1000'}`} />
              <span className="relative text-center text-sm md:text-base lg:text-lg leading-tight">Перейти ко всем кейсам</span>
              <ArrowRight className={`w-4 h-4 md:w-5 md:h-5 relative ${staticMotion ? '' : 'group-hover:translate-x-1 transition-transform'}`} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(Cases);
