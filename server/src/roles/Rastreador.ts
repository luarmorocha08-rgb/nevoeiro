import { CONFIG, type ActionMsg } from '@nevoeiro/shared';
import { fail, ok, type ActionResult } from '../game/types';
import { Role } from './Role';

const C = CONFIG.roles.rastreador;

/** RASTREADOR: óculos de calor por 5s — vê todos através de paredes e neblina, inclusive o Fantasma. */
export class Rastreador extends Role {
  readonly id = 'rastreador' as const;

  protected perform(msg: ActionMsg, now: number): ActionResult {
    if (msg.type !== 'thermal') return fail('Habilidade indisponível.');
    this.setActive('thermal', C.duration, now);
    this.setCooldown('thermal', C.cooldown, now);
    this.match.logEvent('thermal', { actor: this.player });
    return ok();
  }

  hasThermal(now: number): boolean {
    return this.player.alive && this.isActive('thermal', now);
  }
}
