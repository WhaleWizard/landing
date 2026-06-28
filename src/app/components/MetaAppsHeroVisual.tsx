import { memo, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MathUtils, type Group } from 'three';
import { motion } from 'motion/react';

type MetaAppsHeroVisualProps = {
  inView: boolean;
};

const signalNodes = [
  { position: [-2.7, 1.7, -0.15] as [number, number, number], color: '#4F7DFF', size: 0.18, speed: 0.8 },
  { position: [2.65, 1.15, 0.1] as [number, number, number], color: '#B04DFF', size: 0.14, speed: 1.05 },
  { position: [-2.25, -1.35, 0.2] as [number, number, number], color: '#FF7AB6', size: 0.16, speed: 0.95 },
  { position: [2.15, -1.7, -0.1] as [number, number, number], color: '#38BDF8', size: 0.13, speed: 1.2 },
];

function FloatingGroup({
  children,
  position = [0, 0, 0],
  speed = 1,
  active,
}: {
  children: ReactNode;
  position?: [number, number, number];
  speed?: number;
  active: boolean;
}) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current || !active) return;
    const time = clock.elapsedTime * speed;
    groupRef.current.position.y = position[1] + Math.sin(time) * 0.055;
    groupRef.current.rotation.x = Math.sin(time * 0.7) * 0.08;
    groupRef.current.rotation.y = Math.cos(time * 0.5) * 0.1;
  });

  return (
    <group ref={groupRef} position={position}>
      {children}
    </group>
  );
}

function GlowParticles({ active }: { active: boolean }) {
  const groupRef = useRef<Group>(null);
  const particles = useMemo(
    () =>
      Array.from({ length: 46 }, (_, index) => {
        const angle = index * 2.399;
        const radius = 1.2 + (index % 9) * 0.22;
        return {
          position: [
            Math.cos(angle) * radius,
            ((index % 13) - 6) * 0.18,
            Math.sin(angle) * 0.62 - 0.3,
          ] as [number, number, number],
          color: ['#4F7DFF', '#B04DFF', '#FF7AB6', '#38BDF8'][index % 4],
          size: 0.012 + (index % 4) * 0.006,
        };
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current || !active) return;
    groupRef.current.rotation.y = clock.elapsedTime * 0.035;
    groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.18) * 0.05;
  });

  return (
    <group ref={groupRef}>
      {particles.map((particle, index) => (
        <mesh key={index} position={particle.position}>
          <sphereGeometry args={[particle.size, 10, 10]} />
          <meshBasicMaterial color={particle.color} transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function PhoneCore({ active }: { active: boolean }) {
  const groupRef = useRef<Group>(null);
  const appTiles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        return {
          x: (col - 1) * 0.42,
          y: 0.78 - row * 0.43,
          color: ['#4F7DFF', '#B04DFF', '#FF7AB6', '#38BDF8'][index % 4],
          delay: index * 0.08,
        };
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current || !active) return;
    const time = clock.elapsedTime;
    groupRef.current.rotation.y = MathUtils.lerp(groupRef.current.rotation.y, Math.sin(time * 0.45) * 0.16 - 0.28, 0.05);
    groupRef.current.rotation.x = MathUtils.lerp(groupRef.current.rotation.x, Math.sin(time * 0.32) * 0.05, 0.05);
    groupRef.current.position.y = Math.sin(time * 0.7) * 0.07;
  });

  return (
    <group ref={groupRef} rotation={[0.04, -0.26, -0.04]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.68, 3.26, 0.18]} />
        <meshPhysicalMaterial
          color="#10131f"
          roughness={0.24}
          metalness={0.2}
          clearcoat={0.9}
          clearcoatRoughness={0.18}
        />
      </mesh>

      <mesh position={[0, 0, 0.105]}>
        <boxGeometry args={[1.44, 2.86, 0.035]} />
        <meshBasicMaterial color="#070914" transparent opacity={0.96} />
      </mesh>

      <mesh position={[-0.18, 0.28, 0.128]}>
        <planeGeometry args={[1.06, 1.54]} />
        <meshBasicMaterial color="#4F7DFF" transparent opacity={0.16} />
      </mesh>
      <mesh position={[0.2, -0.38, 0.13]}>
        <planeGeometry args={[1.02, 1.42]} />
        <meshBasicMaterial color="#B04DFF" transparent opacity={0.12} />
      </mesh>

      {appTiles.map((tile, index) => (
        <FloatingGroup
          key={`${tile.x}-${tile.y}`}
          active={active}
          speed={1.25 + tile.delay}
          position={[tile.x, tile.y, 0.16 + (index % 2) * 0.01]}
        >
          <mesh>
            <boxGeometry args={[0.28, 0.28, 0.035]} />
            <meshStandardMaterial
              color={tile.color}
              emissive={tile.color}
              emissiveIntensity={0.85}
              roughness={0.28}
              metalness={0.15}
            />
          </mesh>
        </FloatingGroup>
      ))}

      <mesh position={[0, 1.28, 0.17]}>
        <boxGeometry args={[0.58, 0.18, 0.02]} />
        <meshBasicMaterial color="#f5f5f7" transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, -1.16, 0.17]}>
        <boxGeometry args={[0.96, 0.16, 0.02]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.42} />
      </mesh>
    </group>
  );
}

