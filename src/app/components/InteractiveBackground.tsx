'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

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

export default function InteractiveBackground({
  variant = 'cosmic',
  particleCount = 80,
  interactive = true,
  className = ''
}: InteractiveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number>();

  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return ['#4285f4', '#34a853', '#ea4335', '#fbbc04', '#ffffff'];
      case 'ethereal':
        return ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#ffffff'];
      default:
        return ['#8b5cf6', '#6366f1', '#3b82f6', '#a855f7', '#ffffff'];
    }
  }, [variant]);

  const initParticles = useCallback((width: number, height: number) => {
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: Math.random() * 100,
      maxLife: 100 + Math.random() * 100
    }));
  }, [particleCount, colors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      initParticles(rect.width, rect.height);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    if (interactive) {
      canvas.addEventListener('mousemove', handleMouseMove);
    }

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Draw connections
      ctx.lineWidth = 0.5;
      particlesRef.current.forEach((p1, i) => {
        particlesRef.current.slice(i + 1).forEach(p2 => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            const opacity = (1 - dist / 120) * 0.3;
            ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });

        // Mouse interaction
        if (interactive) {
          const mdx = p1.x - mouseRef.current.x;
          const mdy = p1.y - mouseRef.current.y;
          const mDist = Math.sqrt(mdx * mdx + mdy * mdy);

          if (mDist < 150) {
            const opacity = (1 - mDist / 150) * 0.6;
            ctx.strokeStyle = `rgba(167, 139, 250, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mouseRef.current.x, mouseRef.current.y);
            ctx.stroke();
            ctx.lineWidth = 0.5;

            // Repel particles from mouse
            const force = (150 - mDist) / 150;
            p1.vx += (mdx / mDist) * force * 0.3;
            p1.vy += (mdy / mDist) * force * 0.3;
          }
        }
      });

      // Update and draw particles
      particlesRef.current.forEach(p => {
        // Update life
        p.life += 1;
        if (p.life > p.maxLife) {
          p.life = 0;
          p.x = Math.random() * rect.width;
          p.y = Math.random() * rect.height;
        }

        // Pulse opacity
        const lifeFactor = Math.sin((p.life / p.maxLife) * Math.PI);
        const currentOpacity = p.opacity * lifeFactor;

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Base velocity
        p.vx += (Math.random() - 0.5) * 0.02;
        p.vy += (Math.random() - 0.5) * 0.02;

        // Boundary wrap
        if (p.x < 0) p.x = rect.width;
        if (p.x > rect.width) p.x = 0;
        if (p.y < 0) p.y = rect.height;
        if (p.y > rect.height) p.y = 0;

        // Draw particle with glow
        ctx.save();
        ctx.globalAlpha = currentOpacity;

        // Outer glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.globalAlpha = currentOpacity * 2;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (interactive) {
        canvas.removeEventListener('mousemove', handleMouseMove);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initParticles, interactive]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-auto ${className}`}
      style={{ background: 'transparent' }}
    />
  );
}

// Gradient orbs component
interface GradientOrbsProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
}

export function GradientOrbs({ variant = 'cosmic' }: GradientOrbsProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 50, stiffness: 100 };
  const orbX = useSpring(mouseX, springConfig);
  const orbY = useSpring(mouseY, springConfig);

  const orb1X = useTransform(orbX, (v) => v * 0.02);
  const orb1Y = useTransform(orbY, (v) => v * 0.02);
  const orb2X = useTransform(orbX, (v) => v * -0.015);
  const orb2Y = useTransform(orbY, (v) => v * -0.015);
  const orb3X = useTransform(orbX, (v) => v * 0.01);
  const orb3Y = useTransform(orbY, (v) => v * 0.025);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX - window.innerWidth / 2);
      mouseY.set(e.clientY - window.innerHeight / 2);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return {
          orb1: 'from-blue-600/30 via-blue-500/20 to-transparent',
          orb2: 'from-green-500/25 via-green-400/15 to-transparent',
          orb3: 'from-yellow-500/20 via-yellow-400/10 to-transparent'
        };
      case 'ethereal':
        return {
          orb1: 'from-purple-600/30 via-violet-500/20 to-transparent',
          orb2: 'from-cyan-500/25 via-teal-400/15 to-transparent',
          orb3: 'from-pink-500/20 via-rose-400/10 to-transparent'
        };
      default:
        return {
          orb1: 'from-primary/30 via-purple-500/20 to-transparent',
          orb2: 'from-accent/25 via-indigo-400/15 to-transparent',
          orb3: 'from-secondary/20 via-blue-400/10 to-transparent'
        };
    }
  }, [variant]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className={`absolute w-[600px] h-[600px] rounded-full bg-gradient-radial ${colors.orb1} blur-3xl`}
        style={{
          x: orb1X,
          y: orb1Y,
          top: '10%',
          left: '20%'
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.7, 0.5]
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />
      <motion.div
        className={`absolute w-[500px] h-[500px] rounded-full bg-gradient-radial ${colors.orb2} blur-3xl`}
        style={{
          x: orb2X,
          y: orb2Y,
          top: '50%',
          right: '10%'
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.4, 0.6, 0.4]
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2
        }}
      />
      <motion.div
        className={`absolute w-[400px] h-[400px] rounded-full bg-gradient-radial ${colors.orb3} blur-3xl`}
        style={{
          x: orb3X,
          y: orb3Y,
          bottom: '10%',
          left: '30%'
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 4
        }}
      />
    </div>
  );
}

// Animated grid background
interface AnimatedGridProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
}

export function AnimatedGrid({ variant = 'cosmic' }: AnimatedGridProps) {
  const gridColor = useMemo(() => {
    switch (variant) {
      case 'digital': return 'rgba(66, 133, 244, 0.1)';
      case 'ethereal': return 'rgba(139, 92, 246, 0.1)';
      default: return 'rgba(99, 102, 241, 0.08)';
    }
  }, [variant]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(${gridColor} 1px, transparent 1px),
            linear-gradient(90deg, ${gridColor} 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
        animate={{
          backgroundPosition: ['0px 0px', '60px 60px']
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'linear'
        }}
      />
      <div 
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 0%, var(--background) 70%)`
        }}
      />
    </div>
  );
}
