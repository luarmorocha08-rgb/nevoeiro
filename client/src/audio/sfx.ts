/**
 * Efeitos sonoros sintetizados com Web Audio (sem arquivos) — com posição 3D opcional.
 * Para trocar por samples reais, substitua o corpo de cada caso em `play`.
 */
import type { Surface } from '@nevoeiro/shared';
import { net } from '../net/netState';
import { getState } from '../net/store';

export type SfxName =
  | 'alert'
  | 'revive'
  | 'chat'
  | 'shot'
  | 'teleport'
  | 'kill'
  | 'end'
  | 'click'
  | 'deny'
  | 'morph'
  | 'vanish'
  | 'examine'
  | 'cuff'
  | 'thermal'
  | 'ready'
  | 'hide'
  | 'bell'
  | 'lamp'
  | 'taskHit'
  | 'taskMiss'
  | 'taskDone';

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return ctx;
}

/** Barramento dos efeitos (volume geral aplicado aqui). */
function bus(): GainNode {
  const c = audioContext();
  if (!sfxBus) {
    sfxBus = c.createGain();
    sfxBus.connect(c.destination);
  }
  sfxBus.gain.value = getState().settings.masterVolume;
  return sfxBus;
}

/** Navegadores só liberam áudio após um gesto do usuário. */
export function unlockAudio() {
  const c = audioContext();
  if (c.state === 'suspended') void c.resume();
}

