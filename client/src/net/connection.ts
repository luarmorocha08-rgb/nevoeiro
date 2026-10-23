import { Client, type Room } from 'colyseus.js';
import {
  C2S,
  ROOM_NAME,
  S2C,
  type ActionMsg,
  type AlertMsg,
  type ChatChannel,
  type ChatMsg,
  type EndMsg,
  type ExamineMsg,
  type FxMsg,
  type InputMsg,
  type Phase,
  type RoleMsg,
  type SnapshotMsg,
  type ToastMsg,
  type VoiceTokenMsg,
} from '@nevoeiro/shared';
import { sfx } from '../audio/sfx';
import { voice } from '../voice/VoiceManager';
import { applySnapshot, net, pushFx, resetNet } from './netState';
import { getState, type LobbyPlayerView } from './store';

const TOKEN_KEY = 'nevoeiro.reconnect';

/** URL do servidor: configuração do usuário > VITE_SERVER_URL > mesmo host, porta 2567. */
export function serverUrl(): string {
  const custom = getState().settings.serverUrl.trim();
  if (custom) return custom.replace(/\/$/, '');
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  const secure = location.protocol === 'https:';
  const host = location.hostname || 'localhost';
  return `${secure ? 'wss' : 'ws'}://${host}:2567`;
}

export function httpUrl(): string {
  return serverUrl().replace(/^ws/, 'http');
}

let client: Client | null = null;
let room: Room | null = null;
let leaving = false;

function getClient() {
  const url = serverUrl();
  if (!client || (client as unknown as { _url?: string })._url !== url) {
    client = new Client(url);
    (client as unknown as { _url?: string })._url = url;
  }
  return client;
}

export function currentRoom() {
  return room;
}

interface JoinOpts {
  name: string;
  skin: string;
  testMode?: boolean;
}

export async function createRoom(opts: JoinOpts) {
  return connect(() => getClient().create(ROOM_NAME, opts));
}

export async function joinRoom(code: string, opts: JoinOpts) {
  return connect(() => getClient().joinById(code.trim().toUpperCase(), opts));
}

async function connect(fn: () => Promise<Room>) {
  const st = getState();
  st.set({ conn: 'connecting', connError: null });
  try {
    const r = await fn();
    attach(r);
    return true;
  } catch (err) {
    st.set({ conn: 'offline', connError: humanError(err) });
    return false;
  }
}

function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
  if (/not found|no rooms found|invalid/i.test(msg)) return 'Sala não encontrada. Confira o código.';
  if (/locked|full|cheia/i.test(msg)) return 'Sala cheia ou partida já começou.';
  if (/começou/i.test(msg)) return 'A partida já começou.';
  if (/ECONNREFUSED|failed|network|websocket|1006/i.test(msg))
    return `Não foi possível conectar ao servidor (${serverUrl()}).`;
  return msg || 'Erro de conexão.';
}

/** Ao recarregar a página no meio da partida, tenta voltar para a mesma sala. */
export async function tryResume(): Promise<boolean> {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  if (!token) return false;
  getState().set({ conn: 'reconnecting' });
  try {
    const r = await getClient().reconnect(token);
    attach(r);
    r.send(C2S.sync);
    return true;
  } catch {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ok */
    }
    getState().set({ conn: 'offline' });
    return false;
  }
}

function saveToken(r: Room) {
  try {
    sessionStorage.setItem(TOKEN_KEY, r.reconnectionToken);
  } catch {
    /* ok */
  }
}

