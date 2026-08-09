import { lazy, memo, Suspense, useCallback, useRef, useEffect, useState, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowRight, TrendingUp, Target, Zap, BarChart3, Sparkles, Braces, Database } from 'lucide-react';
import { Button } from './ui/button';
import { useScrollTo } from './hooks/useScrollTo';
import { useIsMobile } from './ui/use-mobile';
import { useSiteSection } from '../hooks/useServiceContent';
import {
  managedBodyClasses,
  managedBodyStyle,
  managedTitleClasses,
  managedTitleStyle,
  useManagedTitleFit,
  type ContentTypography,
} from '../utils/contentTypography';
import HeroTitleEffect, {
  resolveHeroTitleLine,
  type HeroTitleAnimation,
  type HeroTitleLine,
} from './HeroTitleEffect';

export type { HeroTitleLine } from './HeroTitleEffect';

const MetaAppsHeroVisual = lazy(() => import('./MetaAppsHeroVisual'));

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
const BackgroundOrbs = memo(({
  inView,
  staticMotion = false,
}: {
  inView: boolean;
  staticMotion?: boolean;
}) => (
  <>
    <div
      className="absolute top-1/4 left-1/4 w-64 h-64 md:w-[600px] md:h-[600px] bg-primary/30 rounded-full blur-[150px] animate-pulse pointer-events-none"
      style={{ 
        willChange: staticMotion ? 'auto' : 'opacity',
        animationPlayState: inView ? 'running' : 'paused',
        WebkitAnimationPlayState: inView ? 'running' : 'paused',
        transform: staticMotion ? 'none' : 'translateZ(0)',
      }}
    />
    <div
      className="absolute bottom-1/4 right-1/4 w-64 h-64 md:w-[600px] md:h-[600px] bg-accent/20 rounded-full blur-[150px] animate-pulse pointer-events-none"
      style={{ 
        animationDelay: '1s', 
        willChange: staticMotion ? 'auto' : 'opacity',
        animationPlayState: inView ? 'running' : 'paused',
        WebkitAnimationPlayState: inView ? 'running' : 'paused',
        transform: staticMotion ? 'none' : 'translateZ(0)',
      }}
    />
    <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-30 pointer-events-none" />
    <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-30 pointer-events-none" />
  </>
));
BackgroundOrbs.displayName = 'BackgroundOrbs';

// Три карточки статистики (дизайн не менялся)
export type HeroStat = { value: string; label: string };

export type HeroContent = {
  badge: string;
  titlePrefix: ReactNode;
  titleAccent: ReactNode;
  titleLines?: HeroTitleLine[];
  paragraphs: ReactNode[];
  primaryButton: string;
  secondaryButton: string;
  stats: HeroStat[];
  typography?: ContentTypography;
  titleAnimation?: HeroTitleAnimation;
};

export const defaultHeroContent: HeroContent = {
  badge: 'Performance-таргетинг',
  titlePrefix: 'Увеличу поток клиентов',
  titleAccent: 'через Google Ads и Meta Ads',
  paragraphs: [
    'Настраиваю рекламу, которая приводит первые заявки уже в период теста и масштабируется в прибыль — с аналитикой, по которой видно, сколько стоит заявка и клиент.',
    'В управлении — $2 млн+ рекламного бюджета и 500 000+ лидов для клиентов. Средняя окупаемость — 240% в e-commerce и B2C.',
  ],
  primaryButton: 'Обсудить проект',
  secondaryButton: 'Посмотреть кейсы',
  stats: [
    { value: '150+', label: 'кейсов' },
    { value: '$2М+', label: 'инвестировано в трафик' },
    { value: '79%', label: 'проектов окупились' },
  ],
};

function valueSizeClass(value: string) {
  const length = value?.length ?? 0;
  if (length > 8) return 'text-[11px] sm:text-sm md:text-base leading-tight break-words';
  if (length > 6) return 'text-[13px] sm:text-lg md:text-xl leading-tight';
  return 'text-[17px] sm:text-2xl md:text-3xl leading-none';
}

