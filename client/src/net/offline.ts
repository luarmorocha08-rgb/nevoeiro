/**
 * Partida OFFLINE contra bots, sem servidor: roda a MESMA lógica do servidor
 * (Match, papéis e bots de /server/src/game) dentro do navegador.
 * Útil para testar sozinho ou quando o site está publicado sem o servidor de jogo.
 */
import { BOT_NAMES } from '@nevoeiro/game/Bots';
import { Match, type MatchIO } from '@nevoeiro/game/Match';
import { C2S, CONFIG, S2C, SKINS, shuffle, type ActionMsg, type ChatSendMsg, type InputMsg, type TaskOpMsg } from '@nevoeiro/shared';
import { applyRoomState, handleServerMessage, setOfflineSink } from './connection';
import { resetNet } from './netState';
import { getState, type LobbyPlayerView } from './store';

const LOCAL_ID = 'local';
let timer: ReturnType<typeof setInterval> | null = null;
let match: Match | null = null;
let players: LobbyPlayerView[] = [];
let me = { name: 'Viajante', skin: SKINS[0].id };

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  match = null;
}

function begin() {
  stop();
  getState().resetMatch();
  resetNet();
  const bots = CONFIG.players.testModeFillTo - 1;
  const skins = shuffle(SKINS.filter((s) => s.id !== me.skin));
  const names = shuffle(BOT_NAMES);
  players = [
    { id: LOCAL_ID, name: me.name, skin: me.skin, isBot: false, connected: true },
    ...Array.from({ length: bots }, (_, i) => ({
      id: `bot-${i}`,
      name: `${names[i]} 🤖`,
      skin: skins[i % skins.length].id,
      isBot: true,
      connected: true,
    })),
  ];

  const io: MatchIO = {
    send: (p, type, msg) => {
      if (p.sessionId === LOCAL_ID) handleServerMessage(type, msg);
    },
    broadcast: (type, msg) => handleServerMessage(type, msg),
    onVoiceChange: () => {},
    onPhase: (phase, revealEndsAt) => applyRoomState({ ...view(phase), revealEndsAt }),
    onEnd: (msg) => handleServerMessage(S2C.end, msg),
  };
  match = new Match(
    io,
    players.map((p) => ({ sessionId: p.isBot ? null : LOCAL_ID, name: p.name, skin: p.skin, isBot: p.isBot })),
    'OFFLINE',
  );
  getState().set({ sessionId: LOCAL_ID, conn: 'online', connError: null });
  applyRoomState(view('reveal'));
  getState().set({
    voice: { ...getState().voice, status: 'unavailable', channel: null, reason: 'Modo offline: sem chat de voz.' },
  });
  // depuração (só em desenvolvimento): acesso à partida local pelo console
  if (import.meta.env.DEV) Object.assign(window, { __nevoeiroMatch: match });
  const dt = 1 / CONFIG.net.tickRate;
  timer = setInterval(() => match?.tick(dt), dt * 1000);
}

function view(phase: 'lobby' | 'reveal' | 'playing' | 'intermission' | 'ended') {
  return {
    players,
    phase,
    hostId: LOCAL_ID,
    testMode: true,
    code: 'OFFLINE',
    revealEndsAt: match?.revealEndsAt ?? 0,
  };
}

/** Recebe o que o cliente "enviaria" ao servidor. */
function onClientMessage(type: string, msg: unknown) {
  const self = match?.bySession(LOCAL_ID);
  switch (type) {
    case C2S.input:
      if (self) match!.applyInput(self, msg as InputMsg);
      break;
    case C2S.action:
      if (self) match!.handleAction(self, msg as ActionMsg);
      break;
    case C2S.task:
      if (self) match!.taskOp(self, msg as TaskOpMsg);
      break;
    case C2S.chat: {
      const c = msg as ChatSendMsg;
      if (self) match!.chat(self, c.text, c.channel);
      break;
    }
    case C2S.lobbyReset:
    case C2S.lobbyStart:
      begin();
      break;
    case C2S.report:
      getState().pushToast({ text: 'Denúncias só funcionam online.', level: 'info' });
      break;
    case 'leave':
      stop();
      break;
  }
}

export function startOffline(name: string, skin: string) {
  me = { name, skin };
  setOfflineSink(onClientMessage);
  begin();
}

export function isOffline() {
  return match !== null;
}
