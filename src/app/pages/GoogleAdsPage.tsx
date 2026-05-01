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
    rotateX.set((-mouseY / rect.height) * 12);
    rotateY.set((mouseX / rect.width) * 12);
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
            background: 'radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(66, 133, 244, 0.15), transparent 50%)',
          }}
        />
      )}
    </motion.div>
  );
});
TiltCard.displayName = 'TiltCard';

// 3D Rotating Google Logo
const Google3DLogo = memo(() => {
  const colors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];
  
  return (
    <motion.div
      animate={{ rotateY: [0, 360] }}
      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      className="relative w-32 h-32"
      style={{ transformStyle: 'preserve-3d' }}
    >
      {colors.map((color, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border-8"
          style={{
            borderColor: color,
            clipPath: `polygon(${i * 25}% 0%, ${(i + 1) * 25}% 0%, ${(i + 1) * 25}% 100%, ${i * 25}% 100%)`,
          }}
        />
      ))}
      <div className="absolute inset-4 rounded-full bg-card flex items-center justify-center">
        <span className="text-3xl font-bold bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#FBBC05] bg-clip-text text-transparent">
          G
        </span>
      </div>
    </motion.div>
  );
});
Google3DLogo.displayName = 'Google3DLogo';

// Floating orbit element
const OrbitElement = memo(({ 
  children, 
  radius = 120, 
  duration = 10,
  delay = 0,
}: { 
  children: React.ReactNode; 
  radius?: number;
  duration?: number;
  delay?: number;
}) => (
  <motion.div
    animate={{ rotate: 360 }}
    transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
    className="absolute"
    style={{ width: radius * 2, height: radius * 2 }}
  >
    <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
      {children}
    </div>
  </motion.div>
));
OrbitElement.displayName = 'OrbitElement';

// Pain points data
const painPoints = [
  {
    icon: Search,
    title: 'Ставка только на поисковые кампании',
    description: 'Без ретаргетинга и прогрева бренда вы теряете до 70% потенциальных клиентов.',
    color: 'from-blue-500/20 to-cyan-500/20',
    borderColor: 'border-blue-500/30',
  },
  {
    icon: RefreshCcw,
    title: 'Отсутствие ретаргетинга',
    description: 'Потеря тех, кто не купил сразу. 96% посетителей уходят без конверсии.',
    color: 'from-red-500/20 to-orange-500/20',
    borderColor: 'border-red-500/30',
  },
  {
    icon: LineChart,
    title: 'Неподготовленный сайт',
    description: 'Высокая цена клика при низкой конверсии. Бюджет сгорает впустую.',
    color: 'from-yellow-500/20 to-amber-500/20',
    borderColor: 'border-yellow-500/30',
  },
];

// Work steps data
const workSteps = [
  {
    number: '01',
    title: 'Анализ спроса и семантика',
    description: 'Отделяю горячие запросы от информационных. Собираю ядро для максимальной релевантности.',
    icon: Search,
    color: '#4285F4',
  },
  {
    number: '02',
    title: 'Запуск Performance Max',
    description: 'Использую сигналы аудитории для максимального охвата на всех площадках Google.',
    icon: Rocket,
    color: '#EA4335',
  },
  {
    number: '03',
    title: 'Ретаргетинг',
    description: 'Дожимаю тех, кто не купил сразу, через YouTube и КМС. Увеличиваю конверсию.',
    icon: RefreshCcw,
    color: '#FBBC05',
  },
  {
    number: '04',
    title: 'Интеграция с CRM',
    description: 'Передаю данные обратно в Google Ads, чтобы алгоритмы оптимизировались на реальных продажах.',
    icon: Database,
    color: '#34A853',
  },
];

