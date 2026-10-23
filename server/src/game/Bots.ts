import {
  CONFIG,
  findPath,
  randomFreePoint,
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
  /** assassinos que este bot viu matar (netId → quando) */
  private suspects = new Map<string, number>();

  suspect(netId: string, now: number) {
    this.suspects.set(netId, now);
  }

  /** Como um humano faria: avisa no chat e quem está perto passa a desconfiar. */
  shareSuspicion(self: ServerPlayer, suspect: ServerPlayer, m: Match, now: number) {
    const look = suspect.role.disguise(now);
    const name = look && !look.hideName ? look.name : look?.hideName ? 'alguém sem rosto' : suspect.name;
    m.chat(self, `Vi ${name} matar alguém!`, 'local');
    for (const o of m.players.values()) {
      if (!o.bot || !o.alive || o === suspect || o.role.isKiller) continue;
      if (Math.hypot(o.x - self.x, o.z - self.z) <= CONFIG.chat.textRadius) o.bot.suspect(suspect.netId, now);
    }
  }

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
    this.move(p, m, dt, now);
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
          // bot assassino só mata quando ninguém está olhando
          if (witnesses.length === 0 && chance(CONFIG.bots.killChancePerSecond)) {
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

    // dedução: quem estava colado num corpo fresco vira suspeito (pode ser inocente!)
    for (const b of m.bodies.values()) {
      if (now - b.diedAt > 8000 || Math.hypot(b.x - p.x, b.z - p.z) > 14) continue;
      for (const o of others) {
        if (Math.hypot(o.x - b.x, o.z - b.z) < 3 && !m.hiddenSpot(o) && !o.role.isInvisible(now)) this.suspect(o.netId, now);
      }
    }

    // reação de inocentes a um assassino que viram matar
    const seen = [...this.suspects.entries()]
      .filter(([, at]) => now - at < CONFIG.bots.suspicionSeconds * 1000)
      .map(([id]) => m.getPlayer(id))
      .filter((o): o is ServerPlayer => !!o && o.alive);
    const threat = seen.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (threat) {
      const d = Math.hypot(threat.x - p.x, threat.z - p.z);
      if (role.id === 'xerife' && role.cooldownLeft('shoot', now) === 0) {
        if (d <= CONFIG.roles.xerife.range) tryAct('shoot', { targetId: threat.netId });
        else if (now > this.repathAt - 4000) this.goTo(p, threat, now, 2000);
        return;
      }
      if (role.id === 'detetive' && role.cooldownLeft('cuff', now) === 0) {
        if (d <= CONFIG.roles.detetive.cuffRange) tryAct('cuff', { targetId: threat.netId });
        else if (now > this.repathAt - 4000) this.goTo(p, threat, now, 2000);
        return;
      }
      // os demais fogem para longe do assassino
      if (d < 16 && now > this.repathAt - 6000) {
        const away = { x: p.x + ((p.x - threat.x) / (d || 1)) * 20, z: p.z + ((p.z - threat.z) / (d || 1)) * 20 };
        this.goTo(p, away, now, 4000);
        this.running = true;
      }
    }
    // erro humano: o Xerife às vezes atira em alguém "suspeito" sem ter visto nada
    if (role.id === 'xerife' && role.cooldownLeft('shoot', now) === 0 && chance(CONFIG.bots.sheriffGuessChancePerSecond)) {
      const t = near(CONFIG.roles.xerife.range)[0];
      if (t) tryAct('shoot', { targetId: t.netId });
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

  private move(p: ServerPlayer, m: Match, dt: number, now: number) {
    if (!this.path.length || now > this.repathAt) {
      // às vezes fica parado um pouco, como gente de verdade
      if (this.rnd() < 0.3 * dt) {
        m.stop(p);
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
    m.integrate(p, dx / d, dz / d, this.running, dt, now);
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