const StatsRow = memo(({ stats }: { stats: HeroStat[] }) => {
  return (
  <div className="grid grid-cols-3 gap-2.5 sm:gap-4 md:gap-6 pt-5 md:pt-8">
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="relative p-2.5 sm:p-3 md:p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 backdrop-blur-sm overflow-hidden"
    >
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-lg bg-primary/20 flex items-center justify-center pointer-events-none">
        <Sparkles className="w-3 h-3 sm:w-3 sm:h-3 md:w-4 md:h-4 text-primary" />
      </div>
      <div className={`min-w-0 pr-5 ${valueSizeClass(stats[0]?.value ?? '')} font-semibold md:font-bold text-primary tracking-[-0.02em]`}>{stats[0]?.value}</div>
      <div className="mt-1 min-h-8 text-[10px] sm:text-xs md:text-sm leading-snug text-muted-foreground text-pretty font-normal">{stats[0]?.label}</div>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="relative p-2.5 sm:p-3 md:p-4 rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 backdrop-blur-sm overflow-hidden"
    >
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-lg bg-accent/20 flex items-center justify-center pointer-events-none">
        <TrendingUp className="w-3 h-3 sm:w-3 sm:h-3 md:w-4 md:h-4 text-accent" />
      </div>
      <div className={`min-w-0 pr-5 ${valueSizeClass(stats[1]?.value ?? '')} font-semibold md:font-bold text-accent tracking-[-0.02em]`}>{stats[1]?.value}</div>
      <div className="mt-1 min-h-8 text-[10px] sm:text-xs md:text-sm leading-snug text-muted-foreground text-pretty font-normal">{stats[1]?.label}</div>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="relative p-2.5 sm:p-3 md:p-4 rounded-xl bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20 backdrop-blur-sm overflow-hidden"
    >
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-lg bg-secondary/20 flex items-center justify-center pointer-events-none">
        <BarChart3 className="w-3 h-3 sm:w-3 sm:h-3 md:w-4 md:h-4 text-secondary" />
      </div>
      <div className={`min-w-0 pr-5 ${valueSizeClass(stats[2]?.value ?? '')} font-semibold md:font-bold text-secondary tracking-[-0.02em]`}>{stats[2]?.value}</div>
      <div className="mt-1 min-h-8 text-[10px] sm:text-xs md:text-sm leading-snug text-muted-foreground text-pretty font-normal">{stats[2]?.label}</div>
    </motion.div>
  </div>
  );
});
StatsRow.displayName = 'StatsRow';

const META_APPS_STAT_ICONS = [
  <Braces key="sdk" />,
  <Target key="mmp" />,
  <Database key="capi" />,
];

