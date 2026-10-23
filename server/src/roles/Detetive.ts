import { CONFIG, type ActionMsg } from '@nevoeiro/shared';
import { fail, ok, type ActionResult } from '../game/types';
import { Role } from './Role';

const C = CONFIG.roles.detetive;

/**
 * DETETIVE:
 * - EXAMINAR CORPO: há quanto tempo morreu e que tipo de assassino matou.
 * - ALGEMAR: assassino sai da partida (preso). Inocente: algema bloqueada 60s e alvo imobilizado 10s.
 */
export class Detetive extends Role {
  readonly id = 'detetive' as const;

  protected perform(msg: ActionMsg, now: number): ActionResult {
    if (msg.type === 'examine') return this.examine(msg);
    if (msg.type === 'cuff') return this.cuff(msg, now);
    return fail('Habilidade indisponível.');
  }

  private examine(msg: ActionMsg): ActionResult {
    const body = msg.targetId ? this.match.getBody(msg.targetId) : undefined;
    if (!body) return fail('Nenhum corpo por perto.');
    if (Math.hypot(body.x - this.player.x, body.z - this.player.z) > C.examineRange + 0.3)
      return fail('Chegue mais perto do corpo.');
    this.match.sendExamine(this.player, body);
    this.match.logEvent('examine', { actor: this.player, body: body.victimName });
    return ok();
  }

  private cuff(msg: ActionMsg, now: number): ActionResult {
    const target = msg.targetId ? this.match.getPlayer(msg.targetId) : undefined;
    if (!target || target === this.player || !target.alive) return fail('Ninguém para algemar.');
    const reach = this.match.checkReach(this.player, target, C.cuffRange, now);
    if (reach) return fail(reach);
    this.match.fx({ kind: 'cuff', x: target.x, z: target.z });

    if (target.role.isKiller) {
      this.match.arrest(target, this.player);
      this.setCooldown('cuff', C.cuffCooldown, now);
    } else {
      this.match.immobilize(target, C.immobilizeSeconds);
      this.setCooldown('cuff', C.wrongCuffPenalty, now);
      this.match.logEvent('cuff_wrong', { actor: this.player, target });
      this.match.toast(this.player, `${target.name} é inocente. Algema bloqueada por ${C.wrongCuffPenalty}s.`, 'warn');
      this.match.toast(target, `Você foi algemado por engano! Imobilizado por ${C.immobilizeSeconds}s.`, 'warn');
    }
    return ok();
  }

  init(now: number): void {
    super.init(now);
    this.cooldownUntil.set('examine', 0);
  }
}
