import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  BatteryFull,
  ChartNoAxesCombined,
  Check,
  Download,
  History,
  RefreshCw,
  ShoppingCart,
  SignalHigh,
  UserRound,
  Wifi,
} from 'lucide-react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import './meta-apps-hero.css';

type MetaAppsHeroVisualProps = {
  /**
   * Разрешено ли движение вообще: предпросмотр редактора и `prefers-reduced-motion`
   * его запрещают. Видимость визуал определяет сам — иначе значение пришлось бы
   * держать в состоянии родителя, и весь хиро перерисовывался бы на каждом
   * пересечении границы экрана.
   */
  motionAllowed: boolean;
};

type MetaAppsVisualStyle = CSSProperties & {
  '--meta-phone-aperture-mask': string;
  '--meta-receipt-paper-texture': string;
};

type EventRowProps = {
  index: number;
  icon: ReactNode;
  label: string;
  status: string;
  reveal: boolean;
  reduced: boolean;
  subtle: boolean;
};

type ReceiptProps = {
  index: number;
  number: string;
  event: string;
  status: ReactNode;
  mark?: 'check' | 'stamp';
  reveal: boolean;
  loop: boolean;
  reduced: boolean;
  subtle: boolean;
  parallax: boolean;
  scrollY: ReturnType<typeof useTransform>;
};

const FLOAT_PATHS = [
  {
    y: [0, -9, 5, -4, 0],
    rotate: [0, -0.7, 0.85, -0.35, 0],
    duration: 5.4,
  },
  {
    y: [0, 7, -6, 4, 0],
    rotate: [0, 0.8, -0.65, 0.45, 0],
    duration: 6.3,
  },
  {
    y: [0, -6, 9, -3, 0],
    rotate: [0, -0.8, 0.95, -0.4, 0],
    duration: 7.1,
  },
] as const;

/*
 * Наклоны чеков. Раньше все три были завалены в одну сторону (4.2 / 9.8 / 6.1)
 * и читались как ровная стопка. Теперь разнобой: первый валится влево, второй
 * вправо сильнее телефона, третий почти прямой. Корпус телефона в рендере
 * наклонён примерно на 11 градусов вправо — второй чек держит этот же угол,
 * чтобы разнобой не выглядел случайным.
 */
const RECEIPT_POSES = [
  { rotateZ: -6.5, rotateX: 2.4, rotateY: -7.5, translateZ: 10 },
  { rotateZ: 11.5, rotateX: -1.8, rotateY: -13.5, translateZ: 20 },
  { rotateZ: 2.5, rotateX: 3.4, rotateY: -9.5, translateZ: 13 },
] as const;

function EventRow({ index, icon, label, status, reveal, reduced, subtle }: EventRowProps) {
  const hiddenX = subtle ? -4 : -10;

  return (
    <motion.div
      className="meta-phone-event"
      initial={reduced ? false : { opacity: 0, x: hiddenX }}
      animate={{ opacity: reveal ? 1 : 0, x: reveal ? 0 : hiddenX }}
      transition={{
        delay: reduced ? 0 : subtle ? 0.2 + index * 0.08 : 0.48 + index * 0.14,
        duration: subtle ? 0.32 : 0.45,
      }}
    >
      <div className="meta-phone-event__node" />
      <div className="meta-phone-event__icon">{icon}</div>
      <div className="meta-phone-event__copy">
        <strong>{label}</strong>
        <span>{status}</span>
      </div>
    </motion.div>
  );
}

function PhoneNotification({
  icon,
  title,
  subtitle,
  delay,
  reveal,
  reduced,
  subtle,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: string;
  delay: number;
  reveal: boolean;
  reduced: boolean;
  subtle: boolean;
}) {
  const hiddenY = subtle ? 7 : 16;
  const hiddenScale = subtle ? 0.985 : 0.97;

  return (
    <motion.div
      className="meta-phone-notification"
      initial={reduced ? false : { opacity: 0, y: hiddenY, scale: hiddenScale }}
      animate={{
        opacity: reveal ? 1 : 0,
        y: reveal ? 0 : hiddenY,
        scale: reveal ? 1 : hiddenScale,
      }}
      transition={{
        delay: reduced ? 0 : subtle ? delay * 0.48 : delay,
        duration: subtle ? 0.38 : 0.55,
        type: 'spring',
        bounce: subtle ? 0.06 : 0.14,
      }}
    >
      <span className="meta-phone-notification__dot" />
      <div className="meta-phone-notification__icon">{icon}</div>
      <div className="meta-phone-notification__copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <span className="meta-phone-notification__time">сейчас</span>
    </motion.div>
  );
}

