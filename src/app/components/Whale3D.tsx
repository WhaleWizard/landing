'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Environment, MeshDistortMaterial, Sphere, Trail, Stars, useTexture, MeshWobbleMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Whale body geometry component
function WhaleBody({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const whaleRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Mesh>(null);
  const finLeftRef = useRef<THREE.Mesh>(null);
  const finRightRef = useRef<THREE.Mesh>(null);
  const { mouse, viewport } = useThree();
  
  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return {
          primary: '#4285f4',
          secondary: '#34a853',
          accent: '#ea4335',
          glow: '#fbbc04'
        };
      case 'ethereal':
        return {
          primary: '#8b5cf6',
          secondary: '#06b6d4',
          accent: '#f59e0b',
          glow: '#ec4899'
        };
      default:
        return {
          primary: '#8b5cf6',
          secondary: '#6366f1',
          accent: '#3b82f6',
          glow: '#a855f7'
        };
    }
  }, [variant]);

  useFrame((state) => {
    if (!whaleRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // Smooth whale movement following mouse
    const targetX = (mouse.x * viewport.width) / 8;
    const targetY = (mouse.y * viewport.height) / 8;
    
    whaleRef.current.position.x = THREE.MathUtils.lerp(whaleRef.current.position.x, targetX, 0.02);
    whaleRef.current.position.y = THREE.MathUtils.lerp(whaleRef.current.position.y, targetY + Math.sin(time * 0.5) * 0.3, 0.02);
    
    // Gentle rotation following mouse
    whaleRef.current.rotation.y = THREE.MathUtils.lerp(whaleRef.current.rotation.y, mouse.x * 0.3, 0.02);
    whaleRef.current.rotation.x = THREE.MathUtils.lerp(whaleRef.current.rotation.x, -mouse.y * 0.1, 0.02);
    
    // Swimming motion
    whaleRef.current.rotation.z = Math.sin(time * 0.8) * 0.05;
    
    // Tail animation
    if (tailRef.current) {
      tailRef.current.rotation.y = Math.sin(time * 2) * 0.4;
      tailRef.current.rotation.z = Math.sin(time * 1.5) * 0.1;
    }
    
    // Fin animations
    if (finLeftRef.current) {
      finLeftRef.current.rotation.z = Math.sin(time * 1.2) * 0.2 + 0.3;
    }
    if (finRightRef.current) {
      finRightRef.current.rotation.z = -Math.sin(time * 1.2) * 0.2 - 0.3;
    }
  });

  return (
    <group ref={whaleRef} scale={1.2}>
      {/* Main body */}
      <Trail
        width={2}
        length={6}
        color={colors.glow}
        attenuation={(t) => t * t}
      >
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[1, 64, 64]} />
          <MeshDistortMaterial
            color={colors.primary}
            envMapIntensity={1}
            clearcoat={1}
            clearcoatRoughness={0}
            metalness={0.9}
            roughness={0.1}
            distort={0.2}
            speed={2}
          />
        </mesh>
      </Trail>
      
      {/* Body extension */}
      <mesh position={[0.8, 0, 0]} scale={[1.4, 0.8, 0.7]}>
        <sphereGeometry args={[1, 64, 64]} />
        <MeshDistortMaterial
          color={colors.primary}
          envMapIntensity={1}
          clearcoat={1}
          clearcoatRoughness={0}
          metalness={0.9}
          roughness={0.1}
          distort={0.15}
          speed={1.5}
        />
      </mesh>
      
      {/* Head */}
      <mesh position={[-1.2, 0.1, 0]} scale={[0.9, 0.7, 0.65]}>
        <sphereGeometry args={[1, 64, 64]} />
        <MeshDistortMaterial
          color={colors.secondary}
          envMapIntensity={1.2}
          clearcoat={1}
          clearcoatRoughness={0}
          metalness={0.85}
          roughness={0.15}
          distort={0.1}
          speed={2}
        />
      </mesh>
      
      {/* Tail section */}
      <group ref={tailRef} position={[2.2, 0, 0]}>
        <mesh scale={[0.8, 0.4, 0.35]}>
          <sphereGeometry args={[1, 32, 32]} />
          <MeshDistortMaterial
            color={colors.accent}
            envMapIntensity={1}
            clearcoat={1}
            metalness={0.9}
            roughness={0.1}
            distort={0.2}
            speed={3}
          />
        </mesh>
        
        {/* Tail flukes */}
        <mesh position={[0.8, 0.3, 0]} rotation={[0, 0, 0.5]} scale={[0.6, 0.15, 0.4]}>
          <sphereGeometry args={[1, 32, 32]} />
          <MeshDistortMaterial
            color={colors.glow}
            envMapIntensity={1.5}
            clearcoat={1}
            metalness={0.95}
            roughness={0.05}
            distort={0.3}
            speed={4}
          />
        </mesh>
        <mesh position={[0.8, -0.3, 0]} rotation={[0, 0, -0.5]} scale={[0.6, 0.15, 0.4]}>
          <sphereGeometry args={[1, 32, 32]} />
          <MeshDistortMaterial
            color={colors.glow}
            envMapIntensity={1.5}
            clearcoat={1}
            metalness={0.95}
            roughness={0.05}
            distort={0.3}
            speed={4}
          />
        </mesh>
      </group>
      
      {/* Dorsal fin */}
      <mesh position={[0.3, 0.9, 0]} rotation={[0, 0, -0.2]} scale={[0.4, 0.5, 0.1]}>
        <coneGeometry args={[0.5, 1, 32]} />
        <MeshDistortMaterial
          color={colors.accent}
          envMapIntensity={1.2}
          clearcoat={1}
          metalness={0.9}
          roughness={0.1}
          distort={0.15}
          speed={2}
        />
      </mesh>
      
      {/* Pectoral fins */}
      <mesh ref={finLeftRef} position={[-0.3, -0.3, 0.7]} rotation={[0.5, 0, 0.3]} scale={[0.5, 0.15, 0.3]}>
        <sphereGeometry args={[1, 32, 32]} />
        <MeshDistortMaterial
          color={colors.secondary}
          envMapIntensity={1}
          clearcoat={1}
          metalness={0.9}
          roughness={0.1}
          distort={0.2}
          speed={2}
        />
      </mesh>
      <mesh ref={finRightRef} position={[-0.3, -0.3, -0.7]} rotation={[-0.5, 0, -0.3]} scale={[0.5, 0.15, 0.3]}>
        <sphereGeometry args={[1, 32, 32]} />
        <MeshDistortMaterial
          color={colors.secondary}
          envMapIntensity={1}
          clearcoat={1}
          metalness={0.9}
          roughness={0.1}
          distort={0.2}
          speed={2}
        />
      </mesh>
      
      {/* Eyes */}
      <mesh position={[-1.6, 0.2, 0.4]} scale={0.12}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-1.6, 0.2, -0.4]} scale={0.12}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
      
      {/* Eye pupils */}
      <mesh position={[-1.72, 0.2, 0.4]} scale={0.06}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color="#0a0a0f" />
      </mesh>
      <mesh position={[-1.72, 0.2, -0.4]} scale={0.06}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color="#0a0a0f" />
      </mesh>
      
      {/* Glow effect around whale */}
      <Sphere args={[2.5, 32, 32]} position={[0.3, 0, 0]}>
        <meshBasicMaterial color={colors.glow} transparent opacity={0.05} side={THREE.BackSide} />
      </Sphere>
    </group>
  );
}

