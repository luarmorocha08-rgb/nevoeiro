/**
 * Mapa modular da vila. Cada bloco é um "slot" com posição, tamanho e tipo.
 * - O SERVIDOR usa os blocos só para colisão e linha de visão (AABBs alinhados aos eixos).
 * - O CLIENTE renderiza um placeholder por tipo, ou /client/assets/map/<id>.glb ou <kind>.glb se existir.
 * Para trocar o cenário final, mantenha os mesmos ids/posições (ou edite este arquivo):
 * colisões e lógica continuam funcionando.
 */
import { mulberry32 } from './random';

export type Side = 'n' | 's' | 'e' | 'w';

export type LocationId =
  | 'praca'
  | 'igreja'
  | 'taverna'
  | 'cemiterio'
  | 'floresta'
  | 'delegacia'
  | 'celeiro'
  | 'casarao';

export interface MapLocation {
  id: LocationId;
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Cor no minimapa. */
  color: string;
}

export const LOCATIONS: MapLocation[] = [
  { id: 'praca', name: 'Praça central', minX: -15, maxX: 15, minZ: -15, maxZ: 15, color: '#3c4a4f' },
  { id: 'igreja', name: 'Igreja', minX: -10, maxX: 10, minZ: -64, maxZ: -33, color: '#4a4552' },
  { id: 'cemiterio', name: 'Cemitério', minX: -50, maxX: -13, minZ: -63, maxZ: -29, color: '#363d3a' },
  { id: 'taverna', name: 'Taverna', minX: 22, maxX: 45, minZ: -19, maxZ: 3, color: '#4f4234' },
  { id: 'delegacia', name: 'Delegacia', minX: -42, maxX: -20, minZ: -17, maxZ: 5, color: '#33414f' },
  { id: 'floresta', name: 'Floresta', minX: -80, maxX: -40, minZ: 8, maxZ: 80, color: '#1f3326' },
  { id: 'celeiro', name: 'Celeiro', minX: 32, maxX: 64, minZ: 26, maxZ: 62, color: '#4f3328' },
  { id: 'casarao', name: 'Casarão', minX: -13, maxX: 22, minZ: 38, maxZ: 66, color: '#433a4a' },
];

export const FALLBACK_LOCATION_NAME = 'Estradas da vila';

export const WORLD = {
  half: 80,
  /** Limite onde jogadores podem andar. */
  walkHalf: 77,
};

export type BlockKind =
  | 'building'
  | 'wall'
  | 'tree'
  | 'grave'
  | 'crypt'
  | 'fence'
  | 'fountain'
  | 'bench'
  | 'lamp'
  | 'hay'
  | 'pew'
  | 'altar'
  | 'table'
  | 'counter'
  | 'desk'
  | 'bars'
  | 'cart'
  | 'rock'
  | 'bed'
  | 'sofa'
  | 'well';

export interface MapBlock {
  id: string;
  kind: BlockKind;
  x: number;
  z: number;
  /** Tamanho em X. */
  w: number;
  /** Tamanho em Z. */
  d: number;
  /** Altura. Obstáculos com h >= LOS_MIN_HEIGHT bloqueiam a linha de visão (tiro, algema...). */
  h: number;
  collide: boolean;
  door?: Side;
  location?: LocationId;
  label?: string;
  color?: string;
  roofColor?: string;
  tower?: boolean;
}

/** Retângulo de colisão alinhado aos eixos. */
export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
}

export const LOS_MIN_HEIGHT = 1.5;
export const WALL_THICKNESS = 0.4;
export const DOOR_WIDTH = 2.6;

// ---------------------------------------------------------------------------
// Construção dos blocos
// ---------------------------------------------------------------------------

const blocks: MapBlock[] = [];
let autoId = 0;
function add(b: Omit<MapBlock, 'id'> & { id?: string }) {
  blocks.push({ id: b.id ?? `${b.kind}-${autoId++}`, ...b } as MapBlock);
}

