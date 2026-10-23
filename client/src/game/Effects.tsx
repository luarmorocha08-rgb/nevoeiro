import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG, ROLE_INFO } from '@nevoeiro/shared';
import { net, type FxItem } from '../net/netState';
import { getState, useStore } from '../net/store';
import { pickBodyTarget, pickPlayerTarget, roleAbilities } from './abilities';

// ------------------------------------------------------------------ neblina volumétrica barata

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Nuvens de neblina rasteiras que acompanham o jogador. */
export function FogParticles({ count }: { count: number }) {
  const points = useRef<THREE.Points>(null);
  const { geo, seeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds[i * 3] = (Math.random() - 0.5) * 70;
      seeds[i * 3 + 1] = 0.4 + Math.random() * 2.6;
      seeds[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo: g, seeds };
  }, [count]);
  const tex = useMemo(softTexture, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const arr = geo.attributes.position.array as Float32Array;
    const half = 35;
    for (let i = 0; i < count; i++) {
      let x = seeds[i * 3] + t * 0.35 + Math.sin(t * 0.1 + i) * 2;
      let z = seeds[i * 3 + 2] + t * 0.15;
      // mantém as nuvens num cubo ao redor do jogador
      x = ((((x - net.local.x + half) % (half * 2)) + half * 2) % (half * 2)) - half + net.local.x;
      z = ((((z - net.local.z + half) % (half * 2)) + half * 2) % (half * 2)) - half + net.local.z;
      arr[i * 3] = x;
      arr[i * 3 + 1] = seeds[i * 3 + 1] + Math.sin(t * 0.3 + i) * 0.2;
      arr[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geo} frustumCulled={false}>
      <pointsMaterial map={tex} size={9} sizeAttenuation transparent depthWrite={false} color="#8fa4ad" opacity={0.22} fog />
    </points>
  );
}

// ------------------------------------------------------------------ visão térmica

const thermalMat = new THREE.MeshBasicMaterial({ color: '#ff6a1f', transparent: true, opacity: 0.85, depthTest: false });
const thermalCore = new THREE.MeshBasicMaterial({ color: '#ffe36b', transparent: true, opacity: 0.9, depthTest: false });

/** Rastreador: silhuetas térmicas através de paredes e neblina. */
export function ThermalVision() {
  const on = useStore((s) => s.you?.thermal ?? false);
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.Group[]>([]);
  const { scene } = useThree();

  useFrame(() => {
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = on ? CONFIG.view.fogDensity * 0.35 : CONFIG.view.fogDensity;
    if (!group.current) return;
    const list = on ? net.thermal : [];
    for (let i = 0; i < meshes.current.length; i++) {
      const m = meshes.current[i];
      const t = list[i];
      m.visible = !!t;
      if (t) m.position.set(t.x, 0, t.z);
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: 16 }, (_, i) => (
        <group key={i} ref={(g) => { if (g) meshes.current[i] = g; }} visible={false}>
          <mesh material={thermalMat} position={[0, 0.95, 0]} renderOrder={999}>
            <capsuleGeometry args={[0.36, 1.1, 4, 10]} />
          </mesh>
          <mesh material={thermalCore} position={[0, 1.1, 0]} renderOrder={1000}>
            <capsuleGeometry args={[0.18, 0.6, 4, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ efeitos de eventos

export function FxLayer() {
  const group = useRef<THREE.Group>(null);
  const pool = useRef(new Map<number, THREE.Object3D>());

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = performance.now();
    const alive = new Set<number>();
    for (const f of net.fx) {
      const age = (now - f.born) / 1000;
      const life = f.kind === 'shot' ? 0.35 : f.kind === 'revive' ? 2.5 : 1.2;
      if (age > life) continue;
      alive.add(f.id);
      let obj = pool.current.get(f.id);
      if (!obj) {
        obj = makeFx(f);
        pool.current.set(f.id, obj);
        g.add(obj);
      }
      const k = age / life;
      obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && 'opacity' in m) m.opacity = (1 - k) * (o.userData.baseOpacity ?? 1);
      });
      if (f.kind !== 'shot') obj.scale.setScalar(f.kind === 'revive' ? 1 : 0.6 + k * 1.6);
    }
    for (const [id, obj] of pool.current) {
      if (!alive.has(id)) {
        g.remove(obj);
        pool.current.delete(id);
      }
    }
  });
  return <group ref={group} />;
}

function makeFx(f: FxItem): THREE.Object3D {
  const g = new THREE.Group();
  const basic = (color: string, opacity = 1) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    return m;
  };
  if (f.kind === 'shot' && f.x2 !== undefined && f.z2 !== undefined) {
    const a = new THREE.Vector3(f.x, 1.4, f.z);
    const b = new THREE.Vector3(f.x2, 1.2, f.z2);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), basic('#fff2b0'));
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    m.rotateX(Math.PI / 2);
    g.add(m);
    const flash = new THREE.PointLight('#ffcf70', 30, 14);
    flash.position.copy(a);
    g.add(flash);
    return g;
  }
  g.position.set(f.x, 0, f.z);
  const color =
    f.kind === 'kill' ? '#8a0b12' : f.kind === 'revive' ? '#fff6d8' : f.kind === 'cuff' ? '#9ad7ff' : f.kind === 'morph' ? '#b46bff' : '#4fe3d4';
  if (f.kind === 'revive') {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 14, 16, 1, true), basic(color, 0.45));
    pillar.position.y = 7;
    pillar.userData.baseOpacity = 0.45;
    (pillar.material as THREE.Material).side = THREE.DoubleSide;
    g.add(pillar);
    const l = new THREE.PointLight('#fff1c0', 20, 12);
    l.position.y = 2;
    g.add(l);
    return g;
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 6, 24), basic(color, 0.9));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  ring.userData.baseOpacity = 0.9;
  g.add(ring);
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), basic(color, 0.35));
  puff.position.y = 1;
  puff.userData.baseOpacity = 0.35;
  g.add(puff);
  return g;
}

// ------------------------------------------------------------------ alvo atual

/** Calcula o alvo das habilidades (destacado no mundo e no HUD). */
export function TargetSystem() {
  const last = useRef('');
  useFrame(() => {
    const st = getState();
    const abilities = roleAbilities();
    let target = null;
    let bodyTarget = null;
    if (st.you?.alive && st.phase === 'playing') {
      const pa = abilities.find((a) => a.target === 'player');
      const ba = abilities.find((a) => a.target === 'body');
      if (pa) target = pickPlayerTarget(pa);
      if (ba) bodyTarget = pickBodyTarget(ba);
    }
    const key = `${target?.id ?? ''}|${target?.name ?? ''}|${bodyTarget?.id ?? ''}`;
    if (key !== last.current) {
      last.current = key;
      st.set({ target, bodyTarget });
    }
  });
  return null;
}

export const roleColor = (id?: string) => (id ? ROLE_INFO[id as keyof typeof ROLE_INFO]?.color : undefined);
