/**
 * Materiais, texturas e geometrias procedurais do cenário (sem arquivos de imagem):
 * reboco, pedra, telhas, madeira, chão com variação de grama/terra, tufos de grama com vento
 * e pinheiros em camadas. Texturas usam coordenadas do MUNDO (não esticam em paredes longas).
 * São criados uma vez e compartilhados pela cena toda.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ utilidades

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed = 7): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Pontilhado fino em tons de cinza perto do branco (multiplica a cor do material). */
function speckle(g: CanvasRenderingContext2D, size: number, r: () => number, amount: number) {
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

let cache: Record<string, THREE.Texture> = {};
function once(key: string, make: () => THREE.Texture) {
  return (cache[key] ??= make());
}

// ------------------------------------------------------------------ texturas

/** Reboco envelhecido com manchas e escorridos. Escala: 1 repetição = 4 m. */
export function plasterTex() {
  return once('plaster', () =>
    canvasTex(256, (g, r) => {
      g.fillStyle = 'rgb(232,232,232)';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) {
        const x = r() * 256;
        const y = r() * 256;
        const rad = 10 + r() * 50;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(0,0,0,${0.05 + r() * 0.08})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // escorridos de chuva
      for (let i = 0; i < 26; i++) {
        const x = r() * 256;
        const len = 40 + r() * 140;
        const grd = g.createLinearGradient(0, 0, 0, len);
        grd.addColorStop(0, 'rgba(0,0,0,0.12)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x, 0, 2 + r() * 4, len);
      }
      speckle(g, 256, r, 26);
    }, 11),
  );
}

/** Pedras irregulares com argamassa. 1 repetição = 2 m. */
export function stoneTex() {
  return once('stone', () =>
    canvasTex(256, (g, r) => {
      g.fillStyle = 'rgb(120,120,120)';
      g.fillRect(0, 0, 256, 256);
      const rows = 8;
      const h = 256 / rows;
      for (let row = 0; row < rows; row++) {
        let x = -r() * 30;
        while (x < 256) {
          const w = 26 + r() * 34;
          const v = 175 + r() * 60;
          g.fillStyle = `rgb(${v},${v},${v - 4})`;
          const pad = 3;
          g.beginPath();
          g.roundRect(x + pad, row * h + pad, w - pad * 2, h - pad * 2, 6);
          g.fill();
          // repete na borda para emendar
          if (x + w > 256) {
            g.beginPath();
            g.roundRect(x - 256 + pad, row * h + pad, w - pad * 2, h - pad * 2, 6);
            g.fill();
          }
          x += w;
        }
      }
      speckle(g, 256, r, 34);
    }, 23),
  );
}

/** Calçamento da praça (paralelepípedos). 1 repetição = 3 m. */
export function cobbleTex() {
  return once('cobble', () =>
    canvasTex(256, (g, r) => {
      g.fillStyle = 'rgb(70,70,70)';
      g.fillRect(0, 0, 256, 256);
      const n = 10;
      const s = 256 / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const off = y % 2 ? s / 2 : 0;
          const v = 150 + r() * 80;
          g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
          g.beginPath();
          g.roundRect(x * s + off + 2, y * s + 2, s - 4, s - 4, 7);
          g.fill();
          if (x === n - 1 && off) {
            g.beginPath();
            g.roundRect(-s / 2 + 2, y * s + 2, s - 4, s - 4, 7);
            g.fill();
          }
        }
      }
      speckle(g, 256, r, 30);
    }, 31),
  );
}

/** Telhas em fileiras. 1 repetição = 2 m. */
export function shingleTex() {
  return once('shingle', () =>
    canvasTex(256, (g, r) => {
      g.fillStyle = 'rgb(90,90,90)';
      g.fillRect(0, 0, 256, 256);
      const rows = 10;
      const h = 256 / rows;
      for (let row = 0; row < rows; row++) {
        const w = 32;
        const off = row % 2 ? w / 2 : 0;
        for (let x = -w; x < 256 + w; x += w) {
          const v = 165 + r() * 70;
          const grd = g.createLinearGradient(0, row * h, 0, row * h + h);
          grd.addColorStop(0, `rgb(${v * 0.75},${v * 0.75},${v * 0.75})`);
          grd.addColorStop(1, `rgb(${v},${v},${v})`);
          g.fillStyle = grd;
          g.beginPath();
          g.roundRect(x + off + 1, row * h + 1, w - 2, h + 2, [0, 0, 8, 8]);
          g.fill();
        }
      }
      speckle(g, 256, r, 20);
    }, 41),
  );
}

