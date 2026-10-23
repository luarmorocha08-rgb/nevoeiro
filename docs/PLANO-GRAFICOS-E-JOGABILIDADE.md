# Nevoeiro — plano de gráficos, atmosfera e jogabilidade

**Stack:** Three.js (r180) + React Three Fiber, `postprocessing`, Web Audio e LiveKit.
É a escolha certa para este jogo. Babylon.js teria a mesma capacidade, mas trocar agora custaria
reescrever o cliente sem ganho real. O que limita um jogo de navegador é a quantidade de pixels
desenhados e de chamadas de desenho, não a engine.

**Como ler a coluna "Estado":**
- ✅ **feito** — já está no jogo (o arquivo vem indicado);
- 🟡 **proposta** — ainda não foi implementado.

---

## 1. Gráficos 3D e atmosfera de suspense

### 1.1 Névoa "volumétrica" barata

Não use *raymarching* de volume de verdade no navegador. São dezenas de amostras por pixel, e isso
inviabiliza celulares. O efeito de volume vem de três camadas baratas que se somam:

| Camada | Como funciona | Custo | Estado |
|---|---|---|---|
| **Névoa de altura analítica** | Substitui o `fog_fragment` do three. A densidade cai com a altura e a integral ao longo do raio é feita numa fórmula fechada (1 `exp`). Fica densa rente ao chão; telhados e copas aparecem acima dela. | ~1 `exp` por pixel | ✅ `client/src/game/fog.ts` |
| **Manchas que andam com o vento** | Ruído 2D no **espaço do mundo** (não da tela) — 1 amostra no ponto e 1 a meio caminho do olho. Parece volume e nada "gruda" na câmera. | 1–2 ruídos por pixel (1 na qualidade baixa) | ✅ `fog.ts` |
| **Véus** | Cortinas verticais com textura de ruído, em uma única malha instanciada, que viram para a câmera só no eixo Y. Somem perto da câmera (sem "parede" na cara) e ao longe. | 1 chamada de desenho | ✅ `Atmosphere.tsx` |
| **Luz espalhada na névoa** | Halos (sprites aditivos) e cones de luz nos lampiões e janelas, e cor da névoa mais clara na direção da lua. | poucos pixels | ✅ `World.tsx` |
| Céu que combina com a névoa | O horizonte do domo usa a mesma cor e a mesma conta da névoa: não há emenda. | 1 malha | ✅ `Atmosphere.tsx` |
| *Raios de luz (god rays)* | Só na qualidade alta, com `GodRays` do `postprocessing` em meia resolução, mirando a lua. | alto | 🟡 opcional |

**Regras de jogo para a névoa:**
- A névoa precisa limitar **a mesma distância que o servidor**. O servidor só envia quem está a até
  `CONFIG.view.interestRadius` (36 m) e a névoa esconde a partir de ~20–25 m. Assim, quem fica fora
  da visão não é só "invisível": nem chega ao cliente, e trapacear tirando a névoa não adianta.
- A densidade varia por área (floresta e cemitério mais densos, praça mais leve), afina dentro de casa
  e quando o sino toca. Isso faz a névoa virar parte da estratégia.

Trecho principal (`fog.ts`), que a cena aplica em **todos** os materiais:

```glsl
// névoa de altura integrada ao longo do raio câmera → pixel
float fogB  = HEIGHT_FALLOFF;                       // quão rápido afina com a altura
float fogH  = exp(-fogB * camH) * (abs(ry) > 0.02 ? (1.0 - exp(-fogB * ry)) / (fogB * ry) : 1.0);
float dens  = fogDensity * (1.0 + NOISE * (nvNoise(worldPos.xz * SCALE + wind) - 0.5) * 2.0);
float fogGround = 1.0 - exp(-dens * HEIGHT_DENSITY * dist * fogH);
float fogFar    = 1.0 - exp(-pow(fogDensity * DIST_DENSITY * dist, 1.6));   // horizonte
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogTint, clamp(max(fogGround, fogFar), 0.0, 1.0));
```

