import { CONFIG, type ActionMsg } from '@nevoeiro/shared';
import { fail, ok, type ActionResult } from '../game/types';
import { KillerRole } from './KillerRole';

const C = CONFIG.roles.teleportador;

/** TELEPORTADOR: escolhe qualquer ponto do mapa pelo minimapa e se teleporta (recarga 30s). */
export class Teleportador extends KillerRole {
  readonly id = 'teleportador' as const;

  protected performSpecial(msg: ActionMsg, now: number): ActionResult {
    if (msg.type !== 'teleport') return fail('Habilidade indisponível.');
    const p = msg.point;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return fail('Escolha um ponto no mapa.');
    const res = this.match.teleport(this.player, p.x, p.z);
    if (!res.ok) return res;
    this.setCooldown('teleport', C.cooldown, now);
    return ok();
  }
}
