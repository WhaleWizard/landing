import { memo, useCallback, useRef, useEffect, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowRight, TrendingUp, Target, Zap, BarChart3, Sparkles } from 'lucide-react';
import { Button } from './ui/button';

// ─── Static particle data — computed once, never on re-render ──────────────
const PARTICLE_DATA = Array.from({ length: 12 }, (_, i) => ({
  width:  Math.random() * 3 + 1,
  height: Math.random() * 3 + 1,
  left:   `${30 + Math.random() * 40}%`,
  top:    `${20 + Math.random() * 60}%`,
  glow:   Math.random() * 8 + 4,
  dur:    5 + Math.random() * 3,
  delay:  Math.random() * 4,
  color:  i % 2 === 0 ? 'rgba(139, 92, 246, 0.5)' : 'rgba(0, 210, 255, 0.5)',
}));

const LINE_PATHS = [
  'M 50,45 Q 35,30 20,18',
  'M 50,45 Q 70,30 82,15',
  'M 50,55 Q 30,70 18,80',
  'M 50,55 Q 70,65 82,72',
];

// Хук для определения тач-устройства (без ховера)
const useTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);
  return isTouch;
};

// Фоновые орбы с паузой анимации при выходе из вьюпорта
const BackgroundOrbs = memo(({ inView }: { inView: boolean }) => (
  <>
    <div
      className="absolute top-1/4 left-1/4 w-64 h-64 md:w-[600px] md:h-[600px] bg-primary/30 rounded-full blur-[150px] animate-pulse pointer-events-none"
      style={{ 
        willChange: 'opacity',
        animationPlayState: inView ? 'running' : 'paused',
        WebkitAnimationPlayState: inView ? 'running' : 'paused',
        transform: 'translateZ(0)',
      }}
    />
    <div
      className="absolute bottom-1/4 right-1/4 w-64 h-64 md:w-[600px] md:h-[600px] bg-accent/20 rounded-full blur-[150px] animate-pulse pointer-events-none"
      style={{ 
        animationDelay: '1s', 
        willChange: 'opacity',
        animationPlayState: inView ? 'running' : 'paused',
        WebkitAnimationPlayState: inView ? 'running' : 'paused',
        transform: 'translateZ(0)',
      }}
    />
    <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-30 pointer-events-none" />
    <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-30 pointer-events-none" />
  </>
));
BackgroundOrbs.displayName = 'BackgroundOrbs';

// Три карточки статистики (дизайн не менялся)
const StatsRow = memo(() => (
  <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6 pt-6 md:pt-8">
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="relative p-2.5 sm:p-3 md:p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 backdrop-blur-sm"
    >
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-lg bg-primary/20 flex items-center justify-center pointer-events-none">
        <Sparkles className="w-3 h-3 sm:w-3 sm:h-3 md:w-4 md:h-4 text-primary" />
      </div>
      <div className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">150+</div>
      <div className="text-xs sm:text-xs md:text-sm text-muted-foreground">Кейсов</div>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="relative p-2.5 sm:p-3 md:p-4 rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 backdrop-blur-sm"
    >
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-lg bg-accent/20 flex items-center justify-center pointer-events-none">
        <TrendingUp className="w-3 h-3 sm:w-3 sm:h-3 md:w-4 md:h-4 text-accent" />
      </div>
      <div className="text-xl sm:text-2xl md:text-3xl font-bold text-accent">$2М+</div>
      <div className="text-xs sm:text-xs md:text-sm text-muted-foreground">инвестировано в трафик</div>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="relative p-2.5 sm:p-3 md:p-4 rounded-xl bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20 backdrop-blur-sm"
    >
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-lg bg-secondary/20 flex items-center justify-center pointer-events-none">
        <BarChart3 className="w-3 h-3 sm:w-3 sm:h-3 md:w-4 md:h-4 text-secondary" />
      </div>
      <div className="text-xl sm:text-2xl md:text-3xl font-bold text-secondary">79%</div>
      <div className="text-xs sm:text-xs md:text-sm text-muted-foreground">проектов окупились</div>
    </motion.div>
  </div>
));
StatsRow.displayName = 'StatsRow';

