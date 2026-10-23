/**
 * Teste headless das regras (sem rede): cria partidas só com bots, acelera o relógio
 * e verifica papéis, mortes, alertas e condição de vitória. Rode: npm test
 */
process.env.NODE_ENV = 'test';
process.env.EVENT_LOG_TO_FILE = 'false';
import assert from 'node:assert/strict';
import { CONFIG, killersFor, type EndMsg } from '@nevoeiro/shared';
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

function makeMatch(n: number, seed = 1) {
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
  const m = new Match(io, parts, 'TEST', { clock, rnd });
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