// Animated particles around the whale
function ParticleField({ count = 200, variant = 'cosmic' }: { count?: number; variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { mouse } = useThree();
  
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 4 + Math.random() * 8;
      
      temp.push({
        position: new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi)
        ),
        speed: 0.5 + Math.random() * 1.5,
        offset: Math.random() * Math.PI * 2,
        scale: 0.02 + Math.random() * 0.04
      });
    }
    return temp;
  }, [count]);

  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return ['#4285f4', '#34a853', '#ea4335', '#fbbc04'];
      case 'ethereal':
        return ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'];
      default:
        return ['#8b5cf6', '#6366f1', '#3b82f6', '#a855f7'];
    }
  }, [variant]);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    
    particles.forEach((particle, i) => {
      const { position, speed, offset, scale } = particle;
      
      // Orbital motion with mouse influence
      const angle = time * speed * 0.2 + offset;
      const mouseInfluence = new THREE.Vector3(mouse.x * 0.5, mouse.y * 0.5, 0);
      
      const x = position.x * Math.cos(angle) - position.z * Math.sin(angle) + mouseInfluence.x;
      const y = position.y + Math.sin(time * speed + offset) * 0.5 + mouseInfluence.y;
      const z = position.x * Math.sin(angle) + position.z * Math.cos(angle);
      
      const dynamicScale = scale * (1 + Math.sin(time * 2 + offset) * 0.3);
      
      matrix.setPosition(x, y, z);
      matrix.scale(new THREE.Vector3(dynamicScale, dynamicScale, dynamicScale));
      meshRef.current!.setMatrixAt(i, matrix);
      
      // Color variation
      color.set(colors[i % colors.length]);
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
      <meshBasicMaterial transparent opacity={0.8} />
    </instancedMesh>
  );
}

