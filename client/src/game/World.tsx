/**
 * Vila 3D placeholder (modular). Cada bloco de /shared/src/map.ts vira um placeholder;
 * se existir /client/assets/map/<id>.glb ou <kind>.glb, o modelo final é usado no lugar.
 * As colisões (Rapier no cliente, AABB no servidor) vêm SEMPRE dos dados do mapa.
 */
import { Clone, Instance, Instances, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
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

export function World({ quality }: { quality: QualityProfile }) {
  const grass = useMemo(() => makeNoiseTexture('#1d2a22', 26), []);
  const dirt = useMemo(() => makeNoiseTexture('#3a3127', 30, 128, 1), []);
  const blocks = MAP_BLOCKS;

  const byKind = useMemo(() => {
    const m: Record<string, MapBlock[]> = {};
    for (const b of blocks) (m[b.kind] ??= []).push(b);
    return m;
  }, [blocks]);

  return (
    <group>
      <Colliders />
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
      <Fences blocks={byKind.fence ?? []} />
      <Bars blocks={byKind.bars ?? []} />
      {byKind.fountain?.map((b) => <Fountain key={b.id} b={b} />)}
      {byKind.well?.map((b) => <Well key={b.id} b={b} />)}
      <Lamps maxLights={quality.lampLights} />
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
  return (
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
            color={w.lit ? '#ffcf8a' : '#141a1e'}
            emissive={w.lit ? '#ff9a3c' : '#000000'}
            emissiveIntensity={w.lit ? 1.6 : 0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {b.tower && <ChurchTower b={b} />}
    </group>
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

function Trees({ blocks, detail, shadows }: { blocks: MapBlock[]; detail: number; shadows: boolean }) {
  if (!blocks.length) return null;
  const url = mapModel('tree');
  if (url) return <>{blocks.map((b) => <ModelAt key={b.id} url={url} block={b} />)}</>;
  return (
    <group>
      <Instances limit={blocks.length} castShadow={shadows} receiveShadow>
        <cylinderGeometry args={[0.18, 0.32, 1, 6]} />
        <meshStandardMaterial color="#2a1f17" roughness={1} />
        {blocks.map((b) => (
          <Instance key={b.id} position={[b.x, b.h * 0.2, b.z]} scale={[1, b.h * 0.4, 1]} />
        ))}
      </Instances>
      <Instances limit={blocks.length * 2} castShadow={shadows}>
        <coneGeometry args={[1, 1, detail]} />
        <meshStandardMaterial color="#14241a" roughness={1} />
        {blocks.map((b) => (
          <group key={b.id}>
            <Instance position={[b.x, b.h * 0.5, b.z]} scale={[b.h * 0.26, b.h * 0.55, b.h * 0.26]} />
            <Instance position={[b.x, b.h * 0.78, b.z]} scale={[b.h * 0.18, b.h * 0.4, b.h * 0.18]} color="#182b1f" />
          </group>
        ))}
      </Instances>
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

function Lamps({ maxLights }: { maxLights: number }) {
  return (
    <group>
      {LAMP_POSITIONS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 2.1, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.09, 4.2, 6]} />
            <meshStandardMaterial color="#141515" metalness={0.5} roughness={0.6} />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <boxGeometry args={[0.36, 0.48, 0.36]} />
            <meshStandardMaterial color="#ffd9a0" emissive="#ffa040" emissiveIntensity={2.2} />
          </mesh>
          {i < maxLights && <pointLight position={[0, 4, 0]} color="#ffb066" intensity={14} distance={16} decay={1.8} />}
        </group>
      ))}
    </group>
  );
}
