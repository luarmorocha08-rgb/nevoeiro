/**
 * Atmosfera: controle da névoa (por área, dentro de casa, óculos térmicos e sino),
 * céu noturno que se funde com a névoa no horizonte e véus de névoa
 * (cortinas verticais suaves que passam devagar ao redor do jogador).
 */
import { Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG, MAP_BLOCKS, fogZoneAt } from '@nevoeiro/shared';
import { net } from '../net/netState';
import { getState } from '../net/store';
import { THEME } from '../theme';
import { MOON_DIR } from './fog';

const BUILDINGS = MAP_BLOCKS.filter((b) => b.kind === 'building');
function insideBuilding(x: number, z: number, pad = 0) {
  return BUILDINGS.some((b) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad);
}

/** Densidade da neblina: área, dentro de casa, óculos térmicos e sino da igreja. */
export function FogController({ fixedDensity, lite = false }: { fixedDensity?: number; lite?: boolean } = {}) {
  const { scene } = useThree();
  const current = useRef<number>(CONFIG.graphics.fogDensity);
  useFrame(({ clock }, dt) => {
    const fog = scene.fog as THREE.Fog | null;
    if (!fog) return;
    // tempo (vento); negativo = modo leve — ver fog.ts
    fog.near = lite ? -(clock.elapsedTime + 1) : clock.elapsedTime;
    if (fixedDensity !== undefined) {
      fog.far = fixedDensity;
      return;
    }
    const zone = fogZoneAt(net.local.x, net.local.z);
    let target = CONFIG.graphics.fogDensity * (CONFIG.graphics.fogZones[zone] ?? 1);
    if (insideBuilding(net.local.x, net.local.z)) target *= 0.55;
    if (getState().you?.thermal) target *= CONFIG.graphics.thermalFogFactor;
    if (net.bellUntil > performance.now()) target *= CONFIG.tasks.bellFogFactor;
    current.current += (target - current.current) * Math.min(1, dt * 0.8);
    fog.far = current.current;
  });
  return null;
}

// ------------------------------------------------------------------ céu

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // sempre no fundo
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uMoon;
uniform vec3 uMoonDir;
uniform float uTime;
uniform float uGlow;
uniform float uClouds;
varying vec3 vDir;
float h2(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float n2(vec2 p) { vec2 i = floor(p); vec2 u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float m = max(dot(d, uMoonDir), 0.0);
  // gradiente: horizonte = cor da névoa (os objetos somem nela sem emenda)
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, h));
  col *= 1.0 + pow(m, 5.0) * uGlow * (1.0 - smoothstep(0.0, 0.45, h));
  // nuvens finas iluminadas pela lua
  if (h > 0.02 && uClouds > 0.5) {
    vec2 uv = d.xz / (h + 0.25) * 2.2 + vec2(uTime * 0.008, uTime * 0.003);
    float c = n2(uv) * 0.65 + n2(uv * 2.3) * 0.35;
    c = smoothstep(0.5, 0.85, c) * smoothstep(0.02, 0.25, h);
    col = mix(col, uHorizon * 1.25 + uMoon * pow(m, 8.0) * 0.25, c * 0.55);
  }
  // lua: disco, halo e coroa
  col += uMoon * (smoothstep(0.99935, 0.99965, m) * 1.8 + pow(m, 220.0) * 0.6 + pow(m, 24.0) * 0.12);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Domo do céu que acompanha a câmera. */
