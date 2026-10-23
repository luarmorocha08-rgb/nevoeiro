/**
 * Personagem: cápsula placeholder colorida pela skin OU modelo final .glb/.gltf.
 *
 * PIPELINE: coloque arquivos em /client/assets/characters/<skinId>.glb (ex.: capuz-vinho.glb)
 * ou um genérico default.glb. Eles são detectados no build automaticamente.
 * Animações reconhecidas pelo nome do clipe: idle, walk/andar, run/correr, death/morrer, ability/habilidade.
 * A skin é só visual: nunca revela o papel.
 */
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { getSkin, type SkinDef } from '@nevoeiro/shared';

const MODEL_URLS = import.meta.glob('/assets/characters/*.{glb,gltf}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function modelUrlFor(skinId: string): string | undefined {
  const entries = Object.entries(MODEL_URLS);
  const exact = entries.find(([k]) => k.endsWith(`/${skinId}.glb`) || k.endsWith(`/${skinId}.gltf`));
  if (exact) return exact[1];
  return entries.find(([k]) => /\/default\.(glb|gltf)$/.test(k))?.[1];
}

export type AnimState = 'idle' | 'walk' | 'run' | 'death' | 'ability';

export interface Motion {
  speed: number;
  state?: AnimState;
}

interface Props {
  skin: string;
  motion?: MutableRefObject<Motion>;
  ghost?: boolean;
  dead?: boolean;
  castShadow?: boolean;
}

export function CharacterModel(props: Props) {
  const url = modelUrlFor(props.skin);
  if (url) {
    return (
      <Suspense fallback={<CapsuleCharacter {...props} />}>
        <GltfCharacter url={url} {...props} />
      </Suspense>
    );
  }
  return <CapsuleCharacter {...props} />;
}

// ------------------------------------------------------------------ placeholder

function useSkinMaterials(skin: SkinDef, ghost: boolean) {
  return useMemo(() => {
    const mk = (color: string, rough = 0.85) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        transparent: ghost,
        opacity: ghost ? 0.28 : 1,
        depthWrite: !ghost,
      });
    return {
      top: mk(skin.top),
      bottom: mk(skin.bottom),
      skin: mk(skin.skinTone, 0.7),
      hair: mk(skin.hair, 0.9),
      shoes: mk(skin.shoes, 0.6),
    };
  }, [skin, ghost]);
}

function CapsuleCharacter({ skin: skinId, motion, ghost = false, dead = false, castShadow = true }: Props) {
  const skin = getSkin(skinId);
  const m = useSkinMaterials(skin, ghost);
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const phase = useRef(Math.random() * 10);

  useFrame((_, dt) => {
    if (dead || !root.current) return;
    const speed = motion?.current.speed ?? 0;
    const moving = speed > 0.3;
    phase.current += dt * (moving ? 4 + speed * 1.6 : 1.4);
    const swing = moving ? Math.min(0.9, 0.25 + speed * 0.12) : 0;
    const s = Math.sin(phase.current);
    if (legL.current) legL.current.rotation.x = s * swing;
    if (legR.current) legR.current.rotation.x = -s * swing;
    if (armL.current) armL.current.rotation.x = -s * swing * 0.8;
    if (armR.current) armR.current.rotation.x = s * swing * 0.8;
    root.current.position.y = moving ? Math.abs(Math.cos(phase.current)) * 0.06 : Math.sin(phase.current) * 0.012;
  });

  const shadow = castShadow && !ghost;
  return (
    <group rotation={dead ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} position={dead ? [0, 0.22, 0] : [0, 0, 0]}>
      <group ref={root}>
        {/* pernas */}
        <group ref={legL} position={[-0.13, 0.82, 0]}>
          <mesh material={m.bottom} position={[0, -0.38, 0]} castShadow={shadow}>
            <capsuleGeometry args={[0.11, 0.56, 4, 8]} />
          </mesh>
          <mesh material={m.shoes} position={[0, -0.76, 0.05]} castShadow={shadow}>
            <boxGeometry args={[0.16, 0.1, 0.28]} />
          </mesh>
        </group>
        <group ref={legR} position={[0.13, 0.82, 0]}>
          <mesh material={m.bottom} position={[0, -0.38, 0]} castShadow={shadow}>
            <capsuleGeometry args={[0.11, 0.56, 4, 8]} />
          </mesh>
          <mesh material={m.shoes} position={[0, -0.76, 0.05]} castShadow={shadow}>
            <boxGeometry args={[0.16, 0.1, 0.28]} />
          </mesh>
        </group>
        {/* tronco (a "cápsula") */}
        <mesh material={m.top} position={[0, 1.2, 0]} castShadow={shadow}>
          <capsuleGeometry args={[0.26, 0.42, 6, 12]} />
        </mesh>
        {/* braços */}
        <mesh ref={armL} material={m.top} position={[-0.36, 1.22, 0]} castShadow={shadow} geometry={ARM_GEO} />
        <mesh ref={armR} material={m.top} position={[0.36, 1.22, 0]} castShadow={shadow} geometry={ARM_GEO} />
        {/* cabeça */}
        <mesh material={m.skin} position={[0, 1.66, 0]} castShadow={shadow}>
          <sphereGeometry args={[0.17, 16, 12]} />
        </mesh>
        <mesh material={m.hair} position={[0, 1.73, -0.02]} scale={[1.05, 0.75, 1.08]}>
          <sphereGeometry args={[0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
        </mesh>
      </group>
    </group>
  );
}

const ARM_GEO = (() => {
  const g = new THREE.CapsuleGeometry(0.08, 0.46, 4, 8);
  g.translate(0, -0.22, 0);
  return g;
})();

// ------------------------------------------------------------------ modelo final

const CLIP_PATTERNS: Record<AnimState, RegExp> = {
  idle: /idle|parado/i,
  walk: /walk|andar/i,
  run: /run|correr/i,
  death: /death|die|dying|morrer|morte/i,
  ability: /ability|cast|habilidade|skill/i,
};

function GltfCharacter({ url, motion, ghost, dead }: Props & { url: string }) {
  const { scene, animations } = useGLTF(url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const group = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(animations, group);
  const current = useRef<string | null>(null);

  useEffect(() => {
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !ghost;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        mat.transparent = !!ghost;
        mat.opacity = ghost ? 0.28 : 1;
        mat.depthWrite = !ghost;
      }
    });
  }, [clone, ghost]);

  const clipFor = (state: AnimState) => names.find((n) => CLIP_PATTERNS[state].test(n)) ?? names[0];

  useFrame(() => {
    const speed = motion?.current.speed ?? 0;
    const state: AnimState = dead ? 'death' : motion?.current.state ?? (speed > 4 ? 'run' : speed > 0.3 ? 'walk' : 'idle');
    const name = clipFor(state);
    if (!name || name === current.current) return;
    const next = actions[name];
    const prev = current.current ? actions[current.current] : null;
    if (next) {
      next.reset().fadeIn(0.2).play();
      if (state === 'death') {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      }
    }
    prev?.fadeOut(0.2);
    current.current = name;
  });

  return (
    <group ref={group}>
      <primitive object={clone} />
    </group>
  );
}

for (const url of Object.values(MODEL_URLS)) useGLTF.preload(url);
