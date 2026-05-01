'use client';

import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, Float } from '@react-three/drei';
import * as THREE from 'three';

// Color palettes for different page variants
const colorPalettes = {
  cosmic: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#a855f7',
    glow: '#8b5cf6',
    ambient: '#4c1d95',
  },
  digital: {
    primary: '#4285f4',
    secondary: '#34a853',
    accent: '#1a73e8',
    glow: '#4285f4',
    ambient: '#1e3a5f',
  },
  ethereal: {
    primary: '#8b5cf6',
    secondary: '#ec4899',
    accent: '#c084fc',
    glow: '#a855f7',
    ambient: '#581c87',
  }
};

// Animated whale model with smooth swimming motion
function WhaleModel({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const whaleRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/models/whale.glb');
  const { pointer, size } = useThree();
  
  const colors = colorPalettes[variant];
  
  // Clone scene and apply custom materials
  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Create beautiful gradient-like material
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(colors.primary),
          metalness: 0.1,
          roughness: 0.4,
          clearcoat: 0.3,
          clearcoatRoughness: 0.2,
          emissive: new THREE.Color(colors.glow),
          emissiveIntensity: 0.08,
          envMapIntensity: 1.2,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    return cloned;
  }, [scene, colors]);

  // Smooth animation state
  const animState = useRef({
    time: 0,
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
    breathPhase: 0,
  });

  useFrame((state, delta) => {
    if (!whaleRef.current) return;
    
    const anim = animState.current;
    anim.time += delta;
    anim.breathPhase += delta * 0.5;
    
    // Smooth mouse following with heavy dampening
    const mouseX = pointer.x * 1.5;
    const mouseY = pointer.y * 0.8;
    
    anim.targetX = mouseX;
    anim.targetY = mouseY;
    
    // Very smooth interpolation
    anim.currentX += (anim.targetX - anim.currentX) * 0.02;
    anim.currentY += (anim.targetY - anim.currentY) * 0.02;
    
    // Natural swimming motion - figure 8 pattern
    const swimX = Math.sin(anim.time * 0.3) * 0.4;
    const swimY = Math.sin(anim.time * 0.4) * 0.25 + Math.cos(anim.time * 0.2) * 0.15;
    const swimZ = Math.sin(anim.time * 0.25) * 0.3;
    
    // Breathing/floating effect
    const breathY = Math.sin(anim.breathPhase) * 0.08;
    
    // Position with smooth movement
    whaleRef.current.position.x = anim.currentX + swimX;
    whaleRef.current.position.y = anim.currentY + swimY + breathY;
    whaleRef.current.position.z = swimZ - 0.5;
    
    // Rotation follows swimming direction naturally
    const swimRotationY = Math.sin(anim.time * 0.3) * 0.15;
    const swimRotationX = Math.sin(anim.time * 0.4) * 0.05;
    const swimRotationZ = Math.sin(anim.time * 0.35) * 0.08;
    
    // Smooth rotation with mouse influence
    whaleRef.current.rotation.y = THREE.MathUtils.lerp(
      whaleRef.current.rotation.y,
      Math.PI * 0.15 + swimRotationY + anim.currentX * 0.15, // Facing slightly toward viewer
      0.03
    );
    
    whaleRef.current.rotation.x = THREE.MathUtils.lerp(
      whaleRef.current.rotation.x,
      swimRotationX - anim.currentY * 0.1,
      0.03
    );
    
    whaleRef.current.rotation.z = THREE.MathUtils.lerp(
      whaleRef.current.rotation.z,
      swimRotationZ,
      0.03
    );
  });

  return (
    <Float
      speed={1.5}
      rotationIntensity={0.2}
      floatIntensity={0.3}
      floatingRange={[-0.1, 0.1]}
    >
      <group 
        ref={whaleRef} 
        scale={0.65}
        position={[0, 0, 0]}
      >
        {/* Main whale model - rotated to face viewer diagonally */}
        <primitive 
          object={clonedScene} 
          rotation={[0, Math.PI * 0.75, 0]} // Face toward viewer at angle
        />
        
        {/* Soft glow light inside whale */}
        <pointLight 
          position={[0, 0, 0]} 
          intensity={0.3} 
          color={colors.glow} 
          distance={4}
        />
      </group>
    </Float>
  );
}

