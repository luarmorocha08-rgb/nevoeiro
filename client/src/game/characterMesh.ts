/**
 * Corpo do personagem placeholder como UMA malha com esqueleto (SkinnedMesh), com formas
 * humanas: pernas (coxa → joelho → panturrilha → tornozelo), braços (ombro → bíceps →
 * cotovelo → antebraço → punho) e tronco (quadril → cintura → peito → ombros → pescoço)
 * feitos por revolução de um perfil (LatheGeometry), rosto com olhos, íris, sobrancelhas,
 * nariz, orelhas, queixo e boca, mãos com polegar, roupa (calça, cinto, camisa, gola,
 * mangas) e 4 estilos de cabelo.
 *
 * Nas juntas cada vértice é dividido entre dois ossos (pesos suaves): joelhos, cotovelos,
 * cintura e pescoço DOBRAM em vez de girar peças soltas — é o que tira o ar de robô.
 * 1 chamada de desenho por personagem; geometria compartilhada por skin.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getSkin, SKINS, type SkinDef } from '@nevoeiro/shared';
import { RIG, type Rig } from './rig';

type BoneName = keyof Rig;

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
const BI = Object.fromEntries(BONES.map((b, i) => [b.name, i])) as Record<BoneName, number>;

/** Posição de repouso de cada osso no espaço do personagem. */
const BIND: Record<BoneName, THREE.Vector3> = (() => {
  const out = {} as Record<BoneName, THREE.Vector3>;
  for (const b of BONES) {
    const p = new THREE.Vector3(...b.pos);
    if (b.parent) p.add(out[b.parent]);
    out[b.name] = p;
  }
  return out;
})();

// ------------------------------------------------------------------ montagem

interface Colors {
  top: THREE.Color;
  topDark: THREE.Color;
  bottom: THREE.Color;
  skin: THREE.Color;
  skinDark: THREE.Color;
  hair: THREE.Color;
  shoes: THREE.Color;
  sole: THREE.Color;
  white: THREE.Color;
  iris: THREE.Color;
  lips: THREE.Color;
  belt: THREE.Color;
}

/** Peso de osso por vértice: até dois ossos (a, b) com mistura t (0 = só a). */
type Skin = (p: THREE.Vector3) => { a: BoneName; b: BoneName; t: number };
type Paint = (p: THREE.Vector3) => THREE.Color;

class Builder {
  parts: THREE.BufferGeometry[] = [];

  /** Adiciona uma geometria já no espaço do personagem, com cor e pesos por vértice. */
  add(geo: THREE.BufferGeometry, paint: Paint, skin: Skin) {
    const g = geo;
    const pos = g.attributes.position;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const idx = new Uint16Array(n * 4);
    const wgt = new Float32Array(n * 4);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      const c = paint(v);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      const s = skin(v);
      idx[i * 4] = BI[s.a];
      idx[i * 4 + 1] = BI[s.b];
      wgt[i * 4] = 1 - s.t;
      wgt[i * 4 + 1] = s.t;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));
    // todas as peças com os mesmos atributos (uv não é usado)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(g.index ? g.toNonIndexed() : g);
  }

  /** Peça rígida presa a um osso, posicionada relativa a ele. */
  rigid(geo: THREE.BufferGeometry, bone: BoneName, color: THREE.Color, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
    const g = geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
    g.applyMatrix4(m);
    g.translate(BIND[bone].x, BIND[bone].y, BIND[bone].z);
    this.add(g, () => color, () => ({ a: bone, b: bone, t: 0 }));
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts)!;
    this.parts.forEach((p) => p.dispose());
    // normais vêm de cada peça (suaves); recalcular aqui deixaria tudo facetado
    merged.computeBoundingSphere();
    merged.boundingSphere!.radius += 0.6;
    return merged;
  }
}

