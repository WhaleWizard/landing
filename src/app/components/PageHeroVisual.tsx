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
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="order-1 lg:order-2 relative w-full min-h-[360px] sm:min-h-[440px] lg:min-h-[560px]"
    >
      <div className="absolute inset-0 -left-[5%] lg:-left-[14%] lg:-right-[12%]">
        {!videoFailed ? (
          <motion.video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
            animate={{ scale: [1.03, 1.08, 1.03], x: [0, -12, 0], y: [0, 8, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          >
            <source src={videoSrc} type="video/mp4" />
          </motion.video>
        ) : (
          <>
            <motion.img
              src={imageSrc}
              alt="AI growth visualization"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              animate={{ scale: [1.03, 1.09, 1.03], x: [0, -10, 0], y: [0, 8, 0] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="absolute inset-0">
              <HeroAnimation variant={variant} className="h-full w-full mix-blend-screen opacity-55" />
            </div>
          </>
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,10,15,0.98)_0%,rgba(10,10,15,0.88)_20%,rgba(10,10,15,0.52)_38%,rgba(10,10,15,0.15)_54%,rgba(10,10,15,0.46)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-[24%] w-[24%] bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.14),transparent_70%)] blur-3xl" />

        <div className="pointer-events-none absolute inset-0 opacity-[0.14] bg-[linear-gradient(to_right,rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.35)_1px,transparent_1px)] bg-[size:52px_52px]" />

        <motion.div
          className="pointer-events-none absolute inset-x-0 h-28 bg-gradient-to-b from-violet-400/25 via-indigo-400/10 to-transparent mix-blend-screen"
          animate={{ y: ['-22%', '112%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />

        <motion.div
          className="pointer-events-none absolute right-[18%] top-[18%] h-24 w-24 border border-violet-400/40"
          animate={{ opacity: [0.24, 0.55, 0.24], scale: [1, 1.08, 1] }}
          transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="pointer-events-none absolute right-[8%] bottom-[22%] h-40 w-40 rounded-full border border-indigo-400/35"
          animate={{ opacity: [0.2, 0.45, 0.2], scale: [0.95, 1.03, 0.95] }}
          transition={{ duration: 6.3, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="pointer-events-none absolute -right-24 top-[12%] h-72 w-72 bg-violet-500/16 blur-[120px]" />
        <div className="pointer-events-none absolute right-[12%] bottom-[2%] h-56 w-56 bg-indigo-500/12 blur-[110px]" />

        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={{ x: [0, -10, 0], y: [0, 6, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
