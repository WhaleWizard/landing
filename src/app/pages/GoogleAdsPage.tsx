import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform, useScroll } from 'motion/react';
import {
  Search,
  Zap,
  BarChart3,
  TrendingUp,
  Sparkles,
  ShoppingCart,
  Youtube,
  MousePointer,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Target,
  LineChart,
  Rocket,
  Shield,
  DollarSign,
  PieChart,
  RefreshCcw,
  Database,
  Layers,
  Settings,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import { GradientOrbs, AnimatedGrid } from '../components/InteractiveBackground';

// Animated counter component
const AnimatedCounter = memo(({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 2000;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      start = Math.floor(easeOut * value);
      setDisplayValue(start);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [inView, value]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{displayValue}{suffix}
    </span>
  );
});
AnimatedCounter.displayName = 'AnimatedCounter';

// 3D Tilt Card
const TiltCard = memo(({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    rotateX.set((-((e.clientY - centerY) / rect.height)) * 12);
    rotateY.set(((e.clientX - centerX) / rect.width) * 12);
  }, [rotateX, rotateY]);

  const handleMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    setIsHovered(false);
  }, [rotateX, rotateY]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        transformStyle: 'preserve-3d',
        perspective: '1000px',
      }}
      className={`relative ${className}`}
    >
      {children}
      {isHovered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 rounded-2xl pointer-events-none bg-gradient-radial from-blue-500/10 to-transparent"
        />
      )}
    </motion.div>
  );
});
TiltCard.displayName = 'TiltCard';

// Google colors
const googleColors = {
  blue: '#4285f4',
  red: '#ea4335',
  yellow: '#fbbc04',
  green: '#34a853',
};

// Pain points data
const painPoints = [
  {
    icon: DollarSign,
    title: 'Высокая цена клика',
    description: 'Бюджет сливается на нецелевые запросы без конверсий.',
    color: 'from-red-500/20 to-orange-500/20',
    borderColor: 'border-red-500/30',
  },
  {
    icon: Settings,
    title: 'Неправильная структура',
    description: 'Хаотичные кампании без логической группировки.',
    color: 'from-orange-500/20 to-yellow-500/20',
    borderColor: 'border-orange-500/30',
  },
  {
    icon: Target,
    title: 'Нет минус-слов',
    description: 'Показы по нерелевантным запросам съедают бюджет.',
    color: 'from-yellow-500/20 to-amber-500/20',
    borderColor: 'border-yellow-500/30',
  },
];

// Work steps data
const workSteps = [
  {
    number: '01',
    title: 'Анализ ниши',
    description: 'Изучаю спрос, конкурентов и семантическое ядро.',
    icon: Search,
    color: 'blue',
  },
  {
    number: '02',
    title: 'Структура кампаний',
    description: 'Выстраиваю логику: поиск, РСЯ, ремаркетинг.',
    icon: Layers,
    color: 'green',
  },
  {
    number: '03',
    title: 'Настройка трекинга',
    description: 'GTM, GA4, конверсии, сквозная аналитика.',
    icon: BarChart3,
    color: 'yellow',
  },
  {
    number: '04',
    title: 'Оптимизация',
    description: 'Снижаю CPC, повышаю Quality Score, масштабирую.',
    icon: Rocket,
    color: 'red',
  },
];

// Cases data
const casesData = [
  {
    title: 'B2B SaaS',
    category: 'Google Ads',
    stats: [
      { label: 'CPC до', value: 8, prefix: '$', color: 'text-red-400' },
      { label: 'CPC после', value: 3, prefix: '$', color: 'text-green-400' },
      { label: 'Конверсии', value: 156, suffix: '%', color: 'text-blue-400' },
    ],
    description: 'Снизили стоимость клика с $8 до $3 за месяц.',
  },
  {
    title: 'E-commerce',
    category: 'Shopping',
    stats: [
      { label: 'ROAS', value: 580, suffix: '%', color: 'text-green-400' },
      { label: 'Продажи', value: 2400, suffix: '+', color: 'text-blue-400' },
      { label: 'CAC', value: 35, suffix: '%', color: 'text-yellow-400' },
    ],
    description: 'ROAS 580% на Performance Max кампаниях.',
  },
  {
    title: 'Локальный бизнес',
    category: 'Local Ads',
    stats: [
      { label: 'Лидов/мес', value: 120, suffix: '+', color: 'text-blue-400' },
      { label: 'CPL', value: 15, prefix: '$', color: 'text-green-400' },
      { label: 'CTR', value: 12, suffix: '%', color: 'text-yellow-400' },
    ],
    description: 'Стабильный поток заявок для локального сервиса.',
  },
];

