import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  hue: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

export function CosmicWhale({ className = '' }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const animationRef = useRef<number>();
  const [isHovered, setIsHovered] = useState(false);

  // Mouse tracking
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const springConfig = { damping: 25, stiffness: 150 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), springConfig);

  // Initialize particles and stars
  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const stars: Star[] = [];

    // Create floating particles around whale
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 3 + 1,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.3 - 0.2,
        opacity: Math.random() * 0.6 + 0.2,
        hue: Math.random() * 60 + 240, // Purple to blue range
      });
    }

    // Create background stars
    for (let i = 0; i < 100; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.01,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    particlesRef.current = particles;
    starsRef.current = stars;
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      initParticles(rect.width, rect.height);
    };

    resize();
    window.addEventListener('resize', resize);

    let time = 0;
    const animate = () => {
      const rect = container.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      time += 0.016;

      // Draw stars with twinkling
      starsRef.current.forEach((star) => {
        const twinkle = Math.sin(time * star.twinkleSpeed * 60 + star.twinkleOffset) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
        ctx.fill();
      });

      // Draw and update particles
      particlesRef.current.forEach((particle) => {
        // Update position
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        // Wrap around
        if (particle.x < 0) particle.x = rect.width;
        if (particle.x > rect.width) particle.x = 0;
        if (particle.y < 0) particle.y = rect.height;
        if (particle.y > rect.height) particle.y = 0;

        // Draw particle with glow
        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, particle.size * 3
        );
        gradient.addColorStop(0, `hsla(${particle.hue}, 80%, 70%, ${particle.opacity})`);
        gradient.addColorStop(0.5, `hsla(${particle.hue}, 70%, 60%, ${particle.opacity * 0.5})`);
        gradient.addColorStop(1, `hsla(${particle.hue}, 60%, 50%, 0)`);

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initParticles]);

  // Mouse move handler
  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    
    mouseX.set(x);
    mouseY.set(y);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[400px] md:min-h-[500px] lg:min-h-[600px] ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        mouseX.set(0);
        mouseY.set(0);
      }}
    >
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Whale container with 3D transforms */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
          perspective: 1000,
        }}
      >
        {/* Outer glow */}
        <div className="absolute w-[80%] h-[80%] rounded-full bg-gradient-to-br from-violet-600/20 via-purple-500/10 to-blue-500/20 blur-3xl" />
        
        {/* Whale SVG */}
        <motion.svg
          viewBox="0 0 800 600"
          className="relative w-full h-full max-w-[600px] max-h-[450px]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          <defs>
            {/* Main body gradient */}
            <linearGradient id="whaleBodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="30%" stopColor="#312e81" />
              <stop offset="60%" stopColor="#4c1d95" />
              <stop offset="100%" stopColor="#1e1b4b" />
            </linearGradient>

            {/* Bioluminescence gradient */}
            <linearGradient id="bioGlow" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.3" />
            </linearGradient>

            {/* Belly gradient */}
            <linearGradient id="bellyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
            </linearGradient>

            {/* Glow filter */}
            <filter id="whaleGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Soft glow filter */}
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Ambient glow behind whale */}
          <motion.ellipse
            cx="400"
            cy="300"
            rx="250"
            ry="200"
            fill="url(#bioGlow)"
            opacity="0.3"
            filter="url(#whaleGlow)"
            animate={{
              rx: [250, 270, 250],
              ry: [200, 220, 200],
              opacity: [0.3, 0.4, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Main whale group with floating animation */}
          <motion.g
            animate={{
              y: [0, -15, 0],
              rotate: [-2, 2, -2],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            {/* Whale body - main shape */}
            <motion.path
              d="M 150 320 
                 Q 100 280 120 220
                 Q 140 160 220 140
                 Q 320 110 420 130
                 Q 520 150 580 200
                 Q 640 250 660 300
                 Q 680 350 650 380
                 Q 620 410 580 420
                 Q 520 440 450 430
                 Q 380 420 320 400
                 Q 260 380 200 370
                 Q 160 360 150 320 Z"
              fill="url(#whaleBodyGradient)"
              filter="url(#softGlow)"
              animate={{
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            {/* Belly grooves */}
            <g opacity="0.6">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <motion.path
                  key={i}
                  d={`M ${200 + i * 40} ${340 + i * 5} Q ${240 + i * 40} ${380 + i * 3} ${280 + i * 35} ${350 + i * 4}`}
                  stroke="url(#bellyGradient)"
                  strokeWidth="2"
                  fill="none"
                  opacity={0.4 + i * 0.05}
                  animate={{
                    opacity: [0.4 + i * 0.05, 0.6 + i * 0.05, 0.4 + i * 0.05],
                  }}
                  transition={{
                    duration: 2,
                    delay: i * 0.1,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </g>

            {/* Head detail */}
            <path
              d="M 120 220 Q 100 200 110 180 Q 130 160 160 165 Q 140 190 120 220"
              fill="#312e81"
              opacity="0.7"
            />

            {/* Eye */}
            <motion.g
              animate={{
                scale: isHovered ? [1, 1.1, 1] : 1,
              }}
              transition={{
                duration: 0.3,
              }}
            >
              <ellipse cx="155" cy="210" rx="12" ry="10" fill="#0f0f1a" />
              <ellipse cx="158" cy="208" rx="5" ry="4" fill="#8b5cf6" opacity="0.8" />
              <circle cx="160" cy="206" r="2" fill="#ffffff" opacity="0.9" />
            </motion.g>

            {/* Pectoral fin (left) */}
            <motion.path
              d="M 280 380 
                 Q 240 420 200 480
                 Q 180 520 220 510
                 Q 280 490 320 440
                 Q 340 410 300 390 Z"
              fill="url(#whaleBodyGradient)"
              filter="url(#softGlow)"
              animate={{
                rotate: [-5, 5, -5],
                y: [0, 10, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ transformOrigin: '280px 380px' }}
            />

            {/* Dorsal fin */}
            <path
              d="M 480 140 Q 500 100 520 90 Q 540 100 530 140 Q 510 160 480 140"
              fill="#312e81"
              opacity="0.9"
            />

            {/* Tail flukes */}
            <motion.g
              animate={{
                rotate: [-8, 8, -8],
                x: [0, 10, 0],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ transformOrigin: '620px 340px' }}
            >
              {/* Upper fluke */}
              <path
                d="M 620 320 
                   Q 680 280 740 240
                   Q 760 230 750 260
                   Q 720 300 660 340
                   Q 640 350 620 340 Z"
                fill="url(#whaleBodyGradient)"
                filter="url(#softGlow)"
              />
              {/* Lower fluke */}
              <path
                d="M 620 360 
                   Q 680 400 740 440
                   Q 760 460 740 450
                   Q 700 420 650 380
                   Q 630 370 620 360 Z"
                fill="url(#whaleBodyGradient)"
                filter="url(#softGlow)"
              />
            </motion.g>

            {/* Bioluminescent lines */}
            <g filter="url(#whaleGlow)">
              {[0, 1, 2, 3].map((i) => (
                <motion.path
                  key={`bio-${i}`}
                  d={`M ${180 + i * 80} ${280 - i * 10} Q ${220 + i * 80} ${260 - i * 10} ${260 + i * 80} ${290 - i * 8}`}
                  stroke="#06b6d4"
                  strokeWidth="2"
                  fill="none"
                  opacity="0.6"
                  animate={{
                    opacity: [0.4, 0.8, 0.4],
                    strokeWidth: [2, 3, 2],
                  }}
                  transition={{
                    duration: 2,
                    delay: i * 0.3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </g>

            {/* Glowing spots */}
            {[
              { cx: 200, cy: 260, r: 4 },
              { cx: 280, cy: 240, r: 3 },
              { cx: 360, cy: 230, r: 5 },
              { cx: 440, cy: 250, r: 3 },
              { cx: 520, cy: 280, r: 4 },
              { cx: 300, cy: 320, r: 3 },
              { cx: 400, cy: 340, r: 4 },
              { cx: 180, cy: 300, r: 3 },
            ].map((spot, i) => (
              <motion.circle
                key={`spot-${i}`}
                cx={spot.cx}
                cy={spot.cy}
                r={spot.r}
                fill="#8b5cf6"
                filter="url(#whaleGlow)"
                animate={{
                  opacity: [0.5, 1, 0.5],
                  r: [spot.r, spot.r * 1.3, spot.r],
                }}
                transition={{
                  duration: 1.5 + i * 0.2,
                  delay: i * 0.15,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </motion.g>

          {/* Bubbles */}
          {[
            { x: 130, y: 200, size: 8, delay: 0 },
            { x: 110, y: 180, size: 5, delay: 0.5 },
            { x: 140, y: 160, size: 6, delay: 1 },
            { x: 100, y: 220, size: 4, delay: 1.5 },
          ].map((bubble, i) => (
            <motion.circle
              key={`bubble-${i}`}
              cx={bubble.x}
              cy={bubble.y}
              r={bubble.size}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="1.5"
              opacity="0.5"
              animate={{
                y: [bubble.y, bubble.y - 100],
                opacity: [0.6, 0],
                scale: [1, 1.5],
              }}
              transition={{
                duration: 3,
                delay: bubble.delay,
                repeat: Infinity,
                ease: 'easeOut',
              }}
            />
          ))}
        </motion.svg>
      </motion.div>

      {/* Extra glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-1/4 right-1/4 w-32 h-32 bg-violet-500/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-1/3 left-1/3 w-24 h-24 bg-cyan-500/20 rounded-full blur-2xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 3,
            delay: 1,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>
    </div>
  );
}

export default CosmicWhale;
