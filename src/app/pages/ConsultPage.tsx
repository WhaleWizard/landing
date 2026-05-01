import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform, useScroll, AnimatePresence } from 'motion/react';
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
  Linkedin,
  Send,
  Star,
  GraduationCap,
  MapPin,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';

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
    rotateX.set((-mouseY / rect.height) * 10);
    rotateY.set((mouseX / rect.width) * 10);
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

// Floating particle
const FloatingParticle = memo(({ delay = 0, x = 0, size = 4 }: { delay?: number; x?: number; size?: number }) => (
  <motion.div
    className="absolute rounded-full bg-primary/30"
    style={{ width: size, height: size }}
    animate={{
      y: [100, -100],
      x: [x, x + 20, x],
      opacity: [0, 1, 0],
    }}
    transition={{
      duration: 4 + Math.random() * 2,
      repeat: Infinity,
      delay,
      ease: 'easeInOut',
    }}
  />
));
FloatingParticle.displayName = 'FloatingParticle';

// Pain points data
const painPoints = [
  {
    icon: Target,
    title: 'Нет ниши и четкого оффера',
    description: 'Работаете со всеми подряд, не можете сформулировать свою уникальность.',
    color: 'from-primary/20 to-accent/20',
    borderColor: 'border-primary/30',
  },
  {
    icon: FileText,
    title: 'Портфолио не продает',
    description: 'Кейсы есть, но клиенты не понимают их ценность. Результаты не упакованы.',
    color: 'from-accent/20 to-secondary/20',
    borderColor: 'border-accent/30',
  },
  {
    icon: MessageSquare,
    title: 'Не используете каналы поиска',
    description: 'Telegram, LinkedIn, нетворкинг — не знаете, как системно искать клиентов.',
    color: 'from-secondary/20 to-primary/20',
    borderColor: 'border-secondary/30',
  },
  {
    icon: Users,
    title: 'Нет личного бренда',
    description: 'Потенциальные клиенты не знают вас. Нет контента, нет доверия.',
    color: 'from-amber-500/20 to-orange-500/20',
    borderColor: 'border-amber-500/30',
  },
];

// Program steps data
const programSteps = [
  {
    number: '01',
    title: 'Анализ текущего уровня',
    description: 'Разбираем ваше портфолио, навыки и текущую стратегию поиска клиентов.',
    icon: BarChart3,
    progress: 25,
    color: '#8b5cf6',
  },
  {
    number: '02',
    title: 'Стратегия поиска клиентов',
    description: 'Где искать, как писать, какие каналы использовать для вашей ниши.',
    icon: MapPin,
    progress: 50,
    color: '#6366f1',
  },
  {
    number: '03',
    title: 'Упаковка услуг',
    description: 'Создаем сильный оффер, упаковываем кейсы, строим воронку привлечения.',
    icon: Award,
    progress: 75,
    color: '#3b82f6',
  },
  {
    number: '04',
    title: 'План действий',
    description: 'Готовые шаблоны, скрипты и пошаговый план на ближайший месяц.',
    icon: Rocket,
    progress: 100,
    color: '#10b981',
  },
];

// Results data
const resultsData = [
  { value: '150+', label: 'кейсов' },
  { value: '$2M+', label: 'бюджета в управлении' },
  { value: '5+', label: 'лет опыта' },
  { value: '24/7', label: 'поддержка после' },
];

