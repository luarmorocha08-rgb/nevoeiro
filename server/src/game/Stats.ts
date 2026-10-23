import type { Team } from '@nevoeiro/shared';

/**
 * Estatísticas de balanceamento acumuladas enquanto o servidor está no ar.
 * A cada fim de partida o log mostra o tempo médio e a taxa de vitória de cada time,
 * separando partidas só de bots / com humanos, para ajustar os números em shared/config.ts.
 */
interface Entry {
  winner: Team;
  durationSec: number;
  players: number;
  humans: number;
}

const entries: Entry[] = [];

export function recordMatch(e: Entry): void {
  entries.push(e);
}

export function summary(filter: (e: Entry) => boolean = () => true) {
  const list = entries.filter(filter);
  const n = list.length;
  const avg = n ? list.reduce((s, e) => s + e.durationSec, 0) / n : 0;
  const killers = list.filter((e) => e.winner === 'assassinos').length;
  return {
    partidas: n,
    duracaoMediaSeg: Math.round(avg),
    vitoriasAssassinos: n ? Math.round((killers / n) * 100) : 0,
    vitoriasInocentes: n ? Math.round(((n - killers) / n) * 100) : 0,
  };
}

export function logSummary(): void {
  const all = summary();
  const bots = summary((e) => e.humans <= 1);
  console.log(
    `[balanço] ${all.partidas} partidas · duração média ${fmt(all.duracaoMediaSeg)} · ` +
      `assassinos ${all.vitoriasAssassinos}% x inocentes ${all.vitoriasInocentes}% ` +
      `| contra bots (≤1 humano): ${bots.partidas} partidas, ${fmt(bots.duracaoMediaSeg)}, ` +
      `assassinos ${bots.vitoriasAssassinos}% x inocentes ${bots.vitoriasInocentes}%`,
  );
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}min${String(sec % 60).padStart(2, '0')}s`;
}
