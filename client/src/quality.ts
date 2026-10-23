/**
 * Qualidade gráfica ajustável (baixa/média/alta) com detecção automática do aparelho.
 */
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityLevel;

export interface Settings {
  quality: QualitySetting;
  pushToTalk: boolean;
  sensitivity: number;
  invertY: boolean;
  showFps: boolean;
  serverUrl: string;
  name: string;
  skin: string;
  masterVolume: number;
}

const KEY = 'nevoeiro.settings.v1';

const DEFAULTS: Settings = {
  quality: 'auto',
  pushToTalk: false,
  sensitivity: 1,
  invertY: false,
  showFps: false,
  serverUrl: '',
  name: '',
  skin: '',
  masterVolume: 0.9,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* armazenamento indisponível */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ok */
  }
}

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 1);

let detected: QualityLevel | null = null;

/** Heurística: celular / poucos núcleos / pouca memória / GPU integrada fraca → qualidade menor. */
export function detectQuality(): QualityLevel {
  if (detected) return detected;
  let score = 0;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores >= 8) score += 2;
  else if (cores >= 4) score += 1;
  if (mem >= 8) score += 2;
  else if (mem >= 4) score += 1;
  if (isTouchDevice()) score -= 2;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase() : '';
    if (/rtx|radeon rx|geforce gtx|apple m\d|arc/.test(renderer)) score += 2;
    if (/swiftshader|llvmpipe|mali-4|adreno \(tm\) [34]\d\d|powervr/.test(renderer)) score -= 3;
  } catch {
    /* sem WebGL debug */
  }
  detected = score >= 4 ? 'high' : score >= 1 ? 'medium' : 'low';
  return detected;
}

export function resolveQuality(s: QualitySetting): QualityLevel {
  return s === 'auto' ? detectQuality() : s;
}

export interface QualityProfile {
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  fogParticles: number;
  lampLights: number;
  treeDetail: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { dpr: [0.6, 1], shadows: false, shadowMapSize: 512, antialias: false, fogParticles: 24, lampLights: 3, treeDetail: 5 },
  medium: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, antialias: true, fogParticles: 60, lampLights: 6, treeDetail: 7 },
  high: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, antialias: true, fogParticles: 120, lampLights: 12, treeDetail: 9 },
};

export const QUALITY_LABEL: Record<QualitySetting, string> = {
  auto: 'Automática',
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
};
