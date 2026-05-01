import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Environment, MeshDistortMaterial, Trail, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Whale body geometry component with smooth swimming animation
function WhaleBody({ variant = 'cosmic' }: { variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const whaleRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const finLeftRef = useRef<THREE.Mesh>(null);
  const finRightRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const { pointer, viewport } = useThree();
  
  const colors = useMemo(() => {
    switch (variant) {
      case 'digital':
        return {
          primary: '#4285f4',
          secondary: '#34a853',
          accent: '#1a73e8',
          glow: '#4285f4',
          highlight: '#ffffff'
        };
      case 'ethereal':
        return {
          primary: '#8b5cf6',
          secondary: '#a855f7',
          accent: '#c084fc',
          glow: '#8b5cf6',
          highlight: '#ddd6fe'
        };
      default:
        return {
          primary: '#6366f1',
          secondary: '#8b5cf6',
          accent: '#a855f7',
          glow: '#8b5cf6',
          highlight: '#c7d2fe'
        };
    }
  }, [variant]);

  useFrame((state) => {
    if (!whaleRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // Smooth whale movement following mouse with gentle sway
    const targetX = (pointer.x * viewport.width) / 10;
    const targetY = (pointer.y * viewport.height) / 10;
    
    // Main body floating motion
    whaleRef.current.position.x = THREE.MathUtils.lerp(
      whaleRef.current.position.x, 
      targetX + Math.sin(time * 0.3) * 0.2, 
      0.015
    );
    whaleRef.current.position.y = THREE.MathUtils.lerp(
      whaleRef.current.position.y, 
      targetY + Math.sin(time * 0.5) * 0.4, 
      0.015
    );
    whaleRef.current.position.z = Math.sin(time * 0.2) * 0.3;
    
    // Gentle rotation following mouse for lifelike movement
    whaleRef.current.rotation.y = THREE.MathUtils.lerp(
      whaleRef.current.rotation.y, 
      pointer.x * 0.4 + Math.sin(time * 0.3) * 0.05, 
      0.02
    );
    whaleRef.current.rotation.x = THREE.MathUtils.lerp(
      whaleRef.current.rotation.x, 
      -pointer.y * 0.15 + Math.sin(time * 0.4) * 0.03, 
      0.02
    );
    
    // Natural swimming roll motion
    whaleRef.current.rotation.z = Math.sin(time * 0.6) * 0.08;
    
    // Tail undulation - the key to realistic swimming
    if (tailRef.current) {
      tailRef.current.rotation.y = Math.sin(time * 1.8) * 0.5;
      tailRef.current.rotation.z = Math.sin(time * 1.5 + 0.5) * 0.15;
      tailRef.current.position.x = Math.sin(time * 1.8) * 0.1;
    }
    
    // Pectoral fin animations - gentle wave motion
    if (finLeftRef.current) {
      finLeftRef.current.rotation.z = Math.sin(time * 1.0) * 0.25 + 0.4;
      finLeftRef.current.rotation.x = Math.sin(time * 0.8 + 0.3) * 0.1;
    }
    if (finRightRef.current) {
      finRightRef.current.rotation.z = -Math.sin(time * 1.0) * 0.25 - 0.4;
      finRightRef.current.rotation.x = -Math.sin(time * 0.8 + 0.3) * 0.1;
    }

    // Body flex for more organic movement
    if (bodyRef.current) {
      bodyRef.current.rotation.y = Math.sin(time * 1.2) * 0.03;
    }
  });

  return (
    <group ref={whaleRef} scale={1.3} position={[0, 0, 0]}>
      {/* Main body with trail */}
      <Trail
        width={2.5}
        length={8}
        color={colors.glow}
        attenuation={(t) => t * t}
      >
        <mesh ref={bodyRef} position={[0, 0, 0]}>
          <sphereGeometry args={[1, 64, 64]} />
          <MeshDistortMaterial
            color={colors.primary}
            envMapIntensity={1.2}
            clearcoat={1}
            clearcoatRoughness={0}
            metalness={0.85}
            roughness={0.1}
            distort={0.15}
            speed={1.5}
          />
        </mesh>
      </Trail>
      
      {/* Body extension - smoother shape */}
      <mesh position={[0.9, 0, 0]} scale={[1.5, 0.75, 0.65]}>
        <sphereGeometry args={[1, 64, 64]} />
        <MeshDistortMaterial
          color={colors.primary}
          envMapIntensity={1}
          clearcoat={1}
          clearcoatRoughness={0}
          metalness={0.85}
          roughness={0.12}
          distort={0.12}
          speed={1.2}
        />
      </mesh>
      
      {/* Head - slightly bulbous */}
      <mesh position={[-1.15, 0.12, 0]} scale={[0.85, 0.68, 0.6]}>
        <sphereGeometry args={[1, 64, 64]} />
        <MeshDistortMaterial
          color={colors.secondary}
          envMapIntensity={1.3}
          clearcoat={1}
          clearcoatRoughness={0}
          metalness={0.8}
          roughness={0.15}
          distort={0.08}
          speed={1.8}
        />
      </mesh>

      {/* Forehead bump */}
      <mesh position={[-1.5, 0.3, 0]} scale={[0.4, 0.35, 0.35]}>
        <sphereGeometry args={[1, 32, 32]} />
        <MeshDistortMaterial
          color={colors.secondary}
          envMapIntensity={1.2}
          clearcoat={1}
          metalness={0.85}
          roughness={0.1}
          distort={0.1}
          speed={2}
        />
      </mesh>
      
      {/* Tail section with animation group */}
      <group ref={tailRef} position={[2.3, 0, 0]}>
        {/* Tail body */}
        <mesh scale={[0.9, 0.38, 0.32]}>
          <sphereGeometry args={[1, 32, 32]} />
          <MeshDistortMaterial
            color={colors.accent}
            envMapIntensity={1}
            clearcoat={1}
            metalness={0.9}
            roughness={0.1}
            distort={0.2}
            speed={2.5}
          />
        </mesh>
        
        {/* Tail flukes - upper */}
        <mesh position={[0.9, 0.35, 0]} rotation={[0, 0, 0.6]} scale={[0.65, 0.12, 0.35]}>
          <sphereGeometry args={[1, 32, 32]} />
          <MeshDistortMaterial
            color={colors.glow}
            envMapIntensity={1.8}
            clearcoat={1}
            metalness={0.95}
            roughness={0.05}
            distort={0.25}
            speed={3}
          />
        </mesh>
        
        {/* Tail flukes - lower */}
        <mesh position={[0.9, -0.35, 0]} rotation={[0, 0, -0.6]} scale={[0.65, 0.12, 0.35]}>
          <sphereGeometry args={[1, 32, 32]} />
          <MeshDistortMaterial
            color={colors.glow}
            envMapIntensity={1.8}
            clearcoat={1}
            metalness={0.95}
            roughness={0.05}
            distort={0.25}
            speed={3}
          />
        </mesh>
      </group>
      
      {/* Dorsal fin */}
      <mesh position={[0.4, 0.95, 0]} rotation={[0, 0, -0.15]} scale={[0.35, 0.55, 0.08]}>
        <coneGeometry args={[0.5, 1, 32]} />
        <MeshDistortMaterial
          color={colors.accent}
          envMapIntensity={1.3}
          clearcoat={1}
          metalness={0.9}
          roughness={0.1}
          distort={0.12}
          speed={2}
        />
      </mesh>
      
      {/* Pectoral fins */}
      <mesh 
        ref={finLeftRef} 
        position={[-0.2, -0.35, 0.75]} 
        rotation={[0.6, 0, 0.4]} 
        scale={[0.55, 0.12, 0.28]}
      >
        <sphereGeometry args={[1, 32, 32]} />
        <MeshDistortMaterial
          color={colors.secondary}
          envMapIntensity={1}
          clearcoat={1}
          metalness={0.9}
          roughness={0.1}
          distort={0.18}
          speed={2}
        />
      </mesh>
      <mesh 
        ref={finRightRef} 
        position={[-0.2, -0.35, -0.75]} 
        rotation={[-0.6, 0, -0.4]} 
        scale={[0.55, 0.12, 0.28]}
      >
        <sphereGeometry args={[1, 32, 32]} />
        <MeshDistortMaterial
          color={colors.secondary}
          envMapIntensity={1}
          clearcoat={1}
          metalness={0.9}
          roughness={0.1}
          distort={0.18}
          speed={2}
        />
      </mesh>
      
      {/* Eyes */}
      <mesh position={[-1.55, 0.22, 0.42]} scale={0.1}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[-1.55, 0.22, -0.42]} scale={0.1}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
      </mesh>
      
      {/* Eye pupils */}
      <mesh position={[-1.65, 0.22, 0.42]} scale={0.05}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color="#0a0a1a" />
      </mesh>
      <mesh position={[-1.65, 0.22, -0.42]} scale={0.05}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color="#0a0a1a" />
      </mesh>
      
      {/* Ambient glow effect */}
      <mesh position={[0.3, 0, 0]}>
        <sphereGeometry args={[2.8, 32, 32]} />
        <meshBasicMaterial color={colors.glow} transparent opacity={0.04} side={THREE.BackSide} />
      </mesh>

      {/* Belly highlight streak */}
      <mesh position={[0, -0.6, 0]} rotation={[0, 0, 0]} scale={[2.5, 0.15, 0.5]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          color={colors.highlight} 
          emissive={colors.highlight} 
          emissiveIntensity={0.2}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
}

// Animated particles around the whale
function ParticleField({ count = 150, variant = 'cosmic' }: { count?: number; variant?: 'cosmic' | 'digital' | 'ethereal' }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { pointer } = useThree();
  
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 3.5 + Math.random() * 7;
      
      temp.push({
        position: new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi)
        ),
        speed: 0.3 + Math.random() * 1.2,
        offset: Math.random() * Math.PI * 2,
        scale: 0.015 + Math.random() * 0.035
      });
    }
    return temp;
  }, [count]);

  const colorArray = useMemo(() => {
    switch (variant) {
      case 'digital':
        return ['#4285f4', '#34a853', '#ea4335', '#fbbc04', '#ffffff'];
      case 'ethereal':
        return ['#8b5cf6', '#a855f7', '#c084fc', '#e879f9', '#ffffff'];
      default:
        return ['#6366f1', '#8b5cf6', '#a855f7', '#c084fc', '#ffffff'];
    }
  }, [variant]);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    
    particles.forEach((particle, i) => {
      const { position, speed, offset, scale } = particle;
      
      // Orbital motion with gentle mouse influence
      const angle = time * speed * 0.15 + offset;
      const mouseInfluence = new THREE.Vector3(pointer.x * 0.3, pointer.y * 0.3, 0);
      
      const x = position.x * Math.cos(angle) - position.z * Math.sin(angle) + mouseInfluence.x;
      const y = position.y + Math.sin(time * speed * 0.8 + offset) * 0.4 + mouseInfluence.y;
      const z = position.x * Math.sin(angle) + position.z * Math.cos(angle);
      
      const dynamicScale = scale * (1 + Math.sin(time * 1.5 + offset) * 0.4);
      
      matrix.makeScale(dynamicScale, dynamicScale, dynamicScale);
      matrix.setPosition(x, y, z);
      meshRef.current!.setMatrixAt(i, matrix);
      
      // Color variation
      color.set(colorArray[i % colorArray.length]);
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
      <meshBasicMaterial transparent opacity={0.85} />
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
      ring.rotation.x = time * 0.15 * (i + 1) * 0.25;
      ring.rotation.y = time * 0.1 * (i + 1) * 0.18;
      (ring as THREE.Mesh).scale.setScalar(1 + Math.sin(time * 0.5 + i) * 0.08);
    });
  });

  return (
    <group ref={ringsRef}>
      {[2.8, 3.8, 4.8].map((radius, i) => (
        <mesh key={i} rotation={[Math.PI / 2 + i * 0.25, 0, i * 0.4]}>
          <torusGeometry args={[radius, 0.015, 16, 100]} />
          <meshBasicMaterial color={color} transparent opacity={0.25 - i * 0.06} />
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
        return { inner: '#0d1a2d', outer: '#080f1a' };
      case 'ethereal':
        return { inner: '#1a0a2e', outer: '#0a0a1f' };
      default:
        return { inner: '#0f0a1f', outer: '#050510' };
    }
  }, [variant]);

  useFrame((state) => {
    if (!nebulaRef.current) return;
    nebulaRef.current.rotation.z = state.clock.elapsedTime * 0.015;
  });

  return (
    <mesh ref={nebulaRef} position={[0, 0, -18]}>
      <planeGeometry args={[70, 70]} />
      <shaderMaterial
        uniforms={{
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
            vec3 color = mix(uColor1, uColor2, dist * 1.4);
            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}

// Floating bubbles effect
function Bubbles({ count = 25 }: { count?: number }) {
  const bubblesRef = useRef<THREE.Group>(null);
  
  const bubbles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      position: [
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 7
      ] as [number, number, number],
      scale: 0.04 + Math.random() * 0.12,
      speed: 0.4 + Math.random() * 0.8
    }));
  }, [count]);

  useFrame((state) => {
    if (!bubblesRef.current) return;
    const time = state.clock.elapsedTime;
    
    bubblesRef.current.children.forEach((bubble, i) => {
      const data = bubbles[i];
      bubble.position.y = ((data.position[1] + time * data.speed * 0.25) % 10) - 5;
      bubble.position.x = data.position[0] + Math.sin(time * 0.8 + i) * 0.15;
    });
  });

  return (
    <group ref={bubblesRef}>
      {bubbles.map((bubble, i) => (
        <mesh key={i} position={bubble.position} scale={bubble.scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.08} />
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
  const particleCount = intensity === 'high' ? 150 : intensity === 'medium' ? 80 : 40;
  
  const lightColor = useMemo(() => {
    switch (variant) {
      case 'digital': return '#4285f4';
      case 'ethereal': return '#a855f7';
      default: return '#8b5cf6';
    }
  }, [variant]);
  
  return (
    <>
      <ambientLight intensity={0.25} />
      <pointLight position={[10, 10, 10]} intensity={1.2} color={lightColor} />
      <pointLight position={[-10, -10, -5]} intensity={0.6} color="#6366f1" />
      <spotLight
        position={[0, 12, 6]}
        angle={0.35}
        penumbra={1}
        intensity={1.2}
        color={lightColor}
        castShadow
      />
      
      <NebulaBackground variant={variant} />
      <Stars radius={55} depth={55} count={2500} factor={4} saturation={0} fade speed={0.8} />
      
      <Float
        speed={1.2}
        rotationIntensity={0.15}
        floatIntensity={0.4}
      >
        <WhaleBody variant={variant} />
      </Float>
      
      <ParticleField count={particleCount} variant={variant} />
      <EnergyRings variant={variant} />
      <Bubbles count={25} />
      
      <Environment preset="night" />
    </>
  );
}

// Loading fallback
function LoadingFallback() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.5;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });
  
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color="#8b5cf6" wireframe />
    </mesh>
  );
}

// Main exported component
interface Whale3DProps {
  variant?: 'cosmic' | 'digital' | 'ethereal';
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
}

export default function Whale3D({ variant = 'cosmic', className = '', intensity = 'high' }: Whale3DProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
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
        camera={{ position: [0, 0, 7], fov: 55 }}
        dpr={[1, 2]}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance'
        }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <Whale3DScene variant={variant} intensity={intensity} />
        </Suspense>
      </Canvas>
    </div>
  );
}
