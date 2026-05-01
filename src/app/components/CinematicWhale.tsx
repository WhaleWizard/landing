import { useRef, useMemo, useState, useEffect, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  Float, 
  Environment, 
  Stars, 
  useGLTF,
  Sparkles,
} from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'motion/react';

// Preload the whale model
useGLTF.preload('/models/whale.glb');

// Cinematic whale component with GLB model
function WhaleModel({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const whaleRef = useRef<THREE.Group>(null);
  const { pointer, viewport, camera } = useThree();
  const timeRef = useRef(0);
  const swimDirectionRef = useRef(1);
  const lastLookAtTimeRef = useRef(0);
  
  // Load the GLB model
  const { scene } = useGLTF('/models/whale.glb');
  
  // Clone the scene for independent manipulation
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Apply premium material
        child.material = new THREE.MeshStandardMaterial({
          color: variant === 'digital' ? '#1a3a5c' : variant === 'ethereal' ? '#2d1b4e' : '#1e1b4b',
          metalness: 0.7,
          roughness: 0.3,
          emissive: variant === 'digital' ? '#4285f4' : variant === 'ethereal' ? '#8b5cf6' : '#6366f1',
          emissiveIntensity: 0.15,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene, variant]);

  useFrame((state) => {
    if (!whaleRef.current) return;
    
    const time = state.clock.elapsedTime;
    timeRef.current = time;
    
    // Swimming forward-backward movement
    whaleRef.current.position.x += 0.008 * swimDirectionRef.current;
    
    // Reverse direction when reaching boundaries
    if (whaleRef.current.position.x > 2.5) swimDirectionRef.current = -1;
    if (whaleRef.current.position.x < -2.5) swimDirectionRef.current = 1;
    
    // Gentle diving motion
    whaleRef.current.position.y = Math.sin(time * 0.8) * 0.4;
    whaleRef.current.position.z = Math.sin(time * 0.5) * 0.3;
    
    // Body wave motion for realism
    whaleRef.current.rotation.z = Math.sin(time * 1.2) * 0.04;
    whaleRef.current.rotation.x = Math.sin(time * 0.6) * 0.025;
    
    // Turn based on swim direction
    const targetRotY = swimDirectionRef.current === 1 ? -Math.PI / 2 : Math.PI / 2;
    whaleRef.current.rotation.y = THREE.MathUtils.lerp(
      whaleRef.current.rotation.y,
      targetRotY,
      0.02
    );
    
    // Occasionally look at camera (creates awareness effect)
    if (Math.sin(time * 0.15) > 0.85 && time - lastLookAtTimeRef.current > 3) {
      lastLookAtTimeRef.current = time;
    }
    
    // Subtle mouse parallax
    const mouseInfluenceX = pointer.x * 0.15;
    const mouseInfluenceY = pointer.y * 0.1;
    whaleRef.current.position.x += mouseInfluenceX * 0.02;
    whaleRef.current.position.y += mouseInfluenceY * 0.02;
  });

  return (
    <group ref={whaleRef} scale={0.6} position={[0, 0, 0]}>
      <primitive object={clonedScene} />
      
      {/* Glow effect around whale */}
      <mesh scale={[2.5, 1.8, 1.5]} position={[0, 0, 0]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial 
          color={variant === 'digital' ? '#4285f4' : variant === 'ethereal' ? '#8b5cf6' : '#6366f1'} 
          transparent 
          opacity={0.03} 
          side={THREE.BackSide} 
        />
      </mesh>
    </group>
  );
}

// Fallback whale using geometry (in case GLB fails to load)
function FallbackWhale({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const whaleRef = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const timeRef = useRef(0);
  const swimDirectionRef = useRef(1);
  
  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return { primary: '#1a3a5c', emissive: '#4285f4', glow: '#34a853' };
      case 'ethereal':
        return { primary: '#2d1b4e', emissive: '#8b5cf6', glow: '#a855f7' };
      default:
        return { primary: '#1e1b4b', emissive: '#6366f1', glow: '#8b5cf6' };
    }
  }, [variant]);

  useFrame((state) => {
    if (!whaleRef.current) return;
    
    const time = state.clock.elapsedTime;
    timeRef.current = time;
    
    // Swimming movement
    whaleRef.current.position.x += 0.008 * swimDirectionRef.current;
    if (whaleRef.current.position.x > 2.5) swimDirectionRef.current = -1;
    if (whaleRef.current.position.x < -2.5) swimDirectionRef.current = 1;
    
    // Diving motion
    whaleRef.current.position.y = Math.sin(time * 0.8) * 0.4;
    
    // Body wave
    whaleRef.current.rotation.z = Math.sin(time * 1.2) * 0.04;
    whaleRef.current.rotation.x = Math.sin(time * 0.6) * 0.025;
    
    // Direction
    const targetRotY = swimDirectionRef.current === 1 ? 0 : Math.PI;
    whaleRef.current.rotation.y = THREE.MathUtils.lerp(whaleRef.current.rotation.y, targetRotY, 0.02);
    
    // Mouse parallax
    whaleRef.current.position.x += pointer.x * 0.003;
    whaleRef.current.position.y += pointer.y * 0.002;
  });

  return (
    <group ref={whaleRef} scale={1}>
      {/* Main body */}
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.5, 2, 32, 64]} />
        <meshStandardMaterial 
          color={colors.primary}
          metalness={0.7}
          roughness={0.3}
          emissive={colors.emissive}
          emissiveIntensity={0.15}
        />
      </mesh>
      
      {/* Head */}
      <mesh position={[-1.3, 0.1, 0]} scale={[0.8, 0.6, 0.5]}>
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshStandardMaterial 
          color={colors.primary}
          metalness={0.7}
          roughness={0.3}
          emissive={colors.emissive}
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Tail */}
      <group position={[1.5, 0, 0]}>
        <mesh position={[0.3, 0.25, 0]} rotation={[0, 0, 0.4]} scale={[0.4, 0.08, 0.25]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial 
            color={colors.primary}
            metalness={0.8}
            roughness={0.2}
            emissive={colors.glow}
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0.3, -0.25, 0]} rotation={[0, 0, -0.4]} scale={[0.4, 0.08, 0.25]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial 
            color={colors.primary}
            metalness={0.8}
            roughness={0.2}
            emissive={colors.glow}
            emissiveIntensity={0.3}
          />
        </mesh>
      </group>
      
      {/* Dorsal fin */}
      <mesh position={[0, 0.6, 0]} rotation={[0, 0, -0.2]} scale={[0.25, 0.35, 0.08]}>
        <coneGeometry args={[0.5, 1, 16]} />
        <meshStandardMaterial 
          color={colors.primary}
          metalness={0.7}
          roughness={0.3}
          emissive={colors.emissive}
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Pectoral fins */}
      <mesh position={[-0.2, -0.2, 0.5]} rotation={[0.3, 0, 0.3]} scale={[0.35, 0.08, 0.2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color={colors.primary}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[-0.2, -0.2, -0.5]} rotation={[-0.3, 0, -0.3]} scale={[0.35, 0.08, 0.2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color={colors.primary}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      
      {/* Eyes */}
      <mesh position={[-1.5, 0.15, 0.3]} scale={0.08}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-1.5, 0.15, -0.3]} scale={0.08}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      
      {/* Glow */}
      <mesh scale={[2, 1.2, 1]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={colors.glow} transparent opacity={0.04} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

// Cinematic camera movement
function CinematicCamera() {
  const { camera, pointer } = useThree();
  const timeRef = useRef(0);
  
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    timeRef.current = time;
    
    // Slow cinematic camera movement
    const targetX = Math.sin(time * 0.15) * 1.2 + pointer.x * 0.8;
    const targetY = 0.8 + Math.sin(time * 0.3) * 0.15 + pointer.y * 0.4;
    const targetZ = 6 + Math.sin(time * 0.1) * 0.5;
    
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.015);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.015);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.01);
    
    // Always look at center with slight offset
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