function PhoneScreen({
  reveal,
  loop,
  reduced,
  subtle,
}: {
  reveal: boolean;
  loop: boolean;
  reduced: boolean;
  subtle: boolean;
}) {
  return (
    <div className="meta-phone-screen">
      <div className="meta-phone-island">
        <span />
      </div>

      <div className="meta-phone-statusbar">
        <span>9:41</span>
        <div>
          <SignalHigh />
          <Wifi />
          <BatteryFull />
        </div>
      </div>

      <div className="meta-phone-content">
        <div className="meta-phone-heading">
          <History />
          <span>События приложения</span>
        </div>

        <div className="meta-phone-events">
          <motion.div
            className="meta-phone-events__line"
            initial={reduced ? false : { scaleY: 0 }}
            animate={{ scaleY: reveal ? 1 : 0 }}
            transition={{
              delay: reduced ? 0 : subtle ? 0.16 : 0.42,
              duration: subtle ? 0.58 : 0.95,
              ease: 'easeOut',
            }}
          />
          {loop && (
            <motion.div
              className="meta-phone-events__pulse"
              animate={{ y: ['0%', '310%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.8, ease: 'easeInOut' }}
            />
          )}

          <EventRow
            index={0}
            icon={<Download />}
            label="INSTALL"
            status="получено"
            reveal={reveal}
            reduced={reduced}
            subtle={subtle}
          />
          <EventRow
            index={1}
            icon={<UserRound />}
            label="SIGN_UP"
            status="получено"
            reveal={reveal}
            reduced={reduced}
            subtle={subtle}
          />
          <EventRow
            index={2}
            icon={<ShoppingCart />}
            label="PURCHASE"
            status="передано в Meta"
            reveal={reveal}
            reduced={reduced}
            subtle={subtle}
          />
          <EventRow
            index={3}
            icon={<RefreshCw />}
            label="SUBSCRIPTION_RENEWED"
            status="сервер"
            reveal={reveal}
            reduced={reduced}
            subtle={subtle}
          />
        </div>

        <div className="meta-phone-notifications">
          <PhoneNotification
            icon={<ShoppingCart />}
            title={<>Покупка передана в Meta</>}
            subtitle="Событие получено"
            delay={1.15}
            reveal={reveal}
            reduced={reduced}
            subtle={subtle}
          />
          <PhoneNotification
            icon={<ChartNoAxesCombined />}
            title={
              <>
                Кампания обучается
                <br />
                на ценности
              </>
            }
            subtitle="Оптимизация включена"
            delay={1.38}
            reveal={reveal}
            reduced={reduced}
            subtle={subtle}
          />
        </div>

        <motion.div
          className="meta-phone-final-status"
          initial={reduced ? false : { opacity: 0, y: subtle ? 6 : 12 }}
          animate={{ opacity: reveal ? 1 : 0, y: reveal ? 0 : subtle ? 6 : 12 }}
          transition={{
            delay: reduced ? 0 : subtle ? 0.78 : 1.72,
            duration: subtle ? 0.34 : 0.5,
            ease: 'easeOut',
          }}
        >
          <span className="meta-phone-final-status__icon">
            <Check />
          </span>
          <span>Дедупликация выполнена</span>
        </motion.div>
      </div>

      <div className="meta-phone-home-indicator" />

      <motion.div
        className="meta-phone-reflection"
        animate={loop ? { x: ['-145%', '270%'] } : { x: '-145%' }}
        transition={{ duration: 2.8, repeat: loop ? Infinity : 0, repeatDelay: 5.5, ease: 'easeInOut' }}
      />
    </div>
  );
}

function Receipt({
  index,
  number,
  event,
  status,
  mark,
  reveal,
  loop,
  reduced,
  subtle,
  parallax,
  scrollY,
}: ReceiptProps) {
  const path = FLOAT_PATHS[index];
  const pose = RECEIPT_POSES[index];
  const hiddenX = subtle ? 14 : 34;
  const hiddenScale = subtle ? 0.98 : 0.94;

  return (
    <motion.div
      className={`meta-receipt-slot meta-receipt-slot--${index + 1}`}
      style={{ y: parallax ? scrollY : 0 }}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, x: hiddenX, scale: hiddenScale }}
        animate={{
          opacity: reveal ? 1 : 0,
          x: reveal ? 0 : hiddenX,
          scale: reveal ? 1 : hiddenScale,
        }}
        transition={{
          delay: reduced ? 0 : subtle ? 0.22 + index * 0.1 : 0.56 + index * 0.16,
          duration: subtle ? 0.5 : 0.68,
          type: 'spring',
          bounce: subtle ? 0.08 : 0.18,
        }}
      >
        <div
          className="meta-receipt-angle"
          style={{
            transform:
              `perspective(920px) rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) ` +
              `rotateZ(${pose.rotateZ}deg) translateZ(${pose.translateZ}px)`,
          }}
        >
          {/*
            Кадры анимации копируются в обычные массивы: описаны они через
            `as const`, а motion ждёт изменяемый список значений и readonly-
            кортеж не принимает.
          */}
          <motion.article
            className="meta-receipt"
            style={{
              backgroundImage:
                'linear-gradient(115deg, rgba(255, 255, 255, 0.34), transparent 34%, rgba(88, 77, 56, 0.07) 100%), var(--meta-receipt-paper-texture)',
            }}
            animate={loop ? { y: [...path.y], rotate: [...path.rotate] } : { y: 0, rotate: 0 }}
            transition={{
              duration: path.duration,
              repeat: loop ? Infinity : 0,
              ease: 'easeInOut',
              delay: index * 0.37,
            }}
          >
            <div className="meta-receipt__header">
              <span>EVENT RECEIPT</span>
              <span>№ {number}</span>
            </div>
            <div className="meta-receipt__rule" />
            <strong className="meta-receipt__event">{event}</strong>
            <div className="meta-receipt__status">{status}</div>
            <div className="meta-receipt__dotted-rule" />
            <div className="meta-receipt__server">Сервер&nbsp;&nbsp;Meta</div>
            <div className="meta-receipt__date">
              <span>26.07.2026</span>
              <span>09:41</span>
            </div>

            {mark === 'check' && (
              <motion.img
                className="meta-receipt__check-image"
                src="/images/meta-verification-stamp.webp"
                alt=""
                draggable={false}
                initial={reduced ? false : { opacity: 0, scale: 0.55, rotate: -18 }}
                animate={{ opacity: reveal ? 0.72 : 0, scale: reveal ? 1 : 0.55, rotate: -7 }}
                transition={{
                  delay: reduced ? 0 : subtle ? 0.72 : 1.45,
                  duration: subtle ? 0.36 : 0.5,
                  type: 'spring',
                  bounce: subtle ? 0.12 : 0.3,
                }}
              />
            )}

            {mark === 'stamp' && (
              <motion.img
                className="meta-receipt__stamp-image"
                src="/images/meta-transfer-stamp.webp"
                alt=""
                draggable={false}
                initial={reduced ? false : { opacity: 0, scale: 1.35, rotate: -10 }}
                animate={{
                  opacity: reveal ? 0.78 : 0,
                  scale: reveal ? [1.35, 0.92, 1] : 1.35,
                  rotate: -5,
                }}
                transition={{
                  delay: reduced ? 0 : subtle ? 0.82 : 1.62,
                  duration: subtle ? 0.34 : 0.44,
                  times: [0, 0.62, 1],
                  ease: 'easeOut',
                }}
              />
            )}
          </motion.article>
        </div>
      </motion.div>
    </motion.div>
  );
}

const MOBILE_STATIC_MEDIA = '(max-width: 767px), (hover: none) and (pointer: coarse)';

function useMobileViewport() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_STATIC_MEDIA).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(MOBILE_STATIC_MEDIA);
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return mobile;
}

