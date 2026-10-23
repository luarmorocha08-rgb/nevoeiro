import { CONFIG, type ActionMsg, type ActionType } from '@nevoeiro/shared';
import { fail, ok, type ActionResult } from '../game/types';
import { Role } from './Role';

/** Base dos assassinos: todos têm a ação MATAR (alcance curto, recarga de 25s). */
export abstract class KillerRole extends Role {
  protected perform(msg: ActionMsg, now: number): ActionResult {
    if (msg.type === 'kill') return this.kill(msg, now);
    return this.performSpecial(msg, now);
  }

  protected performSpecial(_msg: ActionMsg, _now: number): ActionResult {
    return fail('Habilidade indisponível.');
  }

  /** Motivo de não poder matar agora (Fantasma invisível, Zumbi sem forças...). */
  protected killBlocked(_now: number): string | null {
    return null;
  }

  blockedReason(a: ActionType, now: number): string | null {
    if (a === 'kill') return this.killBlocked(now);
    return null;
  }

  protected kill(msg: ActionMsg, now: number): ActionResult {
    const target = msg.targetId ? this.match.getPlayer(msg.targetId) : undefined;
    if (!target || target === this.player) return fail('Nenhum alvo.');
    if (!target.alive) return fail('O alvo já está morto.');
    if (target.role.isKiller) return fail('Esse é seu parceiro.');
    const reach = this.match.checkReach(this.player, target, CONFIG.kill.range, now);
    if (reach) return fail(reach);

    const label = this.killLabel(now);
    this.match.killPlayer(target, { cause: 'kill', killer: this.player, label });
    this.setCooldown('kill', CONFIG.kill.cooldown, now);
    this.onKilled(now);
    return ok();
  }
}
