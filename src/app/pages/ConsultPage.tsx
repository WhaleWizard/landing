import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform, useScroll } from 'motion/react';
import {
  Users,
  Zap,
  BarChart3,
  TrendingUp,
  Sparkles,
  Target,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  Award,
  Rocket,
  Shield,
  DollarSign,
  FileText,
  Star,
  GraduationCap,
  MapPin,
  Lightbulb,
  BookOpen,
  Compass,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import CosmicWhale from '../components/CosmicWhale';
import InteractiveBackground from '../components/InteractiveBackground';

// Animated progress bar
const AnimatedProgress = memo(({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <div ref={ref} className="h-2 rounded-full bg-muted/50 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={inView ? { width: `${value}%` } : { width: 0 }}
        transition={{ duration: 1.5, delay, ease: [0.22, 1, 0.36, 1] }}
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}80)` }}
      />
    </div>
  );
});
AnimatedProgress.displayName = 'AnimatedProgress';

// 3D Tilt Card with gradient glow
const TiltCard = memo(({ children, className = '', glowColor = 'rgba(139, 92, 246, 0.15)' }: { children: React.ReactNode; className?: string; glowColor?: string }) => {
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
    rotateX.set((-((e.clientY - centerY) / rect.height)) * 10);
    rotateY.set(((e.clientX - centerX) / rect.width) * 10);
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

// Consult floating elements - ethereal style
const ConsultFloatingElements = memo(() => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Primary purple orb */}
      <motion.div
        className="absolute top-16 right-16 w-48 h-48 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.35) 0%, rgba(139, 92, 246, 0.1) 50%, transparent 70%)',
          filter: 'blur(30px)',
        }}
        animate={{
          y: [0, -25, 0],
          x: [0, 12, 0],
          scale: [1, 1.12, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Cyan accent orb */}
      <motion.div
        className="absolute bottom-32 left-20 w-36 h-36 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, rgba(6, 182, 212, 0.1) 50%, transparent 70%)',
          filter: 'blur(25px)',
        }}
        animate={{
          y: [0, 20, 0],
          x: [0, -10, 0],
          scale: [1, 1.18, 1],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      {/* Indigo orb */}
      <motion.div
        className="absolute top-1/3 left-1/4 w-28 h-28 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 60%)',
          filter: 'blur(20px)',
        }}
        animate={{
          y: [0, -18, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      {/* Pink accent */}
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-24 h-24 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(236, 72, 153, 0.25) 0%, transparent 60%)',
          filter: 'blur(18px)',
        }}
        animate={{
          y: [0, 15, 0],
          x: [0, -12, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
    </div>
  );
});
ConsultFloatingElements.displayName = 'ConsultFloatingElements';

// Consult section backgrounds
const ConsultSectionBackground = memo(({ variant }: { variant: 'aurora' | 'mesh' | 'glow' | 'particles' }) => {
  if (variant === 'aurora') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, 
              transparent 0%, 
              rgba(139, 92, 246, 0.08) 25%, 
              rgba(99, 102, 241, 0.05) 50%, 
              rgba(6, 182, 212, 0.08) 75%, 
              transparent 100%)`,
            backgroundSize: '400% 400%',
          }}
          animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-x-0 top-0 h-1/2"
          style={{
            background: 'linear-gradient(to bottom, rgba(139, 92, 246, 0.1), transparent)',
            filter: 'blur(60px)',
          }}
          animate={{ opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
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
              radial-gradient(circle at 20% 30%, rgba(139, 92, 246, 0.12) 0%, transparent 40%),
              radial-gradient(circle at 80% 70%, rgba(99, 102, 241, 0.1) 0%, transparent 40%),
              radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.06) 0%, transparent 50%)
            `,
          }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.04) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
          animate={{ backgroundPosition: ['0px 0px', '50px 50px'] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  if (variant === 'particles') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 4 + 2,
              height: Math.random() * 4 + 2,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: ['#8b5cf6', '#6366f1', '#06b6d4'][i % 3],
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.6, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 4 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    );
  }

  // Glow variant
  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 60%)',
          filter: 'blur(80px)',
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 60%)',
          filter: 'blur(60px)',
        }}
        animate={{
          scale: [1.15, 1, 1.15],
          opacity: [0.5, 0.3, 0.5],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
    </div>
  );
});
ConsultSectionBackground.displayName = 'ConsultSectionBackground';

// Pain points data
const painPoints = [
  {
    icon: Target,
    title: 'Нет ниши и оффера',
    description: 'Работаете со всеми подряд, не можете сформулировать свою уникальность для клиентов.',
    gradient: 'from-primary/20 to-accent/20',
    borderColor: 'border-primary/30',
  },
  {
    icon: FileText,
    title: 'Портфолио не продает',
    description: 'Кейсы есть, но клиенты не понимают их ценность и не видят результата.',
    gradient: 'from-accent/20 to-secondary/20',
    borderColor: 'border-accent/30',
  },
  {
    icon: MessageSquare,
    title: 'Нет каналов поиска',
    description: 'Telegram, LinkedIn, нетворкинг не работают системно. Нет понятной стратегии.',
    gradient: 'from-secondary/20 to-primary/20',
    borderColor: 'border-secondary/30',
  },
  {
    icon: Users,
    title: 'Нет личного бренда',
    description: 'Потенциальные клиенты не знают вас, нет присутствия в профессиональном сообществе.',
    gradient: 'from-cyan-500/20 to-primary/20',
    borderColor: 'border-cyan-500/30',
  },
];

// Program steps data
const programSteps = [
  {
    number: '01',
    title: 'Анализ уровня',
    description: 'Разбираем ваше портфолио, навыки и текущую стратегию поиска клиентов.',
    icon: BarChart3,
    progress: 25,
    color: '#8b5cf6',
  },
  {
    number: '02',
    title: 'Стратегия поиска',
    description: 'Определяем, где искать клиентов, как писать, какие каналы использовать.',
    icon: Compass,
    progress: 50,
    color: '#6366f1',
  },
  {
    number: '03',
    title: 'Упаковка услуг',
    description: 'Создаём сильный оффер, упаковываем кейсы, строим воронку привлечения.',
    icon: Award,
    progress: 75,
    color: '#3b82f6',
  },
  {
    number: '04',
    title: 'План действий',
    description: 'Готовые шаблоны сообщений, скрипты продаж и план на месяц.',
    icon: Rocket,
    progress: 100,
    color: '#10b981',
  },
];

// Results data
const resultsData = [
  { value: '150+', label: 'кейсов', color: '#8b5cf6' },
  { value: '$2M+', label: 'бюджета', color: '#6366f1' },
  { value: '5+', label: 'лет опыта', color: '#3b82f6' },
  { value: '50+', label: 'учеников', color: '#10b981' },
];

// What you get data
const whatYouGet = [
  {
    icon: Target,
    title: 'Пошаговая стратегия',
    description: 'Индивидуальный план действий под ваш уровень и цели',
  },
  {
    icon: FileText,
    title: 'Упакованный оффер',
    description: 'Позиционирование, которое выделит вас среди конкурентов',
  },
  {
    icon: MessageSquare,
    title: 'Шаблоны и скрипты',
    description: 'Готовые тексты для холодных сообщений и переговоров',
  },
  {
    icon: BookOpen,
    title: 'Разбор портфолио',
    description: 'Упаковка кейсов, которые продают ваши услуги',
  },
];

// Testimonial data
const testimonials = [
  {
    text: 'После консультации нашёл первых 3 клиентов за 2 недели. Чёткий план и понимание, что делать.',
    author: 'Артём К.',
    role: 'Таргетолог, $1200/мес',
  },
  {
    text: 'Полностью переупаковала портфолио и оффер. Клиенты стали приходить сами через LinkedIn.',
    author: 'Мария С.',
    role: 'Медиа-байер, $2500/мес',
  },
];

function ConsultPage() {
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
        title="Консультация для таргетологов"
        description="Помогу таргетологу найти стабильный поток клиентов и выйти на доход от $1000/мес. Разбор стратегии, упаковка услуг, сильный оффер."
        url="/consult"
      />
      <Navbar />

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center overflow-hidden"
      >
        {/* Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a2e] via-background to-background" />
          <InteractiveBackground variant="ethereal" particleCount={40} />
          <ConsultFloatingElements />
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 backdrop-blur-xl"
                >
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Консультация для таргетологов
                  </span>
                </motion.div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tight">
                  <span className="block text-foreground text-balance">Помогу найти</span>
                  <span className="block mt-2 bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                    стабильный поток клиентов
                  </span>
                </h1>

                <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 text-pretty">
                  Разбор стратегии поиска клиентов, упаковка услуг и сильный оффер 
                  на основе личного опыта $2M+ бюджета в управлении.
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
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-2xl shadow-primary/30 h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-medium"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                    <span className="relative">Записаться на консультацию</span>
                    <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </motion.div>

                {/* Stats row */}
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-8 max-w-lg mx-auto lg:mx-0"
                >
                  {resultsData.map((stat, i) => (
                    <motion.div
                      key={i}
                      whileHover={{ scale: 1.05, y: -5 }}
                      className="text-center p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl"
                    >
                      <div className="text-lg sm:text-xl font-bold" style={{ color: stat.color }}>
                        {stat.value}
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
        <ConsultSectionBackground variant="aurora" />
        
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
              Почему сложно найти клиентов?
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto text-pretty">
              4 главные причины, почему таргетологи застревают без заказов
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {painPoints.map((point, index) => (
              <TiltCard key={index}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className={`h-full p-6 rounded-2xl bg-gradient-to-br ${point.gradient} border ${point.borderColor} backdrop-blur-xl`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-card/50 flex items-center justify-center mb-4">
                    <point.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">{point.title}</h3>
                  <p className="text-muted-foreground text-sm">{point.description}</p>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Program Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <ConsultSectionBackground variant="mesh" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">Программа</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground text-balance">
              Что входит в консультацию
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto text-pretty">
              Структурированная программа из 4 этапов для вашего роста
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {programSteps.map((step, index) => (
              <TiltCard key={index}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="h-full p-6 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-3xl font-bold" style={{ color: `${step.color}40` }}>
                      {step.number}
                    </span>
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${step.color}20` }}
                    >
                      <step.icon className="w-5 h-5" style={{ color: step.color }} />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{step.description}</p>
                  <AnimatedProgress value={step.progress} color={step.color} delay={index * 0.2} />
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* What You Get Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <ConsultSectionBackground variant="glow" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-400 font-medium">Результат</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground text-balance">
              Что вы получите
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {whatYouGet.map((item, index) => (
              <TiltCard key={index}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="h-full p-6 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl hover:border-primary/50 transition-all"
                >
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.description}</p>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <ConsultSectionBackground variant="particles" />
        
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <Star className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-amber-400 font-medium">Отзывы</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground text-balance">
              Результаты учеников
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="p-6 md:p-8 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-foreground mb-6 italic">&quot;{testimonial.text}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">{testimonial.author[0]}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{testimonial.author}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background" />
        
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 border border-primary/20 backdrop-blur-xl">
              <div className="flex justify-center mb-6">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-6 h-6 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
                Готовы выйти на новый уровень?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto text-pretty">
                Консультация длится 60-90 минут. Разберём вашу ситуацию 
                и составим пошаговый план действий.
              </p>
              <Button
                size="lg"
                onClick={scrollToContact}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group h-14 px-8 text-base font-medium"
              >
                Записаться на консультацию
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contact" className="py-20 md:py-32 relative overflow-hidden">
        <GradientOrbs variant="ethereal" />
        <AnimatedGrid variant="ethereal" />
        
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
                service="consult" 
                title="Записаться на консультацию"
                buttonText="Записаться"
              />
            </motion.div>

            {/* Left - Text content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                <Lightbulb className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary font-medium">Начните сейчас</span>
              </div>
              
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-foreground text-balance">
                Запишитесь на{' '}
                <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  консультацию
                </span>
              </h2>
              
              <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto lg:mx-0 text-pretty">
                Заполните форму и я свяжусь с вами в течение 24 часов 
                для согласования времени.
              </p>
              
              <div className="space-y-4 max-w-md mx-auto lg:mx-0">
                {[
                  { text: 'Индивидуальный разбор вашей ситуации', color: '#8b5cf6' },
                  { text: 'Готовая стратегия поиска клиентов', color: '#6366f1' },
                  { text: 'Упаковка услуг и портфолио', color: '#3b82f6' },
                  { text: 'План действий на месяц', color: '#10b981' },
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
                service="consult" 
                title="Записаться на консультацию"
                buttonText="Записаться"
              />
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default ConsultPage;
