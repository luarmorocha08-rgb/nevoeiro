/**
 * Teste headless das regras (sem rede): cria partidas só com bots, acelera o relógio
 * e verifica papéis, mortes, alertas e condição de vitória. Rode: npm test
 */
process.env.NODE_ENV = 'test';
process.env.EVENT_LOG_TO_FILE = 'false';
import assert from 'node:assert/strict';
import { CONFIG, HIDE_SPOTS, TASK_STATIONS, initialMoveState, killersFor, lampLit, resolveCircle, stepMovement, taskStation, type EndMsg } from '@nevoeiro/shared';
import { Match, type MatchIO } from '../game/Match';
import { assignRoles } from '../game/RoleAssigner';
import type { ServerPlayer } from '../game/types';

// ---- sorteio de papéis
for (let n = CONFIG.players.min; n <= CONFIG.players.max; n++) {
  for (let k = 0; k < 50; k++) {
    const roles = assignRoles(n);
    const killers = roles.filter((r) => ['metamorfo', 'fantasma', 'zumbi', 'teleportador'].includes(r));
    assert.equal(killers.length, killersFor(n), `assassinos para ${n}`);
    assert.equal(new Set(killers).size, killers.length, 'assassinos sem repetir');
    for (const p of ['xerife', 'detetive', 'anjo', 'rastreador']) assert.equal(roles.filter((r) => r === p).length, 1);
  }
}
assert.equal(killersFor(10), 2);
assert.equal(killersFor(11), 2);
assert.equal(killersFor(12), 3);
assert.equal(killersFor(14), 3);
assert.equal(killersFor(15), 4);
assert.equal(killersFor(16), 4);
console.log('✓ sorteio de papéis');

function makeMatch(n: number, seed = 1, rounds = 1) {
  let t = 1_000_000;
  const clock = () => t;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const sent: { to: string; type: string; msg: any }[] = [];
  const broadcasts: { type: string; msg: any }[] = [];
  let end: EndMsg | null = null;
  const io: MatchIO = {
    send: (p, type, msg) => sent.push({ to: p.netId, type, msg }),
    broadcast: (type, msg) => broadcasts.push({ type, msg }),
    onVoiceChange: () => {},
    onPhase: () => {},
    onEnd: (m) => (end = m),
  };
  const parts = Array.from({ length: n }, (_, i) => ({ sessionId: null, name: `P${i}`, skin: 'capuz-vinho', isBot: true }));
  const m = new Match(io, parts, 'TEST', { clock, rnd, quietStats: true, rounds });
  return {
    m,
    sent,
    broadcasts,
    get end() { return end; },
    advance(sec: number, step = 0.05) {
      for (let x = 0; x < sec; x += step) {
        t += step * 1000;
        m.tick(step);
        if (m.phase === 'ended') break;
      }
    },
    set(ms: number) { t += ms; },
  };
}

const byRole = (m: Match, id: string) => [...m.players.values()].find((p) => p.role.id === id)!;
const place = (p: ServerPlayer, x: number, z: number) => { p.x = x; p.z = z; };
const civils = (m: Match) => [...m.players.values()].filter((p) => p.role.id === 'civil');
const killers = (m: Match) => [...m.players.values()].filter((p) => p.role.isKiller);

// ---- Xerife acerta inocente: morrem os dois
{
  const g = makeMatch(10);
  g.advance(CONFIG.match.revealSeconds + CONFIG.match.initialCooldown + 1);
  // para os bots não interferirem
  for (const p of g.m.players.values()) p.bot = undefined;
  const sheriff = byRole(g.m, 'xerife');
  const civ = civils(g.m)[0];
  if (sheriff.alive && civ.alive) {
    place(sheriff, 0, 8); place(civ, 3, 8);
    g.m.handleAction(sheriff, { type: 'shoot', targetId: civ.netId });
    assert.equal(civ.alive, false, 'civil morre');
    assert.equal(sheriff.alive, false, 'xerife morre junto');
    const alerts = g.broadcasts.filter((b) => b.type === 'alert');
    assert.ok(alerts.some((a) => a.msg.text.startsWith(`${civ.name} foi morto`)));
    console.log('✓ xerife + inocente morrem juntos');
  }
}

