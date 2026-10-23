/**
 * Efeitos visuais: partículas (pool fixo, sem alocar por evento), efeitos de cada habilidade,
 * ambiente vivo (vagalumes, poeira, folhas, fumaça),
 * visão térmica e escolha de alvo. Tudo é descartado (dispose) ao desmontar.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG, LAMP_POSITIONS, MAP_BLOCKS, locationAt, type FxMsg } from '@nevoeiro/shared';
import { net, type FxItem } from '../net/netState';
import { getState, useStore } from '../net/store';
import type { QualityProfile } from '../quality';
import { THEME } from '../theme';
import { pickBodyTarget, pickPlayerTarget, roleAbilities } from './abilities';

// ======================================================================== texturas

function makeSoftTexture(inner = 0.55): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(255,255,255,${inner})`);
  grd.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ======================================================================== partículas

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  // some com a distância (a neblina esconde efeitos longe)
  vAlpha = aAlpha * smoothstep(55.0, 28.0, -mv.z);
  vColor = aColor;
}`;
const PARTICLE_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.003) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface SpawnOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  color: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  drag?: number;
  /** tamanho final relativo (crescer/encolher) */
  grow?: number;
}

/** Pool fixo de partículas desenhado num único draw call. */
class ParticlePool {
  readonly points: THREE.Points;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly grow: Float32Array;
  private cursor = 0;
  private readonly tmp = new THREE.Color();

  constructor(
    readonly capacity: number,
    map: THREE.Texture,
    blending: THREE.Blending,
  ) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 300 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  spawn(o: SpawnOpts) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos.set([o.x, o.y, o.z], i * 3);
    this.vel.set([o.vx ?? 0, o.vy ?? 0, o.vz ?? 0], i * 3);
    this.tmp.set(o.color);
    this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.baseSize[i] = o.size;
    this.baseAlpha[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.grow[i] = o.grow ?? 1;
  }

  update(dt: number, viewportHeight: number) {
    this.mat.uniforms.uScale.value = viewportHeight * 0.5;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = 1 - Math.max(0, this.life[i]) / this.maxLife[i]; // 0→1
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.baseSize[i] * (1 + (this.grow[i] - 1) * k);
      // entra rápido, some devagar
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, k * 8) * (1 - k);
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[name].needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ======================================================================== efeitos de habilidades

const C = THEME.role;
const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Objetos de efeito reaproveitados (nada é criado por evento). */
interface MeshFx {
  tracer: THREE.Mesh;
  beam: THREE.Mesh;
  ripples: THREE.Mesh[];
  cuffs: THREE.Group;
  lens: THREE.Sprite;
  lights: THREE.PointLight[];
  dispose: () => void;
}

function createMeshFx(): MeshFx {
  const basic = (color: string, opacity = 1) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), basic('#FFE9B0'));
  tracer.visible = false;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.9, 16, 20, 1, true), basic(C.anjo, 0.4));
  beam.visible = false;
  const ripples = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), basic(C.metamorfo, 0.9));
    m.rotation.x = Math.PI / 2;
    m.visible = false;
    return m;
  });
  const cuffs = new THREE.Group();
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 6, 20), basic(C.detetive));
    r.position.x = s * 0.4;
    cuffs.add(r);
  }
  cuffs.visible = false;
  // lupa desenhada em canvas
  const lc = document.createElement('canvas');
  lc.width = lc.height = 128;
  const g = lc.getContext('2d')!;
  g.strokeStyle = C.detetive;
  g.lineWidth = 10;
  g.shadowColor = C.detetive;
  g.shadowBlur = 18;
  g.beginPath();
  g.arc(54, 54, 30, 0, Math.PI * 2);
  g.moveTo(76, 76);
  g.lineTo(108, 108);
  g.stroke();
  const lensTex = new THREE.CanvasTexture(lc);
  const lens = new THREE.Sprite(new THREE.SpriteMaterial({ map: lensTex, transparent: true, depthWrite: false, toneMapped: false }));
  lens.scale.setScalar(1.1);
  lens.visible = false;
  // luzes fixas (nunca adicionadas/removidas: evita recompilar shaders)
  const lights = [0, 1].map(() => {
    const l = new THREE.PointLight('#ffffff', 0, 14, 2);
    return l;
  });
  return {
    tracer,
    beam,
    ripples,
    cuffs,
    lens,
    lights,
    dispose: () => {
      for (const o of [tracer, beam, ...ripples, ...(cuffs.children as THREE.Mesh[])]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      lensTex.dispose();
      lens.material.dispose();
    },
  };
}

