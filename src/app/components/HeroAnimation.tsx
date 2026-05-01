'use client';

import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  Float, 
  Stars, 
  Sparkles,
  MeshDistortMaterial,
  RoundedBox,
} from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'motion/react';

// Floating social media style elements for Meta Ads
function MetaScene() {
  const groupRef = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    
    // Smooth rotation following mouse
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      pointer.x * 0.3,
      0.02
    );
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      -pointer.y * 0.2,
      0.02
    );
    
    // Gentle floating
    groupRef.current.position.y = Math.sin(time * 0.5) * 0.2;
  });

  return (
    <group ref={groupRef}>
      {/* Central glowing sphere - represents connection */}
      <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
        <mesh position={[0, 0, 0]}>
          <icosahedronGeometry args={[1.2, 4]} />
          <MeshDistortMaterial
            color="#E1306C"
            envMapIntensity={1}
            clearcoat={1}
            clearcoatRoughness={0}
            metalness={0.9}
            roughness={0.1}
            distort={0.3}
            speed={3}
          />
        </mesh>
      </Float>
      
      {/* Orbiting elements - social interactions */}
      <OrbitingElements color="#833AB4" count={6} radius={2.5} speed={0.4} />
      <OrbitingElements color="#405DE6" count={4} radius={3.5} speed={-0.3} />
      
      {/* Connecting lines */}
      <ConnectionLines color="#E1306C" />
      
      {/* Inner glow */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1.8, 32, 32]} />
        <meshBasicMaterial color="#E1306C" transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>
      
      {/* Particle ring */}
      <Sparkles
        count={100}
        size={2}
        scale={[8, 8, 8]}
        speed={0.3}
        color="#E1306C"
        opacity={0.5}
      />
    </group>
  );
}

// Google Ads scene - data/analytics visualization
function GoogleScene() {
  const groupRef = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  
  const googleColors = {
    blue: '#4285f4',
    red: '#ea4335',
    yellow: '#fbbc04',
    green: '#34a853',
  };

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      pointer.x * 0.3,
      0.02
    );
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      -pointer.y * 0.2,
      0.02
    );
    
    groupRef.current.position.y = Math.sin(time * 0.5) * 0.15;
  });

  return (
    <group ref={groupRef}>
      {/* Central data cube */}
      <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.3}>
        <RoundedBox args={[1.5, 1.5, 1.5]} radius={0.15} smoothness={4}>
          <MeshDistortMaterial
            color={googleColors.blue}
            envMapIntensity={1.2}
            clearcoat={1}
            clearcoatRoughness={0}
            metalness={0.95}
            roughness={0.05}
            distort={0.15}
            speed={2}
          />
        </RoundedBox>
      </Float>
      
      {/* Data bars - analytics */}
      <DataBars colors={googleColors} />
      
      {/* Floating data points */}
      <DataPoints colors={googleColors} />
      
      {/* Search magnifier ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <torusGeometry args={[2.2, 0.03, 16, 100]} />
        <meshBasicMaterial color={googleColors.blue} transparent opacity={0.4} />
      </mesh>
      
      <Sparkles
        count={80}
        size={1.5}
        scale={[7, 7, 7]}
        speed={0.2}
        color={googleColors.blue}
        opacity={0.4}
      />
    </group>
  );
}

// Consult scene - growth/mentorship
function ConsultScene() {
  const groupRef = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      pointer.x * 0.3,
      0.02
    );
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      -pointer.y * 0.2,
      0.02
    );
    
    groupRef.current.position.y = Math.sin(time * 0.5) * 0.15;
  });

  return (
    <group ref={groupRef}>
      {/* Central achievement star/crystal */}
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.4}>
        <mesh position={[0, 0, 0]}>
          <octahedronGeometry args={[1.3, 0]} />
          <MeshDistortMaterial
            color="#8b5cf6"
            envMapIntensity={1.5}
            clearcoat={1}
            clearcoatRoughness={0}
            metalness={0.9}
            roughness={0.1}
            distort={0.2}
            speed={2}
          />
        </mesh>
      </Float>
      
      {/* Rising steps - career growth */}
      <GrowthSteps />
      
      {/* Orbiting achievement badges */}
      <OrbitingElements color="#6366f1" count={5} radius={2.8} speed={0.35} shape="box" />
      
      {/* Connection network */}
      <NetworkLines color="#8b5cf6" />
      
      <Sparkles
        count={100}
        size={2}
        scale={[8, 8, 8]}
        speed={0.25}
        color="#8b5cf6"
        opacity={0.5}
      />
    </group>
  );
}