/** Tábuas de madeira com veios. 1 repetição = 2 m. */
export function woodTex() {
  return once('wood', () =>
    canvasTex(128, (g, r) => {
      g.fillStyle = 'rgb(200,200,200)';
      g.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 16) {
        g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.2})`;
        g.fillRect(x, 0, 1.5, 128);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.06})`;
          g.fillRect(x + 2 + r() * 12, 0, 1, 128);
        }
      }
      speckle(g, 128, r, 24);
    }, 53),
  );
}

/** Detalhe miúdo do chão (folhas, pedrinhas, terra). */
export function groundDetailTex() {
  return once('ground', () =>
    canvasTex(256, (g, r) => {
      g.fillStyle = 'rgb(205,205,205)';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        const v = r() < 0.5 ? 0 : 255;
        g.fillStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.12})`;
        const s = 1 + r() * 3;
        g.fillRect(r() * 256, r() * 256, s, s * (0.5 + r()));
      }
      for (let i = 0; i < 70; i++) {
        const x = r() * 256;
        const y = r() * 256;
        const rad = 6 + r() * 24;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(0,0,0,${0.06 + r() * 0.1})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      speckle(g, 256, r, 30);
    }, 67),
  );
}

/** Folhas de grama (com transparência) para os tufos. */
export function bladeTex() {
  return once('blade', () => {
    const t = canvasTex(128, (g, r) => {
      g.clearRect(0, 0, 128, 128);
      for (let i = 0; i < 16; i++) {
        const x = 10 + r() * 108;
        const h = 60 + r() * 66;
        const lean = (r() - 0.5) * 30;
        const w = 3 + r() * 4;
        const v = 170 + r() * 85;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath();
        g.moveTo(x - w, 128);
        g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h);
        g.quadraticCurveTo(x + lean * 0.3 + w * 0.3, 128 - h * 0.6, x + w, 128);
        g.closePath();
        g.fill();
      }
    }, 79);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Halo suave (luz espalhada na névoa). */
export function haloTex() {
  return once('halo', () => {
    const t = canvasTex(128, (g) => {
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// ------------------------------------------------------------------ materiais com UV do mundo

/**
 * Material padrão cuja textura usa coordenadas do mundo (projeção pela face dominante).
 * `scale` = repetições por metro.
 */
export function worldMaterial(opts: {
  map: THREE.Texture;
  color: THREE.ColorRepresentation;
  scale: number;
  roughness?: number;
  metalness?: number;
  /** telhado: fileiras sempre paralelas à cumeeira */
  roof?: boolean;
}) {
  const m = new THREE.MeshStandardMaterial({ map: opts.map, color: opts.color, roughness: opts.roughness ?? 0.95, metalness: opts.metalness ?? 0 });
  const scale = opts.scale.toFixed(4);
  const pick = opts.roof
    ? 'vec2 wuv = an.x > an.z ? vWPos.zx : vWPos.xz;'
    : 'vec2 wuv = an.y > 0.6 ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 nvW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          nvW = instanceMatrix * nvW;
        #endif
        nvW = modelMatrix * nvW;
        vWPos = nvW.xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <map_fragment>',
        `vec3 an = abs(vWNrm);
        ${pick}
        diffuseColor *= texture2D(map, wuv * ${scale});`,
      );
  };
  m.customProgramCacheKey = () => `world-${scale}-${opts.roof ? 'r' : 'w'}`;
  return m;
}

/** Chão: mistura de grama, musgo e terra por ruído no mundo + detalhe miúdo. */
export function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: groundDetailTex(), color: '#ffffff', roughness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        float gHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
        float gNoise(vec2 p) { vec2 i = floor(p); vec2 u = fract(p); u = u * u * (3.0 - 2.0 * u);
          return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `float gn = gNoise(vGround * 0.045) * 0.6 + gNoise(vGround * 0.13) * 0.3 + gNoise(vGround * 0.5) * 0.1;
        float gm = gNoise(vGround * 0.09 + 17.0);
        vec3 grassA = vec3(0.060, 0.085, 0.055);
        vec3 grassB = vec3(0.095, 0.110, 0.065);
        vec3 moss = vec3(0.045, 0.075, 0.060);
        vec3 dirt = vec3(0.110, 0.085, 0.060);
        vec3 gcol = mix(grassA, grassB, smoothstep(0.3, 0.75, gn));
        gcol = mix(gcol, moss, smoothstep(0.55, 0.8, gm) * 0.8);
        gcol = mix(gcol, dirt, smoothstep(0.66, 0.84, gn) * 0.85);
        vec3 det = texture2D(map, vGround * 0.35).rgb * 0.6 + texture2D(map, vGround * 0.08).rgb * 0.4;
        diffuseColor.rgb *= gcol * det * 2.4;`,
      );
  };
  m.customProgramCacheKey = () => 'ground-v1';
  return m;
}

// ------------------------------------------------------------------ grama com vento

export const windTime = { value: 0 };

/** Tufo: 3 planos cruzados com textura de folhas; o topo balança com o vento. */
export function grassTuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(1, 1, 1, 2);
    p.translate(0, 0.5, 0);
    p.rotateY((i / 3) * Math.PI);
    parts.push(p);
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  // normais para cima: a grama acende como o chão (sem faces pretas de costas)
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export function grassMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: bladeTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 gw = instanceMatrix[3].xz;
        #else
          vec2 gw = vec2(0.0);
        #endif
        float bend = uv.y * uv.y;
        float sway = sin(uWind * 1.6 + gw.x * 0.35 + gw.y * 0.21) * 0.6 + sin(uWind * 3.1 + gw.x * 1.1) * 0.25;
        transformed.x += sway * bend * 0.22;
        transformed.z += sway * bend * 0.12;`,
      );
    // os dois lados da folha recebem luz como o chão (sem verso preto)
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);',
    );
  };
  m.customProgramCacheKey = () => 'grass-v2';
  return m;
}

