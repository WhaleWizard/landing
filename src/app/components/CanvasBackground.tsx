'use client';

import { useRef, useEffect, useMemo, memo } from 'react';
import { motion } from 'motion/react';

type BackgroundType = 
  | 'particles-network'
  | 'gradient-waves' 
  | 'floating-shapes'
  | 'matrix-rain'
  | 'geometric-flow'
  | 'aurora-glow'
  | 'data-stream'
  | 'constellation';

type ColorTheme = 'meta' | 'google' | 'consult' | 'neutral';

interface CanvasBackgroundProps {
  type: BackgroundType;
  theme?: ColorTheme;
  intensity?: number;
  className?: string;
}

const colorThemes = {
  meta: {
    primary: '#E1306C',
    secondary: '#833AB4',
    tertiary: '#405DE6',
    accent: '#FF6B9D',
  },
  google: {
    primary: '#4285f4',
    secondary: '#34a853',
    tertiary: '#fbbc04',
    accent: '#ea4335',
  },
  consult: {
    primary: '#8b5cf6',
    secondary: '#6366f1',
    tertiary: '#a78bfa',
    accent: '#3b82f6',
  },
  neutral: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    tertiary: '#a855f7',
    accent: '#3b82f6',
  },
};

// Particles Network Background
const ParticlesNetworkCanvas = memo(({ theme, intensity }: { theme: ColorTheme; intensity: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = colorThemes[theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
    }> = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      // Init particles
      const count = Math.floor(40 * intensity);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        color: Object.values(colors)[Math.floor(Math.random() * 4)],
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Draw connections
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `${colors.primary}${Math.floor((1 - dist / 150) * 40).toString(16).padStart(2, '0')}`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      // Update and draw particles
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > rect.width) p.vx *= -1;
        if (p.y < 0 || p.y > rect.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + '60';
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [theme, intensity, colors]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
});
ParticlesNetworkCanvas.displayName = 'ParticlesNetworkCanvas';

// Gradient Waves Background
const GradientWavesCanvas = memo(({ theme, intensity }: { theme: ColorTheme; intensity: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = colorThemes[theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      time += 0.005;

      // Draw multiple waves
      const waveCount = 3;
      const colorKeys = Object.values(colors);

      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        ctx.moveTo(0, rect.height);

        for (let x = 0; x <= rect.width; x += 5) {
          const y = rect.height - 100 - w * 50 + 
            Math.sin(x * 0.005 + time + w) * 30 * intensity +
            Math.sin(x * 0.01 + time * 1.5 + w * 2) * 20 * intensity;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(rect.width, rect.height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, rect.height - 200, 0, rect.height);
        gradient.addColorStop(0, colorKeys[w] + '15');
        gradient.addColorStop(1, colorKeys[w] + '05');
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [theme, intensity, colors]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
});
GradientWavesCanvas.displayName = 'GradientWavesCanvas';

// Floating Shapes Background
const FloatingShapesCanvas = memo(({ theme, intensity }: { theme: ColorTheme; intensity: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = colorThemes[theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let shapes: Array<{
      x: number;
      y: number;
      size: number;
      rotation: number;
      rotationSpeed: number;
      type: 'circle' | 'square' | 'triangle';
      color: string;
      vx: number;
      vy: number;
    }> = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const count = Math.floor(15 * intensity);
      const types: Array<'circle' | 'square' | 'triangle'> = ['circle', 'square', 'triangle'];
      shapes = Array.from({ length: count }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        size: Math.random() * 40 + 20,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        type: types[Math.floor(Math.random() * 3)],
        color: Object.values(colors)[Math.floor(Math.random() * 4)],
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    const drawShape = (shape: typeof shapes[0]) => {
      ctx.save();
      ctx.translate(shape.x, shape.y);
      ctx.rotate(shape.rotation);
      ctx.globalAlpha = 0.1;

      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 2;

      switch (shape.type) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, shape.size / 2, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'square':
          ctx.strokeRect(-shape.size / 2, -shape.size / 2, shape.size, shape.size);
          break;
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(0, -shape.size / 2);
          ctx.lineTo(shape.size / 2, shape.size / 2);
          ctx.lineTo(-shape.size / 2, shape.size / 2);
          ctx.closePath();
          ctx.stroke();
          break;
      }

      ctx.restore();
    };

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      shapes.forEach(shape => {
        shape.x += shape.vx;
        shape.y += shape.vy;
        shape.rotation += shape.rotationSpeed;

        if (shape.x < -50) shape.x = rect.width + 50;
        if (shape.x > rect.width + 50) shape.x = -50;
        if (shape.y < -50) shape.y = rect.height + 50;
        if (shape.y > rect.height + 50) shape.y = -50;

        drawShape(shape);
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [theme, intensity, colors]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
});
FloatingShapesCanvas.displayName = 'FloatingShapesCanvas';

// Data Stream Background
const DataStreamCanvas = memo(({ theme, intensity }: { theme: ColorTheme; intensity: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = colorThemes[theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let streams: Array<{
      x: number;
      y: number;
      speed: number;
      chars: string[];
      color: string;
    }> = [];

    const chars = '01アイウエオカキクケコ'.split('');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const streamCount = Math.floor(rect.width / 30 * intensity);
      streams = Array.from({ length: streamCount }, (_, i) => ({
        x: i * 30 + 15,
        y: Math.random() * rect.height,
        speed: 1 + Math.random() * 2,
        chars: Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]),
        color: Object.values(colors)[Math.floor(Math.random() * 4)],
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      
      // Fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.font = '14px monospace';

      streams.forEach(stream => {
        stream.y += stream.speed;

        if (stream.y > rect.height + 100) {
          stream.y = -100;
          stream.chars = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]);
        }

        stream.chars.forEach((char, i) => {
          const y = stream.y - i * 15;
          if (y > 0 && y < rect.height) {
            const opacity = 1 - (i / stream.chars.length);
            ctx.fillStyle = stream.color + Math.floor(opacity * 40).toString(16).padStart(2, '0');
            ctx.fillText(char, stream.x, y);
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [theme, intensity, colors]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
});
DataStreamCanvas.displayName = 'DataStreamCanvas';

// Geometric Flow Background  
const GeometricFlowCanvas = memo(({ theme, intensity }: { theme: ColorTheme; intensity: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = colorThemes[theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      time += 0.01;

      const gridSize = 80;
      const rows = Math.ceil(rect.height / gridSize) + 1;
      const cols = Math.ceil(rect.width / gridSize) + 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * gridSize;
          const y = row * gridSize;
          
          const wave = Math.sin(x * 0.01 + time) * Math.cos(y * 0.01 + time * 0.5);
          const size = (wave + 1) * 10 * intensity;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(wave * 0.5);
          
          ctx.strokeStyle = colors.primary + '15';
          ctx.lineWidth = 1;
          ctx.strokeRect(-size / 2, -size / 2, size, size);
          
          ctx.restore();
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [theme, intensity, colors]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
});
GeometricFlowCanvas.displayName = 'GeometricFlowCanvas';

// Aurora Glow Background
const AuroraGlowCanvas = memo(({ theme, intensity }: { theme: ColorTheme; intensity: number }) => {
  const colors = colorThemes[theme];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        animate={{
          background: [
            `radial-gradient(ellipse 80% 50% at 20% 40%, ${colors.primary}20, transparent 50%)`,
            `radial-gradient(ellipse 80% 50% at 80% 60%, ${colors.secondary}20, transparent 50%)`,
            `radial-gradient(ellipse 80% 50% at 50% 30%, ${colors.tertiary}20, transparent 50%)`,
            `radial-gradient(ellipse 80% 50% at 20% 40%, ${colors.primary}20, transparent 50%)`,
          ],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{ opacity: intensity }}
      />
      <motion.div
        animate={{
          background: [
            `radial-gradient(ellipse 60% 40% at 70% 70%, ${colors.secondary}15, transparent 50%)`,
            `radial-gradient(ellipse 60% 40% at 30% 30%, ${colors.accent}15, transparent 50%)`,
            `radial-gradient(ellipse 60% 40% at 60% 50%, ${colors.primary}15, transparent 50%)`,
            `radial-gradient(ellipse 60% 40% at 70% 70%, ${colors.secondary}15, transparent 50%)`,
          ],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute inset-0"
        style={{ opacity: intensity }}
      />
    </div>
  );
});
AuroraGlowCanvas.displayName = 'AuroraGlowCanvas';

// Constellation Background
const ConstellationCanvas = memo(({ theme, intensity }: { theme: ColorTheme; intensity: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = colorThemes[theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let stars: Array<{
      x: number;
      y: number;
      size: number;
      brightness: number;
      twinkleSpeed: number;
      color: string;
    }> = [];
    let time = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const count = Math.floor(80 * intensity);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        size: Math.random() * 2 + 0.5,
        brightness: Math.random(),
        twinkleSpeed: 0.5 + Math.random() * 2,
        color: Object.values(colors)[Math.floor(Math.random() * 4)],
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      time += 0.02;

      // Draw constellation lines
      stars.forEach((star, i) => {
        stars.slice(i + 1, i + 4).forEach(other => {
          const dx = star.x - other.x;
          const dy = star.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(star.x, star.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `${colors.primary}${Math.floor((1 - dist / 120) * 20).toString(16).padStart(2, '0')}`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      // Draw stars with twinkling
      stars.forEach(star => {
        const twinkle = Math.sin(time * star.twinkleSpeed) * 0.5 + 0.5;
        const opacity = star.brightness * twinkle;

        // Glow
        const gradient = ctx.createRadialGradient(
          star.x, star.y, 0,
          star.x, star.y, star.size * 4
        );
        gradient.addColorStop(0, star.color + Math.floor(opacity * 60).toString(16).padStart(2, '0'));
        gradient.addColorStop(1, 'transparent');
        
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = star.color + Math.floor(opacity * 255).toString(16).padStart(2, '0');
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [theme, intensity, colors]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
});
ConstellationCanvas.displayName = 'ConstellationCanvas';

// Background components map
const backgrounds: Record<BackgroundType, React.ComponentType<{ theme: ColorTheme; intensity: number }>> = {
  'particles-network': ParticlesNetworkCanvas,
  'gradient-waves': GradientWavesCanvas,
  'floating-shapes': FloatingShapesCanvas,
  'matrix-rain': DataStreamCanvas,
  'geometric-flow': GeometricFlowCanvas,
  'aurora-glow': AuroraGlowCanvas,
  'data-stream': DataStreamCanvas,
  'constellation': ConstellationCanvas,
};

function CanvasBackground({ 
  type, 
  theme = 'neutral', 
  intensity = 1,
  className = '' 
}: CanvasBackgroundProps) {
  const Background = backgrounds[type];

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      <Background theme={theme} intensity={intensity} />
    </div>
  );
}

export default memo(CanvasBackground);
