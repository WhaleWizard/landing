'use client';

import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  Float, 
  Environment, 
  Stars, 
  useGLTF,
  Sparkles,
  Trail,
} from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'motion/react';

// Preload the whale model
useGLTF.preload('/models/whale.glb');

// Premium whale with realistic swimming animation
function SwimmingWhale({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const whaleRef = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const timeRef = useRef(0);
  
  // Animation state
  const swimPhase = useRef(0);
  const breathingPhase = useRef(0);
  
  // Load the GLB model
  const { scene } = useGLTF('/models/whale.glb');
  
  // Premium material based on variant
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    
    const materialConfig = {
      cosmic: {
        color: '#0f172a',
        emissive: '#6366f1',
        emissiveIntensity: 0.08,
        metalness: 0.4,
        roughness: 0.6,
      },
      digital: {
        color: '#0c1929',
        emissive: '#3b82f6',
        emissiveIntensity: 0.1,
        metalness: 0.5,
        roughness: 0.5,
      },
      ethereal: {
        color: '#1a0a2e',
        emissive: '#8b5cf6',
        emissiveIntensity: 0.1,
        metalness: 0.3,
        roughness: 0.7,
      },
    };
    
    const config = materialConfig[variant];
    
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: config.color,
          metalness: config.metalness,
          roughness: config.roughness,
          emissive: config.emissive,
          emissiveIntensity: config.emissiveIntensity,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene, variant]);

  useFrame((state, delta) => {
    if (!whaleRef.current) return;
    
    const time = state.clock.elapsedTime;
    timeRef.current = time;
    
    // Update phases - slower for majestic movement
    swimPhase.current += delta * 0.35;
    breathingPhase.current += delta * 0.2;
    
    // Graceful swimming path - wide elegant curves
    const pathX = Math.sin(swimPhase.current * 0.3) * 2.5 + Math.sin(swimPhase.current * 0.7) * 0.5;
    const pathY = Math.sin(swimPhase.current * 0.5) * 0.6 + Math.sin(breathingPhase.current * 0.8) * 0.2;
    const pathZ = Math.cos(swimPhase.current * 0.25) * 1.2 + Math.sin(swimPhase.current * 0.6) * 0.3;
    
    // Ultra smooth position interpolation
    whaleRef.current.position.x = THREE.MathUtils.lerp(whaleRef.current.position.x, pathX, 0.012);
    whaleRef.current.position.y = THREE.MathUtils.lerp(whaleRef.current.position.y, pathY, 0.015);
    whaleRef.current.position.z = THREE.MathUtils.lerp(whaleRef.current.position.z, pathZ, 0.012);
    
    // Calculate swimming direction for rotation
    const velocityX = Math.cos(swimPhase.current * 0.3) * 0.3 + Math.cos(swimPhase.current * 0.7) * 0.1;
    const velocityZ = -Math.sin(swimPhase.current * 0.25) * 0.25;
    const targetAngle = Math.atan2(velocityX, velocityZ);
    
    // Very smooth rotation towards movement direction
    whaleRef.current.rotation.y = THREE.MathUtils.lerp(
      whaleRef.current.rotation.y,
      targetAngle + Math.PI,
      0.008
    );
    
    // Body undulation - realistic whale swimming motion
    whaleRef.current.rotation.z = Math.sin(time * 0.8) * 0.04 + Math.sin(time * 1.6) * 0.015;
    whaleRef.current.rotation.x = Math.sin(time * 0.5) * 0.03 + Math.sin(breathingPhase.current * 0.6) * 0.015;
    
    // Gentle mouse parallax - whale follows gaze
    const mouseX = pointer.x * 0.3;
    const mouseY = pointer.y * 0.2;
    whaleRef.current.position.x += mouseX * 0.015;
    whaleRef.current.position.y += mouseY * 0.015;
  });

  const trailColor = useMemo(() => {
    switch (variant) {
      case 'digital': return '#3b82f6';
      case 'ethereal': return '#8b5cf6';
      default: return '#6366f1';
    }
  }, [variant]);

  return (
    <group ref={whaleRef} scale={0.55} position={[0, 0, 0]}>
      <Trail
        width={1.5}
        length={8}
        color={trailColor}
        attenuation={(t) => t * t}
        decay={1}
      >
        <primitive object={clonedScene} />
      </Trail>
    </group>
  );
}

