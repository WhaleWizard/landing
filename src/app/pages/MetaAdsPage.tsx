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
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';

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
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;
    rotateX.set((-mouseY / rect.height) * 15);
    rotateY.set((mouseX / rect.width) * 15);
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
            background: 'radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(139, 92, 246, 0.15), transparent 50%)',
          }}
        />
      )}
    </motion.div>
  );
});
TiltCard.displayName = 'TiltCard';

// 3D Floating Element
const FloatingElement = memo(({ 
  children, 
  delay = 0, 
  duration = 4,
  x = 0,
  y = 20,
}: { 
  children: React.ReactNode; 
  delay?: number;
  duration?: number;
  x?: number;
  y?: number;
}) => (
  <motion.div
    animate={{
      y: [0, -y, 0],
      x: [0, x, 0],
      rotateZ: [0, 2, 0, -2, 0],
    }}
    transition={{
      duration,
      repeat: Infinity,
      delay,
      ease: 'easeInOut',
    }}
  >
    {children}
  </motion.div>
));
FloatingElement.displayName = 'FloatingElement';

// Pain points data
const painPoints = [
  {
    icon: AlertTriangle,
    title: 'Оффер не цепляет ЦА',
    description: 'Выгода сформулирована без учёта болей аудитории. Конкуренты забирают ваших клиентов.',
    color: 'from-red-500/20 to-orange-500/20',
    borderColor: 'border-red-500/30',
  },
  {
    icon: Eye,
    title: 'Креативы не останавливают скролл',
    description: 'Шаблонные объявления теряются в ленте. Пользователи пролистывают вашу рекламу.',
    color: 'from-orange-500/20 to-yellow-500/20',
    borderColor: 'border-orange-500/30',
  },
  {
    icon: LineChart,
    title: 'Нет сквозной аналитики',
    description: 'Вы не знаете, какой канал реально приносит продажи. Бюджет уходит в пустоту.',
    color: 'from-yellow-500/20 to-amber-500/20',
    borderColor: 'border-yellow-500/30',
  },
];

// Work steps data
const workSteps = [
  {
    number: '01',
    title: 'Аудит ниши и кастдев',
    description: 'Изучаю аудиторию, конкурентов и продукт, чтобы создать попадающий в боль оффер.',
    icon: Target,
    color: 'primary',
  },
  {
    number: '02',
    title: 'Создание и тестирование креативов',
    description: 'Запускаю 3-5 гипотез на холодную аудиторию через Reels, Stories и ленту.',
    icon: Layers,
    color: 'accent',
  },
  {
    number: '03',
    title: 'Настройка аналитики',
    description: 'Подключаю GA4, GTM, Meta CAPI, настраиваю сквозную аналитику. Вы видите, откуда приходят деньги.',
    icon: BarChart3,
    color: 'secondary',
  },
  {
    number: '04',
    title: 'Оптимизация и масштабирование',
    description: 'Оставляю только работающие связки, снижаю CPL, масштабирую бюджет.',
    icon: Rocket,
    color: 'primary',
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
      { label: 'Качество лидов', value: 59, suffix: '%', color: 'text-primary' },
    ],
    description: 'Снизили CPA в Meta Ads с $31 до $18 за 5 недель. Доля качественных лидов выросла до 59%.',
  },
  {
    title: 'B2C Услуги',
    category: 'Meta Ads',
    stats: [
      { label: 'CPL', value: 12, prefix: '$', color: 'text-primary' },
      { label: 'Лидов/нед', value: 85, suffix: '+', color: 'text-accent' },
      { label: 'Конверсия', value: 24, suffix: '%', color: 'text-secondary' },
    ],
    description: 'Настроили поток заявок на консультации для B2C-сервиса. Стабильный поток качественных лидов.',
  },
  {
    title: 'Инфобизнес',
    category: 'Reels + Бот',
    stats: [
      { label: 'Регистрации', value: 3500, suffix: '+', color: 'text-primary' },
      { label: 'Снижение CPR', value: 42, suffix: '%', color: 'text-green-400' },
      { label: 'ROI', value: 180, suffix: '%', color: 'text-accent' },
    ],
    description: 'Масштабировали воронку через Reels + бот. Стоимость регистрации на вебинар снизилась на 42%.',
  },
];

// Benefits data
const benefits = [
  'Полная настройка рекламного кабинета',
  '10+ креативов в месяц',
  'Еженедельные отчёты',
  'Интеграция с CRM',
  'Оптимизация под ROAS',
  'Защита от блокировок',
];

