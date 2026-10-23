import {
  CONFIG,
  EF,
  KILLER_LABELS,
  SPAWN_POINTS,
  filterProfanity,
  killsNeeded,
  lineBlocked,
  locationAt,
  randomFreePoint,
  resolveCircle,
  stepMovement,
  WORLD,
  type ActionMsg,
  type AlertMsg,
  type BodySnap,
  type ChatChannel,
  type ChatMsg,
  type EndMsg,
  type EntitySnap,
  type ExamineMsg,
  type FxMsg,
  type InputMsg,
  type RoleMsg,
  type SnapshotMsg,
  type Team,
  type ToastMsg,
  S2C,
} from '@nevoeiro/shared';
import { createRole } from '../roles';
import { Zumbi } from '../roles/Zumbi';
import { BotBrain } from './Bots';
import { EventLog } from './EventLog';
import { assignRoles } from './RoleAssigner';
import { fail, ok, type ActionResult, type Body, type KillInfo, type ServerPlayer } from './types';

/** Como a partida fala com o mundo (implementado pela GameRoom; nos testes, por um mock). */
export interface MatchIO {
  send(p: ServerPlayer, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  /** O jogador mudou de vivo/morto: trocar o canal de voz. */
  onVoiceChange(p: ServerPlayer): void;
  onPhase(phase: 'reveal' | 'playing' | 'ended'): void;
  onEnd(msg: EndMsg): void;
}

export interface Participant {
  sessionId: string | null;
  name: string;
  skin: string;
  isBot: boolean;
}

export interface MatchOptions {
  clock?: () => number;
  rnd?: () => number;
  revealSeconds?: number;
}

let netCounter = 0;
function makeNetId(): string {
  netCounter = (netCounter + 1) % 1e6;
  return Math.random().toString(36).slice(2, 7) + netCounter.toString(36);
}

const DISPLAY_ANON = 'Voz no nevoeiro';
const DISPLAY_UNKNOWN = 'Desconhecido';

export class Match {
  readonly players = new Map<string, ServerPlayer>();
  readonly bodies = new Map<string, Body>();
  readonly log: EventLog;
  readonly startedAt: number;
  phase: 'reveal' | 'playing' | 'ended' = 'reveal';
  readonly revealEndsAt: number;
  readonly totalInnocents: number;
  readonly killersCount: number;
  readonly needed: number;

  private readonly clock: () => number;
  private readonly rnd: () => number;
  private bodySeq = 0;
  private chatSeq = 0;
  private timeline: { t: number; text: string }[] = [];
  private endMsg: EndMsg | null = null;

  constructor(
    private readonly io: MatchIO,
    participants: Participant[],
    readonly code: string,
    opts: MatchOptions = {},
  ) {
    this.clock = opts.clock ?? Date.now;
    this.rnd = opts.rnd ?? Math.random;
    const now = this.clock();
    this.startedAt = now;
    this.revealEndsAt = now + (opts.revealSeconds ?? CONFIG.match.revealSeconds) * 1000;
    this.log = new EventLog(code, now);

    const roles = assignRoles(participants.length, this.rnd);
    const spawns = [...SPAWN_POINTS].sort(() => this.rnd() - 0.5);
    participants.forEach((part, i) => {
      const [sx, sz] = spawns[i % spawns.length];
      const p: ServerPlayer = {
        sessionId: part.sessionId,
        netId: makeNetId(),
        name: part.name,
        skin: part.skin,
        isBot: part.isBot,
        connected: !part.isBot,
        x: sx,
        z: sz,
        yaw: Math.atan2(-sx, -sz),
        moving: 0,
        alive: true,
        arrested: false,
        diedAt: 0,
        frozenUntil: 0,
        role: null as never,
        lastSeq: 0,
        moveBudget: 0,
        lastBudgetAt: now,
        lastMoveAt: now,
        lastChatAt: 0,
      };
      p.role = createRole(roles[i], p, this);
      p.role.init(this.revealEndsAt);
      if (part.isBot) p.bot = new BotBrain(this.rnd);
      this.players.set(p.netId, p);
    });

    const all = [...this.players.values()];
    this.killersCount = all.filter((p) => p.role.isKiller).length;
    this.totalInnocents = all.length - this.killersCount;
    this.needed = killsNeeded(this.totalInnocents);

    this.log.add(
      'match_start',
      {
        players: all.map((p) => ({ netId: p.netId, name: p.name, role: p.role.id, bot: p.isBot })),
        killers: this.killersCount,
        innocents: this.totalInnocents,
        killsNeeded: this.needed,
      },
      now,
    );
    this.note(`Partida iniciada com ${all.length} jogadores (${this.killersCount} assassinos).`);
  }