// Floating particles around the whale
function FloatingParticles({ 
  count = 80, 
  variant = 'cosmic' 
}: { 
  count?: number; 
  variant?: 'cosmic' | 'digital' | 'ethereal';
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const colors = colorPalettes[variant];
  
  const particles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6 - 2
      ),
      speed: 0.2 + Math.random() * 0.3,
      offset: Math.random() * Math.PI * 2,
      scale: 0.015 + Math.random() * 0.025
    }));
  }, [count]);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    const matrix = new THREE.Matrix4();
    
    particles.forEach((particle, i) => {
      // Gentle floating motion
      const x = particle.position.x + Math.sin(time * particle.speed + particle.offset) * 0.3;
      const y = particle.position.y + Math.cos(time * particle.speed * 0.7 + particle.offset) * 0.2;
      const z = particle.position.z + Math.sin(time * particle.speed * 0.5 + particle.offset) * 0.15;
      
      // Pulsing size
      const scale = particle.scale * (1 + Math.sin(time * 2 + particle.offset) * 0.3);
      
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(x, y, z);
      meshRef.current!.setMatrixAt(i, matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial 
        color={colors.accent} 
        transparent 
        opacity={0.6}
      />
    </instancedMesh>
  );
}

// Soft ambient glow effect
function AmbientGlow({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const glowRef = useRef<THREE.Mesh>(null);
  const colors = colorPalettes[variant];
  
  useFrame((state) => {
    if (!glowRef.current) return;
    const material = glowRef.current.material as THREE.MeshBasicMaterial;
    // Gentle pulsing glow
    material.opacity = 0.12 + Math.sin(state.clock.elapsedTime * 0.5) * 0.04;
  });
  
  return (
    <mesh ref={glowRef} position={[0, 0, -2]}>
      <sphereGeometry args={[3.5, 32, 32]} />
      <meshBasicMaterial 
        color={colors.glow} 
        transparent 
        opacity={0.12}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

// Main scene
interface Whale3DSceneProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  intensity?: 'low' | 'medium' | 'high';
}

function Whale3DScene({ variant = 'cosmic', intensity = 'high' }: Whale3DSceneProps) {
  const colors = colorPalettes[variant];
  const particleCount = intensity === 'high' ? 80 : intensity === 'medium' ? 50 : 30;
  
  return (
    <>
      {/* Soft ambient lighting */}
      <ambientLight intensity={0.4} color={colors.ambient} />
      
      {/* Key light - from top right */}
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={0.8} 
        color="#ffffff"
      />
      
      {/* Fill light - softer from left */}
      <pointLight 
        position={[-4, 2, 3]} 
        intensity={0.4} 
        color={colors.secondary}
      />
      
      {/* Rim light - for edge glow */}
      <pointLight 
        position={[0, -3, -3]} 
        intensity={0.3} 
        color={colors.accent}
      />
      
      {/* Ambient glow behind whale */}
      <AmbientGlow variant={variant} />
      
      {/* Floating particles */}
      <FloatingParticles count={particleCount} variant={variant} />
      
      {/* The whale */}
      <WhaleModel variant={variant} />
      
      {/* Environment for reflections */}
      <Environment preset="night" />
    </>
  );
}

// Loading state
function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-12 h-12 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );
}

// Main component
interface Whale3DProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
}

export default function Whale3D({ 
  variant = 'cosmic', 
  className = '', 
  intensity = 'high' 
}: Whale3DProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`relative ${className}`}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className={`relative overflow-visible ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ 
          background: 'transparent',
          pointerEvents: 'auto',
        }}
      >
        <Suspense fallback={null}>
          <Whale3DScene variant={variant} intensity={intensity} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Preload model
useGLTF.preload('/models/whale.glb');