function MetaAdsPage() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.95]);

  // Mouse parallax for hero
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set((clientX - innerWidth / 2) / 50);
    mouseY.set((clientY - innerHeight / 2) / 50);
  }, [mouseX, mouseY]);

  const scrollToContact = useCallback(() => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <SEO
        title="Платный трафик из Meta Ads (Facebook/Instagram)"
        description="Стабильные заявки из Facebook и Instagram без слива бюджета. Настрою рекламу по системе: кастдев, оффер, креативы, трекинг. $2M+ бюджета в управлении."
        url="/meta-ads"
      />
      <Navbar />

      {/* Hero Section with parallax */}
      <section
        ref={heroRef}
        onMouseMove={handleMouseMove}
        className="relative min-h-screen flex items-center justify-center pt-20 pb-16 overflow-hidden"
      >
        {/* Animated background */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            style={{ x: springX, y: springY }}
            className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[150px]"
          />
          <motion.div
            style={{ x: useTransform(springX, v => -v * 1.5), y: useTransform(springY, v => -v * 1.5) }}
            className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/15 rounded-full blur-[150px]"
          />
          <motion.div
            style={{ x: useTransform(springX, v => v * 0.5), y: useTransform(springY, v => v * 0.5) }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[120px]"
          />
        </div>

        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#E1306C]/20 to-[#405DE6]/20 border border-[#E1306C]/30 backdrop-blur-sm"
              >
                <div className="w-2 h-2 rounded-full bg-[#E1306C] animate-pulse" />
                <span className="text-sm font-medium bg-gradient-to-r from-[#E1306C] to-[#405DE6] bg-clip-text text-transparent">
                  Meta Ads Expert
                </span>
              </motion.div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                Стабильные заявки из{' '}
                <span className="bg-gradient-to-r from-[#E1306C] via-[#833AB4] to-[#405DE6] bg-clip-text text-transparent">
                  Facebook и Instagram
                </span>{' '}
                без слива бюджета
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                Настрою рекламу по системе: кастдев → оффер → креативы → трекинг. 
                Вы получаете целевые лиды, а не просто клики.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    size="lg"
                    onClick={scrollToContact}
                    className="bg-gradient-to-r from-[#E1306C] to-[#405DE6] hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-[#E1306C]/30 h-14 px-8 text-base"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                    <span className="relative">Получить аудит текущей рекламы</span>
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </motion.div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4 pt-8">
                {[
                  { value: 2, suffix: 'M+', label: 'бюджета' },
                  { value: 500, suffix: 'K+', label: 'лидов' },
                  { value: 150, suffix: '+', label: 'кейсов' },
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="text-center p-4 rounded-2xl bg-card/50 border border-border/50 backdrop-blur-sm"
                  >
                    <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      ${stat.value}{stat.suffix}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right side - 3D floating elements */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative h-[500px] hidden lg:block"
            >
              {/* Central Meta icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <FloatingElement duration={5}>
                  <div className="relative w-40 h-40">
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#E1306C] via-[#833AB4] to-[#405DE6] opacity-20 blur-2xl" />
                    <div className="relative w-full h-full rounded-3xl bg-gradient-to-br from-[#E1306C] via-[#833AB4] to-[#405DE6] p-[2px]">
                      <div className="w-full h-full rounded-3xl bg-card flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-20 h-20 fill-white">
                          <path d="M12 2.04c-5.5 0-9.96 4.46-9.96 9.96 0 5.5 4.46 9.96 9.96 9.96 5.5 0 9.96-4.46 9.96-9.96 0-5.5-4.46-9.96-9.96-9.96zm0 1.8c4.5 0 8.16 3.66 8.16 8.16 0 4.5-3.66 8.16-8.16 8.16-4.5 0-8.16-3.66-8.16-8.16 0-4.5 3.66-8.16 8.16-8.16z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </FloatingElement>
              </div>

              {/* Floating stat cards */}
              <FloatingElement delay={0.5} x={10} y={15}>
                <div className="absolute top-8 left-0 p-4 rounded-2xl bg-card/90 border border-primary/30 backdrop-blur-xl shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                      <MousePointer className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">CTR</div>
                      <div className="text-lg font-bold text-primary">4.2%</div>
                    </div>
                  </div>
                </div>
              </FloatingElement>

              <FloatingElement delay={1} x={-15} y={20}>
                <div className="absolute top-20 right-0 p-4 rounded-2xl bg-card/90 border border-accent/30 backdrop-blur-xl shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">ROAS</div>
                      <div className="text-lg font-bold text-accent">5.8x</div>
                    </div>
                  </div>
                </div>
              </FloatingElement>

              <FloatingElement delay={1.5} x={8} y={18}>
                <div className="absolute bottom-20 left-8 p-4 rounded-2xl bg-card/90 border border-secondary/30 backdrop-blur-xl shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                      <Users className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Охват</div>
                      <div className="text-lg font-bold text-secondary">2.1M</div>
                    </div>
                  </div>
                </div>
              </FloatingElement>

              <FloatingElement delay={2} x={-10} y={12}>
                <div className="absolute bottom-8 right-8 p-4 rounded-2xl bg-card/90 border border-green-500/30 backdrop-blur-xl shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">CPL</div>
                      <div className="text-lg font-bold text-green-500">-47%</div>
                    </div>
                  </div>
                </div>
              </FloatingElement>
            </motion.div>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-primary/30 flex justify-center pt-2"
          >
            <motion.div
              animate={{ y: [0, 8, 0], opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-primary"
            />
          </motion.div>
        </motion.div>
      </section>

      {/* Pain Points Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/30 to-background" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Почему ваша реклама{' '}
              <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                не работает
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Большинство рекламодателей допускают одни и те же ошибки
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {painPoints.map((point, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, rotateX: 15, y: 40 }}
                whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ delay: index * 0.15, duration: 0.6 }}
              >
                <TiltCard className="h-full">
                  <div className={`h-full p-6 rounded-2xl bg-gradient-to-br ${point.color} border ${point.borderColor} backdrop-blur-sm`}>
                    <div className="w-14 h-14 rounded-xl bg-card/80 border border-border flex items-center justify-center mb-4">
                      <point.icon className="w-7 h-7 text-red-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">{point.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{point.description}</p>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Work System Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm text-primary">Решение</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Моя система{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                работы
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Проверенный подход, который приносит результат
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {workSteps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="relative"
              >
                {/* Connection line */}
                {index < workSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-full w-full h-px bg-gradient-to-r from-primary/50 to-transparent z-0" />
                )}
                
                <TiltCard className="relative z-10 h-full">
                  <div className="h-full p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all">
                    {/* Step number */}
                    <motion.div
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 + 0.2, type: 'spring' }}
                      className="absolute -top-4 -left-2 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-lg font-bold shadow-lg shadow-primary/30"
                    >
                      {step.number}
                    </motion.div>
                    
                    <div className="pt-6">
                      <div className={`w-12 h-12 rounded-xl bg-${step.color}/10 border border-${step.color}/30 flex items-center justify-center mb-4`}>
                        <step.icon className={`w-6 h-6 text-${step.color}`} />
                      </div>
                      <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Cases Section */}
      <section className="py-20 md:py-32 relative overflow-hidden bg-muted/30">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
              <BarChart3 className="w-4 h-4 text-accent" />
              <span className="text-sm text-accent">Доказательства</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Кейсы с{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                реальными цифрами
              </span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {casesData.map((caseItem, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, rotateX: 15, y: 40 }}
                whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ delay: index * 0.15, duration: 0.6 }}
              >
                <TiltCard className="h-full">
                  <div className="h-full p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all overflow-hidden relative group">
                    {/* Glow effect */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent opacity-0 group-hover:opacity-100 blur-2xl transition-opacity" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-4">
                        <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                          {caseItem.category}
                        </span>
                        <TrendingUp className="w-5 h-5 text-green-500" />
                      </div>
                      
                      <h3 className="text-xl font-bold mb-3">{caseItem.title}</h3>
                      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{caseItem.description}</p>
                      
                      <div className="grid grid-cols-3 gap-3">
                        {caseItem.stats.map((stat, idx) => (
                          <div key={idx} className="text-center p-3 rounded-xl bg-background/50 border border-border/50">
                            <div className={`text-lg font-bold ${stat.color}`}>
                              <AnimatedCounter value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Offer & Form Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[150px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[150px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left - Benefits */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              className="space-y-8"
            >
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-sm text-primary">Оффер</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Что вы{' '}
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    получите
                  </span>
                </h2>
                <p className="text-lg text-muted-foreground">
                  Формат работы: «Под ключ» от $800/мес. + рекламный бюджет
                </p>
              </div>

              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/50 backdrop-blur-sm hover:border-primary/30 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-medium">{benefit}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right - Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
            >
              <LandingForm
                service="meta-ads"
                title="Узнайте, сколько будут стоить ваши клиенты в Meta Ads"
                buttonText="Получить расчет стоимости"
              />
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default memo(MetaAdsPage);