function SignalOrbit({ active }: { active: boolean }) {
  const orbitRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!orbitRef.current || !active) return;
    orbitRef.current.rotation.z = clock.elapsedTime * 0.12;
    orbitRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.22) * 0.12;
  });

  return (
    <group ref={orbitRef}>
      <mesh rotation={[Math.PI / 2.55, 0, 0]}>
        <torusGeometry args={[2.03, 0.008, 12, 180]} />
        <meshBasicMaterial color="#4F7DFF" transparent opacity={0.48} />
      </mesh>
      <mesh rotation={[Math.PI / 2.1, 0.1, 0.85]}>
        <torusGeometry args={[2.38, 0.006, 12, 180]} />
        <meshBasicMaterial color="#B04DFF" transparent opacity={0.34} />
      </mesh>
      <mesh rotation={[Math.PI / 2.35, -0.34, -0.8]}>
        <torusGeometry args={[1.64, 0.005, 12, 180]} />
        <meshBasicMaterial color="#FF7AB6" transparent opacity={0.32} />
      </mesh>

      {signalNodes.map((node) => (
        <FloatingGroup key={node.color} active={active} speed={node.speed} position={node.position}>
          <mesh>
            <sphereGeometry args={[node.size, 28, 28]} />
            <meshStandardMaterial color={node.color} emissive={node.color} emissiveIntensity={1.4} roughness={0.22} />
          </mesh>
        </FloatingGroup>
      ))}
    </group>
  );
}

function Scene({ active }: { active: boolean }) {
  const sceneRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!sceneRef.current || !active) return;
    sceneRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.16) * 0.05;
  });

  return (
    <group ref={sceneRef}>
      <ambientLight intensity={0.8} />
      <pointLight position={[-3, 2.4, 4]} intensity={4.2} color="#4F7DFF" />
      <pointLight position={[3, -1.8, 3]} intensity={2.8} color="#FF7AB6" />
      <pointLight position={[0, 3, 2]} intensity={1.8} color="#B04DFF" />

      <SignalOrbit active={active} />
      <PhoneCore active={active} />
      <GlowParticles active={active} />
    </group>
  );
}

const MetaAppsHeroVisual = memo(({ inView }: MetaAppsHeroVisualProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 42, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.85, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="relative order-1 lg:order-2 h-[430px] sm:h-[500px] md:h-[620px] lg:h-[660px] overflow-visible"
    >
      <div className="absolute inset-0 -m-12 rounded-[36px] bg-[radial-gradient(circle_at_44%_38%,rgba(79,125,255,0.34),transparent_34%),radial-gradient(circle_at_68%_58%,rgba(255,122,182,0.24),transparent_32%),radial-gradient(circle_at_50%_50%,rgba(176,77,255,0.2),transparent_58%)] blur-2xl" />
      <div className="absolute inset-[8%] rounded-[32px] border border-white/10 bg-white/[0.025] shadow-[0_30px_120px_rgba(79,125,255,0.18)] backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.08)_44%,transparent_62%)] opacity-60" />

      <Canvas
        className="relative z-10"
        camera={{ position: [0, 0.15, 5.7], fov: 42 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        shadows
      >
        <Scene active={inView} />
      </Canvas>

      <motion.div
        className="absolute left-2 top-[15%] z-20 w-36 rounded-lg border border-[#4F7DFF]/30 bg-background/72 p-3 shadow-2xl shadow-[#4F7DFF]/10 backdrop-blur-xl sm:left-6 sm:w-44"
        animate={inView ? { y: [0, -10, 0] } : {}}
        transition={{ duration: 5.5, repeat: inView ? Infinity : 0, ease: 'easeInOut' }}
      >
        <div className="text-[10px] uppercase text-[#9ED8FF]">App events</div>
        <div className="mt-2 h-1.5 rounded-full bg-white/10">
          <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-[#4F7DFF] to-[#B04DFF]" />
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-[13%] right-0 z-20 w-36 rounded-lg border border-[#FF7AB6]/30 bg-background/72 p-3 shadow-2xl shadow-[#FF7AB6]/10 backdrop-blur-xl sm:right-5 sm:w-44"
        animate={inView ? { y: [0, 12, 0] } : {}}
        transition={{ duration: 6.2, repeat: inView ? Infinity : 0, ease: 'easeInOut' }}
      >
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase text-[#FFB0D0]">SKAN</div>
            <div className="mt-1 text-2xl font-semibold leading-none text-white">CPA</div>
          </div>
          <div className="grid h-9 grid-cols-4 items-end gap-1">
            {[52, 82, 64, 96].map((height) => (
              <span
                key={height}
                className="block w-1.5 rounded-full bg-gradient-to-t from-[#B04DFF] to-[#FF7AB6]"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </motion.div>

      <div className="pointer-events-none absolute inset-x-[14%] bottom-[6%] z-20 h-px bg-gradient-to-r from-transparent via-[#9ED8FF]/70 to-transparent" />
    </motion.div>
  );
});

MetaAppsHeroVisual.displayName = 'MetaAppsHeroVisual';

export default MetaAppsHeroVisual;