// ---- Zumbi volta em segredo e só mata uma vez
{
  for (let seed = 1; seed < 80; seed++) {
    const g = makeMatch(12, seed);
    const z = [...g.m.players.values()].find((p) => p.role.id === 'zumbi');
    if (!z) continue;
    g.advance(CONFIG.match.revealSeconds + CONFIG.match.initialCooldown + 1);
    for (const p of g.m.players.values()) p.bot = undefined;
    const sheriff = byRole(g.m, 'xerife');
    place(sheriff, 0, 8); place(z, 4, 8);
    g.m.handleAction(sheriff, { type: 'shoot', targetId: z.netId });
    assert.equal(z.alive, false);
    assert.equal(sheriff.alive, true, 'acertou assassino: xerife vive');
    assert.notEqual(g.m.phase, 'ended', 'zumbi pendente impede vitória');
    const alertsBefore = g.broadcasts.filter((b) => b.type === 'alert').length;
    g.advance(CONFIG.roles.zumbi.returnDelay + 1);
    assert.equal(z.alive, true, 'zumbi voltou');
    assert.equal(g.broadcasts.filter((b) => b.type === 'alert').length, alertsBefore, 'retorno sem alerta');
    const viewer = civils(g.m)[0];
    place(viewer, z.x + 1, z.z);
    const ent = g.m.snapshotFor(viewer, g.m.now()).e.find((e) => e.id === z.netId);
    assert.ok(ent && ent.f & 8, 'zumbi sem nome');
    g.set(30_000);
    const [v1, v2] = civils(g.m);
    place(z, 0, 9); place(v1, 1, 9); place(v2, -1, 9);
    g.m.handleAction(z, { type: 'kill', targetId: v1.netId });
    assert.equal(v1.alive, false, 'primeira morte após retorno');
    g.set(30_000);
    g.m.handleAction(z, { type: 'kill', targetId: v2.netId });
    assert.equal(v2.alive, true, 'não mata a segunda vez');
    // anjo ressuscita v1
    const angel = byRole(g.m, 'anjo');
    const body = [...g.m.bodies.values()].find((b) => b.victimNetId === v1.netId)!;
    place(angel, body.x + 1, body.z);
    g.m.handleAction(angel, { type: 'revive', targetId: body.id });
    assert.equal(v1.alive, true, 'anjo ressuscitou');
    assert.ok(g.broadcasts.some((b) => b.type === 'alert' && b.msg.text === `${v1.name} voltou à vida`));
    console.log('✓ zumbi volta em segredo, só mata uma vez; anjo ressuscita');
    break;
  }
}

// ---- Detetive: algemar inocente imobiliza; algemar assassino prende
{
  const g = makeMatch(10, 3);
  g.advance(CONFIG.match.revealSeconds + CONFIG.match.initialCooldown + 1);
  for (const p of g.m.players.values()) p.bot = undefined;
  const det = byRole(g.m, 'detetive');
  const civ = civils(g.m)[0];
  const k = killers(g.m)[0];
  for (const p of [det, civ, k]) p.alive = true;
  place(det, 0, 9); place(civ, 1, 9);
  g.m.handleAction(det, { type: 'cuff', targetId: civ.netId });
  assert.ok(civ.frozenUntil > g.m.now(), 'inocente imobilizado');
  assert.ok(det.role.cooldownLeft('cuff', g.m.now()) > 59_000, 'algema bloqueada 60s');
  g.set(61_000);
  place(k, 0.5, 10);
  g.m.handleAction(det, { type: 'cuff', targetId: k.netId });
  assert.equal(k.arrested, true, 'assassino preso');
  console.log('✓ detetive algema');
}