// Beautiful geometric whale fallback
function GeometricWhale({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const whaleRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const leftFinRef = useRef<THREE.Mesh>(null);
  const rightFinRef = useRef<THREE.Mesh>(null);
  const { pointer } = useThree();
  
  const swimPhase = useRef(0);
  
  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return { 
          body: '#0f2744', 
          accent: '#3b82f6', 
          glow: '#60a5fa',
          belly: '#1e3a5f'
        };
      case 'ethereal':
        return { 
          body: '#1a0f2e', 
          accent: '#8b5cf6', 
          glow: '#a78bfa',
          belly: '#2d1b4e'
        };
      default:
        return { 
          body: '#0f172a', 
          accent: '#6366f1', 
          glow: '#818cf8',
          belly: '#1e1b4b'
        };
    }
  }, [variant]);

  useFrame((state, delta) => {
    if (!whaleRef.current) return;
    
    const time = state.clock.elapsedTime;
    swimPhase.current += delta * 0.35;
    
    // Graceful swimming path - wide elegant curves
    const pathX = Math.sin(swimPhase.current * 0.3) * 2.2 + Math.sin(swimPhase.current * 0.6) * 0.4;
    const pathY = Math.sin(swimPhase.current * 0.5) * 0.5 + Math.sin(swimPhase.current * 0.9) * 0.15;
    const pathZ = Math.cos(swimPhase.current * 0.25) * 1.0 + Math.sin(swimPhase.current * 0.5) * 0.25;
    
    whaleRef.current.position.x = THREE.MathUtils.lerp(whaleRef.current.position.x, pathX, 0.012);
    whaleRef.current.position.y = THREE.MathUtils.lerp(whaleRef.current.position.y, pathY, 0.015);
    whaleRef.current.position.z = THREE.MathUtils.lerp(whaleRef.current.position.z, pathZ, 0.012);
    
    // Direction
    const velocityX = Math.cos(swimPhase.current * 0.3) * 0.3;
    const velocityZ = -Math.sin(swimPhase.current * 0.25) * 0.25;
    const targetAngle = Math.atan2(velocityX, velocityZ);
    
    whaleRef.current.rotation.y = THREE.MathUtils.lerp(
      whaleRef.current.rotation.y,
      targetAngle + Math.PI / 2,
      0.008
    );
    
    // Body wave - majestic undulation
    whaleRef.current.rotation.z = Math.sin(time * 0.8) * 0.035 + Math.sin(time * 1.4) * 0.012;
    whaleRef.current.rotation.x = Math.sin(time * 0.5) * 0.025 + Math.sin(time * 0.9) * 0.01;
    
    // Animate tail - smooth powerful strokes
    if (tailRef.current) {
      tailRef.current.rotation.y = Math.sin(time * 1.2) * 0.35 + Math.sin(time * 2.4) * 0.1;
    }
    
    // Animate fins - gentle paddling
    if (leftFinRef.current) {
      leftFinRef.current.rotation.z = Math.sin(time * 0.9) * 0.12 + 0.3;
    }
    if (rightFinRef.current) {
      rightFinRef.current.rotation.z = -Math.sin(time * 1.5) * 0.1 - 0.3;
    }
    
    // Mouse parallax
    whaleRef.current.position.x += pointer.x * 0.01;
    whaleRef.current.position.y += pointer.y * 0.008;
  });

  return (
    <group ref={whaleRef} scale={0.9}>
      {/* Main body - elongated ellipsoid */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.3}
          roughness={0.7}
          emissive={colors.accent}
          emissiveIntensity={0.05}
        />
        <mesh scale={[2.2, 0.9, 0.85]}>
          <sphereGeometry args={[1, 64, 64]} />
          <meshStandardMaterial 
            color={colors.body}
            metalness={0.3}
            roughness={0.7}
            emissive={colors.accent}
            emissiveIntensity={0.05}
          />
        </mesh>
      </mesh>
      
      {/* Belly - lighter area */}
      <mesh position={[0, -0.3, 0]} scale={[2, 0.6, 0.75]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          color={colors.belly}
          metalness={0.2}
          roughness={0.8}
        />
      </mesh>
      
      {/* Head */}
      <mesh position={[-1.8, 0.15, 0]} scale={[0.9, 0.65, 0.6]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.3}
          roughness={0.7}
          emissive={colors.accent}
          emissiveIntensity={0.03}
        />
      </mesh>
      
      {/* Snout */}
      <mesh position={[-2.5, 0.1, 0]} scale={[0.5, 0.35, 0.4]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>
      
      {/* Tail section */}
      <group ref={tailRef} position={[2.2, 0, 0]}>
        {/* Tail connector */}
        <mesh scale={[0.6, 0.35, 0.3]}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshStandardMaterial 
            color={colors.body}
            metalness={0.3}
            roughness={0.7}
          />
        </mesh>
        
        {/* Tail flukes */}
        <mesh position={[0.7, 0.3, 0]} rotation={[0, 0, 0.6]} scale={[0.7, 0.08, 0.35]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial 
            color={colors.body}
            metalness={0.4}
            roughness={0.6}
            emissive={colors.glow}
            emissiveIntensity={0.08}
          />
        </mesh>
        <mesh position={[0.7, -0.3, 0]} rotation={[0, 0, -0.6]} scale={[0.7, 0.08, 0.35]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial 
            color={colors.body}
            metalness={0.4}
            roughness={0.6}
            emissive={colors.glow}
            emissiveIntensity={0.08}
          />
        </mesh>
      </group>
      
      {/* Dorsal fin */}
      <mesh position={[0.3, 0.8, 0]} rotation={[0, 0, -0.15]}>
        <coneGeometry args={[0.25, 0.6, 16]} />
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.4}
          roughness={0.6}
          emissive={colors.accent}
          emissiveIntensity={0.04}
        />
      </mesh>
      
      {/* Pectoral fins */}
      <mesh 
        ref={leftFinRef}
        position={[-0.5, -0.3, 0.7]} 
        rotation={[0.2, 0.3, 0.3]} 
        scale={[0.6, 0.08, 0.25]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.4}
          roughness={0.6}
        />
      </mesh>
      <mesh 
        ref={rightFinRef}
        position={[-0.5, -0.3, -0.7]} 
        rotation={[-0.2, -0.3, -0.3]} 
        scale={[0.6, 0.08, 0.25]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color={colors.body}
          metalness={0.4}
          roughness={0.6}
        />
      </mesh>
      
      {/* Eyes */}
      <group position={[-2.1, 0.2, 0]}>
        <mesh position={[0, 0, 0.45]} scale={0.08}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0, 0.47]} scale={0.04}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color={colors.glow} />
        </mesh>
        
        <mesh position={[0, 0, -0.45]} scale={0.08}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0, -0.47]} scale={0.04}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color={colors.glow} />
        </mesh>
      </group>
      
      {/* Ambient glow around whale */}
      <mesh scale={[2.8, 1.3, 1.1]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial 
          color={colors.glow} 
          transparent 
          opacity={0.02} 
          side={THREE.BackSide} 
        />
      </mesh>
    </group>
  );
}

