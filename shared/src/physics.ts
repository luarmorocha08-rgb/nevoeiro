/**
 * Movimento e colisão determinísticos, usados igualmente pelo servidor (autoritativo)
 * e pelo cliente (predição local). Círculo (jogador) contra retângulos alinhados aos eixos.
 */
import { CONFIG } from './config';
import { MAP_COLLIDERS, WORLD, LOS_MIN_HEIGHT, type AABB } from './map';

export interface Vec2 {
  x: number;
  z: number;
}

/** Empurra o círculo para fora de todos os retângulos. */
export function resolveCircle(p: Vec2, r: number, colliders: readonly AABB[] = MAP_COLLIDERS): Vec2 {
  let { x, z } = p;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x < c.minX - r || x > c.maxX + r || z < c.minZ - r || z > c.maxZ + r) continue;
      const cx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
      const cz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const push = r - d;
        x += (dx / d) * push;
        z += (dz / d) * push;
      } else {
        // centro dentro do retângulo: sai pelo lado mais próximo
        const left = x - c.minX;
        const right = c.maxX - x;
        const top = z - c.minZ;
        const bottom = c.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = c.minX - r;
        else if (m === right) x = c.maxX + r;
        else if (m === top) z = c.minZ - r;
        else z = c.maxZ + r;
      }
      moved = true;
    }
    if (!moved) break;
  }
  const lim = WORLD.walkHalf;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-lim, Math.min(lim, z));
  return { x, z };
}

/** Move um círculo com sub-passos para não atravessar paredes finas. */
export function moveCircle(p: Vec2, dx: number, dz: number, r: number = CONFIG.move.radius): Vec2 {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
  let cur = p;
  for (let i = 0; i < steps; i++) {
    cur = resolveCircle({ x: cur.x + dx / steps, z: cur.z + dz / steps }, r);
  }
  return cur;
}

export interface MoveInput {
  /** Direção desejada no MUNDO (x, z), comprimento <= 1. */
  mx: number;
  mz: number;
  run: boolean;
  dt: number;
}

/** Estado de movimento simulado igual no servidor e na predição do cliente. */
export interface MoveState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  stamina: number;
  /** stamina zerou: só corre de novo após recuperar CONFIG.move.stamina.minToRun */
  exhausted: boolean;
}

export function initialMoveState(x: number, z: number): MoveState {
  return { x, z, vx: 0, vz: 0, stamina: CONFIG.move.stamina.max, exhausted: false };
}

/**
 * Um passo de simulação do jogador: aceleração/frenagem curtas, corrida com stamina
 * e colisão. Determinística — a predição do cliente reproduz o servidor exatamente.
 */
export function stepMovement(s: MoveState, input: MoveInput): MoveState {
  const M = CONFIG.move;
  const S = M.stamina;
  const dt = input.dt;
  let mx = Number(input.mx) || 0;
  let mz = Number(input.mz) || 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const wantsMove = len > 0.05;
  const canRun = !s.exhausted && s.stamina > 0;
  const running = wantsMove && input.run && canRun;
  const speed = running ? M.runSpeed : M.walkSpeed;
  const tx = wantsMove ? mx * speed : 0;
  const tz = wantsMove ? mz * speed : 0;

  // aproxima a velocidade do alvo com aceleração limitada
  let dvx = tx - s.vx;
  let dvz = tz - s.vz;
  const dv = Math.hypot(dvx, dvz);
  const speeding = Math.hypot(tx, tz) >= Math.hypot(s.vx, s.vz);
  const maxDv = (speeding ? M.acceleration : M.deceleration) * dt;
  if (dv > maxDv && dv > 0) {
    dvx = (dvx / dv) * maxDv;
    dvz = (dvz / dv) * maxDv;
  }
  let vx = s.vx + dvx;
  let vz = s.vz + dvz;
  if (Math.hypot(vx, vz) < 0.02) {
    vx = 0;
    vz = 0;
  }

  let x = s.x;
  let z = s.z;
  if (vx !== 0 || vz !== 0) {
    const next = moveCircle({ x, z }, vx * dt, vz * dt);
    // bateu em algo: a velocidade acompanha o deslocamento real (desliza na parede)
    if (dt > 0) {
      const rvx = (next.x - x) / dt;
      const rvz = (next.z - z) / dt;
      if (Math.hypot(rvx - vx, rvz - vz) > 0.05) {
        vx = rvx;
        vz = rvz;
      }
    }
    x = next.x;
    z = next.z;
  }

  let stamina = s.stamina;
  let exhausted = s.exhausted;
  if (running && Math.hypot(vx, vz) > M.walkSpeed * 0.9) {
    stamina = Math.max(0, stamina - S.drainPerSecond * dt);
    if (stamina <= 0) exhausted = true;
  } else {
    stamina = Math.min(S.max, stamina + S.regenPerSecond * dt);
    if (exhausted && stamina >= S.minToRun) exhausted = false;
  }
  return { x, z, vx, vz, stamina, exhausted };
}

/** true se o segmento A→B atravessa algum obstáculo alto (parede, árvore...). */
export function lineBlocked(a: Vec2, b: Vec2, colliders: readonly AABB[] = MAP_COLLIDERS): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.h < LOS_MIN_HEIGHT) continue;
    // teste de slab 2D
    let tmin = 0;
    let tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (a.x < c.minX || a.x > c.maxX) continue;
    } else {
      let t1 = (c.minX - a.x) / dx;
      let t2 = (c.maxX - a.x) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (a.z < c.minZ || a.z > c.maxZ) continue;
    } else {
      let t1 = (c.minZ - a.z) / dz;
      let t2 = (c.maxZ - a.z) / dz;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    return true;
  }
  return false;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** true se o ponto está livre (fora de obstáculos e dentro do mapa). */
export function isFree(x: number, z: number, r: number = CONFIG.move.radius + 0.1): boolean {
  if (Math.abs(x) > WORLD.walkHalf || Math.abs(z) > WORLD.walkHalf) return false;
  for (const c of MAP_COLLIDERS) {
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
  }
  return true;
}

/** Sorteia um ponto livre do mapa. */
export function randomFreePoint(rnd: () => number = Math.random, avoid: Vec2[] = [], minDist = 0): Vec2 {
  for (let i = 0; i < 500; i++) {
    const x = (rnd() * 2 - 1) * (WORLD.walkHalf - 3);
    const z = (rnd() * 2 - 1) * (WORLD.walkHalf - 3);
    if (!isFree(x, z, 0.8)) continue;
    if (avoid.some((a) => dist(a, { x, z }) < minDist)) continue;
    return { x, z };
  }
  return { x: 0, z: 9 };
}
