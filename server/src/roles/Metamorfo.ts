import { CONFIG, type ActionMsg } from '@nevoeiro/shared';
import { fail, ok, type ActionResult } from '../game/types';
import { KillerRole } from './KillerRole';
import type { Disguise } from './Role';

const C = CONFIG.roles.metamorfo;

/** METAMORFO: copia aparência e nome de outro jogador por 15s (recarga 40s). */
export class Metamorfo extends KillerRole {
  readonly id = 'metamorfo' as const;
  private copied: Disguise | null = null;

  protected performSpecial(msg: ActionMsg, now: number): ActionResult {
    if (msg.type !== 'morph') return fail('Habilidade indisponível.');
    const target = msg.targetId ? this.match.getPlayer(msg.targetId) : undefined;
    if (!target || target === this.player || !target.alive) return fail('Escolha alguém para copiar.');
    const reach = this.match.checkReach(this.player, target, C.range, now);
    if (reach) return fail(reach);
    // copia o que o alvo APARENTA ser (inclusive outro disfarce)
    const look = target.role.disguise(now) ?? { name: target.name, skin: target.skin };
    this.copied = { name: look.name, skin: look.skin };
    this.setActive('morph', C.duration, now);
    this.setCooldown('morph', C.cooldown, now);
    this.match.fx({ kind: 'morph', x: this.player.x, z: this.player.z });
    this.match.logEvent('morph', { actor: this.player, target });
    this.match.toast(this.player, `Você agora é ${look.name}.`, 'success');
    return ok();
  }

  disguise(now: number): Disguise | null {
    return this.isActive('morph', now) ? this.copied : null;
  }

  /** O corpo sempre registra o tipo "Metamorfo" — especialmente se matou transformado. */
  killLabel(): string {
    return 'metamorfo';
  }

  onDeath(now: number) {
    this.copied = null;
    return super.onDeath(now);
  }
}
