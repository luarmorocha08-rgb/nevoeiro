import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { net } from '../net/netState';
import { useStore, type BodyView } from '../net/store';
import { THEME } from '../theme';
import { CharacterModel } from './CharacterModel';

/** Corpos permanecem no mapa (o Detetive examina, o Anjo ressuscita). */
export function Bodies() {
  const bodies = useStore((s) => s.bodies);
  return (
    <>
      {bodies.map((b) => (
        <Body key={b.id} b={b} />
      ))}
    </>
  );
}

const FALL_MS = 650;

function Body({ b }: { b: BodyView }) {
  const pivot = useRef<THREE.Group>(null);
  const puddle = useRef<THREE.Mesh>(null);
  const tag = useRef<HTMLDivElement>(null);
  const targeted = useStore((s) => s.bodyTarget?.id === b.id);

  useFrame(() => {
    const age = performance.now() - b.bornAt;
    // queda: tomba para trás com um leve quique
    const t = Math.min(1, age / FALL_MS);
    const ease = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
    const bounce = t < 1 ? Math.sin(t * Math.PI) * 0.06 : 0;
    if (pivot.current) {
      pivot.current.rotation.x = -Math.PI / 2 * ease;
      pivot.current.position.y = 0.2 * ease + bounce;
    }
    // poça discreta que cresce devagar
    if (puddle.current) puddle.current.scale.setScalar(0.15 + Math.min(1, age / 4000) * 0.85);
    if (tag.current) tag.current.style.opacity = Math.hypot(b.x - net.local.x, b.z - net.local.z) < 7 ? '1' : '0';
  });

  return (
    <group position={[b.x, 0, b.z]} rotation={[0, b.y, 0]}>
      <group ref={pivot}>
        <CharacterModel skin={b.skin} dead castShadow={false} outline={targeted ? THEME.team.inocentes : null} />
      </group>
      <mesh ref={puddle} rotation={[-Math.PI / 2, 0, 0]} position={[0.05, 0.022, -0.9]}>
        <circleGeometry args={[0.7, 24]} />
        <meshStandardMaterial color={THEME.scene.blood} roughness={0.25} metalness={0.1} transparent opacity={0.8} />
      </mesh>
      {targeted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, -0.8]}>
          <ringGeometry args={[1.1, 1.22, 40]} />
          <meshBasicMaterial color={THEME.team.inocentes} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      )}
      <Html position={[0, 0.9, -0.8]} center distanceFactor={6} style={{ pointerEvents: 'none' }}>
        <div ref={tag} className="body-tag">✝ {b.name}</div>
      </Html>
    </group>
  );
}
