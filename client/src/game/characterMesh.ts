/**
 * Corpo do personagem placeholder como UMA malha com esqueleto (SkinnedMesh):
 * todas as peças (pernas, braços, tronco, cabeça, cabelo, olhos) são mescladas numa
 * geometria só, cada vértice preso 100% ao seu osso. Resultado: 1 chamada de desenho por
 * personagem (antes eram 18), com a mesma animação procedural de ./rig.ts.
 * A geometria é compartilhada por todos os personagens com a mesma skin.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getSkin, type SkinDef } from '@nevoeiro/shared';
import { RIG, type Rig } from './rig';

type BoneName = keyof Rig;
type ColorKey = 'top' | 'bottom' | 'skin' | 'hair' | 'shoes' | 'eye';

const BONES: { name: BoneName; parent: BoneName | null; pos: [number, number, number] }[] = [
  { name: 'root', parent: null, pos: [0, 0, 0] },
  { name: 'pelvis', parent: 'root', pos: [0, RIG.hipY, 0] },
  { name: 'hipL', parent: 'pelvis', pos: [-RIG.hipX, 0, 0] },
  { name: 'kneeL', parent: 'hipL', pos: [0, -RIG.thigh, 0] },
  { name: 'ankleL', parent: 'kneeL', pos: [0, -RIG.shin, 0] },
  { name: 'hipR', parent: 'pelvis', pos: [RIG.hipX, 0, 0] },
  { name: 'kneeR', parent: 'hipR', pos: [0, -RIG.thigh, 0] },
  { name: 'ankleR', parent: 'kneeR', pos: [0, -RIG.shin, 0] },
  { name: 'spine', parent: 'pelvis', pos: [0, 0, 0] },
  { name: 'shoulderL', parent: 'spine', pos: [-RIG.shoulderX, RIG.shoulderY, 0] },
  { name: 'elbowL', parent: 'shoulderL', pos: [0, -RIG.upperArm, 0] },
  { name: 'shoulderR', parent: 'spine', pos: [RIG.shoulderX, RIG.shoulderY, 0] },
  { name: 'elbowR', parent: 'shoulderR', pos: [0, -RIG.upperArm, 0] },
  { name: 'head', parent: 'spine', pos: [0, RIG.neckY, 0] },
];
const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b.name, i])) as Record<BoneName, number>;

/** Posição de repouso de cada osso no espaço do personagem (só translações). */
const BIND_POS: Record<BoneName, THREE.Vector3> = (() => {
  const out = {} as Record<BoneName, THREE.Vector3>;
  for (const b of BONES) {
    const p = new THREE.Vector3(...b.pos);
    if (b.parent) p.add(out[b.parent]);
    out[b.name] = p;
  }
  return out;
})();

// ------------------------------------------------------------------ peças

function capsule(r: number, len: number, drop: number) {
  return new THREE.CapsuleGeometry(r, len, 4, 10).translate(0, -drop, 0);
}
const SHOE = (() => {
  const geo = new THREE.BoxGeometry(0.15, 0.09, 0.27, 1, 1, 2);
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

interface Part {
  geo: THREE.BufferGeometry;
  bone: BoneName;
  color: ColorKey;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const PARTS: Part[] = (() => {
  const thigh = capsule(0.105, 0.28, 0.22);
  const shin = capsule(0.088, 0.3, 0.21);
  const upper = capsule(0.075, 0.18, 0.14);
  const fore = capsule(0.066, 0.17, 0.13);
  const hand = new THREE.SphereGeometry(0.068, 10, 8).scale(0.85, 1.1, 0.75);
  const eye = new THREE.SphereGeometry(0.022, 8, 6);
  const list: Part[] = [
    { geo: new THREE.CapsuleGeometry(0.17, 0.12, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.75), bone: 'pelvis', color: 'bottom', pos: [0, 0.02, 0] },
    { geo: new THREE.CapsuleGeometry(0.235, 0.3, 6, 14).scale(1, 1, 0.78), bone: 'spine', color: 'top', pos: [0, 0.27, 0] },
    { geo: new THREE.CapsuleGeometry(0.11, 0.42, 4, 10).scale(1, 1, 0.85), bone: 'spine', color: 'top', pos: [0, RIG.shoulderY - 0.02, 0], rot: [0, 0, Math.PI / 2] },
    { geo: new THREE.CylinderGeometry(0.065, 0.075, 0.12, 8), bone: 'head', color: 'skin', pos: [0, 0.03, 0] },
    { geo: new THREE.SphereGeometry(0.165, 18, 14).scale(0.95, 1.08, 1), bone: 'head', color: 'skin', pos: [0, 0.17, 0.01] },
    { geo: new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), bone: 'head', color: 'hair', pos: [0, 0.2, -0.012], scale: [1.07, 1.02, 1.1] },
    { geo: eye, bone: 'head', color: 'eye', pos: [-0.058, 0.18, 0.152] },
    { geo: eye, bone: 'head', color: 'eye', pos: [0.058, 0.18, 0.152] },
  ];
  for (const s of ['L', 'R'] as const) {
    list.push(
      { geo: thigh, bone: `hip${s}`, color: 'bottom' },
      { geo: shin, bone: `knee${s}`, color: 'bottom' },
      { geo: SHOE, bone: `ankle${s}`, color: 'shoes', pos: [0, -0.035, 0.045] },
      { geo: upper, bone: `shoulder${s}`, color: 'top' },
      { geo: fore, bone: `elbow${s}`, color: 'top' },
      { geo: hand, bone: `elbow${s}`, color: 'skin', pos: [0, -0.29, 0.01] },
    );
  }
  return list;
})();

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Geometria mesclada (com cores e pesos de osso) de uma skin — criada uma vez. */
export function characterGeometry(skinId: string): THREE.BufferGeometry {
  const hit = geoCache.get(skinId);
  if (hit) return hit;
  const skin: SkinDef = getSkin(skinId);
  const colors: Record<ColorKey, THREE.Color> = {
    top: new THREE.Color(skin.top),
    bottom: new THREE.Color(skin.bottom),
    skin: new THREE.Color(skin.skinTone),
    hair: new THREE.Color(skin.hair),
    shoes: new THREE.Color(skin.shoes),
    eye: new THREE.Color('#141010'),
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pieces = PARTS.map((p) => {
    const g = p.geo.clone();
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p.pos ?? [0, 0, 0])),
      q.setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
    );
    m.makeTranslation(BIND_POS[p.bone]).multiply(local);
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const idx = new Uint16Array(n * 4);
    const wgt = new Float32Array(n * 4);
    const c = colors[p.color];
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      idx[i * 4] = BONE_INDEX[p.bone];
      wgt[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));
    return g;
  });
  const merged = mergeGeometries(pieces)!;
  pieces.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  merged.boundingSphere!.radius += 0.6; // folga para os membros animados
  geoCache.set(skinId, merged);
  return merged;
}

/** Ossos novos (cada personagem tem os seus) já no formato do Rig. */
export function createBones(): { rig: Rig; list: THREE.Bone[] } {
  const list = BONES.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.set(...b.pos);
    return bone;
  });
  BONES.forEach((b, i) => {
    if (b.parent) list[BONE_INDEX[b.parent]].add(list[i]);
  });
  const rig = Object.fromEntries(BONES.map((b, i) => [b.name, list[i]])) as unknown as Rig;
  return { rig, list };
}