// ---- Fantasma invisível some dos snapshots (menos para parceiros e rastreador)
{
  for (let seed = 1; seed < 80; seed++) {
    const g = makeMatch(10, seed);
    const ph = [...g.m.players.values()].find((p) => p.role.id === 'fantasma');
    if (!ph) continue;
    g.advance(CONFIG.match.revealSeconds + CONFIG.match.initialCooldown + 1);
    for (const p of g.m.players.values()) p.bot = undefined;
    const civ = civils(g.m)[0];
    const tracker = byRole(g.m, 'rastreador');
    place(ph, 0, 9); place(civ, 2, 9); place(tracker, 30, 30);
    g.m.handleAction(ph, { type: 'invisible' });
    assert.equal(ph.role.isInvisible(g.m.now()), true);
    const s1 = g.m.snapshotFor(civ, g.m.now());
    assert.ok(!s1.e.some((e) => e.id === ph.netId), 'civil não vê o fantasma');
    assert.ok(s1.a.some((e) => e.id === ph.netId), 'mas ouve (posição de áudio)');
    g.m.handleAction(ph, { type: 'kill', targetId: civ.netId });
    assert.equal(civ.alive, true, 'fantasma não mata invisível');
    g.m.handleAction(tracker, { type: 'thermal' });
    const s2 = g.m.snapshotFor(tracker, g.m.now());
    assert.ok(s2.th?.some((e) => e.id === ph.netId), 'rastreador vê pelo calor');
    console.log('✓ fantasma invisível / rastreador');
    break;
  }
}

// ---- esconderijo: ninguém vê nem mira quem está escondido (exceto parceiro / rastreador)
{
  const g = makeMatch(10, 5);
  g.advance(CONFIG.match.revealSeconds + CONFIG.match.initialCooldown + 1);
  for (const p of g.m.players.values()) { p.bot = undefined; p.alive = true; }
  const k = killers(g.m)[0];
  const civ = civils(g.m)[0];
  const tracker = byRole(g.m, 'rastreador');
  const bush = HIDE_SPOTS.find((h) => h.kind === 'bush')!;
  place(civ, bush.x, bush.z); place(k, bush.x + 1.6, bush.z); place(tracker, bush.x - 6, bush.z);
  const sk = g.m.snapshotFor(k, g.m.now());
  assert.ok(!sk.e.some((e) => e.id === civ.netId), 'assassino não vê quem está no arbusto');
  g.m.handleAction(k, { type: 'kill', targetId: civ.netId });
  assert.equal(civ.alive, true, 'não dá para matar quem está escondido');
  g.m.handleAction(tracker, { type: 'thermal' });
  assert.ok(g.m.snapshotFor(tracker, g.m.now()).th?.some((e) => e.id === civ.netId), 'rastreador vê pelo calor');
  assert.equal(g.m.snapshotFor(civ, g.m.now()).you.hidden, bush.label);
  console.log('✓ esconderijos');
}

// ---- movimento: aceleração, stamina e predição idêntica cliente/servidor
{
  let s = initialMoveState(0, 9);
  s = stepMovement(s, { mx: 1, mz: 0, run: false, dt: 1 / 30 });
  assert.ok(s.vx > 0 && s.vx < CONFIG.move.walkSpeed, 'acelera aos poucos');
  for (let i = 0; i < 30 * 6; i++) s = stepMovement(s, { mx: 1, mz: 0, run: true, dt: 1 / 30 });
  assert.ok(s.exhausted, 'stamina acaba correndo');
  assert.ok(Math.hypot(s.vx, s.vz) <= CONFIG.move.walkSpeed + 0.01, 'exausto anda');
  const a = stepMovement(s, { mx: 0.3, mz: 0.7, run: true, dt: 1 / 30 });
  const b = stepMovement(s, { mx: 0.3, mz: 0.7, run: true, dt: 1 / 30 });
  assert.deepEqual(a, b, 'determinístico');
  console.log('✓ aceleração e stamina');
}

