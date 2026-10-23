/**
 * Vila 3D placeholder (modular). Cada bloco de /shared/src/map.ts vira um placeholder;
 * se existir /client/assets/map/<id>.glb ou <kind>.glb, o modelo final é usado no lugar.
 * As colisões (Rapier no cliente, AABB no servidor) vêm SEMPRE dos dados do mapa.
 */
import { Clone, Detailed, Instance, Instances, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  CONFIG,
  HIDE_SPOTS,
  LAMP_POSITIONS,
  LOCATIONS,
  MAP_BLOCKS,
  MAP_COLLIDERS,
  ROADS,
  WORLD,
  buildingWalls,
  type MapBlock,
} from '@nevoeiro/shared';
import { net } from '../net/netState';
import type { QualityProfile } from '../quality';
import { THEME } from '../theme';
import { chimneyPos } from './Effects';

const MAP_MODELS = import.meta.glob('/assets/map/*.{glb,gltf}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function mapModel(name: string): string | undefined {
  return Object.entries(MAP_MODELS).find(([k]) => k.endsWith(`/${name}.glb`) || k.endsWith(`/${name}.gltf`))?.[1];
}

function ModelAt({ url, block }: { url: string; block: MapBlock }) {
  const { scene } = useGLTF(url);
  return <Clone object={scene} position={[block.x, 0, block.z]} castShadow receiveShadow />;
}

// ------------------------------------------------------------------ texturas procedurais

function makeNoiseTexture(base: string, spread: number, size = 256, repeat = 40) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    img.data[i] += n;
    img.data[i + 1] += n * 1.1;
    img.data[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, 4 + Math.random() * 18, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ componentes

export function World({ quality, physics = true }: { quality: QualityProfile; physics?: boolean }) {
  const grass = useMemo(() => makeNoiseTexture(THEME.scene.ground, 24), []);
  const dirt = useMemo(() => makeNoiseTexture('#3a3127', 30, 128, 1), []);
  // texturas de canvas não são descartadas automaticamente
  useEffect(() => () => {
    grass.dispose();
    dirt.dispose();
  }, [grass, dirt]);
  const blocks = MAP_BLOCKS;

  const byKind = useMemo(() => {
    const m: Record<string, MapBlock[]> = {};
    for (const b of blocks) (m[b.kind] ??= []).push(b);
    return m;
  }, [blocks]);

  return (
    <group>
      {physics && <Colliders />}
      {/* chão */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[WORLD.half * 2 + 60, WORLD.half * 2 + 60]} />
        <meshStandardMaterial map={grass} roughness={1} />
      </mesh>
      {/* áreas dos locais (tom de chão diferente) */}
      {LOCATIONS.filter((l) => l.id === 'praca' || l.id === 'cemiterio').map((l) => (
        <mesh key={l.id} rotation={[-Math.PI / 2, 0, 0]} position={[(l.minX + l.maxX) / 2, 0.01, (l.minZ + l.maxZ) / 2]} receiveShadow>
          <planeGeometry args={[l.maxX - l.minX, l.maxZ - l.minZ]} />
          <meshStandardMaterial color={l.id === 'praca' ? '#3b3a36' : '#18201a'} roughness={1} />
        </mesh>
      ))}
      {ROADS.map((r, i) => {
        const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
        const ang = Math.atan2(r.x2 - r.x1, r.z2 - r.z1);
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, ang]} position={[(r.x1 + r.x2) / 2, 0.015, (r.z1 + r.z2) / 2]} receiveShadow>
            <planeGeometry args={[r.w, len]} />
            <meshStandardMaterial map={dirt} color="#8a7a66" roughness={1} />
          </mesh>
        );
      })}

      {byKind.building?.map((b) => {
        const url = mapModel(b.id);
        return url ? <ModelAt key={b.id} url={url} block={b} /> : <Building key={b.id} b={b} />;
      })}
      {byKind.wall?.map((b) => (
        <mesh key={b.id} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.color ?? '#555'} roughness={0.95} />
        </mesh>
      ))}

      <Trees blocks={byKind.tree ?? []} detail={quality.treeDetail} shadows={quality.shadows} />
      <Graves blocks={byKind.grave ?? []} />
      <SimpleBoxes blocks={byKind.rock ?? []} color="#3d4140" geometry="dodeca" />
      <SimpleBoxes blocks={byKind.pew ?? []} color="#3a2618" />
      <SimpleBoxes blocks={byKind.table ?? []} color="#4a3220" />
      <SimpleBoxes blocks={byKind.counter ?? []} color="#3b2414" />
      <SimpleBoxes blocks={byKind.desk ?? []} color="#2e2a26" />
      <SimpleBoxes blocks={byKind.hay ?? []} color="#a68a3e" />
      <SimpleBoxes blocks={byKind.cart ?? []} color="#4a3320" />
      <SimpleBoxes blocks={byKind.bed ?? []} color="#6b3a3a" />
      <SimpleBoxes blocks={byKind.sofa ?? []} color="#3b2e45" />
      <SimpleBoxes blocks={byKind.altar ?? []} color="#cfc8b8" />
      <SimpleBoxes blocks={byKind.bench ?? []} color="#3a2a1e" />
      <SimpleBoxes blocks={byKind.crypt ?? []} color="#5a5a58" />
      <SimpleBoxes blocks={byKind.wardrobe ?? []} color="#3a2a1c" />
      <HideSpotVisuals />
      <Fences blocks={byKind.fence ?? []} />
      <Bars blocks={byKind.bars ?? []} />
      {byKind.fountain?.map((b) => <Fountain key={b.id} b={b} />)}
      {byKind.well?.map((b) => <Well key={b.id} b={b} />)}
      <Lamps />
      <WarmLights count={quality.pointLights} />
    </group>
  );
}

