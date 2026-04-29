import { motion, useInView } from 'motion/react';
import { ArrowUpRight, TrendingUp, Sparkles, BarChart3, Target } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useState, useRef, TouchEvent, memo, useCallback, useEffect } from 'react';

const casesData = [
  {
    title: 'Premium Concierge Service',
    category: 'Meta Ads',
    description: 'Привлечение исключительно квалифицированных лидов для премиум-консьерж сервиса с высокой конверсией в общение.',
    image: 'https://i.ibb.co/vCrb62rL/photo-2026-04-11-00-20-15.jpg',
    stats: [
      { label: 'Срок работы', value: '4 года' },
      { label: 'Лиды', value: '65к+' },
      { label: 'Ad Spend', value: '$1 Млн+' },
    ],
  },
  {
    title: 'E-commerce',
    category: 'Google Ads + Meta Ads',
    description: 'Продвижение товаров в уникальной связке Gooпle ads + Shopping ads + Meta ads',
    image: 'https://i.ibb.co/YBwdT5rQ/photo-2026-04-11-00-20-59.jpg',
    stats: [
      { label: 'Add to cart', value: '120.000+' },
      { label: 'Покупки', value: '30.000+' },
      { label: 'ROI', value: '210%' },
    ],
  },
  {
    title: 'Инфобизнес',
    category: 'Google Ads + Meta Ads',
    description: 'Продвигал инфопродукты на русскоязычную аудиторию по всему миру',
    image: 'https://i.ibb.co/F4q65TQk/photo-2026-04-11-00-20-39.jpg',
    stats: [
      { label: 'Ad Spend', value: '$600к +' },
      { label: 'CPL', value: 'до $5' },
      { label: 'ROI', value: '180%' },
    ],
  },
  {
    title: 'B2C услуги',
    category: 'Google Ads + Meta Ads',
    description: 'Уникальные стратегии продвижения для вашего бизнеса',
    image: 'https://i.ibb.co/TqBqwSGB/photo-2026-04-11-00-21-23.jpg',
    stats: [
      { label: 'Проектов', value: '50+' },
      { label: 'CPL', value: 'до $25' },
      { label: 'ROI', value: 'до 300%' },
    ],
  },
];

const buildResponsiveImageSet = (baseUrl: string) =>
  `${baseUrl}?width=480 480w, ${baseUrl}?width=768 768w, ${baseUrl}?width=1024 1024w`;

// Хук для определения тач-устройства
const useTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);
  return isTouch;
};

// Хук для определения мобильной ширины
const useMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
};

