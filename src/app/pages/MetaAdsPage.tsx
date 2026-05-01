import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform, useScroll } from 'motion/react';
import {
  Target,
  Zap,
  BarChart3,
  TrendingUp,
  Sparkles,
  Users,
  Eye,
  MousePointer,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  LineChart,
  Rocket,
  Shield,
  Instagram,
  Facebook,
  Play,
  PieChart,
  Activity,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import CosmicWhale from '../components/CosmicWhale';
import InteractiveBackground from '../components/InteractiveBackground';
import SectionBackground from '../components/SectionBackground';

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

// 3D Floating Card with tilt effect
const TiltCard = memo(({ children, className = '', glowColor = 'rgba(225, 48, 108, 0.15)' }: { children: React.ReactNode; className?: string; glowColor?: string }) => {
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
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;
    rotateX.set((-mouseY / rect.height) * 15);
    rotateY.set((mouseX / rect.width) * 15);
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

// Floating 3D element for Meta branding
const MetaFloatingOrb = memo(() => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Instagram gradient orb */}
      <motion.div
        className="absolute top-20 right-10 w-32 h-32 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(225, 48, 108, 0.4) 0%, rgba(131, 58, 180, 0.2) 50%, transparent 70%)',
          filter: 'blur(20px)',
        }}
        animate={{
          y: [0, -20, 0],
          x: [0, 10, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Facebook blue orb */}
      <motion.div
        className="absolute bottom-40 left-20 w-24 h-24 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(64, 93, 230, 0.4) 0%, rgba(64, 93, 230, 0.1) 50%, transparent 70%)',
          filter: 'blur(15px)',
        }}
        animate={{
          y: [0, 15, 0],
          x: [0, -8, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      {/* Purple accent orb */}
      <motion.div
        className="absolute top-1/2 right-1/4 w-20 h-20 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(131, 58, 180, 0.3) 0%, transparent 60%)',
          filter: 'blur(12px)',
        }}
        animate={{
          y: [0, -25, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
    </div>
  );
});
MetaFloatingOrb.displayName = 'MetaFloatingOrb';

// Pain points data
const painPoints = [
  {
    icon: AlertTriangle,
    title: 'Оффер не цепляет ЦА',
    description: 'Выгода сформулирована без учёта болей аудитории. Клиенты скроллят мимо.',
    color: 'from-red-500/20 to-orange-500/20',
    borderColor: 'border-red-500/30',
    iconBg: 'bg-red-500/20',
    iconColor: 'text-red-400',
  },
  {
    icon: Eye,
    title: 'Креативы не останавливают скролл',
    description: 'Шаблонные объявления теряются в ленте среди конкурентов.',
    color: 'from-orange-500/20 to-yellow-500/20',
    borderColor: 'border-orange-500/30',
    iconBg: 'bg-orange-500/20',
    iconColor: 'text-orange-400',
  },
  {
    icon: LineChart,
    title: 'Нет сквозной аналитики',
    description: 'Вы не знаете, какой канал приносит реальные продажи.',
    color: 'from-yellow-500/20 to-amber-500/20',
    borderColor: 'border-yellow-500/30',
    iconBg: 'bg-yellow-500/20',
    iconColor: 'text-yellow-400',
  },
];

// Work steps data
const workSteps = [
  {
    number: '01',
    title: 'Аудит ниши и кастдев',
    description: 'Изучаю аудиторию, конкурентов и продукт, чтобы создать попадающий в боль оффер.',
    icon: Target,
    gradient: 'from-[#E1306C] to-[#833AB4]',
  },
  {
    number: '02',
    title: 'Тестирование креативов',
    description: 'Запускаю 3-5 гипотез на холодную аудиторию через Reels, Stories и ленту.',
    icon: Layers,
    gradient: 'from-[#833AB4] to-[#405DE6]',
  },
  {
    number: '03',
    title: 'Настройка аналитики',
    description: 'Подключаю GA4, GTM, Meta CAPI. Вы видите, откуда приходят деньги.',
    icon: BarChart3,
    gradient: 'from-[#405DE6] to-[#5851DB]',
  },
  {
    number: '04',
    title: 'Масштабирование',
    description: 'Оставляю только работающие связки, снижаю CPL, увеличиваю бюджет.',
    icon: Rocket,
    gradient: 'from-[#5851DB] to-[#E1306C]',
  },
];

// Cases data
const casesData = [
  {
    title: 'E-commerce',
    category: 'Meta Ads',
    stats: [
      { label: 'CPA до', value: 31, prefix: '$', color: 'text-red-400' },
      { label: 'CPA после', value: 18, prefix: '$', color: 'text-green-400' },
      { label: 'Качество лидов', value: 59, suffix: '%', color: 'text-[#E1306C]' },
    ],
    description: 'Снизили CPA с $31 до $18 за 5 недель. Доля качественных лидов выросла до 59%.',
    gradient: 'from-[#E1306C]/10 to-[#833AB4]/10',
  },
  {
    title: 'B2C Услуги',
    category: 'Meta Ads',
    stats: [
      { label: 'CPL', value: 12, prefix: '$', color: 'text-[#E1306C]' },
      { label: 'Лидов/нед', value: 85, suffix: '+', color: 'text-[#833AB4]' },
      { label: 'Конверсия', value: 24, suffix: '%', color: 'text-[#405DE6]' },
    ],
    description: 'Настроили поток заявок на консультации. Стабильный рост качественных лидов.',
    gradient: 'from-[#833AB4]/10 to-[#405DE6]/10',
  },
  {
    title: 'Инфобизнес',
    category: 'Reels + Бот',
    stats: [
      { label: 'Регистрации', value: 3500, suffix: '+', color: 'text-[#E1306C]' },
      { label: 'Снижение CPR', value: 42, suffix: '%', color: 'text-green-400' },
      { label: 'ROI', value: 180, suffix: '%', color: 'text-[#833AB4]' },
    ],
    description: 'Масштабировали воронку через Reels + бот. Стоимость регистрации снизилась на 42%.',
    gradient: 'from-[#405DE6]/10 to-[#E1306C]/10',
  },
];

// Benefits data
const benefits = [
  { text: 'Полная настройка рекламного кабинета', icon: Shield },
  { text: '10+ креативов в месяц', icon: Play },
  { text: 'Еженедельные отчёты', icon: PieChart },
  { text: 'Интеграция с CRM', icon: Activity },
  { text: 'Оптимизация под ROAS', icon: TrendingUp },
  { text: 'Защита от блокировок', icon: Shield },
];

// Unique section background component for Meta
const MetaSectionBackground = memo(({ variant }: { variant: 'gradient' | 'mesh' | 'glow' }) => {
  if (variant === 'gradient') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
        <motion.div
          className="absolute -top-1/2 -left-1/4 w-full h-full rounded-full"
          style={{
            background: 'radial-gradient(ellipse, rgba(225, 48, 108, 0.08) 0%, transparent 60%)',
          }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute -bottom-1/2 -right-1/4 w-full h-full rounded-full"
          style={{
            background: 'radial-gradient(ellipse, rgba(64, 93, 230, 0.08) 0%, transparent 60%)',
          }}
          animate={{ rotate: [360, 0] }}
          transition={{ duration: 50, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }
  
  if (variant === 'mesh') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 30%, rgba(225, 48, 108, 0.1) 0%, transparent 40%),
              radial-gradient(circle at 80% 70%, rgba(131, 58, 180, 0.1) 0%, transparent 40%),
              radial-gradient(circle at 50% 50%, rgba(64, 93, 230, 0.05) 0%, transparent 50%)
            `,
          }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(225, 48, 108, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(225, 48, 108, 0.03) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
          animate={{ backgroundPosition: ['0px 0px', '50px 50px'] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(225, 48, 108, 0.15) 0%, transparent 60%)',
          filter: 'blur(60px)',
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(64, 93, 230, 0.15) 0%, transparent 60%)',
          filter: 'blur(50px)',
        }}
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.6, 0.4, 0.6],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
    </div>
  );
});
MetaSectionBackground.displayName = 'MetaSectionBackground';

function MetaAdsPage() {
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
        title="Платный трафик из Meta Ads (Facebook/Instagram)"
        description="Стабильные заявки из Facebook и Instagram без слива бюджета. Настрою рекламу по системе: кастдев, оффер, креативы, трекинг."
        url="/meta-ads"
      />
      <Navbar />

      {/* Hero Section with Cosmic Whale */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center overflow-hidden"
      >
        {/* Background effects */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1f] via-background to-background" />
          <InteractiveBackground variant="cosmic" particleCount={40} />
          <MetaFloatingOrb />
        </div>

        {/* Gradient Overlay for mobile */}
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#E1306C]/20 to-[#405DE6]/20 border border-[#E1306C]/30 backdrop-blur-xl"
                >
                  <Instagram className="w-4 h-4 text-[#E1306C]" />
                  <div className="w-px h-4 bg-white/20" />
                  <Facebook className="w-4 h-4 text-[#405DE6]" />
                  <span className="text-sm font-medium bg-gradient-to-r from-[#E1306C] to-[#405DE6] bg-clip-text text-transparent">
                    Meta Ads Expert
                  </span>
                </motion.div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tight">
                  <span className="block text-foreground text-balance">Стабильные заявки из</span>
                  <span className="block mt-2 bg-gradient-to-r from-[#E1306C] via-[#833AB4] to-[#405DE6] bg-clip-text text-transparent">
                    Facebook и Instagram
                  </span>
                </h1>

                <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 text-pretty">
                  Настрою рекламу по системе: кастдев, оффер, креативы, трекинг. 
                  Вы получаете целевые лиды, а не просто клики.
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
                    className="bg-gradient-to-r from-[#E1306C] to-[#405DE6] hover:opacity-90 transition-all group relative overflow-hidden shadow-2xl shadow-[#E1306C]/30 h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-medium"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                    <span className="relative">Получить аудит рекламы</span>
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
                    { value: 2, suffix: 'M+', label: 'бюджета', color: '#E1306C' },
                    { value: 500, suffix: 'K+', label: 'лидов', color: '#833AB4' },
                    { value: 150, suffix: '+', label: 'кейсов', color: '#405DE6' },
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

            {/* Right column - Cosmic Whale (Desktop only) */}
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
            className="w-6 h-10 rounded-full border-2 border-[#E1306C]/30 flex justify-center pt-2"
          >
            <motion.div
              animate={{ y: [0, 8, 0], opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-[#E1306C]"
            />
          </motion.div>
        </motion.div>
      </section>

      {/* Pain Points Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <MetaSectionBackground variant="gradient" />
        
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
              Почему Meta Ads не даёт результат?
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto text-pretty">
              Большинство рекламодателей совершают одни и те же ошибки, которые съедают бюджет
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {painPoints.map((point, index) => (
              <TiltCard key={index} glowColor="rgba(239, 68, 68, 0.15)">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className={`h-full p-6 md:p-8 rounded-2xl bg-gradient-to-br ${point.color} border ${point.borderColor} backdrop-blur-xl`}
                >
                  <div className={`w-14 h-14 rounded-2xl ${point.iconBg} flex items-center justify-center mb-5`}>
                    <point.icon className={`w-7 h-7 ${point.iconColor}`} />
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
        <MetaSectionBackground variant="mesh" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#E1306C]/10 border border-[#E1306C]/20 mb-6">
              <Sparkles className="w-4 h-4 text-[#E1306C]" />
              <span className="text-sm text-[#E1306C] font-medium">Процесс</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground text-balance">
              Моя система работы
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto text-pretty">
              Чёткий процесс из 4 шагов, который приносит результат
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {workSteps.map((step, index) => (
              <TiltCard key={index} glowColor="rgba(225, 48, 108, 0.15)">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="h-full p-6 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl group hover:border-[#E1306C]/30 transition-all"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span className={`text-4xl font-bold bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent opacity-50`}>
                      {step.number}
                    </span>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${step.gradient} p-[1px]`}>
                      <div className="w-full h-full rounded-xl bg-card flex items-center justify-center">
                        <step.icon className="w-6 h-6 text-[#E1306C]" />
                      </div>
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
        <MetaSectionBackground variant="glow" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#833AB4]/10 border border-[#833AB4]/20 mb-6">
              <TrendingUp className="w-4 h-4 text-[#833AB4]" />
              <span className="text-sm text-[#833AB4] font-medium">Кейсы</span>
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
              <TiltCard key={index} glowColor="rgba(131, 58, 180, 0.15)">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className={`h-full p-6 rounded-2xl bg-gradient-to-br ${caseItem.gradient} border border-border/50 backdrop-blur-xl`}
                >
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-semibold text-foreground">{caseItem.title}</h3>
                    <span className="px-3 py-1 text-xs rounded-full bg-[#E1306C]/10 text-[#E1306C] font-medium">
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
        <SectionBackground variant="particles" color="meta" intensity="low" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-400 font-medium">Что входит</span>
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
                className="flex items-center gap-3 p-4 rounded-xl bg-card/40 border border-border/30 backdrop-blur-sm hover:border-[#E1306C]/30 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-[#E1306C]/20 to-[#405DE6]/20 flex items-center justify-center shrink-0">
                  <benefit.icon className="w-5 h-5 text-[#E1306C]" />
                </div>
                <span className="text-sm text-foreground font-medium">{benefit.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contact" className="py-20 md:py-32 relative overflow-hidden">
        <SectionBackground variant="cosmic-dust" color="meta" intensity="high" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Mobile: Form first on mobile for better conversion */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="lg:hidden"
            >
              <LandingForm 
                service="meta-ads" 
                title="Узнайте стоимость клиентов"
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
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#E1306C]/10 border border-[#E1306C]/20 mb-6">
                <Sparkles className="w-4 h-4 text-[#E1306C]" />
                <span className="text-sm text-[#E1306C] font-medium">Бесплатно</span>
              </div>
              
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-foreground text-balance">
                Получите бесплатный{' '}
                <span className="bg-gradient-to-r from-[#E1306C] via-[#833AB4] to-[#405DE6] bg-clip-text text-transparent">
                  аудит рекламы
                </span>
              </h2>
              
              <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto lg:mx-0 text-pretty">
                Разберу вашу текущую рекламу и покажу точки роста. 
                Без воды и общих фраз — только конкретика.
              </p>
              
              <div className="space-y-4 max-w-md mx-auto lg:mx-0">
                {[
                  'Анализ рекламного кабинета',
                  'Оценка креативов и офферов',
                  'Рекомендации по оптимизации',
                  'Прогноз результатов',
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#E1306C] to-[#405DE6] flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-foreground">{item}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            {/* Right - Form (Desktop only) */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="hidden lg:block"
            >
              <LandingForm 
                service="meta-ads" 
                title="Узнайте стоимость клиентов"
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

export default MetaAdsPage;