interface Anim {
  until: number;
  start: number;
  fn: (k: number) => void;
  end: () => void;
}

export function FxLayer({ quality }: { quality: QualityProfile }) {
  const { scene, size } = useThree();
  const soft = useMemo(() => makeSoftTexture(0.9), []);
  const glow = useMemo(() => new ParticlePool(quality.particles, soft, THREE.AdditiveBlending), [quality.particles, soft]);
  const mist = useMemo(() => new ParticlePool(Math.round(quality.particles / 2), soft, THREE.NormalBlending), [quality.particles, soft]);
  const meshFx = useMemo(createMeshFx, []);
  const handled = useRef(0);
  const anims = useRef<Anim[]>([]);
  const lightSlot = useRef(0);

  useEffect(() => {
    const objs = [glow.points, mist.points, meshFx.tracer, meshFx.beam, ...meshFx.ripples, meshFx.cuffs, meshFx.lens, ...meshFx.lights];
    scene.add(...objs);
    return () => {
      scene.remove(...objs);
      glow.dispose();
      mist.dispose();
    };
  }, [scene, glow, mist, meshFx]);
  useEffect(() => () => {
    meshFx.dispose();
    soft.dispose();
  }, [meshFx, soft]);

  const flash = (x: number, y: number, z: number, color: string, intensity: number, ms: number) => {
    const l = meshFx.lights[lightSlot.current++ % meshFx.lights.length];
    l.position.set(x, y, z);
    l.color.set(color);
    animate(ms, (k) => (l.intensity = intensity * (1 - k)), () => (l.intensity = 0));
  };
  const animate = (ms: number, fn: (k: number) => void, end: () => void) => {
    const now = performance.now();
    anims.current.push({ start: now, until: now + ms, fn, end });
  };

  const burst = (pool: ParticlePool, n: number, base: (i: number) => SpawnOpts) => {
    for (let i = 0; i < n; i++) pool.spawn(base(i));
  };

  const play = (f: FxMsg) => {
    const { x, z } = f;
    switch (f.kind) {
      case 'teleport-out': // implosão: partículas convergem para o centro
        burst(glow, 60, () => {
          const a = rnd(0, Math.PI * 2);
          const e = rnd(-0.6, 1);
          const r = 1.9;
          const px = Math.cos(a) * r * Math.cos(e);
          const py = Math.sin(e) * r;
          const pz = Math.sin(a) * r * Math.cos(e);
          return { x: x + px, y: 1 + py, z: z + pz, vx: -px / 0.45, vy: -py / 0.45, vz: -pz / 0.45, life: 0.45, size: 0.22, color: C.teleportador, grow: 0.3 };
        });
        flash(x, 1.2, z, C.teleportador, 18, 400);
        break;
      case 'teleport-in': // explosão no destino
        burst(glow, 80, () => {
          const a = rnd(0, Math.PI * 2);
          const e = rnd(-0.3, 1.2);
          const sp = rnd(3, 7);
          return { x, y: 1, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp, life: rnd(0.5, 0.9), size: 0.25, color: C.teleportador, drag: 3, grow: 0.2 };
        });
        ripple(x, z, C.teleportador, 3.5, 500);
        flash(x, 1.2, z, C.teleportador, 25, 600);
        break;
      case 'morph': // espiral roxa + ondulação
        burst(glow, 50, (i) => {
          const a = (i / 50) * Math.PI * 6;
          return { x: x + Math.cos(a) * 0.7, y: 0.2 + (i / 50) * 2, z: z + Math.sin(a) * 0.7, vx: -Math.sin(a) * 1.5, vy: 0.6, vz: Math.cos(a) * 1.5, life: 0.8, size: 0.18, color: C.metamorfo };
        });
        ripple(x, z, C.metamorfo, 2.2, 650);
        break;
      case 'vanish':
      case 'appear':
        burst(glow, 40, () => ({ x: x + rnd(-0.4, 0.4), y: rnd(0.2, 1.8), z: z + rnd(-0.4, 0.4), vy: rnd(0.4, 1.2), vx: rnd(-0.3, 0.3), vz: rnd(-0.3, 0.3), life: rnd(0.7, 1.2), size: 0.2, color: C.fantasma, alpha: 0.7 }));
        break;
      case 'zombie': // névoa verde do retorno (só ele e os parceiros recebem este efeito)
        burst(mist, 70, () => ({ x: x + rnd(-1.4, 1.4), y: rnd(0.1, 1.2), z: z + rnd(-1.4, 1.4), vy: rnd(0.1, 0.5), vx: rnd(-0.3, 0.3), vz: rnd(-0.3, 0.3), life: rnd(2, 3.2), size: 1.4, color: C.zumbi, alpha: 0.35, grow: 2.2 }));
        burst(glow, 25, () => ({ x: x + rnd(-1, 1), y: 0.2, z: z + rnd(-1, 1), vy: rnd(0.8, 1.8), life: 1.5, size: 0.15, color: C.zumbi }));
        break;
      case 'shot': {
        const x2 = f.x2 ?? x;
        const z2 = f.z2 ?? z;
        // clarão na boca da arma + faíscas + rastro da bala
        const dx = x2 - x;
        const dz = z2 - z;
        const len = Math.hypot(dx, dz) || 1;
        const mx = x + (dx / len) * 0.6;
        const mz = z + (dz / len) * 0.6;
        burst(glow, 22, () => ({ x: mx, y: 1.35, z: mz, vx: (dx / len) * rnd(2, 6) + rnd(-1, 1), vy: rnd(-0.5, 1.5), vz: (dz / len) * rnd(2, 6) + rnd(-1, 1), life: rnd(0.15, 0.35), size: 0.12, color: '#FFD27A', drag: 4 }));
        flash(mx, 1.4, mz, '#FFC870', 45, 180);
        const t = meshFx.tracer;
        t.visible = true;
        animate(260, (k) => {
          // a bala viaja da arma até o alvo deixando um rastro curto
          const head = Math.min(1, k * 2.2);
          const tail = Math.max(0, head - 0.35);
          const hx = x + dx * head;
          const hz = z + dz * head;
          const tx = x + dx * tail;
          const tz = z + dz * tail;
          const l = Math.max(0.01, Math.hypot(hx - tx, hz - tz));
          t.position.set((hx + tx) / 2, 1.3, (hz + tz) / 2);
          t.scale.set(1, l, 1);
          t.quaternion.setFromUnitVectors(UP, tmpDir.set(dx / len, 0, dz / len));
          (t.material as THREE.MeshBasicMaterial).opacity = 1 - k;
        }, () => (t.visible = false));
        break;
      }
      case 'kill':
        burst(glow, 18, () => ({ x: x + rnd(-0.2, 0.2), y: 1.1, z: z + rnd(-0.2, 0.2), vx: rnd(-1.5, 1.5), vy: rnd(0.5, 2.5), vz: rnd(-1.5, 1.5), life: 0.7, size: 0.13, color: '#9A1B22', gravity: 7 }));
        break;
      case 'cuff': {
        burst(glow, 18, () => ({ x, y: 1.1, z, vx: rnd(-2, 2), vy: rnd(0, 2), vz: rnd(-2, 2), life: 0.4, size: 0.12, color: C.detetive, drag: 3 }));
        const g = meshFx.cuffs;
        g.visible = true;
        g.position.set(x, 1.05, z);
        animate(700, (k) => {
          const close = Math.min(1, k * 2.5);
          g.children[0].position.x = -0.4 + close * 0.2;
          g.children[1].position.x = 0.4 - close * 0.2;
          g.rotation.y = k * Math.PI;
          for (const ch of g.children) ((ch as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = k > 0.75 ? (1 - k) * 4 : 1;
        }, () => (g.visible = false));
        break;
      }
      case 'revive': {
        const b = meshFx.beam;
        b.visible = true;
        b.position.set(x, 8, z);
        animate(2600, (k) => {
          (b.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
          b.scale.set(1 - k * 0.3, 1, 1 - k * 0.3);
        }, () => (b.visible = false));
        burst(glow, 90, () => ({ x: x + rnd(-0.8, 0.8), y: rnd(0, 1.5), z: z + rnd(-0.8, 0.8), vy: rnd(1, 3.5), life: rnd(1.2, 2.4), size: 0.18, color: C.anjo, drag: 0.4 }));
        flash(x, 2, z, C.anjo, 30, 2200);
        break;
      }
      case 'lamp': {
        // lampião acendendo: faíscas subindo da cabeça do poste
        let lx = x;
        let lz = z;
        let best = Infinity;
        for (const [px, pz] of LAMP_POSITIONS) {
          const d = Math.hypot(px - x, pz - z);
          if (d < best) {
            best = d;
            lx = px;
            lz = pz;
          }
        }
        burst(glow, 40, () => ({ x: lx + rnd(-0.15, 0.15), y: 4.2, z: lz + rnd(-0.15, 0.15), vx: rnd(-1.2, 1.2), vy: rnd(0.5, 2.6), vz: rnd(-1.2, 1.2), life: rnd(0.6, 1.3), size: 0.12, color: THEME.warmLight, gravity: 2, drag: 1.2 }));
        flash(lx, 4.2, lz, THEME.warmLight, 30, 900);
        break;
      }
      case 'bell': {
        // sino: anéis dourados e poeira caindo da torre
        const tx = 0;
        const tz = -57.5;
        burst(glow, 50, () => ({ x: tx + rnd(-2, 2), y: rnd(13, 16), z: tz + rnd(-2, 2), vx: rnd(-0.6, 0.6), vy: rnd(-1.4, -0.2), vz: rnd(-0.6, 0.6), life: rnd(1.6, 2.6), size: 0.16, color: THEME.task, alpha: 0.8 }));
        ripple(x, z, THEME.task, 6, 1200);
        setTimeout(() => ripple(x, z, THEME.task, 9, 1400), 450);
        flash(tx, 14, tz, THEME.task, 40, 1600);
        break;
      }
      case 'examine': {
        const s = meshFx.lens;
        s.visible = true;
        s.position.set(x, 1.4, z);
        animate(1300, (k) => {
          s.position.y = 1.2 + k * 0.6;
          s.material.opacity = Math.sin(k * Math.PI);
          s.material.rotation = Math.sin(k * 6) * 0.2;
        }, () => (s.visible = false));
        burst(glow, 14, () => ({ x: x + rnd(-0.5, 0.5), y: rnd(0.2, 1), z: z + rnd(-0.5, 0.5), vy: rnd(0.3, 0.9), life: 1, size: 0.12, color: C.detetive }));
        break;
      }
    }
  };

  const ripple = (x: number, z: number, color: string, radius: number, ms: number) => {
    const r = meshFx.ripples.find((m) => !m.visible) ?? meshFx.ripples[0];
    r.visible = true;
    r.position.set(x, 0.15, z);
    (r.material as THREE.MeshBasicMaterial).color.set(color);
    animate(ms, (k) => {
      r.scale.setScalar(0.2 + k * radius);
      (r.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      r.position.y = 0.15 + Math.sin(k * Math.PI) * 0.6;
    }, () => (r.visible = false));
  };

  useFrame((_, dt) => {
    // novos eventos vindos do servidor
    for (const f of net.fx as FxItem[]) {
      if (f.seq <= handled.current) continue;
      handled.current = f.seq;
      play(f);
    }
    const now = performance.now();
    anims.current = anims.current.filter((a) => {
      const k = Math.min(1, (now - a.start) / (a.until - a.start));
      a.fn(k);
      if (k >= 1) {
        a.end();
        return false;
      }
      return true;
    });
    glow.update(Math.min(dt, 0.05), size.height);
    mist.update(Math.min(dt, 0.05), size.height);
  });
  return null;
}

// ======================================================================== neblina

// ======================================================================== ambiente vivo

/** Poeira (cinza, lenta) e vagalumes (piscando) ao redor do jogador. */
export function AmbientParticles({ dust, fireflies }: { dust: number; fireflies: number }) {
  const soft = useMemo(() => makeSoftTexture(1), []);
  const total = dust + fireflies;
  const { geo, seeds, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const size = new Float32Array(total);
    const alpha = new Float32Array(total);
    const seeds = new Float32Array(total * 4);
    const fire = new THREE.Color(THEME.scene.firefly);
    const dustC = new THREE.Color(THEME.fog);
    for (let i = 0; i < total; i++) {
      seeds[i * 4] = (Math.random() - 0.5) * 50;
      seeds[i * 4 + 1] = Math.random() * 3 + 0.3;
      seeds[i * 4 + 2] = (Math.random() - 0.5) * 50;
      seeds[i * 4 + 3] = Math.random() * 100;
      const c = i < fireflies ? fire : dustC;
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = i < fireflies ? 0.16 : 0.07;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: soft }, uScale: { value: 300 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geo: g, seeds, mat: m };
  }, [total, fireflies, soft]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  useEffect(() => () => soft.dispose(), [soft]);
  const { size } = useThree();

  useFrame(({ clock }) => {
    if (!total) return;
    const t = clock.elapsedTime;
    const pos = geo.attributes.position.array as Float32Array;
    const alpha = geo.attributes.aAlpha.array as Float32Array;
    const half = 25;
    const zone = locationAt(net.local.x, net.local.z).id;
    // mais vagalumes na floresta e no cemitério, poucos na praça
    const fireMul = zone === 'floresta' ? 1 : zone === 'cemiterio' ? 0.8 : zone === 'praca' ? 0.25 : 0.5;
    for (let i = 0; i < total; i++) {
      const sd = seeds[i * 4 + 3];
      const isFire = i < fireflies;
      const wobX = Math.sin(t * (isFire ? 0.6 : 0.15) + sd) * (isFire ? 1.5 : 3);
      const wobZ = Math.cos(t * (isFire ? 0.5 : 0.12) + sd * 1.3) * (isFire ? 1.5 : 3);
      let x = seeds[i * 4] + wobX + t * (isFire ? 0 : 0.2);
      let z = seeds[i * 4 + 2] + wobZ;
      x = ((((x - net.local.x + half) % (half * 2)) + half * 2) % (half * 2)) - half + net.local.x;
      z = ((((z - net.local.z + half) % (half * 2)) + half * 2) % (half * 2)) - half + net.local.z;
      pos[i * 3] = x;
      pos[i * 3 + 1] = seeds[i * 4 + 1] + Math.sin(t * 0.7 + sd) * 0.3;
      pos[i * 3 + 2] = z;
      alpha[i] = isFire ? fireMul * Math.max(0, Math.sin(t * 2.2 + sd * 7)) ** 3 : 0.35;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    mat.uniforms.uScale.value = size.height * 0.5;
  });
  return total ? <points geometry={geo} material={mat} frustumCulled={false} /> : null;
}

/** Folhas caindo perto do jogador quando está na floresta (instancing). */
export function FallingLeaves({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.16, 0.1);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6B4A22', side: THREE.DoubleSide, roughness: 1, transparent: true, opacity: 0.9 }), []);
  const state = useMemo(
    () => Array.from({ length: count }, () => ({ x: 0, y: -1, z: 0, vy: 0, spin: Math.random() * 3, phase: Math.random() * 10 })),
    [count],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);

  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const zone = locationAt(net.local.x, net.local.z).id;
    const active = zone === 'floresta' || zone === 'cemiterio';
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const s = state[i];
      if (s.y < 0) {
        if (!active || Math.random() > 0.02) {
          dummy.position.set(0, -10, 0);
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
          continue;
        }
        s.x = net.local.x + (Math.random() - 0.5) * 30;
        s.z = net.local.z + (Math.random() - 0.5) * 30;
        s.y = 6 + Math.random() * 4;
        s.vy = 0.5 + Math.random() * 0.6;
      }
      s.y -= s.vy * dt;
      const sway = Math.sin(t * 1.5 + s.phase);
      dummy.position.set(s.x + sway * 0.6, s.y, s.z + Math.cos(t * 1.1 + s.phase) * 0.4);
      dummy.rotation.set(t * s.spin, sway, t * s.spin * 0.6);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return count ? <instancedMesh ref={mesh} args={[geo, mat, count]} frustumCulled={false} /> : null;
}

/** Fumaça saindo das chaminés (só as próximas). */
export function ChimneySmoke() {
  const soft = useMemo(() => makeSoftTexture(0.5), []);
  const pool = useMemo(() => new ParticlePool(220, soft, THREE.NormalBlending), [soft]);
  const { scene, size } = useThree();
  const chimneys = useMemo(
    () => MAP_BLOCKS.filter((b) => b.kind === 'building' && b.chimney).map((b) => chimneyPos(b)),
    [],
  );
  const acc = useRef(0);
  useEffect(() => {
    scene.add(pool.points);
    return () => {
      scene.remove(pool.points);
      pool.dispose();
      soft.dispose();
    };
  }, [scene, pool, soft]);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.18) {
      acc.current = 0;
      for (const c of chimneys) {
        if (Math.hypot(c.x - net.local.x, c.z - net.local.z) > 60) continue;
        pool.spawn({ x: c.x + rnd(-0.1, 0.1), y: c.y, z: c.z + rnd(-0.1, 0.1), vx: rnd(0.1, 0.35), vy: rnd(0.5, 0.9), vz: rnd(-0.1, 0.1), life: rnd(3.5, 5), size: 0.9, color: '#5B6170', alpha: 0.45, grow: 3.2, drag: 0.1 });
      }
    }
    pool.update(Math.min(dt, 0.05), size.height);
  });
  return null;
}

export function chimneyPos(b: { x: number; z: number; w: number; d: number; h: number }) {
  const roofH = Math.min(b.w, b.d) * 0.45;
  return { x: b.x + b.w * 0.25, y: b.h + roofH * 0.75 + 1.1, z: b.z - b.d * 0.15 };
}

// ======================================================================== visão térmica

const thermalMat = new THREE.MeshBasicMaterial({ color: '#FF3B1F', transparent: true, opacity: 0.9, depthTest: false, toneMapped: false });
const thermalCore = new THREE.MeshBasicMaterial({ color: '#FFF07A', transparent: true, opacity: 0.95, depthTest: false, toneMapped: false });
const thermalOuter = new THREE.CapsuleGeometry(0.36, 1.1, 4, 10);
const thermalInner = new THREE.CapsuleGeometry(0.18, 0.6, 4, 8);

/** Rastreador: silhuetas quentes através de paredes e neblina (o filtro de tela fica no pós). */
export function ThermalVision() {
  const on = useStore((s) => s.you?.thermal ?? false);
  const meshes = useRef<THREE.Group[]>([]);
  useFrame(() => {
    const list = on ? net.thermal : [];
    for (let i = 0; i < meshes.current.length; i++) {
      const m = meshes.current[i];
      const t = list[i];
      m.visible = !!t;
      if (t) m.position.set(t.x, 0, t.z);
    }
  });
  return (
    <group>
      {Array.from({ length: 16 }, (_, i) => (
        <group key={i} ref={(g) => { if (g) meshes.current[i] = g; }} visible={false}>
          <mesh material={thermalMat} geometry={thermalOuter} position={[0, 0.95, 0]} renderOrder={999} />
          <mesh material={thermalCore} geometry={thermalInner} position={[0, 1.1, 0]} renderOrder={1000} />
        </group>
      ))}
    </group>
  );
}

// ======================================================================== alvo atual

/** Calcula o alvo das habilidades (destacado com contorno no mundo e no HUD). */
export function TargetSystem() {
  const last = useRef('');
  useFrame(() => {
    const st = getState();
    const abilities = roleAbilities();
    let target = null;
    let bodyTarget = null;
    if (st.you?.alive && st.phase === 'playing' && !st.end) {
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