// Floating energy rings
function EnergyRings({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const ringsRef = useRef<THREE.Group>(null);
  
  const color = useMemo(() => {
    switch (variant) {
      case 'digital': return '#4285f4';
      case 'ethereal': return '#8b5cf6';
      default: return '#6366f1';
    }
  }, [variant]);

  useFrame((state) => {
    if (!ringsRef.current) return;
    const time = state.clock.elapsedTime;
    
    ringsRef.current.children.forEach((ring, i) => {
      ring.rotation.x = time * 0.2 * (i + 1) * 0.3;
      ring.rotation.y = time * 0.15 * (i + 1) * 0.2;
      (ring as THREE.Mesh).scale.setScalar(1 + Math.sin(time + i) * 0.1);
    });
  });

  return (
    <group ref={ringsRef}>
      {[3, 4, 5].map((radius, i) => (
        <mesh key={i} rotation={[Math.PI / 2 + i * 0.3, 0, i * 0.5]}>
          <torusGeometry args={[radius, 0.02, 16, 100]} />
          <meshBasicMaterial color={color} transparent opacity={0.3 - i * 0.08} />
        </mesh>
      ))}
    </group>
  );
}

// Nebula background effect
function NebulaBackground({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const nebulaRef = useRef<THREE.Mesh>(null);
  
  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return { inner: '#1a1a2e', outer: '#0f0f1a' };
      case 'ethereal':
        return { inner: '#1a0a2e', outer: '#0a0a1f' };
      default:
        return { inner: '#0f0a1f', outer: '#050510' };
    }
  }, [variant]);

  useFrame((state) => {
    if (!nebulaRef.current) return;
    nebulaRef.current.rotation.z = state.clock.elapsedTime * 0.02;
  });

  return (
    <mesh ref={nebulaRef} position={[0, 0, -15]}>
      <planeGeometry args={[60, 60]} />
      <shaderMaterial
        uniforms={{
          uTime: { value: 0 },
          uColor1: { value: new THREE.Color(colors.inner) },
          uColor2: { value: new THREE.Color(colors.outer) }
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor1;
          uniform vec3 uColor2;
          varying vec2 vUv;
          void main() {
            float dist = distance(vUv, vec2(0.5));
            vec3 color = mix(uColor1, uColor2, dist * 1.5);
            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}

// Floating bubbles effect
function Bubbles({ count = 30 }: { count?: number }) {
  const bubblesRef = useRef<THREE.Group>(null);
  
  const bubbles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      position: [
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 8
      ] as [number, number, number],
      scale: 0.05 + Math.random() * 0.15,
      speed: 0.5 + Math.random() * 1
    }));
  }, [count]);

  useFrame((state) => {
    if (!bubblesRef.current) return;
    const time = state.clock.elapsedTime;
    
    bubblesRef.current.children.forEach((bubble, i) => {
      const data = bubbles[i];
      bubble.position.y = ((data.position[1] + time * data.speed * 0.3) % 10) - 5;
      bubble.position.x = data.position[0] + Math.sin(time + i) * 0.2;
    });
  });

  return (
    <group ref={bubblesRef}>
      {bubbles.map((bubble, i) => (
        <mesh key={i} position={bubble.position} scale={bubble.scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
        </mesh>
      ))}
    </group>
  );
}

// Main 3D Scene component
interface Whale3DSceneProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  intensity?: 'low' | 'medium' | 'high';
}

function Whale3DScene({ variant = 'cosmic', intensity = 'high' }: Whale3DSceneProps) {
  const particleCount = intensity === 'high' ? 200 : intensity === 'medium' ? 100 : 50;
  
  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#8b5cf6" />
      <pointLight position={[-10, -10, -5]} intensity={0.5} color="#6366f1" />
      <spotLight
        position={[0, 10, 5]}
        angle={0.3}
        penumbra={1}
        intensity={1}
        color="#a855f7"
        castShadow
      />
      
      <NebulaBackground variant={variant} />
      <Stars radius={50} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
      
      <Float
        speed={1.5}
        rotationIntensity={0.2}
        floatIntensity={0.5}
      >
        <WhaleBody variant={variant} />
      </Float>
      
      <ParticleField count={particleCount} variant={variant} />
      <EnergyRings variant={variant} />
      <Bubbles count={30} />
      
      <Environment preset="night" />
    </>
  );
}

// Main exported component
interface Whale3DProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
}

export default function Whale3D({ variant = 'cosmic', className = '', intensity = 'high' }: Whale3DProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className={`w-full h-full bg-gradient-to-b from-[#0a0a1f] to-[#050510] ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        dpr={[1, 2]}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance'
        }}
        style={{ background: 'transparent' }}
      >
        <Whale3DScene variant={variant} intensity={intensity} />
      </Canvas>
    </div>
  );
}
