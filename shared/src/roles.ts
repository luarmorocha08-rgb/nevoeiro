import { CONFIG } from './config';

export type Team = 'assassinos' | 'inocentes';

export type KillerRoleId = 'metamorfo' | 'fantasma' | 'zumbi' | 'teleportador';
export type PoweredRoleId = 'xerife' | 'detetive' | 'anjo' | 'rastreador';
export type RoleId = KillerRoleId | PoweredRoleId | 'civil';

export const KILLER_ROLES: KillerRoleId[] = ['metamorfo', 'fantasma', 'zumbi', 'teleportador'];
export const POWERED_ROLES: PoweredRoleId[] = ['xerife', 'detetive', 'anjo', 'rastreador'];

/** Ações que o cliente pode pedir ao servidor. */
export type ActionType =
  | 'kill'
  | 'morph'
  | 'invisible'
  | 'teleport'
  | 'shoot'
  | 'examine'
  | 'cuff'
  | 'revive'
  | 'thermal';

/** Que tipo de alvo a ação precisa. */
export type TargetKind = 'player' | 'body' | 'point' | 'none';

export interface AbilityDef {
  action: ActionType;
  label: string;
  /** Tecla padrão no desktop. */
  key: string;
  target: TargetKind;
  /** Alcance (m) usado pelo cliente para escolher o alvo; o servidor revalida. */
  range?: number;
  icon: string;
  hint: string;
}

export interface RoleInfo {
  id: RoleId;
  name: string;
  team: Team;
  tagline: string;
  description: string;
  passive?: string;
  abilities: AbilityDef[];
  /** cor de destaque do papel (espelha client/src/theme.ts) */
  color: string;
}

const KILL: AbilityDef = {
  action: 'kill',
  label: 'Matar',
  key: 'Q',
  target: 'player',
  range: CONFIG.kill.range,
  icon: '🗡',
  hint: `Alcance curto · recarga ${CONFIG.kill.cooldown}s`,
};

const R = CONFIG.roles;

