import { motion, useInView } from 'motion/react';
import { Sparkles, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef, memo, useCallback, TouchEvent } from 'react';

const testimonialsData = [
  {
    name: 'Светлана',
    position: 'Digital Producer',
    text: 'Мне нравится, что ты вникаешь в проект. Не просто “запустили и всё”, а реально разбирал мою ситуацию. По заявкам стало лучше, чем было.',
    rating: 5,
  },
  {
    name: 'Кэтрин',
    position: 'Project Manager',
    text: 'Работаем уже 4 год, результаты устраивают. Пытались так же паралельно тестирвоать других таргетологов, пока твои результаты лучшие',
    rating: 5,
  },
  {
    name: 'Дмитрий',
    position: 'CEO',
    text: 'Результат есть, завявки есть. Пока все устраивает в сотрудничестве',
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

const avatarColors = [
  'from-primary/30 to-primary/10 border-primary/40',
  'from-accent/30 to-accent/10 border-accent/40',
  'from-secondary/30 to-secondary/10 border-secondary/40',
];

// Хук для определения тач-устройства
const useTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);
  return isTouch;
};

function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
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

        {/* Десктопная версия — сетка из трёх карточек */}
        <div className="hidden md:grid md:grid-cols-3 gap-6 lg:gap-8">
          {testimonialsData.map((testimonial, index) => {
            const initials = getInitials(testimonial.name);
            const avatarColor = avatarColors[index % avatarColors.length];
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative group"
              >
                <div className="relative p-6 lg:p-8 rounded-2xl lg:rounded-3xl bg-card/50 backdrop-blur-sm border border-border hover:border-primary/50 transition-all duration-300 h-full flex flex-col overflow-hidden">
                  {/* Цветная линия сверху — исправлено: теперь внутри карточки, корректно прилегает */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-secondary" />
                  <div className="absolute inset-0 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-primary/5 via-accent/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />

                  <div className="relative flex flex-col h-full">
                    <p className="text-base lg:text-lg text-foreground/90 leading-relaxed mb-6 flex-1">
                      "{testimonial.text}"
                    </p>
                    <div className="flex items-center gap-4 pt-6 border-t border-border/50">
                      <div className={`relative w-12 h-12 lg:w-14 lg:h-14 flex-shrink-0 rounded-full overflow-hidden ring-2 ring-primary/30 group-hover:ring-primary/60 transition-all bg-gradient-to-br ${avatarColor} flex items-center justify-center`}>
                        <span className="text-lg font-bold text-foreground/80">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base lg:text-lg font-semibold text-foreground">{testimonial.name}</div>
                        <div className="text-sm text-muted-foreground">{testimonial.position}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
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
              {testimonialsData.map((testimonial, index) => {
                const initials = getInitials(testimonial.name);
                const avatarColor = avatarColors[index % avatarColors.length];
                return (
                  <div key={index} className="w-full flex-shrink-0 px-2">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5 }}
                      className="relative"
                    >
                      <div className="relative p-5 rounded-2xl bg-card/60 backdrop-blur-md border-2 border-primary/30 shadow-xl shadow-primary/10 overflow-hidden">
                        {/* Цветная линия сверху — исправлено */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-secondary" />
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-secondary/5 rounded-2xl -z-10" />

                        <div className="relative pt-2">
                          <p className="text-sm text-foreground/90 leading-relaxed mb-6">
                            "{testimonial.text}"
                          </p>
                          <div className="flex items-center gap-3 pt-5 border-t border-border/50">
                            <div className={`relative w-12 h-12 flex-shrink-0 rounded-full overflow-hidden ring-2 ring-primary/40 bg-gradient-to-br ${avatarColor} flex items-center justify-center`}>
                              <span className="text-base font-bold text-foreground/80">{initials}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-foreground">{testimonial.name}</div>
                              <div className="text-xs text-muted-foreground">{testimonial.position}</div>
                            </div>
                          </div>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-primary via-accent to-secondary opacity-30" />
                      </div>
                    </motion.div>
                  </div>
                );
              })}
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