// Ambient particles
function AmbientParticles({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 200;
  
  const color = useMemo(() => {
    switch (variant) {
      case 'digital': return '#60a5fa';
      case 'ethereal': return '#a78bfa';
      default: return '#818cf8';
    }
  }, [variant]);
  
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 15;
    }
    return pos;
  }, []);
  
  const sizes = useMemo(() => {
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      s[i] = Math.random() * 0.03 + 0.01;
    }
    return s;
  }, []);

  useFrame((state) => {
    if (!particlesRef.current) return;
    
    const time = state.clock.elapsedTime;
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3 + 1] += Math.sin(time * 0.5 + i * 0.1) * 0.002;
    }
    
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
    particlesRef.current.rotation.y = time * 0.02;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.04}
        color={color}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Cinematic camera with parallax
function CinematicCamera() {
  const { camera, pointer } = useThree();
  
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Gentle camera sway
    const targetX = Math.sin(time * 0.1) * 0.5 + pointer.x * 0.6;
    const targetY = 0.3 + Math.sin(time * 0.15) * 0.2 + pointer.y * 0.3;
    const targetZ = 5.5 + Math.sin(time * 0.08) * 0.3;
    
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.01);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.01);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.01);
    
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

// Scene composition
function WhaleScene({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const { scene } = useThree();
  const [useGLB, setUseGLB] = useState(true);
  
  const bgColor = useMemo(() => {
    switch (variant) {
      case 'digital': return '#050a14';
      case 'ethereal': return '#0a0510';
      default: return '#050508';
    }
  }, [variant]);
  
  const lightColors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return { key: '#3b82f6', fill: '#60a5fa', rim: '#2563eb' };
      case 'ethereal':
        return { key: '#8b5cf6', fill: '#a78bfa', rim: '#7c3aed' };
      default:
        return { key: '#6366f1', fill: '#818cf8', rim: '#4f46e5' };
    }
  }, [variant]);

  useEffect(() => {
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, 0.06);
  }, [scene, bgColor]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.1} />
      
      <directionalLight
        position={[5, 5, 3]}
        intensity={0.6}
        color={lightColors.key}
        castShadow
      />
      
      <directionalLight
        position={[-5, 2, -5]}
        intensity={0.8}
        color={lightColors.rim}
      />
      
      <pointLight
        position={[0, -3, 2]}
        intensity={0.3}
        color={lightColors.fill}
      />
      
      <spotLight
        position={[0, 8, -2]}
        angle={0.5}
        penumbra={1}
        intensity={0.4}
        color={lightColors.rim}
      />
      
      <CinematicCamera />
      
      {/* Stars */}
      <Stars 
        radius={60} 
        depth={60} 
        count={3000} 
        factor={4} 
        saturation={0.2} 
        fade 
        speed={0.3} 
      />
      
      {/* Whale */}
      <Float speed={0.5} rotationIntensity={0.02} floatIntensity={0.1}>
        <Suspense fallback={<GeometricWhale variant={variant} />}>
          {useGLB ? (
            <SwimmingWhale variant={variant} />
          ) : (
            <GeometricWhale variant={variant} />
          )}
        </Suspense>
      </Float>
      
      {/* Particles */}
      <AmbientParticles variant={variant} />
      
      {/* Sparkles */}
      <Sparkles
        count={80}
        size={2.5}
        scale={[15, 10, 12]}
        speed={0.2}
        color={lightColors.key}
        opacity={0.4}
      />
      
      <Environment preset="night" />
    </>
  );
}

