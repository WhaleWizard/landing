import { memo, useCallback, useRef, type ReactNode } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  Apple,
  BarChart3,
  Battery,
  Bell,
  CreditCard,
  Download,
  Home,
  Play,
  Rocket,
  Settings,
  Signal,
  Star,
  Users,
  Wifi,
} from 'lucide-react';

type MetaAppsHeroVisualProps = {
  inView: boolean;
};

// Статичные данные частиц — считаются один раз, не пересоздаются на рендерах
const PARTICLE_DATA = Array.from({ length: 8 }, (_, i) => ({
  size: Math.random() * 2.5 + 1.5,
  left: `${18 + Math.random() * 64}%`,
  top: `${14 + Math.random() * 70}%`,
  dur: 5 + Math.random() * 3,
  delay: Math.random() * 4,
  color: i % 2 === 0 ? 'rgba(79, 125, 255, 0.55)' : 'rgba(176, 77, 255, 0.55)',
}));

const CHART_PATH = 'M 0,44 C 12,40 20,42 30,34 C 42,24 50,28 62,18 C 74,10 84,12 100,4';

// Liquid glass: полупрозрачное стекло с верхней световой кромкой и диагональным бликом
function GlassCard({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`relative overflow-hidden border border-white/12 bg-white/[0.07] backdrop-blur-2xl shadow-[0_8px_32px_rgba(2,6,23,0.45)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(115deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 20%, transparent 45%)',
        }}
      />
      {children}
    </div>
  );
}

// Мини-график внутри карточки ROAS
function Sparkline({ inView }: { inView: boolean }) {
  return (
    <svg className="w-full h-4 md:h-5" viewBox="0 0 60 20" preserveAspectRatio="none">
      <motion.path
        d="M 0,16 L 12,13 L 24,14 L 36,8 L 48,9 L 60,3"
        stroke="url(#appSparkGradient)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: inView ? 1 : 0 }}
        transition={{ delay: 1.2, duration: 1.1 }}
      />
      <defs>
        <linearGradient id="appSparkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Экран телефона: мини-дашборд приложения
function PhoneScreen({ inView }: { inView: boolean }) {
  return (
    <div className="flex h-full flex-col gap-2 md:gap-2.5 p-3 md:p-4 pt-7 md:pt-8">
      {/* Всплывающий пуш о новой установке */}
      {inView && (
        <motion.div
          className="absolute inset-x-2 top-7 md:inset-x-3 md:top-9 z-20"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: [-60, 0, 0, -60], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 6, times: [0, 0.12, 0.85, 1], repeat: Infinity, repeatDelay: 3.5, delay: 2.5, ease: 'easeInOut' }}
          style={{ willChange: 'transform, opacity' }}
        >
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#161c30]/95 px-2 py-1.5 md:px-2.5 md:py-2 backdrop-blur-xl shadow-lg shadow-black/50">
            <div className="flex h-5 w-5 md:h-6 md:w-6 shrink-0 items-center justify-center rounded-md md:rounded-lg bg-gradient-to-br from-primary to-accent">
              <Download className="h-2.5 w-2.5 md:h-3 md:w-3 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[8px] md:text-[10px] font-semibold leading-tight text-white">Новая установка</div>
              <div className="text-[7px] md:text-[8px] leading-tight text-white/50">только что • Instagram Ads</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Статус-бар */}
      <div className="flex items-center justify-between px-1 text-[8px] md:text-[9px] font-medium text-white/60">
        <span>9:41</span>
        <div className="flex items-center gap-1 md:gap-1.5">
          <Signal className="h-2 w-2 md:h-2.5 md:w-2.5" />
          <Wifi className="h-2 w-2 md:h-2.5 md:w-2.5" />
          <Battery className="h-2.5 w-2.5 md:h-3 md:w-3" />
        </div>
      </div>

      {/* Шапка приложения */}
      <div className="flex items-center gap-2 md:gap-2.5">
        <div className="flex h-7 w-7 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg md:rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30">
          <Rocket className="h-3.5 w-3.5 md:h-4 md:w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] md:text-xs font-semibold text-white leading-tight">Whale App</div>
          <div className="text-[8px] md:text-[10px] text-white/45 leading-tight">Growth dashboard</div>
        </div>
      </div>

      {/* График роста */}
      <div className="rounded-xl border border-white/10 bg-white/[0.05] p-2.5 md:p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[8px] md:text-[10px] uppercase tracking-wider text-white/40">Установки</span>
          <span className="text-[9px] md:text-[11px] font-semibold text-primary">+12%</span>
        </div>
        <svg className="h-10 md:h-14 w-full" viewBox="0 0 100 48" preserveAspectRatio="none">
          <motion.path
            d={`${CHART_PATH} L 100,48 L 0,48 Z`}
            fill="url(#appAreaGradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: inView ? 1 : 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
          />
          <motion.path
            d={CHART_PATH}
            stroke="url(#appLineGradient)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: inView ? 1 : 0 }}
            transition={{ delay: 0.7, duration: 1.4, ease: 'easeOut' }}
          />
          <defs>
            <linearGradient id="appLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
            <linearGradient id="appAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Метрики */}
      <div className="space-y-1.5 md:space-y-2">
        <div className="flex items-center gap-2 rounded-lg md:rounded-xl border border-white/10 bg-white/[0.05] px-2 py-1.5 md:px-2.5 md:py-2">
          <Download className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0 text-primary" />
          <span className="flex-1 truncate text-[9px] md:text-[11px] text-white/70">Установки сегодня</span>
          <span className="text-[9px] md:text-[11px] font-semibold text-white">1 284</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg md:rounded-xl border border-white/10 bg-white/[0.05] px-2 py-1.5 md:px-2.5 md:py-2">
          <CreditCard className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0 text-accent" />
          <span className="flex-1 truncate text-[9px] md:text-[11px] text-white/70">Подписки</span>
          <span className="text-[9px] md:text-[11px] font-semibold text-white">241</span>
        </div>
      </div>

      {/* CTA + таб-бар + home-индикатор */}
      <div className="mt-auto space-y-1.5 md:space-y-2">
        <div className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-accent py-1.5 md:py-2.5 shadow-lg shadow-primary/30">
          <Download className="h-3 w-3 md:h-3.5 md:w-3.5 text-white" />
          <span className="text-[10px] md:text-xs font-semibold text-white">Установить</span>
        </div>
        <div className="flex items-center justify-around rounded-xl md:rounded-2xl border border-white/10 bg-white/[0.05] px-1 py-1.5 md:py-2">
          <div className="flex flex-col items-center gap-0.5">
            <Home className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary" />
            <span className="h-0.5 w-0.5 rounded-full bg-primary" />
          </div>
          <BarChart3 className="h-3 w-3 md:h-3.5 md:w-3.5 text-white/35" />
          <Bell className="h-3 w-3 md:h-3.5 md:w-3.5 text-white/35" />
          <Settings className="h-3 w-3 md:h-3.5 md:w-3.5 text-white/35" />
        </div>
        <div className="mx-auto h-[3px] w-12 md:w-16 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

const MetaAppsHeroVisual = memo(({ inView }: MetaAppsHeroVisualProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  // Позиция курсора в px от центра контейнера. Motion values обновляются
  // напрямую (без setState) — React не ре-рендерится на каждое движение мыши.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 18, mass: 0.6 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 18, mass: 0.6 });

  // Разная глубина параллакса: свечение ходит за курсором, телефон чуть
  // «сопротивляется» (обратный знак), карточки плывут с разной скоростью.
  const glowX = useTransform(springX, (v) => (prefersReduced ? 0 : v * 0.9));
  const glowY = useTransform(springY, (v) => (prefersReduced ? 0 : v * 0.9));
  const phoneX = useTransform(springX, (v) => (prefersReduced ? 0 : v * -0.02));
  const phoneY = useTransform(springY, (v) => (prefersReduced ? 0 : v * -0.02));
  // 3D-наклон корпуса за курсором (ограничен ±7°/±6°)
  const phoneTiltY = useTransform(springX, (v) => (prefersReduced ? 0 : Math.max(-7, Math.min(7, v * 0.022))));
  const phoneTiltX = useTransform(springY, (v) => (prefersReduced ? 0 : Math.max(-6, Math.min(6, v * -0.018))));
  const cardAX = useTransform(springX, (v) => (prefersReduced ? 0 : v * 0.05));
  const cardAY = useTransform(springY, (v) => (prefersReduced ? 0 : v * 0.05));
  const cardBX = useTransform(springX, (v) => (prefersReduced ? 0 : v * 0.07));
  const cardBY = useTransform(springY, (v) => (prefersReduced ? 0 : v * 0.07));
  const cardCX = useTransform(springX, (v) => (prefersReduced ? 0 : v * 0.06));
  const cardCY = useTransform(springY, (v) => (prefersReduced ? 0 : v * 0.06));
  const cardDX = useTransform(springX, (v) => (prefersReduced ? 0 : v * 0.04));
  const cardDY = useTransform(springY, (v) => (prefersReduced ? 0 : v * 0.04));

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseX.set(e.clientX - rect.left - rect.width / 2);
      mouseY.set(e.clientY - rect.top - rect.height / 2);
    },
    [mouseX, mouseY],
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative order-1 lg:order-2 h-[430px] sm:h-[500px] md:h-[620px] lg:h-[660px]"
    >
      {/* Студийная сцена: тёмный фон-виньетка + спот сверху + свет на «полу» */}
      <div className="absolute inset-0 overflow-hidden rounded-[2rem]">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 95% at 50% 0%, rgba(17, 21, 40, 0.92) 0%, rgba(9, 12, 22, 0.95) 48%, rgba(4, 6, 12, 0.97) 100%)',
          }}
        />
        {/* Мягкий спотлайт сверху */}
        <div
          className="absolute inset-x-0 top-0 h-[65%] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 55% 48% at 50% 0%, rgba(255,255,255,0.08) 0%, color-mix(in srgb, var(--primary) 9%, transparent) 38%, transparent 72%)',
          }}
        />
        {/* Световое пятно на полу под телефоном */}
        <div
          className="absolute inset-x-0 bottom-0 h-[32%] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 46% 65% at 50% 100%, color-mix(in srgb, var(--primary) 13%, transparent) 0%, transparent 72%)',
          }}
        />
        {/* Едва заметная точечная сетка */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.045) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 75% 75% at 50% 50%, black 25%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 75% 75% at 50% 50%, black 25%, transparent 75%)',
          }}
        />
        {/* Приглушённое свечение за курсором */}
        <motion.div
          className="absolute left-1/2 top-1/2 -ml-[230px] -mt-[230px] h-[460px] w-[460px] rounded-full pointer-events-none blur-3xl"
          style={{
            x: glowX,
            y: glowY,
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--primary) 15%, transparent) 0%, color-mix(in srgb, var(--accent) 8%, transparent) 45%, transparent 70%)',
            willChange: 'transform',
          }}
        />
      </div>

      {/* Голографические кольца вокруг телефона */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[0, 1].map((i) => (
          <motion.div
            key={`ring-${i}`}
            className="absolute rounded-full border"
            style={{
              width: 'min(60%, 340px)',
              aspectRatio: '1',
              borderColor:
                i === 0
                  ? 'color-mix(in srgb, var(--primary) 35%, transparent)'
                  : 'color-mix(in srgb, var(--accent) 35%, transparent)',
              willChange: 'transform, opacity',
            }}
            animate={
              inView
                ? { scale: [1, 2.2, 1], opacity: [0.12, 0, 0.12] }
                : { scale: 1, opacity: 0.12 }
            }
            transition={{ duration: 8, repeat: inView ? Infinity : 0, delay: i * 4, ease: 'easeOut' }}
          />
        ))}
      </div>

      {/* Частицы */}
      {inView &&
        PARTICLE_DATA.map((p, i) => (
          <motion.div
            key={`app-particle-${i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: p.size,
              height: p.size,
              left: p.left,
              top: p.top,
              background: p.color,
              boxShadow: `0 0 6px ${p.color}`,
              willChange: 'transform, opacity',
            }}
            animate={{ y: [0, -50, 0], opacity: [0, 0.7, 0] }}
            transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
          />
        ))}

      {/* Телефон по центру: 3D-наклон за курсором, металлический корпус, безель */}
      <motion.div
        className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none"
        style={{ x: phoneX, y: phoneY, perspective: 1200 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, rotate: 0 }}
          animate={{ opacity: 1, y: 0, rotate: -2 }}
          transition={{ delay: 0.5, duration: 0.9, type: 'spring', bounce: 0.25 }}
          className="relative"
        >
          {/* Тень под корпусом */}
          <div className="absolute -bottom-7 left-1/2 h-7 w-[70%] -translate-x-1/2 rounded-[100%] bg-black/55 blur-xl pointer-events-none" />

          <motion.div
            style={{ rotateX: phoneTiltX, rotateY: phoneTiltY, willChange: 'transform' }}
            className="relative h-[330px] w-[168px] sm:h-[390px] sm:w-[196px] md:h-[490px] md:w-[245px]"
          >
            {/* Узкий контурный свет по краю корпуса (rim light) */}
            <div
              className="absolute -inset-1.5 rounded-[2.4rem] md:rounded-[2.9rem] pointer-events-none blur-md opacity-70"
              style={{
                background:
                  'linear-gradient(160deg, color-mix(in srgb, var(--primary) 55%, transparent), color-mix(in srgb, var(--accent) 40%, transparent))',
              }}
            />

            {/* Боковые кнопки: громкость слева, питание справа */}
            <div className="absolute -left-[2px] top-[24%] h-[4%] w-[3px] rounded-l-md bg-gradient-to-b from-white/45 via-white/20 to-white/35" />
            <div className="absolute -left-[2px] top-[30%] h-[7%] w-[3px] rounded-l-md bg-gradient-to-b from-white/45 via-white/20 to-white/35" />
            <div className="absolute -left-[2px] top-[38.5%] h-[7%] w-[3px] rounded-l-md bg-gradient-to-b from-white/45 via-white/20 to-white/35" />
            <div className="absolute -right-[2px] top-[30%] h-[10%] w-[3px] rounded-r-md bg-gradient-to-b from-white/45 via-white/20 to-white/35" />

            {/* Металлическая кромка корпуса */}
            <div className="relative h-full w-full rounded-[2.2rem] md:rounded-[2.7rem] bg-gradient-to-b from-white/35 via-white/12 to-white/28 p-[2px] shadow-2xl shadow-black/50">
              {/* Чёрный безель вокруг экрана */}
              <div className="h-full w-full rounded-[2.1rem] md:rounded-[2.55rem] bg-black p-[3px] md:p-[4px]">
                <div className="relative h-full w-full overflow-hidden rounded-[1.85rem] md:rounded-[2.3rem] bg-[#0b0e17]">
                  {/* Динамический остров с камерой */}
                  <div className="absolute left-1/2 top-2 md:top-2.5 z-30 flex h-3.5 w-16 md:h-4 md:w-20 -translate-x-1/2 items-center justify-end rounded-full bg-black pr-1.5 md:pr-2">
                    <div className="relative h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-[#151a28] ring-1 ring-white/10">
                      <div className="absolute right-[1px] top-[1px] h-[3px] w-[3px] rounded-full bg-blue-400/60" />
                    </div>
                  </div>
                  <PhoneScreen inView={inView} />
                  {/* Статичное стеклянное отражение экрана */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(115deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 22%, transparent 45%)',
                    }}
                  />
                  {/* Периодический блик, пробегающий по экрану */}
                  <motion.div
                    className="pointer-events-none absolute inset-y-0 w-1/2"
                    style={{
                      background:
                        'linear-gradient(105deg, transparent, rgba(255,255,255,0.10), transparent)',
                      willChange: 'transform',
                    }}
                    animate={inView ? { x: ['-130%', '280%'] } : { x: '-130%' }}
                    transition={{ duration: 2.6, repeat: inView ? Infinity : 0, repeatDelay: 4.5, ease: 'easeInOut', delay: 1.6 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Карточка: Установки */}
      <motion.div
        className="absolute top-4 left-0 md:top-10 md:left-2 z-10 w-32 sm:w-40 md:w-48"
        style={{ x: cardAX, y: cardAY }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, duration: 0.7, type: 'spring' }}
        >
          <GlassCard className="rounded-2xl p-2.5 md:p-4">
            <div className="absolute top-0 right-0 h-14 w-14 rounded-full bg-primary/25 blur-2xl pointer-events-none" />
            <div className="relative z-10 mb-2 flex items-start justify-between md:mb-3">
              <div>
                <div className="mb-0.5 text-[9px] md:text-[11px] font-medium uppercase tracking-wider text-white/50">
                  Установки
                </div>
                <div className="text-[10px] md:text-sm leading-tight text-white/40">от $0.3</div>
              </div>
              <div className="flex h-7 w-7 md:h-9 md:w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10">
                <Download className="h-3 w-3 md:h-4 md:w-4 text-primary" />
              </div>
            </div>
            <div className="relative z-10 mb-2 text-lg sm:text-2xl md:text-3xl font-semibold md:font-bold tracking-[-0.02em] text-primary md:mb-3">
              80 000+
            </div>
            <motion.div
              className="relative z-10 h-0.5 md:h-1 overflow-hidden rounded-full bg-white/15"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.2, duration: 0.7 }}
              style={{ transformOrigin: 'left', willChange: 'transform' }}
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 0.82 }}
                transition={{ delay: 1.4, duration: 0.8 }}
                style={{ transformOrigin: 'left', willChange: 'transform' }}
              />
            </motion.div>
          </GlassCard>
        </motion.div>
      </motion.div>

      {/* Карточка: ROAS */}
      <motion.div
        className="absolute top-0 right-0 md:top-4 md:right-2 z-10 w-28 sm:w-36 md:w-40"
        style={{ x: cardBX, y: cardBY }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9, duration: 0.7, type: 'spring' }}
        >
          <GlassCard className="rounded-2xl p-2.5 md:p-4">
            <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-accent/25 blur-2xl pointer-events-none" />
            <div className="relative z-10 mb-1.5 flex items-start justify-between md:mb-2">
              <div>
                <div className="mb-0.5 text-[9px] md:text-[11px] font-medium uppercase tracking-wider text-white/50">
                  ROAS
                </div>
                <div className="text-[10px] md:text-sm leading-tight text-white/40">в среднем</div>
              </div>
              <div className="flex h-7 w-7 md:h-9 md:w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10">
                <BarChart3 className="h-3 w-3 md:h-4 md:w-4 text-accent" />
              </div>
            </div>
            <div className="relative z-10 mb-1.5 text-xl sm:text-3xl md:text-4xl font-semibold md:font-bold leading-none tracking-[-0.03em] text-accent md:mb-2">
              165%
            </div>
            <div className="relative z-10">
              <Sparkline inView={inView} />
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>

      {/* Карточка: конверсия в оплату */}
      <motion.div
        className="absolute bottom-10 left-0 md:bottom-14 md:left-4 z-10 w-32 sm:w-40 md:w-44"
        style={{ x: cardCX, y: cardCY }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.0, duration: 0.7, type: 'spring' }}
        >
          <GlassCard className="rounded-2xl p-2.5 md:p-4">
            <div className="absolute bottom-0 left-0 h-16 w-16 rounded-full bg-secondary/25 blur-2xl pointer-events-none" />
            <div className="relative z-10 mb-1.5 flex items-start justify-between md:mb-2">
              <div>
                <div className="mb-0.5 text-[9px] md:text-[11px] font-medium uppercase tracking-wider text-white/50">
                  В оплату
                </div>
                <div className="text-[10px] md:text-sm leading-tight text-white/40">из триала</div>
              </div>
              <div className="flex h-7 w-7 md:h-9 md:w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10">
                <Users className="h-3 w-3 md:h-4 md:w-4 text-secondary" />
              </div>
            </div>
            <div className="relative z-10 mb-1.5 text-xl sm:text-3xl md:text-4xl font-semibold md:font-bold leading-none tracking-[-0.03em] text-secondary md:mb-2">
              19%
            </div>
            <div className="relative z-10 flex items-end gap-1 md:gap-1.5 h-4 md:h-5">
              {[45, 60, 78, 66, 90].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-1 md:w-1.5 rounded-full bg-gradient-to-t from-secondary/80 to-accent/80"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 1.5 + i * 0.08, duration: 0.4 }}
                  style={{ height: `${h}%`, transformOrigin: 'bottom', willChange: 'transform' }}
                />
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>

      {/* Стеклянные чипы сторов с рейтингами */}
      <motion.div
        className="absolute bottom-2 right-0 md:bottom-6 md:right-3 z-10 flex flex-col gap-2"
        style={{ x: cardDX, y: cardDY }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8, x: 16 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ delay: 1.1, duration: 0.6, type: 'spring' }}
        >
          <GlassCard className="rounded-xl px-2.5 py-1.5 md:px-3.5 md:py-2">
            <div className="relative z-10 flex items-center gap-2 md:gap-2.5">
              <Apple className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-white" />
              <div>
                <div className="text-[8px] md:text-[9px] leading-none text-white/50">App Store</div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] md:text-xs font-semibold leading-none text-white">
                  4.8
                  <Star className="h-2.5 w-2.5 md:h-3 md:w-3 fill-amber-300 text-amber-300" />
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.8, x: 16 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ delay: 1.25, duration: 0.6, type: 'spring' }}
        >
          <GlassCard className="rounded-xl px-2.5 py-1.5 md:px-3.5 md:py-2">
            <div className="relative z-10 flex items-center gap-2 md:gap-2.5">
              <Play className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 fill-white/90 text-white" />
              <div>
                <div className="text-[8px] md:text-[9px] leading-none text-white/50">Google Play</div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] md:text-xs font-semibold leading-none text-white">
                  4.7
                  <Star className="h-2.5 w-2.5 md:h-3 md:w-3 fill-amber-300 text-amber-300" />
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>

      {/* Стеклянная рамка панели */}
      <div className="absolute inset-0 rounded-[2rem] border border-white/10 pointer-events-none shadow-2xl shadow-primary/15" />
      <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
    </motion.div>
  );
});

MetaAppsHeroVisual.displayName = 'MetaAppsHeroVisual';

export default MetaAppsHeroVisual;
