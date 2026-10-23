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
    /** Folga extra (m) no alcance das ações, compensando o atraso de interpolação do alvo. */
    lagToleranceMeters: 0.9,
    /** Salto entre dois snapshots acima disto (m) = teleporte: sem deslizar. */
    teleportJumpMeters: 4,
    /** Quanto tempo um jogador que saiu do alcance leva para sumir (fade). */
    fadeOutMs: 400,
    fadeInMs: 350,
  },

  move: {
    walkSpeed: 3.2,
    runSpeed: 5.8,
    radius: 0.4,
    height: 1.8,
    /** Aceleração e frenagem (m/s²): resposta rápida, mas sem "patinar". */
    acceleration: 24,
    deceleration: 30,
    stamina: {
      max: 100,
      /** Gasto por segundo correndo. */
      drainPerSecond: 20,
      /** Recuperação por segundo andando/parado. */
      regenPerSecond: 13,
      /** Ao zerar, só volta a correr com esta quantidade. */
      minToRun: 25,
    },
  },

  view: {
    /** Raio em que o servidor envia outros jogadores/corpos (a neblina esconde além disso). */
    interestRadius: 36,
    nameTagDistance: 11,
    /** Abaixo desta distância da câmera o nome some (evita nome gigante colado na tela). */
    nameTagMinDistance: 1.6,
  },

  graphics: {
    /** Densidade base da neblina exponencial (quanto maior, menos se vê). */
    fogDensity: 0.05,
    /** Multiplicador da neblina por área (floresta/cemitério mais densos, praça mais leve). */
    fogZones: {
      praca: 0.65,
      igreja: 0.9,
      taverna: 0.85,
      delegacia: 0.85,
      casarao: 0.95,
      celeiro: 1.0,
      cemiterio: 1.45,
      floresta: 1.7,
      estrada: 1.0,
    } as Record<string, number>,
    /** Multiplicador da neblina com os óculos térmicos. */
    thermalFogFactor: 0.3,
    /** Forma da névoa (shader em client/src/game/fog.ts). */
    fog: {
      /** densidade extra rente ao chão (névoa de altura) */
      heightDensity: 1.7,
      /** quão rápido a névoa afina com a altura (maior = mais rente ao chão) */
      heightFalloff: 0.2,
      /** altura (m) onde a névoa é mais densa */
      baseHeight: 0,
      /** corte do horizonte (tudo some ao longe) */
      distanceDensity: 0.42,
      /** tamanho das manchas (menor = manchas maiores) */
      noiseScale: 0.05,
      /** quanto as manchas variam a densidade (0..1) */
      noiseStrength: 0.6,
      /** vento (m/s em unidades de ruído) */
      windX: 0.32,
      windZ: 0.11,
      /** brilho da névoa na direção da lua */
      moonGlow: 1.1,
    },
    /** Véus de névoa (cortinas verticais suaves ao redor do jogador). */
    veils: {
      opacity: 0.34,
      /** raio (m) onde os véus são espalhados */
      radius: 42,
    },
    /** Pós-processamento. */
    bloomIntensity: 0.75,
    bloomThreshold: 0.72,
    vignetteDarkness: 0.62,
    filmGrain: 0.06,
    /** Objetos além disto (m) não são desenhados. */
    cullDistance: 95,
    /** Construções além disto usam a versão simplificada (LOD). */
    lodDistance: 55,
    /** Qualidade automática: mede o FPS nos primeiros segundos de partida. */
    autoQuality: {
      sampleSeconds: 10,
      warmupSeconds: 2,
      /** FPS médio abaixo disto → baixa; acima de highAbove → alta; senão média. */
      lowBelow: 30,
      highAbove: 52,
    },
  },

  /** Tarefas da vila (estações em /shared/src/tasks.ts). */
  tasks: {
    /** Tarefas sorteadas para cada jogador (assassinos recebem o mesmo número, falsas). */
    perPlayer: 5,
    /** Fração das tarefas dos inocentes que precisa ser concluída para os inocentes vencerem. */
    villageGoal: 0.8,
    /** Distância (m) da estação para poder fazer a tarefa. */
    radius: 2.3,
    /** O servidor aceita a conclusão com esta fração do tempo mínimo (tolerância de rede). */
    minTimeFactor: 0.85,
    /** Sino tocado: a neblina afina por este tempo (s) para todos... */
    bellFogSeconds: 14,
    /** ...multiplicando a densidade por este fator. */
    bellFogFactor: 0.55,
    /** Bots: segundos parados na estação (além do tempo mínimo). */
    botExtraSeconds: 4,
    /** Bots inocentes: chance (por segundo) de ir para a próxima tarefa quando estão vagando. */
    botTaskChancePerSecond: 0.12,
  },

  /** Esconderijos (armários, feno, arbustos altos): ninguém vê quem está dentro, só o Rastreador. */
  hiding: {
    enabled: true,
  },

  /** Trilha tensa: só para inocentes. */
  tension: {
    /** Assassino a menos disto (m) aumenta a tensão. */
    killerRadius: 14,
    /** Uma morte recente deixa a trilha tensa por este tempo (s)... */
    deathBoostSeconds: 25,
    /** ...se tiver acontecido a até esta distância (m). */
    deathBoostRadius: 45,
  },

  audio: {
    /** Distância (m) entre passos andando/correndo. */
    stepLengthWalk: 0.8,
    stepLengthRun: 1.15,
    /** Até onde se ouvem passos de outros jogadores. */
    footstepRadius: 16,
    ambientVolume: 0.5,
    musicVolume: 0.45,
    /** Intervalo (s) entre os sinos da igreja. */
    churchBellEvery: 75,
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
    killChancePerSecond: 0.25,
    /** Bots assassinos evitam matar se houver mais alguém neste raio. */
    witnessRadius: 9,
    /** Até onde um bot inocente enxerga um crime (com linha de visão). */
    sightRadius: 20,
    chatChancePerSecond: 0.012,
    abilityChancePerSecond: 0.03,
    /** Por quanto tempo (s) um bot lembra quem viu matar. */
    suspicionSeconds: 90,
    /** Chance (por segundo) do Xerife-bot atirar "no escuro" em alguém perto. */
    sheriffGuessChancePerSecond: 0.004,
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
