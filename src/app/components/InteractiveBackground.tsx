import { useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { usePerformanceMode } from '../hooks/usePerformanceMode';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  life: number;
  maxLife: number;
}

interface InteractiveBackgroundProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  particleCount?: number;
  interactive?: boolean;
  className?: string;
}

const variantPalette = {
  digital: ['#4285f4', '#34a853', '#ea4335', '#fbbc04', '#ffffff'],
  ethereal: ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#ffffff'],
  cosmic: ['#8b5cf6', '#6366f1', '#3b82f6', '#a855f7', '#ffffff'],
};

const staticBackgrounds = {
  cosmic: 'radial-gradient(circle at 18% 22%, rgba(139,92,246,0.18), transparent 34%), radial-gradient(circle at 78% 24%, rgba(59,130,246,0.14), transparent 36%), radial-gradient(circle at 48% 78%, rgba(168,85,247,0.12), transparent 40%)',
  digital: 'radial-gradient(circle at 18% 22%, rgba(66,133,244,0.18), transparent 34%), radial-gradient(circle at 78% 24%, rgba(52,168,83,0.14), transparent 36%), radial-gradient(circle at 52% 78%, rgba(251,188,4,0.1), transparent 40%)',
  ethereal: 'radial-gradient(circle at 18% 22%, rgba(139,92,246,0.18), transparent 34%), radial-gradient(circle at 78% 24%, rgba(6,182,212,0.14), transparent 36%), radial-gradient(circle at 52% 78%, rgba(236,72,153,0.1), transparent 40%)',
};

export default function InteractiveBackground({
  variant = 'cosmic',
  particleCount = 80,
  interactive = true,
  className = '',
}: InteractiveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const animationRef = useRef<number | null>(null);
  const dimensionsRef = useRef({ width: 0, height: 0, dpr: 1 });
  const visibleRef = useRef(false);
  const performance = usePerformanceMode();
  const shouldAnimate = performance.allowInteractiveBackground;
  const effectiveCount = performance.mode === 'full' ? particleCount : Math.min(6, particleCount);

  const colors = useMemo(() => variantPalette[variant], [variant]);

  const initParticles = useCallback((width: number, height: number) => {
    particlesRef.current = Array.from({ length: effectiveCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.35 + 0.18,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: Math.random() * 100,
      maxLife: 120 + Math.random() * 120,
    }));
  }, [colors, effectiveCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shouldAnimate) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const stop = () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      dimensionsRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(rect.width, rect.height);
    };

    resizeCanvas();

    let lastFrameTime = 0;
    const fps = 24;
    const frameInterval = 1000 / fps;

    const animate = (time: number) => {
      if (!visibleRef.current) {
        animationRef.current = null;
        return;
      }

      if (time - lastFrameTime < frameInterval) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = time;

      const { width, height } = dimensionsRef.current;
      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;
      ctx.lineWidth = 0.45;

      for (let i = 0; i < particles.length; i += 1) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j += 1) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= 11025) continue;
          const opacity = (1 - Math.sqrt(distSq) / 105) * 0.22;
          ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }

        if (interactive) {
          const mdx = p1.x - mouseRef.current.x;
          const mdy = p1.y - mouseRef.current.y;
          const mDistSq = mdx * mdx + mdy * mdy;
          if (mDistSq < 14400 && mDistSq > 1) {
            const mDist = Math.sqrt(mDistSq);
            const force = (120 - mDist) / 120;
            p1.vx += (mdx / mDist) * force * 0.12;
            p1.vy += (mdy / mDist) * force * 0.12;
          }
        }
      }

      for (const p of particles) {
        p.life += 1;
        if (p.life > p.maxLife) {
          p.life = 0;
          p.x = Math.random() * width;
          p.y = Math.random() * height;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx = p.vx * 0.985 + (Math.random() - 0.5) * 0.01;
        p.vy = p.vy * 0.985 + (Math.random() - 0.5) * 0.01;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const alpha = p.opacity * Math.sin((p.life / p.maxLife) * Math.PI);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animationRef.current = requestAnimationFrame(animate);
    };

    const start = () => {
      if (!animationRef.current) animationRef.current = requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0.01 },
    );

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    observer.observe(canvas);
    if (interactive) canvas.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      if (interactive) canvas.removeEventListener('pointermove', handlePointerMove);
    };
  }, [initParticles, interactive, shouldAnimate]);

  if (!shouldAnimate) {
    return <div className={`absolute inset-0 ${className}`} style={{ background: staticBackgrounds[variant] }} />;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ background: staticBackgrounds[variant] }}
    />
  );
}

interface GradientOrbsProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
}

export function GradientOrbs({ variant = 'cosmic' }: GradientOrbsProps) {
  const performance = usePerformanceMode();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 55, stiffness: 90 };
  const orbX = useSpring(mouseX, springConfig);
  const orbY = useSpring(mouseY, springConfig);
  const orb1X = useTransform(orbX, (v) => v * 0.012);
  const orb1Y = useTransform(orbY, (v) => v * 0.012);
  const orb2X = useTransform(orbX, (v) => v * -0.01);
  const orb2Y = useTransform(orbY, (v) => v * -0.01);

  useEffect(() => {
    if (performance.mode !== 'full') return;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX - window.innerWidth / 2);
      mouseY.set(e.clientY - window.innerHeight / 2);
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY, performance.mode]);

  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return { orb1: 'from-blue-500/14 via-blue-500/7 to-transparent', orb2: 'from-green-500/12 via-yellow-500/7 to-transparent' };
      case 'ethereal':
        return { orb1: 'from-violet-500/14 via-cyan-500/7 to-transparent', orb2: 'from-pink-500/12 via-amber-500/7 to-transparent' };
      default:
        return { orb1: 'from-violet-500/14 via-blue-500/7 to-transparent', orb2: 'from-indigo-500/12 via-purple-500/7 to-transparent' };
    }
  }, [variant]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none contain-paint">
      <motion.div
        className={`absolute -top-40 -left-32 w-[420px] h-[420px] md:w-[560px] md:h-[560px] rounded-full bg-gradient-radial ${colors.orb1} blur-3xl`}
        style={{ x: performance.mode === 'full' ? orb1X : 0, y: performance.mode === 'full' ? orb1Y : 0 }}
      />
      <motion.div
        className={`absolute -bottom-40 -right-32 w-[380px] h-[380px] md:w-[500px] md:h-[500px] rounded-full bg-gradient-radial ${colors.orb2} blur-3xl`}
        style={{ x: performance.mode === 'full' ? orb2X : 0, y: performance.mode === 'full' ? orb2Y : 0 }}
      />
    </div>
  );
}

interface AnimatedGridProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
}

export const AnimatedGrid = memo(function AnimatedGrid({ variant = 'cosmic' }: AnimatedGridProps) {
  const performance = usePerformanceMode();
  const gridColor = useMemo(() => {
    switch (variant) {
      case 'digital': return 'rgba(66, 133, 244, 0.1)';
      case 'ethereal': return 'rgba(139, 92, 246, 0.1)';
      default: return 'rgba(139, 92, 246, 0.1)';
    }
  }, [variant]);

  const gridStyle = {
    backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
    backgroundSize: '72px 72px',
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30 contain-paint">
      {performance.allowAnimatedBackgrounds ? (
        <motion.div
          className="absolute inset-0"
          style={gridStyle}
          animate={{ x: [0, 72], y: [0, 72] }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        />
      ) : (
        <div className="absolute inset-0" style={gridStyle} />
      )}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 0%, var(--background) 72%)' }}
      />
    </div>
  );
});
