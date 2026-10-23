import {
  CONFIG,
  ROLE_INFO,
  type ActionMsg,
  type ActionType,
  type AbilityState,
  type RoleId,
  type RoleInfo,
  type Team,
  type YouSnap,
} from '@nevoeiro/shared';
import type { Match } from '../game/Match';
import { fail, type ActionResult, type ServerPlayer } from '../game/types';

export interface DeathOutcome {
  /** false = o jogador ainda pode voltar (Zumbi) */
  permanent: boolean;
}

export interface Disguise {
  name: string;
  skin: string;
  hideName?: boolean;
}

/**
 * Classe base de todos os papéis. Cada papel vive em seu próprio arquivo
 * e sobrescreve só o que muda. Tudo roda no servidor (autoritativo).
 */
export abstract class Role {
  abstract readonly id: RoleId;

  protected cooldownUntil = new Map<ActionType, number>();
  protected activeUntil = new Map<ActionType, number>();

  constructor(
    readonly player: ServerPlayer,
    protected readonly match: Match,
  ) {}

  get info(): RoleInfo {
    return ROLE_INFO[this.id];
  }
  get team(): Team {
    return this.info.team;
  }
  get isKiller(): boolean {
    return this.team === 'assassinos';
  }

  actions(): ActionType[] {
    return this.info.abilities.map((a) => a.action);
  }

  /** Chamado quando a partida começa. */
  init(now: number): void {
    for (const a of this.actions()) this.setCooldown(a, CONFIG.match.initialCooldown, now);
  }

  // ---------- recargas e efeitos ----------
  cooldownLeft(a: ActionType, now: number): number {
    return Math.max(0, (this.cooldownUntil.get(a) ?? 0) - now);
  }
  setCooldown(a: ActionType, seconds: number, now: number): void {
    this.cooldownUntil.set(a, now + seconds * 1000);
  }
  activeLeft(a: ActionType, now: number): number {
    return Math.max(0, (this.activeUntil.get(a) ?? 0) - now);
  }
  isActive(a: ActionType, now: number): boolean {
    return this.activeLeft(a, now) > 0;
  }
  setActive(a: ActionType, seconds: number, now: number): void {
    this.activeUntil.set(a, now + seconds * 1000);
  }
  endActive(a: ActionType): void {
    this.activeUntil.delete(a);
  }

  /** Validação comum + despacho para o papel. */
  tryAction(msg: ActionMsg, now: number): ActionResult {
    if (!this.actions().includes(msg.type)) return fail('Seu papel não tem essa habilidade.');
    if (!this.player.alive) return fail('Você está morto.');
    if (this.player.frozenUntil > now) return fail('Você está algemado.');
    const blocked = this.blockedReason(msg.type, now);
    if (blocked) return fail(blocked);
    const cd = this.cooldownLeft(msg.type, now);
    if (cd > 0) return fail(`Recarregando (${Math.ceil(cd / 1000)}s).`);
    return this.perform(msg, now);
  }

  /** Implementação específica de cada papel. */
  protected perform(_msg: ActionMsg, _now: number): ActionResult {
    return fail('Habilidade indisponível.');
  }

  /** Motivo pelo qual a ação está bloqueada agora (ou null). */
  blockedReason(_a: ActionType, _now: number): string | null {
    return null;
  }

  usesLeft(_a: ActionType): number | undefined {
    return undefined;
  }

  // ---------- modificadores consultados pela partida ----------
  isInvisible(_now: number): boolean {
    return false;
  }
  disguise(_now: number): Disguise | null {
    return null;
  }
  hasThermal(_now: number): boolean {
    return false;
  }
  /** Rótulo registrado no corpo quando este papel mata (chave de KILLER_LABELS). */
  killLabel(_now: number): string {
    return this.id;
  }

  // ---------- ciclo de vida ----------
  onDeath(_now: number): DeathOutcome {
    this.activeUntil.clear();
    return { permanent: true };
  }
  /** Ressuscitado pelo Anjo. */
  onRevived(_now: number): void {}
  /** Chamado a cada tick do servidor. */
  tick(_now: number): void {}
  /** Matou alguém (assassinos). */
  onKilled(_now: number): void {}

  /** Campos extras do HUD (ex.: estado do retorno do Zumbi). */
  extraYou(_now: number): Partial<YouSnap> {
    return {};
  }

  abilityStates(now: number): AbilityState[] {
    return this.actions().map((a) => ({
      action: a,
      cd: this.cooldownLeft(a, now),
      active: this.activeLeft(a, now),
      uses: this.usesLeft(a),
      blocked: this.blockedReason(a, now) ?? undefined,
    }));
  }
}
