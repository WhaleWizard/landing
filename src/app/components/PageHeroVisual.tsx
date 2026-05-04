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
      className="order-1 lg:order-2 relative w-full min-h-[380px] sm:min-h-[470px] lg:min-h-[640px] lg:w-[50vw] lg:mr-[calc(50%-50vw)]"
    >
      <div className="absolute inset-0 -left-[6%] right-0 lg:-left-[14%] lg:right-0 will-change-transform">
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

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(94deg,rgba(7,7,14,1)_0%,rgba(7,7,14,0.95)_14%,rgba(7,7,14,0.72)_29%,rgba(7,7,14,0.2)_47%,rgba(7,7,14,0.42)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-[14%] w-[36%] bg-[radial-gradient(circle_at_center,rgba(129,140,248,0.22),transparent_72%)] blur-3xl" />
        <div className="pointer-events-none absolute inset-y-0 -left-[1px] w-[42%] bg-gradient-to-r from-background via-background/72 to-transparent" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.16] bg-[linear-gradient(to_right,rgba(52,211,153,0.3)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.22)_1px,transparent_1px)] bg-[size:54px_54px]" />
        <div className="pointer-events-none absolute inset-0 opacity-45 mix-blend-screen bg-[radial-gradient(circle_at_78%_30%,rgba(56,189,248,0.26),transparent_34%),radial-gradient(circle_at_68%_72%,rgba(168,85,247,0.24),transparent_37%)]" />

        {!reduceMotion && (
          <>
            <div className="pointer-events-none absolute inset-x-0 -top-24 h-24 bg-gradient-to-b from-violet-400/24 via-indigo-400/14 to-transparent animate-[scanline_9s_linear_infinite]" />
            <div className="pointer-events-none absolute top-0 right-[6%] h-full w-[2px] bg-gradient-to-b from-cyan-300/0 via-cyan-300/90 to-cyan-300/0 shadow-[0_0_18px_rgba(34,211,238,0.9)] animate-[verticalScanner_3.6s_linear_infinite]" />
            <div className="pointer-events-none absolute inset-y-0 right-[6%] w-[18%] bg-gradient-to-l from-cyan-300/18 via-cyan-300/6 to-transparent animate-[scannerBloom_3.6s_ease-in-out_infinite]" />
            <div className="pointer-events-none absolute inset-y-0 right-[9%] w-[1px] bg-cyan-300/50 animate-[dataRain_6s_linear_infinite]" />
            <div className="pointer-events-none absolute -right-24 top-[10%] h-72 w-72 bg-violet-500/16 blur-[120px] animate-[glowPulse_6.5s_ease-in-out_infinite]" />
            <div className="pointer-events-none absolute right-[12%] bottom-[2%] h-56 w-56 bg-indigo-500/12 blur-[110px] animate-[glowPulse_7.8s_ease-in-out_infinite]" />
            <div className="pointer-events-none absolute left-[40%] top-[14%] h-[2px] w-24 bg-cyan-300/70 shadow-[0_0_18px_rgba(34,211,238,0.7)] animate-[hudSweep_4.8s_ease-in-out_infinite]" />
          </>
        )}
      </div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
