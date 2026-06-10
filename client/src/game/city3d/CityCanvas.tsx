/**
 * CityCanvas.tsx
 * --------------
 * Renderizador 3D (Three.js + react-three-fiber). Lê os snapshots do mundo e
 * posiciona os digital twins nas calçadas (o motor já garante que só andam em
 * tiles caminháveis), com prédios, lojas, ruas, carros, sombras e câmera
 * orbital. As cores de pele refletem a diversidade configurada em cada twin.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import { connectWorld } from '../../api/client';
import { useWorldStore } from '../../store/useWorldStore';
import type { AgentRuntimeState, Facing } from '../../types';
import { buildCity } from './build';
import { worldPos, generateCarRoutes, WORLD_SPAN_X, WORLD_SPAN_Z, type CarRoute } from '../../city/map';

const FACING_ROT: Record<Facing, number> = {
  down: 0,
  up: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

const DEFAULT_SKIN = '#e7b48f';

function StaticCity() {
  const group = useMemo(() => buildCity(), []);
  return <primitive object={group} />;
}

function Agent3D({ agent }: { agent: AgentRuntimeState }) {
  const ref = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);

  const shirt = useMemo(() => {
    let h = 0;
    for (const ch of agent.core.spriteKey + agent.core.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return new THREE.Color(`hsl(${h % 360}, 60%, 55%)`);
  }, [agent.core.spriteKey, agent.core.name]);

  const skin = useMemo(() => new THREE.Color(agent.core.skin ?? DEFAULT_SKIN), [agent.core.skin]);

  const [wx, wz] = worldPos(agent.position.x, agent.position.y);

  useEffect(() => {
    if (ref.current && ref.current.position.lengthSq() === 0) ref.current.position.set(wx, 0, wz);
  }, [wx, wz]);

  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    g.position.x += (wx - g.position.x) * Math.min(1, delta * 3);
    g.position.z += (wz - g.position.z) * Math.min(1, delta * 3);
    let d = FACING_ROT[agent.facing] - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * Math.min(1, delta * 6);
    if (bodyRef.current) {
      bodyRef.current.position.y = agent.isMoving ? Math.abs(Math.sin(state.clock.elapsedTime * 8)) * 0.12 : 0;
    }
  });

  return (
    <group ref={ref}>
      <group ref={bodyRef}>
        <mesh position={[-0.12, 0.28, 0]} castShadow>
          <boxGeometry args={[0.16, 0.55, 0.18]} />
          <meshStandardMaterial color={0x2b3a55} roughness={0.9} />
        </mesh>
        <mesh position={[0.12, 0.28, 0]} castShadow>
          <boxGeometry args={[0.16, 0.55, 0.18]} />
          <meshStandardMaterial color={0x2b3a55} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[0.42, 0.55, 0.26]} />
          <meshStandardMaterial color={shirt} roughness={0.7} />
        </mesh>
        {/* braços (tom de pele) */}
        <mesh position={[-0.27, 0.85, 0]} castShadow>
          <boxGeometry args={[0.1, 0.5, 0.16]} />
          <meshStandardMaterial color={skin} roughness={0.6} />
        </mesh>
        <mesh position={[0.27, 0.85, 0]} castShadow>
          <boxGeometry args={[0.1, 0.5, 0.16]} />
          <meshStandardMaterial color={skin} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.32, 0]} castShadow>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={skin} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.3, 0.19]}>
          <boxGeometry args={[0.06, 0.06, 0.06]} />
          <meshStandardMaterial color={skin} roughness={0.6} />
        </mesh>
      </group>

      <Html position={[0, 2.0, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div className="select-none whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          <span className="mr-1">{agent.actionEmoji}</span>
          {agent.core.name}
        </div>
      </Html>

      {agent.speech && (
        <Html position={[0, 2.55, 0]} center distanceFactor={10} zIndexRange={[20, 0]}>
          <div className="speech-bubble">{agent.speech}</div>
        </Html>
      )}
    </group>
  );
}

function Car({ route }: { route: CarRoute }) {
  const ref = useRef<THREE.Group>(null);
  const span = route.axis === 'x' ? WORLD_SPAN_X : WORLD_SPAN_Z;

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime * route.speed + route.offset;
    let p = (((t % span) + span) % span) - span / 2;
    if (route.dir < 0) p = -p;
    if (route.axis === 'x') {
      g.position.set(p, 0.18, route.fixed + route.side);
      g.rotation.y = route.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      g.position.set(route.fixed + route.side, 0.18, p);
      g.rotation.y = route.dir > 0 ? 0 : Math.PI;
    }
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.7, 0.32, 1.4]} />
        <meshStandardMaterial color={route.color} roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.42, -0.05]} castShadow>
        <boxGeometry args={[0.6, 0.28, 0.7]} />
        <meshStandardMaterial color={0x16202c} roughness={0.2} metalness={0.6} />
      </mesh>
      <mesh position={[0.22, 0.18, 0.71]}>
        <boxGeometry args={[0.12, 0.1, 0.04]} />
        <meshStandardMaterial color={0xfff2c0} emissive={0xfff2c0} emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[-0.22, 0.18, 0.71]}>
        <boxGeometry args={[0.12, 0.1, 0.04]} />
        <meshStandardMaterial color={0xfff2c0} emissive={0xfff2c0} emissiveIntensity={1.2} />
      </mesh>
      {[
        [0.36, 0, 0.45],
        [-0.36, 0, 0.45],
        [0.36, 0, -0.45],
        [-0.36, 0, -0.45],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], 0.06, p[2]]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.1, 12]} />
          <meshStandardMaterial color={0x111317} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Scene() {
  const agents = useWorldStore((s) => s.snapshot?.agents ?? []);
  const routes = useMemo(() => generateCarRoutes(), []);

  return (
    <>
      <Sky sunPosition={[40, 30, 20]} turbidity={6} rayleigh={1.2} />
      <fog attach="fog" args={[0xcfe0f0, 60, 130]} />

      <hemisphereLight args={[0xbfd4ff, 0x4a4636, 0.7]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        castShadow
        position={[40, 50, 25]}
        intensity={1.2}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />

      <StaticCity />
      {routes.map((r, i) => (
        <Car key={i} route={r} />
      ))}
      {agents.map((a) => (
        <Agent3D key={a.id} agent={a} />
      ))}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, 1, 0]}
        minDistance={14}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.15}
      />
    </>
  );
}

export function CityCanvas() {
  useEffect(() => connectWorld((snap) => useWorldStore.getState().setSnapshot(snap)), []);

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-slate-800 shadow-2xl">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [38, 32, 44], fov: 45, near: 0.1, far: 400 }} gl={{ antialias: true }}>
        <Scene />
      </Canvas>
    </div>
  );
}
