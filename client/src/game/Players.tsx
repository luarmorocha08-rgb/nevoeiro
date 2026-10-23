import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CONFIG, EF, ROLE_INFO, initialMoveState, stepMovement, type InputMsg, type MoveState, type RoleId } from '@nevoeiro/shared';
import { input } from '../input/InputManager';
import { sendInput } from '../net/connection';
import { entityFade, interpolate, net } from '../net/netState';
import { getState, useStore, type EntityView } from '../net/store';
import { THEME, roleColor } from '../theme';
import { voice } from '../voice/VoiceManager';
import { CharacterModel, type Motion } from './CharacterModel';

// ------------------------------------------------------------------ jogadores remotos

export function RemotePlayers() {
  const entities = useStore((s) => s.entities);
  return (
    <>
      {entities.map((e) => (
        <RemotePlayer key={e.id} view={e} />
      ))}
    </>
  );
}

/** Cor do contorno de alvo: a cor do seu papel (vale para matar, atirar, algemar, copiar). */
function useTargetOutline(id: string): string | null {
  return useStore((s) => (s.target?.id === id ? roleColor(s.role?.role) : null));
}

const tmpV = new THREE.Vector3();

function RemotePlayer({ view }: { view: EntityView }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const motion = useRef<Motion>({ speed: 0, dissolve: 1, edge: THEME.fog });
  const tagRef = useRef<HTMLDivElement>(null);
  const morphUntil = useRef(0);
  const prevSkin = useRef(view.skin);
  const outline = useTargetOutline(view.id);
  const { camera } = useThree();

  // Metamorfo trocou de aparência: ondulação rápida no corpo
  useEffect(() => {
    if (prevSkin.current !== view.skin) morphUntil.current = performance.now() + 650;
    prevSkin.current = view.skin;
  }, [view.skin]);

  useFrame((_, dt) => {
    const ent = net.entities.get(view.id);
    if (!ent || !group.current) return;
    interpolate(ent, dt);
    const nowP = performance.now();
    group.current.position.set(ent.rx, 0, ent.rz);
    group.current.rotation.y = ent.ry;
    // ondulação do Metamorfo
    const wobble = morphUntil.current > nowP ? (morphUntil.current - nowP) / 650 : 0;
    const w = Math.sin(nowP / 28) * 0.12 * wobble;
    group.current.scale.set(1 + w, 1 - w * 0.6, 1 + w);

    const m = motion.current;
    m.speed = ent.flags & EF.FROZEN ? 0 : ent.speed;
    m.dissolve = Math.max(1 - entityFade(ent, nowP), wobble * 0.35);
    m.edge = ent.dissolving ? THEME.role.fantasma : wobble > 0 ? THEME.role.metamorfo : THEME.fog;
    if (!ent.leavingAt) body.current?.setNextKinematicTranslation(tmpV.set(ent.rx, 0.9, ent.rz));

    if (tagRef.current) {
      const d = Math.hypot(ent.rx - net.local.x, ent.rz - net.local.z);
      const camD = camera.position.distanceTo(tmpV.set(ent.rx, 1.8, ent.rz));
      const show = d < CONFIG.view.nameTagDistance && camD > CONFIG.view.nameTagMinDistance && !ent.leavingAt;
      tagRef.current.style.opacity = show ? '1' : '0';
    }
  });

  const showName = !view.noName;
  return (
    <group ref={group}>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} userData={{ player: view.id }}>
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>
      <CharacterModel skin={view.skin} motion={motion} ghost={view.ghost} hidden={view.hidden} outline={outline} />
      {outline && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.55, 0.68, 32]} />
          <meshBasicMaterial color={outline} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      )}
      <Html position={[0, 2.25, 0]} center distanceFactor={6} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={tagRef} className="nametag">
          <Bubble id={view.id} />
          <SpeakingIcon id={view.id} />
          {showName && (
            <span className={`nametag-name${view.ally ? ' ally' : ''}`}>
              {view.ally && <span className="team-shape" aria-label="parceiro">◆</span>}
              {view.name}
              {view.ally && <em> · parceiro</em>}
              {view.hidden && <em> · escondido</em>}
              {view.role && (
                <em className="role-tag" style={{ color: roleColor(view.role) }}>
                  {' '}· {ROLE_INFO[view.role as RoleId]?.name}
                </em>
              )}
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

function Bubble({ id }: { id: string }) {
  const bubble = useStore((s) => s.bubbles[id]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!bubble) return;
    const ms = bubble.until - Date.now();
    if (ms <= 0) return;
    const h = setTimeout(() => setTick((t) => t + 1), ms + 50);
    return () => clearTimeout(h);
  }, [bubble]);
  if (!bubble || bubble.until < Date.now()) return null;
  return <div className="bubble">{bubble.text}</div>;
}

