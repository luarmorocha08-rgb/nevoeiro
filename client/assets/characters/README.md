# Modelos finais dos personagens

Coloque aqui os arquivos `.glb` / `.gltf`. O build detecta tudo automaticamente
(`import.meta.glob` em `src/game/CharacterModel.tsx`) — não precisa mexer em código.

| Arquivo | Uso |
|---|---|
| `<id-da-skin>.glb` | modelo daquela skin (ex.: `capuz-vinho.glb`, `cardigan-lavanda.glb`) |
| `default.glb` | usado por qualquer skin sem modelo próprio |

IDs das skins: veja `shared/src/skins.ts`.

## Requisitos
- Escala: 1 unidade = 1 metro, altura ~1,8 m, pés na origem (y = 0), olhando para **+Z**.
- Animações (nomes dos clipes, maiúsculas/minúsculas tanto faz):
  - `idle` (parado) · `walk`/`andar` · `run`/`correr` · `death`/`morrer` (toca uma vez) · `ability`/`habilidade`
- Rig com esqueleto (SkinnedMesh) — o modelo é clonado com `SkeletonUtils` para vários jogadores.
- Recomendado: < 15 mil triângulos e texturas de até 1024px (roda no celular).

Enquanto o arquivo não existir, aparece a cápsula colorida com as cores da skin.
