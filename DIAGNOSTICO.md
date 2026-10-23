# Diagnóstico — rodada de correções (gráficos, jogabilidade e cores)

Levantado antes das alterações (commit `542b3e3`). Linhas referem-se a esse commit.

## Bugs e problemas encontrados

### Vazamentos de memória (dispose)
| # | Arquivo:linha | Problema |
|---|---|---|
| 1 | `client/src/game/Effects.tsx:124,137,148-179` | Efeitos criam `Mesh`, geometrias, materiais e `PointLight` a cada evento e só fazem `g.remove(obj)`: nada é descartado (vazamento de GPU a cada tiro/morte/teleporte). |
| 2 | `client/src/game/Effects.tsx:160,174` | Luzes pontuais adicionadas/removidas em tempo real mudam a contagem de luzes da cena e forçam a **recompilação de todos os shaders** (travadinha a cada tiro). |
| 3 | `client/src/game/CharacterModel.tsx:59-70` | Materiais da cápsula criados em `useMemo` e passados por prop: o R3F não os descarta ao desmontar/trocar de skin (Metamorfo troca skin com frequência). |
| 4 | `client/src/game/World.tsx:71-72` | Texturas de canvas (grama/terra) nunca são descartadas. |
| 5 | `client/src/game/World.tsx:160-161` | Materiais de parede/telhado criados por construção, sem `dispose`. |
| 6 | `client/src/game/Effects.tsx:39` | Textura da neblina e geometria de partículas sem `dispose`. |
| 7 | `client/src/game/Players.tsx:228,233,311` | Alocações por frame (`clone()`, `new Ray`, `new Vector3`) → coleta de lixo frequente e micro‑engasgos. |

### Dessincronização / rede
| # | Arquivo:linha | Problema |
|---|---|---|
| 8 | `client/src/net/netState.ts:87` | Jogador que sai do alcance (ou fica invisível) some instantaneamente — "pop" visual. |
| 9 | `client/src/net/netState.ts:167` | Teleporte só é detectado se o salto > 6 m **depois** da interpolação: no primeiro frame o personagem desliza pelo mapa. |
| 10 | `client/src/game/Players.tsx:154` | Correção de predição fixa de 25% por snapshot gera leve tremida quando há perda de pacote. |
| 11 | `server/src/game/Match.ts:175` | Tolerância de alcance de 0,35 m não considera o atraso de interpolação (110 ms): matar/algemar alvos em movimento falha com "Longe demais". |
| 12 | `client/src/ui/Hud.tsx:100` | Alertas comparam `a.at` (relógio do servidor) com `Date.now()` do cliente: com relógios diferentes o alerta some na hora ou nunca some. |
| 13 | `client/src/net/connection.ts` (`attach`) | Ao reconectar, a tela volta por um instante para o **lobby** e remonta a cena 3D inteira (perde o contexto WebGL). |
| 14 | `client/src/game/Players.tsx:128` | `dt` limitado a 0,1 s descarta tempo de input em quedas de FPS (o jogador anda menos que o esperado). |

### Validação no servidor (auditoria)
Matar, atirar, algemar, examinar, ressuscitar, teleportar, copiar e todos os cooldowns já eram validados só no servidor (`server/src/roles/*`, `Match.checkReach`). O cliente apenas escolhe o alvo. **Nenhuma falha encontrada**; mantido e coberto pelos testes.

### Interface / jogabilidade
| # | Arquivo:linha | Problema |
|---|---|---|
| 15 | `client/src/game/Players.tsx:63,259` | Nome sobre a cabeça (`Html distanceFactor`) fica gigante quando o jogador está colado na câmera. |
| 16 | `client/src/ui/Chat.tsx:36` | `useEffect` depende de um array recriado a cada render (roda sempre). |
| 17 | `client/src/game/Effects.tsx:79` | Visão térmica sobrescreve a densidade da neblina todo frame (conflita com neblina por área). |
| 18 | `client/src/game/GameCanvas.tsx:53` | Sombras `soft` (PCSS) em média qualidade custam caro; deveriam ficar só na alta. |
| 19 | `shared/src/roles.ts` | Cores dos papéis/times espalhadas e fora da paleta; sem ícones próprios por papel; nenhum modo para daltônicos. |
| 20 | — | Sem feedback de sucesso das ações (só erros), sem som de "habilidade pronta", sem vibração no celular. |
| 21 | — | Movimento sem aceleração/desaceleração; corrida infinita (sem stamina). |
| 22 | — | Qualidade "automática" só por heurística (não mede FPS real). |
| 23 | `shared/src/map.ts:142` | A parede interna do Casarão começava exatamente na porta e a dividia em duas frestas: os bots nunca entravam no Casarão (encontrado pelo teste de navegação). |
| 24 | `client/src/net/connection.ts` (`reconnectLoop`) | As tentativas de reconexão não tinham tempo limite: sem rede, uma tentativa podia ficar pendurada para sempre. |
| 25 | `client/src/game/CharacterModel.tsx` (modelo .glb) | O clone do .glb compartilhava os materiais: deixar um jogador transparente (Fantasma) deixaria todos com aquele modelo transparentes. |

## Avisos de console / TypeScript
- TypeScript: 0 erros, 0 avisos (`npm run typecheck`).
- Console: apenas o aviso do `@dimforge/rapier3d-compat` ("using deprecated parameters for the initialization function"), que vem da biblioteca, não do jogo.

