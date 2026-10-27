/**
 * Vila 3D placeholder (modular). Cada bloco de /shared/src/map.ts vira um placeholder;
 * se existir /client/assets/map/<id>.glb ou <kind>.glb, o modelo final é usado no lugar.
 * As colisões (Rapier no cliente, AABB no servidor) vêm SEMPRE dos dados do mapa.
 * Texturas e geometrias procedurais ficam em ./scenery.ts.
 */
import { Clone, Detailed, Instance, Instances, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  CONFIG,
  DOOR_WIDTH,
  HIDE_SPOTS,
  LAMP_POSITIONS,
  LOCATIONS,
  MAP_BLOCKS,
  MAP_COLLIDERS,
  ROADS,
  WALL_THICKNESS,
  WORLD,
  buildingWalls,
  lampLit,
  type MapBlock,
} from '@nevoeiro/shared';
import { useStore } from '../net/store';
import { net } from '../net/netState';
import type { QualityProfile } from '../quality';
import { THEME } from '../theme';
import { chimneyPos } from './Effects';
import {
  cobbleTex,
  grassMaterial,
  grassTuftGeometry,
  groundDetailTex,
  groundMaterial,
  haloTex,
  mergeGeometries,
  pineCrownGeometry,
  pineCrownMaterial,
  plasterTex,
  shingleTex,
  stoneTex,
  windTime,
  woodTex,
  worldMaterial,
} from './scenery';

const MAP_MODELS = import.meta.glob('/assets/map/*.{glb,gltf}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function mapModel(name: string): string | undefined {
  return Object.entries(MAP_MODELS).find(([k]) => k.endsWith(`/${name}.glb`) || k.endsWith(`/${name}.gltf`))?.[1];
}

function ModelAt({ url, block }: { url: string; block: MapBlock }) {
  const { scene } = useGLTF(url);
  return <Clone object={scene} position={[block.x, 0, block.z]} castShadow receiveShadow />;
}

// ------------------------------------------------------------------ materiais compartilhados

let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  return {
    ground: groundMaterial(),
    cobble: worldMaterial({ map: cobbleTex(), color: '#7d786f', scale: 0.33 }),
    cemetery: worldMaterial({ map: groundDetailTex(), color: '#2b3227', scale: 0.3, roughness: 1 }),
    road: worldMaterial({ map: groundDetailTex(), color: '#5d4f3f', scale: 0.35, roughness: 1 }),
    stone: worldMaterial({ map: stoneTex(), color: '#77736b', scale: 0.5 }),
    darkStone: worldMaterial({ map: stoneTex(), color: '#77746c', scale: 0.6 }),
    wood: worldMaterial({ map: woodTex(), color: '#5a4230', scale: 0.5 }),
    floor: worldMaterial({ map: woodTex(), color: '#4a3726', scale: 0.4 }),
    windowLit: new THREE.MeshStandardMaterial({ color: '#ffd7a0', emissive: THEME.warmLight, emissiveIntensity: 2.4, toneMapped: false }),
    windowDark: new THREE.MeshStandardMaterial({ color: '#0f1418', roughness: 0.2, metalness: 0.4 }),
    windowHalo: new THREE.MeshBasicMaterial({
      map: haloTex(),
      color: THEME.warmLight,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    trunk: worldMaterial({ map: woodTex(), color: '#2e2219', scale: 1.2, roughness: 1 }),
    crown: makeCrownMaterial(),
  };
}
function mats() {
  return (shared ??= makeShared());
}

/** Copas somem (pontilhado) quando a câmera encosta nelas — nada de tela verde. */
function makeCrownMaterial() {
  const m = pineCrownMaterial();
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCamDist = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vCamDist < 3.2) {
          float dith = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
          if (dith < (3.2 - vCamDist) / 1.6) discard;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'crown-dither';
  return m;
}

// ------------------------------------------------------------------ mundo

export function World({ quality, physics = true }: { quality: QualityProfile; physics?: boolean }) {
  const M = mats();
  const blocks = MAP_BLOCKS;
  const byKind = useMemo(() => {
    const m: Record<string, MapBlock[]> = {};
    for (const b of blocks) (m[b.kind] ??= []).push(b);
    return m;
  }, [blocks]);
  useFrame(({ clock }) => {
    windTime.value = clock.elapsedTime;
  });

  return (
    <group>
      {physics && <Colliders />}
      {/* chão com variação de grama, musgo e terra */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={M.ground}>
        <planeGeometry args={[WORLD.half * 2 + 60, WORLD.half * 2 + 60]} />
      </mesh>
      {LOCATIONS.filter((l) => l.id === 'praca' || l.id === 'cemiterio').map((l) => (
        <mesh
          key={l.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[(l.minX + l.maxX) / 2, 0.01, (l.minZ + l.maxZ) / 2]}
          receiveShadow
          material={l.id === 'praca' ? M.cobble : M.cemetery}
        >
          <planeGeometry args={[l.maxX - l.minX, l.maxZ - l.minZ]} />
        </mesh>
      ))}
      {ROADS.map((r, i) => {
        const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
        const ang = Math.atan2(r.x2 - r.x1, r.z2 - r.z1);
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, ang]} position={[(r.x1 + r.x2) / 2, 0.015, (r.z1 + r.z2) / 2]} receiveShadow material={M.road}>
            <planeGeometry args={[r.w, len]} />
          </mesh>
        );
      })}

      {byKind.building?.map((b) => {
        const url = mapModel(b.id);
        return url ? <ModelAt key={b.id} url={url} block={b} /> : <Building key={b.id} b={b} />;
      })}
      {byKind.wall?.map((b) => (
        <InnerWall key={b.id} b={b} />
      ))}

      <Trees blocks={byKind.tree ?? []} detail={quality.treeDetail} shadows={quality.shadows} />
      {quality.grass > 0 && <Grass count={quality.grass} />}
      <Graves blocks={byKind.grave ?? []} />
      <SimpleBoxes blocks={byKind.rock ?? []} color="#6a6e6c" geometry="dodeca" />
      <SimpleBoxes blocks={byKind.pew ?? []} color="#8a6444" tex="wood" />
      <SimpleBoxes blocks={byKind.table ?? []} color="#9a724c" tex="wood" />
      <SimpleBoxes blocks={byKind.counter ?? []} color="#8a5e3a" tex="wood" />
      <SimpleBoxes blocks={byKind.desk ?? []} color="#7a6a5a" tex="wood" />
      <SimpleBoxes blocks={byKind.hay ?? []} color="#c4a554" />
      <SimpleBoxes blocks={byKind.cart ?? []} color="#9a6e44" tex="wood" />
      <SimpleBoxes blocks={byKind.bed ?? []} color="#6b3a3a" />
      <SimpleBoxes blocks={byKind.sofa ?? []} color="#3b2e45" />
      <SimpleBoxes blocks={byKind.altar ?? []} color="#cfc8b8" tex="stone" />
      <SimpleBoxes blocks={byKind.bench ?? []} color="#94704e" tex="wood" />
      <SimpleBoxes blocks={byKind.crypt ?? []} color="#7a7a76" tex="stone" />
      <SimpleBoxes blocks={byKind.wardrobe ?? []} color="#86603c" tex="wood" />
      <HideSpotVisuals />
      <Fences blocks={byKind.fence ?? []} />
      <Bars blocks={byKind.bars ?? []} />
      {byKind.fountain?.map((b) => <Fountain key={b.id} b={b} />)}
      {byKind.well?.map((b) => <Well key={b.id} b={b} />)}
      <Lamps cones={!quality.lite} />
      <WarmLights count={quality.pointLights} />
    </group>
  );
}

