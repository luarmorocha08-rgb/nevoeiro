# Blocos finais do mapa

O mapa é modular (`shared/src/map.ts`). Para trocar um placeholder pelo cenário final,
coloque aqui um `.glb` com o **id** do bloco ou com o **tipo** (kind):

- Por id (construções únicas): `igreja.glb`, `taverna.glb`, `delegacia.glb`, `casarao.glb`, `celeiro.glb`, `casa-1.glb` … `casa-5.glb`
- Por tipo (repetidos): `tree.glb`, `rock.glb`, `pew.glb`, `table.glb`, `hay.glb`, `cart.glb`, `bench.glb` …

O modelo é posicionado no centro do bloco (x, z) com y = 0. Modele cada construção com
o mesmo tamanho/porta do bloco, porque **as colisões continuam vindo de `map.ts`**
(servidor e cliente usam os mesmos retângulos). Se mudar o tamanho, edite o bloco em `map.ts`.
