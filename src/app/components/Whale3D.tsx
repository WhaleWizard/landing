'use client';

import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Color palettes for different page variants
const colorPalettes = {
  cosmic: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#a855f7',
    glow: '#8b5cf6',
    fog: '#0f0a1f',
    background: '#050510',
    particles: ['#6366f1', '#8b5cf6', '#a855f7', '#c084fc', '#ffffff']
  },
  digital: {
    primary: '#4285f4',
    secondary: '#34a853',
    accent: '#1a73e8',
    glow: '#4285f4',
    fog: '#0d1a2d',
    background: '#080f1a',
    particles: ['#4285f4', '#34a853', '#ea4335', '#fbbc04', '#ffffff']
  },
  ethereal: {
    primary: '#8b5cf6',
    secondary: '#a855f7',
    accent: '#c084fc',
    glow: '#a855f7',
    fog: '#1a0a2e',
    background: '#0a0a1f',
    particles: ['#8b5cf6', '#a855f7', '#c084fc', '#e879f9', '#ffffff']
  }
};

// Cinematic whale model component
function WhaleModel({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const whaleRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/models/whale.glb');
  const { pointer, viewport } = useThree();
  
  const colors = colorPalettes[variant];
  
  // Clone scene to avoid mutation issues
  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    
    // Apply custom material to all meshes
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colors.primary),
          metalness: 0.7,
          roughness: 0.25,
          envMapIntensity: 1.5,
          emissive: new THREE.Color(colors.glow),
          emissiveIntensity: 0.15,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    return cloned;
  }, [scene, colors]);

  // Animation state for cinematic movement
  const animState = useRef({
    phase: 'swimming' as 'swimming' | 'passing' | 'turning',
    phaseTime: 0,
    baseX: 0,
    baseY: 0,
    baseZ: -2,
    targetRotY: 0,
    swimCycle: 0
  });

  useFrame((state, delta) => {
    if (!whaleRef.current) return;
    
    const time = state.clock.elapsedTime;
    const anim = animState.current;
    
    anim.phaseTime += delta;
    anim.swimCycle += delta;
    
    // Phase transitions - create varied movement patterns
    if (anim.phaseTime > 8 + Math.random() * 4) {
      anim.phaseTime = 0;
      const rand = Math.random();
      if (rand < 0.4) {
        anim.phase = 'swimming';
      } else if (rand < 0.7) {
        anim.phase = 'passing';
      } else {
        anim.phase = 'turning';
      }
    }
    
    // Mouse influence for subtle parallax
    const mouseX = pointer.x * viewport.width * 0.08;
    const mouseY = pointer.y * viewport.height * 0.05;
    
    // Swimming body wave animation - critical for life-like feel
    const bodyWave = Math.sin(anim.swimCycle * 1.5) * 0.06;
    const tailWave = Math.sin(anim.swimCycle * 2.2) * 0.12;
    
    // Phase-based movement
    let targetX = anim.baseX;
    let targetY = anim.baseY;
    let targetZ = anim.baseZ;
    let targetRotY = 0;
    
    switch (anim.phase) {
      case 'swimming':
        // Gentle drift with figure-8 pattern
        targetX = Math.sin(time * 0.15) * 1.5 + mouseX;
        targetY = Math.sin(time * 0.2) * 0.8 + Math.cos(time * 0.12) * 0.3 + mouseY;
        targetZ = -2 + Math.sin(time * 0.1) * 0.5;
        targetRotY = Math.sin(time * 0.15) * 0.25;
        break;
        
      case 'passing':
        // Cinematic close pass - whale moves across the view
        const passProgress = (anim.phaseTime / 8);
        targetX = THREE.MathUtils.lerp(-4, 4, passProgress) + mouseX * 0.5;
        targetY = Math.sin(passProgress * Math.PI) * 0.8 + mouseY * 0.5;
        targetZ = -1.5 + Math.sin(passProgress * Math.PI) * 0.8;
        targetRotY = -0.3;
        break;
        
      case 'turning':
        // Whale turns toward camera - aware of viewer
        targetX = mouseX * 1.5;
        targetY = mouseY * 1.2;
        targetZ = -1.5;
        // Look toward camera/mouse
        targetRotY = Math.atan2(pointer.x, 1) * 0.5;
        break;
    }
    
    // Smooth interpolation for all movements
    whaleRef.current.position.x = THREE.MathUtils.lerp(
      whaleRef.current.position.x,
      targetX,
      0.015
    );
    whaleRef.current.position.y = THREE.MathUtils.lerp(
      whaleRef.current.position.y,
      targetY,
      0.015
    );
    whaleRef.current.position.z = THREE.MathUtils.lerp(
      whaleRef.current.position.z,
      targetZ,
      0.01
    );
    
    // Rotation with swimming motion
    whaleRef.current.rotation.y = THREE.MathUtils.lerp(
      whaleRef.current.rotation.y,
      targetRotY + bodyWave,
      0.02
    );
    
    // Natural pitch from swimming
    whaleRef.current.rotation.x = THREE.MathUtils.lerp(
      whaleRef.current.rotation.x,
      -pointer.y * 0.08 + Math.sin(time * 0.3) * 0.03,
      0.02
    );
    
    // Roll for organic feel
    whaleRef.current.rotation.z = Math.sin(time * 0.4) * 0.04 + tailWave * 0.3;
    
    // Update base position for next phase
    anim.baseX = whaleRef.current.position.x;
    anim.baseY = whaleRef.current.position.y;
    anim.baseZ = whaleRef.current.position.z;
  });

  return (
    <group ref={whaleRef} position={[0, 0, -2]} scale={0.8}>
      <primitive object={clonedScene} rotation={[0, -Math.PI / 2, 0]} />
      
      {/* Subsurface scattering imitation - soft inner glow */}
      <pointLight 
        position={[0, 0, 0]} 
        intensity={0.5} 
        color={colors.glow} 
        distance={3}
      />
    </group>
  );
}