const MetaAppsStatsStrip = memo(({
  stats,
  className = '',
  staticMotion = false,
}: {
  stats: HeroStat[];
  className?: string;
  staticMotion?: boolean;
}) => (
  <motion.div
    initial={staticMotion ? false : { opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={staticMotion ? { duration: 0 } : { delay: 0.55, duration: 0.55 }}
    className={`meta-apps-stats-strip grid grid-cols-3 overflow-hidden rounded-[22px] border border-white/12 bg-[#090b12]/92 shadow-[0_18px_55px_rgba(0,0,0,0.22)] lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none ${className}`}
  >
    {stats.map((stat, index) => (
      <div
        key={`${stat.value}-${index}`}
        className="meta-apps-stat relative flex min-w-0 flex-col items-center gap-2 px-2 py-4 text-center sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:text-left lg:px-0 lg:py-0"
      >
        {index > 0 && (
          <span className="absolute inset-y-4 left-0 w-px bg-white/12 lg:inset-y-1 lg:-left-3 lg:bg-white/10" />
        )}
        <span
          className="meta-apps-stat__icon grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-[#0c0f18] shadow-[0_8px_22px_rgba(0,0,0,0.26)] sm:h-12 sm:w-12"
          style={{
            borderColor: index === 0
              ? 'color-mix(in srgb, var(--primary) 62%, transparent)'
              : index === 1
                ? 'color-mix(in srgb, var(--accent) 62%, transparent)'
                : 'color-mix(in srgb, var(--secondary) 62%, transparent)',
            color: index === 0 ? 'var(--primary)' : index === 1 ? 'var(--accent)' : 'var(--secondary)',
          }}
        >
          <span className="[&>svg]:!h-6 [&>svg]:!w-6">{META_APPS_STAT_ICONS[index]}</span>
        </span>
        <span className="min-w-0">
          <strong
            className="meta-apps-stat__value block text-[17px] font-bold leading-none sm:text-xl"
            style={{
              color: index === 0 ? 'var(--primary)' : index === 1 ? 'var(--accent)' : 'var(--secondary)',
            }}
          >
            {stat.value}
          </strong>
          <span className="meta-apps-stat__label mt-1 block text-[10px] leading-[1.25] text-muted-foreground sm:text-xs lg:max-w-[9.5rem]">
            {stat.label}
          </span>
        </span>
      </div>
    ))}
  </motion.div>
));
MetaAppsStatsStrip.displayName = 'MetaAppsStatsStrip';

interface LeftContentProps {
  onScrollToContact: () => void;
  onScrollToCases:   () => void;
  inView: boolean;
  content: HeroContent;
  mobileFirst?: boolean;
  staticMotion?: boolean;
  statsVariant?: 'default' | 'meta-apps' | 'hidden';
  statsClassName?: string;
}

const LeftContent = memo(({
  onScrollToContact,
  onScrollToCases,
  inView,
  content,
  mobileFirst = false,
  staticMotion = false,
  statsVariant = 'default',
  statsClassName = '',
}: LeftContentProps) => {
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(content.typography, { minFontSize: 14 });
  const titleAnimation = content.titleAnimation || {};
  return (
  <motion.div
    initial={staticMotion ? false : { opacity: 0, y: 50 }}
    animate={{ opacity: 1, y: 0 }}
    transition={staticMotion ? { duration: 0 } : { duration: 0.8 }}
    // min-w-0 обязателен: строки заголовка не переносятся, а элемент сетки по
    // умолчанию не даёт себя сжать — колонка раздувалась шире экрана, и текст
    // уезжал под overflow:hidden. Теперь ширина честная, и подгонка кегля
    // успевает уменьшить заголовок вместо того, чтобы его обрезало.
    className={`min-w-0 max-w-2xl ${mobileFirst ? 'meta-apps-hero-copy order-1' : 'order-2 lg:order-1'} ${content.titleLines?.length ? 'space-y-4 md:space-y-5' : 'space-y-5 md:space-y-7'}`}
  >
    <motion.div
      className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm"
      animate={!staticMotion && inView ? {
        boxShadow: [
          '0 0 0 0 rgba(139, 92, 246, 0)',
          '0 0 20px 5px rgba(139, 92, 246, 0.3)',
          '0 0 0 0 rgba(139, 92, 246, 0)',
        ],
      } : {}}
      transition={{ duration: 2, repeat: !staticMotion && inView ? Infinity : 0 }}
      style={{ willChange: staticMotion ? 'auto' : 'box-shadow' }}
    >
      <Zap className="w-3 h-3 md:w-4 md:h-4 text-primary" />
      <span className="text-xs md:text-sm text-primary">{content.badge}</span>
    </motion.div>

    {content.titleLines?.length ? (
      <h1
        ref={titleRef}
        aria-label={content.titleLines.map((line) => line.text).join(' ')}
        className={`w-full max-w-none text-[19px] min-[360px]:text-[21px] sm:text-[25px] md:text-[32px] lg:text-[32px] xl:text-[35px] font-semibold md:font-bold leading-[1.12] tracking-[-0.025em] md:tracking-[-0.03em] ${managedTitleClasses(content.typography, 'hero')}`}
        style={managedTitleStyle(content.typography)}
      >
        {content.titleLines.map((line, index) => {
          // Ключ по позиции, а не по тексту: иначе правка буквы пересоздаёт
          // строку и эффект появления запускается заново — в предпросмотре
          // это выглядело как исчезающий и обрезанный заголовок.
          if (line.tone === 'supporting') {
            const supporting = resolveHeroTitleLine(line, titleAnimation);
            return (
              <span
                key={`line-${index}`}
                className="mt-2.5 flex items-center gap-2.5 text-[13px] min-[360px]:text-sm sm:text-base md:text-[17px] font-medium leading-snug tracking-[-0.01em] text-muted-foreground"
                style={{ display: 'flex' }}
              >
                <span
                  aria-hidden="true"
                  className="h-px w-6 sm:w-8 shrink-0 bg-gradient-to-r from-primary via-accent to-secondary opacity-80"
                />
                <HeroTitleEffect
                  as="span"
                  text={line.text}
                  effect={supporting.effect}
                  speed={supporting.speed}
                  delayMs={supporting.delayMs}
                  style={supporting.style}
                  sequenceIndex={index}
                >
                  {line.text}
                </HeroTitleEffect>
              </span>
            );
          }

          const resolved = resolveHeroTitleLine(line, titleAnimation, { display: 'block' });
          return (
            <HeroTitleEffect
              as="span"
              key={`line-${index}`}
              className={`block text-nowrap ${line.tone === 'accent' ? 'bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent pb-[0.18em] -mb-[0.18em]' : ''}`}
              style={resolved.style}
              text={line.text}
              effect={resolved.effect}
              speed={resolved.speed}
              delayMs={resolved.delayMs}
              sequenceIndex={index}
            >
              {line.text}
            </HeroTitleEffect>
          );
        })}
      </h1>
    ) : (
      <h1 ref={titleRef} style={managedTitleStyle(content.typography)} className={`max-w-[24ch] text-balance text-[clamp(1.3rem,5.9vw,2.75rem)] lg:text-[29px] xl:text-[38px] font-semibold md:font-bold leading-[1.16] tracking-[-0.025em] md:tracking-[-0.03em] ${managedTitleClasses(content.typography, 'hero')}`}>
        <HeroTitleEffect as="span" className="block" style={{ display: 'block' }} text={String(content.titlePrefix || '')} effect={titleAnimation.effect} speed={titleAnimation.speed} delayMs={titleAnimation.delayMs} sequenceIndex={0}>{content.titlePrefix}</HeroTitleEffect>{' '}
        <HeroTitleEffect as="span" className="block bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent pb-[0.18em] -mb-[0.18em]" style={{ display: 'block' }} text={String(content.titleAccent || '')} effect={titleAnimation.effect} speed={titleAnimation.speed} delayMs={titleAnimation.delayMs} sequenceIndex={1}>
          {content.titleAccent}
        </HeroTitleEffect>
      </h1>
    )}

    <div className={`space-y-3 ${mobileFirst ? 'meta-apps-hero-paragraphs' : ''}`}>
      {content.paragraphs.map((paragraph, index) => (
        <p key={index} style={managedBodyStyle(content.typography)} className={`max-w-xl text-pretty text-[15px] md:text-lg lg:text-lg text-muted-foreground leading-7 md:leading-relaxed ${managedBodyClasses(content.typography)}`}>
          {paragraph}
        </p>
      ))}
    </div>

    <div className={`flex flex-col sm:flex-row gap-3 md:gap-4 ${mobileFirst ? 'meta-apps-hero-actions' : ''}`}>
      <Button
        size="lg"
        onClick={onScrollToContact}
        className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
        <span className="relative text-center leading-tight">{content.primaryButton}</span>
        <ArrowRight className="ml-2 w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform relative" />
      </Button>
      <Button
        size="lg"
        variant="outline"
        onClick={onScrollToCases}
        className="border-primary/30 hover:bg-primary/10 backdrop-blur-sm text-sm md:text-base"
      >
        <span className="text-center leading-tight">{content.secondaryButton}</span>
      </Button>
    </div>

    {statsVariant === 'default' && <StatsRow stats={content.stats} />}
    {statsVariant === 'meta-apps' && (
      <MetaAppsStatsStrip
        stats={content.stats}
        className={statsClassName}
        staticMotion={staticMotion}
      />
    )}
  </motion.div>
  );
});
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
  showCards?: boolean;
}

const RightPanel = memo(({ inView, showCards = true }: RightPanelProps) => {
  const isTouch = useTouchDevice();

  // Опционально: отключаем hover-анимации на тач-устройствах
  const hoverProps = !isTouch ? { whileHover: { scale: 1.1, rotate: 5 } } : {};
  const hoverPropsMinus = !isTouch ? { whileHover: { scale: 1.1, rotate: -5 } } : {};
  const hoverPropsNoRotate = !isTouch ? { whileHover: { scale: 1.1 } } : {};

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="relative order-1 lg:order-2 h-[360px] sm:h-[400px] md:h-[600px]"
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
          {/* Один реальный файл вместо фиктивного srcset: параметры ?width на
              статике игнорировались, а несовпадение URL с preload давало бы
              двойную загрузку. Файл 746x720 — как раз под контейнер. */}
          <img
            src="/images/hero-portrait.jpg"
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={746}
            height={720}
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

        <Particles count={12} inView={inView} />

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

      <div className={showCards ? 'contents' : 'hidden'}>
      {/* Data Cards */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.8, type: 'spring' }}
        className="absolute top-3 left-1 md:top-6 md:left-2 w-32 sm:w-44 md:w-56 z-10 group"
      >
        <div className="relative p-2.5 md:p-5 rounded-2xl bg-background/95 backdrop-blur-2xl border border-primary/25 overflow-hidden shadow-lg shadow-black/10">
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/20 blur-2xl rounded-full pointer-events-none" />
          <div className="flex items-start justify-between mb-3 md:mb-4 relative z-10">
            <div>
              <div className="text-[9px] sm:text-[10px] md:text-xs uppercase tracking-wider text-primary/60 font-medium mb-0.5">
                Google Ads
              </div>
              <div className="text-[10px] sm:text-sm md:text-base text-muted-foreground/75 leading-tight">
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
            className="text-lg sm:text-2xl md:text-3xl font-semibold md:font-bold text-primary mb-2.5 md:mb-4 relative z-10 tracking-[-0.02em]"
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
        className="absolute top-1 right-1 md:top-4 md:right-4 w-28 sm:w-36 md:w-44 z-10 group"
      >
        <div className="relative p-2.5 md:p-5 rounded-2xl bg-background/95 backdrop-blur-2xl border border-accent/25 overflow-hidden shadow-lg shadow-black/10">
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
              <div className="text-[10px] sm:text-sm md:text-base text-muted-foreground/75 leading-tight">
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
            className="break-words text-lg sm:text-2xl md:text-3xl font-semibold md:font-bold text-accent mb-2 md:mb-3 relative z-10 leading-none tracking-[-0.02em]"
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
        className="absolute bottom-8 left-1 md:bottom-10 md:left-4 w-32 sm:w-44 md:w-56 z-10 group"
      >
        <div className="relative p-2.5 md:p-5 rounded-2xl bg-background/95 backdrop-blur-2xl border border-secondary/25 overflow-hidden shadow-lg shadow-black/10">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-secondary/40 rounded-tl-2xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-secondary/40 rounded-br-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-secondary/20 blur-3xl rounded-full pointer-events-none" />
          <div className="flex items-start justify-between mb-3 md:mb-4 relative z-10">
            <div>
              <div className="text-[9px] sm:text-[10px] md:text-xs uppercase tracking-wider text-secondary/60 font-medium mb-0.5">
                Meta Ads
              </div>
              <div className="text-[10px] sm:text-sm md:text-base text-muted-foreground/75 leading-tight">
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
            className="text-lg sm:text-2xl md:text-3xl font-semibold md:font-bold text-secondary mb-2.5 md:mb-4 relative z-10 tracking-[-0.02em]"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.5 }}
          >
            $1,200,000+
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
        className="absolute bottom-16 right-1 md:bottom-20 md:right-2 w-24 sm:w-32 md:w-40 z-10 group"
      >
        <div className="relative p-2.5 md:p-4 rounded-2xl bg-background/95 backdrop-blur-2xl border border-primary/25 overflow-hidden shadow-lg shadow-black/10">
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
            className="text-2xl sm:text-4xl md:text-5xl font-semibold md:font-bold text-primary relative z-10 leading-none tracking-[-0.03em]"
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
      </div>

      <div className="absolute inset-0 rounded-3xl border border-primary/30 pointer-events-none shadow-2xl shadow-primary/20" />
    </motion.div>
  );
});
RightPanel.displayName = 'RightPanel';