// ------------------------------------------------------------------ pinheiro

/**
 * Pinheiro em camadas (altura 1, base em y=0): 4 saias de galhos irregulares com cor
 * mais escura embaixo e pontas mais claras (lua). Use instâncias com escala = altura.
 */
export function pineCrownGeometry(detail: number): THREE.BufferGeometry {
  const r = rng(99);
  const tiers = [
    { y: 0.3, h: 0.34, rad: 0.24 },
    { y: 0.46, h: 0.3, rad: 0.2 },
    { y: 0.61, h: 0.26, rad: 0.155 },
    { y: 0.75, h: 0.25, rad: 0.1 },
  ];
  const parts = tiers.map((t, ti) => {
    const g = new THREE.ConeGeometry(t.rad, t.h, Math.max(6, detail + 2), 2, true);
    g.translate(0, t.y + t.h / 2, 0);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const dark = new THREE.Color('#0f1d16');
    const light = new THREE.Color('#2c4636');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const rel = (y - t.y) / t.h; // 0 base .. 1 ponta
      // borda irregular (galhos) e base da saia um pouco caída
      if (rel < 0.05) {
        const k = 0.75 + r() * 0.5;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
        pos.setY(i, y - r() * 0.03);
      }
      c.copy(dark).lerp(light, Math.min(1, rel * 0.9 + ti * 0.08));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

export function pineCrownMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide });
}

export { mergeGeometries };

/** Para testes/recarregamento a quente: libera as texturas criadas. */
export function disposeSceneryTextures() {
  for (const t of Object.values(cache)) t.dispose();
  cache = {};
}
