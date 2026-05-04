import { memo, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

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
  const reduceMotion = useReducedMotion();
  const imageSrc = useMemo(() => variantToImage[variant], [variant]);
  const videoSrc = useMemo(() => variantToVideo[variant], [variant]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="order-1 lg:order-2 relative w-full min-h-[360px] sm:min-h-[440px] lg:min-h-[560px]"
    >
      <div className="absolute inset-0 -left-[5%] lg:-left-[14%] lg:-right-[12%] will-change-transform">
        {!videoFailed ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        ) : (
          <img
            src={imageSrc}
            alt="AI growth visualization"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,10,15,0.98)_0%,rgba(10,10,15,0.87)_20%,rgba(10,10,15,0.5)_38%,rgba(10,10,15,0.16)_55%,rgba(10,10,15,0.46)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-[22%] w-[24%] bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.14),transparent_70%)] blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[linear-gradient(to_right,rgba(255,255,255,0.34)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.28)_1px,transparent_1px)] bg-[size:56px_56px]" />

        {!reduceMotion && (
          <>
            <div className="pointer-events-none absolute inset-x-0 -top-24 h-24 bg-gradient-to-b from-violet-400/24 via-indigo-400/14 to-transparent animate-[scanline_9s_linear_infinite]" />
            <div className="pointer-events-none absolute -right-24 top-[10%] h-72 w-72 bg-violet-500/16 blur-[120px] animate-[glowPulse_6.5s_ease-in-out_infinite]" />
            <div className="pointer-events-none absolute right-[12%] bottom-[2%] h-56 w-56 bg-indigo-500/12 blur-[110px] animate-[glowPulse_7.8s_ease-in-out_infinite]" />
          </>
        )}
      </div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