function Cases() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: false, margin: '0px 0px -10% 0px' });
  const isTouch = useTouchDevice();
  const isMobile = useMobile();

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % casesData.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + casesData.length) % casesData.length);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current - touchEndX.current > 50) {
      nextSlide();
    } else if (touchEndX.current - touchStartX.current > 50) {
      prevSlide();
    }
  }, [nextSlide, prevSlide]);

  // Отключаем hover-анимации на тач-устройствах
  const desktopHover = !isTouch ? { whileHover: { scale: 1.05 } } : {};
  const cardHover = !isTouch ? { whileHover: { scale: 1.1 } } : {};

  // Бесконечная пульсация рамки только на десктопе и если секция видна
  const enablePulse = !isMobile && inView;

  return (
    <section 
      id="cases" 
      ref={sectionRef} 
      className="relative py-16 md:py-24 overflow-hidden bg-muted/30"
      style={{ contain: 'layout style paint' }}
    >
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] md:w-[800px] md:h-[800px] bg-gradient-radial from-primary/5 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 md:mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4 md:mb-6">
            <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-primary" />
            <span className="text-xs md:text-sm text-primary">Результат моей работы</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4">
            Кейсы с{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              наилучшей результативностью
            </span>
          </h2>
          <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto">
            Конкретные результаты, подтверждённые цифрами и аналитикой. Больше кейсов и подробный разбор можете найти в блоге или в соц. сетях
          </p>
        </motion.div>

        {/* Desktop Grid */}
        <div className="hidden md:grid md:grid-cols-2 gap-6 lg:gap-8">
          {casesData.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative overflow-hidden rounded-3xl bg-card border border-border hover:border-primary/50 transition-all duration-300"
              style={{ transform: 'translateZ(0)' }}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500 pointer-events-none" />
              <motion.div
                className="absolute top-4 left-4 w-10 h-10 rounded-lg bg-primary/10 backdrop-blur-sm border border-primary/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                initial={{ scale: 0.8 }}
                {...cardHover}
              >
                <BarChart3 className="w-5 h-5 text-primary" />
              </motion.div>

              <div className="relative h-48 sm:h-56 md:h-64 overflow-hidden">
                <ImageWithFallback
                  src={item.image}
                  alt={item.title}
                  srcSet={buildResponsiveImageSet(item.image)}
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                  fetchPriority="low"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                <motion.div 
                  className="absolute inset-0 border-2 border-primary/0 transition-all duration-300 group-hover:border-primary/30"
                  animate={enablePulse ? {
                    boxShadow: ['0 0 0 rgba(139,92,246,0)', '0 0 20px rgba(139,92,246,0.3)', '0 0 0 rgba(139,92,246,0)']
                  } : {}}
                  transition={{ duration: 2, repeat: enablePulse ? Infinity : 0 }}
                  style={{ willChange: 'box-shadow' }}
                />
                <div className="absolute top-4 right-4 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center gap-2">
                  <Target className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                  <span className="text-xs md:text-sm text-primary font-semibold">{item.category}</span>
                </div>
              </div>

              <div className="p-5 md:p-6 space-y-4">
                <h3 className="text-lg md:text-xl font-bold group-hover:text-primary transition-colors flex items-start justify-between">
                  {item.title}
                  <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5 opacity-0 group-hover:opacity-100 transition-all transform group-hover:-translate-y-1 group-hover:translate-x-1" />
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {item.description}
                </p>

                <div className="grid grid-cols-3 gap-3 md:gap-4 pt-4 border-t border-border/50">
                  {item.stats.map((stat, idx) => (
                    <motion.div 
                      key={idx} 
                      className="relative space-y-1 p-2 rounded-lg bg-gradient-to-br from-primary/5 to-accent/5 backdrop-blur-sm"
                      {...desktopHover}
                      transition={{ duration: 0.2 }}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      <div className="absolute top-1 right-1 w-4 h-4 rounded bg-primary/20 flex items-center justify-center">
                        <Sparkles className="w-2 h-2 text-primary" />
                      </div>
                      <div className="text-xs text-muted-foreground">{stat.label}</div>
                      <div className="text-sm md:text-base font-bold text-primary">{stat.value}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Mobile Carousel */}
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
              style={{ willChange: 'transform', transform: 'translateZ(0)' }}
            >
              {casesData.map((item, index) => (
                <div key={index} className="w-full flex-shrink-0 px-2">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="relative overflow-hidden rounded-2xl bg-card border-2 border-primary/30 shadow-2xl shadow-primary/10"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <div className="relative h-52 overflow-hidden">
                      <ImageWithFallback
                        src={item.image}
                        alt={item.title}
                        srcSet={buildResponsiveImageSet(item.image)}
                        sizes="100vw"
                        className="w-full h-full object-cover"
                        loading="lazy"
                        fetchPriority="low"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-secondary" />
                      <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-background/90 backdrop-blur-sm border border-primary/30 flex items-center gap-2">
                        <Target className="w-3 h-3 text-primary" />
                        <span className="text-xs text-primary font-semibold">{item.category}</span>
                      </div>
                      <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm">
                        <span className="text-xs font-bold text-primary">{index + 1}/{casesData.length}</span>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      <h3 className="text-xl font-bold">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
                        {item.stats.map((stat, idx) => (
                          <div key={idx} className="relative p-2 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm border border-primary/20">
                            <div className="absolute top-1 right-1 w-3 h-3 rounded bg-primary/30 flex items-center justify-center">
                              <Sparkles className="w-2 h-2 text-primary" />
                            </div>
                            <div className="text-[10px] text-muted-foreground mb-1">{stat.label}</div>
                            <div className="text-sm font-bold text-primary">{stat.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-primary via-accent to-secondary opacity-30" />
                  </motion.div>
                </div>
              ))}
            </motion.div>
          </div>

          <div className="flex justify-center gap-2 mt-6">
            {casesData.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className="relative group"
              >
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  currentIndex === index ? 'bg-primary w-8' : 'bg-primary/30'
                }`} />
                {currentIndex === index && !isMobile && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary/50 blur-sm"
                    animate={inView ? { scale: [1, 1.5, 1] } : {}}
                    transition={{ duration: 2, repeat: inView ? Infinity : 0 }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-center gap-4 mt-4">
            <button
              onClick={prevSlide}
              className="p-2 rounded-lg bg-card/50 border border-primary/30 backdrop-blur-sm active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={nextSlide}
              className="p-2 rounded-lg bg-card/50 border border-primary/30 backdrop-blur-sm active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(Cases);
