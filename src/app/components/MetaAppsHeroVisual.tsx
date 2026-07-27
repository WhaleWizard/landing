import { memo, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import AutorenewRounded from '@mui/icons-material/AutorenewRounded';
import BatteryFullRounded from '@mui/icons-material/BatteryFullRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import QueryStatsRounded from '@mui/icons-material/QueryStatsRounded';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import SignalCellularAltRounded from '@mui/icons-material/SignalCellularAltRounded';
import UpdateRounded from '@mui/icons-material/UpdateRounded';
import WifiRounded from '@mui/icons-material/WifiRounded';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import './meta-apps-hero.css';

type MetaAppsHeroVisualProps = {
  inView: boolean;
};

type EventRowProps = {
  index: number;
  icon: ReactNode;
  label: string;
  status: string;
  reveal: boolean;
  reduced: boolean;
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

function EventRow({ index, icon, label, status, reveal, reduced }: EventRowProps) {
  return (
    <motion.div
      className="meta-phone-event"
      initial={reduced ? false : { opacity: 0, x: -10 }}
      animate={{ opacity: reveal ? 1 : 0, x: reveal ? 0 : -10 }}
      transition={{ delay: reduced ? 0 : 0.48 + index * 0.14, duration: 0.45 }}
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
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: string;
  delay: number;
  reveal: boolean;
  reduced: boolean;
}) {
  return (
    <motion.div
      className="meta-phone-notification"
      initial={reduced ? false : { opacity: 0, y: 16, scale: 0.97 }}
      animate={{
        opacity: reveal ? 1 : 0,
        y: reveal ? 0 : 16,
        scale: reveal ? 1 : 0.97,
      }}
      transition={{
        delay: reduced ? 0 : delay,
        duration: 0.55,
        type: 'spring',
        bounce: 0.14,
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
}: {
  reveal: boolean;
  loop: boolean;
  reduced: boolean;
}) {
  return (
    <div className="meta-phone-screen">
      <div className="meta-phone-island">
        <span />
      </div>

      <div className="meta-phone-statusbar">
        <span>9:41</span>
        <div>
          <SignalCellularAltRounded />
          <WifiRounded />
          <BatteryFullRounded />
        </div>
      </div>

      <div className="meta-phone-content">
        <div className="meta-phone-heading">
          <UpdateRounded />
          <span>События приложения</span>
        </div>

        <div className="meta-phone-events">
          <motion.div
            className="meta-phone-events__line"
            initial={reduced ? false : { scaleY: 0 }}
            animate={{ scaleY: reveal ? 1 : 0 }}
            transition={{ delay: reduced ? 0 : 0.42, duration: 0.95, ease: 'easeOut' }}
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
            icon={<DownloadRounded />}
            label="INSTALL"
            status="получено"
            reveal={reveal}
            reduced={reduced}
          />
          <EventRow
            index={1}
            icon={<PersonOutlineRounded />}
            label="SIGN_UP"
            status="получено"
            reveal={reveal}
            reduced={reduced}
          />
          <EventRow
            index={2}
            icon={<ShoppingCartOutlined />}
            label="PURCHASE"
            status="передано в Meta"
            reveal={reveal}
            reduced={reduced}
          />
          <EventRow
            index={3}
            icon={<AutorenewRounded />}
            label="SUBSCRIPTION_RENEWED"
            status="сервер"
            reveal={reveal}
            reduced={reduced}
          />
        </div>

        <div className="meta-phone-notifications">
          <PhoneNotification
            icon={<ShoppingCartOutlined />}
            title={<>Покупка передана в Meta</>}
            subtitle="Событие получено"
            delay={1.15}
            reveal={reveal}
            reduced={reduced}
          />
          <PhoneNotification
            icon={<QueryStatsRounded />}
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
          />
        </div>

        <motion.div
          className="meta-phone-final-status"
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: reveal ? 1 : 0, y: reveal ? 0 : 12 }}
          transition={{ delay: reduced ? 0 : 1.72, duration: 0.5, ease: 'easeOut' }}
        >
          <span className="meta-phone-final-status__icon">
            <CheckRounded />
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
  scrollY,
}: ReceiptProps) {
  const path = FLOAT_PATHS[index];
  const pose = RECEIPT_POSES[index];

  return (
    <motion.div
      className={`meta-receipt-slot meta-receipt-slot--${index + 1}`}
      style={{ y: reduced ? 0 : scrollY }}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, x: 34, scale: 0.94 }}
        animate={{
          opacity: reveal ? 1 : 0,
          x: reveal ? 0 : 34,
          scale: reveal ? 1 : 0.94,
        }}
        transition={{
          delay: reduced ? 0 : 0.56 + index * 0.16,
          duration: 0.68,
          type: 'spring',
          bounce: 0.18,
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
          <motion.article
            className="meta-receipt"
            style={{
              backgroundImage:
                'linear-gradient(115deg, rgba(255, 255, 255, 0.34), transparent 34%, rgba(88, 77, 56, 0.07) 100%), url("/images/meta-receipt-paper-texture.webp")',
            }}
            animate={loop ? { y: path.y, rotate: path.rotate } : { y: 0, rotate: 0 }}
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
                transition={{ delay: reduced ? 0 : 1.45, duration: 0.5, type: 'spring', bounce: 0.3 }}
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
                  delay: reduced ? 0 : 1.62,
                  duration: 0.44,
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

const MetaAppsHeroVisual = memo(({ inView }: MetaAppsHeroVisualProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneAnchorRef = useRef<HTMLDivElement>(null);
  const [phoneScale, setPhoneScale] = useState(0.48);
  const reduced = Boolean(useReducedMotion());
  const reveal = inView || reduced;
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
    reduced ? 0 : Math.max(-1.2, Math.min(1.2, value * 0.004)),
  );
  const phoneTiltX = useTransform(springY, (value) =>
    reduced ? 0 : Math.max(-0.8, Math.min(0.8, value * -0.003)),
  );

  const { scrollY } = useScroll();
  const phoneScrollY = useTransform(scrollY, [0, 900], [0, -22]);
  const receiptOneScrollY = useTransform(scrollY, [0, 900], [0, -18]);
  const receiptTwoScrollY = useTransform(scrollY, [0, 900], [0, -12]);
  const receiptThreeScrollY = useTransform(scrollY, [0, 900], [0, -25]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduced || event.pointerType === 'touch') return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseX.set(event.clientX - rect.left - rect.width / 2);
      mouseY.set(event.clientY - rect.top - rect.height / 2);
    },
    [mouseX, mouseY, reduced],
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
      style={{ position: 'relative' }}
      initial={reduced ? false : { opacity: 0, x: 34 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.75, delay: 0.18 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="meta-apps-stage">
        <div className="meta-apps-stage__glow" />
        <div className="meta-apps-stage__floor" />
        <motion.img
          className="meta-apps-stage__stone"
          src="/images/meta-hero-pedestal-rack.webp"
          alt=""
          draggable={false}
          initial={reduced ? false : { opacity: 0, y: 26, scale: 0.97 }}
          animate={{ opacity: reveal ? 1 : 0, y: reveal ? 0 : 26, scale: reveal ? 1 : 0.97 }}
          transition={{ delay: reduced ? 0 : 0.42, duration: 0.82, ease: 'easeOut' }}
        />

        <motion.div
          ref={phoneAnchorRef}
          className="meta-phone-anchor"
          style={{ y: reduced ? 0 : phoneScrollY }}
        >
          <motion.div
            className="meta-phone-enter"
            initial={reduced ? false : { opacity: 0, y: 32, rotate: 2 }}
            animate={{ opacity: reveal ? 1 : 0, y: reveal ? 0 : 32, rotate: 0 }}
            transition={{ delay: reduced ? 0 : 0.36, duration: 0.78, type: 'spring', bounce: 0.18 }}
          >
            <motion.div
              className="meta-phone-object"
              style={{ rotateX: phoneTiltX, rotateY: phoneTiltY }}
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
                        WebkitMaskImage: 'url("/images/meta-phone-screen-aperture-mask.png")',
                        maskImage: 'url("/images/meta-phone-screen-aperture-mask.png")',
                      }}
                    >
                      <div className="meta-phone-live-screen">
                        <PhoneScreen reveal={reveal} loop={loop} reduced={reduced} />
                      </div>
                    </div>
                    <img
                      className="meta-phone-shell"
                      src="/images/meta-phone-3d-shell.webp"
                      alt=""
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
          scrollY={receiptThreeScrollY}
        />
      </div>
    </motion.div>
  );
});

MetaAppsHeroVisual.displayName = 'MetaAppsHeroVisual';

export default MetaAppsHeroVisual;
