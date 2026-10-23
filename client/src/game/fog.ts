/**
 * Névoa do Nevoeiro (substitui a neblina padrão do three.js em TODOS os materiais):
 * - névoa de ALTURA: densa rente ao chão e rala no alto (telhados e copas surgem acima dela);
 * - manchas que se movem com o vento (ruído no mundo, não na tela — nada "gruda" na câmera);
 * - cor mais clara na direção da lua (luz espalhada) e um corte suave no horizonte.
 *
 * Os parâmetros fixos vêm de CONFIG.graphics.fog. A cena usa um THREE.Fog só como
 * "transporte" dos uniforms: fogNear = tempo (s), fogFar = densidade atual.
 * Tempo NEGATIVO = modo leve (qualidade baixa): só uma amostra de ruído por pixel.
 */
import * as THREE from 'three';
import { CONFIG } from '@nevoeiro/shared';

const F = CONFIG.graphics.fog;
const f = (n: number) => n.toFixed(5);

/** Direção da lua (mesma do céu e da luz direcional). */
export const MOON_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();

const PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif`;

// posição no mundo a partir de mvPosition (funciona para malhas, instâncias, pontos e sprites)
const VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;

const PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vFogWorld;
  float nvHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
  float nvNoise(vec2 p) {
    vec2 i = floor(p); vec2 u = fract(p); u = u * u * (3.0 - 2.0 * u);
    return mix(mix(nvHash(i), nvHash(i + vec2(1.0, 0.0)), u.x), mix(nvHash(i + vec2(0.0, 1.0)), nvHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
#endif`;

const FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDist = length(fogRay);
    float fogT = abs(fogNear);
    vec2 wind = vec2(fogT * ${f(F.windX)}, fogT * ${f(F.windZ)});
    // manchas: no ponto e a meio caminho do olho (parece volume, não textura no chão)
    float fogN = nvNoise(vFogWorld.xz * ${f(F.noiseScale)} + wind);
    if (fogNear >= 0.0) {
      vec3 fogMid = cameraPosition + fogRay * 0.55;
      fogN = fogN * 0.65 + nvNoise(fogMid.xz * ${f(F.noiseScale * 0.7)} + wind * 0.6) * 0.35;
    }
    float fogDens = fogFar * (1.0 + ${f(F.noiseStrength)} * (fogN - 0.5) * 2.0);
    // névoa de altura integrada ao longo do raio
    float fogB = ${f(F.heightFalloff)};
    float fogCamH = max(cameraPosition.y - ${f(F.baseHeight)}, 0.0);
    float fogRy = fogRay.y;
    float fogH = exp(-fogB * fogCamH) * (abs(fogRy) > 0.02 ? (1.0 - exp(-fogB * fogRy)) / (fogB * fogRy) : 1.0);
    float fogGround = 1.0 - exp(-fogDens * ${f(F.heightDensity)} * fogDist * fogH);
    // corte do horizonte: longe tudo some na névoa
    float fogFarCut = 1.0 - exp(-pow(fogFar * ${f(F.distanceDensity)} * fogDist, 1.6));
    float fogFactor = clamp(max(fogGround, fogFarCut), 0.0, 1.0);
    // cor: luz da lua espalhada na névoa, mais escura para o alto
    vec3 fogDir = fogRay / max(fogDist, 0.001);
    float fogMoon = pow(max(dot(fogDir, vec3(${f(MOON_DIR.x)}, ${f(MOON_DIR.y)}, ${f(MOON_DIR.z)})), 0.0), 5.0);
    vec3 fogTint = fogColor * (1.0 + fogMoon * ${f(F.moonGlow)}) * mix(1.0, 0.7, clamp(vFogWorld.y * 0.05, 0.0, 1.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogTint, fogFactor);
  }
#endif`;

let installed = false;

/** Troca os trechos de neblina do three. Chamar antes de qualquer material compilar. */
export function installFog(): void {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = PARS_VERTEX;
  THREE.ShaderChunk.fog_vertex = VERTEX;
  THREE.ShaderChunk.fog_pars_fragment = PARS_FRAGMENT;
  THREE.ShaderChunk.fog_fragment = FRAGMENT;
}

installFog();
