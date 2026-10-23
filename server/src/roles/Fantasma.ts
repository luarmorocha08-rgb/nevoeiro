import { CONFIG, type ActionMsg } from '@nevoeiro/shared';
import { fail, ok, type ActionResult } from '../game/types';
import { KillerRole } from './KillerRole';

const C = CONFIG.roles.fantasma;

/** FANTASMA: invisível por 10s (recarga 35s). Não pode matar enquanto invisível. */
export class Fantasma extends KillerRole {
  readonly id = 'fantasma' as const;
  private wasInvisible = false;

  /** Fim da invisibilidade: efeito de reaparecer (dissolve ao contrário). */
  tick(now: number): void {
    if (this.wasInvisible && !this.isInvisible(now)) {
      this.wasInvisible = false;
      if (this.player.alive) this.match.fx({ kind: 'appear', x: this.player.x, z: this.player.z, id: this.player.netId });
    }
  }

  protected performSpecial(msg: ActionMsg, now: number): ActionResult {
    if (msg.type !== 'invisible') return fail('Habilidade indisponível.');
    this.setActive('invisible', C.duration, now);
    this.setCooldown('invisible', C.cooldown, now);
    this.wasInvisible = true;
    this.match.fx({ kind: 'vanish', x: this.player.x, z: this.player.z, id: this.player.netId });
    this.match.logEvent('invisible', { actor: this.player });
    return ok();
  }

  protected killBlocked(now: number): string | null {
    return this.isInvisible(now) ? 'Não pode matar invisível.' : null;
  }

  isInvisible(now: number): boolean {
    return this.player.alive && this.isActive('invisible', now);
  }
}