// Cases data
const casesData = [
  {
    title: 'E-commerce',
    category: 'Performance Max',
    stats: [
      { label: 'ROI до', value: 142, suffix: '%', color: 'text-yellow-400' },
      { label: 'ROI после', value: 219, suffix: '%', color: 'text-green-400' },
      { label: 'За период', value: 2, suffix: ' мес', color: 'text-blue-400' },
    ],
    description: 'Увеличили ROI в Google Ads со 142% до 219% за 2 месяца после деления PMax на маржинальные кластеры.',
  },
  {
    title: 'B2B Услуги',
    category: 'Search + Maps',
    stats: [
      { label: 'CPL', value: 30, suffix: '%', prefix: '-', color: 'text-green-400' },
      { label: 'Лидов/мес', value: 120, suffix: '+', color: 'text-blue-400' },
      { label: 'Конверсия', value: 8, suffix: '%', color: 'text-primary' },
    ],
    description: 'Настроили поток заявок из Google Maps и Поиска. CPL ниже рынка на 30% при высоком качестве.',
  },
];

// Benefits data
const benefits = [
  'Настройка всех типов кампаний',
  'Performance Max оптимизация',
  'Глубокая интеграция с CRM',
  'Еженедельный дашборд с ROAS/ROMI',
  'YouTube и КМС ретаргетинг',
  'Офлайн конверсии из CRM',
];

// Campaign types
const campaignTypes = [
  { icon: Search, label: 'Search', color: '#4285F4' },
  { icon: ShoppingCart, label: 'Shopping', color: '#EA4335' },
  { icon: Youtube, label: 'YouTube', color: '#FF0000' },
  { icon: PieChart, label: 'PMax', color: '#34A853' },
];