// Construções principais (paredes com porta = dá pra entrar e se esconder)
add({ id: 'igreja', kind: 'building', x: 0, z: -48, w: 14, d: 24, h: 9, door: 's', collide: true, location: 'igreja', label: 'Igreja', color: '#5b5560', roofColor: '#2a2630', tower: true });
add({ id: 'taverna', kind: 'building', x: 33, z: -8, w: 14, d: 10, h: 6, door: 'w', collide: true, location: 'taverna', label: 'Taverna', color: '#6b5440', roofColor: '#3a2a20' });
add({ id: 'delegacia', kind: 'building', x: -31, z: -6, w: 12, d: 10, h: 6, door: 'e', collide: true, location: 'delegacia', label: 'Delegacia', color: '#4d5a66', roofColor: '#262d36' });
add({ id: 'casarao', kind: 'building', x: 4, z: 52, w: 22, d: 16, h: 8, door: 'n', collide: true, location: 'casarao', label: 'Casarão', color: '#54495c', roofColor: '#241e2a' });
add({ id: 'celeiro', kind: 'building', x: 47, z: 43, w: 16, d: 20, h: 8, door: 'w', collide: true, location: 'celeiro', label: 'Celeiro', color: '#6e3428', roofColor: '#3a1c16' });
add({ id: 'casa-1', kind: 'building', x: 24, z: 24, w: 8, d: 8, h: 5, door: 'w', collide: true, color: '#5e5a52', roofColor: '#2f2b26' });
add({ id: 'casa-2', kind: 'building', x: -24, z: 24, w: 8, d: 8, h: 5, door: 'e', collide: true, color: '#56584f', roofColor: '#2b2c26' });
add({ id: 'casa-3', kind: 'building', x: 52, z: -40, w: 8, d: 8, h: 5, door: 's', collide: true, color: '#5a5048', roofColor: '#2c2420' });
add({ id: 'casa-4', kind: 'building', x: -62, z: -12, w: 8, d: 7, h: 5, door: 'e', collide: true, color: '#4f5258', roofColor: '#25272b' });
add({ id: 'casa-5', kind: 'building', x: 26, z: -42, w: 8, d: 8, h: 5, door: 'w', collide: true, color: '#5c544c', roofColor: '#2b2622' });

// Interior da igreja
for (let row = 0; row < 5; row++) {
  for (const side of [-3.2, 3.2]) {
    add({ kind: 'pew', x: side, z: -53 + row * 3, w: 3.6, d: 0.7, h: 0.9, collide: true, location: 'igreja' });
  }
}
add({ kind: 'altar', x: 0, z: -57.5, w: 4, d: 1.4, h: 1.1, collide: true, location: 'igreja' });

// Interior da taverna
add({ kind: 'counter', x: 38, z: -8, w: 1, d: 6.5, h: 1.1, collide: true, location: 'taverna' });
for (const [tx, tz] of [[29.5, -11], [29.5, -5], [33.5, -11.2], [33.5, -4.8]]) {
  add({ kind: 'table', x: tx, z: tz, w: 1.4, d: 1.4, h: 0.8, collide: true, location: 'taverna' });
}

// Interior da delegacia
add({ kind: 'desk', x: -28.5, z: -8.5, w: 2.4, d: 1, h: 0.9, collide: true, location: 'delegacia' });
add({ kind: 'bars', x: -33.5, z: -6, w: 0.15, d: 5, h: 2.6, collide: true, location: 'delegacia' });

// Interior do casarão (parede interna com passagem)
add({ kind: 'wall', x: 4, z: 46.2, w: WALL_THICKNESS, d: 4.4, h: 8, collide: true, location: 'casarao', color: '#54495c' });
add({ kind: 'wall', x: 4, z: 57, w: WALL_THICKNESS, d: 6, h: 8, collide: true, location: 'casarao', color: '#54495c' });
add({ kind: 'sofa', x: -3, z: 55, w: 3, d: 1, h: 0.9, collide: true, location: 'casarao' });
add({ kind: 'bed', x: 11, z: 57, w: 2, d: 3, h: 0.7, collide: true, location: 'casarao' });
add({ kind: 'table', x: -2, z: 49, w: 2.2, d: 1.2, h: 0.8, collide: true, location: 'casarao' });

// Celeiro
for (const [hx, hz] of [[51, 37], [51, 39.5], [52, 48], [43, 50], [45.5, 50]]) {
  add({ kind: 'hay', x: hx, z: hz, w: 1.8, d: 1.2, h: 1.1, collide: true, location: 'celeiro' });
}
add({ kind: 'cart', x: 36, z: 34, w: 2, d: 3.4, h: 1.4, collide: true, location: 'celeiro' });
add({ kind: 'well', x: 38, z: 54, w: 1.8, d: 1.8, h: 1.2, collide: true, location: 'celeiro' });

// Praça central
add({ id: 'fonte', kind: 'fountain', x: 0, z: 0, w: 4.2, d: 4.2, h: 1.3, collide: true, location: 'praca', label: 'Fonte' });
add({ kind: 'bench', x: 7, z: 0, w: 0.7, d: 2.2, h: 0.8, collide: true, location: 'praca' });
add({ kind: 'bench', x: -7, z: 0, w: 0.7, d: 2.2, h: 0.8, collide: true, location: 'praca' });
add({ kind: 'bench', x: 0, z: 7, w: 2.2, d: 0.7, h: 0.8, collide: true, location: 'praca' });
add({ kind: 'bench', x: 0, z: -7, w: 2.2, d: 0.7, h: 0.8, collide: true, location: 'praca' });
add({ kind: 'cart', x: 26, z: -17, w: 2, d: 3.4, h: 1.4, collide: true, location: 'taverna' });