const MetaAppsHeroVisual = memo(({ motionAllowed }: MetaAppsHeroVisualProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneAnchorRef = useRef<HTMLDivElement>(null);
  const [phoneScale, setPhoneScale] = useState(0.48);
  const [onScreen, setOnScreen] = useState(false);
  const reduced = Boolean(useReducedMotion());
  const mobile = useMobileViewport();
  const subtleMotion = mobile && !reduced;

  // Наблюдение живёт здесь, а не в Hero: перерисовывается только сам визуал,
  // а не весь первый экран вместе с заголовком и кнопками.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(Boolean(entry?.isIntersecting)),
      { rootMargin: '0px 0px -10% 0px', threshold: 0 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const inView = motionAllowed && onScreen;
  // Параллакс на телефоне остаётся выключенным: он считается от курсора и от
  // положения прокрутки, то есть работает ровно в те кадры, которые нужны
  // самой прокрутке. А постоянные петли — блик по экрану и парение чеков —
  // идут и на телефоне: их ведёт композитор, и без них первый экран выглядел
  // мёртвым именно на смартфоне.
  const parallaxEnabled = inView && !reduced && !mobile;
  const reveal = inView || mobile || reduced;
  const loop = inView && !reduced;

  useLayoutEffect(() => {
    const anchor = phoneAnchorRef.current;
    if (!anchor) return undefined;

    const updateScale = () => {
      setPhoneScale(anchor.getBoundingClientRect().width / 770);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 70, damping: 20, mass: 0.7 });
  const springY = useSpring(mouseY, { stiffness: 70, damping: 20, mass: 0.7 });
  const phoneTiltY = useTransform(springX, (value) =>
    Math.max(-1.2, Math.min(1.2, value * 0.004)),
  );
  const phoneTiltX = useTransform(springY, (value) =>
    Math.max(-0.8, Math.min(0.8, value * -0.003)),
  );

  const parallaxScrollY = useMotionValue(0);
  const phoneScrollY = useTransform(parallaxScrollY, [0, 900], [0, -22]);
  const receiptOneScrollY = useTransform(parallaxScrollY, [0, 900], [0, -18]);
  const receiptTwoScrollY = useTransform(parallaxScrollY, [0, 900], [0, -12]);
  const receiptThreeScrollY = useTransform(parallaxScrollY, [0, 900], [0, -25]);

  useEffect(() => {
    if (!parallaxEnabled) {
      parallaxScrollY.set(0);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      parallaxScrollY.set(window.scrollY);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
    };
  }, [parallaxEnabled, parallaxScrollY]);

  useEffect(() => {
    if (parallaxEnabled) return;
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY, parallaxEnabled]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!parallaxEnabled || event.pointerType === 'touch') return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseX.set(event.clientX - rect.left - rect.width / 2);
      mouseY.set(event.clientY - rect.top - rect.height / 2);
    },
    [mouseX, mouseY, parallaxEnabled],
  );

  const handlePointerLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      ref={containerRef}
      aria-hidden="true"
      className="meta-apps-visual"
      style={{
        position: 'relative',
        '--meta-phone-aperture-mask':
          'url("/images/meta-phone-screen-aperture-mask.png")',
        '--meta-receipt-paper-texture': mobile
          ? 'url("/images/meta-receipt-paper-texture-mobile.webp")'
          : 'url("/images/meta-receipt-paper-texture.webp")',
      } as MetaAppsVisualStyle}
      initial={reduced ? false : { opacity: 0, x: subtleMotion ? 12 : 34 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: subtleMotion ? 0.52 : 0.75,
        delay: subtleMotion ? 0.06 : 0.18,
      }}
      onPointerMove={parallaxEnabled ? handlePointerMove : undefined}
      onPointerLeave={parallaxEnabled ? handlePointerLeave : undefined}
    >
      <div className="meta-apps-stage">
        <div className="meta-apps-stage__glow" />
        <div className="meta-apps-stage__floor" />
        <motion.img
          className="meta-apps-stage__stone"
          src="/images/meta-hero-pedestal-rack.webp"
          srcSet="/images/meta-hero-pedestal-rack-mobile.webp 768w, /images/meta-hero-pedestal-rack-medium.webp 1152w, /images/meta-hero-pedestal-rack.webp 1536w"
          sizes="(max-width: 767px) 100vw, 768px"
          alt=""
          width={1536}
          height={1024}
          loading="eager"
          decoding="async"
          fetchpriority="high"
          draggable={false}
          initial={reduced ? false : {
            opacity: 0,
            y: subtleMotion ? 10 : 26,
            scale: subtleMotion ? 0.99 : 0.97,
          }}
          animate={{ opacity: reveal ? 1 : 0, y: reveal ? 0 : 26, scale: reveal ? 1 : 0.97 }}
          transition={{
            delay: reduced ? 0 : subtleMotion ? 0.08 : 0.42,
            duration: subtleMotion ? 0.5 : 0.82,
            ease: 'easeOut',
          }}
        />

        <motion.div
          ref={phoneAnchorRef}
          className="meta-phone-anchor"
          style={{ y: parallaxEnabled ? phoneScrollY : 0 }}
        >
          <motion.div
            className="meta-phone-enter"
            initial={reduced ? false : {
              opacity: 0,
              y: subtleMotion ? 12 : 32,
              rotate: subtleMotion ? 0.6 : 2,
            }}
            animate={{ opacity: reveal ? 1 : 0, y: reveal ? 0 : 32, rotate: 0 }}
            transition={{
              delay: reduced ? 0 : subtleMotion ? 0.12 : 0.36,
              duration: subtleMotion ? 0.56 : 0.78,
              type: 'spring',
              bounce: subtleMotion ? 0.08 : 0.18,
            }}
          >
            <motion.div
              className="meta-phone-object"
              style={parallaxEnabled ? { rotateX: phoneTiltX, rotateY: phoneTiltY } : undefined}
            >
              <motion.div
                className="meta-phone-float"
                animate={loop ? { y: [0, -4, 0] } : { y: 0 }}
                transition={{ duration: 5.8, repeat: loop ? Infinity : 0, ease: 'easeInOut' }}
              >
                <div className="meta-phone-frame">
                  <div
                    className="meta-phone-canvas"
                    style={{ transform: `scale(${phoneScale})` }}
                  >
                    <div
                      className="meta-phone-aperture"
                      style={{
                        WebkitMaskImage: 'var(--meta-phone-aperture-mask)',
                        maskImage: 'var(--meta-phone-aperture-mask)',
                      }}
                    >
                      <div className="meta-phone-live-screen">
                        <PhoneScreen
                          reveal={reveal}
                          loop={loop}
                          reduced={reduced}
                          subtle={subtleMotion}
                        />
                      </div>
                    </div>
                    <img
                      className="meta-phone-shell"
                      src="/images/meta-phone-3d-shell.webp"
                      srcSet="/images/meta-phone-3d-shell-mobile.webp 462w, /images/meta-phone-3d-shell-medium.webp 616w, /images/meta-phone-3d-shell.webp 770w"
                      sizes="(max-width: 767px) 210px, 385px"
                      alt=""
                      width={770}
                      height={1270}
                      loading="eager"
                      decoding="async"
                      fetchpriority="high"
                      draggable={false}
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>

        <Receipt
          index={0}
          number="001"
          event="INSTALL"
          status="получено"
          reveal={reveal}
          loop={loop}
          reduced={reduced}
          subtle={subtleMotion}
          parallax={parallaxEnabled}
          scrollY={receiptOneScrollY}
        />
        <Receipt
          index={1}
          number="002"
          event="SUBSCRIPTION"
          status="сервер подтверждён"
          mark="check"
          reveal={reveal}
          loop={loop}
          reduced={reduced}
          subtle={subtleMotion}
          parallax={parallaxEnabled}
          scrollY={receiptTwoScrollY}
        />
        <Receipt
          index={2}
          number="003"
          event="PURCHASE"
          status="передано в Meta"
          mark="stamp"
          reveal={reveal}
          loop={loop}
          reduced={reduced}
          subtle={subtleMotion}
          parallax={parallaxEnabled}
          scrollY={receiptThreeScrollY}
        />
      </div>
    </motion.div>
  );
});

MetaAppsHeroVisual.displayName = 'MetaAppsHeroVisual';

export default MetaAppsHeroVisual;
