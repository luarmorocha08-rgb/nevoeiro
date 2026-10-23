/**
 * Marcadores 3D das SUAS tarefas pendentes: anel no chão, losango flutuando e um
 * feixe de luz fraco que atravessa a neblina (dá para achar de longe).
 * Também calcula a tarefa ao alcance (botão "Fazer tarefa").
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { taskStation, type TaskStation } from '@nevoeiro/shared';
import { net } from '../net/netState';
import { getState, useStore } from '../net/store';
import { THEME } from '../theme';
import { nearestTask } from './tasks';

const BEAM_VERT = /* glsl */ `
varying float vH;
void main() {
  vH = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vH;
void main() {
  float a = pow(1.0 - vH, 2.2) * uOpacity;
  gl_FragColor = vec4(uColor, a);
}`;

const ringGeo = new THREE.RingGeometry(0.85, 1.0, 40);
ringGeo.rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(0.85, 32);
discGeo.rotateX(-Math.PI / 2);
const gemGeo = new THREE.OctahedronGeometry(0.22, 0);
const beamGeo = new THREE.CylinderGeometry(0.28, 0.5, 26, 16, 1, true);
beamGeo.translate(0, 13, 0);

export function TaskMarkers() {
  const tasks = useStore((s) => s.tasks);
  const alive = useStore((s) => s.you?.alive ?? true);
  const phase = useStore((s) => s.phase);
  const pending = useMemo(
    () => (tasks?.list ?? []).filter((t) => !t.done).map((t) => taskStation(t.id)).filter((s): s is TaskStation => !!s),
    [tasks],
  );
  const timer = useRef(0);

  // tarefa ao alcance (5x por segundo)
  useFrame((_, dt) => {
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 0.2;
    const near = nearestTask();
    const st = getState();
    if (near !== st.taskNear) st.set({ taskNear: near });
  });

  if (!alive || phase !== 'playing') return null;
  return (
    <group>
      {pending.map((st) => (
        <Marker key={st.id} st={st} fake={!!tasks?.fake} />
      ))}
    </group>
  );
}

function Marker({ st, fake }: { st: TaskStation; fake: boolean }) {
  const color = fake ? THEME.alert.deathText : THEME.task;
  const mats = useMemo(() => {
    const c = new THREE.Color(color);
    return {
      ring: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
      disc: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
      gem: new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.6), toneMapped: false, fog: false }),
      beam: new THREE.ShaderMaterial({
        uniforms: { uColor: { value: c }, uOpacity: { value: 0.18 } },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    };
  }, [color]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const ring = useRef<THREE.Mesh>(null);
  const gem = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => Math.random() * 10, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const d = Math.hypot(st.x - net.local.x, st.z - net.local.z);
    const pulse = 0.5 + Math.sin(t * 3) * 0.5;
    if (ring.current) ring.current.scale.setScalar(1 + pulse * 0.12);
    mats.ring.opacity = 0.45 + pulse * 0.4;
    if (gem.current) {
      gem.current.position.y = 2.2 + Math.sin(t * 2) * 0.12;
      gem.current.rotation.y = t * 1.4;
    }
    // feixe mais forte de longe (guia na neblina), some quando você chega
    mats.beam.uniforms.uOpacity.value = Math.min(0.32, Math.max(0, (d - 4) / 30));
  });

  return (
    <group position={[st.x, 0.05, st.z]}>
      <mesh ref={ring} geometry={ringGeo} material={mats.ring} renderOrder={3} />
      <mesh geometry={discGeo} material={mats.disc} renderOrder={3} />
      <mesh ref={gem} geometry={gemGeo} material={mats.gem} position={[0, 2.2, 0]} />
      <mesh geometry={beamGeo} material={mats.beam} renderOrder={4} />
    </group>
  );
}
