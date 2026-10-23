/**
 * Ambiente sonoro e trilha:
 * - vento contínuo; corujas na floresta; grilos nos gramados; sinos da igreja (posicionais)
 * - trilha em drone que fica mais tensa quando o servidor indica perigo (só para inocentes)
 * - passos de todos os jogadores próximos, com timbre conforme o chão
 */
import { CONFIG, locationAt, surfaceAt } from '@nevoeiro/shared';
import { net } from '../net/netState';
import { getState } from '../net/store';
import { audioContext, audioReady, sfx } from './sfx';

const CHURCH_TOWER = { x: 0, z: -57.5 };

class AmbientAudio {
  private started = false;
  private wind?: GainNode;
  private drone?: GainNode;
  private droneFilter?: BiquadFilterNode;
  private tension = 0;
  private nextOwl = 0;
  private nextCricket = 0;
  private nextBell = 0;
  private nextBeat = 0;
  private steps = new Map<string, { x: number; z: number; acc: number }>();

  private start() {
    if (this.started || !audioReady()) return;
    this.started = true;
    const c = audioContext();
    // vento: ruído filtrado em loop
    const buf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last * 0.98 + (Math.random() * 2 - 1) * 0.02;
      d[i] = last * 6;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    this.wind = c.createGain();
    this.wind.gain.value = 0;
    src.connect(lp).connect(this.wind).connect(c.destination);
    src.start();

    // trilha: drone grave + quinta, com filtro que abre na tensão
    this.drone = c.createGain();
    this.drone.gain.value = 0;
    this.droneFilter = c.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 220;
    for (const [f, type, detune] of [[55, 'sawtooth', -6], [55, 'sawtooth', 7], [82.4, 'sine', 0], [110, 'triangle', 3]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const g = c.createGain();
      g.gain.value = type === 'sawtooth' ? 0.25 : 0.4;
      o.connect(g).connect(this.droneFilter);
      o.start();
    }
    this.droneFilter.connect(this.drone).connect(c.destination);
    const now = c.currentTime;
    this.nextOwl = now + 6;
    this.nextCricket = now + 2;
    this.nextBell = now + 20;
  }

  update(dt: number) {
    this.start();
    if (!this.started) return;
    const c = audioContext();
    const st = getState();
    const S = st.settings;
    const now = c.currentTime;
    const playing = st.screen === 'game';
    const amb = playing ? S.ambientVolume * S.masterVolume * CONFIG.audio.ambientVolume : 0;
    const zone = locationAt(net.local.x, net.local.z).id;

    // vento mais forte na floresta e no cemitério
    const windLevel = zone === 'floresta' || zone === 'cemiterio' ? 0.16 : 0.08;
    this.wind!.gain.setTargetAtTime(windLevel * amb, now, 0.8);

    // tensão: suaviza o valor vindo do servidor; mortos e assassinos não têm trilha tensa
    const target = playing && st.you?.alive ? net.you?.tension ?? 0 : 0;
    this.tension += (target - this.tension) * Math.min(1, dt * 1.5);
    const music = playing ? S.musicVolume * S.masterVolume * CONFIG.audio.musicVolume : 0;
    this.drone!.gain.setTargetAtTime((0.03 + this.tension * 0.22) * music, now, 0.5);
    this.droneFilter!.frequency.setTargetAtTime(180 + this.tension * 900, now, 0.5);
    net.feel.tension = this.tension;
    // batida de coração quando a tensão é alta (a tela pulsa junto, mesmo sem música)
    if (this.tension > 0.45 && now > this.nextBeat) {
      this.nextBeat = now + 1.05 - this.tension * 0.45;
      net.feel.beatAt = performance.now();
      if (music > 0) this.heartbeat(music * this.tension);
    }

    if (!playing || amb <= 0.01) return;
    if (zone === 'floresta' && now > this.nextOwl) {
      this.nextOwl = now + 9 + Math.random() * 16;
      this.owl(amb, { x: net.local.x + (Math.random() - 0.5) * 30, z: net.local.z + (Math.random() - 0.5) * 30 });
    }
    if (surfaceAt(net.local.x, net.local.z) === 'grama' && now > this.nextCricket) {
      this.nextCricket = now + 0.6 + Math.random() * 2.5;
      this.cricket(amb * 0.6);
    }
    if (now > this.nextBell) {
      this.nextBell = now + CONFIG.audio.churchBellEvery;
      const d = Math.hypot(CHURCH_TOWER.x - net.local.x, CHURCH_TOWER.z - net.local.z);
      if (d < 90) this.bell(amb, d);
    }
  }

  /** Passos: chamado a cada frame com as posições renderizadas. */
  updateSteps() {
    if (!audioReady()) return;
    const R = CONFIG.audio.footstepRadius;
    const seen = new Set<string>();
    const track = (id: string, x: number, z: number, running: boolean, vol: number) => {
      seen.add(id);
      let s = this.steps.get(id);
      if (!s) {
        s = { x, z, acc: 0 };
        this.steps.set(id, s);
      }
      const d = Math.hypot(x - s.x, z - s.z);
      s.x = x;
      s.z = z;
      if (d > 3) return; // teleporte
      s.acc += d;
      const len = running ? CONFIG.audio.stepLengthRun : CONFIG.audio.stepLengthWalk;
      if (s.acc >= len) {
        s.acc = 0;
        sfx.step(surfaceAt(x, z), vol * (running ? 1 : 0.7), id === 'self' ? undefined : { x, z });
      }
    };
    const you = net.you;
    if (you?.alive) {
      const sp = Math.hypot(you.vx, you.vz);
      track('self', net.local.x, net.local.z, sp > CONFIG.move.walkSpeed + 0.3, 0.55);
    }
    for (const e of net.entities.values()) {
      if (e.leavingAt) continue;
      if (Math.hypot(e.rx - net.local.x, e.rz - net.local.z) > R) continue;
      track(e.id, e.rx, e.rz, e.speed > CONFIG.move.walkSpeed + 0.3, 0.8);
    }
    for (const id of this.steps.keys()) if (!seen.has(id)) this.steps.delete(id);
  }

  private owl(vol: number, pos: { x: number; z: number }) {
    const c = audioContext();
    const t = c.currentTime;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (pos.x - net.local.x) / 20));
    pan.connect(c.destination);
    for (const [i, f] of [[0, 420], [0.45, 380], [0.75, 400]] as const) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + i);
      o.frequency.exponentialRampToValueAtTime(f * 0.88, t + i + 0.35);
      g.gain.setValueAtTime(0.0001, t + i);
      g.gain.exponentialRampToValueAtTime(0.06 * vol, t + i + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i + 0.38);
      o.connect(g).connect(pan);
      o.start(t + i);
      o.stop(t + i + 0.45);
    }
  }

  private cricket(vol: number) {
    const c = audioContext();
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.value = 4300 + Math.random() * 300;
      g.gain.setValueAtTime(0.0001, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.008 * vol, t + i * 0.06 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.04);
      o.connect(g).connect(c.destination);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.05);
    }
  }

  private bell(vol: number, dist: number) {
    const c = audioContext();
    const v = vol * Math.max(0.15, 1 - dist / 90) * 0.12;
    for (let strike = 0; strike < 3; strike++) {
      const t = c.currentTime + strike * 2.2;
      for (const [ratio, amp] of [[1, 1], [2.4, 0.5], [3.0, 0.35], [4.2, 0.2]] as const) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = 196 * ratio;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v * amp, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 3.6);
      }
    }
  }

  private heartbeat(vol: number) {
    const c = audioContext();
    for (const [w, a] of [[0, 1], [0.18, 0.7]] as const) {
      const t = c.currentTime + w;
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35 * vol * a, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.2);
    }
  }
}

export const ambient = new AmbientAudio();