/** Superfície de revolução: perfil [y, raio] de cima para baixo, com tampas. */
function lathe(profile: [number, number][], radial = 14): THREE.BufferGeometry {
  const pts = [...profile].reverse().map(([y, r]) => new THREE.Vector2(Math.max(r, 0.0001), y));
  // fecha embaixo e em cima
  pts.unshift(new THREE.Vector2(0.0001, pts[0].y - 0.0001));
  pts.push(new THREE.Vector2(0.0001, pts[pts.length - 1].y + 0.0001));
  return new THREE.LatheGeometry(pts, radial);
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

type HairStyle = 'curto' | 'longo' | 'cacheado' | 'coque';
function hairStyle(skinId: string): HairStyle {
  const i = Math.max(0, SKINS.findIndex((s) => s.id === skinId));
  return (['curto', 'longo', 'cacheado', 'coque'] as const)[(i * 7 + 3) % 4];
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Geometria do corpo de uma skin (criada uma vez e compartilhada). */
export function characterGeometry(skinId: string): THREE.BufferGeometry {
  const hit = geoCache.get(skinId);
  if (hit) return hit;
  const skin: SkinDef = getSkin(skinId);
  const C: Colors = {
    top: new THREE.Color(skin.top),
    topDark: new THREE.Color(skin.top).multiplyScalar(0.72),
    bottom: new THREE.Color(skin.bottom),
    skin: new THREE.Color(skin.skinTone),
    skinDark: new THREE.Color(skin.skinTone).multiplyScalar(0.82),
    hair: new THREE.Color(skin.hair),
    shoes: new THREE.Color(skin.shoes),
    sole: new THREE.Color(skin.shoes).multiplyScalar(0.45),
    white: new THREE.Color('#ece6dc'),
    iris: new THREE.Color('#2a1d14'),
    lips: new THREE.Color(skin.skinTone).lerp(new THREE.Color('#8a3a3a'), 0.45),
    belt: new THREE.Color('#2a1f17'),
  };
  const B = new Builder();
  const style = hairStyle(skinId);
  const shortSleeves = (SKINS.findIndex((s) => s.id === skinId) % 5) === 2;
  const hipY = RIG.hipY;
  const shade = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);

  // ---------- tronco (quadril → cintura → peito → ombros → pescoço)
  {
    const prof: [number, number][] = [
      [0.71, 0.0],
      [0.68, 0.058],
      [0.6, 0.06],
      [0.565, 0.075],
      [0.53, 0.15],
      [0.49, 0.185],
      [0.42, 0.19],
      [0.32, 0.168],
      [0.2, 0.148],
      [0.1, 0.158],
      [0.02, 0.168],
      [-0.06, 0.155],
      [-0.11, 0.11],
      [-0.135, 0.0],
    ];
    const g = lathe(prof, 18);
    g.scale(1, 1, 0.66);
    g.translate(0, hipY, 0);
    B.add(
      g,
      (p) => {
        const y = p.y - hipY;
        if (y > 0.56) return C.skin; // pescoço
        if (y > 0.52) return C.topDark; // gola
        if (y > 0.11) return shade(C.top, 0.88 + Math.min(0.12, (y - 0.11) * 0.4));
        if (y > 0.075) return C.belt; // cinto
        return C.bottom;
      },
      (p) => {
        const y = p.y - hipY;
        if (y > 0.56) return { a: 'spine', b: 'head', t: smooth(0.56, 0.66, y) };
        return { a: 'pelvis', b: 'spine', t: smooth(0.1, 0.26, y) };
      },
    );
    // fivela do cinto
    B.rigid(new THREE.BoxGeometry(0.05, 0.03, 0.012), 'pelvis', new THREE.Color('#b8a070'), [0, 0.092, 0.108]);
  }

  // ---------- pernas (coxa → joelho → panturrilha → tornozelo)
  for (const side of ['L', 'R'] as const) {
    const hip = `hip${side}` as BoneName;
    const knee = `knee${side}` as BoneName;
    const ankle = `ankle${side}` as BoneName;
    const prof: [number, number][] = [
      [0.05, 0.0],
      [0.03, 0.098],
      [-0.1, 0.098],
      [-0.25, 0.085],
      [-0.38, 0.07],
      [-0.44, 0.066],
      [-0.52, 0.07],
      [-0.6, 0.068],
      [-0.72, 0.054],
      [-0.82, 0.047],
      [-0.86, 0.0],
    ];
    const g = lathe(prof, 12);
    g.translate(BIND[hip].x, BIND[hip].y, BIND[hip].z);
    B.add(
      g,
      (p) => {
        const y = p.y - BIND[hip].y;
        // dobra da calça atrás do joelho um pouco mais escura
        return y < -0.4 && y > -0.48 && p.z < 0 ? shade(C.bottom, 0.82) : C.bottom;
      },
      (p) => {
        const y = p.y - BIND[hip].y;
        if (y > -0.2) return { a: 'pelvis', b: hip, t: smooth(0.04, -0.06, y) };
        if (y > -0.7) return { a: hip, b: knee, t: smooth(-0.37, -0.5, y) };
        return { a: knee, b: ankle, t: smooth(-0.8, -0.86, y) };
      },
    );
    // sapato com bico arredondado e sola
    const shoe = new THREE.CapsuleGeometry(0.052, 0.15, 4, 10).rotateX(Math.PI / 2).scale(1, 0.75, 1);
    B.rigid(shoe, ankle, C.shoes, [0, -0.03, 0.05]);
    B.rigid(new THREE.BoxGeometry(0.105, 0.022, 0.27), ankle, C.sole, [0, -0.072, 0.05]);
  }

  // ---------- braços (ombro → bíceps → cotovelo → antebraço → punho)
  for (const side of ['L', 'R'] as const) {
    const sh = `shoulder${side}` as BoneName;
    const el = `elbow${side}` as BoneName;
    const sx = side === 'L' ? -1 : 1;
    const prof: [number, number][] = [
      [0.06, 0.0],
      [0.035, 0.058],
      [-0.06, 0.056],
      [-0.16, 0.05],
      [-0.27, 0.042],
      [-0.33, 0.043],
      [-0.42, 0.041],
      [-0.5, 0.034],
      [-0.55, 0.03],
      [-0.57, 0.0],
    ];
    const g = lathe(prof, 12);
    g.translate(BIND[sh].x, BIND[sh].y, BIND[sh].z);
    const sleeveEnd = shortSleeves ? -0.2 : -0.5;
    B.add(
      g,
      (p) => {
        const y = p.y - BIND[sh].y;
        if (y < sleeveEnd) return C.skin;
        if (y < sleeveEnd + 0.03) return C.topDark; // punho da manga
        return C.top;
      },
      (p) => {
        const y = p.y - BIND[sh].y;
        if (y > -0.02) return { a: 'spine', b: sh, t: smooth(0.05, -0.02, y) };
        return { a: sh, b: el, t: smooth(-0.24, -0.34, y) };
      },
    );
    // ombro (preenche entre tronco e braço)
    B.add(
      new THREE.SphereGeometry(0.056, 12, 8).scale(1.0, 0.85, 0.85).translate(BIND[sh].x - sx * 0.015, BIND[sh].y + 0.005, 0),
      () => C.top,
      () => ({ a: 'spine', b: sh, t: 0.5 }),
    );
    // mão: palma + dedos juntos + polegar (voltado para frente e para dentro)
    B.rigid(new THREE.SphereGeometry(0.042, 10, 8).scale(0.8, 1.15, 0.55), el, C.skin, [0, -0.3, 0.004]);
    B.rigid(new THREE.CapsuleGeometry(0.026, 0.05, 3, 8).scale(1.3, 1, 0.75), el, C.skin, [0, -0.37, 0.006]);
    B.rigid(new THREE.CapsuleGeometry(0.013, 0.035, 3, 6), el, C.skinDark, [-sx * 0.022, -0.31, 0.026], [0.5, 0, -sx * 0.4]);
  }

  // ---------- cabeça e rosto (relativos ao osso da cabeça)
  const head = 'head' as const;
  B.rigid(new THREE.SphereGeometry(0.115, 20, 16), head, C.skin, [0, 0.165, 0.005], [0, 0, 0], [0.9, 1.04, 1.0]); // crânio
  B.rigid(new THREE.SphereGeometry(0.08, 16, 12), head, C.skin, [0, 0.118, 0.016], [0, 0, 0], [0.84, 0.66, 0.86]); // maxilar/queixo
  B.rigid(new THREE.SphereGeometry(0.019, 8, 6), head, C.skinDark, [0, 0.148, 0.118], [0, 0, 0], [0.9, 1.1, 1.3]); // nariz
  for (const s of [-1, 1]) {
    B.rigid(new THREE.SphereGeometry(0.028, 8, 6), head, C.skinDark, [s * 0.103, 0.158, -0.002], [0, 0, 0], [0.45, 1, 0.75]); // orelha
    B.rigid(new THREE.SphereGeometry(0.019, 10, 8), head, C.white, [s * 0.04, 0.178, 0.097], [0, 0, 0], [1.15, 0.8, 0.6]); // olho
    B.rigid(new THREE.SphereGeometry(0.0105, 8, 6), head, C.iris, [s * 0.04, 0.178, 0.107]); // íris
    B.rigid(new THREE.BoxGeometry(0.038, 0.008, 0.012), head, C.hair, [s * 0.042, 0.205, 0.103], [0, 0, s * -0.12]); // sobrancelha
  }
  B.rigid(new THREE.BoxGeometry(0.034, 0.007, 0.01), head, C.lips, [0, 0.112, 0.1]); // boca

  // ---------- cabelo
  const cap = (r: number, theta: number) => new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, theta);
  if (style === 'curto') {
    B.rigid(cap(0.122, Math.PI / 2.05), head, C.hair, [0, 0.172, -0.006], [-0.18, 0, 0], [0.95, 1.0, 1.04]);
    B.rigid(new THREE.SphereGeometry(0.112, 14, 10), head, C.hair, [0, 0.16, -0.022], [0, 0, 0], [0.93, 0.95, 0.9]); // nuca
  } else if (style === 'longo') {
    B.rigid(cap(0.124, Math.PI / 1.95), head, C.hair, [0, 0.172, -0.004], [-0.15, 0, 0], [0.97, 1.02, 1.05]);
    B.rigid(new THREE.CapsuleGeometry(0.1, 0.12, 4, 12), head, C.hair, [0, 0.08, -0.045], [0, 0, 0], [1.05, 1, 0.55]); // cabelo nas costas
  } else if (style === 'cacheado') {
    B.rigid(new THREE.IcosahedronGeometry(0.138, 1), head, C.hair, [0, 0.2, -0.025], [0, 0, 0], [1.0, 0.86, 0.98]);
  } else {
    B.rigid(cap(0.122, Math.PI / 2.05), head, C.hair, [0, 0.172, -0.006], [-0.18, 0, 0], [0.95, 1.0, 1.04]);
    B.rigid(new THREE.SphereGeometry(0.112, 14, 10), head, C.hair, [0, 0.16, -0.022], [0, 0, 0], [0.93, 0.95, 0.9]);
    B.rigid(new THREE.SphereGeometry(0.05, 10, 8), head, C.hair, [0, 0.25, -0.09]); // coque
  }

  const geo = B.build();
  geoCache.set(skinId, geo);
  return geo;
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
    if (b.parent) list[BI[b.parent]].add(list[i]);
  });
  const rig = Object.fromEntries(BONES.map((b, i) => [b.name, list[i]])) as unknown as Rig;
  return { rig, list };
}