## FPS antes (renderização por software — SwiftShader, sem GPU, 1280×720)
| Qualidade | FPS |
|---|---|
| Baixa | 12,0 |
| Média | 4,7 |
| Alta | 3,0 |

---

# Correções aplicadas

## 1. Correções gerais
- **Vazamentos:** efeitos agora usam um *pool* fixo de partículas, malhas e 2 luzes que nunca entram/saem
  da cena (#1, #2); materiais de personagem, texturas do chão, materiais de construções, geometrias e
  texturas da neblina são descartados com `dispose` ao desmontar (#3–#6); geometrias dos personagens
  são compartilhadas; câmera e raycast sem alocação por frame (#7); materiais do .glb clonados por
  jogador e descartados (#25).
- **Servidor autoritativo:** auditado — matar, atirar, algemar, examinar, ressuscitar, copiar,
  teleportar e cooldowns continuam validados só no servidor. Novas regras (esconderijo, stamina,
  aceleração) também rodam no servidor; o cliente só prevê com a mesma função determinística.
- **Dessincronização:** jogadores aparecem/somem com dissolve suave (#8); teleporte detectado entre
  snapshots, sem deslizar (#9); correção de predição proporcional ao erro (#10); folga de alcance de
  `CONFIG.net.lagToleranceMeters` no servidor (#11); alertas usam o relógio do servidor (#12);
  reconectar não volta mais ao lobby nem remonta a cena (#13, verificado em teste: a tela fica em
  "game" durante toda a queda); acumulador de input sem perder tempo em quedas de FPS (#14).
- **Reconexão / saída / fim:** teste de ponta a ponta com o servidor real —
  queda do WebSocket → "reconectando" → volta à mesma partida com o mesmo personagem; saída voluntária
  no meio da partida (novo botão em Configurações) → um bot assume na hora; fim de partida com câmera
  girando sobre a vila. Tentativas de reconexão com tempo limite (#24).
- Bug do Casarão corrigido (#23).

## 2. Gráficos
- Luar frio direcional (`#A9C4FF`) com sombra; luzes quentes (`#F2A65A`) redistribuídas para os
  lampiões/janelas mais próximos; sombras só na lua (suaves só na alta).
- Neblina por área (FogExp2 com densidade por local) + camadas animadas em shader (`#8A97B0`).
- Pós-processamento: bloom, vinheta, grão, ACES (média/alta), SSAO N8AO + SMAA (alta).
- Ambiente vivo: vagalumes, poeira, folhas caindo na floresta/cemitério, fumaça das chaminés,
  chamas tremulando, céu com lua e estrelas.
- Efeitos por habilidade (todos os 8 papéis) — ver README.
- Morte: corpo tomba com animação e uma poça discreta cresce no local.
- LOD nas construções, árvores com instancing em blocos com culling por câmera e distância.
- Três níveis reais + automática por FPS medido nos primeiros 10 s.

## 3. Jogabilidade
- Aceleração/frenagem, corrida com stamina (servidor + predição), câmera com colisão e suavização.
- Contorno no alvo (jogador ou corpo) de qualquer ação.
- Feedback de toda ação (som, vibração, texto); anel radial + contagem + som quando a habilidade volta.
- Áudio 3D: passos por chão, ambiente por área, trilha tensa só para inocentes (calculada no servidor).
- Mobile: joystick dinâmico, botões ≥ 48 px, layout sem cobrir minimapa nem chat.
- Esconderijos (armários, feno, arbustos), vistos só pelo Rastreador com calor.
- Balanceamento: log de tempo médio e vitórias por time a cada fim de partida + `npm run balance`.
- Tutorial na primeira partida.

## 4–5. Cores, identidade e interface
- Paleta em `client/src/theme.ts` (tokens publicados como variáveis CSS e usados na cena 3D).
- Cor do time de assassinos só aparece para assassinos; cada papel tem cor e **ícone SVG próprio**.
- HUD em vidro fosco com cantos arredondados; carta de revelação que vira; fundo dos menus com a vila
  em neblina e câmera girando; fim de partida sobre a vila girando.
- Contraste WCAG AA; **modo para daltônicos** (formas, padrões e rótulos além da cor).

# Balanceamento contra bots (`npm run balance -w server -- 6`)
Com os números atuais, os bots assassinos vencem ~98% das partidas (duração média ~6 min). Os bots
inocentes não deduzem como humanos, então o número superestima os assassinos, mas indica que vale
testar: `kill.cooldown` 25 → 35 s, `killerWinRatio` 0,5 → 0,6, ou `roles.xerife.cooldown` 30 → 20 s.

# FPS antes × depois
Medido no mesmo ambiente (Chromium com renderização **por software / SwiftShader, sem GPU**,
1280×720, partida offline com 10 jogadores), mediana de 3 execuções intercaladas:

| Qualidade | Antes | Depois | Observação |
|---|---|---|---|
| Baixa | 6,3 | 11,2 | sem pós-processamento nem camadas de neblina; shader de dissolve só calcula quando ativo |
| Média | 4,5 | 2,7 | bloom + vinheta + grão + ACES e 2 camadas de neblina |
| Alta | 2,4 | 1,2 | + SSAO (N8AO) + SMAA + 3 camadas de neblina |

Em renderização por software cada passada de tela cheia custa caro; numa GPU real essas passadas
custam poucos milissegundos. A qualidade automática mede o FPS real nos primeiros 10 s e desce de
nível se ficar abaixo de `CONFIG.graphics.autoQuality.lowBelow` (30 FPS).
