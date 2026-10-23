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
import { RIG, animateRig, createRigState, type Rig, type RigState } from './rig';

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
  /** cansado (stamina zerada): corpo curvado e respiração pesada */
  tired?: boolean;
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
  const g = {
    root: useRef<THREE.Group>(null),
    pelvis: useRef<THREE.Group>(null),
    spine: useRef<THREE.Group>(null),
    head: useRef<THREE.Group>(null),
    shoulderL: useRef<THREE.Group>(null),
    shoulderR: useRef<THREE.Group>(null),
    elbowL: useRef<THREE.Group>(null),
    elbowR: useRef<THREE.Group>(null),
    hipL: useRef<THREE.Group>(null),
    hipR: useRef<THREE.Group>(null),
    kneeL: useRef<THREE.Group>(null),
    kneeR: useRef<THREE.Group>(null),
    ankleL: useRef<THREE.Group>(null),
    ankleR: useRef<THREE.Group>(null),
  };
  const state = useRef<RigState>(createRigState());
  const rig = useRef<Rig | null>(null);

  useFrame((_, dt) => {
    const mo = motion?.current;
    uniforms.uDissolve.value = mo?.dissolve ?? 0;
    if (mo?.edge) uniforms.uEdge.value.set(mo.edge);
    if (dead) return;
    if (!rig.current) {
      if (!g.root.current) return;
      rig.current = Object.fromEntries(Object.entries(g).map(([k, r]) => [k, r.current])) as unknown as Rig;
    }
    animateRig(rig.current, state.current, { task: mo?.state === 'task', tired: !!mo?.tired, speed: mo?.speed }, dt);
  });

  const shadow = castShadow && !ghost && !hidden;
  const ol = outline ? <Outlines thickness={0.045} color={outline} screenspace={false} /> : null;
  const legs = ([-1, 1] as const).map((side) => (
    <group key={side} ref={side < 0 ? g.hipL : g.hipR} position={[side * RIG.hipX, 0, 0]}>
      <mesh material={m.bottom} geometry={THIGH_GEO} castShadow={shadow}>{ol}</mesh>
      <group ref={side < 0 ? g.kneeL : g.kneeR} position={[0, -RIG.thigh, 0]}>
        <mesh material={m.bottom} geometry={SHIN_GEO} castShadow={shadow}>{ol}</mesh>
        <group ref={side < 0 ? g.ankleL : g.ankleR} position={[0, -RIG.shin, 0]}>
          <mesh material={m.shoes} geometry={SHOE_GEO} position={[0, -0.035, 0.045]} castShadow={shadow} />
        </group>
      </group>
    </group>
  ));
  const arms = ([-1, 1] as const).map((side) => (
    <group key={side} ref={side < 0 ? g.shoulderL : g.shoulderR} position={[side * RIG.shoulderX, RIG.shoulderY, 0]}>
      <mesh material={m.top} geometry={UPPER_ARM_GEO} castShadow={shadow}>{ol}</mesh>
      <group ref={side < 0 ? g.elbowL : g.elbowR} position={[0, -RIG.upperArm, 0]}>
        <mesh material={m.top} geometry={FOREARM_GEO} castShadow={shadow}>{ol}</mesh>
        <mesh material={m.skin} geometry={HAND_GEO} position={[0, -0.29, 0.01]} castShadow={shadow} />
      </group>
    </group>
  ));
  return (
    <group ref={g.root}>
      <group ref={g.pelvis} position={[0, RIG.hipY, 0]}>
        {/* quadril */}
        <mesh material={m.bottom} geometry={HIPS_GEO} position={[0, 0.02, 0]} castShadow={shadow} />
        {legs}
        <group ref={g.spine}>
          {/* tronco com ombros */}
          <mesh material={m.top} geometry={TORSO_GEO} position={[0, 0.27, 0]} castShadow={shadow}>{ol}</mesh>
          <mesh material={m.top} geometry={SHOULDERS_GEO} position={[0, RIG.shoulderY - 0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow={shadow} />
          {arms}
          <group ref={g.head} position={[0, RIG.neckY, 0]}>
            <mesh material={m.skin} geometry={NECK_GEO} position={[0, 0.03, 0]} />
            <mesh material={m.skin} geometry={HEAD_GEO} position={[0, 0.17, 0.01]} castShadow={shadow}>{ol}</mesh>
            <mesh material={m.hair} geometry={HAIR_GEO} position={[0, 0.2, -0.012]} scale={[1.07, 1.02, 1.1]} />
            {/* olhos: mostram para onde a pessoa está olhando */}
            <mesh material={EYE_MAT} geometry={EYE_GEO} position={[-0.058, 0.18, 0.152]} />
            <mesh material={EYE_MAT} geometry={EYE_GEO} position={[0.058, 0.18, 0.152]} />
          </group>
        </group>
      </group>
    </group>
  );
}

// geometrias compartilhadas por todos os personagens (criadas uma vez)
function capsule(r: number, len: number, drop: number) {
  const geo = new THREE.CapsuleGeometry(r, len, 4, 10);
  geo.translate(0, -drop, 0);
  return geo;
}
const THIGH_GEO = capsule(0.105, 0.28, 0.22);
const SHIN_GEO = capsule(0.088, 0.3, 0.21);
const SHOE_GEO = (() => {
  const geo = new THREE.BoxGeometry(0.15, 0.09, 0.27, 1, 1, 2);
  // bico arredondado
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > 0.1) {
      pos.setX(i, pos.getX(i) * 0.8);
      pos.setY(i, pos.getY(i) - (pos.getY(i) > 0 ? 0.025 : 0));
    }
  }
  geo.computeVertexNormals();
  return geo;
})();
const HIPS_GEO = new THREE.CapsuleGeometry(0.17, 0.12, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.75);
const TORSO_GEO = new THREE.CapsuleGeometry(0.235, 0.3, 6, 14).scale(1, 1, 0.78);
const SHOULDERS_GEO = new THREE.CapsuleGeometry(0.11, 0.42, 4, 10).scale(1, 1, 0.85);
const UPPER_ARM_GEO = capsule(0.075, 0.18, 0.14);
const FOREARM_GEO = capsule(0.066, 0.17, 0.13);
const HAND_GEO = new THREE.SphereGeometry(0.068, 10, 8).scale(0.85, 1.1, 0.75);
const NECK_GEO = new THREE.CylinderGeometry(0.065, 0.075, 0.12, 8);
const HEAD_GEO = new THREE.SphereGeometry(0.165, 18, 14).scale(0.95, 1.08, 1);
const HAIR_GEO = new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.9);
const EYE_GEO = new THREE.SphereGeometry(0.022, 8, 6);
const EYE_MAT = new THREE.MeshStandardMaterial({ color: '#141010', roughness: 0.3 });

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
