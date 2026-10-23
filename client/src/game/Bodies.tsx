import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { net } from '../net/netState';
import { getState, useStore, type BodyView } from '../net/store';
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

function Body({ b }: { b: BodyView }) {
  const ring = useRef<THREE.Mesh>(null);
  const tag = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => {
    const st = getState();
    const targeted = st.bodyTarget?.id === b.id;
    if (ring.current) {
      ring.current.visible = targeted;
      ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.06);
    }
    if (tag.current) tag.current.style.opacity = Math.hypot(b.x - net.local.x, b.z - net.local.z) < 7 ? '1' : '0';
  });
  return (
    <group position={[b.x, 0, b.z]} rotation={[0, b.y, 0]}>
      <CharacterModel skin={b.skin} dead castShadow={false} />
      {/* poça escura */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.05, 0.025, -0.4]}>
        <circleGeometry args={[0.75, 20]} />
        <meshStandardMaterial color="#3a0507" roughness={0.3} transparent opacity={0.85} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, -0.6]} visible={false}>
        <ringGeometry args={[1.1, 1.25, 32]} />
        <meshBasicMaterial color="#4fe3d4" transparent opacity={0.9} />
      </mesh>
      <Html position={[0, 0.9, -0.6]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div ref={tag} className="body-tag">✝ {b.name}</div>
      </Html>
    </group>
  );
}
