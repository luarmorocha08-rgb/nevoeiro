/**
 * Caderno de pistas (só no cliente — cada jogador tem o seu):
 * registra automaticamente mortes, ressurreições, prisões, exames, o sino e os lampiões,
 * sempre com a hora da partida e QUEM VOCÊ VIA por perto naquele momento.
 * As marcas de suspeita usam o NOME QUE VOCÊ VÊ (o Metamorfo disfarçado aparece com o
 * nome copiado — a marca não denuncia o disfarce).
 */
import { CONFIG, EF } from '@nevoeiro/shared';
import { net } from '../net/netState';
import { getState } from '../net/store';

export type ClueKind = 'death' | 'revive' | 'arrest' | 'examine' | 'bell' | 'lamp' | 'note';

export interface Clue {
  id: number;
  kind: ClueKind;
  /** segundos desde o início da partida */
  t: number;
  text: string;
  /** quem estava visível por perto */
  near?: string[];
}

export type Mark = 'suspeito' | 'confiavel';

let seq = 1;

/** Hora da partida (mm:ss). */
export function clock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function matchSeconds(): number {
  const start = getState().playingSince;
  return start ? Math.max(0, (Date.now() - start) / 1000) : 0;
}

/** Nomes visíveis até `radius` m do ponto (como você os vê). */
export function namesNear(x: number, z: number, radius: number = CONFIG.feel.clueNearbyRadius): string[] {
  const out: string[] = [];
  for (const e of net.entities.values()) {
    if (e.leavingAt) continue;
    const d = Math.hypot(e.rx - x, e.rz - z);
    // quem está exatamente no ponto é a própria vítima/preso
    if (d > radius || d < 0.3) continue;
    out.push(e.flags & EF.NONAME ? '???' : e.name);
  }
  return out;
}

export function addClue(kind: ClueKind, text: string, near?: string[]) {
  const st = getState();
  if (st.phase !== 'playing' && kind !== 'note') return;
  const clue: Clue = { id: seq++, kind, t: matchSeconds(), text, near: near?.length ? near : undefined };
  st.set({ clues: [...st.clues, clue].slice(-80), cluesUnread: st.notebookOpen ? 0 : st.cluesUnread + 1 });
}

/** Alterna a marca de uma pessoa: nada → suspeito → confiável → nada. */
export function cycleMark(name: string) {
  const st = getState();
  const cur = st.marks[name];
  const next: Mark | undefined = !cur ? 'suspeito' : cur === 'suspeito' ? 'confiavel' : undefined;
  const marks = { ...st.marks };
  if (next) marks[name] = next;
  else delete marks[name];
  st.set({ marks });
}
