import { CONFIG, type ActionMsg, type ActionType } from '@nevoeiro/shared';
import { fail, ok, type ActionResult } from '../game/types';
import { Role } from './Role';

const C = CONFIG.roles.anjo;

/** ANJO: ressuscita UM jogador morto tocando no corpo (uso único). Ele volta com o mesmo papel. */
export class Anjo extends Role {
  readonly id = 'anjo' as const;
  private uses: number = C.uses;

  protected perform(msg: ActionMsg): ActionResult {
    if (msg.type !== 'revive') return fail('Habilidade indisponível.');
    const body = msg.targetId ? this.match.getBody(msg.targetId) : undefined;
    if (!body) return fail('Nenhum corpo por perto.');
    if (Math.hypot(body.x - this.player.x, body.z - this.player.z) > C.range + 0.3)
      return fail('Toque no corpo para ressuscitar.');
    const res = this.match.revive(body, this.player);
    if (res.ok) this.uses--;
    return res.ok ? ok() : res;
  }

  blockedReason(a: ActionType): string | null {
    return a === 'revive' && this.uses <= 0 ? 'Já usado' : null;
  }

  usesLeft(): number {
    return this.uses;
  }

  init(now: number): void {
    super.init(now);
    this.cooldownUntil.set('revive', 0);
  }
}
