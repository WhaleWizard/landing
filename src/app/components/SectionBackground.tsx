import { memo } from 'react';
import { motion } from 'motion/react';

type BackgroundVariant = 
  | 'nebula'
  | 'aurora'
  | 'waves'
  | 'grid-glow'
  | 'particles'
  | 'gradient-mesh'
  | 'cosmic-dust'
  | 'rings';

interface SectionBackgroundProps {
  variant: BackgroundVariant;
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  color?: 'primary' | 'accent' | 'meta' | 'google' | 'neutral';
}

const colorPalettes = {
  primary: {
    start: 'rgba(139, 92, 246, 0.15)',
    mid: 'rgba(99, 102, 241, 0.1)',
    end: 'rgba(59, 130, 246, 0.08)',
    glow: 'rgba(139, 92, 246, 0.3)',
  },
  accent: {
    start: 'rgba(99, 102, 241, 0.15)',
    mid: 'rgba(139, 92, 246, 0.1)',
    end: 'rgba(167, 139, 250, 0.08)',
    glow: 'rgba(99, 102, 241, 0.3)',
  },
  meta: {
    start: 'rgba(225, 48, 108, 0.15)',
    mid: 'rgba(131, 58, 180, 0.1)',
    end: 'rgba(64, 93, 230, 0.08)',
    glow: 'rgba(225, 48, 108, 0.3)',
  },
  google: {
    start: 'rgba(66, 133, 244, 0.15)',
    mid: 'rgba(52, 168, 83, 0.1)',
    end: 'rgba(251, 188, 4, 0.08)',
    glow: 'rgba(66, 133, 244, 0.3)',
  },
  neutral: {
    start: 'rgba(255, 255, 255, 0.05)',
    mid: 'rgba(255, 255, 255, 0.03)',
    end: 'rgba(255, 255, 255, 0.02)',
    glow: 'rgba(255, 255, 255, 0.1)',
  },
};

const intensityScale = {
  low: 0.5,
  medium: 1,
  high: 1.5,
};

// Nebula - soft cloudy cosmic effect
const NebulaBackground = memo(({ color, intensity }: { color: keyof typeof colorPalettes; intensity: number }) => {
  const palette = colorPalettes[color];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.3 * intensity, 0.5 * intensity, 0.3 * intensity],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-3xl"
        style={{ background: `radial-gradient(ellipse, ${palette.start}, transparent 70%)` }}
      />
      <motion.div
        animate={{
          scale: [1.1, 1, 1.1],
          opacity: [0.4 * intensity, 0.6 * intensity, 0.4 * intensity],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute -bottom-1/4 -right-1/4 w-3/4 h-3/4 rounded-full blur-3xl"
        style={{ background: `radial-gradient(ellipse, ${palette.mid}, transparent 60%)` }}
      />
      <motion.div
        animate={{
          x: [0, 50, 0],
          y: [0, -30, 0],
          opacity: [0.2 * intensity, 0.4 * intensity, 0.2 * intensity],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-1/4 right-1/4 w-1/2 h-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${palette.end}, transparent 50%)` }}
      />
    </div>
  );
});
NebulaBackground.displayName = 'NebulaBackground';

// Aurora - northern lights effect
const AuroraBackground = memo(({ color, intensity }: { color: keyof typeof colorPalettes; intensity: number }) => {
  const palette = colorPalettes[color];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        animate={{
          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, transparent 0%, ${palette.start} 25%, ${palette.mid} 50%, ${palette.end} 75%, transparent 100%)`,
          backgroundSize: '400% 400%',
          opacity: 0.6 * intensity,
        }}
      />
      <motion.div
        animate={{
          y: [0, -20, 0],
          opacity: [0.3 * intensity, 0.5 * intensity, 0.3 * intensity],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-x-0 top-0 h-1/2"
        style={{
          background: `linear-gradient(to bottom, ${palette.glow}, transparent)`,
          filter: 'blur(40px)',
        }}
      />
    </div>
  );
});
AuroraBackground.displayName = 'AuroraBackground';

// Waves - animated wave pattern
const WavesBackground = memo(({ color, intensity }: { color: keyof typeof colorPalettes; intensity: number }) => {
  const palette = colorPalettes[color];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={palette.start} />
            <stop offset="50%" stopColor={palette.mid} />
            <stop offset="100%" stopColor={palette.end} />
          </linearGradient>
        </defs>
        <motion.path
          d="M0,50 Q250,30 500,50 T1000,50 V100 H0 Z"
          fill="url(#wave-gradient)"
          initial={{ d: 'M0,50 Q250,30 500,50 T1000,50 V100 H0 Z' }}
          animate={{
            d: [
              'M0,50 Q250,30 500,50 T1000,50 V100 H0 Z',
              'M0,50 Q250,70 500,50 T1000,50 V100 H0 Z',
              'M0,50 Q250,30 500,50 T1000,50 V100 H0 Z',
            ],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          style={{ opacity: 0.4 * intensity }}
        />
      </svg>
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-0 left-0 right-0 h-1/3 blur-2xl"
        style={{ background: `linear-gradient(to top, ${palette.start}, transparent)`, opacity: 0.5 * intensity }}
      />
    </div>
  );
});
WavesBackground.displayName = 'WavesBackground';

// Grid Glow - glowing grid pattern
const GridGlowBackground = memo(({ color, intensity }: { color: keyof typeof colorPalettes; intensity: number }) => {
  const palette = colorPalettes[color];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(${palette.start} 1px, transparent 1px),
            linear-gradient(90deg, ${palette.start} 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          opacity: 0.3 * intensity,
        }}
      />
      <motion.div
        animate={{
          opacity: [0.2 * intensity, 0.4 * intensity, 0.2 * intensity],
          scale: [1, 1.02, 1],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/2 h-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${palette.glow}, transparent 70%)` }}
      />
    </div>
  );
});
GridGlowBackground.displayName = 'GridGlowBackground';

// Particles - floating particles
const ParticlesBackground = memo(({ color, intensity }: { color: keyof typeof colorPalettes; intensity: number }) => {
  const palette = colorPalettes[color];
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: Math.random() * 10 + 10,
    delay: Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: palette.glow,
            boxShadow: `0 0 ${p.size * 2}px ${palette.glow}`,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [0.3 * intensity, 0.7 * intensity, 0.3 * intensity],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: p.delay,
          }}
        />
      ))}
    </div>
  );
});
ParticlesBackground.displayName = 'ParticlesBackground';

// Gradient Mesh - animated gradient mesh
const GradientMeshBackground = memo(({ color, intensity }: { color: keyof typeof colorPalettes; intensity: number }) => {
  const palette = colorPalettes[color];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        animate={{
          background: [
            `radial-gradient(at 0% 0%, ${palette.start} 0%, transparent 50%), radial-gradient(at 100% 100%, ${palette.mid} 0%, transparent 50%)`,
            `radial-gradient(at 100% 0%, ${palette.start} 0%, transparent 50%), radial-gradient(at 0% 100%, ${palette.mid} 0%, transparent 50%)`,
            `radial-gradient(at 0% 0%, ${palette.start} 0%, transparent 50%), radial-gradient(at 100% 100%, ${palette.mid} 0%, transparent 50%)`,
          ],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{ opacity: intensity }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)`,
        }}
      />
    </div>
  );
});
GradientMeshBackground.displayName = 'GradientMeshBackground';