interface LeftContentProps {
  onScrollToContact: () => void;
  onScrollToCases:   () => void;
  inView: boolean;
}

const LeftContent = memo(({ onScrollToContact, onScrollToCases, inView }: LeftContentProps) => (
  <motion.div
    initial={{ opacity: 0, y: 50 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8 }}
    className="space-y-6 md:space-y-8 order-2 lg:order-1"
  >
    <motion.div
      className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm"
      animate={inView ? {
        boxShadow: [
          '0 0 0 0 rgba(139, 92, 246, 0)',
          '0 0 20px 5px rgba(139, 92, 246, 0.3)',
          '0 0 0 0 rgba(139, 92, 246, 0)',
        ],
      } : {}}
      transition={{ duration: 2, repeat: inView ? Infinity : 0 }}
      style={{ willChange: 'box-shadow' }}
    >
      <Zap className="w-3 h-3 md:w-4 md:h-4 text-primary" />
      <span className="text-xs md:text-sm text-primary">Perfomance-таргетинг</span>
    </motion.div>

    <h1 className="text-2xl sm:text-4xl lg:text-4xl xl:text-4xl font-bold leading-tight">
      Увеличу поток клиентов через{' '}
      <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
        Google Ads & Meta Ads
      </span>
    </h1>

    <div className="space-y-3">
      <p className="text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed">
        Настраиваю рекламу, которая приводит первые заявки уже в период теста и масштабируется в прибыль.
      </p>
      <p className="text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed">
        $2M+ рекламного бюджета в управлении • 500 000+ лидов. Средняя окупаемость — 240% (в e-commerce и B2C)<br />
      </p>
      <p className="text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed">
        Беру на себя всё: стратегия, креативы, аналитика и оптимизация.
      </p>
    </div>

    <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
      <Button
        size="lg"
        onClick={onScrollToContact}
        className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
        <span className="relative">Получить стратегию роста</span>
        <ArrowRight className="ml-2 w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform relative" />
      </Button>
      <Button
        size="lg"
        variant="outline"
        onClick={onScrollToCases}
        className="border-primary/30 hover:bg-primary/10 backdrop-blur-sm text-sm md:text-base"
      >
        Кейсы и цифры
      </Button>
    </div>

    <StatsRow />
  </motion.div>
));
LeftContent.displayName = 'LeftContent';

