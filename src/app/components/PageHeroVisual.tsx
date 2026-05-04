import { memo, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import HeroAnimation from './HeroAnimation';

type Variant = 'meta' | 'google' | 'consult';

interface PageHeroVisualProps {
  variant: Variant;
  isMobile?: boolean;
}

const variantToImage: Record<Variant, string> = {
  meta: '/images/meta.jpg',
  google: '/images/google.jpg',
  consult: '/images/consult.jpg',
};

const variantToVideo: Record<Variant, string> = {
  meta: '/videos/meta-hero.mp4',
  google: '/videos/google-hero.mp4',
  consult: '/videos/consult-hero.mp4',
};

function PageHeroVisualBase({ variant }: PageHeroVisualProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const imageSrc = useMemo(() => variantToImage[variant], [variant]);
  const videoSrc = useMemo(() => variantToVideo[variant], [variant]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.1 }}
      className="order-1 lg:order-2 relative mx-auto w-full max-w-xl"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/20 p-3 backdrop-blur-xl shadow-2xl">
        <div className="relative h-[260px] sm:h-[300px] overflow-hidden rounded-2xl border border-white/10">
          {!videoFailed ? (
            <motion.video
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              onError={() => setVideoFailed(true)}
              animate={{ scale: [1, 1.045, 1], x: [0, 4, 0], y: [0, -3, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            >
              <source src={videoSrc} type="video/mp4" />
            </motion.video>
          ) : (
            <>
              <motion.img
                src={imageSrc}
                alt="Hero visual"
                loading="lazy"
                className="h-full w-full object-cover"
                animate={{ scale: [1, 1.05, 1], x: [0, 3, 0], y: [0, -2, 0] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="absolute inset-0">
                <HeroAnimation variant={variant} className="h-full w-full mix-blend-screen opacity-65" />
              </div>
            </>
          )}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.12),transparent_48%)]" />
        </div>
      </div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