// ---- tarefas da vila
{
  // estações alcançáveis (fora de colisões)
  for (const st of TASK_STATIONS) {
    const r = resolveCircle({ x: st.x, z: st.z }, CONFIG.move.radius);
    assert.ok(Math.hypot(r.x - st.x, r.z - st.z) < 0.05, `estação ${st.id} livre`);
  }
  const g = makeMatch(10, 7);
  g.advance(CONFIG.match.revealSeconds + 1);
  for (const p of g.m.players.values()) p.bot = undefined;
  const all = [...g.m.players.values()];
  for (const p of all) assert.equal(p.tasks.length, CONFIG.tasks.perPlayer, 'tarefas por jogador');
  const innocentTasks = all.filter((p) => !p.role.isKiller).reduce((a, p) => a + p.tasks.length, 0);
  assert.equal(g.m.tasksNeeded, Math.ceil(innocentTasks * CONFIG.tasks.villageGoal));
  // lampiões não se repetem entre inocentes
  const lamps = all.filter((p) => !p.role.isKiller).flatMap((p) => p.tasks.map((t) => t.id)).filter((id) => id.startsWith('lampiao'));
  assert.equal(new Set(lamps).size, lamps.length, 'lampião único');

  const inn = all.find((p) => !p.role.isKiller)!;
  const st = taskStation(inn.tasks[0].id)!;
  const other = TASK_STATIONS.find((t) => !inn.tasks.some((x) => x.id === t.id))!;
  place(inn, st.x + 10, st.z);
  assert.equal(g.m.taskOp(inn, { op: 'start', id: st.id }).ok, false, 'longe demais');
  place(inn, st.x, st.z);
  assert.equal(g.m.taskOp(inn, { op: 'start', id: other.id }).ok, false, 'tarefa de outro');
  assert.equal(g.m.taskOp(inn, { op: 'finish', id: st.id }).ok, false, 'sem começar');
  assert.equal(g.m.taskOp(inn, { op: 'start', id: st.id }).ok, true, 'começa');
  g.set(500);
  assert.equal(g.m.taskOp(inn, { op: 'finish', id: st.id }).ok, false, 'rápido demais');
  g.set(st.seconds * 1000);
  assert.equal(g.m.taskOp(inn, { op: 'finish', id: st.id }).ok, true, 'conclui');
  assert.equal(g.m.tasksDone, 1, 'conta para a vila');
  assert.equal(g.m.taskOp(inn, { op: 'start', id: st.id }).ok, false, 'não repete');

  // afastar-se cancela
  const st2 = taskStation(inn.tasks[1].id)!;
  place(inn, st2.x, st2.z);
  g.m.taskOp(inn, { op: 'start', id: st2.id });
  place(inn, st2.x + 8, st2.z);
  g.advance(0.2);
  assert.equal(inn.taskActive, null, 'afastou: cancelou');

  // assassino finge: não conta e não acende lampião
  const k = killers(g.m)[0];
  k.tasks = [{ id: 'lampiao-igreja', done: false }];
  const ls = taskStation('lampiao-igreja')!;
  place(k, ls.x, ls.z);
  assert.ok(g.m.taskOp(k, { op: 'start', id: ls.id }).ok);
  g.set(ls.seconds * 1000 + 10);
  assert.ok(g.m.taskOp(k, { op: 'finish', id: ls.id }).ok);
  assert.equal(g.m.tasksDone, 1, 'falsa não conta');
  const lampIdx = 'lamp' in ls.visual! ? ls.visual.lamp : -1;
  assert.equal(lampLit(g.m.lampsMask, lampIdx), false, 'assassino não acende');
  // inocente acende
  inn.tasks.push({ id: 'lampiao-igreja', done: false });
  place(inn, ls.x, ls.z);
  g.m.taskOp(inn, { op: 'start', id: ls.id });
  g.set(ls.seconds * 1000 + 10);
  g.m.taskOp(inn, { op: 'finish', id: ls.id });
  assert.equal(lampLit(g.m.lampsMask, lampIdx), true, 'inocente acende');
  assert.ok(g.broadcasts.some((b) => b.type === 'fx' && b.msg.kind === 'lamp'), 'efeito do lampião');

  // barra cheia = vitória dos inocentes
  g.m.tasksDone = g.m.tasksNeeded - 1;
  const last = inn.tasks.find((t) => !t.done)!;
  const lst = taskStation(last.id)!;
  place(inn, lst.x, lst.z);
  g.m.taskOp(inn, { op: 'start', id: lst.id });
  g.set(lst.seconds * 1000 + 10);
  g.m.taskOp(inn, { op: 'finish', id: lst.id });
  assert.equal(g.end?.winner, 'inocentes', 'tarefas completas = inocentes vencem');
  console.log('✓ tarefas (validação, falsas, lampião, vitória)');
}

