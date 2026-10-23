import {
  CONFIG,
  findPath,
  randomFreePoint,
  stepMovement,
  type ActionType,
  type Vec2,
} from '@nevoeiro/shared';
import type { Match } from './Match';
import type { ServerPlayer } from './types';

export const BOT_NAMES = [
  'Bento', 'Clara', 'Davi', 'Elisa', 'Fábio', 'Gema', 'Heitor', 'Iara',
  'Joaquim', 'Lia', 'Matias', 'Nina', 'Otto', 'Pietra', 'Rui', 'Sofia',
];

const LINES = [
  'Alguém ouviu isso?',
  'Não confio em ninguém aqui.',
  'Vi alguém perto da igreja...',
  'Essa neblina não ajuda.',
  'Fiquem juntos!',
  'Eu estava na taverna o tempo todo.',
  'Cadê o xerife quando a gente precisa?',
  'O cemitério me dá arrepios.',
  'Tem alguém me seguindo?',
  'Vou ficar perto da fonte.',
];

/**
 * Bot simples para testar sozinho: anda pelo mapa com A*, conversa de vez em quando
 * e usa as habilidades do papel. Passa pelas MESMAS validações de um jogador humano.
 */
export class BotBrain {
  private path: Vec2[] = [];
  private repathAt = 0;
  private stuckFor = 0;
  private running = false;
  private examined = new Set<string>();

  constructor(private readonly rnd: () => number) {}

  update(p: ServerPlayer, m: Match, dt: number, now: number): void {
    if (!p.alive) {
      this.path = [];
      return;
    }
    if (p.frozenUntil > now) {
      p.moving = 0;
      return;
    }
    this.think(p, m, dt, now);
    this.move(p, dt, now);
  }

  private think(p: ServerPlayer, m: Match, dt: number, now: number) {
    const chance = (perSecond: number) => this.rnd() < perSecond * dt;
    const others = [...m.players.values()].filter((o) => o !== p && o.alive);
    const near = (r: number) => others.filter((o) => Math.hypot(o.x - p.x, o.z - p.z) <= r);
    const tryAct = (type: ActionType, extra: { targetId?: string; point?: Vec2 } = {}) =>
      p.role.tryAction({ type, ...extra }, now);

    if (chance(CONFIG.bots.chatChancePerSecond)) {
      m.chat(p, LINES[Math.floor(this.rnd() * LINES.length)], 'local');
    }

    const role = p.role;
    if (role.isKiller) {
      const killReady = role.cooldownLeft('kill', now) === 0 && !role.blockedReason('kill', now);
      if (killReady) {
        const victims = near(CONFIG.kill.range).filter((o) => !o.role.isKiller);
        if (victims.length) {
          const v = victims[0];
          const witnesses = near(CONFIG.bots.witnessRadius).filter((o) => o !== v && !o.role.isKiller);
          if (witnesses.length === 0 && chance(CONFIG.bots.killChancePerSecond * 3)) {
            tryAct('kill', { targetId: v.netId });
          } else if (chance(CONFIG.bots.killChancePerSecond * 0.25)) {
            tryAct('kill', { targetId: v.netId });
          }
        } else if (now > this.repathAt - 3000) {
          // caça: vai em direção a um inocente próximo
          const prey = near(24).find((o) => !o.role.isKiller);
          if (prey) this.goTo(p, prey, now, 2500);
        }
      }
      if (role.id === 'fantasma' && chance(CONFIG.bots.abilityChancePerSecond)) tryAct('invisible');
      if (role.id === 'metamorfo' && chance(CONFIG.bots.abilityChancePerSecond)) {
        const t = near(CONFIG.roles.metamorfo.range)[0];
        if (t) tryAct('morph', { targetId: t.netId });
      }
      if (role.id === 'teleportador' && chance(CONFIG.bots.abilityChancePerSecond * 0.6)) {
        tryAct('teleport', { point: randomFreePoint(this.rnd) });
        this.path = [];
      }
      return;
    }

    if (role.id === 'rastreador' && chance(CONFIG.bots.abilityChancePerSecond)) tryAct('thermal');
    if (role.id === 'detetive' || role.id === 'anjo') {
      for (const b of m.bodies.values()) {
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (role.id === 'detetive' && d < CONFIG.roles.detetive.examineRange && !this.examined.has(b.id)) {
          this.examined.add(b.id);
          tryAct('examine', { targetId: b.id });
        }
        if (role.id === 'anjo' && d < CONFIG.roles.anjo.range && chance(0.15)) {
          tryAct('revive', { targetId: b.id });
        }
      }
    }
  }

  private goTo(p: ServerPlayer, dest: Vec2, now: number, holdMs = 15000) {
    const path = findPath(p, dest);
    this.path = path ?? [];
    this.repathAt = now + holdMs;
    this.running = this.rnd() < 0.25;
  }

  private move(p: ServerPlayer, dt: number, now: number) {
    if (!this.path.length || now > this.repathAt) {
      // às vezes fica parado um pouco, como gente de verdade
      if (this.rnd() < 0.3 * dt) {
        p.moving = 0;
        return;
      }
      this.goTo(p, randomFreePoint(this.rnd), now, 12000 + this.rnd() * 10000);
      if (!this.path.length) return;
    }
    const target = this.path[0];
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      this.path.shift();
      return;
    }
    const before = { x: p.x, z: p.z };
    const next = stepMovement(p, { mx: dx / d, mz: dz / d, run: this.running, dt });
    p.x = next.x;
    p.z = next.z;
    p.yaw = Math.atan2(dx, dz);
    p.moving = this.running ? 2 : 1;
    p.lastMoveAt = now;
    if (Math.hypot(p.x - before.x, p.z - before.z) < 0.2 * dt) {
      this.stuckFor += dt;
      if (this.stuckFor > 1.5) {
        this.stuckFor = 0;
        this.path = [];
      }
    } else {
      this.stuckFor = 0;
    }
  }
}