// Main component - NO BORDERS, NO MASKS, CLEAN BLEND
interface PremiumWhaleProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  className?: string;
}

export default function PremiumWhale({ 
  variant = 'cosmic', 
  className = '' 
}: PremiumWhaleProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const bgGradient = useMemo(() => {
    switch (variant) {
      case 'digital':
        return 'radial-gradient(ellipse at 50% 50%, #0a1525 0%, #050a14 50%, transparent 100%)';
      case 'ethereal':
        return 'radial-gradient(ellipse at 50% 50%, #150a25 0%, #0a0510 50%, transparent 100%)';
      default:
        return 'radial-gradient(ellipse at 50% 50%, #0a0a15 0%, #050508 50%, transparent 100%)';
    }
  }, [variant]);

  if (!mounted) {
    return (
      <div 
        className={`relative w-full h-full ${className}`}
        style={{ background: bgGradient }}
      />
    );
  }

  return (
    <motion.div 
      className={`relative w-full h-full ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
    >
      <Canvas
        camera={{ position: [0, 0.3, 5.5], fov: 50 }}
        dpr={[1, 2]}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        style={{ 
          position: 'absolute',
          inset: 0,
          background: 'transparent',
        }}
      >
        <Suspense fallback={null}>
          <WhaleScene variant={variant} />
        </Suspense>
      </Canvas>
    </motion.div>
  );
}
