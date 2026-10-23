# NEVOEIRO

Jogo multiplayer online 3D de **dedução social**: inocentes x assassinos com papéis sobrenaturais,
numa vila tomada pela neblina. Roda no navegador (desktop e celular), instala como **PWA** e
empacota como app para **Android/iOS (Capacitor)** e **PC (Electron)**.

> Esta é a **base jogável**: movimentação 3D, câmera, mapa placeholder, todos os papéis com
> habilidades, matar, alertas, chat de texto e voz por proximidade, condições de vitória,
> multiplayer online e bots para testar sozinho.

---

## Sumário
1. [Estrutura do monorepo](#estrutura-do-monorepo)
2. [Rodar localmente](#rodar-localmente)
3. [Jogar e testar sozinho (bots)](#jogar-e-testar-sozinho-bots)
4. [Controles](#controles)
5. [Configurar a voz (LiveKit)](#configurar-a-voz-livekit)
6. [Deploy do servidor](#deploy-do-servidor)
7. [Builds: Web/PWA, Android, iOS e PC](#builds-webpwa-android-ios-e-pc)
8. [Personagens .glb e mapa modular](#personagens-glb-e-mapa-modular)
9. [Regras e papéis](#regras-e-papéis)
10. [Arquitetura e anti-trapaça](#arquitetura-e-anti-trapaça)
11. [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

---

## Estrutura do monorepo

```
nevoeiro/
├── shared/                 # tipos e constantes usados por cliente E servidor
│   └── src/
│       ├── config.ts       # ★ TODOS os números do jogo (cooldowns, alcances, raios, nº de assassinos…)
│       ├── roles.ts        # papéis, times, habilidades, textos
│       ├── map.ts          # mapa modular (blocos, locais, colisões)
│       ├── physics.ts      # movimento/colisão determinísticos (servidor e predição do cliente)
│       ├── protocol.ts     # mensagens de rede
│       ├── skins.ts        # 16 skins (cores da arte de referência)
│       ├── nav.ts          # A* para os bots
│       └── profanity.ts    # filtro de palavrões
├── server/                 # Colyseus (Node.js) — servidor AUTORITATIVO
│   └── src/
│       ├── index.ts        # HTTP + WebSocket
│       ├── rooms/          # GameRoom (lobby, código, reconexão) + schema do lobby
│       ├── game/           # Match (regras), Bots, EventLog, RoleAssigner
│       ├── roles/          # ★ um arquivo por papel, herdando de Role
│       │   ├── Role.ts  KillerRole.ts
│       │   ├── Metamorfo.ts  Fantasma.ts  Zumbi.ts  Teleportador.ts
│       │   └── Xerife.ts  Detetive.ts  Anjo.ts  Rastreador.ts  Civil.ts
│       ├── voice/livekit.ts# tokens de voz (canais vivos/mortos)
│       └── test/simulate.ts# testes das regras (npm test)
├── client/                 # React Three Fiber + drei + Rapier + Vite
│   ├── src/
│   │   ├── game/           # cena 3D: mundo, jogadores, câmera, corpos, efeitos, visão térmica
│   │   ├── net/            # conexão Colyseus, snapshots, interpolação, estado (zustand)
│   │   ├── voice/          # LiveKit + áudio espacial 3D
│   │   ├── input/          # teclado/mouse, toque e gamepad unificados
│   │   ├── ui/             # home, lobby, HUD, minimapa, chat, revelação, fim de partida
│   │   └── quality.ts      # qualidade gráfica + detecção do aparelho
│   ├── assets/characters/  # ★ coloque aqui os .glb finais dos personagens
│   ├── assets/map/         # ★ coloque aqui os .glb finais do cenário
│   ├── public/             # manifest PWA, service worker, ícones
│   ├── electron/main.cjs   # app de PC
│   └── capacitor.config.ts # app Android/iOS
└── docker-compose.yml      # servidor + LiveKit local
```

---

## Rodar localmente

Requisitos: **Node.js 20+** (testado no 22) e npm 10+.

```bash
npm install          # instala os 3 pacotes (workspaces)
npm run dev          # servidor (porta 2567) + cliente (porta 5173) juntos
```

Abra **http://localhost:5173**. Para jogar com outras pessoas na mesma rede, elas abrem
`http://SEU-IP:5173` (o cliente conecta automaticamente em `ws://SEU-IP:2567`).

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run dev:server` / `npm run dev:client` | sobe só um dos lados |
| `npm test` | testes das regras (sorteio, xerife, zumbi, anjo, detetive, fantasma, esconderijos, stamina, partidas completas com bots) |
| `npm run balance -w server` | simula partidas só com bots e mostra duração média e vitórias por time |
| `npm run typecheck` | checagem de tipos dos 3 pacotes |
| `npm run build` | build de produção (servidor em `server/dist`, cliente em `client/dist`) |

Variáveis de ambiente: copie `server/.env.example` → `server/.env` e `client/.env.example` → `client/.env`.

> Voz é opcional: sem LiveKit configurado o jogo funciona normalmente e o HUD mostra "Voz indisponível".

---

## Jogar e testar sozinho (bots)

- **Criar sala**: gera um código de 5 letras. Envie aos amigos; eles usam **Entrar**.
- No lobby: nome, skin (só visual), **teste de microfone**, e o **anfitrião** inicia.
- Partidas de **10 a 16** jogadores. O anfitrião pode adicionar/remover **bots** (+/−, "Completar 10").
- **Jogar offline contra bots (sem servidor)**: roda as mesmas regras do servidor dentro do navegador —
  funciona até no site publicado sem servidor de jogo.
- **Modo de teste (com bots)**: na tela inicial. Você inicia sozinho e o servidor completa com bots
  até 10. Bots andam pelo mapa (A*), conversam no chat e usam habilidades — assassinos-bot matam
  quando ninguém está olhando, o Detetive-bot examina corpos, o Anjo-bot ressuscita, etc.
  (Bots passam pelas mesmas validações do servidor que um humano.)
- Se alguém cair, o servidor espera **45s** pela reconexão (automática). Se não voltar, um bot assume
  o personagem para a partida não travar.

---

## Controles

| Ação | Teclado + mouse | Celular | Gamepad |
|---|---|---|---|
| Andar | WASD / setas | joystick virtual (lado esquerdo) | analógico esquerdo |
| Câmera | mouse (clique na tela trava o cursor; Esc solta) · botão direito arrasta | arrastar no lado direito | analógico direito |
| Correr (gasta stamina) | Shift (Caps Lock alterna) | botão de corrida (ou joystick no máximo) | RT / L3 |
| Habilidade 1 / 2 | Q / E | botões redondos | A / B |
| Chat | Enter (ou T) | botão 💬 | Select |
| Mapa | M | minimapa / 🗺 | Y |
| Mutar microfone | N | botão 🎙 | — |
| Apertar para falar | segure V (ative nas Configurações) | segure 🎙 | segure LB |
| Ver seu papel | Tab | toque no nome do papel | Start |
| Espectador | WASD voa · Espaço/C sobe e desce | joystick | analógicos + direcional |

O alvo das habilidades é escolhido automaticamente: o jogador (ou corpo) mais próximo **na direção
da câmera** dentro do alcance — ele ganha **contorno** e um anel no chão na cor do seu papel
(corpos: verde‑água) e o nome aparece sobre o botão.

**Movimento:** aceleração e frenagem curtas, corrida com **stamina** (barra sob as habilidades; ao
zerar você só volta a correr depois de recuperar um pouco). A câmera em terceira pessoa não atravessa
paredes e é suavizada.

**Esconderijos:** armários (Casarão, Delegacia, Taverna, confessionário da Igreja), montes de feno no
Celeiro e arbustos altos (floresta, cemitério, praça, jardim). Quem está dentro não é visto nem pode ser
alvo — exceto por parceiros assassinos, por quem está no mesmo esconderijo e pelo **Rastreador com os
óculos de calor**. A voz continua saindo do lugar (sem mostrar quem fala).

**Feedback:** toda ação confirmada pelo servidor tem som, vibração no celular e um texto curto; erros
têm som e vibração dupla; quando uma habilidade sai da recarga, o botão pulsa e toca um aviso.

**Tutorial:** na primeira partida aparecem 4 cartões curtos (controles, sua habilidade, chat e
esconderijos). Para ver de novo, apague `nevoeiro.tutorial.v1` do armazenamento do navegador.

Em **Configurações**: qualidade gráfica (baixa/média/alta/automática), sensibilidade, volumes (geral,
trilha e ambiente), inverter eixo, **modo para daltônicos**, vibração, **mostrar FPS** e servidor.

## Gráficos, som e desempenho

| | Baixa | Média | Alta |
|---|---|---|---|
| Resolução (DPR) | 0,6–0,9 | 0,9–1,25 | 1–2 |
| Sombras (só a lua) | — | PCF 1024 | suaves 2048 |
| Pós‑processamento | só o filtro térmico quando ativo | bloom, vinheta, grão de filme, ACES | + SSAO (N8AO) e SMAA |
| Camadas de neblina animada | — | 2 | 3 |
| Vagalumes / poeira / folhas | 10 / — / — | 30 / 60 / 40 | 60 / 140 / 90 |
| Fumaça das chaminés / estrelas | — | sim | sim |
| Luzes quentes pontuais | 3 | 5 | 8 |

- **Automática de verdade:** começa pela heurística do aparelho, **mede o FPS nos primeiros 10 s** de
  partida (após 2 s de aquecimento) e sobe/desce um nível (limiares em `CONFIG.graphics.autoQuality`).
  O resultado fica salvo para as próximas partidas.
- **Neblina por área:** `FogExp2` com densidade que muda suavemente por local (`CONFIG.graphics.fogZones`:
  floresta e cemitério mais densos, praça mais leve) + camadas animadas na cor `#8A97B0`.
- **Iluminação:** luar frio direcional (`#A9C4FF`) com sombras; lampiões e janelas quentes (`#F2A65A`)
  com chama tremulando; um número fixo de luzes pontuais é redistribuído para os lampiões mais próximos
  (sem recompilar shaders).
- **Desempenho:** árvores com instancing em blocos (culling por câmera e por distância), construções
  com LOD (versão simples a partir de `CONFIG.graphics.lodDistance`), partículas e efeitos em pool fixo
  (nada criado por evento), tudo descartado com `dispose` ao desmontar.
- **Efeitos por habilidade:** ondulação roxa (Metamorfo), dissolve por shader ao sumir/voltar
  (Fantasma), implosão/explosão de partículas (Teleportador), névoa verde visível só para o Zumbi e os
  parceiros, clarão + rastro da bala (Xerife), lupa brilhando e algemas animadas (Detetive), feixe
  dourado com partículas subindo (Anjo) e filtro térmico em tela cheia azul→vermelho (Rastreador).
- **Áudio 3D:** passos com timbre por chão (pedra, grama, madeira), vento, corujas na floresta, grilos,
  sinos da igreja e uma trilha em drone que fica mais tensa (com batimentos) quando há um assassino
  perto ou uma morte recente — **só para inocentes**; o servidor calcula a tensão.
- **Cores:** paleta em `client/src/theme.ts` (publicada como variáveis CSS e usada na cena). A cor do
  time de assassinos só aparece para os próprios assassinos. Textos passam no contraste WCAG AA.

## Balanceamento

O servidor imprime, ao fim de cada partida, o tempo médio e a taxa de vitória de cada time (total e
"contra bots"). Para simular várias partidas só com bots e ajustar os números de `shared/src/config.ts`:

```bash
npm run balance -w server            # 12 partidas por tamanho de sala (10 a 16)
npm run balance -w server -- 30      # 30 por tamanho
```

---

## Configurar a voz (LiveKit)

A voz usa **WebRTC via LiveKit** com **áudio espacial 3D**: cada voz passa por um `PannerNode`
(direção) e o volume cai com a distância até zerar em `CONFIG.voice.radius` (18 m).

Cada sala tem dois canais LiveKit separados, e **quem emite o token é o servidor do jogo**
(ele sabe quem está vivo):
- `nevoeiro-<código>-vivos` — jogadores vivos, por proximidade;
- `nevoeiro-<código>-mortos` — espectadores; **os vivos nunca recebem esse áudio**.
Ao morrer, o servidor tira o jogador do canal dos vivos e entrega um token do canal dos mortos
(e o inverso quando o Anjo ressuscita ou o Zumbi volta).

### Opção A — LiveKit local (desenvolvimento)
```bash
# binário (https://github.com/livekit/livekit/releases) ou: brew install livekit
livekit-server --dev            # chaves de dev: devkey / secret, porta 7880
```
`server/.env`:
```
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```
Ou tudo com Docker: `docker compose up --build` (servidor + LiveKit).

> Para testar com outras pessoas na rede local use `livekit-server --dev --bind 0.0.0.0` e
> `LIVEKIT_PUBLIC_URL=ws://SEU-IP:7880`. Navegadores exigem **HTTPS** para liberar o microfone
> fora de `localhost` — em produção use sempre `wss://`.

### Opção B — LiveKit Cloud (mais simples em produção)
1. Crie um projeto em https://cloud.livekit.io (tem plano gratuito).
2. Em *Settings → Keys*, gere uma chave.
3. `server/.env`:
   ```
   LIVEKIT_URL=wss://SEU-PROJETO.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxx
   LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxx
   ```

### Opção C — LiveKit self-hosted (VPS)
Siga https://docs.livekit.io/home/self-hosting/deployment/ (o gerador `livekit/generate`
cria docker-compose com Caddy + TURN). Abra as portas 443, 7881/tcp e 50000–60000/udp
(ou 7882/udp em modo de porta única). Depois aponte `LIVEKIT_URL` para `wss://voz.seudominio.com`.

Verifique: `GET http://localhost:2567/health` deve responder `"voice": true`.

---

## Deploy do servidor

O servidor é um processo Node.js com WebSocket (Colyseus). Ele precisa de **WebSocket com TLS
(`wss://`)** em produção — quase todo provedor faz isso automaticamente.

### Docker (qualquer provedor: Fly.io, Railway, Render, VPS…)
```bash
docker build -f server/Dockerfile -t nevoeiro-server .     # a partir da raiz
docker run -p 2567:2567 --env-file server/.env nevoeiro-server
```

### Fly.io (exemplo)
```bash
fly launch --dockerfile server/Dockerfile --internal-port 2567 --no-deploy
fly secrets set LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
fly deploy
```
Mantenha **1 máquina** (`fly scale count 1`): as salas ficam na memória do processo. Para várias
instâncias, use o `RedisPresence`/`RedisDriver` do Colyseus.

### VPS sem Docker
```bash
npm ci && npm run build -w server
cd server && PORT=2567 node dist/index.cjs        # use pm2/systemd para manter vivo
```
Coloque um proxy com TLS na frente (Caddy é o mais simples):
```
jogo.seudominio.com {
  reverse_proxy localhost:2567
}
```

O cliente web (pasta `client/dist`) é estático: publique em Vercel, Netlify, Cloudflare Pages,
GitHub Pages ou no mesmo servidor. Gere com `VITE_SERVER_URL=wss://jogo.seudominio.com`.

Logs: cada partida grava `server/logs/<sala>-<data>.jsonl` (quem matou quem, quando, onde, com
qual papel; tiros, prisões, ressurreições, teleportes, denúncias). Desative com `EVENT_LOG_TO_FILE=false`.

---

## Builds: Web/PWA, Android, iOS e PC

Todos usam o mesmo build web. **Defina o servidor público antes do build** (apps não têm
"host atual"):

```bash
cd client
echo "VITE_SERVER_URL=wss://jogo.seudominio.com" > .env.production
```

### Web + PWA
```bash
npm run build -w client        # gera client/dist
npm run preview -w client      # testa em http://localhost:4173
```
Publicado em HTTPS, o navegador oferece **"Instalar app"** (manifest + service worker em `client/public`).
No iPhone: Safari → Compartilhar → *Adicionar à Tela de Início*.

### Android (Capacitor)
Requer Android Studio + JDK 17+.
```bash
cd client
npx cap add android            # só na primeira vez (cria client/android)
npm run cap:android            # build + sync + abre o Android Studio
```
Em `android/app/src/main/AndroidManifest.xml` adicione as permissões de voz:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```
No Android Studio: *Build → Generate Signed Bundle/APK*.

### iOS (Capacitor)
Requer macOS + Xcode.
```bash
cd client
npx cap add ios                # só na primeira vez (cria client/ios)
npm run cap:ios                # build + sync + abre o Xcode
```
Em `ios/App/App/Info.plist` adicione:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>O Nevoeiro usa o microfone para o chat de voz por proximidade.</string>
```
No Xcode: escolha o time de assinatura e use *Product → Archive*.

### PC — Windows, macOS, Linux (Electron)
```bash
cd client
npm run electron:dev           # janela Electron apontando para o Vite (rode npm run dev antes)
npm run electron:build         # instalador em client/release (nsis / dmg / AppImage)
```
O instalador é gerado para o sistema em que você roda o comando (para Windows, rode no Windows
ou use CI). Se o `npm install` pulou o download do Electron, rode `npx electron --version` para baixá-lo.

---

## Personagens .glb e mapa modular

### Personagens
Hoje os personagens são **cápsulas coloridas** com as cores das 16 skins da arte de referência.
Para usar os modelos finais, solte os arquivos em **`client/assets/characters/`**:

- `<id-da-skin>.glb` (ex.: `capuz-vinho.glb`) ou `default.glb` para todas;
- animações com nomes `idle`, `walk`/`andar`, `run`/`correr`, `death`/`morrer`, `ability`/`habilidade`;
- 1 unidade = 1 m, pés em y = 0, olhando para +Z.

Eles são detectados no build (`import.meta.glob`) — sem mudar código. Detalhes em
`client/assets/characters/README.md`. **A skin nunca revela o papel.**

### Mapa
A vila (praça central, igreja, taverna, cemitério, floresta, delegacia, celeiro e casarão) é
definida em blocos em **`shared/src/map.ts`**. O servidor usa os blocos para colisão e linha de visão;
o cliente desenha placeholders. Para trocar pelo cenário final, coloque `client/assets/map/<id>.glb`
(ex.: `igreja.glb`) ou `<tipo>.glb` (ex.: `tree.glb`). As construções têm porta e interior (dá
para entrar e se esconder); o telhado some quando você está dentro.

---

## Regras e papéis

Todos os números estão em `shared/src/config.ts`.

**Times**
- 10–11 jogadores = 2 assassinos · 12–14 = 3 · 15–16 = 4 — sorteados entre Metamorfo, Fantasma,
  Zumbi e Teleportador, sem repetir. Assassinos sabem quem são os parceiros (e têm canal de texto secreto).
- Inocentes com poder: Xerife, Detetive, Anjo e Rastreador (1 de cada). O resto é **Civil**.

**Vitória**
- Assassinos: quando **50%** dos inocentes (civis contam) estão mortos.
- Inocentes: quando todos os assassinos foram **eliminados pelo Xerife** ou **presos pelo Detetive**
  (um Zumbi aguardando o retorno ainda conta como vivo).

**Assassinos** (todos têm MATAR — alcance 2,2 m, recarga 25 s)
| Papel | Habilidade |
|---|---|
| Metamorfo | copia aparência **e nome** de outro jogador por 15 s (recarga 40 s); no chat e no balão aparece o nome copiado; o corpo registra "Metamorfo" |
| Fantasma | invisível por 10 s (recarga 35 s); não mata invisível; a voz sai sem indicador de quem fala, e no texto aparece "Voz no nevoeiro" |
| Zumbi | ao morrer, volta após 30 s em ponto aleatório **sem aviso** (para os outros continua morto, anda sem nome visível); depois só mata 1 vez e, se cair de novo, morre de vez; se o Anjo o ressuscitar, volta como assassino normal com o retorno disponível |
| Teleportador | escolhe um ponto no mapa e se teleporta (recarga 30 s) |

**Inocentes**
| Papel | Habilidade |
|---|---|
| Xerife | tiro de alcance médio (16 m, 1 a cada 30 s). Assassino morre; inocente atingido → morrem o inocente **e** o xerife |
| Detetive | EXAMINAR corpo (há quanto tempo morreu + tipo de assassino) · ALGEMAR: assassino é preso e sai; inocente fica imobilizado 10 s e o detetive perde a algema por 60 s |
| Anjo | ressuscita UM morto tocando no corpo (uso único); ele volta com o mesmo papel |
| Rastreador | óculos térmicos por 5 s: vê todos através de paredes e neblina, inclusive o Fantasma (recarga 20 s) |
| Civil | sem habilidade: observa, se esconde, foge |

**Comunicação** (sem reuniões nem votação): voz por proximidade · texto com balão e histórico só
para quem está a 14 m · canal secreto dos assassinos · canal dos mortos · filtro de palavrões ·
silenciar/denunciar (clique no nome no chat).

**Alertas**: toda morte gera "[Nome] foi morto — [local]" para todos + marcador no minimapa por 10 s
(sem revelar assassino nem papel). Ressurreição: "[Nome] voltou à vida". Prisão: "[Nome] foi preso".

---

## Arquitetura e anti-trapaça

- **Servidor autoritativo**: o cliente só envia *intenções* (direção de movimento, "quero usar a
  habilidade X no alvo Y", texto). Alcance, linha de visão, recargas, mortes, papéis e vitória são
  validados em `server/src/game/Match.ts` e nos arquivos de papel.
- **Movimento**: o cliente prevê localmente com a MESMA função do servidor (`shared/physics.ts`) e
  reconcilia com a posição autoritativa (reaplica os inputs não confirmados). O servidor limita o
  tempo de movimento por jogador ("orçamento"), impedindo speed-hack.
- **Informação oculta**: posições não vão no estado público. Cada jogador recebe um *snapshot
  filtrado* a 20 Hz com apenas o que pode ver: ninguém além da neblina (36 m), Fantasma invisível
  omitido (exceto para parceiros e para o Rastreador com calor ativo), papéis só no fim (ou para
  espectadores). Durante a partida os jogadores usam ids opacos, não os ids do lobby.
- **Colisão**: os mesmos retângulos do mapa no servidor (círculo x AABB) e no cliente (Rapier: colisores
  estáticos, corpos cinemáticos dos jogadores e raycast da câmera para não atravessar paredes).
- **Interpolação** dos outros jogadores com 110 ms de atraso para movimento suave.

---

## Limitações conhecidas e próximos passos

- A proximidade da voz é aplicada no cliente (volume/direção). Um cliente modificado poderia ouvir
  vozes distantes do canal dos vivos. Para blindar, dá para usar `updateSubscriptions` do LiveKit no
  servidor conforme as distâncias.
- Voz do Fantasma invisível: a posição de áudio é enviada (sem renderizar) para o som sair do lugar certo.
- O contador "inocentes vivos" é público (pedido no HUD) — isso permite deduzir o time de quem morreu.
- Objetos soltos do cenário não existem ainda; quando adicionados como física do Rapier, serão só visuais.
- Escala horizontal: uma instância do servidor guarda as salas em memória (use Redis do Colyseus para várias).
- Placeholders: personagens em cápsula, cenário em blocos e sons sintetizados — prontos para receber os assets finais.