  now(): number {
    return this.clock();
  }

  // ------------------------------------------------------------------ consultas

  getPlayer(netId: string): ServerPlayer | undefined {
    return this.players.get(netId);
  }
  getBody(id: string): Body | undefined {
    return this.bodies.get(id);
  }
  bySession(sessionId: string): ServerPlayer | undefined {
    for (const p of this.players.values()) if (p.sessionId === sessionId) return p;
    return undefined;
  }
  isSpectator(p: ServerPlayer): boolean {
    return !p.alive;
  }

  /** Validação de alcance para ações com alvo (matar, atirar, algemar, copiar). */
  checkReach(a: ServerPlayer, b: ServerPlayer, range: number, now: number): string | null {
    if (!b.alive) return 'Alvo inválido.';
    if (b.role.isInvisible(now) && !a.role.isKiller) return 'Você não vê ninguém ali.';
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > range + 0.35) return 'Longe demais.';
    if (lineBlocked(a, b)) return 'Sem linha de visão.';
    return null;
  }

  // ------------------------------------------------------------------ entrada

  roleMessage(p: ServerPlayer): RoleMsg {
    const partners = p.role.isKiller
      ? [...this.players.values()]
          .filter((o) => o !== p && o.role.isKiller)
          .map((o) => ({ netId: o.netId, name: o.name, role: o.role.id }))
      : [];
    return {
      netId: p.netId,
      role: p.role.id,
      team: p.role.team,
      partners,
      killers: this.killersCount,
      totalInnocents: this.totalInnocents,
      killsNeeded: this.needed,
    };
  }

  applyInput(p: ServerPlayer, msg: InputMsg): void {
    if (!msg || typeof msg.seq !== 'number' || msg.seq <= p.lastSeq) return;
    p.lastSeq = msg.seq;
    const now = this.now();
    // anti speed-hack: cada jogador tem um "orçamento" de tempo real para gastar em movimento
    p.moveBudget = Math.min(p.moveBudget + (now - p.lastBudgetAt) / 1000, 0.5);
    p.lastBudgetAt = now;
    let dt = Number(msg.dt);
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1, p.moveBudget);
    p.moveBudget -= dt;