// Postes de luz (lampiões)
export const LAMP_POSITIONS: [number, number][] = [
  [10, 10], [-10, 10], [10, -10], [-10, -10],
  [0, -30], [3, 26], [22, 3], [-19, 3], [30, 30], [-30, -28], [38, 18], [-14, 40], [40, -28],
];
for (const [lx, lz] of LAMP_POSITIONS) {
  add({ kind: 'lamp', x: lx, z: lz, w: 0.3, d: 0.3, h: 4.2, collide: true });
}

// Cemitério: cerca com portão a leste, lápides e mausoléu
const CEM = { minX: -48, maxX: -16, minZ: -61, maxZ: -31 };
const FENCE_H = 1.2;
add({ kind: 'fence', x: (CEM.minX + CEM.maxX) / 2, z: CEM.minZ, w: CEM.maxX - CEM.minX, d: 0.15, h: FENCE_H, collide: true, location: 'cemiterio' });
add({ kind: 'fence', x: (CEM.minX + CEM.maxX) / 2, z: CEM.maxZ, w: CEM.maxX - CEM.minX, d: 0.15, h: FENCE_H, collide: true, location: 'cemiterio' });
add({ kind: 'fence', x: CEM.minX, z: (CEM.minZ + CEM.maxZ) / 2, w: 0.15, d: CEM.maxZ - CEM.minZ, h: FENCE_H, collide: true, location: 'cemiterio' });
// lado leste com portão (z de -48 a -44)
add({ kind: 'fence', x: CEM.maxX, z: (CEM.minZ + -48) / 2, w: 0.15, d: -48 - CEM.minZ, h: FENCE_H, collide: true, location: 'cemiterio' });
add({ kind: 'fence', x: CEM.maxX, z: (-44 + CEM.maxZ) / 2, w: 0.15, d: CEM.maxZ - -44, h: FENCE_H, collide: true, location: 'cemiterio' });
add({ id: 'mausoleu', kind: 'crypt', x: -41, z: -36.5, w: 5, d: 4, h: 4.2, collide: true, location: 'cemiterio', label: 'Mausoléu' });

const rng = mulberry32(1337);
for (let gx = -45; gx <= -20; gx += 3.2) {
  for (let gz = -57.5; gz <= -40; gz += 3) {
    if (gx < -37 && gz > -40.5) continue; // espaço do mausoléu
    if (rng() < 0.28) continue;
    add({ kind: 'grave', x: gx + (rng() - 0.5) * 0.6, z: gz, w: 0.75, d: 0.25, h: 0.6 + rng() * 0.5, collide: true, location: 'cemiterio' });
  }
}

// Árvores: floresta densa a oeste + borda do mapa
const treeSpots: [number, number][] = [];
function farFromTrees(x: number, z: number, min: number) {
  return treeSpots.every(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 > min * min);
}
function insideAnyBuildingArea(x: number, z: number, pad: number) {
  return blocks.some(
    (b) =>
      (b.kind === 'building' || b.kind === 'crypt' || b.kind === 'lamp' || b.kind === 'fountain') &&
      Math.abs(x - b.x) < b.w / 2 + pad &&
      Math.abs(z - b.z) < b.d / 2 + pad,
  );
}
let guard = 0;
while (treeSpots.length < 120 && guard++ < 5000) {
  const x = -78 + rng() * 37;
  const z = 9 + rng() * 69;
  if (!farFromTrees(x, z, 3.1) || insideAnyBuildingArea(x, z, 2)) continue;
  treeSpots.push([x, z]);
}
guard = 0;
let edge = 0;
while (edge < 90 && guard++ < 8000) {
  const x = -78 + rng() * 156;
  const z = -78 + rng() * 156;
  const nearEdge = Math.abs(x) > 66 || Math.abs(z) > 68;
  const inCemetery = x > CEM.minX - 2 && x < CEM.maxX + 2 && z > CEM.minZ - 2 && z < CEM.maxZ + 2;
  if (!nearEdge || inCemetery || !farFromTrees(x, z, 3.4) || insideAnyBuildingArea(x, z, 3)) continue;
  treeSpots.push([x, z]);
  edge++;
}
// algumas árvores soltas pela vila
for (const [x, z] of [[14, 30], [-12, 30], [18, -24], [-16, -22], [60, 10], [62, 20], [-8, 70], [30, 68]] as [number, number][]) {
  treeSpots.push([x, z]);
}
for (const [x, z] of treeSpots) {
  add({ kind: 'tree', x, z, w: 0.7, d: 0.7, h: 7 + rng() * 4, collide: true, location: x < -40 && z > 8 ? 'floresta' : undefined });
}
// pedras
guard = 0;
let rocks = 0;
while (rocks < 18 && guard++ < 2000) {
  const x = -78 + rng() * 156;
  const z = -78 + rng() * 156;
  if (insideAnyBuildingArea(x, z, 4) || !farFromTrees(x, z, 2.2) || (Math.abs(x) < 18 && Math.abs(z) < 18)) continue;
  const s = 0.8 + rng() * 1.2;
  add({ kind: 'rock', x, z, w: s, d: s * (0.7 + rng() * 0.5), h: s * 0.7, collide: true });
  rocks++;
}

