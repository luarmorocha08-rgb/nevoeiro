/**
 * Navegação em grade (A*) — usada pelos bots do servidor.
 * Construída preguiçosamente a partir dos colisores do mapa.
 */
import { WORLD } from './map';
import { isFree, type Vec2 } from './physics';

const CELL = 1;
const N = Math.ceil((WORLD.walkHalf * 2) / CELL);
let grid: Uint8Array | null = null;

function build() {
  grid = new Uint8Array(N * N);
  for (let gz = 0; gz < N; gz++) {
    for (let gx = 0; gx < N; gx++) {
      const { x, z } = cellCenter(gx, gz);
      grid[gz * N + gx] = isFree(x, z, 0.55) ? 1 : 0;
    }
  }
}

function cellCenter(gx: number, gz: number): Vec2 {
  return { x: -WORLD.walkHalf + (gx + 0.5) * CELL, z: -WORLD.walkHalf + (gz + 0.5) * CELL };
}
function toCell(p: Vec2): [number, number] {
  const gx = Math.floor((p.x + WORLD.walkHalf) / CELL);
  const gz = Math.floor((p.z + WORLD.walkHalf) / CELL);
  return [Math.max(0, Math.min(N - 1, gx)), Math.max(0, Math.min(N - 1, gz))];
}

function walkable(gx: number, gz: number) {
  return gx >= 0 && gz >= 0 && gx < N && gz < N && grid![gz * N + gx] === 1;
}

function nearestWalkable(gx: number, gz: number): [number, number] | null {
  for (let r = 0; r < 6; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (walkable(gx + dx, gz + dz)) return [gx + dx, gz + dz];
      }
    }
  }
  return null;
}

/** Caminho de A até B (lista de pontos), ou null se não houver. */
export function findPath(from: Vec2, to: Vec2, maxNodes = 12000): Vec2[] | null {
  if (!grid) build();
  const s = nearestWalkable(...toCell(from));
  const t = nearestWalkable(...toCell(to));
  if (!s || !t) return null;
  const start = s[1] * N + s[0];
  const goal = t[1] * N + t[0];
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open: { k: number; f: number }[] = [{ k: start, f: 0 }];
  const closed = new Set<number>();
  const h = (k: number) => {
    const x = k % N;
    const z = (k / N) | 0;
    return Math.hypot(x - t[0], z - t[1]);
  };
  let expanded = 0;
  while (open.length) {
    // fila de prioridade simples (lista ordenada por inserção binária)
    const cur = open.shift()!.k;
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > maxNodes) return null;
    const cx = cur % N;
    const cz = (cur / N) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!walkable(nx, nz)) continue;
        if (dx && dz && (!walkable(cx + dx, cz) || !walkable(cx, cz + dz))) continue;
        const nk = nz * N + nx;
        const ng = g.get(cur)! + (dx && dz ? 1.4142 : 1);
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          came.set(nk, cur);
          const f = ng + h(nk);
          let lo = 0;
          let hi = open.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (open[mid].f < f) lo = mid + 1;
            else hi = mid;
          }
          open.splice(lo, 0, { k: nk, f });
        }
      }
    }
  }
  if (!came.has(goal) && start !== goal) return null;
  const path: Vec2[] = [];
  let k = goal;
  while (k !== start) {
    path.push(cellCenter(k % N, (k / N) | 0));
    k = came.get(k)!;
  }
  path.reverse();
  // simplifica: mantém 1 a cada 3 pontos + o final
  const simple = path.filter((_, i) => i % 3 === 2 || i === path.length - 1);
  return simple;
}
