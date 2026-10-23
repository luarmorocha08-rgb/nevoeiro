/**
 * Personagem: cápsula placeholder colorida pela skin OU modelo final .glb/.gltf.
 *
 * PIPELINE: coloque arquivos em /client/assets/characters/<skinId>.glb (ex.: capuz-vinho.glb)
 * ou um genérico default.glb. Eles são detectados no build automaticamente.
 * Animações reconhecidas pelo nome do clipe: idle, walk/andar, run/correr, death/morrer, ability/habilidade.
 * A skin é só visual: nunca revela o papel.
 */
import { Outlines, useAnimations, useGLTF } from '@react-three/drei';
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

export type AnimState = 'idle' | 'walk' | 'run' | 'death' | 'ability' | 'task';

export interface Motion {
  speed: number;
  state?: AnimState;
  /** 0 = visível, 1 = totalmente dissolvido (aparecer/sumir/Fantasma) */
  dissolve?: number;
  /** cor da borda do dissolve */
  edge?: string;
}

interface Props {
  skin: string;
  motion?: MutableRefObject<Motion>;
  ghost?: boolean;
  /** escondido (só parceiros/mesmo esconderijo veem): meio transparente */
  hidden?: boolean;
  dead?: boolean;
  castShadow?: boolean;
  /** contorno de destaque (alvo de uma ação) */
  outline?: string | null;
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

// ------------------------------------------------------------------ shader de dissolve

interface DissolveUniforms {
  uDissolve: { value: number };
  uEdge: { value: THREE.Color };
}

const NOISE_GLSL = /* glsl */ `
varying vec3 vDissolvePos;
uniform float uDissolve;
uniform vec3 uEdge;
float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

/** Injeta o dissolve (ruído 3D + borda brilhante) num material padrão do three. */
function addDissolve(mat: THREE.MeshStandardMaterial, u: DissolveUniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = u.uDissolve;
    shader.uniforms.uEdge = u.uEdge;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDissolvePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDissolvePos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nfloat dn = 1.0;\nif (uDissolve > 0.001) { dn = dNoise(vDissolvePos * 4.5) * 0.7 + dNoise(vDissolvePos * 11.0) * 0.3; if (dn < uDissolve) discard; }',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nif (uDissolve > 0.001 && dn < uDissolve + 0.07) totalEmissiveRadiance += uEdge * 2.5;',
      );
  };
  mat.customProgramCacheKey = () => 'nevoeiro-dissolve';
}

// ------------------------------------------------------------------ placeholder

function useSkinMaterials(skin: SkinDef, ghost: boolean, hidden: boolean) {
  const uniforms = useMemo<DissolveUniforms>(() => ({ uDissolve: { value: 0 }, uEdge: { value: new THREE.Color('#C9D6E8') } }), []);
  const mats = useMemo(() => {
    const opacity = ghost ? 0.28 : hidden ? 0.5 : 1;
    const mk = (color: string, rough = 0.85) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      });
      addDissolve(m, uniforms);
      return m;
    };
    return {
      top: mk(skin.top),
      bottom: mk(skin.bottom),
      skin: mk(skin.skinTone, 0.7),
      hair: mk(skin.hair, 0.9),
      shoes: mk(skin.shoes, 0.6),
    };
  }, [skin, ghost, hidden, uniforms]);
  // materiais passados por prop não são descartados pelo R3F: descarta aqui
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return { mats, uniforms };
}

function CapsuleCharacter({ skin: skinId, motion, ghost = false, hidden = false, dead = false, castShadow = true, outline }: Props) {
  const skin = getSkin(skinId);
  const { mats: m, uniforms } = useSkinMaterials(skin, ghost, hidden);
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const phase = useRef(Math.random() * 10);

  useFrame((_, dt) => {
    const mo = motion?.current;
    uniforms.uDissolve.value = mo?.dissolve ?? 0;
    if (mo?.edge) uniforms.uEdge.value.set(mo.edge);
    if (dead || !root.current) return;
    const speed = mo?.speed ?? 0;
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

  const shadow = castShadow && !ghost && !hidden;
  const ol = outline ? <Outlines thickness={0.045} color={outline} screenspace={false} /> : null;
  return (
    <group ref={root}>
      {/* pernas */}
      <group ref={legL} position={[-0.13, 0.82, 0]}>
        <mesh material={m.bottom} position={[0, -0.38, 0]} castShadow={shadow} geometry={LEG_GEO}>{ol}</mesh>
        <mesh material={m.shoes} position={[0, -0.76, 0.05]} castShadow={shadow} geometry={SHOE_GEO} />
      </group>
      <group ref={legR} position={[0.13, 0.82, 0]}>
        <mesh material={m.bottom} position={[0, -0.38, 0]} castShadow={shadow} geometry={LEG_GEO}>{ol}</mesh>
        <mesh material={m.shoes} position={[0, -0.76, 0.05]} castShadow={shadow} geometry={SHOE_GEO} />
      </group>
      {/* tronco (a "cápsula") */}
      <mesh material={m.top} position={[0, 1.2, 0]} castShadow={shadow} geometry={TORSO_GEO}>{ol}</mesh>
      {/* braços */}
      <mesh ref={armL} material={m.top} position={[-0.36, 1.22, 0]} castShadow={shadow} geometry={ARM_GEO}>{ol}</mesh>
      <mesh ref={armR} material={m.top} position={[0.36, 1.22, 0]} castShadow={shadow} geometry={ARM_GEO}>{ol}</mesh>
      {/* cabeça */}
      <mesh material={m.skin} position={[0, 1.66, 0]} castShadow={shadow} geometry={HEAD_GEO}>{ol}</mesh>
      <mesh material={m.hair} position={[0, 1.73, -0.02]} scale={[1.05, 0.75, 1.08]} geometry={HAIR_GEO} />
    </group>
  );
}

// geometrias compartilhadas por todos os personagens (criadas uma vez)
const ARM_GEO = (() => {
  const g = new THREE.CapsuleGeometry(0.08, 0.46, 4, 8);
  g.translate(0, -0.22, 0);
  return g;
})();
const LEG_GEO = new THREE.CapsuleGeometry(0.11, 0.56, 4, 8);
const SHOE_GEO = new THREE.BoxGeometry(0.16, 0.1, 0.28);
const TORSO_GEO = new THREE.CapsuleGeometry(0.26, 0.42, 6, 12);
const HEAD_GEO = new THREE.SphereGeometry(0.17, 16, 12);
const HAIR_GEO = new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9);

// ------------------------------------------------------------------ modelo final

const CLIP_PATTERNS: Record<AnimState, RegExp> = {
  idle: /idle|parado/i,
  walk: /walk|andar/i,
  run: /run|correr/i,
  death: /death|die|dying|morrer|morte/i,
  ability: /ability|cast|habilidade|skill/i,
  task: /task|work|interact|tarefa|trabalh/i,
};

function GltfCharacter({ url, motion, ghost, hidden, dead }: Props & { url: string }) {
  const { scene, animations } = useGLTF(url);
  // clona também os materiais: cada jogador pode ficar transparente sem afetar os outros
  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
    });
    return c;
  }, [scene]);
  useEffect(
    () => () =>
      clone.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      }),
    [clone],
  );
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
        const op = ghost ? 0.28 : hidden ? 0.5 : 1;
        mat.transparent = op < 1;
        mat.opacity = op;
        mat.depthWrite = op >= 1;
      }
    });
  }, [clone, ghost, hidden]);

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
