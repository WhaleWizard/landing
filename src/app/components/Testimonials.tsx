import { motion, useInView } from 'motion/react';
import { Sparkles, Users, ChevronLeft, ChevronRight, Quote, Building2 } from 'lucide-react';
import { useState, useEffect, useRef, memo, useCallback, TouchEvent } from 'react';

type Testimonial = {
  name: string;
  company: string;
  position: string;
  text: string;
  rating: number;
};

const testimonialsData: Testimonial[] = [
  {
    name: 'Светлана',
    company: 'Studio Forma',
    position: 'Digital Producer',
    text: 'Мне нравится, что ты вникаешь в проект. Не просто “запустили и всё”, а реально разбирал мою ситуацию. По заявкам стало лучше, чем было.',
    rating: 5,
  },
  {
    name: 'Кэтрин',
    company: 'Nova Events',
    position: 'Project Manager',
    text: 'Работаем уже 4 год, результаты устраивают. Пытались так же параллельно тестировать других таргетологов, пока твои результаты лучшие.',
    rating: 5,
  },
  {
    name: 'Дмитрий',
    company: 'DMD Consulting',
    position: 'CEO',
    text: 'Результат есть, заявки есть. Пока все устраивает в сотрудничестве: понятные отчёты, быстрые правки и нормальная коммуникация по рекламе.',
    rating: 5,
  },
  {
    name: 'Анна Морозова',
    company: 'Lumi Beauty Clinic',
    position: 'Маркетинг-директор',
    text: 'До запуска было много нецелевых обращений. После переработки креативов и аудиторий заявки стали качественнее, администраторы начали быстрее закрывать записи.',
    rating: 5,
  },
  {
    name: 'Игорь Савельев',
    company: 'ProFit Gym',
    position: 'Управляющий партнёр',
    text: 'Нужно было заполнить новый филиал без хаоса в рекламе. Получили понятную воронку, отдельные кампании под абонементы и стабильный поток заявок.',
    rating: 5,
  },
  {
    name: 'Мария Коваль',
    company: 'Urban Keys Realty',
    position: 'Head of Sales',
    text: 'Понравилось, что сначала разобрали экономику и путь клиента, а уже потом запускали кампании. Лиды стали предсказуемее, менеджерам проще планировать нагрузку.',
    rating: 5,
  },
  {
    name: 'Алексей Романов',
    company: 'TechLine B2B',
    position: 'Коммерческий директор',
    text: 'Для B2B-ниши было важно не просто получить клики, а привести адекватные заявки. После тестов офферов и ретаргетинга появились обращения от нужных компаний.',
    rating: 5,
  },
  {
    name: 'Елена Гриценко',
    company: 'KidsLab School',
    position: 'Основатель',
    text: 'Запускали набор на курсы в сжатые сроки. Кампании быстро донастраивались по фактическим заявкам, поэтому бюджет не расползался на случайный трафик.',
    rating: 5,
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
    shell: 'border-primary/35 hover:border-primary/70 shadow-primary/10',
    glow: 'from-primary/20 via-primary/5 to-accent/15',
    line: 'from-primary via-accent to-secondary',
    avatar: 'from-primary/35 to-primary/10 border-primary/40 ring-primary/35',
    badge: 'bg-primary/10 text-primary border-primary/20',
  },
  {
    shell: 'border-accent/35 hover:border-accent/70 shadow-accent/10',
    glow: 'from-accent/20 via-accent/5 to-secondary/15',
    line: 'from-accent via-secondary to-primary',
    avatar: 'from-accent/35 to-accent/10 border-accent/40 ring-accent/35',
    badge: 'bg-accent/10 text-accent border-accent/20',
  },
  {
    shell: 'border-secondary/35 hover:border-secondary/70 shadow-secondary/10',
    glow: 'from-secondary/20 via-secondary/5 to-primary/15',
    line: 'from-secondary via-primary to-accent',
    avatar: 'from-secondary/35 to-secondary/10 border-secondary/40 ring-secondary/35',
    badge: 'bg-secondary/10 text-secondary border-secondary/20',
  },
  {
    shell: 'border-primary/25 hover:border-accent/60 shadow-primary/10',
    glow: 'from-primary/15 via-accent/10 to-transparent',
    line: 'from-primary via-white/50 to-accent',
    avatar: 'from-primary/30 to-accent/15 border-primary/40 ring-primary/30',
    badge: 'bg-card/70 text-foreground border-primary/20',
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
    <div className={`relative h-full overflow-hidden rounded-2xl lg:rounded-3xl border bg-card/60 backdrop-blur-md shadow-xl transition-all duration-300 ${style.shell}`}>
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${style.line}`} />
      <div className={`absolute inset-0 bg-gradient-to-br ${style.glow} opacity-70`} />
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-foreground/5 blur-2xl" />

      <div className={`relative flex h-full flex-col ${compact ? 'p-5' : 'p-6 lg:p-7'}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className={`inline-flex max-w-[78%] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${style.badge}`}>
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{testimonial.company}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-0.5 text-[13px] text-accent" aria-label={`${testimonial.rating} из 5`}>
            {Array.from({ length: testimonial.rating }).map((_, starIndex) => (
              <span key={starIndex}>★</span>
            ))}
          </div>
        </div>

        <Quote className={`${compact ? 'mb-3 h-7 w-7' : 'mb-4 h-8 w-8'} text-primary/35`} />
        <p className={`${compact ? 'text-sm' : 'text-base lg:text-[17px]'} flex-1 leading-relaxed text-foreground/90`}>
          «{testimonial.text}»
        </p>

        <div className="mt-6 flex items-center gap-4 border-t border-border/50 pt-5">
          <div className={`relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-br ring-2 ${style.avatar}`}>
            <span className="text-base font-bold text-foreground/85">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className={`${compact ? 'text-sm' : 'text-base'} truncate font-semibold text-foreground`}>{testimonial.name}</div>
            <div className="mt-0.5 truncate text-xs md:text-sm text-muted-foreground">{testimonial.position}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const desktopScrollerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: false, margin: '0px 0px -10% 0px' });
  const isTouch = useTouchDevice();

  // Для свайпа
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % testimonialsData.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + testimonialsData.length) % testimonialsData.length);
  }, []);

  const scrollDesktopTestimonials = useCallback((direction: 'prev' | 'next') => {
    const scroller = desktopScrollerRef.current;
    if (!scroller) return;

    const cardWidth = scroller.querySelector<HTMLElement>('[data-testimonial-card]')?.offsetWidth ?? 360;
    scroller.scrollBy({
      left: direction === 'next' ? cardWidth + 24 : -(cardWidth + 24),
      behavior: 'smooth',
    });
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
      className="relative py-16 md:py-24 overflow-hidden"
      style={{ contain: 'layout style paint' }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/20 to-transparent pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent pointer-events-none -z-10" />

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
        <div className="hidden md:block">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              Листайте отзывы — каждая карточка показывает компанию, роль клиента и реальный контекст работы.
            </div>
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

          <div
            ref={desktopScrollerRef}
            className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [scrollbar-width:thin] [scrollbar-color:var(--primary)_transparent]"
          >
            {testimonialsData.map((testimonial, index) => (
              <motion.div
                key={`${testimonial.company}-${testimonial.name}`}
                data-testimonial-card
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: (index % 4) * 0.08 }}
                className="min-h-[360px] w-[min(390px,calc(100vw-4rem))] flex-shrink-0 snap-start group"
              >
                <TestimonialCard testimonial={testimonial} index={index} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Мобильная версия — карусель с тач-свайпом */}
        <div className="md:hidden relative">
          <div
            className="relative overflow-hidden"
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
                    className="relative min-h-[390px]"
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
