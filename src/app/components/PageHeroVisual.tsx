import { memo, useMemo, useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';

type Variant = 'meta' | 'google' | 'consult';

interface PageHeroVisualProps {
  variant: Variant;
  isMobile?: boolean;
}

function PageHeroVisualBase({ variant, isMobile = false }: PageHeroVisualProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const smoothX = useSpring(mouseX, { damping: 30, stiffness: 150 });
  const smoothY = useSpring(mouseY, { damping: 30, stiffness: 150 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    mouseX.set(x / 8);
    mouseY.set(y / 8);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const config = useMemo(() => {
    if (variant === 'meta') {
      return {
        title: 'Attention Engine',
        subtitle: 'Reels • Stories • Feed',
        glow: 'from-[#E1306C]/40 via-[#833AB4]/25 to-[#405DE6]/35',
        border: 'border-[#E1306C]/30',
        chips: ['CTR +42%', 'CPL -27%', 'ROAS x3.1'],
      };
    }

    if (variant === 'google') {
      return {
        title: 'Performance Core',
        subtitle: 'Search • PMax • Shopping',
        glow: 'from-[#4285f4]/35 via-[#34a853]/20 to-[#fbbc04]/30',
        border: 'border-[#4285f4]/30',
        chips: ['CPC -36%', 'QS 8.9', 'Conv. +58%'],
      };
    }

    return {
      title: 'Growth System',
      subtitle: 'Strategy • Offer • Pipeline',
      glow: 'from-primary/40 via-accent/25 to-secondary/35',
      border: 'border-primary/30',
      chips: ['Clients +', 'Offer ↑', 'Income ↑'],
    };
  }, [variant]);

  const overlay = useMotionTemplate`radial-gradient(500px circle at ${smoothX}px ${smoothY}px, rgba(255,255,255,0.12), transparent 45%)`;

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
        className={`relative overflow-hidden rounded-3xl border ${config.border} bg-card/45 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl`}
      >
        <div className={`absolute -inset-20 bg-gradient-to-br ${config.glow} blur-3xl`} />
        <motion.div className="absolute inset-0" style={{ background: overlay }} />

        <div className="relative z-10 space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Live Signal</p>
            <h3 className="mt-2 text-2xl sm:text-3xl font-semibold text-white">{config.title}</h3>
            <p className="mt-2 text-sm text-white/70">{config.subtitle}</p>
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

          <div className="space-y-3">
            {[72, 54, 89].map((v, idx) => (
              <div key={idx} className="space-y-1">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${v}%` }}
                    transition={{ duration: 1.2, delay: 0.35 + idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-white/70 to-white/30"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
