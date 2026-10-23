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
  hideSpotAt,
  TASK_STATIONS,
  taskStation,
  shuffle,
  type TaskOpMsg,
  type TasksMsg,
  type RoundMsg,
  type ScoreRow,
  type AckMsg,
  type HideSpot,
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
import { logSummary, recordMatch } from './Stats';
import { fail, ok, type ActionResult, type Body, type KillInfo, type ServerPlayer } from './types';

/** Como a partida fala com o mundo (implementado pela GameRoom; nos testes, por um mock). */
export interface MatchIO {
  send(p: ServerPlayer, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  /** O jogador mudou de vivo/morto: trocar o canal de voz. */
  onVoiceChange(p: ServerPlayer): void;
  onPhase(phase: MatchPhase, revealEndsAt: number): void;
  onEnd(msg: EndMsg): void;
}

export type MatchPhase = 'reveal' | 'playing' | 'intermission' | 'ended';

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
  /** não imprimir o resumo de balanço (simulações em lote) */
  quietStats?: boolean;
  /** número de rodadas (padrão CONFIG.rounds.count) */
  rounds?: number;
}

let netCounter = 0;
function makeNetId(): string {
  netCounter = (netCounter + 1) % 1e6;
  return Math.random().toString(36).slice(2, 7) + netCounter.toString(36);
}

const ACK_TEXT: Record<string, string> = {
  kill: 'Vítima abatida.',
  morph: 'Aparência copiada.',
  invisible: 'Você sumiu na névoa.',
  teleport: 'Teleporte concluído.',
  shoot: 'Disparo!',
  examine: 'Corpo examinado.',
  cuff: 'Algemas fechadas.',
  revive: 'Vida devolvida.',
  thermal: 'Óculos térmicos ligados.',
};

const DISPLAY_ANON = 'Voz no nevoeiro';
const DISPLAY_UNKNOWN = 'Desconhecido';

export class Match {
  readonly players = new Map<string, ServerPlayer>();
  readonly bodies = new Map<string, Body>();
  readonly log: EventLog;
  readonly startedAt: number;
  phase: MatchPhase = 'reveal';
  revealEndsAt = 0;
  totalInnocents = 0;
  killersCount = 0;
  needed = 1;
  /** tarefas de inocentes concluídas / necessárias */
  tasksDone = 0;
  tasksNeeded = 1;
  /** rodadas: a cada uma os papéis são sorteados de novo */
  round = 0;
  readonly totalRounds: number;
  roundStartedAt = 0;
  intermissionEndsAt = 0;
  readonly scores = new Map<string, number>();
  readonly roundResults: EndMsg['rounds'] = [];
  lastRound: RoundMsg | null = null;
  private readonly revealSeconds: number;
  /** bits dos lampiões acesos pelas tarefas */
  lampsMask = 0;

  private readonly clock: () => number;
  private readonly rnd: () => number;
  private bodySeq = 0;
  private recentDeaths: { x: number; z: number; at: number }[] = [];
  private chatSeq = 0;
  private timeline: { t: number; text: string }[] = [];
  private endMsg: EndMsg | null = null;
  private readonly quietStats: boolean;

  constructor(
    private readonly io: MatchIO,
    participants: Participant[],
    readonly code: string,
    opts: MatchOptions = {},
  ) {
    this.clock = opts.clock ?? Date.now;
    this.quietStats = !!opts.quietStats;
    this.rnd = opts.rnd ?? Math.random;
    const now = this.clock();
    this.startedAt = now;
    this.revealEndsAt = now + (opts.revealSeconds ?? CONFIG.match.revealSeconds) * 1000;
    this.log = new EventLog(code, now);

    this.totalRounds = Math.max(1, opts.rounds ?? CONFIG.rounds.count);
    this.revealSeconds = opts.revealSeconds ?? CONFIG.match.revealSeconds;

    for (const part of participants) {
      const p: ServerPlayer = {
        sessionId: part.sessionId,
        netId: makeNetId(),
        name: part.name,
        skin: part.skin,
        isBot: part.isBot,
        connected: !part.isBot,
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        stamina: CONFIG.move.stamina.max,
        exhausted: false,
        yaw: 0,
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
        tasks: [],
        taskActive: null,
      };
      this.players.set(p.netId, p);
      this.scores.set(p.netId, 0);
    }
    this.startRound(1);
  }

