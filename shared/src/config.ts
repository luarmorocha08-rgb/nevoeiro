/**
 * TODOS os números de balanceamento do Nevoeiro ficam aqui.
 * Cliente e servidor importam este arquivo; o servidor é quem valida.
 * Tempos em SEGUNDOS, distâncias em METROS (1 unidade do mundo = 1 m).
 */
export const CONFIG = {
  players: {
    min: 10,
    max: 16,
    /** No modo de teste o host pode iniciar sozinho; o servidor completa com bots até este número. */
    testModeFillTo: 10,
  },

  /** Quantidade de assassinos por faixa de jogadores (o servidor sorteia os papéis sem repetir). */
  killersByPlayers: [
    { min: 1, max: 11, killers: 2 },
    { min: 12, max: 14, killers: 3 },
    { min: 15, max: 16, killers: 4 },
  ],

  /** Assassinos vencem quando esta fração dos inocentes (civis incluídos) estiver morta. */
  killerWinRatio: 0.5,

  match: {
    /** Duração da tela de revelação do papel (jogadores ficam parados). */
    revealSeconds: 8,
    /** Cooldown inicial de todas as habilidades ao começar, para ninguém agir no primeiro segundo. */
    initialCooldown: 12,
    /** Tempo que o servidor espera um jogador reconectar antes de passar o controle para um bot. */
    reconnectSeconds: 45,
  },

  net: {
    /** Ticks por segundo do servidor (simulação + snapshots). */
    tickRate: 20,
    /** Inputs por segundo enviados pelo cliente. */
    inputRate: 30,
    /** Atraso de interpolação dos outros jogadores (ms). */
    interpolationDelayMs: 110,
    /** Acima desta diferença (m) o cliente "teleporta" para a posição do servidor. */
    snapDistance: 2.5,
  },

  move: {
    walkSpeed: 3.2,
    runSpeed: 5.8,
    radius: 0.4,
    height: 1.8,
  },

  view: {
    /** Raio em que o servidor envia outros jogadores/corpos (a neblina esconde além disso). */
    interestRadius: 36,
    fogColor: '#0b1215',
    /** Densidade da neblina exponencial (quanto maior, menos se vê). */
    fogDensity: 0.055,
    nameTagDistance: 11,
  },

  chat: {
    /** Só quem está dentro deste raio lê a mensagem de texto local. */
    textRadius: 14,
    maxLength: 140,
    bubbleSeconds: 6,
    rateLimitMs: 700,
    historySize: 60,
  },

  voice: {
    /** Além deste raio a voz não é ouvida. */
    radius: 18,
    /** Até esta distância a voz é ouvida em volume máximo. */
    refDistance: 1.5,
    rolloff: 1.4,
  },

  alerts: {
    minimapMarkerSeconds: 10,
    toastSeconds: 7,
  },

  /** Ação MATAR — comum a todos os assassinos. */
  kill: {
    range: 2.2,
    cooldown: 25,
  },

  roles: {
    metamorfo: { duration: 15, cooldown: 40, range: 12 },
    fantasma: { duration: 10, cooldown: 35 },
    zumbi: { returnDelay: 30, killsAfterReturn: 1 },
    teleportador: { cooldown: 30 },
    xerife: { range: 16, cooldown: 30 },
    detetive: {
      examineRange: 2.5,
      cuffRange: 2.2,
      cuffCooldown: 6,
      wrongCuffPenalty: 60,
      immobilizeSeconds: 10,
    },
    anjo: { range: 2.2, uses: 1 },
    rastreador: { duration: 5, cooldown: 20 },
  },

  bots: {
    /** Probabilidade (por segundo) de um bot assassino tentar matar se tiver alvo no alcance. */
    killChancePerSecond: 0.35,
    /** Bots assassinos evitam matar se houver mais alguém neste raio. */
    witnessRadius: 9,
    chatChancePerSecond: 0.012,
    abilityChancePerSecond: 0.03,
  },
} as const;

export type GameConfig = typeof CONFIG;

/** Quantos assassinos para N jogadores. */
export function killersFor(playerCount: number): number {
  const row = CONFIG.killersByPlayers.find((r) => playerCount >= r.min && playerCount <= r.max);
  if (row) return row.killers;
  return playerCount > CONFIG.players.max ? 4 : 2;
}

/** Quantas mortes de inocentes os assassinos precisam. */
export function killsNeeded(totalInnocents: number): number {
  return Math.max(1, Math.ceil(totalInnocents * CONFIG.killerWinRatio));
}
