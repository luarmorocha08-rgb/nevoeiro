import type { RoleId } from '@nevoeiro/shared';
import type { Match } from '../game/Match';
import type { ServerPlayer } from '../game/types';
import { Anjo } from './Anjo';
import { Civil } from './Civil';
import { Detetive } from './Detetive';
import { Fantasma } from './Fantasma';
import { Metamorfo } from './Metamorfo';
import { Rastreador } from './Rastreador';
import type { Role } from './Role';
import { Teleportador } from './Teleportador';
import { Xerife } from './Xerife';
import { Zumbi } from './Zumbi';

type RoleCtor = new (player: ServerPlayer, match: Match) => Role;

/** Registro de papéis: para criar um novo, adicione um arquivo e registre aqui. */
export const ROLE_CLASSES: Record<RoleId, RoleCtor> = {
  metamorfo: Metamorfo,
  fantasma: Fantasma,
  zumbi: Zumbi,
  teleportador: Teleportador,
  xerife: Xerife,
  detetive: Detetive,
  anjo: Anjo,
  rastreador: Rastreador,
  civil: Civil,
};

export function createRole(id: RoleId, player: ServerPlayer, match: Match): Role {
  return new ROLE_CLASSES[id](player, match);
}

export { Role, Zumbi };