export const ROLE_INFO: Record<RoleId, RoleInfo> = {
  metamorfo: {
    id: 'metamorfo',
    name: 'Metamorfo',
    team: 'assassinos',
    color: '#B07CFF',
    tagline: 'Use o rosto deles contra eles.',
    description: `Copia a aparência e o nome de outro jogador por ${R.metamorfo.duration}s (recarga ${R.metamorfo.cooldown}s). Se matar transformado, o corpo registra "Metamorfo".`,
    abilities: [
      KILL,
      {
        action: 'morph',
        label: 'Copiar',
        key: 'E',
        target: 'player',
        range: R.metamorfo.range,
        icon: '🎭',
        hint: `${R.metamorfo.duration}s · recarga ${R.metamorfo.cooldown}s`,
      },
    ],
  },
  fantasma: {
    id: 'fantasma',
    name: 'Fantasma',
    team: 'assassinos',
    color: '#C9D6E8',
    tagline: 'Ninguém vê o que a neblina engole.',
    description: `Fica invisível por ${R.fantasma.duration}s (recarga ${R.fantasma.cooldown}s). Não pode matar enquanto invisível. Sua voz continua saindo, mas sem indicador de quem fala.`,
    abilities: [
      KILL,
      {
        action: 'invisible',
        label: 'Sumir',
        key: 'E',
        target: 'none',
        icon: '👻',
        hint: `${R.fantasma.duration}s · recarga ${R.fantasma.cooldown}s`,
      },
    ],
  },
  zumbi: {
    id: 'zumbi',
    name: 'Zumbi',
    team: 'assassinos',
    color: '#7BC74D',
    tagline: 'A cova não te segura.',
    description: `Ao ser eliminado, volta ao jogo após ${R.zumbi.returnDelay}s em um ponto aleatório — os outros não são avisados. Depois de voltar, só pode matar ${R.zumbi.killsAfterReturn} vez; se cair de novo, morre de vez.`,
    passive: 'Retorno da cova',
    abilities: [KILL],
  },
  teleportador: {
    id: 'teleportador',
    name: 'Teleportador',
    team: 'assassinos',
    color: '#3FB6FF',
    tagline: 'Esteja em todo lugar.',
    description: `Escolhe qualquer ponto do mapa pelo minimapa e se teleporta (recarga ${R.teleportador.cooldown}s).`,
    abilities: [
      KILL,
      {
        action: 'teleport',
        label: 'Teleportar',
        key: 'E',
        target: 'point',
        icon: '🌀',
        hint: `Escolha no mapa · recarga ${R.teleportador.cooldown}s`,
      },
    ],
  },
  xerife: {
    id: 'xerife',
    name: 'Xerife',
    team: 'inocentes',
    color: '#E8B04A',
    tagline: 'Uma bala. Escolha bem.',
    description: `Atira em um jogador (alcance médio, 1 tiro a cada ${R.xerife.cooldown}s). Se acertar um assassino, ele morre. Se acertar um inocente, morrem o inocente E o xerife.`,
    abilities: [
      {
        action: 'shoot',
        label: 'Atirar',
        key: 'Q',
        target: 'player',
        range: R.xerife.range,
        icon: '🔫',
        hint: `Alcance ${R.xerife.range}m · recarga ${R.xerife.cooldown}s`,
      },
    ],
  },
  detetive: {
    id: 'detetive',
    name: 'Detetive',
    team: 'inocentes',
    color: '#D9C27A',
    tagline: 'Os mortos também falam.',
    description: `EXAMINAR CORPO revela há quanto tempo a vítima morreu e que tipo de assassino a matou. ALGEMAR prende quem estiver perto: se for assassino, sai da partida; se for inocente, você perde a algema por ${R.detetive.wrongCuffPenalty}s e ele fica imobilizado por ${R.detetive.immobilizeSeconds}s.`,
    abilities: [
      {
        action: 'examine',
        label: 'Examinar',
        key: 'E',
        target: 'body',
        range: R.detetive.examineRange,
        icon: '🔍',
        hint: 'Toque em um corpo',
      },
      {
        action: 'cuff',
        label: 'Algemar',
        key: 'Q',
        target: 'player',
        range: R.detetive.cuffRange,
        icon: '⛓',
        hint: `Erro: algema bloqueada ${R.detetive.wrongCuffPenalty}s`,
      },
    ],
  },
  anjo: {
    id: 'anjo',
    name: 'Anjo',
    team: 'inocentes',
    color: '#FFE7A3',
    tagline: 'Uma vida volta. Só uma.',
    description:
      'Ressuscita UM jogador morto tocando no corpo (uso único na partida). O jogador volta com o mesmo papel.',
    abilities: [
      {
        action: 'revive',
        label: 'Ressuscitar',
        key: 'E',
        target: 'body',
        range: R.anjo.range,
        icon: '✦',
        hint: 'Uso único',
      },
    ],
  },
  rastreador: {
    id: 'rastreador',
    name: 'Rastreador',
    team: 'inocentes',
    color: '#FF6B3D',
    tagline: 'O calor não mente.',
    description: `Ativa os óculos de calor por ${R.rastreador.duration}s e vê a silhueta térmica de todos, através de paredes e da neblina — inclusive o Fantasma invisível (recarga ${R.rastreador.cooldown}s).`,
    abilities: [
      {
        action: 'thermal',
        label: 'Calor',
        key: 'E',
        target: 'none',
        icon: '🌡',
        hint: `${R.rastreador.duration}s · recarga ${R.rastreador.cooldown}s`,
      },
    ],
  },
  civil: {
    id: 'civil',
    name: 'Civil',
    team: 'inocentes',
    color: '#8A93A6',
    tagline: 'Observe. Esconda-se. Sobreviva.',
    description:
      'Inocente sem habilidade. Observe, converse, esconda-se e fuja. Cada civil vivo atrasa a vitória dos assassinos.',
    abilities: [],
  },
};

export function teamOf(role: RoleId): Team {
  return ROLE_INFO[role].team;
}

/** Texto do "tipo de assassino" registrado no corpo e revelado ao Detetive. */
export const KILLER_LABELS: Record<string, string> = {
  metamorfo: 'Metamorfo',
  fantasma: 'Fantasma',
  zumbi: 'Zumbi',
  teleportador: 'Teleportador',
  xerife: 'Tiro do Xerife',
  misfire: 'Remorso — o Xerife atirou em um inocente',
};
