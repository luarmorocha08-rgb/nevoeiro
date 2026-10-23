import type { RoleId } from '@nevoeiro/shared';
import type { Role } from '../roles/Role';
import type { BotBrain } from './Bots';

/** Estado completo de um jogador — só existe no servidor. */
export interface ServerPlayer {
  /** id da sessão Colyseus (null para bots) */
  sessionId: string | null;
  /** id opaco usado na partida (snapshots, chat, voz) — não liga ao lobby */
  netId: string;
  name: string;
  skin: string;
  isBot: boolean;
  connected: boolean;

  x: number;
  z: number;
  /** velocidade e stamina (mesma simulação da predição do cliente) */
  vx: number;
  vz: number;
  stamina: number;
  exhausted: boolean;
  yaw: number;
  /** 0 parado, 1 andando, 2 correndo */
  moving: number;

  alive: boolean;
  arrested: boolean;
  diedAt: number;
  frozenUntil: number;

  role: Role;

  lastSeq: number;
  moveBudget: number;
  lastBudgetAt: number;
  lastMoveAt: number;
  lastChatAt: number;

  bot?: BotBrain;
}

export interface Body {
  id: string;
  victimNetId: string;
  victimName: string;
  skin: string;
  x: number;
  z: number;
  yaw: number;
  diedAt: number;
  /** "tipo de assassino" revelado ao Detetive */
  killerLabel: string;
  location: string;
}

export type DeathCause = 'kill' | 'shot' | 'misfire';

export interface KillInfo {
  cause: DeathCause;
  killer?: ServerPlayer;
  /** chave em KILLER_LABELS */
  label: string;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export const ok = (): ActionResult => ({ ok: true });
export const fail = (error: string): ActionResult => ({ ok: false, error });

export interface RoleSummary {
  netId: string;
  name: string;
  role: RoleId;
}