function SpeakingIcon({ id }: { id: string }) {
  const speaking = useStore((s) => s.speaking.includes(id));
  return speaking ? <span className="speaking-icon" aria-label="falando">◉</span> : null;
}

// ------------------------------------------------------------------ jogador local + câmera

const INPUT_DT = 1 / CONFIG.net.inputRate;
const CAM_DIST = 4.6;
const MAX_STEPS_PER_FRAME = 8;
// vetores reutilizados (nada de alocação por frame)
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const camDir = new THREE.Vector3();
const camFinal = new THREE.Vector3();

export function LocalPlayer() {
  const role = useStore((s) => s.role);
  const myId = role?.netId;
  const alive = useStore((s) => s.you?.alive ?? true);
  const disguise = useStore((s) => s.you?.disguise ?? null);
  const invisible = useStore((s) => s.you?.invisible ?? false);
  const hidden = useStore((s) => !!s.you?.hidden);
  const lobbySkin = useStore((s) => s.players.find((p) => p.id === s.sessionId)?.skin ?? 'capuz-vinho');
  const disguiseSkin = useStore((s) => s.you?.disguiseSkin ?? null);
  const group = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const motion = useRef<Motion>({ speed: 0, dissolve: 0, edge: THEME.role.fantasma });
  const sim = useRef<MoveState & { init: boolean }>({ ...initialMoveState(0, 0), init: false });
  const render = useRef({ x: 0, z: 0 });
  const yaw = useRef(0);
  const cam = useRef({ yaw: Math.PI, pitch: 0.32, dist: CAM_DIST });
  const acc = useRef(0);
  const lastVersion = useRef(-1);
  const lastSentZero = useRef(false);
  const pulse = useRef({ start: 0, prevInvisible: false, prevSkin: '' });
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), [rapier]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.25);
    const you = net.you;
    if (!you || !group.current) return;
    const st = getState();
    const nowP = performance.now();

    // ---------- reconciliação com o servidor (reaplica inputs ainda não confirmados)
    if (net.youVersion !== lastVersion.current) {
      lastVersion.current = net.youVersion;
      const server: MoveState = { x: you.x, z: you.z, vx: you.vx, vz: you.vz, stamina: you.stamina, exhausted: you.exhausted };
      if (!sim.current.init) {
        sim.current = { ...server, init: true };
        render.current = { x: you.x, z: you.z };
        cam.current.yaw = Math.atan2(-you.x, -you.z);
        net.seq = Math.max(net.seq, you.ack);
      }
      if (net.seq < you.ack) net.seq = you.ack;
      net.pending = net.pending.filter((p) => p.seq > you.ack);
      let p = server;
      if (you.alive && you.frozen <= 0 && st.phase === 'playing') {
        for (const inp of net.pending) p = stepMovement(p, inp);
      }
      const err = Math.hypot(p.x - sim.current.x, p.z - sim.current.z);
      if (err > CONFIG.net.snapDistance) {
        sim.current = { ...p, init: true };
        render.current = { x: p.x, z: p.z };
      } else {
        // correção proporcional ao erro: pequenas diferenças somem sem tremer
        const k = err > 0.6 ? 0.5 : 0.18;
        sim.current.x += (p.x - sim.current.x) * k;
        sim.current.z += (p.z - sim.current.z) * k;
        sim.current.vx = p.vx;
        sim.current.vz = p.vz;
        sim.current.stamina = p.stamina;
        sim.current.exhausted = p.exhausted;
      }
    }

    // efeito local de sumir/reaparecer (Fantasma) e de copiar aparência (Metamorfo)
    if (pulse.current.prevInvisible !== invisible || pulse.current.prevSkin !== (disguiseSkin ?? '')) {
      pulse.current.start = nowP;
      pulse.current.prevInvisible = invisible;
      pulse.current.prevSkin = disguiseSkin ?? '';
      motion.current.edge = invisible ? THEME.role.fantasma : THEME.role.metamorfo;
    }
    const pt = (nowP - pulse.current.start) / 650;
    motion.current.dissolve = pt < 1 ? Math.sin(pt * Math.PI) * 0.75 : 0;

    if (!you.alive) {
      group.current.visible = false;
      return; // espectador: a câmera livre cuida da entrada
    }

    // ---------- entrada
    const s = input.sample();
    const c = cam.current;
    if (!st.end) {
      c.yaw -= s.lookX * 0.0032;
      c.pitch = Math.max(-0.25, Math.min(1.1, c.pitch + s.lookY * 0.0026));
    }
    net.cameraYaw = c.yaw;

    const canMove = you.alive && you.frozen <= 0 && st.phase === 'playing' && !st.end;
    acc.current += dt;
    let steps = 0;
    while (acc.current >= INPUT_DT && steps++ < MAX_STEPS_PER_FRAME) {
      acc.current -= INPUT_DT;
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      const rx = -Math.cos(c.yaw);
      const rz = Math.sin(c.yaw);
      let mx = canMove ? fx * s.forward + rx * s.strafe : 0;
      let mz = canMove ? fz * s.forward + rz * s.strafe : 0;
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      const moving = len > 0.05;
      const coasting = Math.hypot(sim.current.vx, sim.current.vz) > 0.02;
      // parado e já avisou o servidor: não precisa mandar nada
      if (!moving && !coasting && lastSentZero.current) continue;
      const msg: InputMsg = { seq: ++net.seq, dt: INPUT_DT, mx: moving ? mx : 0, mz: moving ? mz : 0, run: s.run, yaw: c.yaw };
      lastSentZero.current = !moving && !coasting;
      if (canMove) {
        const next = stepMovement(sim.current, msg);
        sim.current = { ...next, init: true };
        if (moving) yaw.current = Math.atan2(mx, mz);
      }
      net.pending.push(msg);
      if (net.pending.length > 120) net.pending.shift();
      sendInput(msg);
    }
    if (acc.current > INPUT_DT * MAX_STEPS_PER_FRAME) acc.current = 0;

    // ---------- render suave
    const r = render.current;
    const px = r.x;
    const pz = r.z;
    const k = 1 - Math.exp(-dt * 22);
    r.x += (sim.current.x - r.x) * k;
    r.z += (sim.current.z - r.z) * k;
    motion.current.speed = dt > 0 ? Math.hypot(r.x - px, r.z - pz) / dt : 0;
    group.current.position.set(r.x, 0, r.z);
    group.current.rotation.y += shortAngle(yaw.current - group.current.rotation.y) * (1 - Math.exp(-dt * 14));
    group.current.visible = true;
    net.local.x = r.x;
    net.local.z = r.z;
    net.local.yaw = yaw.current;
    body.current?.setNextKinematicTranslation({ x: r.x, y: 0.9, z: r.z });
    voice.update();

    // ---------- câmera em terceira pessoa com colisão (raycast no Rapier) e suavização
    if (st.end) return; // a câmera cinematográfica assume no fim da partida
    camTarget.set(r.x, 1.55, r.z);
    const horiz = Math.cos(c.pitch) * c.dist;
    camDesired.set(r.x - Math.sin(c.yaw) * horiz, 1.55 + Math.sin(c.pitch) * c.dist, r.z - Math.cos(c.yaw) * horiz);
    camDir.copy(camDesired).sub(camTarget);
    const maxDist = camDir.length();
    camDir.normalize();
    let dist = maxDist;
    try {
      ray.origin = camTarget;
      ray.dir = camDir;
      const hit = world.castRay(ray, maxDist, true, undefined, undefined, undefined, undefined, (col) => {
        const rb = col.parent();
        return !!rb && rb.isFixed();
      });
      if (hit) {
        const toi = (hit as unknown as { timeOfImpact?: number; toi?: number }).timeOfImpact ?? (hit as unknown as { toi: number }).toi;
        dist = Math.max(0.6, toi - 0.25);
      }
    } catch {
      /* rapier ainda iniciando */
    }
    camFinal.copy(camTarget).addScaledVector(camDir, dist);
    // aproxima rápido (não atravessa parede) e afasta devagar (sem trancos)
    const closer = camera.position.distanceTo(camTarget) > dist + 0.05;
    camera.position.lerp(camFinal, 1 - Math.exp(-dt * (closer ? 30 : 9)));
    camera.lookAt(camTarget);
  });

  if (!myId) return null;
  const skin = disguise && disguiseSkin ? disguiseSkin : lobbySkin;
  return (
    <group ref={group}>
      <RigidBody ref={body} type="kinematicPosition" colliders={false}>
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>
      {alive && <CharacterModel skin={skin} motion={motion} ghost={invisible} hidden={hidden} />}
      <Html position={[0, 2.25, 0]} center distanceFactor={6} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="nametag">
          <Bubble id={myId} />
          <SpeakingIcon id={myId} />
        </div>
      </Html>
    </group>
  );
}

function shortAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ------------------------------------------------------------------ espectador

const specLook = new THREE.Vector3();

/** Câmera livre dos mortos. */
export function SpectatorCamera() {
  const alive = useStore((s) => s.you?.alive ?? true);
  const ended = useStore((s) => !!s.end);
  const { camera } = useThree();
  const st = useRef({ yaw: 0, pitch: -0.4, init: false });
  const pos = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    if (alive || ended) {
      st.current.init = false;
      return;
    }
    const dt = Math.min(rawDt, 0.1);
    if (!st.current.init) {
      st.current.init = true;
      pos.current.copy(camera.position);
      st.current.yaw = net.cameraYaw;
    }
    const s = input.sample();
    const c = st.current;
    c.yaw -= s.lookX * 0.0032;
    c.pitch = Math.max(-1.4, Math.min(1.2, c.pitch - s.lookY * 0.0026));
    const speed = (s.run ? 22 : 10) * dt;
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    const rx = -Math.cos(c.yaw);
    const rz = Math.sin(c.yaw);
    pos.current.x += (fx * s.forward + rx * s.strafe) * speed;
    pos.current.z += (fz * s.forward + rz * s.strafe) * speed;
    pos.current.y = Math.max(1, Math.min(60, pos.current.y + s.vertical * speed));
    const lim = 95;
    pos.current.x = Math.max(-lim, Math.min(lim, pos.current.x));
    pos.current.z = Math.max(-lim, Math.min(lim, pos.current.z));
    camera.position.copy(pos.current);
    specLook.set(
      pos.current.x + Math.sin(c.yaw) * Math.cos(c.pitch),
      pos.current.y + Math.sin(c.pitch),
      pos.current.z + Math.cos(c.yaw) * Math.cos(c.pitch),
    );
    camera.lookAt(specLook);
    net.cameraYaw = c.yaw;
    net.local.x = pos.current.x;
    net.local.z = pos.current.z;
    voice.update();
  });
  return null;
}

// ------------------------------------------------------------------ câmera cinematográfica

const orbitLook = new THREE.Vector3();

/** Câmera girando devagar sobre a vila (fim de partida e menus). */
export function OrbitCamera({ active, center = [0, 0], radius = 26, height = 11, speed = 0.05 }: {
  active: boolean;
  center?: [number, number];
  radius?: number;
  height?: number;
  speed?: number;
}) {
  const { camera } = useThree();
  const t = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    if (!active) return;
    t.current += dt * speed;
    const x = center[0] + Math.cos(t.current) * radius;
    const z = center[1] + Math.sin(t.current) * radius;
    camera.position.lerp(orbitLook.set(x, height, z), 1 - Math.exp(-dt * 1.5));
    camera.lookAt(center[0], 2, center[1]);
    net.cameraYaw = Math.atan2(center[0] - x, center[1] - z);
  });
  return null;
}
