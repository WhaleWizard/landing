import { memo, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { usePerformanceMode } from '../hooks/usePerformanceMode';

type Variant = 'meta' | 'google' | 'consult';

interface PageHeroVisualProps {
  variant: Variant;
  isMobile?: boolean;
}

const variantToImage: Record<Variant, string> = {
  meta: '/images/meta.jpg',
  google: '/images/google.svg',
  consult: '/images/consult.svg',
};

const variantToVideo: Record<Variant, string> = {
  meta: '/videos/meta-hero.mp4',
  google: '/videos/google-hero.mp4',
  consult: '/videos/consult-hero.mp4',
};

const variantGradients: Record<Variant, string> = {
  meta: 'radial-gradient(circle at 70% 35%, rgba(225,48,108,0.38), transparent 34%), radial-gradient(circle at 36% 62%, rgba(64,93,230,0.34), transparent 38%), linear-gradient(135deg, #080812 0%, #15091f 48%, #080812 100%)',
  google: 'radial-gradient(circle at 70% 35%, rgba(66,133,244,0.38), transparent 34%), radial-gradient(circle at 42% 68%, rgba(52,168,83,0.28), transparent 36%), radial-gradient(circle at 78% 72%, rgba(251,188,4,0.24), transparent 30%), linear-gradient(135deg, #07101f 0%, #0b1320 52%, #070b12 100%)',
  consult: 'radial-gradient(circle at 72% 36%, rgba(139,92,246,0.36), transparent 34%), radial-gradient(circle at 36% 68%, rgba(6,182,212,0.28), transparent 38%), radial-gradient(circle at 76% 74%, rgba(236,72,153,0.22), transparent 30%), linear-gradient(135deg, #080812 0%, #101625 52%, #070811 100%)',
};

function PageHeroVisualBase({ variant }: PageHeroVisualProps) {
  const performance = usePerformanceMode();
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = useMemo(() => variantToImage[variant], [variant]);
  const videoSrc = useMemo(() => variantToVideo[variant], [variant]);
  const gradient = useMemo(() => variantGradients[variant], [variant]);
  const shouldShowVideo = performance.allowVideo && !videoFailed;

  return (
    <motion.div
      initial={{ opacity: 0, x: performance.shouldReduceMotion ? 0 : 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: performance.revealDuration, ease: [0.22, 1, 0.36, 1] }}
      className="order-1 lg:order-2 relative w-full min-h-[330px] sm:min-h-[420px] lg:min-h-[560px] lg:w-[42vw] lg:mr-[calc(50%-50vw)] contain-paint"
    >
      <div className="absolute inset-y-0 left-0 right-0 lg:-left-[14%] lg:right-0 overflow-hidden bg-background" style={{ background: gradient }}>
        {!imageFailed && (
          <img
            src={imageSrc}
            alt="AI growth visualization"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={() => setImageFailed(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${shouldShowVideo ? 'opacity-0' : 'opacity-100'}`}
          />
        )}

        {shouldShowVideo && (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            poster={imageFailed ? undefined : imageSrc}
            onError={() => setVideoFailed(true)}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(94deg,rgba(7,7,14,1)_0%,rgba(7,7,14,0.94)_16%,rgba(7,7,14,0.68)_31%,rgba(7,7,14,0.22)_49%,rgba(7,7,14,0.46)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 -left-[1px] w-[42%] bg-gradient-to-r from-background via-background/72 to-transparent" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,rgba(255,255,255,0.28)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-[size:72px_72px]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 mix-blend-screen bg-[radial-gradient(circle_at_72%_35%,rgba(56,189,248,0.2),transparent_38%)]" />

        {performance.allowAnimatedBackgrounds && (
          <>
            <div className="pointer-events-none absolute inset-x-0 -top-24 h-24 bg-gradient-to-b from-violet-400/18 via-indigo-400/10 to-transparent animate-[scanline_11s_linear_infinite]" />
            <div className="pointer-events-none absolute top-[10%] left-[12%] right-[8%] h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent opacity-50 animate-[glowPulse_10s_ease-in-out_infinite]" />
            <div className="pointer-events-none absolute bottom-[12%] left-[10%] right-[14%] h-px bg-gradient-to-r from-transparent via-violet-300/42 to-transparent opacity-45 animate-[glowPulse_11s_ease-in-out_infinite]" />
          </>
        )}
      </div>
    </motion.div>
  );
}

export default memo(PageHeroVisualBase);