// Cinematic camera controller
function CinematicCamera({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const { camera, pointer } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 7));
  const lookAtRef = useRef(new THREE.Vector3(0, 0, 0));
  
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Subtle camera movement - like a cinematic observer
    const breathX = Math.sin(time * 0.12) * 0.15;
    const breathY = Math.sin(time * 0.08) * 0.1;
    
    // Mouse parallax - subtle and premium
    const parallaxX = pointer.x * 0.4;
    const parallaxY = pointer.y * 0.25;
    
    // Update camera position smoothly
    targetRef.current.set(
      parallaxX + breathX,
      parallaxY + breathY,
      7 + Math.sin(time * 0.1) * 0.3
    );
    
    camera.position.lerp(targetRef.current, 0.02);
    
    // Look at center with slight offset for tracking feel
    lookAtRef.current.set(
      parallaxX * 0.3,
      parallaxY * 0.2,
      0
    );
    
    camera.lookAt(lookAtRef.current);
  });
  
  return null;
}

// Volumetric light rays effect
function GodRays({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const raysRef = useRef<THREE.Group>(null);
  const colors = colorPalettes[variant];
  
  useFrame((state) => {
    if (!raysRef.current) return;
    const time = state.clock.elapsedTime;
    
    raysRef.current.children.forEach((ray, i) => {
      const mesh = ray as THREE.Mesh;
      const material = mesh.material as THREE.MeshBasicMaterial;
      
      // Pulsing opacity for light breathing effect
      material.opacity = 0.03 + Math.sin(time * 0.5 + i * 0.8) * 0.015;
      
      // Subtle rotation
      mesh.rotation.z = time * 0.02 + i * 0.3;
    });
  });
  
  return (
    <group ref={raysRef} position={[3, 5, -5]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} rotation={[0, 0, i * 0.2]}>
          <planeGeometry args={[0.5, 20]} />
          <meshBasicMaterial 
            color={colors.glow} 
            transparent 
            opacity={0.04}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

// Interactive particles that react to whale movement
function AtmosphericParticles({ 
  count = 200, 
  variant = 'cosmic' 
}: { 
  count?: number; 
  variant?: 'cosmic' | 'digital' | 'ethereal';
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { pointer } = useThree();
  const colors = colorPalettes[variant];
  
  const particles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 10 - 3
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.01
      ),
      baseScale: 0.01 + Math.random() * 0.03,
      offset: Math.random() * Math.PI * 2
    }));
  }, [count]);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    
    particles.forEach((particle, i) => {
      // Drift motion
      particle.position.add(particle.velocity);
      
      // Wrap around boundaries
      if (particle.position.x > 8) particle.position.x = -8;
      if (particle.position.x < -8) particle.position.x = 8;
      if (particle.position.y > 6) particle.position.y = -6;
      if (particle.position.y < -6) particle.position.y = 6;
      
      // Mouse influence - particles flow away from cursor
      const mouseForce = new THREE.Vector2(pointer.x * 3, pointer.y * 2);
      const particleXY = new THREE.Vector2(particle.position.x, particle.position.y);
      const dist = particleXY.distanceTo(mouseForce);
      
      if (dist < 3) {
        const force = (3 - dist) * 0.003;
        particle.velocity.x += (particle.position.x - mouseForce.x) * force * 0.1;
        particle.velocity.y += (particle.position.y - mouseForce.y) * force * 0.1;
      }
      
      // Damping
      particle.velocity.multiplyScalar(0.99);
      
      // Pulsing scale
      const scale = particle.baseScale * (1 + Math.sin(time * 1.5 + particle.offset) * 0.3);
      
      // Shimmer effect when light passes
      const shimmer = Math.sin(time * 2 + particle.offset) > 0.8 ? 1.5 : 1;
      
      matrix.makeScale(scale * shimmer, scale * shimmer, scale * shimmer);
      matrix.setPosition(particle.position);
      meshRef.current!.setMatrixAt(i, matrix);
      
      // Color variation
      const colorIndex = i % colors.particles.length;
      color.set(colors.particles[colorIndex]);
      meshRef.current!.setColorAt(i, color);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial transparent opacity={0.7} />
    </instancedMesh>
  );
}

