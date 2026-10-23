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
  type AckMsg,
  type TasksMsg,
  type TaskOpMsg,
  type VoiceTokenMsg,
  CONFIG,
} from '@nevoeiro/shared';
import { sfx } from '../audio/sfx';
import { onActionAck } from '../game/feedback';
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
  // a tela (lobby/jogo) é decidida pelo estado da sala — assim reconectar não remonta a cena 3D
  st.set({ conn: 'online', sessionId: r.sessionId, code: r.roomId });

  r.onStateChange((state: any) => {
    const players: LobbyPlayerView[] = [];
    state.players?.forEach((p: any) =>
      players.push({ id: p.id, name: p.name, skin: p.skin, isBot: p.isBot, connected: p.connected }),
    );
    applyRoomState({
      players,
      phase: state.phase as Phase,
      hostId: state.hostId,
      testMode: state.testMode,
      code: state.code || r.roomId,
      revealEndsAt: state.revealEndsAt,
    });
  });

  for (const type of Object.values(S2C)) r.onMessage(type, (m: unknown) => handleServerMessage(type, m));

  r.onLeave((code) => {
    if (leaving || code === 1000) {
      cleanup();
      return;
    }
    void reconnectLoop(r.reconnectionToken);
  });
  r.onError((code, message) => console.warn('[sala] erro', code, message));
}

export interface RoomStateView {
  players: LobbyPlayerView[];
  phase: Phase;
  hostId: string;
  testMode: boolean;
  code: string;
  revealEndsAt: number;
}

/** Aplica o estado público da sala (online: schema do Colyseus; offline: partida local). */
export function applyRoomState(view: RoomStateView) {
  const prevPhase = getState().phase;
  const patch: Record<string, unknown> = { ...view };
  if (view.phase === 'lobby') {
    patch.screen = 'lobby';
    if (prevPhase !== 'lobby') {
      getState().resetMatch();
      resetNet();
      voice.disconnect();
    }
  } else {
    patch.screen = 'game';
    if (view.phase === 'reveal' && prevPhase !== 'reveal') patch.showRole = true;
    if (view.phase === 'playing' && prevPhase === 'reveal') patch.showRole = false;
  }
  getState().set(patch);
}

/** Mensagens do servidor (ou da partida offline). */
export function handleServerMessage(type: string, m: any) {
  switch (type) {
    case S2C.role:
      getState().set({ role: m as RoleMsg, chatChannel: 'local' });
      room?.send(C2S.voiceRequest);
      break;
    case S2C.snap:
      applySnapshot(m as SnapshotMsg);
      break;
    case S2C.alert:
      getState().pushAlert(m as AlertMsg);
      sfx.play((m as AlertMsg).kind === 'revive' ? 'revive' : 'alert');
      break;
    case S2C.chat:
      getState().pushChat(m as ChatMsg);
      sfx.play('chat');
      break;
    case S2C.ack:
      onActionAck(m as AckMsg);
      break;
    case S2C.tasks: {
      const t = m as TasksMsg;
      const st = getState();
      const prev = st.tasks;
      // minijogo aberto e o servidor cancelou (afastou, algemado, morreu): fecha
      const patch: Record<string, unknown> = { tasks: t };
      if (st.taskOpen && !t.active) patch.taskOpen = null;
      if (prev) {
        const finished = t.list.find((x) => x.done && !prev.list.find((p) => p.id === x.id)?.done);
        if (finished) sfx.play('taskDone');
      }
      st.set(patch);
      break;
    }
    case S2C.toast:
      getState().pushToast(m as ToastMsg);
      break;
    case S2C.examine:
      getState().set({ examine: m as ExamineMsg });
      break;
    case S2C.fx: {
      const f = m as FxMsg;
      pushFx(f);
      // som 3D: volume e lado conforme a posição do evento
      const pos = { x: f.x, z: f.z };
      if (f.kind === 'shot') sfx.play('shot', 1, pos);
      else if (f.kind.startsWith('teleport')) sfx.play('teleport', 0.8, pos);
      else if (f.kind === 'kill') sfx.play('kill', 0.8, pos);
      else if (f.kind === 'vanish' || f.kind === 'appear') sfx.play('vanish', 0.6, pos);
      else if (f.kind === 'morph') sfx.play('morph', 0.6, pos);
      else if (f.kind === 'cuff') sfx.play('cuff', 0.8, pos);
      else if (f.kind === 'zombie') sfx.play('vanish', 0.8, pos);
      else if (f.kind === 'lamp') sfx.play('lamp', 1, pos);
      else if (f.kind === 'bell') {
        sfx.play('bell', 1.2, pos);
        net.bellUntil = performance.now() + CONFIG.tasks.bellFogSeconds * 1000;
      }
      break;
    }
    case S2C.voice:
      void voice.connect(m as VoiceTokenMsg);
      break;
    case S2C.end:
      getState().set({ end: m as EndMsg, chatOpen: false, teleportPicking: false, mapOpen: false });
      sfx.play('end');
      break;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const h = setTimeout(() => reject(new Error('tempo esgotado')), ms);
    p.then(
      (v) => {
        clearTimeout(h);
        resolve(v);
      },
      (e) => {
        clearTimeout(h);
        reject(e);
      },
    );
  });
}

async function reconnectLoop(token: string) {
  const st = getState();
  st.set({ conn: 'reconnecting' });
  voice.pause();
  const deadline = Date.now() + 45_000;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    try {
      // cada tentativa tem tempo limite: sem rede, a conexão pode ficar pendurada para sempre
      const r = await withTimeout(getClient().reconnect(token), 6000);
      attach(r);
      r.send(C2S.sync);
      getState().pushToast({ text: 'Reconectado!', level: 'success' });
      return;
    } catch (err) {
      console.warn(`[reconexão] tentativa ${attempt} falhou:`, err instanceof Error ? err.message : err);
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
  if (offlineSink) {
    offlineSink('leave', null);
    offlineSink = null;
    cleanup();
    return;
  }
  leaving = true;
  const r = room;
  cleanup();
  void r?.leave(true);
}

// ---------------------------------------------------------------- envio

/** Partida offline (contra bots, sem servidor): recebe o que seria enviado ao servidor. */
let offlineSink: ((type: string, msg: unknown) => void) | null = null;
export function setOfflineSink(fn: typeof offlineSink) {
  offlineSink = fn;
}
function send(type: string, msg?: unknown) {
  if (offlineSink) offlineSink(type, msg);
  else room?.send(type, msg);
}

export function sendInput(msg: InputMsg) {
  send(C2S.input, msg);
}
export function sendAction(msg: ActionMsg) {
  send(C2S.action, msg);
}
export function sendChat(text: string, channel: ChatChannel) {
  send(C2S.chat, { text, channel });
}
export function sendLobby(update: { name?: string; skin?: string }) {
  send(C2S.lobbyUpdate, update);
}
export function sendStart() {
  send(C2S.lobbyStart);
}
export function sendBots(count: number) {
  send(C2S.lobbyBots, { count });
}
export function sendReset() {
  send(C2S.lobbyReset);
}
export function sendTask(op: TaskOpMsg['op'], id: string) {
  send(C2S.task, { op, id } satisfies TaskOpMsg);
}
export function sendReport(targetId: string, reason: string) {
  send(C2S.report, { targetId, reason });
}
