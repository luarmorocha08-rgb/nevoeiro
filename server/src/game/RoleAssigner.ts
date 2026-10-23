import {
  KILLER_ROLES,
  POWERED_ROLES,
  killersFor,
  shuffle,
  type RoleId,
} from '@nevoeiro/shared';

/**
 * Sorteia os papéis para N jogadores:
 * - assassinos (2/3/4 conforme config) sem repetir entre Metamorfo, Fantasma, Zumbi e Teleportador
 * - 1 de cada inocente com poder (Xerife, Detetive, Anjo, Rastreador)
 * - o resto é Civil
 * Retorna a lista já embaralhada (índice = jogador).
 */
export function assignRoles(playerCount: number, rnd: () => number = Math.random): RoleId[] {
  const k = Math.min(killersFor(playerCount), KILLER_ROLES.length, Math.max(1, playerCount - 1));
  const killers = shuffle(KILLER_ROLES, rnd).slice(0, k);
  const powered = shuffle(POWERED_ROLES, rnd).slice(0, Math.max(0, Math.min(POWERED_ROLES.length, playerCount - k)));
  const civils: RoleId[] = Array(Math.max(0, playerCount - k - powered.length)).fill('civil');
  return shuffle<RoleId>([...killers, ...powered, ...civils], rnd);
}