const Particles = memo(({ count, inView }: { count: number; inView: boolean }) => {
  if (!inView) return null;
  return (
    <>
      {PARTICLE_DATA.slice(0, count).map((p, i) => (
        <motion.div
          key={`particle-${i}`}
          className="absolute rounded-full pointer-events-none"
          style={{
            width:      p.width,
            height:     p.height,
            left:       p.left,
            top:        p.top,
            background: p.color,
            boxShadow:  `0 0 ${p.glow}px currentColor`,
            willChange: 'transform, opacity',
            transform: 'translateZ(0)',
          }}
          animate={{ y: [0, -60, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}
    </>
  );
});
Particles.displayName = 'Particles';

interface RightPanelProps {
  inView: boolean;
}

const RightPanel = memo(({ inView }: RightPanelProps) => {
  const isTouch = useTouchDevice();
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Уменьшаем количество частиц на очень слабых устройствах (доп. оптимизация)
  const particleCount = isMobile ? (window.innerWidth < 480 ? 4 : 6) : 12;

  // Предзагрузка и preconnect для ускорения загрузки изображения
  useEffect(() => {
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://i.ibb.co';
    document.head.appendChild(preconnect);
    
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = 'https://i.ibb.co/0jn4R1kS/photo-2026-04-10-23-38-24.jpg';
    document.head.appendChild(link);
    
    return () => {
      document.head.removeChild(preconnect);
      document.head.removeChild(link);
    };
  }, []);

  // Опционально: отключаем hover-анимации на тач-устройствах
  const hoverProps = !isTouch ? { whileHover: { scale: 1.1, rotate: 5 } } : {};
  const hoverPropsMinus = !isTouch ? { whileHover: { scale: 1.1, rotate: -5 } } : {};
  const hoverPropsNoRotate = !isTouch ? { whileHover: { scale: 1.1 } } : {};

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="relative order-1 lg:order-2 h-[400px] md:h-[600px]"
    >
      <div className="absolute inset-0 flex items-center justify-center overflow-visible">
        {/* Ambient glow */}
        <div className="absolute inset-0 -m-28 pointer-events-none">
          <div
            className="absolute inset-0 blur-[100px] opacity-40"
            style={{
              background:
                'radial-gradient(ellipse 60% 70% at 50% 50%, rgba(127, 0, 255, 0.5) 0%, rgba(0, 210, 255, 0.3) 40%, transparent 70%)',
            }}
          />
        </div>

        {/* Main image — оптимизированная загрузка */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <img
            src="https://i.ibb.co/0jn4R1kS/photo-2026-04-10-23-38-24.jpg"
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover"
            style={{ objectPosition: 'center center' }}
          />
        </div>

        {/* Neon rim light */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 75% 85% at 50% 45%, transparent 20%, rgba(127, 0, 255, 0.25) 50%, rgba(0, 210, 255, 0.2) 65%, transparent 85%)',
            maskImage:
              'radial-gradient(ellipse 68% 82% at 50% 45%, black 0%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 68% 82% at 50% 45%, black 0%, transparent 80%)',
            mixBlendMode: 'screen',
            willChange: 'opacity',
          }}
          animate={inView ? { opacity: [0.4, 0.65, 0.4] } : { opacity: 0.4 }}
          transition={{ duration: 4, repeat: inView ? Infinity : 0, ease: 'easeInOut' }}
        />

        {/* Edge accent */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 50% 60% at 50% 45%, rgba(139, 92, 246, 0.2) 0%, transparent 60%)',
            maskImage:
              'radial-gradient(ellipse 68% 82% at 50% 45%, black 0%, transparent 75%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 68% 82% at 50% 45%, black 0%, transparent 75%)',
          }}
        />

        {/* Holographic rings */}
        {[0, 1].map((i) => (
          <motion.div
            key={`ring-${i}`}
            className="absolute pointer-events-none"
            style={{
              left: '50%',
              top: '45%',
              transform: 'translate(-50%, -50%)',
              willChange: 'transform, opacity',
            }}
            animate={
              inView
                ? { scale: [1, 2.5, 1], opacity: [0.15, 0, 0.15] }
                : { scale: 1, opacity: 0.15 }
            }
            transition={{
              duration: 8,
              repeat: inView ? Infinity : 0,
              delay: i * 4,
              ease: 'easeOut',
            }}
          >
            <div
              className="rounded-full"
              style={{
                width: '360px',
                height: '360px',
                border: '1px solid',
                borderColor:
                  i === 0 ? 'rgba(127, 0, 255, 0.3)' : 'rgba(0, 210, 255, 0.3)',
              }}
            />
          </motion.div>
        ))}

        <Particles count={particleCount} inView={inView} />

        {/* Scan line */}
        <motion.div
          className="absolute inset-x-0 h-px pointer-events-none opacity-30"
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(0, 210, 255, 0.5), transparent)',
            willChange: 'top',
          }}
          animate={inView ? { top: ['15%', '85%', '15%'] } : { top: '15%' }}
          transition={{ duration: 6, repeat: inView ? Infinity : 0, ease: 'easeInOut' }}
        />
      </div>

      {/* Data Cards */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.8, type: 'spring' }}
        className="absolute top-2 left-0 md:top-6 md:left-2 w-36 sm:w-44 md:w-56 z-10 group"
      >
        <div className="relative p-3 md:p-5 rounded-2xl bg-background/95 backdrop-blur-2xl border border-primary/30 overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/20 blur-2xl rounded-full pointer-events-none" />
          <div className="flex items-start justify-between mb-3 md:mb-4 relative z-10">
            <div>
              <div className="text-[9px] sm:text-[10px] md:text-xs uppercase tracking-wider text-primary/60 font-medium mb-0.5">
                Google Ads
              </div>
              <div className="text-xs sm:text-sm md:text-base text-muted-foreground/80">
                total ad spend
              </div>
            </div>
            <motion.div
              className="w-7 h-7 md:w-9 md:h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/30"
              {...hoverProps}
            >
              <Target className="w-3 h-3 md:w-4 md:h-4 text-primary" />
            </motion.div>
          </div>
          <motion.div
            className="text-xl sm:text-2xl md:text-3xl font-bold text-primary mb-3 md:mb-4 relative z-10"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.5 }}
          >
            $800,000+
          </motion.div>
          <div className="flex items-center gap-1.5 md:gap-2 relative z-10">
            <motion.div
              className="flex-1 h-0.5 md:h-1 rounded-full bg-primary/20 overflow-hidden"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.4, duration: 0.8 }}
              style={{ willChange: 'transform' }}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 0.85 }}
                transition={{ delay: 1.6, duration: 0.8 }}
                style={{ transformOrigin: 'left', willChange: 'transform' }}
              />
            </motion.div>
            <span className="text-[9px] sm:text-[10px] md:text-xs text-primary font-medium">
              +120%
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.9, duration: 0.8, type: 'spring' }}
        className="absolute top-0 right-0 md:top-4 md:right-4 w-32 sm:w-36 md:w-44 z-10 group"
      >
        <div className="relative p-3 md:p-5 rounded-2xl bg-background/95 backdrop-blur-2xl border border-accent/30 overflow-hidden">
          <motion.div
            className="absolute -top-8 -right-8 w-24 h-24 bg-accent/20 blur-3xl rounded-full pointer-events-none"
            animate={inView ? { scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] } : {}}
            transition={{ duration: 3, repeat: inView ? Infinity : 0 }}
            style={{ willChange: 'transform, opacity' }}
          />
          <div className="flex items-start justify-between mb-2 md:mb-3 relative z-10">
            <div>
              <div className="text-[9px] sm:text-[10px] md:text-xs uppercase tracking-wider text-accent/60 font-medium mb-0.5">
                ROAS
              </div>
              <div className="text-xs sm:text-sm md:text-base text-muted-foreground/80">
                в среднем
              </div>
            </div>
            <motion.div
              className="w-7 h-7 md:w-9 md:h-9 rounded-lg bg-accent/10 flex items-center justify-center border border-accent/30"
              {...hoverPropsMinus}
            >
              <BarChart3 className="w-3 h-3 md:w-4 md:h-4 text-accent" />
            </motion.div>
          </div>
          <motion.div
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-accent mb-2 md:mb-3 relative z-10 leading-none"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.3, duration: 0.5 }}
          >
            6.2
          </motion.div>
          <svg
            className="w-full h-4 md:h-6 relative z-10"
            viewBox="0 0 60 20"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M 0,15 L 15,12 L 30,8 L 45,5 L 60,3"
              stroke="url(#sparkGradient)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 1.5, duration: 1.2 }}
            />
            <defs>
              <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="#00d2ff" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#00d2ff" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.0, duration: 0.8, type: 'spring' }}
        className="absolute bottom-6 left-0 md:bottom-10 md:left-4 w-36 sm:w-44 md:w-56 z-10 group"
      >
        <div className="relative p-3 md:p-5 rounded-2xl bg-background/95 backdrop-blur-2xl border border-secondary/30 overflow-hidden">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-secondary/40 rounded-tl-2xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-secondary/40 rounded-br-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-secondary/20 blur-3xl rounded-full pointer-events-none" />
          <div className="flex items-start justify-between mb-3 md:mb-4 relative z-10">
            <div>
              <div className="text-[9px] sm:text-[10px] md:text-xs uppercase tracking-wider text-secondary/60 font-medium mb-0.5">
                Meta Ads
              </div>
              <div className="text-xs sm:text-sm md:text-base text-muted-foreground/80">
                total ad spend
              </div>
            </div>
            <motion.div
              className="w-7 h-7 md:w-9 md:h-9 rounded-lg bg-secondary/10 flex items-center justify-center border border-secondary/30"
              {...hoverProps}
            >
              <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-secondary" />
            </motion.div>
          </div>
          <motion.div
            className="text-xl sm:text-2xl md:text-3xl font-bold text-secondary mb-3 md:mb-4 relative z-10"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.5 }}
          >
            $1,200,00+
          </motion.div>
          <div className="flex items-center gap-1 md:gap-1.5 relative z-10">
            {[80, 95, 100, 70, 90].map((scale, i) => (
              <motion.div
                key={i}
                className="w-1 md:w-1.5 rounded-full bg-secondary/30"
                style={{ height: `${scale}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 1.6 + i * 0.1, duration: 0.4 }}
              >
                <motion.div
                  className="w-full bg-gradient-to-t from-secondary to-accent rounded-full"
                  initial={{ height: 0 }}
                  animate={{ height: '100%' }}
                  transition={{ delay: 1.8 + i * 0.1, duration: 0.4 }}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.1, duration: 0.8, type: 'spring' }}
        className="absolute bottom-14 right-0 md:bottom-20 md:right-2 w-28 sm:w-32 md:w-40 z-10 group"
      >
        <div className="relative p-3 md:p-4 rounded-2xl bg-background/95 backdrop-blur-2xl border border-primary/30 overflow-hidden">
          <motion.div
            className="absolute inset-0 bg-gradient-radial from-primary/20 via-transparent to-transparent pointer-events-none"
            animate={inView ? { scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] } : {}}
            transition={{ duration: 2, repeat: inView ? Infinity : 0 }}
            style={{ willChange: 'transform, opacity' }}
          />
          <div className="flex items-center justify-between mb-2 md:mb-3 relative z-10">
            <div className="text-[9px] sm:text-[10px] md:text-xs uppercase tracking-wider text-primary/60 font-medium">
              сред. ROI
            </div>
            <motion.div
              className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/30"
              {...hoverPropsNoRotate}
              animate={
                inView
                  ? {
                      boxShadow: [
                        '0 0 0 0 rgba(139, 92, 246, 0)',
                        '0 0 20px 5px rgba(139, 92, 246, 0.3)',
                        '0 0 0 0 rgba(139, 92, 246, 0)',
                      ],
                    }
                  : {}
              }
              transition={{ duration: 2, repeat: inView ? Infinity : 0 }}
              style={{ willChange: 'box-shadow' }}
            >
              <Sparkles className="w-3 h-3 md:w-4 md:h-4 text-primary" />
            </motion.div>
          </div>
          <motion.div
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary relative z-10 leading-none"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.5 }}
          >
            240%
          </motion.div>
          <motion.div
            className="mt-2 md:mt-3 h-0.5 bg-gradient-to-r from-primary via-accent to-transparent rounded-full relative z-10"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.7, duration: 0.8 }}
            style={{ transformOrigin: 'left', willChange: 'transform' }}
          />
        </div>
      </motion.div>

      {/* Connection lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 5 }}
      >
        {LINE_PATHS.map((d, i) => (
          <motion.path
            key={i}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.3 }}
            transition={{ delay: 2 + i * 0.1, duration: 1.5 }}
            d={d}
            stroke="url(#lineGradient)"
            strokeWidth="1"
            fill="none"
            strokeDasharray="3,3"
          />
        ))}
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#7f00ff" stopOpacity="0.4" />
            <stop offset="50%"  stopColor="#8b5cf6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute inset-0 rounded-3xl border border-primary/30 pointer-events-none shadow-2xl shadow-primary/20" />
    </motion.div>
  );
});
RightPanel.displayName = 'RightPanel';

function Hero() {
  const sectionRef     = useRef<HTMLElement>(null);
  const inView         = useInView(sectionRef, { margin: '0px 0px -10% 0px', once: false });
  const prefersReduced = useReducedMotion();

  const scrollToContact = useCallback(() => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToCases = useCallback(() => {
    document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const resolvedInView = prefersReduced ? false : inView;

  return (
    <section
      id="hero"
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16 md:pt-20"
      style={{ contain: 'layout style paint' }}
    >
      <BackgroundOrbs inView={resolvedInView} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="grid lg:grid-cols-2 gap-8 md:gap-12 items-center">
          <LeftContent
            onScrollToContact={scrollToContact}
            onScrollToCases={scrollToCases}
            inView={resolvedInView}
          />
          <RightPanel inView={resolvedInView} />
        </div>
      </div>
    </section>
  );
}

export default memo(Hero);