```ts
// instalação: troca os trechos de shader do three uma vez, antes de compilar materiais
THREE.ShaderChunk.fog_pars_vertex = PARS_VERTEX;   // varying vFogWorld
THREE.ShaderChunk.fog_vertex = VERTEX;             // posição no mundo a partir de mvPosition
THREE.ShaderChunk.fog_fragment = FRAGMENT;
// a cena usa <fog args={[cor, tempo, densidade]} /> como "transporte" dos uniforms
```

### 1.2 Iluminação de mistério sem esconder o que importa

**Hierarquia de luz**

| Elemento | Estado |
|---|---|
| **Lua:** uma luz direcional fria (`#A9C4FF`), baixa no céu (sombras longas), vindo da lua visível. Única luz com sombra, numa área que acompanha o jogador. | ✅ |
| **Pontos quentes baixos:** lampiões e janelas (`#F2A65A`). Poucas luzes pontuais fixas (3/5/8 por qualidade) são reposicionadas nos lampiões acesos mais próximos — a contagem de luzes nunca muda, então o shader não recompila. | ✅ |
| **Lanterna pessoal:** luz quente fraca, de alcance curto (7,5 m), na mão de cada jogador. Você vê o chão perto e o resto é névoa. | ✅ `Players.tsx` → `Lantern` |
| **Lampiões das tarefas** começam apagados. Acendê-los muda a iluminação do mapa (estratégia + prova de inocência). | ✅ |

**Contraste e cor**
- Fundo frio e escuro (azul-noite) e luz quente só onde há gente.
- O olho vai para onde há calor.
- A cor de papel/time aparece só em ícones e efeitos, nunca no cenário.

**A interface nunca depende da cena**
- O HUD é HTML com fundo de vidro escuro (contraste AA), por cima do canvas.
- A vinheta de tensão fica **atrás** do HUD: escurece a cena, não os botões.

**Sombras**
- Uma luz com sombra e um mapa de 1024/2048 que segue o jogador.
- Personagens são uma malha só com esqueleto, então cada um é uma chamada de desenho também na
  passada de sombra.

### 1.3 Pós-processamento para um jogo de investigação

Ordem aplicada (`PostFx.tsx`), do primeiro ao último efeito:

| Efeito | Qualidade | Observação | Estado |
|---|---|---|---|
| N8AO (oclusão de ambiente, meia resolução) | alta | | ✅ |
| Bloom leve | média/alta | limiar alto: só lampiões, janelas e efeitos brilham | ✅ |
| Filtro térmico (Rastreador) | todas | | ✅ |
| Tone mapping ACES | todas | | ✅ |
| **Gradação de cor de suspense** | média/alta | dessatura um pouco (mais com tensão), sombras azul-petróleo, luzes âmbar, curva S leve | ✅ novo |
| Vinheta | média/alta | | ✅ |
| Grão de filme sutil | média/alta | | ✅ |
| SMAA | alta | | ✅ |
| **Vinheta de tensão** | todas (CSS, até sem pós-processamento) | vermelha nas bordas, pulsando junto com as batidas de coração | ✅ novo |

```glsl
// GradeEffect — roda depois do tone mapping
vec3 col = clamp(inputColor.rgb, 0.0, 1.0);
float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
col = mix(vec3(l), col, 0.84 - tension * 0.22);                              // dessatura com a tensão
col *= mix(vec3(0.86, 0.97, 1.10), vec3(1.08, 1.0, 0.88), smoothstep(0.06, 0.55, l)); // split toning
col = mix(col, col * col * (3.0 - 2.0 * col), 0.3);                         // contraste em S
```

**Evite**
- *Chromatic aberration* forte e *motion blur*: atrapalham a leitura de quem é quem.
- *Depth of field*: a névoa já faz esse papel, e o DoF esconderia pistas.

---

## 2. Jogabilidade, raciocínio e estratégia

### 2.1 Organização da tela

O princípio é **zonas fixas por função** e nada no centro, que é de onde vem o perigo.

