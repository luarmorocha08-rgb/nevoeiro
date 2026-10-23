import { CONFIG, type YouSnap } from '@nevoeiro/shared';
import { KillerRole } from './KillerRole';
import type { DeathOutcome, Disguise } from './Role';

const C = CONFIG.roles.zumbi;

/**
 * ZUMBI: ao ser eliminado, volta após 30s em posição aleatória. Os outros recebem o alerta
 * da morte, mas NÃO do retorno (continua morto para eles). Depois de voltar pode matar só
 * UMA vez; se cair de novo, morre de vez.
 * Exceção: ressuscitado pelo Anjo, volta como assassino normal e o retorno fica disponível de novo.
 */
export class Zumbi extends KillerRole {
  readonly id = 'zumbi' as const;
  /** já usou o retorno e está "morto-vivo" */
  private returned = false;
  private killsLeft = Infinity;
  private returnAt = 0;

  onDeath(now: number): DeathOutcome {
    super.onDeath(now);
    if (!this.returned) {
      this.returnAt = now + C.returnDelay * 1000;
      return { permanent: false };
    }
    this.returnAt = 0;
    return { permanent: true };
  }

  tick(now: number): void {
    if (this.returnAt && now >= this.returnAt && !this.player.alive && !this.player.arrested) {
      this.returnAt = 0;
      this.returned = true;
      this.killsLeft = C.killsAfterReturn;
      this.match.zombieReturn(this.player);
    }
  }

  onRevived(): void {
    // Anjo: volta como assassino normal, com matar completo e retorno disponível
    this.returned = false;
    this.killsLeft = Infinity;
    this.returnAt = 0;
  }

  /** Preso pelo Detetive: não volta mais. */
  cancelReturn(): void {
    this.returnAt = 0;
  }

  get isPendingReturn(): boolean {
    return this.returnAt > 0;
  }

  onKilled(): void {
    if (this.returned) this.killsLeft--;
  }

  protected killBlocked(): string | null {
    return this.killsLeft <= 0 ? 'Sem forças para matar de novo.' : null;
  }

  /** Quem voltou da cova anda sem nome visível — para os outros, continua morto. */
  disguise(): Disguise | null {
    return this.returned && this.player.alive ? { name: '', skin: this.player.skin, hideName: true } : null;
  }

  extraYou(now: number): Partial<YouSnap> {
    if (this.returnAt) return { zombie: 'voltando', zombieReturnIn: Math.max(0, this.returnAt - now) };
    if (this.returned) return { zombie: this.player.alive ? 'retornou' : 'usado' };
    return { zombie: 'disponivel' };
  }
}