// Cosmic Dust - space dust effect
const CosmicDustBackground = memo(({ color, intensity }: { color: keyof typeof colorPalettes; intensity: number }) => {
  const palette = colorPalettes[color];
  const stars = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    size: Math.random() * 2 + 1,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${palette.start} 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, ${palette.mid} 0%, transparent 40%)`,
          opacity: 0.6 * intensity,
        }}
      />
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full"
          style={{
            width: star.size,
            height: star.size,
            left: `${star.x}%`,
            top: `${star.y}%`,
            background: 'white',
          }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: star.delay,
          }}
        />
      ))}
    </div>
  );
});
CosmicDustBackground.displayName = 'CosmicDustBackground';

// Rings - concentric animated rings
const RingsBackground = memo(({ color, intensity }: { color: keyof typeof colorPalettes; intensity: number }) => {
  const palette = colorPalettes[color];
  const rings = [1, 2, 3, 4];

  return (
    <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
      {rings.map((ring) => (
        <motion.div
          key={ring}
          className="absolute rounded-full border"
          style={{
            width: `${ring * 25}%`,
            height: `${ring * 25}%`,
            borderColor: palette.glow,
            borderWidth: 1,
          }}
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.2 * intensity, 0.4 * intensity, 0.2 * intensity],
          }}
          transition={{
            duration: 4 + ring,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: ring * 0.5,
          }}
        />
      ))}
      <motion.div
        animate={{
          opacity: [0.3 * intensity, 0.5 * intensity, 0.3 * intensity],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute w-1/4 h-1/4 rounded-full blur-3xl"
        style={{ background: palette.glow }}
      />
    </div>
  );
});
RingsBackground.displayName = 'RingsBackground';

const backgrounds: Record<BackgroundVariant, React.ComponentType<{ color: keyof typeof colorPalettes; intensity: number }>> = {
  nebula: NebulaBackground,
  aurora: AuroraBackground,
  waves: WavesBackground,
  'grid-glow': GridGlowBackground,
  particles: ParticlesBackground,
  'gradient-mesh': GradientMeshBackground,
  'cosmic-dust': CosmicDustBackground,
  rings: RingsBackground,
};

function SectionBackground({ 
  variant, 
  className = '', 
  intensity = 'medium',
  color = 'primary' 
}: SectionBackgroundProps) {
  const Background = backgrounds[variant];
  const intensityValue = intensityScale[intensity];

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <Background color={color} intensity={intensityValue} />
    </div>
  );
}

export default memo(SectionBackground);
