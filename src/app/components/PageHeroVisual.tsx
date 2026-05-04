import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import HeroAnimation from './HeroAnimation';

type Variant = 'meta' | 'google' | 'consult';

interface PageHeroVisualProps {
  variant: Variant;
  isMobile?: boolean;
}

function PageHeroVisualBase({ variant, isMobile = false }: PageHeroVisualProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [reducedMode, setReducedMode] = useState(false);

  const smoothX = useSpring(mouseX, { damping: 30, stiffness: 150 });
  const smoothY = useSpring(mouseY, { damping: 30, stiffness: 150 });

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const lowMemory =
        'deviceMemory' in navigator &&
        typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number' &&
        ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
      setReducedMode(media.matches || lowMemory);
    };

    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    mouseX.set(x / 12);
    mouseY.set(y / 12);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const config = useMemo(() => {
    if (variant === 'meta') {
      return {
        title: 'Cyber Whale in Social Ocean',
        subtitle: 'Attention flows into measurable demand',
        glow: 'from-[#E1306C]/40 via-[#833AB4]/25 to-[#405DE6]/35',
        border: 'border-[#E1306C]/30',
        chips: ['❤️ Engagement', '💬 Dialogue', '▶️ Video Intent'],
      };
    }

    if (variant === 'google') {
      return {
        title: 'Data City Command Center',
        subtitle: 'Traffic paths optimized in real time',
        glow: 'from-[#4285f4]/35 via-[#34a853]/20 to-[#fbbc04]/30',
        border: 'border-[#4285f4]/30',
        chips: ['🔍 Search', '🎯 Intent Match', '💰 Conversion Pulse'],
      };
    }

    return {
      title: 'Mentor Chamber',
      subtitle: 'Structured growth from offer to closing',
      glow: 'from-primary/40 via-accent/25 to-secondary/35',
      border: 'border-primary/30',
      chips: ['🧠 Offer', '🧲 Leadgen', '📞 Sales Path'],
    };
  }, [variant]);

  const overlay = useMotionTemplate`radial-gradient(460px circle at ${smoothX}px ${smoothY}px, rgba(255,255,255,0.12), transparent 45%)`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.15 }}
      className="order-1 lg:order-2 relative mx-auto w-full max-w-xl"
    >
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX: isMobile ? 0 : smoothY,
          rotateY: isMobile ? 0 : smoothX,
          transformPerspective: 1200,
        }}
        className={`relative overflow-hidden rounded-3xl border ${config.border} bg-card/45 p-4 sm:p-6 backdrop-blur-2xl shadow-2xl`}
      >
        <div className={`absolute -inset-20 bg-gradient-to-br ${config.glow} blur-3xl`} />
        <motion.div className="absolute inset-0" style={{ background: overlay }} />

        <div className="relative z-10 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Live Scene</p>
            <h3 className="mt-2 text-xl sm:text-2xl font-semibold text-white">{config.title}</h3>
            <p className="mt-2 text-sm text-white/70">{config.subtitle}</p>
          </div>

          <div className="relative h-[220px] sm:h-[260px] rounded-2xl overflow-hidden border border-white/10 bg-black/30">
            {!reducedMode ? (
              <HeroAnimation variant={variant} className="h-full w-full" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-white/60 text-sm">
                Static cinematic fallback
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {config.chips.map((chip, idx) => (
              <motion.div
                key={chip}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + idx * 0.08 }}
                className="rounded-xl border border-white/10 bg-black/20 px-2 py-2 text-center text-xs sm:text-sm text-white/90"
              >
                {chip}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