export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Saída com pan estéreo e volume pela distância até o ouvinte (câmera/jogador). */
function spatialOut(pos?: { x: number; z: number }, maxDist = 40): AudioNode {
  const c = audioContext();
  if (!pos) return bus();
  const dx = pos.x - net.local.x;
  const dz = pos.z - net.local.z;
  const d = Math.hypot(dx, dz);
  const g = c.createGain();
  g.gain.value = Math.max(0, 1 - d / maxDist) ** 1.3;
  const pan = c.createStereoPanner();
  // direita da câmera = (-cos yaw, sin yaw)
  const rx = -Math.cos(net.cameraYaw);
  const rz = Math.sin(net.cameraYaw);
  pan.pan.value = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85 : 0;
  g.connect(pan).connect(bus());
  return g;
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(out: AudioNode, freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
  const c = audioContext();
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.01, vol, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(): AudioBuffer {
  const c = audioContext();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(out: AudioNode, dur: number, vol: number, type: BiquadFilterType, freq: number, when = 0, q = 0.8) {
  const c = audioContext();
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer();
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, 0.004, vol, dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  play(name: SfxName, volume = 1, pos?: { x: number; z: number }) {
    try {
      if (!audioReady()) return;
      const out = spatialOut(pos, name === 'shot' ? 80 : name === 'bell' ? 160 : 40);
      const v = volume;
      switch (name) {
        case 'alert':
          tone(out, 196, 0.5, 'sine', 0.25 * v);
          tone(out, 147, 0.9, 'sine', 0.2 * v, 0.18);
          break;
        case 'revive':
          [523, 659, 784, 1046].forEach((f, i) => tone(out, f, 0.7, 'triangle', 0.1 * v, i * 0.1));
          break;
        case 'chat':
          tone(out, 880, 0.06, 'sine', 0.05 * v);
          break;
        case 'shot':
          noise(out, 0.5, 0.9 * v, 'lowpass', 2400);
          tone(out, 90, 0.25, 'square', 0.15 * v, 0, 40);
          break;
        case 'teleport':
          tone(out, 1400, 0.35, 'sawtooth', 0.05 * v, 0, 200);
          tone(out, 220, 0.45, 'sine', 0.08 * v, 0.25, 1600);
          break;
        case 'kill':
          noise(out, 0.25, 0.4 * v, 'lowpass', 700);
          tone(out, 70, 0.3, 'sine', 0.2 * v);
          break;
        case 'end':
          tone(out, 110, 1.6, 'sine', 0.25 * v);
          tone(out, 165, 1.6, 'sine', 0.15 * v, 0.1);
          break;
        case 'click':
          tone(out, 660, 0.04, 'square', 0.03 * v);
          break;
        case 'deny':
          tone(out, 140, 0.15, 'square', 0.05 * v);
          break;
        case 'morph':
          tone(out, 300, 0.6, 'sine', 0.08 * v, 0, 900);
          tone(out, 450, 0.6, 'sine', 0.06 * v, 0.05, 180);
          break;
        case 'vanish':
          noise(out, 0.8, 0.12 * v, 'bandpass', 1800, 0, 4);
          tone(out, 600, 0.8, 'sine', 0.05 * v, 0, 150);
          break;
        case 'examine':
          tone(out, 1200, 0.12, 'triangle', 0.06 * v);
          tone(out, 1600, 0.2, 'triangle', 0.05 * v, 0.1);
          break;
        case 'cuff':
          noise(out, 0.06, 0.4 * v, 'highpass', 3500);
          noise(out, 0.06, 0.4 * v, 'highpass', 3000, 0.12);
          break;
        case 'thermal':
          tone(out, 80, 0.5, 'sawtooth', 0.04 * v, 0, 160);
          noise(out, 0.4, 0.05 * v, 'bandpass', 900, 0, 2);
          break;
        case 'ready':
          tone(out, 880, 0.12, 'sine', 0.07 * v);
          tone(out, 1320, 0.2, 'sine', 0.06 * v, 0.08);
          break;
        case 'hide':
          noise(out, 0.3, 0.12 * v, 'lowpass', 1200);
          break;
        case 'bell':
          // sino grande: parciais inarmônicos, 4 badaladas
          for (let k = 0; k < 4; k++) {
            for (const [ratio, amp] of [[0.5, 0.6], [1, 1], [1.19, 0.4], [2.4, 0.45], [3.0, 0.3], [4.2, 0.18]] as const) {
              tone(out, 174 * ratio, 3.2, 'sine', 0.09 * amp * v, k * 1.6);
            }
          }
          break;
        case 'lamp':
          noise(out, 0.5, 0.16 * v, 'bandpass', 900, 0, 1.2);
          noise(out, 0.08, 0.2 * v, 'highpass', 4000, 0.05);
          noise(out, 0.06, 0.15 * v, 'highpass', 5000, 0.22);
          tone(out, 160, 0.6, 'sine', 0.05 * v, 0, 320);
          break;
        case 'taskHit':
          tone(out, 740, 0.09, 'triangle', 0.08 * v);
          tone(out, 1110, 0.12, 'triangle', 0.05 * v, 0.04);
          break;
        case 'taskMiss':
          tone(out, 180, 0.18, 'sawtooth', 0.04 * v, 0, 120);
          break;
        case 'taskDone':
          [523, 659, 784].forEach((f, i) => tone(out, f, 0.5, 'sine', 0.08 * v, i * 0.09));
          tone(out, 1046, 0.8, 'triangle', 0.05 * v, 0.27);
          break;
      }
    } catch {
      /* áudio indisponível */
    }
  },

  /** Passo: o timbre muda com o chão. */
  step(surface: Surface, volume: number, pos?: { x: number; z: number }) {
    try {
      if (!audioReady() || volume <= 0.01) return;
      const out = spatialOut(pos, 18);
      const v = volume * (0.8 + Math.random() * 0.4);
      if (surface === 'pedra') {
        noise(out, 0.05, 0.22 * v, 'highpass', 2200 + Math.random() * 800, 0, 1.2);
        tone(out, 160, 0.04, 'sine', 0.05 * v);
      } else if (surface === 'madeira') {
        noise(out, 0.07, 0.25 * v, 'bandpass', 380 + Math.random() * 120, 0, 3);
        tone(out, 110, 0.07, 'triangle', 0.08 * v);
      } else {
        noise(out, 0.11, 0.18 * v, 'lowpass', 900 + Math.random() * 300, 0, 0.7);
      }
    } catch {
      /* ok */
    }
  },
};
