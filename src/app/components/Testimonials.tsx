import { motion, useInView } from 'motion/react';
import { Sparkles, Users, ChevronLeft, ChevronRight, Quote, Building2, MoveHorizontal } from 'lucide-react';
import { useState, useEffect, useRef, memo, useCallback, TouchEvent } from 'react';

type Testimonial = {
  name: string;
  company: string;
  position: string;
  text: string;
};

const testimonialsData: Testimonial[] = [
  {
    name: 'Радмир',
    company: 'StepN',
    position: 'StepN Partner',
    text: 'Мне нравится, что ты вникаешь в проект. Не просто “запустили и всё”, а реально разбирал мою ситуацию. По заявкам стало лучше, чем было.',
  },
  {
    name: 'Тина',
    company: 'Inter Agency',
    position: 'Head of Marketing',
    text: 'Работаем уже 4 год, результаты устраивают. Пытались так же параллельно тестировать других таргетологов, пока твои результаты лучшие.',
  },
  {
    name: 'Макс',
    company: 'Toor',
    position: 'Head of Marketing',
    text: 'Результат есть, заявки есть. Пока все устраивает в сотрудничестве: понятные отчёты, быстрые правки и нормальная коммуникация по рекламе.',
  },
  {
    name: 'Кетрин',
    company: 'BlackF',
    position: 'Head of Marketing',
    text: 'До запуска было много нецелевых обращений. После переработки креативов и аудиторий заявки стали качественнее, администраторы начали быстрее закрывать записи.',
  },
  {
    name: 'Анатолий',
    company: 'Spectre',
    position: 'Founder',
    text: 'Нужно было заполнить новый филиал без хаоса в рекламе. Получили понятную воронку, отдельные кампании под абонементы и стабильный поток заявок.',
  },
  {
    name: 'Дмитрий',
    company: 'Vectrum',
    position: 'CEO',
    text: 'Понравилось, что сначала разобрали экономику и путь клиента, а уже потом запускали кампании. Лиды стали предсказуемее, менеджерам проще планировать нагрузку.',
  },
  {
    name: 'Олег',
    company: 'TakeProfit',
    position: 'Owner',
    text: 'Для B2B-ниши было важно не просто получить клики, а привести адекватные заявки. После тестов офферов и ретаргетинга появились обращения от нужных компаний.',
  },
  {
    name: 'Евгений',
    company: 'Korolev School',
    position: 'Founder',
    text: 'Запускали набор на курсы в сжатые сроки. Кампании быстро донастраивались по фактическим заявкам, поэтому бюджет не расползался на случайный трафик.',
  },
  {
    name: 'Руслан',
    company: 'Buyuk Zamon',
    position: 'CEO',
    text: 'После настройки рекламы стало понятнее, какие связки работают лучше. Команда быстро видела результаты тестов и могла спокойно планировать следующие шаги.',
  },
  {
    name: 'Юрий',
    company: 'Sky Monsion',
    position: 'Founder',
    text: 'Понравился системный подход: сначала разобрали цели и аудитории, затем аккуратно протестировали гипотезы. Реклама стала управляемее, без лишней суеты.',
  },
  {
    name: 'Джасур',
    company: 'CTI Invest',
    position: 'Head of Marketing',
    text: 'Важно было получать не просто трафик, а обращения от людей, которым действительно интересен продукт. После оптимизации кампаний качество лидов заметно выросло.',
  },
  {
    name: 'Навид',
    company: 'New Reality',
    position: 'Founder',
    text: 'Быстро нашли рабочие аудитории и креативы. Отчёты были понятными, а решения по бюджету принимались на основе цифр, а не предположений.',
  },
  {
    name: 'Ева',
    company: 'Obnimat',
    position: 'Founder',
    text: 'Запуск прошёл спокойно: структура кампаний была понятной, правки внедрялись быстро. В итоге получили более стабильный поток заявок без перегрева бюджета.',
  },
  {
    name: 'Натэлла',
    company: 'MillionZaEfir',
    position: 'Founder',
    text: 'Отдельно ценно, что была работа не только с рекламой, но и с оффером. После доработок заявки стали приходить ровнее и с более понятной мотивацией.',
  },
  {
    name: 'Анна',
    company: 'Bliss Agency',
    position: 'CEO',
    text: 'Коммуникация была быстрой и по делу. Кампании запускались аккуратно, тесты фиксировались, а по результатам сразу было понятно, что масштабировать дальше.',
  },
];

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