type HeroVisual = 'default' | 'meta-apps' | 'portrait';

function Hero({
  content: contentProp = defaultHeroContent,
  visual = 'default',
  contentKey = null,
  staticMotion: staticMotionProp = false,
}: {
  content?: HeroContent;
  visual?: HeroVisual;
  contentKey?: string | null;
  /**
   * Замораживает фоновое движение: частицы, кольца, пульсацию пятен. Нужен
   * предпросмотру редактора — там бесконечная анимация только жрёт кадры и
   * мешает разглядывать текст.
   */
  staticMotion?: boolean;
}) {
  const content = useSiteSection(contentKey, 'hero', contentProp);
  const sectionRef     = useRef<HTMLElement>(null);
  const inView         = useInView(sectionRef, { margin: '0px 0px -10% 0px', once: false });
  const prefersReduced = useReducedMotion();
  const isMobile       = useIsMobile();
  const { scrollToWhenReady } = useScrollTo();

  const scrollToContact = useCallback(() => {
    scrollToWhenReady('contact', { offset: 88, attempts: 20, intervalMs: 80 });
  }, [scrollToWhenReady]);

  const scrollToCases = useCallback(() => {
    scrollToWhenReady('cases', { offset: 88, attempts: 20, intervalMs: 80 });
  }, [scrollToWhenReady]);

  const isMetaApps = visual === 'meta-apps';
  // Meta Apps на телефоне и предпросмотр редактора рисуются без фонового
  // движения: там оно ничего не добавляет, а кадры съедает.
  const freezeMotion = (isMetaApps && isMobile) || staticMotionProp;
  const resolvedInView = prefersReduced || freezeMotion ? false : inView;

  return (
    <section
      id="hero"
      ref={sectionRef}
      className={`relative min-h-screen flex items-center justify-center overflow-hidden pt-16 md:pt-20 ${isMetaApps ? 'meta-apps-page-hero bg-[#08090e]' : ''}`}
      style={{ contain: 'layout style paint' }}
    >
      <BackgroundOrbs inView={resolvedInView} staticMotion={freezeMotion} />

      <div className={`relative z-10 mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 md:py-20 ${isMetaApps ? 'max-w-[1460px]' : 'max-w-7xl'}`}>
        <div className={`grid ${isMetaApps ? 'items-start gap-5 md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.95fr)] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(560px,1.1fr)] xl:gap-14' : 'items-center gap-8 md:gap-12 lg:grid-cols-2'}`}>
          <LeftContent
            onScrollToContact={scrollToContact}
            onScrollToCases={scrollToCases}
            inView={resolvedInView}
            content={content}
            mobileFirst={isMetaApps}
            staticMotion={freezeMotion}
            statsVariant={isMetaApps ? (isMobile ? 'hidden' : 'meta-apps') : 'default'}
          />
          {isMetaApps ? (
            <Suspense fallback={<div className="order-2 h-[720px] md:h-[760px] lg:h-[690px]" />}>
              <MetaAppsHeroVisual inView={resolvedInView} />
            </Suspense>
          ) : (
            <RightPanel inView={resolvedInView} showCards={visual !== 'portrait'} />
          )}
          {isMetaApps && isMobile && (
            <MetaAppsStatsStrip
              stats={content.stats}
              className="order-3"
              staticMotion
            />
          )}
        </div>
      </div>
    </section>
  );
}

export default memo(Hero);
