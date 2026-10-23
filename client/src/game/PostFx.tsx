/**
 * Pós-processamento (@react-three/postprocessing):
 * - média: bloom sutil nas luzes, gradação de cor de suspense, vinheta, grão de filme, tone mapping ACES
 * - alta: + SSAO (N8AO) e SMAA
 * - qualquer qualidade: filtro térmico em tela cheia (azul → vermelho) do Rastreador, com transição
 */
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, Effect, ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CONFIG } from '@nevoeiro/shared';
import { net } from '../net/netState';
import { useStore } from '../net/store';
import type { QualityProfile } from '../quality';

const THERMAL_FRAG = /* glsl */ `
uniform float intensity;
uniform float time;
vec3 thermalPalette(float t) {
  vec3 c0 = vec3(0.02, 0.03, 0.22);
  vec3 c1 = vec3(0.12, 0.25, 0.75);
  vec3 c2 = vec3(0.55, 0.12, 0.62);
  vec3 c3 = vec3(0.96, 0.22, 0.10);
  vec3 c4 = vec3(1.00, 0.92, 0.45);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.78) return mix(c2, c3, (t - 0.5) / 0.28);
  return mix(c3, c4, (t - 0.78) / 0.22);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float l = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
  // corpos quentes (silhuetas vermelho/amarelo) dominam; o cenário frio fica azul
  float warm = max(0.0, inputColor.r - inputColor.b * 0.8);
  float heat = clamp(l * 0.9 + warm * 1.3, 0.0, 1.0);
  float grain = fract(sin(dot(uv * (time + 1.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  float scan = sin(uv.y * 800.0 + time * 8.0) * 0.015;
  vec3 th = thermalPalette(heat) + grain * 0.05 + scan;
  outputColor = vec4(mix(inputColor.rgb, th, intensity), inputColor.a);
}`;

class ThermalEffect extends Effect {
  constructor() {
    super('ThermalEffect', THERMAL_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['intensity', new THREE.Uniform(0)],
        ['time', new THREE.Uniform(0)],
      ]),
    });
  }
}

// Gradação de cor de suspense: dessatura (mais com tensão), sombras azul-petróleo,
// luzes âmbar e uma curva S leve de contraste. Roda depois do tone mapping.
const GRADE_FRAG = /* glsl */ `
uniform float tension;
uniform float strength;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = clamp(inputColor.rgb, 0.0, 1.0);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 0.84 - tension * 0.22);
  vec3 tint = mix(vec3(0.86, 0.97, 1.10), vec3(1.08, 1.0, 0.88), smoothstep(0.06, 0.55, l));
  col *= tint;
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.3);
  outputColor = vec4(mix(inputColor.rgb, col, strength), inputColor.a);
}`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['tension', new THREE.Uniform(0)],
        ['strength', new THREE.Uniform(1)],
      ]),
    });
  }
}

export function PostFx({ quality }: { quality: QualityProfile }) {
  const grade = useMemo(() => new GradeEffect(), []);
  useEffect(() => () => grade.dispose(), [grade]);
  const thermalOn = useStore((s) => s.you?.thermal ?? false);
  const thermal = useMemo(() => new ThermalEffect(), []);
  const level = useRef(0);
  // na qualidade baixa o compositor só existe durante o efeito térmico
  const [composerOn, setComposerOn] = useState(quality.post > 0);
  const { gl } = useThree();

  useEffect(() => () => thermal.dispose(), [thermal]);
  useEffect(() => {
    if (quality.post > 0) setComposerOn(true);
  }, [quality.post]);

  // com o compositor ativo, o tone mapping ACES é feito por ele (evita aplicar duas vezes)
  useEffect(() => {
    gl.toneMapping = composerOn ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    return () => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
    };
  }, [gl, composerOn]);

  useFrame(({ clock }, dt) => {
    const target = thermalOn ? 1 : 0;
    level.current += (target - level.current) * Math.min(1, dt * 5);
    if (Math.abs(level.current - target) < 0.002) level.current = target;
    thermal.uniforms.get('intensity')!.value = level.current;
    thermal.uniforms.get('time')!.value = clock.elapsedTime;
    grade.uniforms.get('tension')!.value = net.feel.tension;
    // óculos térmicos: sem gradação (o filtro tem a própria paleta)
    grade.uniforms.get('strength')!.value = 1 - level.current;
    if (quality.post === 0) {
      const want = level.current > 0.001 || thermalOn;
      if (want !== composerOn) setComposerOn(want);
    }
  });

  if (!composerOn) return null;
  const G = CONFIG.graphics;
  if (quality.post === 0) {
    return (
      <EffectComposer multisampling={0}>
        <primitive object={thermal} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
  if (quality.post === 1) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur levels={5} resolutionScale={0.5} intensity={G.bloomIntensity} luminanceThreshold={G.bloomThreshold} luminanceSmoothing={0.2} />
        <primitive object={thermal} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <primitive object={grade} />
        <Vignette offset={0.3} darkness={G.vignetteDarkness} />
        <Noise premultiply opacity={G.filmGrain} blendFunction={BlendFunction.SOFT_LIGHT} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={1.6} intensity={2.2} distanceFalloff={1} halfRes quality="performance" />
      <Bloom mipmapBlur levels={5} resolutionScale={0.5} intensity={G.bloomIntensity} luminanceThreshold={G.bloomThreshold} luminanceSmoothing={0.2} />
      <primitive object={thermal} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={grade} />
      <Vignette offset={0.3} darkness={G.vignetteDarkness} />
      <Noise premultiply opacity={G.filmGrain} blendFunction={BlendFunction.SOFT_LIGHT} />
      <SMAA />
    </EffectComposer>
  );
}
