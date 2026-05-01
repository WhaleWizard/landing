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
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import HeroImage from '../components/HeroImage';
import CanvasBackground from '../components/CanvasBackground';

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
    rotateX.set((-((e.clientY - centerY) / rect.height)) * 10);
    rotateY.set(((e.clientX - centerX) / rect.width) * 10);
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
          className="absolute inset-0 rounded-2xl pointer-events-none bg-gradient-radial from-primary/10 to-transparent"
        />
      )}
    </motion.div>
  );
});
TiltCard.displayName = 'TiltCard';

// Pain points data
const painPoints = [
  {
    icon: Target,
    title: 'Нет ниши и оффера',
    description: 'Работаете со всеми подряд, не можете сформулировать уникальность.',
    color: 'from-primary/20 to-accent/20',
    borderColor: 'border-primary/30',
  },
  {
    icon: FileText,
    title: 'Портфолио не продает',
    description: 'Кейсы есть, но клиенты не понимают их ценность.',
    color: 'from-accent/20 to-secondary/20',
    borderColor: 'border-accent/30',
  },
  {
    icon: MessageSquare,
    title: 'Нет каналов поиска',
    description: 'Telegram, LinkedIn, нетворкинг не работают системно.',
    color: 'from-secondary/20 to-primary/20',
    borderColor: 'border-secondary/30',
  },
  {
    icon: Users,
    title: 'Нет личного бренда',
    description: 'Потенциальные клиенты не знают вас.',
    color: 'from-amber-500/20 to-orange-500/20',
    borderColor: 'border-amber-500/30',
  },
];

// Program steps data
const programSteps = [
  {
    number: '01',
    title: 'Анализ уровня',
    description: 'Разбираем портфолио, навыки и стратегию поиска.',
    icon: BarChart3,
    progress: 25,
    color: '#8b5cf6',
  },
  {
    number: '02',
    title: 'Стратегия поиска',
    description: 'Где искать, как писать, какие каналы использовать.',
    icon: MapPin,
    progress: 50,
    color: '#6366f1',
  },
  {
    number: '03',
    title: 'Упаковка услуг',
    description: 'Сильный оффер, упаковка кейсов, воронка.',
    icon: Award,
    progress: 75,
    color: '#3b82f6',
  },
  {
    number: '04',
    title: 'План действий',
    description: 'Шаблоны, скрипты и план на месяц.',
    icon: Rocket,
    progress: 100,
    color: '#10b981',
  },
];

// Results data
const resultsData = [
  { value: '150+', label: 'кейсов' },
  { value: '$2M+', label: 'бюджета' },
  { value: '5+', label: 'лет опыта' },
  { value: '50+', label: 'учеников' },
];

// What you get data
const whatYouGet = [
  {
    icon: Target,
    title: 'Пошаговая стратегия',
    description: 'План действий под ваш уровень и цели',
  },
  {
    icon: FileText,
    title: 'Упакованный оффер',
    description: 'Позиционирование, выделяющее вас',
  },
  {
    icon: MessageSquare,
    title: 'Шаблоны и скрипты',
    description: 'Тексты для холодных сообщений',
  },
  {
    icon: Users,
    title: 'Разбор портфолио',
    description: 'Упаковка кейсов, которые продают',
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
        className="relative min-h-screen flex items-center overflow-hidden"
      >
        {/* Background effects */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a2e] via-background to-background" />
          <CanvasBackground type="constellation" theme="consult" intensity={0.7} />
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none lg:hidden" />
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none" />

        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12 lg:pt-32 lg:pb-20"
        >
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 backdrop-blur-xl"
                >
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Консультация для таргетологов
                  </span>
                </motion.div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight">
                  <span className="block leading-tight text-balance">Помогу найти</span>
                  <span className="block mt-3 leading-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent pb-1">
                    стабильный поток клиентов
                  </span>
                </h1>

                <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 text-balance">
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
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-2xl shadow-primary/30 h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base"
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
                      <div className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        {stat.value}
                      </div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">{stat.label}</div>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            </div>

            {/* Right column - Hero Image with overlays */}
            <div className="order-1 lg:order-2 relative">
              {/* Mobile: image visible above text */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.5, delay: 0.3, ease: 'easeOut' }}
                className="lg:hidden relative h-[280px] sm:h-[320px] mb-4 rounded-2xl overflow-hidden"
              >
                <HeroImage variant="consult" className="w-full h-full" />
              </motion.div>
              
              {/* Desktop: full image scene */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 2, delay: 0.3, ease: 'easeOut' }}
                className="hidden lg:block relative h-[550px] xl:h-[650px] rounded-3xl overflow-hidden"
              >
                <HeroImage variant="consult" className="w-full h-full" />
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
        <CanvasBackground type="floating-shapes" theme="consult" intensity={0.5} />
        
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
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-balance">
              Почему сложно найти клиентов?
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {painPoints.map((point, index) => (
              <TiltCard key={index}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className={`h-full p-6 rounded-2xl bg-gradient-to-br ${point.color} border ${point.borderColor} backdrop-blur-xl`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-card/50 flex items-center justify-center mb-4">
                    <point.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{point.title}</h3>
                  <p className="text-muted-foreground text-sm">{point.description}</p>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Program Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <CanvasBackground type="geometric-flow" theme="consult" intensity={0.6} />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary">Программа</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-balance">
              Что входит в консультацию
            </h2>
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
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
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
        <CanvasBackground type="particles-network" theme="consult" intensity={0.6} />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-400">Результат</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-balance">
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
                  <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.description}</p>
                </motion.div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <CanvasBackground type="aurora-glow" theme="consult" intensity={0.7} />
        
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
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-balance">
                Готовы выйти на новый уровень?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto text-balance">
                Консультация длится 60-90 минут. Разберем вашу ситуацию 
                и составим пошаговый план действий.
              </p>
              <Button
                size="lg"
                onClick={scrollToContact}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group h-14 px-8 text-base"
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
        <CanvasBackground type="gradient-waves" theme="consult" intensity={0.8} />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Text content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary">Личная консультация</span>
              </div>
              
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-balance">
                Запишитесь на{' '}
                <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  консультацию
                </span>
              </h2>
              
              <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto lg:mx-0 text-balance">
                60-90 минут личной работы над вашей стратегией поиска клиентов. 
                Разберу ситуацию и дам пошаговый план.
              </p>
              
              <div className="space-y-4 max-w-md mx-auto lg:mx-0">
                {[
                  'Разбор вашего позиционирования',
                  'Анализ портфолио и офферов',
                  'Стратегия поиска клиентов',
                  'Шаблоны и скрипты продаж',
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center shrink-0">
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
              <LandingForm service="consult" />
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

export default ConsultPage;
