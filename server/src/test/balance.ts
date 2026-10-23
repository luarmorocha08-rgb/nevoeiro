/**
 * Simulação de balanceamento: roda várias partidas só com bots (relógio acelerado)
 * e mostra tempo médio e taxa de vitória por time para cada número de jogadores.
 * Uso: npm run balance -w server  [-- partidasPorTamanho]
 */
process.env.NODE_ENV = 'test';
import { CONFIG } from '@nevoeiro/shared';
import { Match, type MatchIO } from '../game/Match';
import { summary } from '../game/Stats';

const perSize = Number(process.argv[2] ?? 12);
const MAX_MIN = 30;

function run(n: number, seed: number) {
  let t = 1_000_000;
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const io: MatchIO = { send() {}, broadcast() {}, onVoiceChange() {}, onPhase() {}, onEnd() {} };
  const parts = Array.from({ length: n }, (_, i) => ({ sessionId: null, name: `B${i}`, skin: 'capuz-vinho', isBot: true }));
  const m = new Match(io, parts, 'BAL', { clock: () => t, rnd, quietStats: true });
  const step = 0.1;
  for (let x = 0; x < MAX_MIN * 60 && m.phase !== 'ended'; x += step) {
    t += step * 1000;
    m.tick(step);
  }
  return m.result;
}

console.log(`Simulando ${perSize} partidas por tamanho (bots), até ${MAX_MIN} min cada...\n`);
const rows: string[] = [];
let timeouts = 0;
for (let n = CONFIG.players.min; n <= CONFIG.players.max; n++) {
  const before = summary().partidas;
  for (let k = 0; k < perSize; k++) {
    const r = run(n, 7 + n * 1000 + k * 31);
    if (!r) timeouts++;
  }
  const sm = summary((e) => e.players === n);
  rows.push(
    `${String(n).padStart(2)} jogadores | ${String(sm.partidas).padStart(3)} partidas | duração média ${String(Math.floor(sm.duracaoMediaSeg / 60)).padStart(2)}min${String(sm.duracaoMediaSeg % 60).padStart(2, '0')}s | assassinos ${String(sm.vitoriasAssassinos).padStart(3)}% | inocentes ${String(sm.vitoriasInocentes).padStart(3)}%`,
  );
  void before;
}
console.log(rows.join('\n'));
const all = summary();
console.log(`\nTOTAL: ${all.partidas} partidas, duração média ${Math.round(all.duracaoMediaSeg / 60)}min, assassinos ${all.vitoriasAssassinos}% x inocentes ${all.vitoriasInocentes}%  (${timeouts} sem fim em ${MAX_MIN}min)`);
console.log('Ajuste os números em shared/src/config.ts e rode de novo.');