// Orbiting elements component
function OrbitingElements({ 
  color, 
  count, 
  radius, 
  speed,
  shape = 'sphere'
}: { 
  color: string; 
  count: number; 
  radius: number; 
  speed: number;
  shape?: 'sphere' | 'box';
}) {
  const groupRef = useRef<THREE.Group>(null);
  
  const elements = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2,
      yOffset: (Math.random() - 0.5) * 0.5,
      scale: 0.1 + Math.random() * 0.15,
    }));
  }, [count]);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * speed;
  });

  return (
    <group ref={groupRef}>
      {elements.map((el, i) => (
        <Float key={i} speed={2} floatIntensity={0.2}>
          <mesh
            position={[
              Math.cos(el.angle) * radius,
              el.yOffset,
              Math.sin(el.angle) * radius,
            ]}
            scale={el.scale}
          >
            {shape === 'sphere' ? (
              <sphereGeometry args={[1, 16, 16]} />
            ) : (
              <boxGeometry args={[1, 1, 1]} />
            )}
            <meshStandardMaterial
              color={color}
              metalness={0.8}
              roughness={0.2}
              emissive={color}
              emissiveIntensity={0.3}
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

// Connection lines for Meta scene
function ConnectionLines({ color }: { color: string }) {
  const linesRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (!linesRef.current) return;
    linesRef.current.rotation.z = state.clock.elapsedTime * 0.1;
  });

  const lines = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      return {
        start: [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0] as [number, number, number],
        end: [Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, 0] as [number, number, number],
      };
    });
  }, []);

  return (
    <group ref={linesRef}>
      {lines.map((line, i) => (
        <Line key={i} start={line.start} end={line.end} color={color} />
      ))}
    </group>
  );
}

// Simple line component
function Line({ start, end, color }: { start: [number, number, number]; end: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Line>(null);
  
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...start, ...end], 3));
    return geo;
  }, [start, end]);

  return (
    <line ref={ref as any} geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.3} />
    </line>
  );
}