/** Colisores estáticos do Rapier — exatamente os mesmos AABBs que o servidor usa. */
function Colliders() {
  return (
    <RigidBody type="fixed" colliders={false} userData={{ static: true }}>
      {MAP_COLLIDERS.map((c, i) => (
        <CuboidCollider
          key={i}
          args={[(c.maxX - c.minX) / 2, c.h / 2, (c.maxZ - c.minZ) / 2]}
          position={[(c.minX + c.maxX) / 2, c.h / 2, (c.minZ + c.maxZ) / 2]}
        />
      ))}
      <CuboidCollider args={[WORLD.half + 30, 0.5, WORLD.half + 30]} position={[0, -0.5, 0]} />
    </RigidBody>
  );
}

function Building({ b }: { b: MapBlock }) {
  const walls = useMemo(() => buildingWalls(b), [b]);
  const roof = useRef<THREE.Group>(null);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: b.color ?? '#5a5550', roughness: 0.95 }), [b.color]);
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ color: b.roofColor ?? '#2a2522', roughness: 0.9 }), [b.roofColor]);
  useEffect(() => () => {
    wallMat.dispose();
    roofMat.dispose();
  }, [wallMat, roofMat]);
  const windows = useMemo(() => {
    // janelas: algumas acesas (luz quente), outras escuras
    const out: { x: number; z: number; ry: number; lit: boolean }[] = [];
    const seed = b.x * 13.7 + b.z * 7.1;
    const sides: [number, number, number, number][] = [
      [b.x, b.z - b.d / 2 - 0.01, Math.PI, b.w],
      [b.x, b.z + b.d / 2 + 0.01, 0, b.w],
      [b.x + b.w / 2 + 0.01, b.z, Math.PI / 2, b.d],
      [b.x - b.w / 2 - 0.01, b.z, -Math.PI / 2, b.d],
    ];
    sides.forEach(([cx, cz, ry, len], si) => {
      const count = Math.max(1, Math.floor(len / 5));
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * (len / count);
        if (Math.abs(off) < 2) continue; // não cobre a porta
        const horizontal = si < 2;
        out.push({
          x: horizontal ? cx + off : cx,
          z: horizontal ? cz : cz + off,
          ry,
          lit: Math.sin(seed + i * 3.1 + si) > 0.1,
        });
      }
    });
    return out;
  }, [b]);

  useFrame(() => {
    if (!roof.current) return;
    const inside =
      Math.abs(net.local.x - b.x) < b.w / 2 + 0.3 && Math.abs(net.local.z - b.z) < b.d / 2 + 0.3;
    roof.current.visible = !inside;
  });

  const roofH = Math.min(b.w, b.d) * 0.45;
  const horizontalRidge = b.w >= b.d;
  const chimney = b.chimney ? chimneyPos(b) : null;
  return (
    <Detailed distances={[0, CONFIG.graphics.lodDistance]} position={[b.x, 0, b.z]}>
      <group position={[-b.x, 0, -b.z]}>
        <group>
          {walls.map((w, i) => (
            <mesh key={i} position={[w.x, w.h / 2, w.z]} material={wallMat} castShadow receiveShadow>
              <boxGeometry args={[w.w, w.h, w.d]} />
            </mesh>
          ))}
          {/* piso interno */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.x, 0.02, b.z]} receiveShadow>
            <planeGeometry args={[b.w - 0.4, b.d - 0.4]} />
            <meshStandardMaterial color="#2b231c" roughness={1} />
          </mesh>
          {/* telhado de duas águas */}
          <group ref={roof} position={[b.x, b.h, b.z]} rotation={[0, horizontalRidge ? 0 : Math.PI / 2, 0]}>
            <mesh material={roofMat} castShadow scale={[horizontalRidge ? b.w + 0.6 : b.d + 0.6, roofH, (horizontalRidge ? b.d : b.w) + 0.8]}>
              <RoofGeometry />
            </mesh>
          </group>
          {windows.map((w, i) => (
            <mesh key={i} position={[w.x, Math.min(2.2, b.h * 0.45), w.z]} rotation={[0, w.ry, 0]}>
              <planeGeometry args={[1, 1.1]} />
              <meshStandardMaterial
                color={w.lit ? THEME.warmLight : '#141a1e'}
                emissive={w.lit ? THEME.warmLight : '#000000'}
                emissiveIntensity={w.lit ? 2.2 : 0}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
          {b.tower && <ChurchTower b={b} />}
          {chimney && (
            <mesh position={[chimney.x, chimney.y - 1, chimney.z]} material={wallMat} castShadow>
              <boxGeometry args={[0.8, 2, 0.8]} />
            </mesh>
          )}
        </group>
      </group>
      {/* versão simplificada para longe (LOD) */}
      <group position={[-b.x, 0, -b.z]}>
        <mesh position={[b.x, b.h / 2, b.z]} material={wallMat}>
          <boxGeometry args={[b.w, b.h, b.d]} />
        </mesh>
        <group position={[b.x, b.h, b.z]} rotation={[0, horizontalRidge ? 0 : Math.PI / 2, 0]}>
          <mesh material={roofMat} scale={[horizontalRidge ? b.w + 0.6 : b.d + 0.6, roofH, (horizontalRidge ? b.d : b.w) + 0.8]}>
            <RoofGeometry />
          </mesh>
        </group>
        {b.tower && <ChurchTower b={b} />}
      </group>
    </Detailed>
  );
}

/** Prisma triangular unitário (telhado). */
function RoofGeometry() {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.lineTo(-0.5, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  return <primitive object={geo} attach="geometry" />;
}

function ChurchTower({ b }: { b: MapBlock }) {
  const z = b.z - b.d / 2 + 2.5;
  return (
    <group position={[b.x, 0, z]}>
      <mesh position={[0, b.h + 4, 0]} castShadow>
        <boxGeometry args={[4, 8, 4]} />
        <meshStandardMaterial color={b.color} roughness={0.95} />
      </mesh>
      <mesh position={[0, b.h + 10.5, 0]} castShadow>
        <coneGeometry args={[3.1, 5, 4]} />
        <meshStandardMaterial color={b.roofColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, b.h + 6, 2.01]}>
        <circleGeometry args={[0.9, 20]} />
        <meshStandardMaterial color="#d8d0b0" emissive="#806a40" emissiveIntensity={0.6} />
      </mesh>
      <group position={[0, b.h + 14, 0]}>
        <mesh>
          <boxGeometry args={[0.18, 1.8, 0.18]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[1, 0.18, 0.18]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Árvores com instancing, divididas em blocos de 56 m: cada bloco tem a própria
 * caixa de colisão de câmera (frustum culling) e some além de CONFIG.graphics.cullDistance.
 */
function Trees({ blocks, detail, shadows }: { blocks: MapBlock[]; detail: number; shadows: boolean }) {
  const chunks = useMemo(() => {
    const m = new Map<string, MapBlock[]>();
    for (const b of blocks) {
      const key = `${Math.floor(b.x / 56)}:${Math.floor(b.z / 56)}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(b);
    }
    return [...m.values()];
  }, [blocks]);
  const geos = useMemo(
    () => ({
      trunk: new THREE.CylinderGeometry(0.18, 0.32, 1, 6),
      crown: new THREE.ConeGeometry(1, 1, detail),
    }),
    [detail],
  );
  const mats = useMemo(
    () => ({
      trunk: new THREE.MeshStandardMaterial({ color: '#2a1f17', roughness: 1 }),
      crown: new THREE.MeshStandardMaterial({ color: '#15261c', roughness: 1 }),
    }),
    [],
  );
  useEffect(() => () => {
    geos.trunk.dispose();
    geos.crown.dispose();
  }, [geos]);
  useEffect(() => () => {
    mats.trunk.dispose();
    mats.crown.dispose();
  }, [mats]);
  if (!blocks.length) return null;
  const url = mapModel('tree');
  if (url) return <>{blocks.map((b) => <ModelAt key={b.id} url={url} block={b} />)}</>;
  return (
    <group>
      {chunks.map((c, i) => (
        <TreeChunk key={i} trees={c} geos={geos} mats={mats} shadows={shadows} />
      ))}
    </group>
  );
}

function TreeChunk({
  trees,
  geos,
  mats,
  shadows,
}: {
  trees: MapBlock[];
  geos: { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry };
  mats: { trunk: THREE.Material; crown: THREE.Material };
  shadows: boolean;
}) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const center = useMemo(() => {
    const x = trees.reduce((a, t) => a + t.x, 0) / trees.length;
    const z = trees.reduce((a, t) => a + t.z, 0) / trees.length;
    return new THREE.Vector3(x, 0, z);
  }, [trees]);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    const shade = new THREE.Color();
    trees.forEach((b, i) => {
      d.position.set(b.x, b.h * 0.2, b.z);
      d.scale.set(1, b.h * 0.4, 1);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      trunk.current!.setMatrixAt(i, d.matrix);
      d.position.set(b.x, b.h * 0.5, b.z);
      d.scale.set(b.h * 0.26, b.h * 0.55, b.h * 0.26);
      d.rotation.set(0, (b.x * 7 + b.z * 3) % 6.28, 0);
      d.updateMatrix();
      crown.current!.setMatrixAt(i * 2, d.matrix);
      crown.current!.setColorAt(i * 2, shade.set('#15261c'));
      d.position.set(b.x, b.h * 0.78, b.z);
      d.scale.set(b.h * 0.18, b.h * 0.4, b.h * 0.18);
      d.updateMatrix();
      crown.current!.setMatrixAt(i * 2 + 1, d.matrix);
      crown.current!.setColorAt(i * 2 + 1, shade.set('#1a2f22'));
    });
    for (const m of [trunk.current!, crown.current!]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere(); // frustum culling correto por bloco
    }
  }, [trees]);
  useFrame(({ camera }) => {
    if (group.current) group.current.visible = camera.position.distanceTo(center) < CONFIG.graphics.cullDistance + 25;
  });
  return (
    <group ref={group}>
      <instancedMesh ref={trunk} args={[geos.trunk, mats.trunk, trees.length]} castShadow={shadows} receiveShadow />
      <instancedMesh ref={crown} args={[geos.crown, mats.crown, trees.length * 2]} castShadow={shadows} />
    </group>
  );
}

function Graves({ blocks }: { blocks: MapBlock[] }) {
  if (!blocks.length) return null;
  return (
    <group>
      <Instances limit={blocks.length} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6b6d6a" roughness={0.95} />
        {blocks.map((b) => (
          <Instance key={b.id} position={[b.x, b.h / 2, b.z]} scale={[b.w, b.h, b.d]} />
        ))}
      </Instances>
      <Instances limit={blocks.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#232a24" roughness={1} />
        {blocks.map((b) => (
          <Instance key={b.id} position={[b.x, 0.04, b.z + 0.9]} scale={[0.8, 0.08, 1.6]} />
        ))}
      </Instances>
    </group>
  );
}

function SimpleBoxes({ blocks, color, geometry = 'box' }: { blocks: MapBlock[]; color: string; geometry?: 'box' | 'dodeca' }) {
  if (!blocks.length) return null;
  const url = mapModel(blocks[0].kind);
  if (url) return <>{blocks.map((b) => <ModelAt key={b.id} url={url} block={b} />)}</>;
  return (
    <Instances limit={blocks.length} castShadow receiveShadow>
      {geometry === 'box' ? <boxGeometry args={[1, 1, 1]} /> : <dodecahedronGeometry args={[0.6, 0]} />}
      <meshStandardMaterial color={color} roughness={0.95} flatShading={geometry !== 'box'} />
      {blocks.map((b) => (
        <Instance key={b.id} position={[b.x, b.h / 2, b.z]} scale={[b.w, b.h, b.d]} />
      ))}
    </Instances>
  );
}

function Fences({ blocks }: { blocks: MapBlock[] }) {
  // estacas de ferro ao longo de cada segmento
  const posts = useMemo(() => {
    const out: [number, number][] = [];
    for (const b of blocks) {
      const horizontal = b.w > b.d;
      const len = horizontal ? b.w : b.d;
      const n = Math.floor(len / 0.6);
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (i * len) / n;
        out.push(horizontal ? [b.x + t, b.z] : [b.x, b.z + t]);
      }
    }
    return out;
  }, [blocks]);
  return (
    <group>
      <Instances limit={posts.length}>
        <boxGeometry args={[0.06, 1.25, 0.06]} />
        <meshStandardMaterial color="#121414" metalness={0.6} roughness={0.5} />
        {posts.map(([x, z], i) => (
          <Instance key={i} position={[x, 0.62, z]} />
        ))}
      </Instances>
      {blocks.map((b) => (
        <mesh key={b.id} position={[b.x, 1.05, b.z]}>
          <boxGeometry args={[Math.max(b.w, 0.05), 0.05, Math.max(b.d, 0.05)]} />
          <meshStandardMaterial color="#121414" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Bars({ blocks }: { blocks: MapBlock[] }) {
  return (
    <group>
      {blocks.map((b) => (
        <group key={b.id}>
          {Array.from({ length: Math.floor(b.d / 0.3) }, (_, i) => (
            <mesh key={i} position={[b.x, b.h / 2, b.z - b.d / 2 + i * 0.3 + 0.15]}>
              <cylinderGeometry args={[0.03, 0.03, b.h, 6]} />
              <meshStandardMaterial color="#222" metalness={0.8} roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Fountain({ b }: { b: MapBlock }) {
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) (water.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + Math.sin(clock.elapsedTime * 1.5) * 0.08;
  });
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.1, 2.3, 0.8, 24]} />
        <meshStandardMaterial color="#5d5a55" roughness={0.9} />
      </mesh>
      <mesh ref={water} position={[0, 0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.85, 24]} />
        <meshStandardMaterial color="#0e2a30" emissive="#1a5560" emissiveIntensity={0.3} roughness={0.15} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.4, 1.6, 12]} />
        <meshStandardMaterial color="#6a665f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.25, 0]} castShadow>
        <cylinderGeometry args={[0.8, 0.5, 0.25, 16]} />
        <meshStandardMaterial color="#6a665f" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Well({ b }: { b: MapBlock }) {
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 1, 14, 1, true]} />
        <meshStandardMaterial color="#555049" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 2.2, 0]} rotation={[0, 0, 0]} castShadow>
        <coneGeometry args={[1.2, 0.8, 4]} />
        <meshStandardMaterial color="#3a2a1e" />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ luzes e tochas

const flameMat = new THREE.MeshStandardMaterial({ color: '#FFD9A0', emissive: THEME.warmLight, emissiveIntensity: 2.6, toneMapped: false });
const lampPostMat = new THREE.MeshStandardMaterial({ color: '#141515', metalness: 0.5, roughness: 0.6 });

/** Lampiões com chama tremulando (a luz pontual vem de WarmLights). */
function Lamps() {
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flameMat.emissiveIntensity = 2.3 + Math.sin(t * 13) * 0.25 + Math.sin(t * 29.7) * 0.15;
  });
  return (
    <group>
      {LAMP_POSITIONS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 2.1, 0]} castShadow material={lampPostMat}>
            <cylinderGeometry args={[0.06, 0.09, 4.2, 6]} />
          </mesh>
          <mesh position={[0, 4.2, 0]} material={flameMat}>
            <boxGeometry args={[0.32, 0.44, 0.32]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Luzes quentes pontuais: um número fixo (por qualidade) que é reposicionado nos lampiões
 * e janelas mais próximos do jogador. Sem sombras (desempenho) e sem mudar a contagem
 * de luzes da cena (não recompila shaders).
 */
function WarmLights({ count }: { count: number }) {
  const lights = useRef<THREE.PointLight[]>([]);
  const spots = useMemo(() => {
    const list: { x: number; y: number; z: number; power: number }[] = LAMP_POSITIONS.map(([x, z]) => ({ x, y: 4, z, power: 1 }));
    for (const b of MAP_BLOCKS) if (b.kind === 'building') list.push({ x: b.x, y: 2.2, z: b.z, power: 0.8 });
    return list;
  }, []);
  const assigned = useRef<number[]>([]);
  const timer = useRef(0);
  useFrame(({ clock }, dt) => {
    timer.current -= dt;
    if (timer.current <= 0) {
      timer.current = 0.5;
      assigned.current = spots
        .map((s, i) => ({ i, d: Math.hypot(s.x - net.local.x, s.z - net.local.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map((s) => s.i);
    }
    const t = clock.elapsedTime;
    lights.current.forEach((l, k) => {
      const idx = assigned.current[k];
      if (idx === undefined || !l) return;
      const s = spots[idx];
      l.position.set(s.x, s.y, s.z);
      const flicker = 1 + Math.sin(t * 11 + k * 3) * 0.06 + Math.sin(t * 23 + k) * 0.04;
      l.intensity = 16 * s.power * flicker;
    });
  });
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <pointLight key={i} ref={(l) => { if (l) lights.current[i] = l; }} color={THEME.warmLight} intensity={0} distance={15} decay={1.8} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ esconderijos

const bushMat = new THREE.MeshStandardMaterial({ color: '#1C3A24', roughness: 1, flatShading: true });
const hayMat = new THREE.MeshStandardMaterial({ color: '#9C8236', roughness: 1, flatShading: true });
const bushGeo = new THREE.IcosahedronGeometry(1, 1);

/** Arbustos altos e montes de feno (dá para entrar). Os armários vêm dos blocos 'wardrobe'. */
function HideSpotVisuals() {
  return (
    <group>
      {HIDE_SPOTS.filter((h) => h.kind !== 'wardrobe').map((h) => {
        const mat = h.kind === 'bush' ? bushMat : hayMat;
        const parts = h.kind === 'bush'
          ? [[0, 1.1, 0, 1.15], [0.6, 0.8, 0.3, 0.8], [-0.55, 0.75, -0.3, 0.8], [0.1, 1.8, -0.1, 0.75]]
          : [[0, 0.7, 0, 1.25], [0.4, 0.5, 0.5, 0.8], [-0.5, 0.45, -0.3, 0.75]];
        return (
          <group key={h.id} position={[h.x, 0, h.z]}>
            {parts.map(([x, y, z, sc], i) => (
              <mesh key={i} geometry={bushGeo} material={mat} position={[x, y, z]} scale={[sc * h.r, sc * (h.kind === 'bush' ? 1.25 : 0.7), sc * h.r]} castShadow />
            ))}
          </group>
        );
      })}
    </group>
  );
}
