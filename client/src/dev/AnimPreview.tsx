/**
 * Prévia das animações (só em desenvolvimento): abra /?anim
 * Mostra parado, andando, correndo, cansado e fazendo tarefa lado a lado.
 */
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import { CONFIG } from '@nevoeiro/shared';
import { CharacterModel, type Motion } from '../game/CharacterModel';

function Actor({ x, speed, task = false, tired = false, skin }: { x: number; speed: number; task?: boolean; tired?: boolean; skin: string }) {
  const motion = useRef<Motion>({ speed, state: task ? 'task' : undefined, tired });
  return (
    <group position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <CharacterModel skin={skin} motion={motion} />
    </group>
  );
}

export function AnimPreview() {
  const side = new URLSearchParams(location.search).get('view') !== 'front';
  return (
    <Canvas shadows camera={{ position: side ? [0, 1.3, 7] : [7, 1.3, 0.01], fov: 45 }} style={{ position: 'fixed', inset: 0, background: '#2a3040' }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 6, 5]} intensity={2.4} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#4a5060" />
      </mesh>
      <gridHelper args={[30, 30, '#666', '#555']} position={[0, 0.01, 0]} />
      <Actor x={-4} speed={0} skin="camisa-petroleo" />
      <Actor x={-2} speed={CONFIG.move.walkSpeed} skin="capuz-vinho" />
      <Actor x={0} speed={CONFIG.move.runSpeed} skin="sueter-mostarda" />
      <Actor x={2} speed={CONFIG.move.walkSpeed * 0.8} tired skin="jaqueta-jeans" />
      <Actor x={4} speed={0} task skin="trico-verde" />
      <OrbitControls target={[0, 1, 0]} />
    </Canvas>
  );
}
