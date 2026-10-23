/**
 * Tarefas da vila: cada jogador recebe algumas no começo da partida.
 * - Inocentes: cada tarefa concluída enche a barra da vila. Barra cheia = vitória dos inocentes.
 * - Assassinos: recebem tarefas FALSAS para se misturar. Podem "fazer" (a animação é igual),
 *   mas nada acontece de verdade.
 * - Tarefas VISUAIS (lampião, sino) provam inocência: quem as completa acende o lampião
 *   ou toca o sino para todos verem/ouvirem. O assassino fingindo não acende nada.
 * O servidor valida tudo: estar perto da estação, tempo mínimo e se a tarefa é sua.
 */
import { LAMP_POSITIONS, type LocationId } from './map';
import { resolveCircle } from './physics';

/** Tipo do minijogo no cliente. */
export type TaskKind =
  /** segurar o botão até encher (pausa se soltar) */
  | 'hold'
  /** apertar quando o marcador passar na faixa (3 acertos) */
  | 'timing'
  /** repetir a sequência de símbolos mostrada */
  | 'sequence';

export interface TaskStation {
  id: string;
  /** texto da lista de tarefas */
  name: string;
  /** verbo curto do botão ("Acender", "Tocar") */
  verb: string;
  location: LocationId | 'estrada';
  x: number;
  z: number;
  kind: TaskKind;
  /** duração mínima aceita pelo servidor (s); o minijogo dura pelo menos isso */
  seconds: number;
  /** efeito visível para todos ao concluir (só inocentes) */
  visual?: { lamp: number } | { bell: true };
  /** símbolo do marcador / ícone */
  icon: 'lamp' | 'bell' | 'water' | 'hay' | 'barrel' | 'papers' | 'grave' | 'herb' | 'fire' | 'fence';
}

function lampStation(id: string, lamp: number, name: string, location: TaskStation['location']): Omit<TaskStation, 'x' | 'z'> & { x: number; z: number } {
  const [x, z] = LAMP_POSITIONS[lamp];
  // fica ao lado do poste (o poste tem colisão)
  return { id, name, verb: 'Acender', location, x: x + 0.9, z: z + 0.9, kind: 'hold', seconds: 8, visual: { lamp }, icon: 'lamp' };
}

const RAW: TaskStation[] = [
  lampStation('lampiao-igreja', 4, 'Acender o lampião da estrada da igreja', 'estrada'),
  lampStation('lampiao-cemiterio', 9, 'Acender o lampião do cemitério', 'estrada'),
  lampStation('lampiao-jardim', 11, 'Acender o lampião do jardim', 'estrada'),
  lampStation('lampiao-leste', 12, 'Acender o lampião da estrada leste', 'estrada'),
  { id: 'sino', name: 'Tocar o sino da igreja', verb: 'Tocar', location: 'igreja', x: 0, z: -55.6, kind: 'timing', seconds: 5, visual: { bell: true }, icon: 'bell' },
  { id: 'poco', name: 'Tirar água do poço', verb: 'Puxar', location: 'celeiro', x: 38, z: 52.2, kind: 'hold', seconds: 7, icon: 'water' },
  { id: 'feno', name: 'Empilhar o feno do celeiro', verb: 'Empilhar', location: 'celeiro', x: 47, z: 42, kind: 'sequence', seconds: 5, icon: 'hay' },
  { id: 'barris', name: 'Arrumar os barris da taverna', verb: 'Arrumar', location: 'taverna', x: 35.6, z: -8, kind: 'sequence', seconds: 5, icon: 'barrel' },
  { id: 'arquivos', name: 'Organizar os arquivos da delegacia', verb: 'Organizar', location: 'delegacia', x: -28.5, z: -10, kind: 'sequence', seconds: 5, icon: 'papers' },
  { id: 'tumulo', name: 'Limpar o túmulo do mausoléu', verb: 'Limpar', location: 'cemiterio', x: -41, z: -39.8, kind: 'hold', seconds: 7, icon: 'grave' },
  { id: 'ervas', name: 'Colher ervas na floresta', verb: 'Colher', location: 'floresta', x: -57, z: 31, kind: 'timing', seconds: 5, icon: 'herb' },
  { id: 'lareira', name: 'Acender a lareira do casarão', verb: 'Acender', location: 'casarao', x: -5.6, z: 51, kind: 'hold', seconds: 6, icon: 'fire' },
  { id: 'fonte', name: 'Encher o balde na fonte', verb: 'Encher', location: 'praca', x: 0, z: 3.1, kind: 'hold', seconds: 6, icon: 'water' },
  { id: 'cerca', name: 'Consertar a cerca do cemitério', verb: 'Consertar', location: 'estrada', x: -14.8, z: -54, kind: 'timing', seconds: 5, icon: 'fence' },
];

/** Estações já empurradas para fora de qualquer colisão (sempre alcançáveis). */
export const TASK_STATIONS: readonly TaskStation[] = RAW.map((t) => {
  const p = resolveCircle({ x: t.x, z: t.z }, 0.55);
  return { ...t, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
});

export function taskStation(id: string): TaskStation | undefined {
  return TASK_STATIONS.find((t) => t.id === id);
}

/** Índices dos lampiões que começam APAGADOS (acendem com as tarefas). */
export const TASK_LAMPS: readonly number[] = TASK_STATIONS.flatMap((t) => (t.visual && 'lamp' in t.visual ? [t.visual.lamp] : []));

export function lampLit(mask: number, index: number): boolean {
  if (!TASK_LAMPS.includes(index)) return true;
  return (mask & (1 << index)) !== 0;
}