| Zona | Conteúdo | Estado |
|---|---|---|
| Topo esquerdo | Papel e time; contadores (vivos, mortes necessárias, barra da vila); lista de tarefas recolhível | ✅ |
| Topo centro | Alertas de morte (somem em 7 s) | ✅ |
| Topo direito | Minimapa (tarefas, marcadores de morte); voz; **caderno de pistas (J)**; configurações | ✅ |
| Baixo centro | Habilidades com recarga em anel; stamina; botão de tarefa | ✅ |
| Baixo esquerdo | Chat local (só quem está a 14 m) | ✅ |
| Painel lateral | **Caderno de pistas** — não pausa o jogo | ✅ novo |

**Caderno de pistas** (`ui/Notebook.tsx`, `game/clues.ts`). Funciona como o "log de pistas":
- **Automático:** mortes, ressurreições e prisões, com hora da partida, local e **quem você via a até
  16 m**; resultados dos exames do Detetive; o sino e os lampiões, com quem estava ao lado (prova de
  inocência).
- **Manual:** anotações livres (até 140 letras).
- **Pessoas:** todos que você já viu, cada um marcado ⚠ suspeito / ✓ confiável. A marca aparece sobre
  a cabeça da pessoa.
- As marcas usam o **nome que você vê**. O Metamorfo disfarçado aparece com o nome copiado, então a
  marca não denuncia o disfarce.

**Inventário:** não há itens para gerenciar. As "ferramentas" são as habilidades do papel, e um
inventário só tiraria o foco da dedução.

**Votação e discussão**
- O jogo foi desenhado **sem reuniões nem votação**: a acusação é feita com ações de risco (tiro do
  Xerife, algema do Detetive).
- 🟡 Se quiserem um modo alternativo, a proposta é uma **Assembleia no sino**:
  1. Tocar o sino durante 5 s convoca todos os vivos para a praça (marcador no mapa).
  2. Ao chegarem, abre um painel com os vivos, ordenado pelas suas marcas do caderno.
  3. Há 60 s de voz e chat global e depois votação.
  4. O sino só pode convocar 1 vez a cada 3 minutos.
- Ficaria em `CONFIG.meeting`, desligado por padrão.

### 2.2 Movimentação e câmera que aumentam o perigo

**Terceira pessoa** (já usada)
- Mostra o próprio corpo, o que é importante num jogo de disfarce, e deixa ver quem vem atrás.
- O medo vem de enxergar pouco, por isso a névoa curta.

| Recurso | Estado |
|---|---|
| Aceleração e frenagem curtas; corrida com stamina (correr é barulhento e cansa) | ✅ |
| Animação do corpo pela distância (o pé não patina); inclina ao acelerar e nas curvas; anda curvado quando cansado | ✅ |
| **Balanço da cabeça** ao andar e correr (proporcional à velocidade, em sincronia com os passos) | ✅ novo |
| **Campo de visão +6°** correndo (sensação de pressa) e +2° com tensão alta | ✅ novo |
| **Tremor de câmera** por tiro, morte ou teleporte por perto (cai com a distância, até 22 m) e tremor leve contínuo com tensão alta ("mãos tremendo") | ✅ novo |
| Câmera que não atravessa paredes (raycast) e se aproxima rápido e se afasta devagar | ✅ |
| Opção **"Movimento de câmera"** nas Configurações; vem desligada se o sistema pede menos movimento | ✅ novo |
| 🟡 Olhar para trás segurando uma tecla (C), com a câmera girando 180° por 0,4 s | proposta |

Trecho de `Players.tsx`:

```ts
const runK = clamp01((speed - walkSpeed) / (runSpeed - walkSpeed));
const amp = bobWalk * walkK + (bobRun - bobWalk) * runK;
bobPhase += dt * (speed / stepLength) * Math.PI;               // em sincronia com os passos
const bob = Math.abs(Math.sin(bobPhase)) * amp;
const sh = shake * shake * 0.35 + tension * 0.012;              // tremor que decai
camera.position.copy(basePos).add(offsets(bob, sway, sh));      // base "limpa" + deslocamento
camera.fov = lerp(camera.fov, BASE_FOV + runFovBoost * runK + tension * 2, 1 - Math.exp(-dt * 4));
```

