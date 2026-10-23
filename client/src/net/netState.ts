/**
 * Dados de alta frequência (snapshots, interpolação, predição).
 * Ficam FORA do React/zustand para não re-renderizar a cada pacote.
 */
import { CONFIG, EF, type BodySnap, type FxMsg, type InputMsg, type SnapshotMsg, type YouSnap } from '@nevoeiro/shared';
import { getState, type BodyView, type EntityView } from './store';

interface Sample {
  t: number;
  x: number;
  z: number;
  y: number;
}

export interface NetEntity {
  id: string;
  name: string;
  skin: string;
  flags: number;
  role?: string;
  samples: Sample[];
  /** posição renderizada (interpolada) */
  rx: number;
  rz: number;
  ry: number;
  speed: number;
}

export interface FxItem extends FxMsg {
  id: number;
  born: number;
}

export const net = {
  /** serverTime ≈ Date.now() + offset */
  offset: 0,
  offsetReady: false,
  entities: new Map<string, NetEntity>(),
  bodies: new Map<string, BodySnap>(),
  audioOnly: new Map<string, { x: number; z: number }>(),
  thermal: [] as { id: string; x: number; z: number }[],
  you: null as YouSnap | null,
  youVersion: 0,
  pending: [] as InputMsg[],
  seq: 0,
  /** posição local renderizada (para câmera, voz e minimapa) */
  local: { x: 0, z: 0, yaw: 0 },
  /** yaw da câmera (para direção da voz e minimapa) */
  cameraYaw: 0,
  fx: [] as FxItem[],
  fxSeq: 0,
};

export function serverNow(): number {
  return Date.now() + net.offset;
}

let lastUiPush = 0;
let lastEntityKey = '';
let lastBodyKey = '';

export function applySnapshot(s: SnapshotMsg) {
  // relógio do servidor (média móvel)
  const off = s.t - Date.now();
  if (!net.offsetReady) {
    net.offset = off;
    net.offsetReady = true;
  } else {
    net.offset += (off - net.offset) * 0.05;
  }

  const seen = new Set<string>();
  for (const e of s.e) {
    seen.add(e.id);
    let ent = net.entities.get(e.id);
    if (!ent) {
      ent = { id: e.id, name: e.n, skin: e.s, flags: e.f, role: e.r, samples: [], rx: e.x, rz: e.z, ry: e.y, speed: 0 };
      net.entities.set(e.id, ent);
    }
    ent.name = e.n;
    ent.skin = e.s;
    ent.flags = e.f;
    ent.role = e.r;
    ent.samples.push({ t: s.t, x: e.x, z: e.z, y: e.y });
    if (ent.samples.length > 20) ent.samples.splice(0, ent.samples.length - 20);
  }
  for (const id of net.entities.keys()) if (!seen.has(id)) net.entities.delete(id);

  net.bodies.clear();
  for (const b of s.b) net.bodies.set(b.id, b);
  net.audioOnly.clear();
  for (const a of s.a) net.audioOnly.set(a.id, { x: a.x, z: a.z });
  net.thermal = s.th ?? [];
  net.you = s.you;
  net.youVersion++;

  // ----- espelha no React só o que muda a UI (com limite de frequência)
  const entityKey = s.e.map((e) => `${e.id}|${e.n}|${e.s}|${e.f & (EF.GHOST | EF.NONAME | EF.ALLY)}|${e.r ?? ''}`).join(',');
  const bodyKey = s.b.map((b) => b.id).join(',');
  const st = getState();
  const patch: Record<string, unknown> = {};
  if (entityKey !== lastEntityKey) {
    lastEntityKey = entityKey;
    patch.entities = s.e.map<EntityView>((e) => ({
      id: e.id,
      name: e.n,
      skin: e.s,
      ghost: !!(e.f & EF.GHOST),
      noName: !!(e.f & EF.NONAME),
      ally: !!(e.f & EF.ALLY),
      role: e.r,
    }));
  }
  if (bodyKey !== lastBodyKey) {
    lastBodyKey = bodyKey;
    patch.bodies = s.b.map<BodyView>((b) => ({ id: b.id, name: b.n, skin: b.s, x: b.x, z: b.z, y: b.y }));
  }
  const now = Date.now();
  if (now - lastUiPush > 100 || s.you.alive !== st.you?.alive) {
    lastUiPush = now;
    patch.you = s.you;
    patch.counts = s.c;
  }
  if (Object.keys(patch).length) st.set(patch);
}

export function resetNet() {
  net.entities.clear();
  net.bodies.clear();
  net.audioOnly.clear();
  net.thermal = [];
  net.you = null;
  net.pending = [];
  net.fx = [];
  lastEntityKey = '';
  lastBodyKey = '';
}

/** Posição interpolada de uma entidade remota no tempo de renderização. */
export function interpolate(ent: NetEntity, dt: number) {
  const renderT = serverNow() - CONFIG.net.interpolationDelayMs;
  const s = ent.samples;
  let x = ent.rx;
  let z = ent.rz;
  let y = ent.ry;
  if (s.length === 1) {
    x = s[0].x;
    z = s[0].z;
    y = s[0].y;
  } else if (s.length > 1) {
    let i = s.length - 1;
    while (i > 0 && s[i - 1].t > renderT) i--;
    const a = s[Math.max(0, i - 1)];
    const b = s[i];
    if (renderT >= b.t) {
      x = b.x;
      z = b.z;
      y = b.y;
    } else {
      const k = b.t === a.t ? 1 : Math.max(0, Math.min(1, (renderT - a.t) / (b.t - a.t)));
      x = a.x + (b.x - a.x) * k;
      z = a.z + (b.z - a.z) * k;
      y = lerpAngle(a.y, b.y, k);
    }
  }
  // teleporte / revive: pula direto
  if (Math.hypot(x - ent.rx, z - ent.rz) > 6) {
    ent.rx = x;
    ent.rz = z;
  }
  const px = ent.rx;
  const pz = ent.rz;
  const k = 1 - Math.exp(-dt * 18);
  ent.rx += (x - ent.rx) * k;
  ent.rz += (z - ent.rz) * k;
  ent.ry = lerpAngle(ent.ry, y, 1 - Math.exp(-dt * 12));
  ent.speed = dt > 0 ? Math.hypot(ent.rx - px, ent.rz - pz) / dt : 0;
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function pushFx(f: FxMsg) {
  net.fx.push({ ...f, id: ++net.fxSeq, born: performance.now() });
  if (net.fx.length > 40) net.fx.shift();
}
