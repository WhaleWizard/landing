import { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';

type Variant = 'meta' | 'google' | 'consult';

interface HeroAnimationProps {
  variant: Variant;
  className?: string;
}

function FloatingIcon({ label, className, delay = 0, duration = 8 }: { label: string; className: string; delay?: number; duration?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: [0.25, 0.95, 0.25], y: [0, -14, 0], x: [0, 8, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
      className={`absolute flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-base shadow-lg backdrop-blur ${className}`}
    >
      {label}
    </motion.div>
  );
}

function MetaScene2D({ reduced }: { reduced: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#12081a] via-[#1a0d2f] to-[#090711]">
      <motion.div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(225,48,108,.18),transparent_45%),radial-gradient(circle_at_75%_35%,rgba(64,93,230,.15),transparent_40%)]" animate={!reduced ? { opacity: [0.7, 1, 0.7] } : {}} transition={{ duration: 8, repeat: Infinity }} />
      <motion.div className="absolute left-[16%] top-[42%] h-20 w-32 rounded-full bg-gradient-to-r from-[#E1306C] to-[#833AB4] blur-[1px]" animate={!reduced ? { x: [0, 16, 0], y: [0, -12, 0], rotate: [0, 4, 0] } : {}} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
      <div className="absolute inset-x-8 bottom-10 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      <FloatingIcon label="❤️" className="left-[10%] top-[20%]" delay={0.2} />
      <FloatingIcon label="💬" className="left-[68%] top-[22%]" delay={0.8} />
      <FloatingIcon label="▶️" className="left-[75%] top-[56%]" delay={1.4} />
      <FloatingIcon label="📈" className="left-[25%] top-[65%]" delay={2} />
    </div>
  );
}

function GoogleScene2D({ reduced }: { reduced: boolean }) {
  const bars = [30, 55, 78, 64, 92];
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#071126] via-[#07182e] to-[#050913]">
      <motion.div className="absolute inset-0" animate={!reduced ? { background: ['radial-gradient(circle at 50% 60%, rgba(66,133,244,.2), transparent 55%)', 'radial-gradient(circle at 50% 60%, rgba(52,168,83,.22), transparent 55%)', 'radial-gradient(circle at 50% 60%, rgba(66,133,244,.2), transparent 55%)'] } : {}} transition={{ duration: 7.5, repeat: Infinity }} />
      <motion.div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#4285f4]/50" animate={!reduced ? { scale: [1, 1.15, 1], opacity: [0.45, 0.2, 0.45] } : {}} transition={{ duration: 4.5, repeat: Infinity }} />
      <div className="absolute bottom-8 left-8 right-8 flex items-end gap-2">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-md bg-gradient-to-t from-[#4285f4] via-[#34a853] to-[#fbbc04]"
            animate={!reduced ? { height: [`${h}%`, `${Math.max(20, h - 14)}%`, `${h}%`] } : { height: `${h}%` }}
            transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ minHeight: 22 }}
          />
        ))}
      </div>
      <FloatingIcon label="🔍" className="left-[12%] top-[18%]" delay={0.3} duration={7} />
      <FloatingIcon label="🎯" className="left-[72%] top-[18%]" delay={0.9} duration={7} />
      <FloatingIcon label="💰" className="left-[70%] top-[55%]" delay={1.5} duration={7} />
    </div>
  );
}

function ConsultScene2D({ reduced }: { reduced: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#0c0919] via-[#17102b] to-[#080710]">
      <motion.div className="absolute left-1/2 top-[34%] h-16 w-16 -translate-x-1/2 rotate-45 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6]" animate={!reduced ? { y: [0, -10, 0], boxShadow: ['0 0 24px rgba(139,92,246,.35)', '0 0 40px rgba(139,92,246,.6)', '0 0 24px rgba(139,92,246,.35)'] } : {}} transition={{ duration: 4.8, repeat: Infinity }} />
      <div className="absolute bottom-10 left-10 right-10 grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((step) => (
          <motion.div key={step} className="h-10 rounded-lg border border-white/15 bg-white/10" animate={!reduced ? { opacity: [0.25, 0.95, 0.25] } : { opacity: 0.65 }} transition={{ duration: 3.6, delay: step * 0.4, repeat: Infinity }} />
        ))}
      </div>
      <FloatingIcon label="🧠" className="left-[14%] top-[24%]" delay={0.2} />
      <FloatingIcon label="💼" className="left-[74%] top-[24%]" delay={0.9} />
      <FloatingIcon label="🧲" className="left-[24%] top-[62%]" delay={1.4} />
      <FloatingIcon label="📞" className="left-[70%] top-[60%]" delay={1.9} />
    </div>
  );
}

function HeroAnimation({ variant, className = '' }: HeroAnimationProps) {
  const reduced = useReducedMotion();
  const scene = useMemo(() => {
    if (variant === 'meta') return <MetaScene2D reduced={Boolean(reduced)} />;
    if (variant === 'google') return <GoogleScene2D reduced={Boolean(reduced)} />;
    return <ConsultScene2D reduced={Boolean(reduced)} />;
  }, [reduced, variant]);

  return <div className={`relative h-full w-full ${className}`}>{scene}</div>;
}

export default memo(HeroAnimation);