/** Colisores estáticos do Rapier — exatamente os mesmos AABBs que o servidor usa. */
function Colliders() {
  return (
    <RigidBody type="fixed" colliders={false} userData={{ static: true }}>
      {MAP_COLLIDERS.map((c, i) => (
        <CuboidCollider
          key={i}
          args={[(c.maxX - c.minX) / 2, c.h / 2, (c.maxZ - c.minZ) / 2]}
          position={[(c.minX + c.maxX) / 2, c.h / 2, (c.minZ + c.maxZ) / 2]}
        />
      ))}
      <CuboidCollider args={[WORLD.half + 30, 0.5, WORLD.half + 30]} position={[0, -0.5, 0]} />
    </RigidBody>
  );
}

function InnerWall({ b }: { b: MapBlock }) {
  const mat = useMemo(() => worldMaterial({ map: plasterTex(), color: b.color ?? '#555', scale: 0.25 }), [b.color]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh position={[b.x, b.h / 2, b.z]} castShadow receiveShadow material={mat}>
      <boxGeometry args={[b.w, b.h, b.d]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ construções

interface WindowSpot {
  x: number;
  z: number;
  y: number;
  ry: number;
  lit: boolean;
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Peças extras de uma casa (coordenadas do mundo), mescladas por material. */
function buildingDetail(b: MapBlock, windows: WindowSpot[]) {
  const walls = buildingWalls(b);
  const wood: THREE.BufferGeometry[] = [];
  const stone: THREE.BufferGeometry[] = [];
  const header: THREE.BufferGeometry[] = [];
  const hw = b.w / 2;
  const hd = b.d / 2;
  const church = !!b.tower;
  // alicerce de pedra seguindo as paredes (respeita o vão da porta)
  for (const w of walls) stone.push(boxAt(w.w + 0.16, 0.62, w.d + 0.16, w.x, 0.31, w.z));
  if (!church) {
    // enxaimel: postes nos cantos e vigas em volta
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(boxAt(0.28, b.h, 0.28, b.x + sx * hw, b.h / 2, b.z + sz * hd));
    for (const y of [Math.max(3.0, b.h * 0.55), b.h - 0.12]) {
      wood.push(boxAt(b.w + 0.12, 0.2, 0.12, b.x, y, b.z - hd - 0.03));
      wood.push(boxAt(b.w + 0.12, 0.2, 0.12, b.x, y, b.z + hd + 0.03));
      wood.push(boxAt(0.12, 0.2, b.d + 0.12, b.x - hw - 0.03, y, b.z));
      wood.push(boxAt(0.12, 0.2, b.d + 0.12, b.x + hw + 0.03, y, b.z));
    }
  } else {
    // igreja de pedra: contrafortes nas laterais
    for (let k = -2; k <= 2; k++) for (const sx of [-1, 1]) stone.push(boxAt(0.7, b.h * 0.75, 1, b.x + sx * (hw + 0.3), b.h * 0.375, b.z + k * (b.d / 5)));
  }
  // porta: parede acima do vão, batentes e verga
  if (b.door) {
    const t = WALL_THICKNESS;
    const horizontal = b.door === 'n' || b.door === 's';
    const cx = b.door === 'e' ? b.x + hw - t / 2 : b.door === 'w' ? b.x - hw + t / 2 : b.x;
    const cz = b.door === 's' ? b.z + hd - t / 2 : b.door === 'n' ? b.z - hd + t / 2 : b.z;
    const top = 2.75;
    if (b.h > top) header.push(boxAt(horizontal ? DOOR_WIDTH : t, b.h - top, horizontal ? t : DOOR_WIDTH, cx, top + (b.h - top) / 2, cz));
    for (const s of [-1, 1]) {
      const ox = horizontal ? s * (DOOR_WIDTH / 2 - 0.06) : 0;
      const oz = horizontal ? 0 : s * (DOOR_WIDTH / 2 - 0.06);
      wood.push(boxAt(horizontal ? 0.16 : t + 0.14, top, horizontal ? t + 0.14 : 0.16, cx + ox, top / 2, cz + oz));
    }
    wood.push(boxAt(horizontal ? DOOR_WIDTH + 0.3 : t + 0.16, 0.22, horizontal ? t + 0.16 : DOOR_WIDTH + 0.3, cx, top, cz));
  }
  // molduras das janelas (com cruz e peitoril)
  for (const w of windows) {
    const parts = [
      boxAt(1.2, 0.1, 0.1, 0, 0.6, 0),
      boxAt(1.36, 0.1, 0.22, 0, -0.6, 0.05),
      boxAt(0.1, 1.2, 0.1, -0.55, 0, 0),
      boxAt(0.1, 1.2, 0.1, 0.55, 0, 0),
      boxAt(0.06, 1.1, 0.06, 0, 0, 0.02),
      boxAt(1.0, 0.06, 0.06, 0, 0.05, 0.02),
    ];
    for (const p of parts) {
      p.rotateY(w.ry);
      p.translate(w.x, w.y, w.z);
      wood.push(p);
    }
  }
  const merge = (list: THREE.BufferGeometry[]) => {
    if (!list.length) return null;
    const m = mergeGeometries(list.map((g) => g.toNonIndexed()));
    list.forEach((g) => g.dispose());
    return m;
  };
  return { wood: merge(wood), stone: merge(stone), header: merge(header) };
}

function Building({ b }: { b: MapBlock }) {
  const M = mats();
  const walls = useMemo(() => buildingWalls(b), [b]);
  const roof = useRef<THREE.Group>(null);
  const church = !!b.tower;
  const wallMat = useMemo(
    () => (church ? worldMaterial({ map: stoneTex(), color: b.color ?? '#5a5550', scale: 0.5 }) : worldMaterial({ map: plasterTex(), color: b.color ?? '#5a5550', scale: 0.25 })),
    [b.color, church],
  );
  const roofMat = useMemo(() => worldMaterial({ map: shingleTex(), color: b.roofColor ?? '#2a2522', scale: 0.5, roof: true, roughness: 0.85 }), [b.roofColor]);
  useEffect(() => () => {
    wallMat.dispose();
    roofMat.dispose();
  }, [wallMat, roofMat]);
  const windows = useMemo(() => {
    // janelas: algumas acesas (luz quente), outras escuras
    const out: WindowSpot[] = [];
    const seed = b.x * 13.7 + b.z * 7.1;
    const y = Math.min(2.2, b.h * 0.45) + 0.1;
    const sides: [number, number, number, number][] = [
      [b.x, b.z - b.d / 2 - 0.02, Math.PI, b.w],
      [b.x, b.z + b.d / 2 + 0.02, 0, b.w],
      [b.x + b.w / 2 + 0.02, b.z, Math.PI / 2, b.d],
      [b.x - b.w / 2 - 0.02, b.z, -Math.PI / 2, b.d],
    ];
    const doorSide = { n: 0, s: 1, e: 2, w: 3 }[b.door ?? 'n'];
    sides.forEach(([cx, cz, ry, len], si) => {
      const count = Math.max(1, Math.floor(len / 5));
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * (len / count);
        if (si === doorSide && Math.abs(off) < 2.2) continue; // não cobre a porta
        const horizontal = si < 2;
        out.push({ x: horizontal ? cx + off : cx, z: horizontal ? cz : cz + off, y, ry, lit: Math.sin(seed + i * 3.1 + si) > 0.1 });
      }
    });
    return out;
  }, [b]);
  const detail = useMemo(() => buildingDetail(b, windows), [b, windows]);
  // janelas e halos mesclados por casa (poucas chamadas de desenho)
  const glass = useMemo(() => {
    const place = (src: THREE.BufferGeometry, list: WindowSpot[], dz = 0) => {
      if (!list.length) return null;
      const parts = list.map((w) => src.clone().translate(0, 0, dz).rotateY(w.ry).translate(w.x, w.y, w.z));
      const g = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      return g;
    };
    const lit = windows.filter((w) => w.lit);
    return { lit: place(WINDOW_GEO, lit), dark: place(WINDOW_GEO, windows.filter((w) => !w.lit)), halo: place(HALO_GEO, lit, 0.12) };
  }, [windows]);
  useEffect(() => () => {
    detail.wood?.dispose();
    detail.stone?.dispose();
    detail.header?.dispose();
    glass.lit?.dispose();
    glass.dark?.dispose();
    glass.halo?.dispose();
  }, [detail, glass]);

  useFrame(() => {
    if (!roof.current) return;
    const inside = Math.abs(net.local.x - b.x) < b.w / 2 + 0.3 && Math.abs(net.local.z - b.z) < b.d / 2 + 0.3;
    roof.current.visible = !inside;
  });

  const roofH = Math.min(b.w, b.d) * 0.45;
  const horizontalRidge = b.w >= b.d;
  const chimney = b.chimney ? chimneyPos(b) : null;
  const roofScale: [number, number, number] = [horizontalRidge ? b.w + 0.7 : b.d + 0.7, roofH, (horizontalRidge ? b.d : b.w) + 1.0];
  return (
    <Detailed distances={[0, CONFIG.graphics.lodDistance]} position={[b.x, 0, b.z]}>
      <group position={[-b.x, 0, -b.z]}>
        {walls.map((w, i) => (
          <mesh key={i} position={[w.x, w.h / 2, w.z]} material={wallMat} castShadow receiveShadow>
            <boxGeometry args={[w.w, w.h, w.d]} />
          </mesh>
        ))}
        {detail.header && <mesh geometry={detail.header} material={wallMat} castShadow receiveShadow />}
        {detail.wood && <mesh geometry={detail.wood} material={M.wood} castShadow receiveShadow />}
        {detail.stone && <mesh geometry={detail.stone} material={M.stone} castShadow receiveShadow />}
        {/* piso interno de tábuas */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.x, 0.02, b.z]} receiveShadow material={M.floor}>
          <planeGeometry args={[b.w - 0.4, b.d - 0.4]} />
        </mesh>
        {/* telhado de duas águas com cumeeira */}
        <group ref={roof} position={[b.x, b.h, b.z]} rotation={[0, horizontalRidge ? 0 : Math.PI / 2, 0]}>
          <mesh material={roofMat} castShadow scale={roofScale} geometry={ROOF_GEO} />
          <mesh material={M.wood} position={[0, roofH + 0.02, 0]} castShadow>
            <boxGeometry args={[roofScale[0] + 0.1, 0.16, 0.22]} />
          </mesh>
        </group>
        {glass.lit && <mesh geometry={glass.lit} material={M.windowLit} />}
        {glass.dark && <mesh geometry={glass.dark} material={M.windowDark} />}
        {glass.halo && <mesh geometry={glass.halo} material={M.windowHalo} renderOrder={7} />}
        {b.tower && <ChurchTower b={b} wallMat={wallMat} roofMat={roofMat} />}
        {chimney && (
          <mesh position={[chimney.x, chimney.y - 1, chimney.z]} material={M.stone} castShadow>
            <boxGeometry args={[0.8, 2, 0.8]} />
          </mesh>
        )}
      </group>
      {/* versão simplificada para longe (LOD) */}
      <group position={[-b.x, 0, -b.z]}>
        <mesh position={[b.x, b.h / 2, b.z]} material={wallMat}>
          <boxGeometry args={[b.w, b.h, b.d]} />
        </mesh>
        <group position={[b.x, b.h, b.z]} rotation={[0, horizontalRidge ? 0 : Math.PI / 2, 0]}>
          <mesh material={roofMat} scale={roofScale} geometry={ROOF_GEO} />
        </group>
        {glass.lit && <mesh geometry={glass.lit} material={M.windowLit} />}
        {b.tower && <ChurchTower b={b} wallMat={wallMat} roofMat={roofMat} />}
      </group>
    </Detailed>
  );
}

const WINDOW_GEO = new THREE.PlaneGeometry(1.05, 1.15);
const HALO_GEO = new THREE.PlaneGeometry(3.2, 3.2);

/** Prisma triangular unitário (telhado). */
const ROOF_GEO = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
})();