// Floating particles that react to whale movement
function ReactiveParticles({ count = 150, variant = 'cosmic' }: { count?: number; variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { pointer } = useThree();
  
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 3 + Math.random() * 6;
      
      temp.push({
        position: new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi)
        ),
        speed: 0.3 + Math.random() * 0.8,
        offset: Math.random() * Math.PI * 2,
        scale: 0.015 + Math.random() * 0.035
      });
    }
    return temp;
  }, [count]);

  const color = useMemo(() => {
    switch (variant) {
      case 'digital': return '#4285f4';
      case 'ethereal': return '#a855f7';
      default: return '#8b5cf6';
    }
  }, [variant]);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    const matrix = new THREE.Matrix4();
    
    particles.forEach((particle, i) => {
      const { position, speed, offset, scale } = particle;
      
      // Gentle orbital motion with displacement effect
      const angle = time * speed * 0.15 + offset;
      
      const x = position.x * Math.cos(angle * 0.3) - position.z * Math.sin(angle * 0.3);
      const y = position.y + Math.sin(time * speed * 0.5 + offset) * 0.3;
      const z = position.x * Math.sin(angle * 0.3) + position.z * Math.cos(angle * 0.3);
      
      // Shimmer effect
      const shimmer = 0.7 + Math.sin(time * 3 + offset) * 0.3;
      const dynamicScale = scale * shimmer;
      
      matrix.makeScale(dynamicScale, dynamicScale, dynamicScale);
      matrix.setPosition(x, y, z);
      meshRef.current!.setMatrixAt(i, matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.7} />
    </instancedMesh>
  );
}

