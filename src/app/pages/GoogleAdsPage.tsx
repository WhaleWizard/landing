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
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Target,
  Rocket,
  Shield,
  DollarSign,
  PieChart,
  Layers,
  Settings,
  Globe,
  Monitor,
  MousePointer,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import CosmicWhale from '../components/CosmicWhale';
import InteractiveBackground, { GradientOrbs, AnimatedGrid } from '../components/InteractiveBackground';

// Google brand colors
const googleColors = {
  blue: '#4285f4',
  red: '#ea4335',
  yellow: '#fbbc04',
  green: '#34a853',
};

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

// 3D Tilt Card with Google glow
const TiltCard = memo(({ children, className = '', glowColor = 'rgba(66, 133, 244, 0.15)' }: { children: React.ReactNode; className?: string; glowColor?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });
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
    setMousePosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
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
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: `radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, ${glowColor}, transparent 50%)`,
          }}
        />
      )}
    </motion.div>
  );
});
TiltCard.displayName = 'TiltCard';

// Google floating elements with brand colors
const GoogleFloatingElements = memo(() => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Google Blue orb */}
      <motion.div
        className="absolute top-20 right-20 w-40 h-40 rounded-full"
        style={{
          background: `radial-gradient(circle, ${googleColors.blue}40 0%, ${googleColors.blue}10 50%, transparent 70%)`,
          filter: 'blur(25px)',
        }}
        animate={{
          y: [0, -30, 0],
          x: [0, 15, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Google Red orb */}
      <motion.div
        className="absolute bottom-32 left-16 w-32 h-32 rounded-full"
        style={{
          background: `radial-gradient(circle, ${googleColors.red}35 0%, ${googleColors.red}10 50%, transparent 70%)`,
          filter: 'blur(20px)',
        }}
        animate={{
          y: [0, 20, 0],
          x: [0, -10, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      {/* Google Yellow orb */}
      <motion.div
        className="absolute top-1/3 left-1/4 w-24 h-24 rounded-full"
        style={{
          background: `radial-gradient(circle, ${googleColors.yellow}40 0%, ${googleColors.yellow}10 50%, transparent 70%)`,
          filter: 'blur(18px)',
        }}
        animate={{
          y: [0, -20, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      {/* Google Green orb */}
      <motion.div
        className="absolute bottom-1/4 right-1/3 w-28 h-28 rounded-full"
        style={{
          background: `radial-gradient(circle, ${googleColors.green}35 0%, ${googleColors.green}10 50%, transparent 70%)`,
          filter: 'blur(22px)',
        }}
        animate={{
          y: [0, 25, 0],
          x: [0, -15, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
    </div>
  );
});
GoogleFloatingElements.displayName = 'GoogleFloatingElements';

// Google-styled section background
const GoogleSectionBackground = memo(({ variant }: { variant: 'grid' | 'gradient' | 'data' }) => {
  if (variant === 'grid') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(${googleColors.blue}08 1px, transparent 1px),
              linear-gradient(90deg, ${googleColors.blue}08 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
          animate={{ backgroundPosition: ['0px 0px', '40px 40px'] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        />
        {/* Center glow */}
        <div 
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 0%, var(--background) 70%)`,
          }}
        />
      </div>
    );
  }
  
  if (variant === 'gradient') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-1/2 -right-1/4 w-[80%] h-[80%] rounded-full"
          style={{
            background: `radial-gradient(ellipse, ${googleColors.blue}12 0%, transparent 60%)`,
          }}
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.7, 0.5],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-1/4 -left-1/4 w-[60%] h-[60%] rounded-full"
          style={{
            background: `radial-gradient(ellipse, ${googleColors.green}10 0%, transparent 50%)`,
          }}
          animate={{ 
            scale: [1.1, 1, 1.1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>
    );
  }

  // Data visualization style background
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Animated data points */}
      {Array.from({ length: 15 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 6 + 2,
            height: Math.random() * 6 + 2,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            background: [googleColors.blue, googleColors.red, googleColors.yellow, googleColors.green][i % 4],
          }}
          animate={{
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: 'easeInOut',
          }}
        />
      ))}
      {/* Connecting lines */}
      <svg className="absolute inset-0 w-full h-full opacity-10">
        <motion.path
          d="M 0 50% Q 25% 30%, 50% 50% T 100% 50%"
          stroke={googleColors.blue}
          strokeWidth="1"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.3 }}
          transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
        />
      </svg>
    </div>
  );
});
GoogleSectionBackground.displayName = 'GoogleSectionBackground';

// Pain points data
const painPoints = [
  {
    icon: DollarSign,
    title: 'Высокая цена клика',
    description: 'Бюджет сливается на нецелевые запросы без конверсий. Каждый доллар уходит впустую.',
    color: googleColors.red,
  },
  {
    icon: Settings,
    title: 'Неправильная структура',
    description: 'Хаотичные кампании без логической группировки снижают Quality Score.',
    color: googleColors.yellow,
  },
  {
    icon: Target,
    title: 'Нет минус-слов',
    description: 'Показы по нерелевантным запросам съедают бюджет без результата.',
    color: googleColors.blue,
  },
];

// Work steps data
const workSteps = [
  {
    number: '01',
    title: 'Анализ ниши',
    description: 'Изучаю спрос, конкурентов и собираю семантическое ядро. Отделяю горячие запросы от информационных.',
    icon: Search,
    color: googleColors.blue,
  },
  {
    number: '02',
    title: 'Структура кампаний',
    description: 'Выстраиваю логичную структуру: Поиск, Performance Max, Ремаркетинг.',
    icon: Layers,
    color: googleColors.green,
  },
  {
    number: '03',
    title: 'Настройка трекинга',
    description: 'GTM, GA4, конверсии, интеграция с CRM. Вы видите весь путь клиента.',
    icon: BarChart3,
    color: googleColors.yellow,
  },
  {
    number: '04',
    title: 'Оптимизация',
    description: 'Снижаю CPC, повышаю Quality Score, масштабирую работающие кампании.',
    icon: Rocket,
    color: googleColors.red,
  },
];

// Cases data
const casesData = [
  {
    title: 'B2B SaaS',
    category: 'Search + PMax',
    stats: [
      { label: 'CPC до', value: 8, prefix: '$', color: `text-[${googleColors.red}]` },
      { label: 'CPC после', value: 3, prefix: '$', color: `text-[${googleColors.green}]` },
      { label: 'Конверсии', value: 156, suffix: '%', color: `text-[${googleColors.blue}]` },
    ],
    description: 'Снизили стоимость клика с $8 до $3 за месяц работы. Рост конверсий на 156%.',
  },
  {
    title: 'E-commerce',
    category: 'Shopping',
    stats: [
      { label: 'ROAS', value: 580, suffix: '%', color: `text-[${googleColors.green}]` },
      { label: 'Продажи', value: 2400, suffix: '+', color: `text-[${googleColors.blue}]` },
      { label: 'CAC', value: 35, suffix: '%', color: `text-[${googleColors.yellow}]` },
    ],
    description: 'ROAS 580% на Performance Max. Снижение стоимости привлечения на 35%.',
  },
  {
    title: 'Локальный бизнес',
    category: 'Local Ads',
    stats: [
      { label: 'Лидов/мес', value: 120, suffix: '+', color: `text-[${googleColors.blue}]` },
      { label: 'CPL', value: 15, prefix: '$', color: `text-[${googleColors.green}]` },
      { label: 'CTR', value: 12, suffix: '%', color: `text-[${googleColors.yellow}]` },
    ],
    description: 'Стабильный поток заявок для локального сервиса с высоким CTR.',
  },
];

// Benefits data
const benefits = [
  { text: 'Полный аудит текущих кампаний', icon: Search },
  { text: 'Сбор семантического ядра', icon: Globe },
  { text: 'Настройка конверсий GA4', icon: BarChart3 },
  { text: 'Ежемесячные отчёты', icon: PieChart },
  { text: 'Оптимизация Quality Score', icon: TrendingUp },
  { text: 'A/B тесты объявлений', icon: MousePointer },
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
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden font-sans">
      <SEO
        title="Контекстная реклама Google Ads"
        description="Настрою Google Ads, который приносит клиентов, а не просто тратит бюджет. Поиск, Shopping, Performance Max."
        url="/google-ads"
      />
      <Navbar />

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center overflow-hidden"
      >
        {/* Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-background to-background" />
          <InteractiveBackground variant="digital" particleCount={40} />
          <GoogleFloatingElements />
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none" />

        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12 lg:pt-32 lg:pb-20"
        >
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Mobile: Animation first */}
            <div className="lg:hidden relative h-[300px] sm:h-[350px]">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1 }}
                className="w-full h-full"
              >
                <CosmicWhale className="w-full h-full" />
              </motion.div>
            </div>

            {/* Left column - Text content */}
            <div className="text-center lg:text-left">
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
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: googleColors.blue }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: googleColors.red }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: googleColors.yellow }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: googleColors.green }} />
                  </div>
                  <span className="text-sm font-medium text-white/80">
                    Google Ads Specialist
                  </span>
                </motion.div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tight">
                  <span className="block text-foreground text-balance">Контекстная реклама</span>
                  <span className="block mt-2">
                    <span style={{ color: googleColors.blue }}>G</span>
                    <span style={{ color: googleColors.red }}>o</span>
                    <span style={{ color: googleColors.yellow }}>o</span>
                    <span style={{ color: googleColors.blue }}>g</span>
                    <span style={{ color: googleColors.green }}>l</span>
                    <span style={{ color: googleColors.red }}>e</span>
                    <span className="text-foreground"> Ads</span>
                  </span>
                </h1>

                <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 text-pretty">
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
                    className="transition-all group relative overflow-hidden shadow-2xl h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-medium"
                    style={{ 
                      background: googleColors.blue,
                      boxShadow: `0 20px 40px ${googleColors.blue}40`
                    }}
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

            {/* Right column - Cosmic Whale (Desktop) */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.3 }}
              className="hidden lg:block relative h-[500px] xl:h-[600px]"
            >
              <CosmicWhale className="w-full h-full" />
            </motion.div>
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
            className="w-6 h-10 rounded-full border-2 flex justify-center pt-2"
            style={{ borderColor: `${googleColors.blue}50` }}
          >
            <motion.div
              animate={{ y: [0, 8, 0], opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: googleColors.blue }}
            />
          </motion.div>
        </motion.div>
      </section>

      {/* Pain Points Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <GoogleSectionBackground variant="gradient" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-400 font-medium">Проблема</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground text-balance">
              Почему Google Ads сливает бюджет?
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto text-pretty">
              Типичные ошибки, которые приводят к неэффективной трате рекламного бюджета
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {painPoints.map((point, index) => (
              <TiltCard key={index} glowColor={`${point.color}25`}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className="h-full p-6 md:p-8 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl"
                  style={{ borderColor: `${point.color}30` }}
                >
                  <div 
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                    style={{ background: `${point.color}20` }}
                  >
                    <point.icon className="w-7 h-7" style={{ color: point.color }} />
                  </div>
                  <h3 className="text-xl font-semibold mb-3 text-foreground">{point.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{point.description}</p>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* How I Work Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <GoogleSectionBackground variant="grid" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
              style={{ background: `${googleColors.blue}15`, border: `1px solid ${googleColors.blue}30` }}
            >
              <Sparkles className="w-4 h-4" style={{ color: googleColors.blue }} />
              <span className="text-sm font-medium" style={{ color: googleColors.blue }}>Процесс</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground text-balance">
              Как я работаю
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto text-pretty">
              Системный подход к настройке Google Ads для максимального результата
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {workSteps.map((step, index) => (
              <TiltCard key={index} glowColor={`${step.color}20`}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="h-full p-6 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl group hover:border-opacity-50 transition-all"
                  style={{ ['--hover-color' as string]: step.color }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span 
                      className="text-4xl font-bold opacity-30"
                      style={{ color: step.color }}
                    >
                      {step.number}
                    </span>
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${step.color}20` }}
                    >
                      <step.icon className="w-6 h-6" style={{ color: step.color }} />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.description}</p>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Cases Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <GoogleSectionBackground variant="data" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
              style={{ background: `${googleColors.green}15`, border: `1px solid ${googleColors.green}30` }}
            >
              <TrendingUp className="w-4 h-4" style={{ color: googleColors.green }} />
              <span className="text-sm font-medium" style={{ color: googleColors.green }}>Кейсы</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground text-balance">
              Результаты клиентов
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto text-pretty">
              Реальные цифры из рекламных кабинетов моих клиентов
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {casesData.map((caseItem, index) => (
              <TiltCard key={index} glowColor={`${googleColors.blue}15`}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className="h-full p-6 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-semibold text-foreground">{caseItem.title}</h3>
                    <span 
                      className="px-3 py-1 text-xs rounded-full font-medium"
                      style={{ background: `${googleColors.blue}15`, color: googleColors.blue }}
                    >
                      {caseItem.category}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {caseItem.stats.map((stat, i) => (
                      <div key={i} className="text-center">
                        <div 
                          className="text-xl font-bold"
                          style={{ color: [googleColors.red, googleColors.green, googleColors.blue, googleColors.yellow][i % 4] }}
                        >
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
        <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
              style={{ background: `${googleColors.green}15`, border: `1px solid ${googleColors.green}30` }}
            >
              <CheckCircle2 className="w-4 h-4" style={{ color: googleColors.green }} />
              <span className="text-sm font-medium" style={{ color: googleColors.green }}>Что входит</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground text-balance">
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
                className="flex items-center gap-3 p-4 rounded-xl bg-card/40 border border-border/30 backdrop-blur-sm hover:border-[${googleColors.blue}]/30 transition-all"
              >
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${googleColors.blue}15` }}
                >
                  <benefit.icon className="w-5 h-5" style={{ color: googleColors.blue }} />
                </div>
                <span className="text-sm text-foreground font-medium">{benefit.text}</span>
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
            {/* Mobile: Form first */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="lg:hidden"
            >
              <LandingForm 
                service="google-ads" 
                title="Рассчитайте ROAS для вашей ниши"
                buttonText="Получить расчёт"
              />
            </motion.div>

            {/* Left - Text content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="text-center lg:text-left"
            >
              <div 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
                style={{ background: `${googleColors.blue}15`, border: `1px solid ${googleColors.blue}30` }}
              >
                <Sparkles className="w-4 h-4" style={{ color: googleColors.blue }} />
                <span className="text-sm font-medium" style={{ color: googleColors.blue }}>Бесплатно</span>
              </div>
              
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-foreground text-balance">
                Получите бесплатный{' '}
                <span>
                  <span style={{ color: googleColors.blue }}>а</span>
                  <span style={{ color: googleColors.red }}>у</span>
                  <span style={{ color: googleColors.yellow }}>д</span>
                  <span style={{ color: googleColors.blue }}>и</span>
                  <span style={{ color: googleColors.green }}>т</span>
                </span>
                {' '}кампаний
              </h2>
              
              <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto lg:mx-0 text-pretty">
                Разберу ваши текущие кампании и покажу точки роста. 
                Оценю потенциал ниши и прогнозирую результат.
              </p>
              
              <div className="space-y-4 max-w-md mx-auto lg:mx-0">
                {[
                  { text: 'Анализ структуры кампаний', color: googleColors.blue },
                  { text: 'Оценка семантического ядра', color: googleColors.red },
                  { text: 'Проверка настроек конверсий', color: googleColors.yellow },
                  { text: 'Прогноз ROAS для вашей ниши', color: googleColors.green },
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
                      style={{ background: item.color }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-foreground">{item.text}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            {/* Right - Form (Desktop) */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="hidden lg:block"
            >
              <LandingForm 
                service="google-ads" 
                title="Рассчитайте ROAS для вашей ниши"
                buttonText="Получить расчёт"
              />
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default GoogleAdsPage;