function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDesktopScrollbarVisible, setIsDesktopScrollbarVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const desktopScrollerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: false, margin: '0px 0px -10% 0px' });
  const isTouch = useTouchDevice();

  // Для свайпа
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
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

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % testimonialsData.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + testimonialsData.length) % testimonialsData.length);
  }, []);

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
    const scroller = desktopScrollerRef.current;
    if (!scroller) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      if (maxScrollLeft <= 0) return;

      const nextScrollLeft = scroller.scrollLeft + e.deltaY;
      const isAtStart = scroller.scrollLeft <= 0;
      const isAtEnd = scroller.scrollLeft >= maxScrollLeft;

      if ((e.deltaY < 0 && isAtStart) || (e.deltaY > 0 && isAtEnd)) return;

      e.preventDefault();
      revealDesktopScrollbar();
      scroller.scrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
    };

    scroller.addEventListener('wheel', handleWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', handleWheel);
  }, [revealDesktopScrollbar]);

  useEffect(() => {
    return () => {
      if (desktopScrollbarTimerRef.current !== null) {
        window.clearTimeout(desktopScrollbarTimerRef.current);
      }
    };
  }, []);

  // Автоскролл только когда секция видна
  useEffect(() => {
    if (!inView) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonialsData.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [inView]);

  // Обработчики свайпа
  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) > 50) {
      if (delta > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    touchStartX.current = 0;
    touchEndX.current = 0;
  }, [nextSlide, prevSlide]);

  // Отключаем whileHover на тач-устройствах
  const statHover = !isTouch ? { whileHover: { y: -5 } } : {};

  return (
    <section
      id="about"
      ref={sectionRef}
      className="relative py-16 md:py-24 overflow-x-clip overflow-y-visible"
      style={{ contain: 'layout style' }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent pointer-events-none -z-10" />
      <div className="absolute inset-x-0 top-10 h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent pointer-events-none -z-10 md:top-14" />

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
            <span className="text-sm text-accent font-semibold">Отзывы клиентов</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4">
            Что говорят{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              мои клиенты
            </span>
          </h2>
          <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto">
            Доверие строится на результатах. Вот что говорят проекты, с которыми я работаю
          </p>
        </motion.div>

        {/* Десктопная версия — горизонтальная лента карточек */}
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
                className="p-2.5 rounded-xl bg-card/50 border border-primary/30 backdrop-blur-sm hover:bg-primary/10 active:scale-95 transition-all"
                aria-label="Previous testimonials"
              >
                <ChevronLeft className="w-5 h-5 text-primary" />
              </button>
              <button
                onClick={() => scrollDesktopTestimonials('next')}
                className="p-2.5 rounded-xl bg-card/50 border border-primary/30 backdrop-blur-sm hover:bg-primary/10 active:scale-95 transition-all"
                aria-label="Next testimonials"
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
              className="testimonials-desktop-scroller flex snap-x snap-proximity scroll-smooth gap-5 overflow-x-auto overflow-y-hidden px-5 pb-10 pt-6 md:gap-7 md:px-10"
              data-scrollbar-visible={isDesktopScrollbarVisible ? 'true' : 'false'}
              onScroll={revealDesktopScrollbar}
              style={{
                scrollPaddingInline: '2.5rem',
                scrollbarWidth: 'thin',
                scrollbarColor: isDesktopScrollbarVisible ? 'rgba(139, 92, 246, 0.65) transparent' : 'rgba(139, 92, 246, 0) transparent',
                WebkitOverflowScrolling: 'touch',
                cursor: 'grab',
                willChange: 'scroll-position',
              }}
            >
              {testimonialsData.map((testimonial, index) => (
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
        `}</style>

        {/* Мобильная версия — карусель с тач-свайпом */}
        <div className="md:hidden relative">
          <div
            className="relative -m-4 overflow-hidden p-4"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <motion.div
              className="flex"
              animate={{ x: `-${currentIndex * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{ willChange: 'transform' }}
            >
              {testimonialsData.map((testimonial, index) => (
                <div key={`${testimonial.company}-${testimonial.name}`} className="w-full flex-shrink-0 px-2">
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
            </motion.div>
          </div>

          {/* Индикаторы (точки) */}
          <div className="flex justify-center gap-2 mt-6">
            {testimonialsData.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className="relative"
                aria-label={`Go to testimonial ${index + 1}`}
              >
                <div className={`h-2 rounded-full transition-all duration-300 ${
                  currentIndex === index
                    ? 'bg-primary w-8'
                    : 'bg-primary/30 w-2'
                }`} />
                {currentIndex === index && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary/50 blur-sm"
                    animate={inView ? { scale: [1, 1.5, 1] } : {}}
                    transition={{ duration: 2, repeat: inView ? Infinity : 0 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Кнопки навигации */}
          <div className="flex justify-center gap-3 mt-5">
            <button
              onClick={prevSlide}
              className="p-2.5 rounded-xl bg-card/50 border border-primary/30 backdrop-blur-sm hover:bg-primary/10 active:scale-95 transition-all"
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="w-5 h-5 text-primary" />
            </button>
            <button
              onClick={nextSlide}
              className="p-2.5 rounded-xl bg-card/50 border border-primary/30 backdrop-blur-sm hover:bg-primary/10 active:scale-95 transition-all"
              aria-label="Next testimonial"
            >
              <ChevronRight className="w-5 h-5 text-primary" />
            </button>
          </div>
        </div>

        {/* Блок доверия (статистика) */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 md:mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6"
        >
          {[
            { value: '150+', label: 'кейсов с результатом' },
            { value: '5 лет', label: 'Опыта в маркетинге' },
            { value: '79%', label: 'проектов окупаются и масштабируются' },
            { value: '$2М+', label: 'откручено в рекламе' },
          ].map((stat, index) => (
            <motion.div
              key={index}
              className="relative text-center p-4 md:p-6 rounded-2xl bg-card/30 backdrop-blur-sm border border-border hover:border-primary/50 transition-all duration-300 group"
              {...statHover}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl -z-10" />
              <div className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="relative">
                <div className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground leading-tight">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export default memo(Testimonials);