export const MAP_BLOCKS: readonly MapBlock[] = blocks;

// ---------------------------------------------------------------------------
// Paredes das construções
// ---------------------------------------------------------------------------

export interface WallPiece {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

/** Gera as paredes de uma construção, deixando um vão de porta no lado indicado. */
export function buildingWalls(b: MapBlock): WallPiece[] {
  const t = WALL_THICKNESS;
  const hw = b.w / 2;
  const hd = b.d / 2;
  const walls: WallPiece[] = [];
  const side = (s: Side) => {
    const horizontal = s === 'n' || s === 's';
    const len = horizontal ? b.w : b.d;
    const cx = s === 'e' ? b.x + hw - t / 2 : s === 'w' ? b.x - hw + t / 2 : b.x;
    const cz = s === 's' ? b.z + hd - t / 2 : s === 'n' ? b.z - hd + t / 2 : b.z;
    if (b.door !== s) {
      walls.push(horizontal ? { x: cx, z: cz, w: len, d: t, h: b.h } : { x: cx, z: cz, w: t, d: len, h: b.h });
      return;
    }
    const segLen = (len - DOOR_WIDTH) / 2;
    const off = DOOR_WIDTH / 2 + segLen / 2;
    if (horizontal) {
      walls.push({ x: cx - off, z: cz, w: segLen, d: t, h: b.h });
      walls.push({ x: cx + off, z: cz, w: segLen, d: t, h: b.h });
    } else {
      walls.push({ x: cx, z: cz - off, w: t, d: segLen, h: b.h });
      walls.push({ x: cx, z: cz + off, w: t, d: segLen, h: b.h });
    }
  };
  (['n', 's', 'e', 'w'] as Side[]).forEach(side);
  return walls;
}

function toAABB(x: number, z: number, w: number, d: number, h: number): AABB {
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h };
}

/** Todos os retângulos de colisão do mapa (paredes + objetos). */
export const MAP_COLLIDERS: readonly AABB[] = (() => {
  const out: AABB[] = [];
  for (const b of MAP_BLOCKS) {
    if (!b.collide) continue;
    if (b.kind === 'building') {
      for (const w of buildingWalls(b)) out.push(toAABB(w.x, w.z, w.w, w.d, w.h));
    } else {
      out.push(toAABB(b.x, b.z, b.w, b.d, b.h));
    }
  }
  return out;
})();

/** Pontos de nascimento ao redor da praça. */
export const SPAWN_POINTS: [number, number][] = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const r = 10.5 + (i % 2) * 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

/** Nome do local para os alertas ("[Nome] foi morto — Igreja"). */
export function locationAt(x: number, z: number): { id: LocationId | null; name: string } {
  for (const l of LOCATIONS) {
    if (x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ) return { id: l.id, name: l.name };
  }
  return { id: null, name: FALLBACK_LOCATION_NAME };
}

/** Estradas decorativas (só visual): segmentos de terra batida. */
export const ROADS: { x1: number; z1: number; x2: number; z2: number; w: number }[] = [
  { x1: 0, z1: -14, x2: 0, z2: -36, w: 4 },
  { x1: 14, z1: 0, x2: 26, z2: -8, w: 3.5 },
  { x1: -14, z1: 0, x2: -25, z2: -6, w: 3.5 },
  { x1: 0, z1: 14, x2: 4, z2: 44, w: 4 },
  { x1: 10, z1: 12, x2: 39, z2: 43, w: 3.5 },
  { x1: -8, z1: -12, x2: -16, z2: -46, w: 3 },
  { x1: -12, z1: 10, x2: -45, z2: 30, w: 3 },
  { x1: 20, z1: -8, x2: 52, z2: -36, w: 3 },
];