    if (!p.alive || this.phase !== 'playing' || p.frozenUntil > now) {
      p.moving = 0;
      return;
    }
    const mx = Number(msg.mx) || 0;
    const mz = Number(msg.mz) || 0;
    const run = !!msg.run;
    const next = stepMovement(p, { mx, mz, run, dt });
    const moved = Math.hypot(next.x - p.x, next.z - p.z) > 1e-4;
    p.x = next.x;
    p.z = next.z;
    if (Math.hypot(mx, mz) > 0.05) {
      p.yaw = Math.atan2(mx, mz);
      p.moving = run ? 2 : 1;
      p.lastMoveAt = now;
    } else if (!moved) {
      p.moving = 0;
    }
  }

  handleAction(p: ServerPlayer, msg: ActionMsg): void {
    if (this.phase !== 'playing') return;
    const res = p.role.tryAction(msg, this.now());
    if (!res.ok && !p.isBot) this.toast(p, res.error, 'error');
  }

  chat(p: ServerPlayer, raw: string, channel: ChatChannel): void {
    const now = this.now();
    if (now - p.lastChatAt < CONFIG.chat.rateLimitMs) return;
    const text = filterProfanity(String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, CONFIG.chat.maxLength));
    if (!text) return;
    p.lastChatAt = now;

    const msg: ChatMsg = {
      id: `c${++this.chatSeq}`,
      fromId: p.netId,
      fromName: p.name,
      text,
      channel,
      at: now,
    };
    let recipients: ServerPlayer[];
    if (channel === 'dead') {
      if (p.alive) return;
      recipients = [...this.players.values()].filter((o) => !o.alive);
    } else if (channel === 'killers') {
      if (!p.role.isKiller) return;
      recipients = [...this.players.values()].filter((o) => o.role.isKiller);
    } else {
      if (!p.alive) return;
      // Metamorfo transformado: aparece com o nome copiado. Fantasma invisível: sem indicador.
      const look = p.role.disguise(now);
      if (p.role.isInvisible(now)) {
        msg.anonymous = true;
        msg.fromId = '';
        msg.fromName = DISPLAY_ANON;
      } else if (look) {
        msg.fromName = look.hideName ? DISPLAY_UNKNOWN : look.name;
      }
      const r = CONFIG.chat.textRadius;
      recipients = [...this.players.values()].filter(
        (o) => o.alive && Math.hypot(o.x - p.x, o.z - p.z) <= r,
      );
    }
    for (const o of recipients) this.io.send(o, S2C.chat, msg);
    this.log.add('chat', { actor: p, channel, text }, now);
  }

  // ------------------------------------------------------------------ eventos de jogo

  killPlayer(victim: ServerPlayer, info: KillInfo): void {
    if (!victim.alive) return;
    const now = this.now();
    const outcome = victim.role.onDeath(now);
    victim.alive = false;
    victim.diedAt = now;
    victim.frozenUntil = 0;
    victim.moving = 0;

    const loc = locationAt(victim.x, victim.z);
    const body: Body = {
      id: `b${++this.bodySeq}`,
      victimNetId: victim.netId,
      victimName: victim.name,
      skin: victim.skin,
      x: victim.x,
      z: victim.z,
      yaw: victim.yaw,
      diedAt: now,
      killerLabel: KILLER_LABELS[info.label] ?? info.label,
      location: loc.name,
    };
    this.bodies.set(body.id, body);

    this.alert({ kind: 'death', text: `${victim.name} foi morto — ${loc.name}`, x: body.x, z: body.z, location: loc.name, at: now });
    this.fx({ kind: 'kill', x: body.x, z: body.z });
    this.log.add(
      'death',
      { target: victim, actor: info.killer, cause: info.cause, label: info.label, location: loc.name, x: round(body.x), z: round(body.z), permanent: outcome.permanent },
      now,
    );
    const by = info.killer ? `${info.killer.name} (${info.killer.role.info.name})` : 'remorso';
    this.note(`${victim.name} (${victim.role.info.name}) morreu — ${loc.name} · ${by}`);

    if (!outcome.permanent) {
      this.toast(victim, `Você caiu... mas a cova não te segura. Voltando em ${CONFIG.roles.zumbi.returnDelay}s.`, 'warn');
    } else if (info.cause === 'misfire') {
      this.toast(victim, 'Você atirou em um inocente. O peso da culpa te derrubou.', 'error');
    } else {
      this.toast(victim, 'Você morreu. Agora é espectador.', 'error');
    }
    this.io.onVoiceChange(victim);
    this.checkWin();
  }

  arrest(target: ServerPlayer, by: ServerPlayer): void {
    if (!target.alive) return;
    const now = this.now();
    target.role.onDeath(now);
    if (target.role instanceof Zumbi) target.role.cancelReturn();
    target.alive = false;
    target.arrested = true;
    target.diedAt = now;
    target.moving = 0;
    const loc = locationAt(target.x, target.z);
    this.alert({ kind: 'arrest', text: `${target.name} foi preso e saiu da partida`, x: target.x, z: target.z, location: loc.name, at: now });
    this.log.add('arrest', { actor: by, target, location: loc.name }, now);
    this.note(`${target.name} (${target.role.info.name}) foi preso por ${by.name} — ${loc.name}`);
    this.toast(target, 'Você foi preso pelo Detetive. Agora é espectador.', 'error');
    this.toast(by, `Era um assassino! ${target.name} foi preso.`, 'success');
    this.io.onVoiceChange(target);
    this.checkWin();
  }

  immobilize(target: ServerPlayer, seconds: number): void {
    target.frozenUntil = this.now() + seconds * 1000;
    target.moving = 0;
  }

  revive(body: Body, angel: ServerPlayer): ActionResult {
    const victim = this.players.get(body.victimNetId);
    if (!victim) return fail('Este corpo não responde.');
    if (victim.arrested) return fail('Este corpo não responde.');
    // ex.: o Zumbi já voltou sozinho — o corpo é só uma casca
    if (victim.alive) return fail('Este corpo está frio... e vazio.');
    const now = this.now();
    victim.alive = true;
    victim.frozenUntil = 0;
    victim.x = body.x;
    victim.z = body.z;
    const pos = resolveCircle(victim, CONFIG.move.radius);
    victim.x = pos.x;
    victim.z = pos.z;
    victim.role.onRevived(now);
    for (const [id, b] of this.bodies) if (b.victimNetId === victim.netId) this.bodies.delete(id);

    const loc = locationAt(victim.x, victim.z);
    this.alert({ kind: 'revive', text: `${victim.name} voltou à vida`, x: victim.x, z: victim.z, location: loc.name, at: now });
    this.fx({ kind: 'revive', x: victim.x, z: victim.z });
    this.log.add('revive', { actor: angel, target: victim, location: loc.name }, now);
    this.note(`${angel.name} (Anjo) ressuscitou ${victim.name} (${victim.role.info.name})`);
    this.toast(victim, 'Um anjo te trouxe de volta. Você mantém o seu papel.', 'success');
    this.io.onVoiceChange(victim);
    this.checkWin();
    return ok();
  }

  teleport(p: ServerPlayer, x: number, z: number): ActionResult {
    const lim = WORLD.walkHalf - 1;
    if (Math.abs(x) > lim + 5 || Math.abs(z) > lim + 5) return fail('Fora do mapa.');
    const pos = resolveCircle({ x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) }, CONFIG.move.radius);
    this.fx({ kind: 'teleport-out', x: p.x, z: p.z });
    const from = { x: round(p.x), z: round(p.z) };
    p.x = pos.x;
    p.z = pos.z;
    this.fx({ kind: 'teleport-in', x: p.x, z: p.z });
    this.log.add('teleport', { actor: p, from, to: { x: round(p.x), z: round(p.z) } });
    return ok();
  }

  /** Retorno do Zumbi: ninguém é avisado. */
  zombieReturn(p: ServerPlayer): void {
    const alive = [...this.players.values()].filter((o) => o.alive);
    const pos = randomFreePoint(this.rnd, alive, 14);
    p.x = pos.x;
    p.z = pos.z;
    p.alive = true;
    p.frozenUntil = 0;
    this.log.add('zombie_return', { actor: p, x: round(p.x), z: round(p.z) });
    this.note(`${p.name} (Zumbi) voltou da cova em segredo`);
    this.toast(p, 'Você voltou da cova. Para os outros, continua morto. Só tem forças para matar UMA vez.', 'warn');
    this.io.onVoiceChange(p);
  }

  sendExamine(p: ServerPlayer, body: Body): void {
    const msg: ExamineMsg = {
      victimName: body.victimName,
      secondsAgo: Math.round((this.now() - body.diedAt) / 1000),
      killer: body.killerLabel,
      location: body.location,
    };
    this.io.send(p, S2C.examine, msg);
  }

  // ------------------------------------------------------------------ saída

  alert(msg: AlertMsg): void {
    this.io.broadcast(S2C.alert, msg);
  }
  fx(msg: FxMsg): void {
    this.io.broadcast(S2C.fx, msg);
  }
  toast(p: ServerPlayer, text: string, level: ToastMsg['level'] = 'info'): void {
    this.io.send(p, S2C.toast, { text, level } satisfies ToastMsg);
  }
  /** Atalho para os papéis registrarem eventos. */
  logEvent(type: string, data: Record<string, unknown>): void {
    this.log.add(type, data, this.now());
  }
  private note(text: string) {
    this.timeline.push({ t: Math.round((this.now() - this.startedAt) / 1000), text });
  }

  // ------------------------------------------------------------------ loop

  tick(dtSec: number): void {
    if (this.phase === 'ended') return;
    const now = this.now();
    if (this.phase === 'reveal' && now >= this.revealEndsAt) {
      this.phase = 'playing';
      this.io.onPhase('playing');
      this.log.add('playing', {}, now);
    }
    for (const p of this.players.values()) {
      p.role.tick(now);
      if (p.bot && this.phase === 'playing') p.bot.update(p, this, dtSec, now);
      if (p.moving && now - p.lastMoveAt > 200) p.moving = 0;
    }
    for (const p of this.players.values()) {
      if (p.isBot || !p.connected) continue;
      this.io.send(p, S2C.snap, this.snapshotFor(p, now));
    }
  }

  snapshotFor(viewer: ServerPlayer, now: number): SnapshotMsg {
    const spectator = !viewer.alive;
    const thermal = viewer.role.hasThermal(now);
    const R = CONFIG.view.interestRadius;
    const VR = CONFIG.voice.radius;
    const e: EntitySnap[] = [];
    const a: SnapshotMsg['a'] = [];
    const th: NonNullable<SnapshotMsg['th']> = [];
    const all = [...this.players.values()];

    for (const p of all) {
      if (p === viewer || !p.alive) continue;
      const d = Math.hypot(p.x - viewer.x, p.z - viewer.z);
      if (thermal) th.push({ id: p.netId, x: round(p.x), z: round(p.z) });
      const invisible = p.role.isInvisible(now);
      const ally = viewer.role.isKiller && p.role.isKiller;
      let visible = spectator || d <= R;
      if (visible && invisible && !spectator && !ally) visible = false;
      if (!visible) {
        if (invisible && d <= VR && !spectator) a.push({ id: p.netId, x: round(p.x), z: round(p.z) });
        continue;
      }
      const look = p.role.disguise(now);
      let f = p.moving === 2 ? EF.RUN : p.moving === 1 ? EF.WALK : 0;
      if (invisible) f |= EF.GHOST;
      if (look?.hideName && !ally && !spectator) f |= EF.NONAME;
      if (p.frozenUntil > now) f |= EF.FROZEN;
      if (ally) f |= EF.ALLY;
      const ent: EntitySnap = {
        id: p.netId,
        n: look && !look.hideName ? look.name : p.name,
        s: look ? look.skin : p.skin,
        x: round(p.x),
        z: round(p.z),
        y: round(p.yaw),
        f,
      };
      if (spectator) ent.r = p.role.id;
      e.push(ent);
    }

    const b: BodySnap[] = [];
    for (const body of this.bodies.values()) {
      if (!spectator && Math.hypot(body.x - viewer.x, body.z - viewer.z) > R) continue;
      b.push({ id: body.id, n: body.victimName, s: body.skin, x: round(body.x), z: round(body.z), y: round(body.yaw) });
    }

    const innocents = all.filter((p) => !p.role.isKiller);
    const deadInnocents = innocents.filter((p) => !p.alive).length;
    const look = viewer.role.disguise(now);

    return {
      t: now,
      you: {
        x: viewer.x,
        z: viewer.z,
        ack: viewer.lastSeq,
        alive: viewer.alive,
        spectator,
        arrested: viewer.arrested,
        frozen: Math.max(0, viewer.frozenUntil - now),
        abilities: viewer.role.abilityStates(now),
        invisible: viewer.role.isInvisible(now),
        disguise: look && !look.hideName ? look.name : null,
        disguiseSkin: look && !look.hideName ? look.skin : null,
        thermal,
        ...viewer.role.extraYou(now),
      },
      e,
      b,
      a,
      th: thermal ? th : undefined,
      c: {
        aliveInnocents: innocents.length - deadInnocents,
        totalInnocents: this.totalInnocents,
        deadInnocents,
        killsNeeded: this.needed,
        killers: this.killersCount,
      },
    };
  }

  // ------------------------------------------------------------------ vitória

  checkWin(): void {
    if (this.phase === 'ended') return;
    const all = [...this.players.values()];
    const innocents = all.filter((p) => !p.role.isKiller);
    const dead = innocents.filter((p) => !p.alive).length;
    if (dead >= this.needed) {
      this.end('assassinos', `Os assassinos mataram ${dead} de ${this.totalInnocents} inocentes.`);
      return;
    }
    const killersLeft = all.filter(
      (p) => p.role.isKiller && (p.alive || (p.role instanceof Zumbi && p.role.isPendingReturn && !p.arrested)),
    );
    if (killersLeft.length === 0) {
      this.end('inocentes', 'Todos os assassinos foram eliminados ou presos.');
    }
  }

  end(winner: Team, reason: string): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const now = this.now();
    this.note(`Fim: vitória dos ${winner}. ${reason}`);
    this.endMsg = {
      winner,
      reason,
      durationSec: Math.round((now - this.startedAt) / 1000),
      timeline: this.timeline,
      players: [...this.players.values()].map((p) => ({
        netId: p.netId,
        name: p.name,
        skin: p.skin,
        role: p.role.id,
        team: p.role.team,
        status: p.arrested ? 'preso' : p.alive ? 'vivo' : 'morto',
        isBot: p.isBot,
      })),
    };
    this.log.add('match_end', { winner, reason }, now);
    this.io.onPhase('ended');
    this.io.onEnd(this.endMsg);
  }

  get result(): EndMsg | null {
    return this.endMsg;
  }

  // ------------------------------------------------------------------ conexão

  /** Jogador não voltou a tempo: um bot assume o personagem (a partida não trava). */
  handOverToBot(p: ServerPlayer): void {
    p.sessionId = null;
    p.connected = false;
    p.isBot = true;
    p.bot = new BotBrain(this.rnd);
    this.log.add('bot_takeover', { actor: p });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
