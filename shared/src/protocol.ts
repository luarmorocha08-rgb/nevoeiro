/**
 * Mensagens trocadas entre cliente e servidor (Colyseus room.send / onMessage).
 * O estado de alta frequência (posições) vai em snapshots filtrados por jogador,
 * para que o servidor nunca envie o que o jogador não deveria ver
 * (Fantasma invisível, gente fora do alcance da neblina, papéis...).
 */
import type { ActionType, RoleId, Team } from './roles';

export const ROOM_NAME = 'nevoeiro';

export type Phase = 'lobby' | 'reveal' | 'playing' | 'ended';
export type ChatChannel = 'local' | 'killers' | 'dead';

// ----------------------------- Cliente → Servidor -----------------------------

export interface InputMsg {
  seq: number;
  dt: number;
  mx: number;
  mz: number;
  run: boolean;
  yaw: number;
}

export interface ActionMsg {
  type: ActionType;
  targetId?: string;
  point?: { x: number; z: number };
}

export interface ChatSendMsg {
  text: string;
  channel: ChatChannel;
}

export interface LobbyUpdateMsg {
  name?: string;
  skin?: string;
}

export interface ReportMsg {
  targetId: string;
  reason: string;
}

export const C2S = {
  input: 'input',
  action: 'action',
  chat: 'chat',
  lobbyUpdate: 'lobby:update',
  lobbyStart: 'lobby:start',
  lobbyBots: 'lobby:bots',
  lobbyReset: 'lobby:reset',
  voiceRequest: 'voice:request',
  report: 'report',
  sync: 'sync',
} as const;

// ----------------------------- Servidor → Cliente -----------------------------

export interface RoleMsg {
  netId: string;
  role: RoleId;
  team: Team;
  partners: { netId: string; name: string; role: RoleId }[];
  killers: number;
  totalInnocents: number;
  killsNeeded: number;
}

export interface AbilityState {
  action: ActionType;
  /** ms restantes de recarga */
  cd: number;
  /** ms restantes de efeito ativo */
  active: number;
  uses?: number;
  /** motivo de bloqueio (ex.: "Invisível") */
  blocked?: string;
}

/** Flags de entidade em bits. */
export const EF = {
  RUN: 1,
  WALK: 2,
  /** Translúcido (aliado invisível / espectador vendo o Fantasma). */
  GHOST: 4,
  /** Sem nome visível (Zumbi que voltou). */
  NONAME: 8,
  /** Algemado / imobilizado. */
  FROZEN: 16,
  /** Aliado assassino (só aparece para assassinos). */
  ALLY: 32,
} as const;

export interface EntitySnap {
  id: string;
  /** nome exibido (Metamorfo transformado = nome copiado) */
  n: string;
  /** skin exibida */
  s: string;
  x: number;
  z: number;
  y: number;
  f: number;
  /** papel — só enviado a espectadores */
  r?: RoleId;
}

export interface BodySnap {
  id: string;
  n: string;
  s: string;
  x: number;
  z: number;
  y: number;
}

export interface YouSnap {
  x: number;
  z: number;
  ack: number;
  alive: boolean;
  /** espectador: morto, preso ou aguardando retorno */
  spectator: boolean;
  arrested: boolean;
  frozen: number;
  abilities: AbilityState[];
  invisible: boolean;
  disguise: string | null;
  /** skin copiada pelo Metamorfo (para o próprio jogador se ver disfarçado) */
  disguiseSkin: string | null;
  thermal: boolean;
  /** Zumbi: estado do retorno */
  zombie?: 'disponivel' | 'voltando' | 'usado' | 'retornou';
  zombieReturnIn?: number;
}

export interface SnapshotMsg {
  t: number;
  you: YouSnap;
  e: EntitySnap[];
  b: BodySnap[];
  /** posições só de áudio (quem fala sem ser visto: Fantasma invisível) */
  a: { id: string; x: number; z: number }[];
  /** silhuetas térmicas (Rastreador) */
  th?: { id: string; x: number; z: number }[];
  c: { aliveInnocents: number; totalInnocents: number; deadInnocents: number; killsNeeded: number; killers: number };
}

export interface AlertMsg {
  kind: 'death' | 'revive' | 'arrest';
  text: string;
  x: number;
  z: number;
  location: string;
  at: number;
}

export interface ChatMsg {
  id: string;
  fromId: string;
  fromName: string;
  text: string;
  channel: ChatChannel;
  /** true = sem indicador visual (Fantasma invisível) */
  anonymous?: boolean;
  at: number;
}

export interface ToastMsg {
  text: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

export interface ExamineMsg {
  victimName: string;
  secondsAgo: number;
  killer: string;
  location: string;
}

export interface FxMsg {
  kind: 'shot' | 'teleport-out' | 'teleport-in' | 'morph' | 'kill' | 'revive' | 'cuff';
  x: number;
  z: number;
  x2?: number;
  z2?: number;
}

export interface VoiceTokenMsg {
  available: boolean;
  url?: string;
  token?: string;
  room?: string;
  channel?: 'vivos' | 'mortos';
  reason?: string;
}

export interface EndMsg {
  winner: Team;
  reason: string;
  players: {
    netId: string;
    name: string;
    skin: string;
    role: RoleId;
    team: Team;
    status: 'vivo' | 'morto' | 'preso';
    isBot: boolean;
  }[];
  timeline: { t: number; text: string }[];
  durationSec: number;
}

export const S2C = {
  role: 'role',
  snap: 'snap',
  alert: 'alert',
  chat: 'chat',
  toast: 'toast',
  examine: 'examine',
  fx: 'fx',
  voice: 'voice',
  end: 'end',
  serverTime: 'time',
} as const;