// God rays / volumetric light effect
function VolumetricLight({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const lightRef = useRef<THREE.Mesh>(null);
  
  const color = useMemo(() => {
    switch (variant) {
      case 'digital': return '#4285f4';
      case 'ethereal': return '#a855f7';
      default: return '#6366f1';
    }
  }, [variant]);

  useFrame((state) => {
    if (!lightRef.current) return;
    const time = state.clock.elapsedTime;
    
    // Subtle pulsing
    lightRef.current.material.opacity = 0.03 + Math.sin(time * 0.5) * 0.01;
    lightRef.current.rotation.z = time * 0.02;
  });

  return (
    <mesh ref={lightRef} position={[0, 5, -5]} rotation={[0.5, 0, 0]}>
      <coneGeometry args={[8, 15, 32, 1, true]} />
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={0.04} 
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// Deep ocean fog
function DeepFog({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const { scene } = useThree();
  
  useEffect(() => {
    const fogColor = variant === 'digital' ? '#0a1628' : variant === 'ethereal' ? '#1a0a2e' : '#0a0a1f';
    scene.fog = new THREE.Fog(fogColor, 4, 15);
    scene.background = new THREE.Color(fogColor);
    
    return () => {
      scene.fog = null;
    };
  }, [scene, variant]);
  
  return null;
}

// Main scene composition
interface CinematicSceneProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  intensity?: 'low' | 'medium' | 'high';
}

function CinematicScene({ variant = 'cosmic', intensity = 'high' }: CinematicSceneProps) {
  const particleCount = intensity === 'high' ? 150 : intensity === 'medium' ? 80 : 40;
  const [modelLoaded, setModelLoaded] = useState(true);
  
  const lightColors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return { main: '#4285f4', secondary: '#34a853', accent: '#fbbc04' };
      case 'ethereal':
        return { main: '#8b5cf6', secondary: '#a855f7', accent: '#ec4899' };
      default:
        return { main: '#6366f1', secondary: '#8b5cf6', accent: '#a855f7' };
    }
  }, [variant]);

  return (
    <>
      {/* Lighting setup for cinematic feel */}
      <ambientLight intensity={0.15} />
      
      {/* Main key light */}
      <directionalLight
        position={[5, 5, 5]}
        intensity={0.8}
        color={lightColors.main}
        castShadow
      />
      
      {/* Back light for silhouette (god ray effect) */}
      <directionalLight
        position={[-5, 3, -5]}
        intensity={1.2}
        color={lightColors.accent}
      />
      
      {/* Fill light */}
      <pointLight
        position={[0, -3, 3]}
        intensity={0.4}
        color={lightColors.secondary}
      />
      
      {/* Rim light */}
      <spotLight
        position={[0, 8, -3]}
        angle={0.4}
        penumbra={1}
        intensity={0.6}
        color={lightColors.accent}
      />
      
      <DeepFog variant={variant} />
      <CinematicCamera />
      
      {/* Stars background */}
      <Stars 
        radius={40} 
        depth={50} 
        count={2500} 
        factor={3} 
        saturation={0.3} 
        fade 
        speed={0.5} 
      />
      
      {/* Volumetric light effect */}
      <VolumetricLight variant={variant} />
      
      {/* The whale */}
      <Float speed={0.8} rotationIntensity={0.05} floatIntensity={0.2}>
        <Suspense fallback={<FallbackWhale variant={variant} />}>
          {modelLoaded ? (
            <WhaleModel variant={variant} />
          ) : (
            <FallbackWhale variant={variant} />
          )}
        </Suspense>
      </Float>
      
      {/* Floating particles */}
      <ReactiveParticles count={particleCount} variant={variant} />
      
      {/* Sparkle effect */}
      <Sparkles
        count={60}
        size={2}
        scale={[12, 8, 10]}
        speed={0.3}
        color={lightColors.main}
        opacity={0.5}
      />
      
      <Environment preset="night" />
    </>
  );
}



// Loading fallback component
function LoadingState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative">
        <div className="w-16 h-16 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        <div className="absolute inset-0 w-16 h-16 border-2 border-transparent border-b-accent/50 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
      </div>
    </div>
  );
}

// Main exported component
interface CinematicWhaleProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
}

export default function CinematicWhale({ 
  variant = 'cosmic', 
  className = '', 
  intensity = 'high' 
}: CinematicWhaleProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`relative w-full h-full ${className}`}>
        <div 
          className="absolute inset-0"
          style={{
            background: variant === 'digital' 
              ? 'radial-gradient(ellipse at center, #0a1628 0%, #050510 100%)' 
              : variant === 'ethereal'
              ? 'radial-gradient(ellipse at center, #1a0a2e 0%, #050510 100%)'
              : 'radial-gradient(ellipse at center, #0a0a1f 0%, #050510 100%)'
          }}
        />
        <LoadingState />
      </div>
    );
  }

  return (
    <motion.div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        // Smooth fade at edges instead of hard clip
        maskImage: 'radial-gradient(ellipse 85% 80% at 50% 50%, black 60%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 85% 80% at 50% 50%, black 60%, transparent 100%)',
      }}
    >
      <Canvas
        camera={{ position: [0, 0.5, 6], fov: 55 }}
        dpr={[1, 2]}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        shadows
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <CinematicScene variant={variant} intensity={intensity} />
        </Suspense>
      </Canvas>
      
      {/* Smooth gradient overlay for seamless blending */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, ${variant === 'digital' ? '#0a1628' : variant === 'ethereal' ? '#1a0a2e' : '#0a0a0f'} 100%)
          `,
          opacity: 0.6,
        }}
      />
    </motion.div>
  );
}
