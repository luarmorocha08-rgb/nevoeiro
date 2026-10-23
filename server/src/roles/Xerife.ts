import { CONFIG, type ActionMsg } from '@nevoeiro/shared';
import { fail, ok, type ActionResult } from '../game/types';
import { Role } from './Role';

const C = CONFIG.roles.xerife;

/**
 * XERIFE: atira em um jogador (alcance médio, 1 tiro a cada 30s).
 * Assassino atingido morre. Inocente atingido: morrem o inocente E o xerife.
 */
export class Xerife extends Role {
  readonly id = 'xerife' as const;

  protected perform(msg: ActionMsg, now: number): ActionResult {
    if (msg.type !== 'shoot') return fail('Habilidade indisponível.');
    const target = msg.targetId ? this.match.getPlayer(msg.targetId) : undefined;
    if (!target || target === this.player || !target.alive) return fail('Mire em alguém.');
    const reach = this.match.checkReach(this.player, target, C.range, now);
    if (reach) return fail(reach);

    this.setCooldown('shoot', C.cooldown, now);
    this.match.fx({ kind: 'shot', x: this.player.x, z: this.player.z, x2: target.x, z2: target.z });

    if (target.role.isKiller) {
      this.match.logEvent('shot', { actor: this.player, target, hit: 'assassino' });
      this.match.killPlayer(target, { cause: 'shot', killer: this.player, label: 'xerife' });
    } else {
      this.match.logEvent('misfire', { actor: this.player, target, hit: 'inocente' });
      this.match.killPlayer(target, { cause: 'shot', killer: this.player, label: 'xerife' });
      this.match.killPlayer(this.player, { cause: 'misfire', label: 'misfire' });
    }
    return ok();
  }
}