function GoogleAdsPage() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);

  // Mouse parallax for hero
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set((clientX - innerWidth / 2) / 40);
    mouseY.set((clientY - innerHeight / 2) / 40);
  }, [mouseX, mouseY]);

  const scrollToContact = useCallback(() => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <SEO
        title="Горячий трафик из Google Ads (Поиск, YouTube, Shopping)"
        description="Привлеку горячих клиентов из Google Ads, готовых купить сейчас. Search + Performance Max + YouTube для максимума целевых заявок. $800K+ бюджета в управлении."
        url="/google-ads"
      />
      <Navbar />

      {/* Hero Section */}
      <section
        ref={heroRef}
        onMouseMove={handleMouseMove}
        className="relative min-h-screen flex items-center justify-center pt-20 pb-16 overflow-hidden"
      >
        {/* Animated background with Google colors */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            style={{ x: springX, y: springY }}
            className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#4285F4]/15 rounded-full blur-[150px]"
          />
          <motion.div
            style={{ x: useTransform(springX, v => -v * 1.2), y: useTransform(springY, v => -v * 1.2) }}
            className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-[#EA4335]/10 rounded-full blur-[150px]"
          />
          <motion.div
            style={{ x: useTransform(springX, v => v * 0.8), y: useTransform(springY, v => v * 0.8) }}
            className="absolute bottom-1/4 left-1/3 w-[450px] h-[450px] bg-[#FBBC05]/10 rounded-full blur-[130px]"
          />
          <motion.div
            style={{ x: useTransform(springX, v => -v * 0.5), y: useTransform(springY, v => -v * 0.5) }}
            className="absolute bottom-1/3 right-1/3 w-[350px] h-[350px] bg-[#34A853]/10 rounded-full blur-[120px]"
          />
        </div>

        {/* Hexagonal grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%234285F4' stroke-width='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px',
          }}
        />

        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
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
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4285F4]/10 border border-[#4285F4]/30 backdrop-blur-sm"
              >
                <div className="flex -space-x-1">
                  {['#4285F4', '#EA4335', '#FBBC05', '#34A853'].map((color, i) => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <span className="text-sm font-medium text-[#4285F4]">
                  Google Ads Expert
                </span>
              </motion.div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                Привлеку{' '}
                <span className="bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#FBBC05] bg-clip-text text-transparent">
                  горячих клиентов
                </span>{' '}
                из Google Ads, готовых купить сейчас
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                Настрою связку Search + Performance Max + YouTube так, 
                чтобы каждый $ приносил максимум целевых заявок.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    size="lg"
                    onClick={scrollToContact}
                    className="bg-gradient-to-r from-[#4285F4] to-[#34A853] hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-[#4285F4]/30 h-14 px-8 text-base"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                    <span className="relative">Получить срез стоимости лида</span>
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </motion.div>
              </div>

              {/* Campaign types */}
              <div className="flex flex-wrap gap-3 pt-4">
                {campaignTypes.map((type, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    whileHover={{ scale: 1.1, y: -5 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border/50 backdrop-blur-sm"
                  >
                    <type.icon className="w-4 h-4" style={{ color: type.color }} />
                    <span className="text-sm font-medium">{type.label}</span>
                  </motion.div>
                ))}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4 pt-4">
                {[
                  { value: 800, suffix: 'K+', label: 'бюджета Google', color: '#4285F4' },
                  { value: 219, suffix: '%', label: 'макс. ROI', color: '#34A853' },
                  { value: 50, suffix: '+', label: 'кейсов', color: '#FBBC05' },
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="text-center p-4 rounded-2xl bg-card/50 border border-border/50 backdrop-blur-sm"
                  >
                    <div className="text-2xl md:text-3xl font-bold" style={{ color: stat.color }}>
                      ${stat.value}{stat.suffix}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right side - 3D visualization */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative h-[500px] hidden lg:flex items-center justify-center"
            >
              {/* Central element */}
              <div className="relative">
                <Google3DLogo />
                
                {/* Orbiting elements */}
                <OrbitElement radius={140} duration={15}>
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                    className="p-3 rounded-xl bg-card border border-[#4285F4]/30 shadow-lg"
                  >
                    <Search className="w-5 h-5 text-[#4285F4]" />
                  </motion.div>
                </OrbitElement>

                <OrbitElement radius={140} duration={15} delay={3.75}>
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'linear', delay: 3.75 }}
                    className="p-3 rounded-xl bg-card border border-[#EA4335]/30 shadow-lg"
                  >
                    <ShoppingCart className="w-5 h-5 text-[#EA4335]" />
                  </motion.div>
                </OrbitElement>

                <OrbitElement radius={140} duration={15} delay={7.5}>
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'linear', delay: 7.5 }}
                    className="p-3 rounded-xl bg-card border border-[#FBBC05]/30 shadow-lg"
                  >
                    <Youtube className="w-5 h-5 text-[#FBBC05]" />
                  </motion.div>
                </OrbitElement>

                <OrbitElement radius={140} duration={15} delay={11.25}>
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'linear', delay: 11.25 }}
                    className="p-3 rounded-xl bg-card border border-[#34A853]/30 shadow-lg"
                  >
                    <PieChart className="w-5 h-5 text-[#34A853]" />
                  </motion.div>
                </OrbitElement>
              </div>

              {/* Floating stat cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="absolute top-8 left-0 p-4 rounded-2xl bg-card/90 border border-[#4285F4]/30 backdrop-blur-xl shadow-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#4285F4]/20 flex items-center justify-center">
                    <MousePointer className="w-5 h-5 text-[#4285F4]" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Quality Score</div>
                    <div className="text-lg font-bold text-[#4285F4]">9/10</div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="absolute bottom-12 right-0 p-4 rounded-2xl bg-card/90 border border-[#34A853]/30 backdrop-blur-xl shadow-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#34A853]/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-[#34A853]" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">ROAS</div>
                    <div className="text-lg font-bold text-[#34A853]">6.4x</div>
                  </div>
                </div>
              </motion.div>
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
            className="w-6 h-10 rounded-full border-2 border-[#4285F4]/30 flex justify-center pt-2"
          >
            <motion.div
              animate={{ y: [0, 8, 0], opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-[#4285F4]"
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
              Почему ваш «директор»{' '}
              <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                сливает бюджет
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Типичные ошибки, которые съедают ваш рекламный бюджет
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

      {/* Work System Section with Google colors */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#4285F4]/20 to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4285F4]/10 border border-[#4285F4]/20 mb-6">
              <Sparkles className="w-4 h-4 text-[#4285F4] animate-pulse" />
              <span className="text-sm text-[#4285F4]">Решение</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Моя система{' '}
              <span className="bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#FBBC05] bg-clip-text text-transparent">
                работы
              </span>
            </h2>
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
                {index < workSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-full w-full h-px bg-gradient-to-r from-primary/50 to-transparent z-0" />
                )}
                
                <TiltCard className="relative z-10 h-full">
                  <div className="h-full p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all">
                    <motion.div
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 + 0.2, type: 'spring' }}
                      className="absolute -top-4 -left-2 w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shadow-lg text-white"
                      style={{ backgroundColor: step.color, boxShadow: `0 10px 30px ${step.color}40` }}
                    >
                      {step.number}
                    </motion.div>
                    
                    <div className="pt-6">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                        style={{ backgroundColor: `${step.color}20`, border: `1px solid ${step.color}40` }}
                      >
                        <step.icon className="w-6 h-6" style={{ color: step.color }} />
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
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#4285F4]/20 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#34A853]/20 to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#34A853]/10 border border-[#34A853]/20 mb-6">
              <BarChart3 className="w-4 h-4 text-[#34A853]" />
              <span className="text-sm text-[#34A853]">Доказательства</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Кейсы с{' '}
              <span className="bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#34A853] bg-clip-text text-transparent">
                реальными цифрами
              </span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {casesData.map((caseItem, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, rotateX: 15, y: 40 }}
                whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ delay: index * 0.15, duration: 0.6 }}
              >
                <TiltCard className="h-full">
                  <div className="h-full p-8 rounded-2xl bg-card border border-border hover:border-[#4285F4]/50 transition-all overflow-hidden relative group">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#4285F4]/10 to-transparent opacity-0 group-hover:opacity-100 blur-2xl transition-opacity" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-6">
                        <span className="px-4 py-1.5 rounded-full bg-[#4285F4]/10 border border-[#4285F4]/20 text-sm text-[#4285F4] font-medium">
                          {caseItem.category}
                        </span>
                        <TrendingUp className="w-5 h-5 text-[#34A853]" />
                      </div>
                      
                      <h3 className="text-2xl font-bold mb-4">{caseItem.title}</h3>
                      <p className="text-muted-foreground mb-8 leading-relaxed">{caseItem.description}</p>
                      
                      <div className="grid grid-cols-3 gap-4">
                        {caseItem.stats.map((stat, idx) => (
                          <div key={idx} className="text-center p-4 rounded-xl bg-background/50 border border-border/50">
                            <div className={`text-xl font-bold ${stat.color}`}>
                              <AnimatedCounter value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
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
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#4285F4]/10 rounded-full blur-[150px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#34A853]/10 rounded-full blur-[150px]" />
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
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4285F4]/10 border border-[#4285F4]/20 mb-6">
                  <Shield className="w-4 h-4 text-[#4285F4]" />
                  <span className="text-sm text-[#4285F4]">Оффер</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Что вы{' '}
                  <span className="bg-gradient-to-r from-[#4285F4] to-[#34A853] bg-clip-text text-transparent">
                    получите
                  </span>
                </h2>
                <p className="text-lg text-muted-foreground">
                  Комплексная настройка Google Ads от $1000/мес. + рекламный бюджет
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
                    className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/50 backdrop-blur-sm hover:border-[#4285F4]/30 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#4285F4]/10 border border-[#4285F4]/20 flex items-center justify-center group-hover:bg-[#4285F4]/20 transition-colors">
                      <CheckCircle2 className="w-5 h-5 text-[#4285F4]" />
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
                service="google-ads"
                title="Рассчитайте прогнозируемый ROAS для вашей ниши"
                buttonText="Получить расчет"
              />
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default memo(GoogleAdsPage);
