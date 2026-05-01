'use client';

import { memo, useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { TrendingUp, Users, DollarSign, Target, BarChart3, Zap, Star, ArrowUpRight } from 'lucide-react';
import Image from 'next/image';

interface FloatingStat {
  icon: React.ElementType;
  value: string;
  label: string;
  position: { top?: string; bottom?: string; left?: string; right?: string };
  delay: number;
  color: string;
}

interface HeroImageProps {
  variant: 'meta' | 'google' | 'consult';
  className?: string;
}

const variantConfig = {
  meta: {
    image: '/images/hero-meta.jpg',
    stats: [
      { icon: TrendingUp, value: '+156%', label: 'ROAS', position: { top: '15%', right: '5%' }, delay: 0.3, color: '#E1306C' },
      { icon: Users, value: '85K+', label: 'Лидов', position: { top: '40%', left: '0%' }, delay: 0.5, color: '#833AB4' },
      { icon: DollarSign, value: '$12', label: 'CPL', position: { bottom: '25%', right: '10%' }, delay: 0.7, color: '#405DE6' },
    ] as FloatingStat[],
    gradient: 'from-[#E1306C]/20 via-[#833AB4]/10 to-[#405DE6]/20',
    accentColor: '#E1306C',
  },
  google: {
    image: '/images/hero-google.jpg',
    stats: [
      { icon: Target, value: '580%', label: 'ROAS', position: { top: '12%', right: '8%' }, delay: 0.3, color: '#4285f4' },
      { icon: BarChart3, value: '-42%', label: 'CPC', position: { top: '45%', left: '2%' }, delay: 0.5, color: '#34a853' },
      { icon: Zap, value: '2.4K', label: 'Конверсий', position: { bottom: '20%', right: '5%' }, delay: 0.7, color: '#fbbc04' },
    ] as FloatingStat[],
    gradient: 'from-[#4285f4]/20 via-[#34a853]/10 to-[#fbbc04]/20',
    accentColor: '#4285f4',
  },
  consult: {
    image: '/images/hero-consult.jpg',
    stats: [
      { icon: Star, value: '50+', label: 'Учеников', position: { top: '15%', right: '5%' }, delay: 0.3, color: '#8b5cf6' },
      { icon: ArrowUpRight, value: '$1K+', label: 'Доход/мес', position: { top: '42%', left: '0%' }, delay: 0.5, color: '#6366f1' },
      { icon: Target, value: '5+', label: 'Лет опыта', position: { bottom: '22%', right: '8%' }, delay: 0.7, color: '#a78bfa' },
    ] as FloatingStat[],
    gradient: 'from-[#8b5cf6]/20 via-[#6366f1]/10 to-[#a78bfa]/20',
    accentColor: '#8b5cf6',
  },
};

// Floating stat card
const FloatingStatCard = memo(({ stat, index }: { stat: FloatingStat; index: number }) => {
  const Icon = stat.icon;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ 
        duration: 0.8, 
        delay: stat.delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      className="absolute z-20"
      style={stat.position}
    >
      <motion.div
        animate={{ 
          y: [0, -8, 0],
          rotate: [0, index % 2 === 0 ? 2 : -2, 0]
        }}
        transition={{ 
          duration: 4 + index, 
          repeat: Infinity, 
          ease: 'easeInOut',
          delay: index * 0.5
        }}
        className="relative"
      >
        {/* Glow effect */}
        <div 
          className="absolute inset-0 rounded-2xl blur-xl opacity-40"
          style={{ background: stat.color }}
        />
        
        {/* Card */}
        <div className="relative px-4 py-3 rounded-2xl bg-background/80 backdrop-blur-xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${stat.color}20` }}
            >
              <Icon className="w-5 h-5" style={{ color: stat.color }} />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});
FloatingStatCard.displayName = 'FloatingStatCard';

// Animated line graph overlay
const AnimatedGraph = memo(({ color }: { color: string }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1, duration: 1 }}
      className="absolute bottom-8 left-4 right-4 h-20 z-10"
    >
      <svg viewBox="0 0 200 60" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`graph-gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Filled area */}
        <motion.path
          d="M0,50 Q20,45 40,40 T80,35 T120,25 T160,20 T200,10 V60 H0 Z"
          fill={`url(#graph-gradient-${color})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        />
        
        {/* Line */}
        <motion.path
          d="M0,50 Q20,45 40,40 T80,35 T120,25 T160,20 T200,10"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ delay: 1, duration: 1.5, ease: 'easeOut' }}
        />
        
        {/* Animated dot */}
        <motion.circle
          r="4"
          fill={color}
          initial={{ opacity: 0 }}
          animate={{ 
            opacity: [0, 1, 1],
            cx: [0, 200],
            cy: [50, 10]
          }}
          transition={{ 
            delay: 1,
            duration: 1.5, 
            ease: 'easeOut',
          }}
        />
      </svg>
    </motion.div>
  );
});
AnimatedGraph.displayName = 'AnimatedGraph';