// ---- rodadas: papéis mudam, todos revivem, pontos acumulam, termina após a última
{
  const g = makeMatch(10, 11, 3);
  g.advance(CONFIG.match.revealSeconds + 1);
  for (const p of g.m.players.values()) p.bot = undefined;
  assert.equal(g.m.round, 1);
  const rolesR1 = new Map([...g.m.players.values()].map((p) => [p.netId, p.role.id]));
  const roleMsgs1 = g.sent.filter((x) => x.type === 'role').length;
  // rodada 1: inocentes vencem prendendo/matando todos os assassinos
  const ks = killers(g.m);
  const det = byRole(g.m, 'detetive');
  // prisão cancela a volta do Zumbi
  for (const k of ks) g.m.arrest(k, det);
  assert.equal(g.m.phase, 'intermission', 'intervalo depois da rodada');
  assert.equal(g.end, null, 'partida ainda não acabou');
  assert.ok(g.broadcasts.some((b) => b.type === 'round' && b.msg.round === 1 && b.msg.winner === 'inocentes'), 'resultado da rodada');
  assert.ok((g.m.scores.get(det.netId) ?? 0) >= CONFIG.rounds.points.win + 2 * CONFIG.rounds.points.catchKiller, 'detetive pontua');
  g.advance(CONFIG.rounds.intermissionSeconds + 0.5);
  assert.equal(g.m.round, 2, 'rodada 2');
  assert.equal(g.m.phase, 'reveal');
  const all = [...g.m.players.values()];
  assert.ok(all.every((p) => p.alive && !p.arrested), 'todos vivos de novo');
  const changed = all.filter((p) => p.role.id !== rolesR1.get(p.netId)).length;
  assert.ok(changed >= all.length - 1, `papéis sorteados de novo (${changed}/${all.length} mudaram)`);
  assert.equal(killers(g.m).length, CONFIG.killersByPlayers[0].killers, 'número de assassinos mantido');
  assert.equal(g.m.bodies.size, 0, 'sem corpos');
  assert.equal(g.m.tasksDone, 0, 'tarefas zeradas');
  void roleMsgs1;
  // rodadas 2 e 3: assassinos vencem
  for (const r of [2, 3]) {
    g.advance(CONFIG.match.revealSeconds + 1);
    for (const p of g.m.players.values()) p.bot = undefined;
    const k = killers(g.m)[0];
    const inn = [...g.m.players.values()].filter((p) => !p.role.isKiller);
    for (let i = 0; i < g.m.needed; i++) g.m.killPlayer(inn[i], { cause: 'kill', killer: k, label: k.role.id });
    if (r === 2) {
      assert.equal(g.m.phase, 'intermission');
      g.advance(CONFIG.rounds.intermissionSeconds + 0.5);
    }
  }
  const fin = g.end as EndMsg | null;
  assert.ok(fin, 'partida termina depois da 3ª rodada');
  assert.equal(fin.rounds.length, 3);
  assert.equal(fin.winner, 'assassinos', 'time com mais rodadas');
  assert.ok(fin.scores[0].points >= fin.scores[fin.scores.length - 1].points, 'placar ordenado');
  console.log(`✓ rodadas (3 rodadas, papéis novos, placar: ${fin.scores[0].name} ${fin.scores[0].points} pts)`);
}

// ---- partida inteira com bots termina com vencedor
{
  let finished = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const g = makeMatch(10 + (seed % 7), seed * 31);
    g.advance(60 * 25, 0.1);
    if (g.end) finished++;
  }
  console.log(`✓ partidas só com bots: ${finished}/6 terminaram em até 25 min simulados`);
  assert.ok(finished >= 3, 'a maioria das partidas de bots deve terminar');
}

console.log('\nTodos os testes de regras passaram.');