// Benefits data
const benefits = [
  'Полный аудит текущих кампаний',
  'Сбор семантического ядра',
  'Настройка конверсий GA4',
  'Ежемесячные отчёты',
  'Оптимизация Quality Score',
  'A/B тесты объявлений',
];

function GoogleAdsPage() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.95]);

  const scrollToContact = useCallback(() => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <SEO
        title="Контекстная реклама Google Ads"
        description="Настрою Google Ads, который приносит клиентов, а не просто тратит бюджет. Поиск, Shopping, Performance Max."
        url="/google-ads"
      />
      <Navbar />

      {/* Hero Section with conversion animation */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center overflow-hidden"
      >
        {/* Background effects */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-background to-background" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(66,133,244,0.18),transparent_45%),radial-gradient(circle_at_82%_22%,rgba(52,168,83,0.14),transparent_42%),radial-gradient(circle_at_55%_78%,rgba(234,67,53,0.12),transparent_50%)]" />
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none lg:hidden" />
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none" />

        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12 lg:pt-32 lg:pb-20"
        >
          <div className="grid grid-cols-1 items-center">
            {/* Left column - Text content */}
            <div className="order-2 lg:order-1 text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="space-y-6"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl"
                >
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: googleColors.blue }} />
                    <div className="w-2 h-2 rounded-full" style={{ background: googleColors.red }} />
                    <div className="w-2 h-2 rounded-full" style={{ background: googleColors.yellow }} />
                    <div className="w-2 h-2 rounded-full" style={{ background: googleColors.green }} />
                  </div>
                  <span className="text-sm font-medium text-white/80">
                    Google Ads Specialist
                  </span>
                </motion.div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">
                  <span className="block leading-tight text-balance">Контекстная реклама</span>
                  <span className="block mt-3 leading-tight pb-1">
                    <span style={{ color: googleColors.blue }}>G</span>
                    <span style={{ color: googleColors.red }}>o</span>
                    <span style={{ color: googleColors.yellow }}>o</span>
                    <span style={{ color: googleColors.blue }}>g</span>
                    <span style={{ color: googleColors.green }}>l</span>
                    <span style={{ color: googleColors.red }}>e</span>
                    <span className="text-foreground"> Ads</span>
                  </span>
                </h1>

                <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 text-balance">
                  Настрою Google Ads, который приносит клиентов, а не просто тратит бюджет. 
                  Поиск, Shopping, Performance Max.
                </p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-2"
                >
                  <Button
                    size="lg"
                    onClick={scrollToContact}
                    className="bg-[#4285f4] hover:bg-[#4285f4]/90 transition-all group relative overflow-hidden shadow-2xl shadow-[#4285f4]/30 h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                    <span className="relative">Получить аудит кампаний</span>
                    <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </motion.div>

                {/* Stats row */}
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="grid grid-cols-3 gap-3 sm:gap-4 pt-8 max-w-md mx-auto lg:mx-0"
                >
                  {[
                    { value: 1.5, suffix: 'M+', label: 'бюджета', color: googleColors.blue },
                    { value: 300, suffix: 'K+', label: 'кликов', color: googleColors.green },
                    { value: 200, suffix: '+', label: 'кампаний', color: googleColors.yellow },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      whileHover={{ scale: 1.05, y: -5 }}
                      className="text-center p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl"
                    >
                      <div className="text-lg sm:text-2xl font-bold" style={{ color: stat.color }}>
                        ${stat.value}{stat.suffix}
                      </div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">{stat.label}</div>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            </div>

          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 hidden sm:block"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-[#4285f4]/30 flex justify-center pt-2"
          >
            <motion.div
              animate={{ y: [0, 8, 0], opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-[#4285f4]"
            />
          </motion.div>
        </motion.div>
      </section>

      {/* Pain Points Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <GradientOrbs variant="digital" />
        <AnimatedGrid variant="digital" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-400">Проблема</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">
              Почему Google Ads сливает бюджет?
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {painPoints.map((point, index) => (
              <TiltCard key={index}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className={`h-full p-6 rounded-2xl bg-gradient-to-br ${point.color} border ${point.borderColor} backdrop-blur-xl`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center mb-5">
                    <point.icon className="w-7 h-7 text-red-400" />
                  </div>
                  <h3 className="text-xl font-semibold [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden mb-3">{point.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{point.description}</p>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* How I Work Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4285f4]/10 border border-[#4285f4]/20 mb-6">
              <Sparkles className="w-4 h-4 text-[#4285f4]" />
              <span className="text-sm text-[#4285f4]">Процесс</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">
              Как я работаю
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {workSteps.map((step, index) => {
              const stepColor = googleColors[step.color as keyof typeof googleColors];
              return (
                <TiltCard key={index}>
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="h-full p-6 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl group hover:border-[#4285f4]/50 transition-all"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-4xl font-bold" style={{ color: `${stepColor}30` }}>
                        {step.number}
                      </span>
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: `${stepColor}20` }}
                      >
                        <step.icon className="w-6 h-6" style={{ color: stepColor }} />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-2 [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">{step.title}</h3>
                    <p className="text-muted-foreground text-sm">{step.description}</p>
                  </motion.div>
                </TiltCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cases Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <GradientOrbs variant="digital" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#34a853]/10 border border-[#34a853]/20 mb-6">
              <TrendingUp className="w-4 h-4 text-[#34a853]" />
              <span className="text-sm text-[#34a853]">Кейсы</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">
              Результаты клиентов
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {casesData.map((caseItem, index) => (
              <TiltCard key={index}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className="h-full p-6 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-semibold [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">{caseItem.title}</h3>
                    <span className="px-3 py-1 text-xs rounded-full bg-[#4285f4]/10 text-[#4285f4]">
                      {caseItem.category}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {caseItem.stats.map((stat, i) => (
                      <div key={i} className="text-center">
                        <div className={`text-xl font-bold ${stat.color}`}>
                          <AnimatedCounter value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">{caseItem.description}</p>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#34a853]/10 border border-[#34a853]/20 mb-6">
              <Shield className="w-4 h-4 text-[#34a853]" />
              <span className="text-sm text-[#34a853]">Что входит</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">
              В работу со мной входит
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3 p-4 rounded-xl bg-card/40 border border-border/30 backdrop-blur-sm"
              >
                <CheckCircle2 className="w-5 h-5 text-[#34a853] shrink-0" />
                <span className="text-sm">{benefit}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contact" className="py-20 md:py-32 relative overflow-hidden">
        <GradientOrbs variant="digital" />
        <AnimatedGrid variant="digital" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Text content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4285f4]/10 border border-[#4285f4]/20 mb-6">
                <Sparkles className="w-4 h-4 text-[#4285f4]" />
                <span className="text-sm text-[#4285f4]">Бесплатно</span>
              </div>
              
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">
                Получите бесплатный{' '}
                <span className="block mt-2">
                  <span style={{ color: googleColors.blue }}>а</span>
                  <span style={{ color: googleColors.red }}>у</span>
                  <span style={{ color: googleColors.yellow }}>д</span>
                  <span style={{ color: googleColors.blue }}>и</span>
                  <span style={{ color: googleColors.green }}>т</span>
                  <span className="text-foreground"> кампаний</span>
                </span>
              </h2>
              
              <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto lg:mx-0 text-balance">
                Разберу ваши текущие кампании и покажу точки роста. 
                Найду, где сливается бюджет и как это исправить.
              </p>
              
              <div className="space-y-4 max-w-md mx-auto lg:mx-0">
                {[
                  'Анализ структуры кампаний',
                  'Проверка Quality Score',
                  'Аудит минус-слов и ключевых фраз',
                  'Рекомендации по оптимизации',
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div 
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: Object.values(googleColors)[i % 4] }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-foreground">{item}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            {/* Right - Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <LandingForm service="google-ads" />
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default GoogleAdsPage;