  // ------------------------------------------------------------------ rodadas

  /**
   * Começa uma rodada: todos voltam vivos para a praça, papéis sorteados de novo
   * (evitando repetir o papel da rodada anterior), tarefas e lampiões zerados.
   */
  private startRound(n: number): void {
    const now = this.now();
    const all = [...this.players.values()];
    const previous = new Map(all.map((p) => [p.netId, p.role?.id]));
    const roles = assignRoles(all.length, this.rnd);
    // troca papéis para que ninguém repita o da rodada anterior (quando possível)
    for (let i = 0; i < roles.length; i++) {
      if (roles[i] !== previous.get(all[i].netId)) continue;
      for (let j = 0; j < roles.length; j++) {
        if (j === i || roles[j] === roles[i]) continue;
        if (roles[j] !== previous.get(all[i].netId) && roles[i] !== previous.get(all[j].netId)) {
          [roles[i], roles[j]] = [roles[j], roles[i]];
          break;
        }
      }
    }
    this.round = n;
    this.roundStartedAt = now;
    this.revealEndsAt = now + this.revealSeconds * 1000;
    this.bodies.clear();
    this.recentDeaths = [];
    this.lampsMask = 0;
    this.tasksDone = 0;
    const spawns = [...SPAWN_POINTS].sort(() => this.rnd() - 0.5);
    all.forEach((p, i) => {
      const wasDead = !p.alive;
      const [sx, sz] = spawns[i % spawns.length];
      p.x = sx;
      p.z = sz;
      p.vx = 0;
      p.vz = 0;
      p.yaw = Math.atan2(-sx, -sz);
      p.moving = 0;
      p.stamina = CONFIG.move.stamina.max;
      p.exhausted = false;
      p.alive = true;
      p.arrested = false;
      p.diedAt = 0;
      p.frozenUntil = 0;
      p.taskActive = null;
      p.role = createRole(roles[i], p, this);
      p.role.init(this.revealEndsAt);
      if (p.isBot) p.bot = new BotBrain(this.rnd);
      if (wasDead && n > 1) this.io.onVoiceChange(p);
    });
    this.killersCount = all.filter((p) => p.role.isKiller).length;
    this.totalInnocents = all.length - this.killersCount;
    this.needed = killsNeeded(this.totalInnocents);
    this.tasksNeeded = this.assignTasks(all);
    this.phase = 'reveal';

    this.log.add(
      n === 1 ? 'match_start' : 'round_start',
      {
        round: n,
        players: all.map((p) => ({ netId: p.netId, name: p.name, role: p.role.id, bot: p.isBot })),
        killers: this.killersCount,
        innocents: this.totalInnocents,
        killsNeeded: this.needed,
      },
      now,
    );
    this.note(`Rodada ${n} de ${this.totalRounds}: ${all.length} jogadores (${this.killersCount} assassinos).`);
    this.io.onPhase('reveal', this.revealEndsAt);
    for (const p of all) {
      if (p.isBot) continue;
      this.io.send(p, S2C.role, this.roleMessage(p));
      this.sendTasks(p);
    }
  }

  private addPoints(p: ServerPlayer | undefined, pts: number): void {
    if (!p) return;
    this.scores.set(p.netId, (this.scores.get(p.netId) ?? 0) + pts);
  }

  scoreRows(): ScoreRow[] {
    return [...this.players.values()]
      .map((p) => ({ netId: p.netId, name: p.name, skin: p.skin, points: this.scores.get(p.netId) ?? 0, isBot: p.isBot }))
      .sort((a, b) => b.points - a.points);
  }

  private playersSummary(): EndMsg['players'] {
    return [...this.players.values()].map((p) => ({
      netId: p.netId,
      name: p.name,
      skin: p.skin,
      role: p.role.id,
      team: p.role.team,
      status: p.arrested ? 'preso' : p.alive ? 'vivo' : 'morto',
      isBot: p.isBot,
    }));
  }