// Deep fog effect for depth
function DeepFog({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const colors = colorPalettes[variant];
  
  return (
    <>
      <fog attach="fog" args={[colors.fog, 5, 25]} />
      
      {/* Background gradient plane */}
      <mesh position={[0, 0, -15]}>
        <planeGeometry args={[50, 50]} />
        <shaderMaterial
          uniforms={{
            uColorTop: { value: new THREE.Color(colors.fog) },
            uColorBottom: { value: new THREE.Color(colors.background) }
          }}
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform vec3 uColorTop;
            uniform vec3 uColorBottom;
            varying vec2 vUv;
            void main() {
              vec3 color = mix(uColorBottom, uColorTop, vUv.y);
              gl_FragColor = vec4(color, 1.0);
            }
          `}
        />
      </mesh>
    </>
  );
}

// Subtle bloom-like glow
function AmbientGlow({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const glowRef = useRef<THREE.Mesh>(null);
  const colors = colorPalettes[variant];
  
  useFrame((state) => {
    if (!glowRef.current) return;
    const material = glowRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.08 + Math.sin(state.clock.elapsedTime * 0.3) * 0.03;
  });
  
  return (
    <mesh ref={glowRef} position={[0, 0, -3]}>
      <sphereGeometry args={[4, 32, 32]} />
      <meshBasicMaterial 
        color={colors.glow} 
        transparent 
        opacity={0.08}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

// Main scene composition
interface Whale3DSceneProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  intensity?: 'low' | 'medium' | 'high';
}

function Whale3DScene({ variant = 'cosmic', intensity = 'high' }: Whale3DSceneProps) {
  const colors = colorPalettes[variant];
  const particleCount = intensity === 'high' ? 200 : intensity === 'medium' ? 100 : 50;
  
  return (
    <>
      {/* Cinematic camera controller */}
      <CinematicCamera variant={variant} />
      
      {/* Lighting setup - emotional and dramatic */}
      <ambientLight intensity={0.15} />
      
      {/* Main key light - backlight for silhouette */}
      <directionalLight 
        position={[5, 8, -5]} 
        intensity={1.2} 
        color={colors.glow}
        castShadow
      />
      
      {/* Fill light */}
      <pointLight 
        position={[-5, 0, 5]} 
        intensity={0.4} 
        color={colors.secondary}
      />
      
      {/* Rim light for whale edge glow */}
      <spotLight
        position={[-3, 5, 3]}
        angle={0.5}
        penumbra={1}
        intensity={0.8}
        color={colors.accent}
      />
      
      {/* Environmental effects */}
      <DeepFog variant={variant} />
      <GodRays variant={variant} />
      <AmbientGlow variant={variant} />
      
      {/* Stars for cosmic depth */}
      <Stars 
        radius={40} 
        depth={50} 
        count={intensity === 'high' ? 3000 : 1500} 
        factor={3} 
        saturation={0.1} 
        fade 
        speed={0.5} 
      />
      
      {/* The whale */}
      <WhaleModel variant={variant} />
      
      {/* Atmospheric particles */}
      <AtmosphericParticles count={particleCount} variant={variant} />
      
      {/* Environment for reflections */}
      <Environment preset="night" />
    </>
  );
}

// Loading spinner fallback
function LoadingFallback() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.8;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
  });
  
  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[1, 0.1, 16, 50]} />
      <meshBasicMaterial color="#8b5cf6" transparent opacity={0.6} />
    </mesh>
  );
}

// Main exported component
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
      <div className={`w-full h-full bg-gradient-to-b from-[#0a0a1f] to-[#050510] ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 7], fov: 50 }}
        dpr={[1, 2]}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2
        }}
        shadows
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <Whale3DScene variant={variant} intensity={intensity} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Preload the whale model
useGLTF.preload('/models/whale.glb');
