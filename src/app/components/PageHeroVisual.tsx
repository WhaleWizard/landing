import { memo } from 'react';
import { motion } from 'motion/react';
import HeroAnimation from './HeroAnimation';

type Variant = 'meta' | 'google' | 'consult';

interface PageHeroVisualProps {
  variant: Variant;
  isMobile?: boolean;
}

const variantTone: Record<Variant, { border: string; ring: string; chip: string; labels: string[] }> = {
  meta: {
    border: 'border-[#E1306C]/40',
    ring: 'from-[#E1306C]/40 via-[#833AB4]/25 to-[#405DE6]/40',
    chip: 'bg-[#E1306C]/20 border-[#E1306C]/35',
    labels: ['Creative Pulse', 'Audience Orbit', 'Conversion Flow'],
  },
  google: {
    border: 'border-[#4285f4]/40',
    ring: 'from-[#4285f4]/40 via-[#34a853]/25 to-[#fbbc04]/40',
    chip: 'bg-[#4285f4]/20 border-[#4285f4]/35',
    labels: ['Intent Scan', 'Bid Balance', 'Revenue Lift'],
  },
  consult: {
    border: 'border-primary/40',
    ring: 'from-primary/40 via-accent/30 to-secondary/40',
    chip: 'bg-primary/20 border-primary/35',
    labels: ['Mentor Path', 'Skill Momentum', 'Client Pipeline'],
  },
};

function PageHeroVisualBase({ variant, isMobile = false }: PageHeroVisualProps) {
  const tone = variantTone[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="order-1 lg:order-2 relative w-full max-w-2xl mx-auto"
    >
      <div className={`absolute -inset-6 rounded-[2rem] blur-3xl bg-gradient-to-br ${tone.ring} opacity-70`} />

      <div className={`relative rounded-[2rem] overflow-hidden border ${tone.border} bg-black/25 backdrop-blur-2xl shadow-2xl`}>
        <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

        <div className="relative aspect-[4/3] md:aspect-[16/11]">
          <HeroAnimation variant={variant} className="h-full w-full" />

          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/15 pointer-events-none" />

          <div className="absolute bottom-4 left-4 right-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {tone.labels.map((label, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 + i * 0.1, duration: 0.5 }}
                className={`rounded-lg border px-3 py-2 text-[11px] sm:text-xs text-white/90 backdrop-blur-md ${tone.chip}`}
              >
                {label}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {!isMobile && (
        <motion.div
          aria-hidden
          animate={{ y: [0, -8, 0], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-3 top-10 h-24 w-24 rounded-full border border-white/15 bg-white/5 backdrop-blur-md"
        />
      )}
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