  /** Fim de uma rodada: pontua, revela os papéis e agenda a próxima (ou encerra a partida). */
  private endRound(winner: Team, reason: string): void {
    if (this.phase !== 'playing' && this.phase !== 'reveal') return;
    const now = this.now();
    const P = CONFIG.rounds.points;
    for (const p of this.players.values()) {
      if (p.role.team === winner) this.addPoints(p, P.win);
      if (p.alive) this.addPoints(p, P.survive);
      p.taskActive = null;
    }
    const durationSec = Math.round((now - this.roundStartedAt) / 1000);
    const result = { round: this.round, totalRounds: this.totalRounds, winner, reason, durationSec, players: this.playersSummary() };
    this.roundResults.push(result);
    this.note(`Fim da rodada ${this.round}: vitória dos ${winner}. ${reason}`);
    this.log.add('round_end', { round: this.round, winner, reason }, now);
    const list = [...this.players.values()];
    recordMatch({ winner, durationSec, players: list.length, humans: list.filter((p) => p.sessionId !== null || !p.isBot).length });
    if (this.round >= this.totalRounds) {
      this.lastRound = { ...result, scores: this.scoreRows(), nextAt: 0 };
      this.end();
      return;
    }
    this.phase = 'intermission';
    this.intermissionEndsAt = now + CONFIG.rounds.intermissionSeconds * 1000;
    this.lastRound = { ...result, scores: this.scoreRows(), nextAt: this.intermissionEndsAt };
    this.io.onPhase('intermission', this.revealEndsAt);
    this.io.broadcast(S2C.round, this.lastRound);
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

  /** Esconderijo em que o jogador está (só vivos). */
  hiddenSpot(p: ServerPlayer): HideSpot | null {
    if (!CONFIG.hiding.enabled || !p.alive) return null;
    return hideSpotAt(p.x, p.z);
  }

  /** O alvo escondido pode ser visto por quem? Parceiros e quem está no mesmo esconderijo. */
  private seesHidden(viewer: ServerPlayer, target: ServerPlayer, spot: HideSpot): boolean {
    if (viewer.role.isKiller && target.role.isKiller) return true;
    return this.hiddenSpot(viewer)?.id === spot.id;
  }

  /** Validação de alcance para ações com alvo (matar, atirar, algemar, copiar). Só no servidor. */
  checkReach(a: ServerPlayer, b: ServerPlayer, range: number, now: number): string | null {
    if (!b.alive) return 'Alvo inválido.';
    if (b.role.isInvisible(now) && !a.role.isKiller) return 'Você não vê ninguém ali.';
    const spot = this.hiddenSpot(b);
    if (spot && !this.seesHidden(a, b, spot)) return 'Você não vê ninguém ali.';
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > range + CONFIG.net.lagToleranceMeters) return 'Longe demais.';
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
      round: this.round,
      totalRounds: this.totalRounds,
    };
  }

  // ------------------------------------------------------------------ tarefas

  /** Sorteia as tarefas. Lampiões não se repetem entre inocentes. Devolve quantas a vila precisa. */
  private assignTasks(all: ServerPlayer[]): number {
    const n = Math.min(CONFIG.tasks.perPlayer, TASK_STATIONS.length);
    const takenLamps = new Set<string>();
    let total = 0;
    for (const p of all) {
      const pool = shuffle(TASK_STATIONS.map((t) => t.id), this.rnd);
      const pick: string[] = [];
      for (const id of pool) {
        if (pick.length >= n) break;
        const st = taskStation(id)!;
        const lamp = st.visual && 'lamp' in st.visual;
        if (lamp && !p.role.isKiller) {
          if (takenLamps.has(id)) continue;
          takenLamps.add(id);
        }
        pick.push(id);
      }
      p.tasks = pick.map((id) => ({ id, done: false }));
      if (!p.role.isKiller) total += pick.length;
    }
    return Math.max(1, Math.ceil(total * CONFIG.tasks.villageGoal));
  }

  tasksMessage(p: ServerPlayer): TasksMsg {
    return { list: p.tasks.map((t) => ({ ...t })), fake: p.role.isKiller, active: p.taskActive?.id ?? null };
  }

  sendTasks(p: ServerPlayer): void {
    if (!p.isBot) this.io.send(p, S2C.tasks, this.tasksMessage(p));
  }

  /** Começar / concluir / cancelar uma tarefa. Mesma validação para humanos e bots. */
  taskOp(p: ServerPlayer, msg: TaskOpMsg): ActionResult {
    const res = this.taskOpInner(p, msg);
    if (!p.isBot) {
      if (!res.ok) this.toast(p, res.error, 'error');
      this.sendTasks(p);
    }
    return res;
  }

  private taskOpInner(p: ServerPlayer, msg: TaskOpMsg): ActionResult {
    if (!msg || typeof msg.id !== 'string') return fail('Tarefa inválida.');
    if (msg.op === 'cancel') {
      p.taskActive = null;
      return ok();
    }
    if (this.phase !== 'playing' || !p.alive) return fail('Agora não dá.');
    const st = taskStation(msg.id);
    const mine = p.tasks.find((t) => t.id === msg.id);
    if (!st || !mine) return fail('Essa tarefa não é sua.');
    if (mine.done) return fail('Você já fez essa tarefa.');
    if (Math.hypot(p.x - st.x, p.z - st.z) > CONFIG.tasks.radius + CONFIG.net.lagToleranceMeters) return fail('Chegue mais perto.');
    const now = this.now();
    if (msg.op === 'start') {
      if (p.frozenUntil > now) return fail('Você está algemado.');
      p.taskActive = { id: st.id, startedAt: now };
      this.stop(p);
      return ok();
    }
    if (msg.op !== 'finish') return fail('Tarefa inválida.');
    if (!p.taskActive || p.taskActive.id !== st.id) return fail('Comece a tarefa primeiro.');
    if (now - p.taskActive.startedAt < st.seconds * 1000 * CONFIG.tasks.minTimeFactor) return fail('Rápido demais...');
    p.taskActive = null;
    mine.done = true;
    // assassino fingindo: parece concluída para ele, mas nada acontece no mundo
    if (p.role.isKiller) {
      this.log.add('task_fake', { actor: p, task: st.id }, now);
      return ok();
    }
    this.tasksDone++;
    this.addPoints(p, CONFIG.rounds.points.task);
    this.log.add('task_done', { actor: p, task: st.id, done: this.tasksDone, needed: this.tasksNeeded }, now);
    if (st.visual && 'lamp' in st.visual) {
      this.lampsMask |= 1 << st.visual.lamp;
      this.fx({ kind: 'lamp', x: st.x, z: st.z });
    } else if (st.visual && 'bell' in st.visual) {
      this.fx({ kind: 'bell', x: st.x, z: st.z });
      this.note(`${p.name} tocou o sino da igreja`);
    }
    this.checkWin();
    return ok();
  }

  /** Cancela a tarefa se o jogador se afastou, morreu ou foi algemado. */
  private watchTask(p: ServerPlayer, now: number): void {
    const a = p.taskActive;
    if (!a) return;
    const st = taskStation(a.id);
    const away = !st || Math.hypot(p.x - st.x, p.z - st.z) > CONFIG.tasks.radius + CONFIG.net.lagToleranceMeters + 0.4;
    if (!p.alive || away || p.frozenUntil > now || this.phase !== 'playing') {
      p.taskActive = null;
      this.sendTasks(p);
    }
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
      p.vx = 0;
      p.vz = 0;
      return;
    }
    const mx = Number(msg.mx) || 0;
    const mz = Number(msg.mz) || 0;
    const run = !!msg.run;
    this.integrate(p, mx, mz, run, dt, now);
  }

  /** Aplica um passo de movimento (humanos e bots usam o mesmo caminho). */
  integrate(p: ServerPlayer, mx: number, mz: number, run: boolean, dt: number, now: number): void {
    const next = stepMovement(p, { mx, mz, run, dt });
    p.x = next.x;
    p.z = next.z;
    p.vx = next.vx;
    p.vz = next.vz;
    p.stamina = next.stamina;
    p.exhausted = next.exhausted;
    const speed = Math.hypot(p.vx, p.vz);
    if (Math.hypot(mx, mz) > 0.05) p.yaw = Math.atan2(mx, mz);
    if (speed > 0.15) {
      p.moving = speed > CONFIG.move.walkSpeed + 0.3 ? 2 : 1;
      p.lastMoveAt = now;
    } else {
      p.moving = 0;
    }
  }

  handleAction(p: ServerPlayer, msg: ActionMsg): void {
    if (this.phase !== 'playing') return;
    const res = p.role.tryAction(msg, this.now());
    if (p.isBot) return;
    if (!res.ok) this.toast(p, res.error, 'error');
    else this.io.send(p, S2C.ack, { action: msg.type, text: ACK_TEXT[msg.type] ?? 'Feito.' } satisfies AckMsg);
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
    // pontos: assassino que mata; quem derruba um assassino (tiro do Xerife)
    const P = CONFIG.rounds.points;
    if (info.cause === 'kill' && info.killer && info.killer !== victim) this.addPoints(info.killer, P.kill);
    if (info.cause === 'shot' && info.killer && victim.role.isKiller) this.addPoints(info.killer, P.catchKiller);
    victim.alive = false;
    victim.diedAt = now;
    victim.frozenUntil = 0;
    this.stop(victim);
    this.recentDeaths.push({ x: victim.x, z: victim.z, at: now });
    // bots que viram o crime passam a suspeitar do assassino
    if (info.killer && info.cause === 'kill') {
      for (const o of this.players.values()) {
        if (!o.bot || !o.alive || o === info.killer || o.role.isKiller) continue;
        const d = Math.hypot(o.x - info.killer.x, o.z - info.killer.z);
        if (d <= CONFIG.bots.sightRadius && !lineBlocked(o, info.killer) && !info.killer.role.isInvisible(now)) {
          o.bot.suspect(info.killer.netId, now);
          o.bot.shareSuspicion(o, info.killer, this, now);
        }
      }
    }

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
    if (target.role.isKiller) this.addPoints(by, CONFIG.rounds.points.catchKiller);
    if (target.role instanceof Zumbi) target.role.cancelReturn();
    target.alive = false;
    target.arrested = true;
    target.diedAt = now;
    this.stop(target);
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
    this.stop(target);
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
    this.stop(victim);
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
    this.stop(p);
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
    this.stop(p);
    // névoa verde do retorno: só ele e os parceiros veem
    for (const o of this.players.values()) {
      if (o.role.isKiller) this.io.send(o, S2C.fx, { kind: 'zombie', x: p.x, z: p.z, id: p.netId } satisfies FxMsg);
    }
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
    // brilho da lupa: só o Detetive vê
    this.io.send(p, S2C.fx, { kind: 'examine', x: body.x, z: body.z } satisfies FxMsg);
  }

  /** Para o jogador na hora (morte, prisão, algema, teleporte). */
  stop(p: ServerPlayer): void {
    p.vx = 0;
    p.vz = 0;
    p.moving = 0;
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
      this.io.onPhase('playing', this.revealEndsAt);
      this.log.add('playing', { round: this.round }, now);
    }
    if (this.phase === 'intermission' && now >= this.intermissionEndsAt) {
      this.startRound(this.round + 1);
    }
    for (const p of this.players.values()) {
      p.role.tick(now);
      this.watchTask(p, now);
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
      const spot = this.hiddenSpot(p);
      let visible = spectator || d <= R;
      if (visible && invisible && !spectator && !ally) visible = false;
      if (visible && spot && !spectator && !this.seesHidden(viewer, p, spot)) visible = false;
      if (!visible) {
        // a voz continua saindo do lugar certo, sem mostrar quem é
        if ((invisible || spot) && d <= VR && !spectator) a.push({ id: p.netId, x: round(p.x), z: round(p.z) });
        continue;
      }
      const look = p.role.disguise(now);
      let f = p.moving === 2 ? EF.RUN : p.moving === 1 ? EF.WALK : 0;
      if (invisible) f |= EF.GHOST;
      if (look?.hideName && !ally && !spectator) f |= EF.NONAME;
      if (p.frozenUntil > now) f |= EF.FROZEN;
      if (ally) f |= EF.ALLY;
      if (spot) f |= EF.HIDDEN;
      if (p.taskActive) f |= EF.TASK;
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
      b.push({ id: body.id, n: body.victimName, s: body.skin, x: round(body.x), z: round(body.z), y: round(body.yaw), a: now - body.diedAt });
    }

    const innocents = all.filter((p) => !p.role.isKiller);
    const deadInnocents = innocents.filter((p) => !p.alive).length;
    const look = viewer.role.disguise(now);

    return {
      t: now,
      you: {
        x: viewer.x,
        z: viewer.z,
        vx: viewer.vx,
        vz: viewer.vz,
        stamina: viewer.stamina,
        exhausted: viewer.exhausted,
        hidden: this.hiddenSpot(viewer)?.label ?? null,
        tension: this.tensionFor(viewer, now),
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
        tasksDone: this.tasksDone,
        tasksNeeded: this.tasksNeeded,
        lamps: this.lampsMask,
      },
    };
  }

  /** Tensão da trilha (só inocentes vivos): assassino perto ou morte recente por perto. */
  private tensionFor(viewer: ServerPlayer, now: number): number {
    if (!viewer.alive || viewer.role.isKiller) return 0;
    const T = CONFIG.tension;
    let t = 0;
    for (const p of this.players.values()) {
      if (!p.alive || !p.role.isKiller) continue;
      const d = Math.hypot(p.x - viewer.x, p.z - viewer.z);
      if (d < T.killerRadius) t = Math.max(t, 1 - d / T.killerRadius);
    }
    const limit = now - T.deathBoostSeconds * 1000;
    this.recentDeaths = this.recentDeaths.filter((r) => r.at >= limit);
    for (const r of this.recentDeaths) {
      if (Math.hypot(r.x - viewer.x, r.z - viewer.z) > T.deathBoostRadius) continue;
      t = Math.max(t, 0.6 * (1 - (now - r.at) / (T.deathBoostSeconds * 1000)));
    }
    return Math.round(t * 100) / 100;
  }

  // ------------------------------------------------------------------ vitória

  checkWin(): void {
    if (this.phase !== 'playing') return;
    const all = [...this.players.values()];
    const innocents = all.filter((p) => !p.role.isKiller);
    const dead = innocents.filter((p) => !p.alive).length;
    if (dead >= this.needed) {
      this.endRound('assassinos', `Os assassinos mataram ${dead} de ${this.totalInnocents} inocentes.`);
      return;
    }
    const killersLeft = all.filter(
      (p) => p.role.isKiller && (p.alive || (p.role instanceof Zumbi && p.role.isPendingReturn && !p.arrested)),
    );
    if (killersLeft.length === 0) {
      this.endRound('inocentes', 'Todos os assassinos foram eliminados ou presos.');
      return;
    }
    if (this.tasksDone >= this.tasksNeeded) {
      this.endRound('inocentes', 'A vila terminou as tarefas: os lampiões acesos e o sino espantaram o mal.');
    }
  }

  /** Fim da partida (depois da última rodada). Vence o time com mais rodadas; o placar soma tudo. */
  end(): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const now = this.now();
    const inn = this.roundResults.filter((r) => r.winner === 'inocentes').length;
    const kil = this.roundResults.length - inn;
    const winner: Team = inn === kil ? (this.roundResults[this.roundResults.length - 1]?.winner ?? 'inocentes') : inn > kil ? 'inocentes' : 'assassinos';
    const scores = this.scoreRows();
    const reason =
      this.totalRounds === 1
        ? this.roundResults[0]?.reason ?? ''
        : `Inocentes venceram ${inn} e assassinos ${kil} de ${this.roundResults.length} rodadas. Maior pontuação: ${scores[0]?.name ?? '—'} (${scores[0]?.points ?? 0}).`;
    this.note(`Fim da partida. ${reason}`);
    this.endMsg = {
      winner,
      reason,
      rounds: this.roundResults,
      scores,
      durationSec: Math.round((now - this.startedAt) / 1000),
      timeline: this.timeline,
      players: this.playersSummary(),
    };
    this.log.add('match_end', { winner, reason, scores }, now);
    if (!this.quietStats) logSummary();
    this.io.onPhase('ended', this.revealEndsAt);
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
