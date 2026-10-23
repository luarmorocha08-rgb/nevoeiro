/**
 * Dados de alta frequência (snapshots, interpolação, predição).
 * Ficam FORA do React/zustand para não re-renderizar a cada pacote.
 */
import { CONFIG, EF, type BodySnap, type FxMsg, type InputMsg, type SnapshotMsg, type YouSnap } from '@nevoeiro/shared';
import { watchCooldowns } from '../game/feedback';
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
  /** quando apareceu (fade-in) e quando saiu do snapshot (fade-out), em performance.now() */
  bornAt: number;
  leavingAt: number;
  /** saiu dissolvendo (Fantasma ficou invisível) */
  dissolving: boolean;
}

export interface FxItem extends FxMsg {
  seq: number;
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
  const nowP = performance.now();
  for (const e of s.e) {
    seen.add(e.id);
    let ent = net.entities.get(e.id);
    if (!ent) {
      ent = {
        id: e.id, name: e.n, skin: e.s, flags: e.f, role: e.r, samples: [],
        rx: e.x, rz: e.z, ry: e.y, speed: 0, bornAt: nowP, leavingAt: 0, dissolving: false,
      };
      net.entities.set(e.id, ent);
    }
    if (ent.leavingAt) {
      // voltou ao alcance antes de sumir de vez
      ent.leavingAt = 0;
      ent.dissolving = false;
      ent.bornAt = nowP;
    }
    ent.name = e.n;
    ent.skin = e.s;
    ent.flags = e.f;
    ent.role = e.r;
    const last = ent.samples[ent.samples.length - 1];
    if (last && Math.hypot(last.x - e.x, last.z - e.z) > CONFIG.net.teleportJumpMeters) {
      // teleporte/ressurreição: descarta o histórico para não deslizar pelo mapa
      ent.samples.length = 0;
      ent.rx = e.x;
      ent.rz = e.z;
    }
    ent.samples.push({ t: s.t, x: e.x, z: e.z, y: e.y });
    if (ent.samples.length > 20) ent.samples.splice(0, ent.samples.length - 20);
  }
  let removed = false;
  for (const [id, ent] of net.entities) {
    if (seen.has(id)) continue;
    if (!ent.leavingAt) ent.leavingAt = nowP;
    const ttl = ent.dissolving ? 750 : CONFIG.net.fadeOutMs;
    if (nowP - ent.leavingAt > ttl) {
      net.entities.delete(id);
      removed = true;
    }
  }

  net.bodies.clear();
  for (const b of s.b) net.bodies.set(b.id, b);
  net.audioOnly.clear();
  for (const a of s.a) net.audioOnly.set(a.id, { x: a.x, z: a.z });
  net.thermal = s.th ?? [];
  net.you = s.you;
  net.youVersion++;
  watchCooldowns(s.you.abilities);

  // ----- espelha no React só o que muda a UI (com limite de frequência)
  const entityKey =
    [...net.entities.values()]
      .map((e) => `${e.id}|${e.name}|${e.skin}|${e.flags & (EF.GHOST | EF.NONAME | EF.ALLY | EF.HIDDEN)}|${e.role ?? ''}`)
      .join(',') + (removed ? '!' : '');
  const bodyKey = s.b.map((b) => b.id).join(',');
  const st = getState();
  const patch: Record<string, unknown> = {};
  if (entityKey !== lastEntityKey) {
    lastEntityKey = entityKey;
    patch.entities = [...net.entities.values()].map<EntityView>((e) => ({
      id: e.id,
      name: e.name,
      skin: e.skin,
      ghost: !!(e.flags & EF.GHOST),
      noName: !!(e.flags & EF.NONAME),
      ally: !!(e.flags & EF.ALLY),
      hidden: !!(e.flags & EF.HIDDEN),
      role: e.role,
    }));
  }
  if (bodyKey !== lastBodyKey) {
    lastBodyKey = bodyKey;
    patch.bodies = s.b.map<BodyView>((b) => ({ id: b.id, name: b.n, skin: b.s, x: b.x, z: b.z, y: b.y, bornAt: performance.now() - b.a }));
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
  // segurança extra: se ainda assim ficou muito longe, pula direto
  if (Math.hypot(x - ent.rx, z - ent.rz) > CONFIG.net.teleportJumpMeters * 1.5) {
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

/** 0..1: visibilidade de fade (aparecer/sumir) da entidade. */
export function entityFade(ent: NetEntity, nowP = performance.now()): number {
  if (ent.leavingAt) {
    const ttl = ent.dissolving ? 750 : CONFIG.net.fadeOutMs;
    return Math.max(0, 1 - (nowP - ent.leavingAt) / ttl);
  }
  return Math.min(1, (nowP - ent.bornAt) / CONFIG.net.fadeInMs);
}

export function pushFx(f: FxMsg) {
  // Fantasma sumindo: a entidade sai dissolvendo (o servidor para de mandá-la)
  if (f.kind === 'vanish' && f.id) {
    const ent = net.entities.get(f.id);
    if (ent) ent.dissolving = true;
  }
  net.fx.push({ ...f, seq: ++net.fxSeq, born: performance.now() });
  if (net.fx.length > 40) net.fx.shift();
}