// What you get data
const whatYouGet = [
  {
    icon: Target,
    title: 'Пошаговая стратегия',
    description: 'Конкретный план действий, адаптированный под ваш уровень и цели',
  },
  {
    icon: FileText,
    title: 'Упакованный оффер',
    description: 'Сильное позиционирование, которое выделит вас среди конкурентов',
  },
  {
    icon: MessageSquare,
    title: 'Шаблоны и скрипты',
    description: 'Готовые тексты для холодных сообщений, презентаций и переговоров',
  },
  {
    icon: Users,
    title: 'Разбор портфолио',
    description: 'Как упаковать кейсы так, чтобы они продавали за вас',
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
        title="Консультация для таргетологов"
        description="Помогу таргетологу найти стабильный поток клиентов и выйти на доход от $1000/мес. Разбор стратегии, упаковка услуг, сильный оффер."
        url="/consult"
      />
      <Navbar />

      {/* Hero Section */}
      <section
        ref={heroRef}
        onMouseMove={handleMouseMove}
        className="relative min-h-screen flex items-center justify-center pt-20 pb-16 overflow-hidden"
      >
        {/* Animated gradient background */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            style={{ x: springX, y: springY }}
            className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/15 rounded-full blur-[150px]"
          />
          <motion.div
            style={{ x: useTransform(springX, v => -v * 1.5), y: useTransform(springY, v => -v * 1.5) }}
            className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/12 rounded-full blur-[150px]"
          />
          <motion.div
            style={{ x: useTransform(springX, v => v * 0.8), y: useTransform(springY, v => v * 0.8) }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-secondary/8 rounded-full blur-[120px]"
          />
        </div>

        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => (
            <FloatingParticle
              key={i}
              delay={i * 0.3}
              x={Math.random() * 100}
              size={2 + Math.random() * 4}
            />
          ))}
        </div>

        {/* Diagonal lines pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(139, 92, 246, 0.3) 40px, rgba(139, 92, 246, 0.3) 41px)',
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
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/30 backdrop-blur-sm"
              >
                <GraduationCap className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">
                  Консультация для таргетологов
                </span>
              </motion.div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                Помогу найти{' '}
                <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  стабильный поток клиентов
                </span>{' '}
                и выйти на $1000+/мес
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                Разбор вашей стратегии поиска клиентов, упаковка услуг, сильный оффер 
                и стратегия продвижения на основе личного опыта.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    size="lg"
                    onClick={scrollToContact}
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30 h-14 px-8 text-base"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                    <span className="relative">Записаться на консультацию</span>
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </motion.div>
              </div>

              {/* Results row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8">
                {resultsData.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="text-center p-4 rounded-2xl bg-card/50 border border-border/50 backdrop-blur-sm"
                  >
                    <div className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      {item.value}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right side - 3D mentor visualization */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative h-[500px] hidden lg:block"
            >
              {/* Central element - Avatar/Brand */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{
                    y: [0, -15, 0],
                    rotateY: [0, 5, 0, -5, 0],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="relative"
                >
                  <div className="w-48 h-48 rounded-3xl bg-gradient-to-br from-primary via-accent to-secondary p-[3px]">
                    <div className="w-full h-full rounded-3xl bg-card flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                          WW
                        </div>
                        <div className="text-sm text-muted-foreground">Whale Wzrd</div>
                        <div className="flex justify-center gap-1 mt-2">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Glow effect */}
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary to-accent opacity-30 blur-2xl -z-10" />
                </motion.div>
              </div>

              {/* Floating achievement cards */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute top-12 left-0"
              >
                <motion.div
                  animate={{ y: [0, -10, 0], rotate: [0, 2, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="p-4 rounded-2xl bg-card/90 border border-primary/30 backdrop-blur-xl shadow-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Award className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Опыт</div>
                      <div className="text-lg font-bold text-primary">5+ лет</div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1 }}
                className="absolute top-8 right-0"
              >
                <motion.div
                  animate={{ y: [0, -12, 0], rotate: [0, -2, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  className="p-4 rounded-2xl bg-card/90 border border-accent/30 backdrop-blur-xl shadow-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Бюджет</div>
                      <div className="text-lg font-bold text-accent">$2M+</div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.2 }}
                className="absolute bottom-20 left-8"
              >
                <motion.div
                  animate={{ y: [0, -8, 0], rotate: [0, 1, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                  className="p-4 rounded-2xl bg-card/90 border border-secondary/30 backdrop-blur-xl shadow-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Кейсов</div>
                      <div className="text-lg font-bold text-secondary">150+</div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.4 }}
                className="absolute bottom-8 right-4"
              >
                <motion.div
                  animate={{ y: [0, -10, 0], rotate: [0, -1, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
                  className="p-4 rounded-2xl bg-card/90 border border-green-500/30 backdrop-blur-xl shadow-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <Users className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Учеников</div>
                      <div className="text-lg font-bold text-green-500">50+</div>
                    </div>
                  </div>
                </motion.div>
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-amber-400">Честный разговор</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Почему ты до сих пор{' '}
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                без клиентов
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Знакомые проблемы? Я тоже через это проходил
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {painPoints.map((point, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, rotateX: 15, y: 40 }}
                whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
              >
                <TiltCard className="h-full">
                  <div className={`h-full p-6 rounded-2xl bg-gradient-to-br ${point.color} border ${point.borderColor} backdrop-blur-sm`}>
                    <div className="w-14 h-14 rounded-xl bg-card/80 border border-border flex items-center justify-center mb-4">
                      <point.icon className="w-7 h-7 text-primary" />
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

      {/* Program Section with Progress Bars */}
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
              <span className="text-sm text-primary">Программа консультации</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Что мы{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                разберём
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              За 1-2 часа получишь конкретный план действий
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {programSteps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ delay: index * 0.15, duration: 0.6 }}
              >
                <TiltCard className="h-full">
                  <div className="h-full p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all">
                    <div className="flex items-start gap-4">
                      <motion.div
                        initial={{ scale: 0 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 + 0.2, type: 'spring' }}
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-lg flex-shrink-0"
                        style={{ backgroundColor: step.color, boxShadow: `0 10px 30px ${step.color}40` }}
                      >
                        {step.number}
                      </motion.div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${step.color}20` }}
                          >
                            <step.icon className="w-5 h-5" style={{ color: step.color }} />
                          </div>
                          <h3 className="text-lg font-bold">{step.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>
                        <AnimatedProgress value={step.progress} color={step.color} delay={index * 0.2} />
                      </div>
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Personal Experience Section */}
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
              <Award className="w-4 h-4 text-accent" />
              <span className="text-sm text-accent">Личный опыт</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Прошел этот путь{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                сам
              </span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              className="space-y-6"
            >
              <div className="p-6 rounded-2xl bg-card border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-2">От фрилансера до Performance-таргетолога</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Прошел путь от первых $100 заказов до управления бюджетами в $2M+. 
                      Знаю все подводные камни и ошибки новичков.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-2">150+ успешных кейсов</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      E-commerce, услуги, инфобизнес — работал с разными нишами и бюджетами. 
                      Знаю, что работает в 2024 году.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-2">Помог 50+ таргетологам</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Мои клиенты-таргетологи находят первых заказчиков в течение 2-4 недель 
                      после консультации.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              className="grid grid-cols-2 gap-4"
            >
              {whatYouGet.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="p-5 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h4 className="font-bold mb-1">{item.title}</h4>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </motion.div>
              ))}
            </motion.div>
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
            {/* Left - Offer details */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              className="space-y-8"
            >
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-sm text-primary">Условия</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Индивидуальная{' '}
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    консультация
                  </span>
                </h2>
              </div>

              {/* Pricing card */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="p-8 rounded-3xl bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-primary/30 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                
                <div className="relative">
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">$150</span>
                    <span className="text-muted-foreground">/консультация</span>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span>1-2 часа индивидуальной работы</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span>Разбор вашей ситуации</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span>Пошаговый план действий</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span>Шаблоны и скрипты</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span>Поддержка в Telegram после</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                    <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-amber-400" />
                      <span className="text-sm">Результат: первые клиенты через 2-4 недели</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* Right - Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
            >
              <LandingForm
                service="consult"
                title="Хочу консультацию"
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

export default memo(ConsultPage);