// Animated data points
const DataPoints = memo(({ color }: { color: string }) => {
  const points = [
    { x: '20%', y: '30%', size: 6 },
    { x: '45%', y: '55%', size: 4 },
    { x: '70%', y: '25%', size: 8 },
    { x: '85%', y: '45%', size: 5 },
  ];

  return (
    <>
      {points.map((point, i) => (
        <motion.div
          key={i}
          className="absolute z-10"
          style={{ left: point.x, top: point.y }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.6, scale: 1 }}
          transition={{ delay: 1.5 + i * 0.2, duration: 0.5 }}
        >
          <motion.div
            animate={{ 
              scale: [1, 1.5, 1],
              opacity: [0.6, 0.3, 0.6]
            }}
            transition={{ 
              duration: 2 + i * 0.5, 
              repeat: Infinity, 
              ease: 'easeInOut' 
            }}
            style={{ 
              width: point.size * 3, 
              height: point.size * 3,
              background: color,
              borderRadius: '50%',
              filter: 'blur(8px)'
            }}
          />
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ 
              width: point.size, 
              height: point.size,
              background: color,
              boxShadow: `0 0 10px ${color}`
            }}
          />
        </motion.div>
      ))}
    </>
  );
});
DataPoints.displayName = 'DataPoints';

// Main component
function HeroImage({ variant, className = '' }: HeroImageProps) {
  const config = variantConfig[variant];
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Mouse parallax effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const springConfig = { damping: 30, stiffness: 100 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);
  
  const imageX = useTransform(x, [-100, 100], [-10, 10]);
  const imageY = useTransform(y, [-100, 100], [-10, 10]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      mouseX.set((e.clientX - centerX) / 5);
      mouseY.set((e.clientY - centerY) / 5);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
    >
      {/* Gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-50`} />
      
      {/* Image container with parallax */}
      <motion.div
        style={{ x: imageX, y: imageY }}
        className="absolute inset-0"
      >
        <motion.div
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full h-full"
        >
          <Image
            src={config.image}
            alt={`${variant} hero`}
            fill
            className="object-cover"
            priority
            onLoad={() => setIsLoaded(true)}
          />
          
          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-background/40" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-transparent" />
        </motion.div>
      </motion.div>
      
      {/* Animated overlays */}
      {isLoaded && (
        <>
          {/* Data points */}
          <DataPoints color={config.accentColor} />
          
          {/* Graph */}
          <AnimatedGraph color={config.accentColor} />
          
          {/* Floating stats */}
          {config.stats.map((stat, i) => (
            <FloatingStatCard key={i} stat={stat} index={i} />
          ))}
          
          {/* Scan lines effect */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              animate={{ y: ['0%', '100%'] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-x-0 h-[1px] opacity-20"
              style={{ background: `linear-gradient(90deg, transparent, ${config.accentColor}, transparent)` }}
            />
          </div>
          
          {/* Corner accents */}
          <div 
            className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 rounded-tl-lg opacity-30"
            style={{ borderColor: config.accentColor }}
          />
          <div 
            className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 rounded-br-lg opacity-30"
            style={{ borderColor: config.accentColor }}
          />
        </>
      )}
      
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.3)_100%)]" />
    </div>
  );
}

export default memo(HeroImage);