// Data bars for Google scene
function DataBars({ colors }: { colors: Record<string, string> }) {
  const barsRef = useRef<THREE.Group>(null);
  const colorValues = Object.values(colors);
  
  useFrame((state) => {
    if (!barsRef.current) return;
    const time = state.clock.elapsedTime;
    
    barsRef.current.children.forEach((bar, i) => {
      const baseHeight = 0.3 + (i * 0.2);
      const animatedHeight = baseHeight + Math.sin(time * 2 + i * 0.5) * 0.2;
      bar.scale.y = animatedHeight;
      bar.position.y = animatedHeight / 2;
    });
  });

  return (
    <group ref={barsRef} position={[-2, -1, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[i * 0.6, 0, 0]}>
          <boxGeometry args={[0.35, 1, 0.35]} />
          <meshStandardMaterial
            color={colorValues[i]}
            metalness={0.7}
            roughness={0.3}
            emissive={colorValues[i]}
            emissiveIntensity={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

// Data points for Google scene
function DataPoints({ colors }: { colors: Record<string, string> }) {
  const pointsRef = useRef<THREE.Group>(null);
  const colorValues = Object.values(colors);
  
  const points = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 3,
      ] as [number, number, number],
      scale: 0.05 + Math.random() * 0.08,
      color: colorValues[i % colorValues.length],
      speed: 0.5 + Math.random() * 1,
    }));
  }, [colorValues]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const time = state.clock.elapsedTime;
    
    pointsRef.current.children.forEach((point, i) => {
      const data = points[i];
      point.position.y = data.position[1] + Math.sin(time * data.speed + i) * 0.3;
    });
  });

  return (
    <group ref={pointsRef}>
      {points.map((point, i) => (
        <mesh key={i} position={point.position} scale={point.scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial
            color={point.color}
            emissive={point.color}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

// Growth steps for Consult scene
function GrowthSteps() {
  const stepsRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (!stepsRef.current) return;
    stepsRef.current.rotation.y = state.clock.elapsedTime * 0.15;
  });

  const steps = [
    { position: [-1.5, -0.8, 0], height: 0.4, color: '#6366f1' },
    { position: [-0.5, -0.5, 0], height: 0.7, color: '#8b5cf6' },
    { position: [0.5, -0.1, 0], height: 1.1, color: '#a78bfa' },
    { position: [1.5, 0.4, 0], height: 1.6, color: '#c4b5fd' },
  ];

  return (
    <group ref={stepsRef} position={[0, -1, 2]}>
      {steps.map((step, i) => (
        <Float key={i} speed={1.5} floatIntensity={0.1}>
          <mesh position={step.position as [number, number, number]}>
            <boxGeometry args={[0.6, step.height, 0.4]} />
            <meshStandardMaterial
              color={step.color}
              metalness={0.6}
              roughness={0.4}
              emissive={step.color}
              emissiveIntensity={0.15}
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

// Network lines for Consult scene
function NetworkLines({ color }: { color: string }) {
  const linesRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (!linesRef.current) return;
    linesRef.current.rotation.y = state.clock.elapsedTime * 0.08;
    linesRef.current.rotation.z = state.clock.elapsedTime * 0.05;
  });

  const nodes = useMemo(() => {
    const n = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const radius = 2 + Math.random();
      n.push({
        x: Math.cos(angle) * radius,
        y: (Math.random() - 0.5) * 2,
        z: Math.sin(angle) * radius,
      });
    }
    return n;
  }, []);

  return (
    <group ref={linesRef}>
      {nodes.map((node, i) => (
        <group key={i}>
          <mesh position={[node.x, node.y, node.z]} scale={0.08}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
          </mesh>
          <Line 
            start={[0, 0, 0]} 
            end={[node.x, node.y, node.z]} 
            color={color} 
          />
        </group>
      ))}
    </group>
  );
}

// Camera controller
function CameraController() {
  const { camera, pointer } = useThree();
  
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    const targetX = Math.sin(time * 0.1) * 0.3 + pointer.x * 0.5;
    const targetY = 0.2 + Math.sin(time * 0.15) * 0.15 + pointer.y * 0.3;
    const targetZ = 6 + Math.sin(time * 0.08) * 0.2;
    
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.02);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.02);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.02);
    
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

// Scene wrapper with proper lighting
function SceneWrapper({ variant, children }: { variant: 'meta' | 'google' | 'consult'; children: React.ReactNode }) {
  const { scene } = useThree();
  
  const bgColor = useMemo(() => {
    switch (variant) {
      case 'google': return '#050a14';
      case 'consult': return '#0a0510';
      default: return '#0a0812';
    }
  }, [variant]);
  
  const lightColor = useMemo(() => {
    switch (variant) {
      case 'google': return '#4285f4';
      case 'consult': return '#8b5cf6';
      default: return '#E1306C';
    }
  }, [variant]);

  useEffect(() => {
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, 0.04);
  }, [scene, bgColor]);

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 5, 3]} intensity={0.5} color={lightColor} />
      <directionalLight position={[-5, 2, -5]} intensity={0.6} color={lightColor} />
      <pointLight position={[0, -3, 2]} intensity={0.3} color={lightColor} />
      <spotLight position={[0, 8, -2]} angle={0.5} penumbra={1} intensity={0.4} color={lightColor} />
      
      <CameraController />
      <Stars radius={50} depth={50} count={2000} factor={4} saturation={0.2} fade speed={0.3} />
      
      {children}
      
    </>
  );
}

// Loading fallback
function LoadingFallback({ variant }: { variant: 'meta' | 'google' | 'consult' }) {
  const color = variant === 'meta' ? '#E1306C' : variant === 'google' ? '#4285f4' : '#8b5cf6';
  
  return (
    <mesh>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color={color} wireframe />
    </mesh>
  );
}

// Main component
interface HeroAnimationProps {
  variant: 'meta' | 'google' | 'consult';
  className?: string;
}

export default function HeroAnimation({ variant, className = '' }: HeroAnimationProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const bgGradient = useMemo(() => {
    switch (variant) {
      case 'google':
        return 'radial-gradient(ellipse at 50% 50%, #0a1525 0%, #050a14 50%, transparent 100%)';
      case 'consult':
        return 'radial-gradient(ellipse at 50% 50%, #150a25 0%, #0a0510 50%, transparent 100%)';
      default:
        return 'radial-gradient(ellipse at 50% 50%, #1a0815 0%, #0a0812 50%, transparent 100%)';
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
        camera={{ position: [0, 0.2, 6], fov: 50 }}
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
        <Suspense fallback={<LoadingFallback variant={variant} />}>
          <SceneWrapper variant={variant}>
            {variant === 'meta' && <MetaScene />}
            {variant === 'google' && <GoogleScene />}
            {variant === 'consult' && <ConsultScene />}
          </SceneWrapper>
        </Suspense>
      </Canvas>
    </motion.div>
  );
}
