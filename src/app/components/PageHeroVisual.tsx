import { memo } from 'react';
import { motion } from 'motion/react';
import HeroAnimation from './HeroAnimation';

type Variant = 'meta' | 'google' | 'consult';

interface PageHeroVisualProps {
  variant: Variant;
  isMobile?: boolean;
}

function PageHeroVisualBase({ variant }: PageHeroVisualProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.1 }}
      className="order-1 lg:order-2 relative mx-auto w-full max-w-xl"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/20 p-3 backdrop-blur-xl shadow-2xl">
        <div className="relative h-[260px] sm:h-[300px] overflow-hidden rounded-2xl border border-white/10">
          <HeroAnimation variant={variant} className="h-full w-full" />
        </div>
      </div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
