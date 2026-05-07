import { memo, useMemo } from 'react';
import { motion } from 'motion/react';
import { usePerformanceMode } from '../hooks/usePerformanceMode';

type BackgroundVariant = 'nebula' | 'aurora' | 'waves' | 'grid-glow' | 'particles' | 'gradient-mesh' | 'cosmic-dust' | 'rings';

type ColorKey = 'primary' | 'secondary' | 'accent' | 'meta' | 'google' | 'success';

interface SectionBackgroundProps {
  variant: BackgroundVariant;
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  color?: ColorKey;
}

const colorPalettes: Record<ColorKey, { start: string; mid: string; glow: string }> = {
  primary: { start: 'rgba(139, 92, 246, 0.22)', mid: 'rgba(99, 102, 241, 0.16)', glow: 'rgba(139, 92, 246, 0.2)' },
  secondary: { start: 'rgba(59, 130, 246, 0.22)', mid: 'rgba(14, 165, 233, 0.16)', glow: 'rgba(59, 130, 246, 0.2)' },
  accent: { start: 'rgba(99, 102, 241, 0.22)', mid: 'rgba(168, 85, 247, 0.16)', glow: 'rgba(99, 102, 241, 0.2)' },
  meta: { start: 'rgba(225, 48, 108, 0.22)', mid: 'rgba(64, 93, 230, 0.16)', glow: 'rgba(225, 48, 108, 0.2)' },
  google: { start: 'rgba(66, 133, 244, 0.22)', mid: 'rgba(52, 168, 83, 0.16)', glow: 'rgba(251, 188, 4, 0.16)' },
  success: { start: 'rgba(34, 197, 94, 0.2)', mid: 'rgba(16, 185, 129, 0.14)', glow: 'rgba(34, 197, 94, 0.18)' },
};

const intensityScale = { low: 0.45, medium: 0.68, high: 0.86 };

function SectionBackground({
  variant,
  className = '',
  intensity = 'medium',
  color = 'primary',
}: SectionBackgroundProps) {
  const performance = usePerformanceMode();
  const palette = colorPalettes[color];
  const intensityValue = intensityScale[intensity];
  const canAnimate = performance.allowAnimatedBackgrounds;

  const mesh = useMemo(() => {
    switch (variant) {
      case 'grid-glow':
        return `linear-gradient(${palette.glow} 1px, transparent 1px), linear-gradient(90deg, ${palette.glow} 1px, transparent 1px), radial-gradient(circle at 50% 30%, ${palette.start}, transparent 48%)`;
      case 'waves':
        return `radial-gradient(ellipse at 20% 30%, ${palette.start}, transparent 44%), radial-gradient(ellipse at 80% 70%, ${palette.mid}, transparent 44%)`;
      case 'aurora':
        return `linear-gradient(120deg, transparent 0%, ${palette.start} 28%, transparent 52%, ${palette.mid} 74%, transparent 100%)`;
      case 'particles':
      case 'cosmic-dust':
        return `radial-gradient(circle at 18% 28%, ${palette.start}, transparent 34%), radial-gradient(circle at 78% 72%, ${palette.mid}, transparent 38%), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.05), transparent 1px)`;
      case 'rings':
        return `radial-gradient(circle at center, transparent 18%, ${palette.glow} 19%, transparent 20%, transparent 34%, ${palette.glow} 35%, transparent 36%), radial-gradient(circle at 50% 50%, ${palette.start}, transparent 46%)`;
      case 'gradient-mesh':
      case 'nebula':
      default:
        return `radial-gradient(ellipse at 22% 18%, ${palette.start}, transparent 46%), radial-gradient(ellipse at 78% 82%, ${palette.mid}, transparent 46%), radial-gradient(ellipse at 50% 50%, ${palette.glow}, transparent 58%)`;
    }
  }, [palette, variant]);

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden contain-paint ${className}`}>
      {canAnimate ? (
        <motion.div
          className="absolute inset-[-12%]"
          style={{ background: mesh, opacity: intensityValue, backgroundSize: variant === 'grid-glow' ? '72px 72px, 72px 72px, auto' : 'auto' }}
          animate={{ opacity: [intensityValue * 0.72, intensityValue, intensityValue * 0.72], scale: [1, 1.025, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : (
        <div
          className="absolute inset-[-8%]"
          style={{ background: mesh, opacity: intensityValue * 0.72, backgroundSize: variant === 'grid-glow' ? '72px 72px, 72px 72px, auto' : 'auto' }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-transparent to-background/30" />
    </div>
  );
}

export default memo(SectionBackground);