export function SkyDome({ stars, clouds = true }: { stars: boolean; clouds?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uHorizon: { value: new THREE.Color(THEME.scene.fogFar) },
          uZenith: { value: new THREE.Color(THEME.scene.skyZenith) },
          uMoon: { value: new THREE.Color(THEME.moonlight) },
          uMoonDir: { value: MOON_DIR.clone() },
          uTime: { value: 0 },
          uGlow: { value: CONFIG.graphics.fog.moonGlow },
          uClouds: { value: 1 },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  const geo = useMemo(() => new THREE.SphereGeometry(80, 32, 16), []);
  useEffect(() => () => {
    mat.dispose();
    geo.dispose();
  }, [mat, geo]);
  useFrame(({ camera, clock }) => {
    group.current?.position.copy(camera.position);
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uClouds.value = clouds ? 1 : 0;
  });
  return (
    <group ref={group}>
      <mesh geometry={geo} material={mat} renderOrder={-10} frustumCulled={false} />
      {stars && <Stars radius={70} depth={20} count={1400} factor={2.6} saturation={0} fade speed={0.2} />}
    </group>
  );
}

// ------------------------------------------------------------------ véus de névoa

const VEIL_VERT = /* glsl */ `
attribute float aAlpha;
attribute float aSeed;
uniform float uRadius;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sx = length(instanceMatrix[0].xyz);
  float sy = length(instanceMatrix[1].xyz);
  vec3 toCam = cameraPosition - center;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
  vec3 world = center + right * position.x * sx + vec3(0.0, (position.y + 0.5) * sy, 0.0);
  float dist = length(toCam.xz);
  // some perto da câmera (sem "parede" na cara) e ao longe
  vAlpha = aAlpha * smoothstep(3.0, 10.0, dist) * (1.0 - smoothstep(uRadius * 0.75, uRadius, dist));
  vUv = uv;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const VEIL_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 a = vec2(vUv.x * 0.55 + vSeed + uTime * 0.018, vUv.y * 0.45 - uTime * 0.006);
  vec2 b = vec2(vUv.x * 1.2 - uTime * 0.03 + vSeed * 3.0, vUv.y * 0.9 + uTime * 0.01);
  float n = texture2D(uNoise, a).r * 0.7 + texture2D(uNoise, b).r * 0.3;
  float edge = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
  float vert = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
  float alpha = smoothstep(0.3, 0.8, n) * edge * vert * vAlpha;
  gl_FragColor = vec4(uColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Textura de ruído suave e repetível (fbm) para os véus. */
function makeVeilNoise(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const grid = (cells: number) => {
    const g = Array.from({ length: cells * cells }, () => Math.random());
    return (x: number, y: number) => {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx) % cells;
      const y0 = Math.floor(fy) % cells;
      const x1 = (x0 + 1) % cells;
      const y1 = (y0 + 1) % cells;
      let tx = fx - Math.floor(fx);
      let ty = fy - Math.floor(fy);
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const a = g[y0 * cells + x0] + (g[y0 * cells + x1] - g[y0 * cells + x0]) * tx;
      const b = g[y1 * cells + x0] + (g[y1 * cells + x1] - g[y1 * cells + x0]) * tx;
      return a + (b - a) * ty;
    };
  };
  const o1 = grid(4);
  const o2 = grid(8);
  const o3 = grid(16);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = o1(x, y) * 0.55 + o2(x, y) * 0.3 + o3(x, y) * 0.15;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(v * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

interface Veil {
  x: number;
  z: number;
  w: number;
  h: number;
}

export function FogVeils({ count, center }: { count: number; center?: () => { x: number; z: number } }) {
  const R = CONFIG.graphics.veils.radius;
  const noise = useMemo(() => makeVeilNoise(), []);
  const { geo, mat, alpha } = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1);
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    const seed = new THREE.InstancedBufferAttribute(new Float32Array(count).map(() => Math.random() * 10), 1);
    g.setAttribute('aAlpha', alpha);
    g.setAttribute('aSeed', seed);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uNoise: { value: noise },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(THEME.scene.fogFar).multiplyScalar(1.7) },
        uRadius: { value: R },
      },
      vertexShader: VEIL_VERT,
      fragmentShader: VEIL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return { geo: g, mat: m, alpha };
  }, [count, noise, R]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  useEffect(() => () => noise.dispose(), [noise]);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const veils = useRef<Veil[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const place = (v: Veil, cx: number, cz: number, anywhere: boolean) => {
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = anywhere ? 6 + Math.sqrt(Math.random()) * (R - 8) : R * (0.7 + Math.random() * 0.25);
      v.x = cx + Math.cos(a) * r;
      v.z = cz + Math.sin(a) * r;
      if (!insideBuilding(v.x, v.z, 2)) break;
    }
    v.w = 7 + Math.random() * 7;
    v.h = 2.6 + Math.random() * 2.6;
  };

  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const c = center ? center() : net.local;
    if (veils.current.length !== count) {
      veils.current = Array.from({ length: count }, () => {
        const v = { x: 0, z: 0, w: 1, h: 1 };
        place(v, c.x, c.z, true);
        return v;
      });
    }
    mat.uniforms.uTime.value = clock.elapsedTime;
    const F = CONFIG.graphics.fog;
    const thermal = getState().you?.thermal ? 0.25 : 1;
    const bell = net.bellUntil > performance.now() ? 0.5 : 1;
    veils.current.forEach((v, i) => {
      v.x += F.windX * dt * 2.2;
      v.z += F.windZ * dt * 2.2;
      if (Math.hypot(v.x - c.x, v.z - c.z) > R) place(v, c.x, c.z, false);
      const zone = fogZoneAt(v.x, v.z);
      const target = CONFIG.graphics.veils.opacity * Math.min(1.7, Math.max(0.45, CONFIG.graphics.fogZones[zone] ?? 1)) * thermal * bell;
      alpha.array[i] += (target - alpha.array[i]) * Math.min(1, dt * 0.7);
      dummy.position.set(v.x, 0, v.z);
      dummy.scale.set(v.w, v.h, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    alpha.needsUpdate = true;
    m.instanceMatrix.needsUpdate = true;
  });

  if (count <= 0) return null;
  return <instancedMesh ref={mesh} args={[geo, mat, count]} frustumCulled={false} renderOrder={6} />;
}
