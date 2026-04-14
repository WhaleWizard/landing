import { motion, useInView } from 'motion/react';
import { BarChart3, Users, Globe, TrendingUp, Sparkles, Target, Zap } from 'lucide-react';
import { useState, useRef, TouchEvent, memo, useCallback } from 'react';

const servicesData = [
  {
    icon: BarChart3,
    title: 'Google Ads',
    description: 'Настройка и ведение рекламных кампаний в Google. Поисковая реклама, YouTube, Google Shopping.',
    features: ['Поисковая реклама', 'YouTube Ads','Ретаргетинг', 'Google Shopping'],
    gradient: 'from-primary to-accent',
  },
  {
    icon: Users,
    title: 'Meta Ads',
    description: 'Таргетированная реклама в Facebook и Instagram с точным попаданием в целевую аудиторию.',
    features: ['Facebook Ads', 'Instagram Ads', 'Ретаргетинг', 'Lookalike'],
    gradient: 'from-accent to-secondary',
  },
  {
    icon: Globe,
    title: 'Аналитика',
    description: 'Глубокая аналитика эффективности рекламы. Отслеживание KPI и ROI.',
    features: ['Google Analytics', 'Яндекс.Метрика', 'Audience Insights', 'A/B тесты'],
    gradient: 'from-secondary to-primary',
  },
  {
    icon: TrendingUp,
    title: 'Оптимизация',
    description: 'Постоянная оптимизация кампаний для наилучшей стоимости лида и увеличения конверсий.',
    features: ['CRO', 'Тестирование', 'Масштабирование', 'Аудит'],
    gradient: 'from-primary via-accent to-secondary',
  },
];

function Services() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: false, margin: '0px 0px -10% 0px' });

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % servicesData.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + servicesData.length) % servicesData.length);
  }, []);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current - touchEndX.current > 50) {
      nextSlide();
    } else if (touchEndX.current - touchStartX.current > 50) {
      prevSlide();
    }
  };

  return (
    <section id="services" ref={sectionRef} className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-[120px] animate-pulse pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-[120px] animate-pulse pointer-events-none -z-10" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none -z-10" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 md:mb-16 relative z-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4 md:mb-6">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-semibold">Что я предлагаю</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4">
            Услуги Perfomance{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              таргетолога
            </span>
          </h2>
          <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-1xl mx-auto">
            Комплексное управление рекламными кампаниями для максимального результата
          </p>
        </motion.div>

        {/* Desktop Grid */}
        <div className="hidden md:grid md:grid-cols-2 gap-6 lg:gap-8">
          {servicesData.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative"
            >
              <div className="relative p-6 md:p-8 rounded-3xl bg-card/50 backdrop-blur-sm border border-border hover:border-primary/50 transition-all duration-300 h-full overflow-hidden">
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${service.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${service.gradient} opacity-0 group-hover:opacity-20 blur-2xl transition-opacity duration-500`} />
                <motion.div
                  className="absolute top-4 right-4 w-8 h-8 rounded-full border border-primary/20"
                  animate={inView ? { 
                    y: [0, -10, 0],
                    opacity: [0.3, 0.6, 0.3]
                  } : {}}
                  transition={{ duration: 3, repeat: inView ? Infinity : 0, delay: index * 0.2 }}
                />
                
                <div className="relative z-10">
                  <div className="relative inline-flex mb-6">
                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${service.gradient} shadow-lg group-hover:shadow-2xl transition-shadow duration-300`}>
                      <service.icon className="w-6 h-6 md:w-8 md:h-8 text-white" />
                    </div>
                    <motion.div
                      className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${service.gradient} opacity-0 group-hover:opacity-50 blur-xl`}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  <h3 className="text-xl md:text-2xl font-bold mb-3 group-hover:text-primary transition-colors">
                    {service.title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground mb-6 leading-relaxed">
                    {service.description}
                  </p>

                  <div className="space-y-3">
                    {service.features.map((feature, idx) => (
                      <motion.div 
                        key={idx} 
                        className="flex items-center gap-3"
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 + idx * 0.05 }}
                      >
                        <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center">
                          <Sparkles className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-sm text-foreground/80">{feature}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm border border-primary/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Zap className="w-5 h-5 text-primary animate-pulse" />
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
            >
              {servicesData.map((service, index) => (
                <div key={index} className="w-full flex-shrink-0 px-2">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="relative"
                  >
                    <div className="relative p-6 rounded-2xl bg-card/60 backdrop-blur-md border-2 border-primary/30 shadow-2xl shadow-primary/10 overflow-hidden">
                      <div className={`absolute inset-0 bg-gradient-to-br ${service.gradient} opacity-5`} />
                      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${service.gradient}`} />
                      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${service.gradient} opacity-10 blur-2xl`} />

                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-5">
                          <div className={`p-3 rounded-xl bg-gradient-to-br ${service.gradient} shadow-lg`}>
                            <service.icon className="w-7 h-7 text-white" />
                          </div>
                          <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm">
                            <span className="text-xs font-bold text-primary">{index + 1}/{servicesData.length}</span>
                          </div>
                        </div>

                        <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                          {service.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                          {service.description}
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          {service.features.map((feature, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-card/40 border border-primary/20">
                              <div className="flex-shrink-0 w-5 h-5 rounded bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                                <Sparkles className="w-2.5 h-2.5 text-primary" />
                              </div>
                              <span className="text-xs text-foreground/90 leading-tight">{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r ${service.gradient} opacity-30`} />
                    </div>
                  </motion.div>
                </div>
              ))}
            </motion.div>
          </div>

          <div className="flex justify-center gap-2 mt-6">
            {servicesData.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className="relative group"
              >
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  currentIndex === index ? 'bg-primary w-8' : 'bg-primary/30'
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

export default memo(Services);