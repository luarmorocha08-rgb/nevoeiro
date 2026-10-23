import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CONFIG, EF, ROLE_INFO, stepMovement, type InputMsg, type RoleId } from '@nevoeiro/shared';
import { input } from '../input/InputManager';
import { sendInput } from '../net/connection';
import { interpolate, net } from '../net/netState';
import { getState, useStore, type EntityView } from '../net/store';
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

function RemotePlayer({ view }: { view: EntityView }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const motion = useRef<Motion>({ speed: 0 });
  const tagRef = useRef<HTMLDivElement>(null);
  const highlight = useRef<THREE.Mesh>(null);
  const v = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const ent = net.entities.get(view.id);
    if (!ent || !group.current) return;
    interpolate(ent, dt);
    group.current.position.set(ent.rx, 0, ent.rz);
    group.current.rotation.y = ent.ry;
    motion.current.speed = ent.flags & EF.FROZEN ? 0 : ent.speed;
    body.current?.setNextKinematicTranslation(v.current.set(ent.rx, 0.9, ent.rz));

    const d = Math.hypot(ent.rx - net.local.x, ent.rz - net.local.z);
    if (tagRef.current) tagRef.current.style.opacity = d < CONFIG.view.nameTagDistance ? '1' : '0';
    if (highlight.current) {
      const st = getState();
      highlight.current.visible = st.target?.id === view.id;
    }
  });

  const showName = !view.noName;
  return (
    <group ref={group}>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} userData={{ player: view.id }}>
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>
      <CharacterModel skin={view.skin} motion={motion} ghost={view.ghost} />
      <mesh ref={highlight} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
        <ringGeometry args={[0.55, 0.7, 32]} />
        <meshBasicMaterial color="#ff4040" transparent opacity={0.85} />
      </mesh>
      <Html position={[0, 2.25, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={tagRef} className="nametag">
          <Bubble id={view.id} />
          <SpeakingIcon id={view.id} />
          {showName && (
            <span className={`nametag-name${view.ally ? ' ally' : ''}`}>
              {view.name}
              {view.ally && <em> · parceiro</em>}
              {view.role && <em className="role-tag" style={{ color: ROLE_INFO[view.role as RoleId]?.color }}> · {ROLE_INFO[view.role as RoleId]?.name}</em>}
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
  return speaking ? <span className="speaking-icon">◉</span> : null;
}

// ------------------------------------------------------------------ jogador local + câmera

const INPUT_DT = 1 / CONFIG.net.inputRate;
const CAM_DIST = 4.6;
const tmpTarget = new THREE.Vector3();
const tmpDesired = new THREE.Vector3();

export function LocalPlayer() {
  const role = useStore((s) => s.role);
  const myId = role?.netId;
  const alive = useStore((s) => s.you?.alive ?? true);
  const disguise = useStore((s) => s.you?.disguise ?? null);
  const invisible = useStore((s) => s.you?.invisible ?? false);
  const lobbySkin = useStore((s) => s.players.find((p) => p.id === s.sessionId)?.skin ?? 'capuz-vinho');
  const disguiseSkin = useStore((s) => s.you?.disguiseSkin ?? null);
  const group = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const motion = useRef<Motion>({ speed: 0 });
  const sim = useRef({ x: 0, z: 0, init: false });
  const render = useRef({ x: 0, z: 0 });
  const yaw = useRef(0);
  const cam = useRef({ yaw: Math.PI, pitch: 0.32, dist: CAM_DIST });
  const acc = useRef(0);
  const lastVersion = useRef(-1);
  const lastSentZero = useRef(false);
  const { camera } = useThree();
  const { world, rapier } = useRapier();

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const you = net.you;
    if (!you || !group.current) return;
    const st = getState();

    // ---------- reconciliação com o servidor
    if (net.youVersion !== lastVersion.current) {
      lastVersion.current = net.youVersion;
      if (!sim.current.init) {
        sim.current = { x: you.x, z: you.z, init: true };
        render.current = { x: you.x, z: you.z };
        cam.current.yaw = Math.atan2(-you.x, -you.z);
        net.seq = Math.max(net.seq, you.ack);
      }
      if (net.seq < you.ack) net.seq = you.ack;
      net.pending = net.pending.filter((p) => p.seq > you.ack);
      let p = { x: you.x, z: you.z };
      if (you.alive && you.frozen <= 0 && st.phase === 'playing') {
        for (const inp of net.pending) p = stepMovement(p, inp);
      }
      const err = Math.hypot(p.x - sim.current.x, p.z - sim.current.z);
      if (err > CONFIG.net.snapDistance) {
        sim.current.x = p.x;
        sim.current.z = p.z;
        render.current = { x: p.x, z: p.z };
      } else if (err > 0.01) {
        sim.current.x += (p.x - sim.current.x) * 0.25;
        sim.current.z += (p.z - sim.current.z) * 0.25;
      }
    }

    if (!you.alive) {
      group.current.visible = false;
      return; // espectador: a câmera livre cuida da entrada
    }

    // ---------- entrada
    const s = input.sample();
    const c = cam.current;
    c.yaw -= s.lookX * 0.0032;
    c.pitch = Math.max(-0.25, Math.min(1.1, c.pitch + s.lookY * 0.0026));
    net.cameraYaw = c.yaw;

    const canMove = you.alive && you.frozen <= 0 && st.phase === 'playing' && !st.end;
    acc.current += dt;
    while (acc.current >= INPUT_DT) {
      acc.current -= INPUT_DT;
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      const rx = -Math.cos(c.yaw);
      const rz = Math.sin(c.yaw);
      let mx = fx * s.forward + rx * s.strafe;
      let mz = fz * s.forward + rz * s.strafe;
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      const moving = len > 0.05 && canMove;
      if (!moving && lastSentZero.current) continue;
      const msg: InputMsg = {
        seq: ++net.seq,
        dt: INPUT_DT,
        mx: moving ? mx : 0,
        mz: moving ? mz : 0,
        run: s.run,
        yaw: c.yaw,
      };
      lastSentZero.current = !moving;
      if (moving) {
        const next = stepMovement(sim.current, msg);
        sim.current.x = next.x;
        sim.current.z = next.z;
        yaw.current = Math.atan2(mx, mz);
      }
      net.pending.push(msg);
      if (net.pending.length > 120) net.pending.shift();
      sendInput(msg);
    }

    // ---------- render suave
    const r = render.current;
    const px = r.x;
    const pz = r.z;
    const k = 1 - Math.exp(-dt * 20);
    r.x += (sim.current.x - r.x) * k;
    r.z += (sim.current.z - r.z) * k;
    motion.current.speed = dt > 0 ? Math.hypot(r.x - px, r.z - pz) / dt : 0;
    group.current.position.set(r.x, 0, r.z);
    group.current.rotation.y += (shortAngle(yaw.current - group.current.rotation.y)) * (1 - Math.exp(-dt * 14));
    group.current.visible = you.alive;
    net.local.x = r.x;
    net.local.z = r.z;
    net.local.yaw = yaw.current;
    body.current?.setNextKinematicTranslation({ x: r.x, y: 0.9, z: r.z });

    // ---------- câmera em terceira pessoa com colisão (raycast no Rapier)
    tmpTarget.set(r.x, 1.55, r.z);
    const horiz = Math.cos(c.pitch) * c.dist;
    tmpDesired.set(r.x - Math.sin(c.yaw) * horiz, 1.55 + Math.sin(c.pitch) * c.dist, r.z - Math.cos(c.yaw) * horiz);
    const dir = tmpDesired.clone().sub(tmpTarget);
    const maxDist = dir.length();
    dir.normalize();
    let dist = maxDist;
    try {
      const ray = new rapier.Ray(tmpTarget, dir);
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
    camera.position.lerp(tmpTarget.clone().addScaledVector(dir, dist), 1 - Math.exp(-dt * 25));
    camera.lookAt(tmpTarget);

    voice.update();
  });

  if (!myId) return null;
  const skin = disguise && disguiseSkin ? disguiseSkin : lobbySkin;
  return (
    <group ref={group}>
      <RigidBody ref={body} type="kinematicPosition" colliders={false}>
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>
      {alive && <CharacterModel skin={skin} motion={motion} ghost={invisible} />}
      <Html position={[0, 2.25, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
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

/** Câmera livre dos mortos. */
export function SpectatorCamera() {
  const alive = useStore((s) => s.you?.alive ?? true);
  const { camera } = useThree();
  const st = useRef({ yaw: 0, pitch: -0.4, init: false });
  const pos = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    if (alive) {
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
    const look = new THREE.Vector3(
      pos.current.x + Math.sin(c.yaw) * Math.cos(c.pitch),
      pos.current.y + Math.sin(c.pitch),
      pos.current.z + Math.cos(c.yaw) * Math.cos(c.pitch),
    );
    camera.lookAt(look);
    net.cameraYaw = c.yaw;
    net.local.x = pos.current.x;
    net.local.z = pos.current.z;
    voice.update();
  });
  return null;
}
