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
  musicVolume: number;
  ambientVolume: number;
  vibration: boolean;
  /** modo para daltônicos: formas e rótulos além da cor */
  colorblind: boolean;
  /** balanço, tremor e zoom da câmera (desligue se enjoar) */
  cameraMotion: boolean;
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
  musicVolume: 0.6,
  ambientVolume: 0.7,
  vibration: true,
  colorblind: false,
  cameraMotion: typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
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
  // celular começa na Média (a medição de FPS ajusta depois, se precisar)
  if (isTouchDevice()) detected = 'medium';
  return detected;
}

const AUTO_KEY = 'nevoeiro.autoQuality.v1';

/** Resultado da medição de FPS da última vez (modo automático). */
export function loadAutoQuality(): QualityLevel | null {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    return v === 'low' || v === 'medium' || v === 'high' ? v : null;
  } catch {
    return null;
  }
}

export function saveAutoQuality(q: QualityLevel) {
  try {
    localStorage.setItem(AUTO_KEY, q);
  } catch {
    /* ok */
  }
}

/** Automática: usa o FPS medido (se houver), senão a heurística do aparelho. */
export function resolveQuality(s: QualitySetting, measured?: QualityLevel | null): QualityLevel {
  if (s !== 'auto') return s;
  return measured ?? detectQuality();
}

export interface QualityProfile {
  dpr: [number, number];
  shadows: boolean;
  softShadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  /** pós-processamento: 0 nenhum, 1 bloom+vinheta+grão, 2 + oclusão de ambiente (SSAO) */
  post: 0 | 1 | 2;
  /** modo leve: menos ruído na névoa/chão, céu sem nuvens, sem cones de luz */
  lite: boolean;
  /** tufos de grama com vento */
  grass: number;
  /** véus de névoa (cortinas verticais) */
  fogVeils: number;
  dust: number;
  fireflies: number;
  leaves: number;
  smoke: boolean;
  /** luzes pontuais quentes ativas (redistribuídas para os lampiões mais próximos) */
  pointLights: number;
  treeDetail: number;
  particles: number;
  /** céu com estrelas */
  stars: boolean;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { dpr: [0.6, 0.9], shadows: false, softShadows: false, shadowMapSize: 512, antialias: false, post: 0, fogVeils: 6, grass: 0, lite: true, dust: 0, fireflies: 10, leaves: 0, smoke: false, pointLights: 3, treeDetail: 5, particles: 160, stars: false },
  medium: { dpr: [0.9, 1.25], shadows: true, softShadows: false, shadowMapSize: 1024, antialias: false, post: 1, fogVeils: 16, grass: 1600, lite: false, dust: 60, fireflies: 30, leaves: 40, smoke: true, pointLights: 5, treeDetail: 6, particles: 350, stars: true },
  high: { dpr: [1, 2], shadows: true, softShadows: true, shadowMapSize: 2048, antialias: false, post: 2, fogVeils: 28, grass: 6500, lite: false, dust: 140, fireflies: 60, leaves: 90, smoke: true, pointLights: 8, treeDetail: 8, particles: 700, stars: true },
};

export const QUALITY_LABEL: Record<QualitySetting, string> = {
  auto: 'Automática',
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
};
