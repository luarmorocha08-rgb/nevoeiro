/**
 * Efeitos sonoros sintetizados com Web Audio (sem arquivos). Troque por samples quando quiser.
 */
import { getState } from '../net/store';

type SfxName = 'alert' | 'revive' | 'chat' | 'shot' | 'teleport' | 'kill' | 'end' | 'click' | 'deny';

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

/** Navegadores só liberam áudio após um gesto do usuário. */
export function unlockAudio() {
  const c = audioContext();
  if (c.state === 'suspended') void c.resume();
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
  const c = audioContext();
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.01, vol, dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filterFreq: number) {
  const c = audioContext();
  const t = c.currentTime;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  play(name: SfxName, volume = 1) {
    try {
      const v = volume * getState().settings.masterVolume;
      if (v <= 0.01 || !ctx || ctx.state !== 'running') return;
      switch (name) {
        case 'alert':
          tone(196, 0.5, 'sine', 0.25 * v);
          tone(147, 0.9, 'sine', 0.2 * v, 0.18);
          break;
        case 'revive':
          [523, 659, 784].forEach((f, i) => tone(f, 0.6, 'triangle', 0.12 * v, i * 0.12));
          break;
        case 'chat':
          tone(880, 0.06, 'sine', 0.05 * v);
          break;
        case 'shot':
          noise(0.45, 0.9 * v, 2400);
          tone(90, 0.25, 'square', 0.15 * v, 0, 40);
          break;
        case 'teleport':
          tone(300, 0.4, 'sawtooth', 0.06 * v, 0, 1400);
          break;
        case 'kill':
          noise(0.2, 0.35 * v, 700);
          break;
        case 'end':
          tone(110, 1.6, 'sine', 0.25 * v);
          tone(165, 1.6, 'sine', 0.15 * v, 0.1);
          break;
        case 'click':
          tone(660, 0.04, 'square', 0.03 * v);
          break;
        case 'deny':
          tone(140, 0.15, 'square', 0.05 * v);
          break;
      }
    } catch {
      /* áudio indisponível */
    }
  },
};