function ChurchTower({ b, wallMat, roofMat }: { b: MapBlock; wallMat: THREE.Material; roofMat: THREE.Material }) {
  const z = b.z - b.d / 2 + 2.5;
  return (
    <group position={[b.x, 0, z]}>
      <mesh position={[0, b.h + 4, 0]} castShadow material={wallMat}>
        <boxGeometry args={[4, 8, 4]} />
      </mesh>
      {/* arcos do campanário (aberturas escuras) */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((r) => (
        <mesh key={r} position={[Math.sin(r) * 2.01, b.h + 6.3, Math.cos(r) * 2.01]} rotation={[0, r, 0]}>
          <planeGeometry args={[1.3, 2.2]} />
          <meshStandardMaterial color="#07080b" />
        </mesh>
      ))}
      <mesh position={[0, b.h + 10.5, 0]} castShadow material={roofMat}>
        <coneGeometry args={[3.1, 5, 4]} />
      </mesh>
      <mesh position={[0, b.h + 3.6, 2.02]}>
        <circleGeometry args={[0.9, 24]} />
        <meshStandardMaterial color="#d8d0b0" emissive="#806a40" emissiveIntensity={0.6} />
      </mesh>
      <group position={[0, b.h + 14, 0]}>
        <mesh>
          <boxGeometry args={[0.18, 1.8, 0.18]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[1, 0.18, 0.18]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ árvores

/**
 * Pinheiros com instancing, divididos em blocos de 56 m: cada bloco tem a própria
 * esfera de culling e some além de CONFIG.graphics.cullDistance.
 */
function Trees({ blocks, detail, shadows }: { blocks: MapBlock[]; detail: number; shadows: boolean }) {
  const chunks = useMemo(() => {
    const m = new Map<string, MapBlock[]>();
    for (const b of blocks) {
      const key = `${Math.floor(b.x / 56)}:${Math.floor(b.z / 56)}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(b);
    }
    return [...m.values()];
  }, [blocks]);
  const geos = useMemo(
    () => ({
      trunk: new THREE.CylinderGeometry(0.1, 0.24, 1, 7).translate(0, 0.5, 0),
      crown: pineCrownGeometry(detail),
    }),
    [detail],
  );
  useEffect(() => () => {
    geos.trunk.dispose();
    geos.crown.dispose();
  }, [geos]);
  if (!blocks.length) return null;
  const url = mapModel('tree');
  if (url) return <>{blocks.map((b) => <ModelAt key={b.id} url={url} block={b} />)}</>;
  return (
    <group>
      {chunks.map((c, i) => (
        <TreeChunk key={i} trees={c} geos={geos} shadows={shadows} />
      ))}
    </group>
  );
}

function TreeChunk({ trees, geos, shadows }: { trees: MapBlock[]; geos: { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry }; shadows: boolean }) {
  const M = mats();
  const trunk = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const center = useMemo(() => {
    const x = trees.reduce((a, t) => a + t.x, 0) / trees.length;
    const z = trees.reduce((a, t) => a + t.z, 0) / trees.length;
    return new THREE.Vector3(x, 0, z);
  }, [trees]);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    const shade = new THREE.Color();
    trees.forEach((b, i) => {
      const k = Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233)); // variação estável por árvore
      d.position.set(b.x, 0, b.z);
      d.rotation.set(0, k * 6.28, 0);
      d.scale.set(1 + k * 0.4, b.h * 0.62, 1 + k * 0.4);
      d.updateMatrix();
      trunk.current!.setMatrixAt(i, d.matrix);
      const wide = b.h * (0.92 + k * 0.3);
      d.scale.set(wide, b.h, wide);
      d.updateMatrix();
      crown.current!.setMatrixAt(i, d.matrix);
      crown.current!.setColorAt(i, shade.setHSL(0.36 + k * 0.05, 0.25 + k * 0.15, 0.62 + k * 0.3));
    });
    for (const m of [trunk.current!, crown.current!]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere(); // frustum culling correto por bloco
    }
  }, [trees]);
  useFrame(({ camera }) => {
    if (group.current) group.current.visible = camera.position.distanceTo(center) < CONFIG.graphics.cullDistance + 25;
  });
  return (
    <group ref={group}>
      <instancedMesh ref={trunk} args={[geos.trunk, M.trunk, trees.length]} castShadow={shadows} receiveShadow />
      <instancedMesh ref={crown} args={[geos.crown, M.crown, trees.length]} castShadow={shadows} receiveShadow />
    </group>
  );
}

// ------------------------------------------------------------------ grama

const GRASS_CHUNK = 24;

/** Tufos de grama com vento, em blocos que somem de longe. Evitam casas, estradas e a praça. */
function Grass({ count }: { count: number }) {
  const chunks = useMemo(() => {
    let s = 4242;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const blocked = (x: number, z: number) => {
      if (Math.abs(x) < 16 && Math.abs(z) < 16) return true; // praça calçada
      for (const c of MAP_COLLIDERS) if (x > c.minX - 0.4 && x < c.maxX + 0.4 && z > c.minZ - 0.4 && z < c.maxZ + 0.4) return true;
      for (const b of MAP_BLOCKS) if (b.kind === 'building' && Math.abs(x - b.x) < b.w / 2 + 0.6 && Math.abs(z - b.z) < b.d / 2 + 0.6) return true;
      for (const rd of ROADS) {
        const dx = rd.x2 - rd.x1;
        const dz = rd.z2 - rd.z1;
        const len2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - rd.x1) * dx + (z - rd.z1) * dz) / len2));
        if (Math.hypot(x - (rd.x1 + dx * t), z - (rd.z1 + dz * t)) < rd.w / 2 + 0.3) return true;
      }
      return false;
    };
    const map = new Map<string, { x: number; z: number; s: number; h: number; k: number }[]>();
    const lim = WORLD.walkHalf;
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 6) {
      // aglomerados: tufos nascem em grupos
      const cx = (r() * 2 - 1) * lim;
      const cz = (r() * 2 - 1) * lim;
      const n = 3 + Math.floor(r() * 6);
      for (let i = 0; i < n && placed < count; i++) {
        const x = cx + (r() - 0.5) * 3;
        const z = cz + (r() - 0.5) * 3;
        if (blocked(x, z)) continue;
        const key = `${Math.floor(x / GRASS_CHUNK)}:${Math.floor(z / GRASS_CHUNK)}`;
        (map.get(key) ?? map.set(key, []).get(key)!).push({ x, z, s: 0.45 + r() * 0.5, h: 0.22 + r() * 0.32, k: r() });
        placed++;
      }
    }
    return [...map.values()];
  }, [count]);
  const geo = useMemo(grassTuftGeometry, []);
  const mat = useMemo(grassMaterial, []);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  return (
    <group>
      {chunks.map((c, i) => (
        <GrassChunk key={i} tufts={c} geo={geo} mat={mat} />
      ))}
    </group>
  );
}

function GrassChunk({ tufts, geo, mat }: { tufts: { x: number; z: number; s: number; h: number; k: number }[]; geo: THREE.BufferGeometry; mat: THREE.Material }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const center = useMemo(() => new THREE.Vector3(tufts.reduce((a, t) => a + t.x, 0) / tufts.length, 0, tufts.reduce((a, t) => a + t.z, 0) / tufts.length), [tufts]);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    tufts.forEach((t, i) => {
      d.position.set(t.x, 0, t.z);
      d.rotation.set(0, t.k * 6.28, 0);
      d.scale.set(t.s, t.h, t.s);
      d.updateMatrix();
      mesh.current!.setMatrixAt(i, d.matrix);
      // verde escuro a palha seca
      mesh.current!.setColorAt(i, c.setRGB(0.2 + t.k * 0.16, 0.27 + t.k * 0.08, 0.16));
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
  }, [tufts]);
  useFrame(({ camera }) => {
    if (mesh.current) mesh.current.visible = camera.position.distanceTo(center) < 52;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, tufts.length]} receiveShadow />;
}

// ------------------------------------------------------------------ objetos

function Graves({ blocks }: { blocks: MapBlock[] }) {
  const M = mats();
  if (!blocks.length) return null;
  return (
    <group>
      <Instances limit={blocks.length} castShadow receiveShadow material={M.darkStone}>
        <boxGeometry args={[1, 1, 1]} />
        {blocks.map((b) => (
          <Instance key={b.id} position={[b.x, b.h / 2, b.z]} scale={[b.w, b.h, b.d]} />
        ))}
      </Instances>
      <Instances limit={blocks.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1f261f" roughness={1} />
        {blocks.map((b) => (
          <Instance key={b.id} position={[b.x, 0.04, b.z + 0.9]} scale={[0.8, 0.08, 1.6]} />
        ))}
      </Instances>
    </group>
  );
}

function SimpleBoxes({ blocks, color, geometry = 'box', tex }: { blocks: MapBlock[]; color: string; geometry?: 'box' | 'dodeca'; tex?: 'wood' | 'stone' }) {
  const mat = useMemo(() => {
    if (tex === 'wood') return worldMaterial({ map: woodTex(), color, scale: 0.8 });
    if (tex === 'stone') return worldMaterial({ map: stoneTex(), color, scale: 0.6 });
    return new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: geometry !== 'box' });
  }, [color, tex, geometry]);
  useEffect(() => () => mat.dispose(), [mat]);
  if (!blocks.length) return null;
  const url = mapModel(blocks[0].kind);
  if (url) return <>{blocks.map((b) => <ModelAt key={b.id} url={url} block={b} />)}</>;
  return (
    <Instances limit={blocks.length} castShadow receiveShadow material={mat}>
      {geometry === 'box' ? <boxGeometry args={[1, 1, 1]} /> : <dodecahedronGeometry args={[0.6, 0]} />}
      {blocks.map((b) => (
        <Instance key={b.id} position={[b.x, b.h / 2, b.z]} scale={[b.w, b.h, b.d]} />
      ))}
    </Instances>
  );
}

function Fences({ blocks }: { blocks: MapBlock[] }) {
  // estacas de ferro ao longo de cada segmento
  const posts = useMemo(() => {
    const out: [number, number][] = [];
    for (const b of blocks) {
      const horizontal = b.w > b.d;
      const len = horizontal ? b.w : b.d;
      const n = Math.floor(len / 0.6);
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (i * len) / n;
        out.push(horizontal ? [b.x + t, b.z] : [b.x, b.z + t]);
      }
    }
    return out;
  }, [blocks]);
  return (
    <group>
      <Instances limit={posts.length}>
        <boxGeometry args={[0.06, 1.25, 0.06]} />
        <meshStandardMaterial color="#121414" metalness={0.6} roughness={0.5} />
        {posts.map(([x, z], i) => (
          <Instance key={i} position={[x, 0.62, z]} />
        ))}
      </Instances>
      {/* pontas de lança */}
      <Instances limit={posts.length}>
        <coneGeometry args={[0.05, 0.16, 4]} />
        <meshStandardMaterial color="#121414" metalness={0.6} roughness={0.5} />
        {posts.map(([x, z], i) => (
          <Instance key={i} position={[x, 1.32, z]} />
        ))}
      </Instances>
      {blocks.map((b) => (
        <mesh key={b.id} position={[b.x, 1.05, b.z]}>
          <boxGeometry args={[Math.max(b.w, 0.05), 0.05, Math.max(b.d, 0.05)]} />
          <meshStandardMaterial color="#121414" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Bars({ blocks }: { blocks: MapBlock[] }) {
  return (
    <group>
      {blocks.map((b) => (
        <group key={b.id}>
          {Array.from({ length: Math.floor(b.d / 0.3) }, (_, i) => (
            <mesh key={i} position={[b.x, b.h / 2, b.z - b.d / 2 + i * 0.3 + 0.15]}>
              <cylinderGeometry args={[0.03, 0.03, b.h, 6]} />
              <meshStandardMaterial color="#222" metalness={0.8} roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Fountain({ b }: { b: MapBlock }) {
  const M = mats();
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) (water.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + Math.sin(clock.elapsedTime * 1.5) * 0.08;
  });
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow material={M.stone}>
        <cylinderGeometry args={[2.1, 2.3, 0.8, 24]} />
      </mesh>
      <mesh ref={water} position={[0, 0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.85, 24]} />
        <meshStandardMaterial color="#0e2a30" emissive="#1a5560" emissiveIntensity={0.3} roughness={0.08} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow material={M.stone}>
        <cylinderGeometry args={[0.25, 0.4, 1.6, 12]} />
      </mesh>
      <mesh position={[0, 2.25, 0]} castShadow material={M.stone}>
        <cylinderGeometry args={[0.8, 0.5, 0.25, 16]} />
      </mesh>
    </group>
  );
}

function Well({ b }: { b: MapBlock }) {
  const M = mats();
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, 0.5, 0]} castShadow material={M.stone}>
        <cylinderGeometry args={[0.9, 0.95, 1, 14]} />
      </mesh>
      <mesh position={[0, 1.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.72, 14]} />
        <meshStandardMaterial color="#05070a" />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 1.4, 0]} castShadow material={M.wood}>
          <boxGeometry args={[0.12, 1.8, 0.12]} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, 0]} rotation={[0, 0, Math.PI / 2]} material={M.wood}>
        <cylinderGeometry args={[0.07, 0.07, 1.7, 8]} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow material={M.wood}>
        <coneGeometry args={[1.3, 0.8, 4]} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ luzes e lampiões

const flameMat = new THREE.MeshStandardMaterial({ color: '#FFD9A0', emissive: THEME.warmLight, emissiveIntensity: 2.6, toneMapped: false });
const deadFlameMat = new THREE.MeshStandardMaterial({ color: '#20242a', roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.85 });
const lampPostMat = new THREE.MeshStandardMaterial({ color: '#141515', metalness: 0.5, roughness: 0.6 });
const lampHaloMat = new THREE.SpriteMaterial({ map: null, color: THEME.warmLight, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });

const CONE_VERT = /* glsl */ `
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  vH = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const CONE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  float edge = pow(abs(dot(vN, vV)), 1.5);
  float a = vH * vH * edge * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const lampConeMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(THEME.warmLight) }, uOpacity: { value: 0.14 } },
  vertexShader: CONE_VERT,
  fragmentShader: CONE_FRAG,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
const LAMP_CONE_GEO = new THREE.CylinderGeometry(0.2, 2.4, 4, 20, 1, true).translate(0, 2, 0);

/** Bits dos lampiões acesos (os das tarefas começam apagados). */
function useLampMask(): number {
  return useStore((s) => s.counts?.lamps ?? 0);
}

/** Lampiões: poste, lanterna com vidro aceso, halo na névoa e cone de luz. Apagados até a tarefa. */
function Lamps({ cones }: { cones: boolean }) {
  const mask = useLampMask();
  useMemo(() => {
    lampHaloMat.map = haloTex();
    lampHaloMat.needsUpdate = true;
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flameMat.emissiveIntensity = 2.3 + Math.sin(t * 13) * 0.25 + Math.sin(t * 29.7) * 0.15;
    lampHaloMat.opacity = 0.5 + Math.sin(t * 11) * 0.03;
  });
  return (
    <group>
      {LAMP_POSITIONS.map(([x, z], i) => {
        const lit = lampLit(mask, i);
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.2, 0]} castShadow material={lampPostMat}>
              <cylinderGeometry args={[0.16, 0.2, 0.4, 8]} />
            </mesh>
            <mesh position={[0, 2.1, 0]} castShadow material={lampPostMat}>
              <cylinderGeometry args={[0.055, 0.085, 4.2, 8]} />
            </mesh>
            {/* lanterna: vidro, telhadinho e base */}
            <mesh position={[0, 4.25, 0]} material={lit ? flameMat : deadFlameMat}>
              <boxGeometry args={[0.28, 0.4, 0.28]} />
            </mesh>
            <mesh position={[0, 4.55, 0]} material={lampPostMat} castShadow>
              <coneGeometry args={[0.26, 0.24, 4]} />
            </mesh>
            <mesh position={[0, 4.03, 0]} material={lampPostMat}>
              <boxGeometry args={[0.34, 0.06, 0.34]} />
            </mesh>
            {lit && (
              <>
                <sprite material={lampHaloMat} position={[0, 4.25, 0]} scale={[3.4, 3.4, 1]} renderOrder={8} />
                {cones && <mesh geometry={LAMP_CONE_GEO} material={lampConeMat} position={[0, 0.05, 0]} renderOrder={7} />}
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Luzes quentes pontuais: um número fixo (por qualidade) que é reposicionado nos lampiões
 * acesos e janelas mais próximos do jogador. Sem sombras (desempenho) e sem mudar a contagem
 * de luzes da cena (não recompila shaders).
 */
function WarmLights({ count }: { count: number }) {
  const lights = useRef<THREE.PointLight[]>([]);
  const timer = useRef(0);
  const mask = useLampMask();
  const spots = useMemo(() => {
    const list: { x: number; y: number; z: number; power: number }[] = LAMP_POSITIONS.flatMap(([x, z], i) =>
      lampLit(mask, i) ? [{ x, y: 4, z, power: 1 }] : [],
    );
    for (const b of MAP_BLOCKS) if (b.kind === 'building') list.push({ x: b.x, y: 2.2, z: b.z, power: 0.8 });
    return list;
  }, [mask]);
  useEffect(() => {
    timer.current = 0; // reavalia na hora (lampião acabou de acender)
  }, [spots]);
  const assigned = useRef<number[]>([]);
  useFrame(({ clock }, dt) => {
    timer.current -= dt;
    if (timer.current <= 0) {
      timer.current = 0.5;
      assigned.current = spots
        .map((s, i) => ({ i, d: Math.hypot(s.x - net.local.x, s.z - net.local.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map((s) => s.i);
    }
    const t = clock.elapsedTime;
    lights.current.forEach((l, k) => {
      const idx = assigned.current[k];
      const s = idx === undefined ? undefined : spots[idx];
      if (!l) return;
      if (!s) {
        l.intensity = 0;
        return;
      }
      l.position.set(s.x, s.y, s.z);
      const flicker = 1 + Math.sin(t * 11 + k * 3) * 0.06 + Math.sin(t * 23 + k) * 0.04;
      l.intensity = 16 * s.power * flicker;
    });
  });
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <pointLight key={i} ref={(l) => { if (l) lights.current[i] = l; }} color={THEME.warmLight} intensity={0} distance={15} decay={1.8} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ esconderijos

const bushMat = new THREE.MeshStandardMaterial({ color: '#1C3A24', roughness: 1, flatShading: true });
const hayMat = new THREE.MeshStandardMaterial({ color: '#9C8236', roughness: 1, flatShading: true });
const bushGeo = new THREE.IcosahedronGeometry(1, 1);

/** Arbustos altos e montes de feno (dá para entrar). Os armários vêm dos blocos 'wardrobe'. */
function HideSpotVisuals() {
  return (
    <group>
      {HIDE_SPOTS.filter((h) => h.kind !== 'wardrobe').map((h) => {
        const mat = h.kind === 'bush' ? bushMat : hayMat;
        const parts = h.kind === 'bush'
          ? [[0, 1.1, 0, 1.15], [0.6, 0.8, 0.3, 0.8], [-0.55, 0.75, -0.3, 0.8], [0.1, 1.8, -0.1, 0.75]]
          : [[0, 0.7, 0, 1.25], [0.4, 0.5, 0.5, 0.8], [-0.5, 0.45, -0.3, 0.75]];
        return (
          <group key={h.id} position={[h.x, 0, h.z]}>
            {parts.map(([x, y, z, sc], i) => (
              <mesh key={i} geometry={bushGeo} material={mat} position={[x, y, z]} scale={[sc * h.r, sc * (h.kind === 'bush' ? 1.25 : 0.7), sc * h.r]} castShadow />
            ))}
          </group>
        );
      })}
    </group>
  );
}