function attach(r: Room) {
  room = r;
  leaving = false;
  saveToken(r);
  const st = getState();
  st.set({ conn: 'online', sessionId: r.sessionId, code: r.roomId, screen: 'lobby' });

  r.onStateChange((state: any) => {
    const players: LobbyPlayerView[] = [];
    state.players?.forEach((p: any) =>
      players.push({ id: p.id, name: p.name, skin: p.skin, isBot: p.isBot, connected: p.connected }),
    );
    const prevPhase = getState().phase;
    const phase = state.phase as Phase;
    const patch: Record<string, unknown> = {
      players,
      phase,
      hostId: state.hostId,
      testMode: state.testMode,
      code: state.code || r.roomId,
      revealEndsAt: state.revealEndsAt,
    };
    if (phase === 'lobby') {
      patch.screen = 'lobby';
      if (prevPhase !== 'lobby') {
        getState().resetMatch();
        resetNet();
        voice.disconnect();
      }
    } else {
      patch.screen = 'game';
      if (phase === 'reveal' && prevPhase !== 'reveal') patch.showRole = true;
      if (phase === 'playing' && prevPhase === 'reveal') patch.showRole = false;
    }
    getState().set(patch);
  });

  r.onMessage(S2C.role, (m: RoleMsg) => {
    getState().set({ role: m, chatChannel: 'local' });
    r.send(C2S.voiceRequest);
  });
  r.onMessage(S2C.snap, (m: SnapshotMsg) => applySnapshot(m));
  r.onMessage(S2C.alert, (m: AlertMsg) => {
    getState().pushAlert(m);
    sfx.play(m.kind === 'revive' ? 'revive' : 'alert');
  });
  r.onMessage(S2C.chat, (m: ChatMsg) => {
    getState().pushChat(m);
    sfx.play('chat');
  });
  r.onMessage(S2C.toast, (m: ToastMsg) => getState().pushToast(m));
  r.onMessage(S2C.examine, (m: ExamineMsg) => getState().set({ examine: m }));
  r.onMessage(S2C.fx, (m: FxMsg) => {
    pushFx(m);
    const d = Math.hypot(m.x - net.local.x, m.z - net.local.z);
    if (m.kind === 'shot') sfx.play('shot', Math.max(0.15, 1 - d / 70));
    else if (d < 30 && m.kind.startsWith('teleport')) sfx.play('teleport', 1 - d / 30);
    else if (d < 20 && m.kind === 'kill') sfx.play('kill', 1 - d / 20);
  });
  r.onMessage(S2C.voice, (m: VoiceTokenMsg) => void voice.connect(m));
  r.onMessage(S2C.end, (m: EndMsg) => {
    getState().set({ end: m, chatOpen: false, teleportPicking: false, mapOpen: false });
    sfx.play('end');
  });

  r.onLeave((code) => {
    if (leaving || code === 1000) {
      cleanup();
      return;
    }
    void reconnectLoop(r.reconnectionToken);
  });
  r.onError((code, message) => console.warn('[sala] erro', code, message));
}

async function reconnectLoop(token: string) {
  const st = getState();
  st.set({ conn: 'reconnecting' });
  voice.pause();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const r = await getClient().reconnect(token);
      attach(r);
      r.send(C2S.sync);
      getState().pushToast({ text: 'Reconectado!', level: 'success' });
      return;
    } catch {
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
  cleanup();
  getState().set({ connError: 'Conexão perdida. Não foi possível voltar para a sala.' });
}

function cleanup() {
  room = null;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ok */
  }
  voice.disconnect();
  resetNet();
  const st = getState();
  st.resetMatch();
  st.set({ conn: 'offline', screen: 'home', phase: 'lobby', players: [], code: '' });
}

export function leaveRoom() {
  leaving = true;
  const r = room;
  cleanup();
  void r?.leave(true);
}

// ---------------------------------------------------------------- envio

export function sendInput(msg: InputMsg) {
  room?.send(C2S.input, msg);
}
export function sendAction(msg: ActionMsg) {
  room?.send(C2S.action, msg);
}
export function sendChat(text: string, channel: ChatChannel) {
  room?.send(C2S.chat, { text, channel });
}
export function sendLobby(update: { name?: string; skin?: string }) {
  room?.send(C2S.lobbyUpdate, update);
}
export function sendStart() {
  room?.send(C2S.lobbyStart);
}
export function sendBots(count: number) {
  room?.send(C2S.lobbyBots, { count });
}
export function sendReset() {
  room?.send(C2S.lobbyReset);
}
export function sendReport(targetId: string, reason: string) {
  room?.send(C2S.report, { targetId, reason });
}