### 2.3 Game feel: pistas sonoras e visuais por papel

| Sinal | Quem percebe | Para que serve | Estado |
|---|---|---|---|
| Passos com timbre do chão (pedra, grama, madeira), posicionais, até 16 m | todos | ouvir alguém chegando na névoa | ✅ |
| **Pegadas** que somem em 9 s (mais fundas correndo, quase nada na pedra) | todos | ver quem saiu correndo de um lugar | ✅ novo `Footprints.tsx` |
| Voz por proximidade com áudio 3D (som posicional + queda com a distância) | todos | conversar, blefar | ✅ |
| Trilha de tensão + **batida de coração** + vinheta pulsando | só inocentes vivos (o servidor calcula) | "tem assassino perto" sem dizer quem | ✅ (vinheta nova) |
| Sino e lampião aceso, ouvidos e vistos pela vila | todos | prova de inocência; o caderno anota quem estava perto | ✅ |
| Tremor de câmera por tiro ou morte perto | todos | perceber violência fora da vista | ✅ novo |
| Efeitos de habilidade (dissolve do Fantasma, ondulação do Metamorfo…) | quem vê | pistas visuais | ✅ |
| 🟡 Assassinos: sussurro baixo quando a faca recarrega e há um inocente sozinho a < 10 m | só assassinos | dá ritmo à caçada | proposta |
| 🟡 Detetive: no exame, a direção da fuga (seta das pegadas do assassino por 10 s) | só o Detetive | dedução ativa | proposta |

Áudio espacial em Web Audio (`audio/sfx.ts`), sem bibliotecas:

```ts
function spatialOut(pos: { x: number; z: number }, maxDist = 40) {
  const dx = pos.x - listener.x, dz = pos.z - listener.z, d = Math.hypot(dx, dz);
  const g = ctx.createGain();
  g.gain.value = Math.max(0, 1 - d / maxDist) ** 1.3;             // queda com a distância
  const pan = ctx.createStereoPanner();
  const rx = -Math.cos(cameraYaw), rz = Math.sin(cameraYaw);     // vetor "direita" da câmera
  pan.pan.value = d > 0.5 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85 : 0;
  g.connect(pan).connect(masterBus);
  return g;
}
```

A voz (LiveKit) usa `PannerNode` HRTF com `refDistance` de 1,5 m, `rolloff` de 1,4 e silêncio além de
18 m (`voice/VoiceManager.ts`).

---

## 3. Desempenho: orçamento por qualidade

| | Baixa (celular) | Média | Alta |
|---|---|---|---|
| Resolução (DPR) | 0,6–0,9 | 0,9–1,25 | 1–2 |
| Ruídos por pixel (névoa/chão) | 1 / 1 (modo leve) | 2 / 2 | 2 / 2 |
| Sombras | — | 1024 | 2048 suaves |
| Pós-processamento | — (vinheta de tensão em CSS) | bloom, gradação, vinheta, grão | + N8AO, SMAA |
| Véus / grama | 6 / — | 16 / 1.600 | 28 / 6.500 |

Técnicas aplicadas:
- personagem em malha única com ossos;
- janelas mescladas por casa;
- árvores e grama instanciadas, em blocos com corte por distância;
- partículas e luzes em quantidade fixa (pool);
- qualidade automática que mede o FPS nos primeiros 10 s.

Hoje a cena faz menos chamadas de desenho por quadro do que antes desta série de melhorias (146 × 178).

---

## 4. Próximos passos sugeridos (em ordem)

1. Modelos finais `.glb` dos personagens (o pipeline já existe: `client/assets/characters/`).
2. Assembleia no sino (modo opcional de votação) — seção 2.1.
3. Sussurro do assassino e direção de fuga para o Detetive — seção 2.3.
4. God rays só na qualidade alta.
5. Teste com 10–16 humanos para recalibrar `CONFIG.tasks.villageGoal` e `kill.cooldown`. Os bots
   deduzem pior que pessoas.
