/**
 * Chat de voz por proximidade via LiveKit (WebRTC) com áudio espacial 3D.
 * - Canal "vivos": cada voz passa por um PannerNode (direção) + ganho por distância;
 *   além de CONFIG.voice.radius o volume é zero.
 * - Canal "mortos": espectadores entre si, volume cheio. Os vivos nunca recebem esse áudio
 *   (são salas LiveKit diferentes e o token é emitido pelo servidor do jogo).
 * - Fantasma invisível: a voz sai pela posição de áudio, sem indicador visual.
 */
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { CONFIG, type VoiceTokenMsg } from '@nevoeiro/shared';
import { audioContext } from '../audio/sfx';
import { net } from '../net/netState';
import { getState } from '../net/store';

interface VoiceNode {
  identity: string;
  el: HTMLMediaElement;
  source: MediaStreamAudioSourceNode;
  panner: PannerNode;
  gain: GainNode;
}

class VoiceManager {
  private room: Room | null = null;
  private nodes = new Map<string, VoiceNode>();
  private channel: 'vivos' | 'mortos' | null = null;
  private connecting: Promise<void> | null = null;
  private names = new Map<string, string>();

  async connect(msg: VoiceTokenMsg) {
    const st = getState();
    if (!msg.available || !msg.url || !msg.token) {
      this.disconnect();
      st.set({ voice: { ...st.voice, status: 'unavailable', channel: null, reason: msg.reason } });
      return;
    }
    if (this.connecting) await this.connecting.catch(() => {});
    this.disconnect(false);
    this.channel = msg.channel ?? 'vivos';
    st.set({ voice: { ...getState().voice, status: 'connecting', channel: this.channel } });

    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.room = room;
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) this.attach(track, p);
      })
      .on(RoomEvent.TrackUnsubscribed, (_t: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) =>
        this.detach(p.identity),
      )
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => this.detach(p.identity))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        for (const s of speakers) if (s.name) this.names.set(s.identity, s.name);
        getState().set({ speaking: speakers.map((s) => s.identity) });
      })
      .on(RoomEvent.Disconnected, () => {
        if (this.room === room) getState().set({ voice: { ...getState().voice, status: 'off' }, speaking: [] });
      });

    this.connecting = (async () => {
      try {
        await room.connect(msg.url!, msg.token!);
        if (this.room !== room) return;
        getState().set({ voice: { ...getState().voice, status: 'on', channel: this.channel } });
        void this.applyMic();
      } catch (err) {
        console.warn('[voz] falha ao conectar', err);
        getState().set({ voice: { ...getState().voice, status: 'error', reason: 'Falha ao conectar na voz.' } });
      }
    })();
    await this.connecting;
    this.connecting = null;
  }

  /** Microfone ligado = não mutado E (sem push-to-talk OU tecla pressionada). */
  async applyMic() {
    const st = getState();
    const want = st.voice.micOn && (!st.settings.pushToTalk || st.voice.pttHeld);
    try {
      await this.room?.localParticipant.setMicrophoneEnabled(want);
    } catch (err) {
      console.warn('[voz] microfone', err);
      getState().pushToast({ text: 'Não foi possível acessar o microfone.', level: 'warn' });
    }
  }

  private attach(track: RemoteTrack, p: RemoteParticipant) {
    this.detach(p.identity);
    if (p.name) this.names.set(p.identity, p.name);
    const ctx = audioContext();
    // o Chrome só entrega áudio WebRTC ao Web Audio se houver um elemento tocando (mudo)
    const el = track.attach();
    el.muted = true;
    el.volume = 0;
    el.style.display = 'none';
    document.body.appendChild(el);
    const stream = new MediaStream([track.mediaStreamTrack]);
    const source = ctx.createMediaStreamSource(stream);
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0; // o volume por distância é calculado à mão (abaixo)
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(panner).connect(gain).connect(ctx.destination);
    this.nodes.set(p.identity, { identity: p.identity, el, source, panner, gain });
  }

  private detach(identity: string) {
    const n = this.nodes.get(identity);
    if (!n) return;
    try {
      n.source.disconnect();
      n.panner.disconnect();
      n.gain.disconnect();
    } catch {
      /* ok */
    }
    n.el.remove();
    this.nodes.delete(identity);
  }

  /** Chamado a cada frame pelo jogo: posiciona ouvinte e vozes. */
  update() {
    if (!this.nodes.size) return;
    const ctx = audioContext();
    const st = getState();
    const master = st.settings.masterVolume;
    const L = ctx.listener;
    const { x, z } = net.local;
    const yaw = net.cameraYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (L.positionX) {
      L.positionX.value = x;
      L.positionY.value = 1.6;
      L.positionZ.value = z;
      L.forwardX.value = fx;
      L.forwardY.value = 0;
      L.forwardZ.value = fz;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(x, 1.6, z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    const R = CONFIG.voice.radius;
    const ref = CONFIG.voice.refDistance;
    for (const n of this.nodes.values()) {
      let g = 0;
      if (st.muted.includes(n.identity)) g = 0;
      else if (this.channel === 'mortos') {
        g = 1;
        n.panner.positionX.value = x + fx;
        n.panner.positionZ.value = z + fz;
      } else {
        const ent = net.entities.get(n.identity);
        const pos = ent ? { x: ent.rx, z: ent.rz } : net.audioOnly.get(n.identity);
        if (pos && net.you?.alive) {
          const d = Math.hypot(pos.x - x, pos.z - z);
          g = d <= ref ? 1 : d >= R ? 0 : Math.pow(1 - (d - ref) / (R - ref), CONFIG.voice.rolloff);
          n.panner.positionX.value = pos.x;
          n.panner.positionY.value = 1.6;
          n.panner.positionZ.value = pos.z;
        }
      }
      n.gain.gain.setTargetAtTime(g * master, ctx.currentTime, 0.05);
    }
  }

  nameOf(identity: string): string | undefined {
    return this.names.get(identity);
  }

  get localIdentity(): string | undefined {
    return this.room?.localParticipant.identity;
  }

  pause() {
    this.disconnect(false);
  }

  disconnect(clearState = true) {
    for (const id of [...this.nodes.keys()]) this.detach(id);
    const r = this.room;
    this.room = null;
    this.channel = null;
    void r?.disconnect();
    if (clearState) {
      const st = getState();
      st.set({ voice: { ...st.voice, status: 'off', channel: null }, speaking: [] });
    }
  }
}

export const voice = new VoiceManager();
