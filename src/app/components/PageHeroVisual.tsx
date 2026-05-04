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
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="order-1 lg:order-2 relative w-full min-h-[440px] lg:min-h-[560px]"
    >
      <div className="absolute inset-y-[-8%] -left-[16%] right-[-14%]">
        {!videoFailed ? (
          <motion.video
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
            animate={{ scale: [1, 1.04, 1], x: [0, 8, 0], y: [0, -6, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          >
            <source src={videoSrc} type="video/mp4" />
          </motion.video>
        ) : (
          <>
            <motion.img
              src={imageSrc}
              alt="AI advertising control room visual"
              loading="lazy"
              className="h-full w-full object-cover"
              animate={{ scale: [1, 1.05, 1], x: [0, 10, 0], y: [0, -7, 0] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="absolute inset-0 pointer-events-none">
              <HeroAnimation variant={variant} className="h-full w-full mix-blend-screen opacity-55" />
            </div>
          </>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a0a0f] via-[#0a0a0f]/60 to-[#0a0a0f]/20" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_78%_40%,rgba(99,102,241,0.26),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_75%_at_68%_68%,rgba(139,92,246,0.24),transparent_72%)]" />

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.08)_1px,transparent_1px)] bg-[size:56px_56px] opacity-35" />

        <motion.div
          className="pointer-events-none absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#8b5cf6]/70 to-transparent"
          animate={{ top: ['8%', '84%', '8%'], opacity: [0.15, 0.6, 0.15] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.div
          className="pointer-events-none absolute left-[14%] top-[18%] h-[190px] w-[190px] rounded-full border border-[#8b5cf6]/30"
          animate={{ scale: [1, 1.08, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="pointer-events-none absolute right-[12%] top-[28%] h-[1px] w-[220px] bg-gradient-to-r from-transparent via-[#6366f1]/65 to-transparent"
          animate={{ x: [0, -10, 0], opacity: [0.15, 0.45, 0.15] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="pointer-events-none absolute right-[20%] bottom-[18%] h-[120px] w-[120px] rounded-full border border-[#6366f1]/35"
          animate={{ scale: [1, 0.92, 1], opacity: [0.12, 0.3, 0.12] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="pointer-events-none absolute inset-y-0 left-0 w-[34%] bg-gradient-to-r from-[#0a0a0f]/95 via-[#0a0a0f]/72 to-transparent backdrop-blur-[2px]" />
      </div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
