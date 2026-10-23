/**
 * Pegadas: cada pessoa visível (e você) deixa marcas que somem em alguns segundos.
 * Correndo, a marca é mais funda (escura); na pedra quase não aparece; na grama aparece bem.
 * Fantasma invisível e quem está escondido não deixam pegadas (o servidor nem os envia).
 * Uma única malha instanciada com fila circular: 1 chamada de desenho, nada alocado por passo.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG, EF, surfaceAt } from '@nevoeiro/shared';
import { net } from '../net/netState';

function printTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  // sola (oval) + calcanhar
  g.beginPath();
  g.ellipse(16, 22, 11, 19, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(16, 52, 8, 10, 0, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

interface Walker {
  x: number;
  z: number;
  acc: number;
  left: boolean;
}

const SURFACE_ALPHA = { grama: 1, madeira: 0.55, pedra: 0.35 } as Record<string, number>;

export function Footprints() {
  const max = CONFIG.feel.footprintMax;
  const life = CONFIG.feel.footprintSeconds;
  const { geo, mat, fade, born } = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.13, 0.27);
    g.rotateX(-Math.PI / 2);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    g.setAttribute('aFade', fade);
    const m = new THREE.MeshBasicMaterial({ map: printTexture(), color: '#0b0d0c', transparent: true, depthWrite: false, opacity: 0.6 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
    };
    m.customProgramCacheKey = () => 'footprint-v1';
    return { geo: g, mat: m, fade, born: new Float32Array(max).fill(-1e9) };
  }, [max]);
  useEffect(() => () => {
    geo.dispose();
    mat.map?.dispose();
    mat.dispose();
  }, [geo, mat]);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const walkers = useRef(new Map<string, Walker>());
  const strength = useRef(new Float32Array(max));
  const next = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    // começa tudo escondido
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < max; i++) m.setMatrixAt(i, dummy.matrix);
    m.instanceMatrix.needsUpdate = true;
  }, [max, dummy]);

  const drop = (x: number, z: number, yaw: number, side: number, run: boolean, now: number) => {
    const m = mesh.current;
    if (!m) return;
    const i = next.current;
    next.current = (i + 1) % max;
    const rx = Math.cos(yaw) * 0.12 * side;
    const rz = -Math.sin(yaw) * 0.12 * side;
    dummy.position.set(x + rx, 0.025, z + rz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.setScalar(run ? 1.08 : 1);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
    m.instanceMatrix.needsUpdate = true;
    born[i] = now;
    strength.current[i] = (run ? 0.85 : 0.5) * (SURFACE_ALPHA[surfaceAt(x, z)] ?? 1);
  };

  const step = (id: string, x: number, z: number, run: boolean, now: number) => {
    let w = walkers.current.get(id);
    if (!w) {
      w = { x, z, acc: 0, left: false };
      walkers.current.set(id, w);
      return;
    }
    const dx = x - w.x;
    const dz = z - w.z;
    const d = Math.hypot(dx, dz);
    w.x = x;
    w.z = z;
    if (d > 3) return; // teleporte
    w.acc += d;
    const len = run ? CONFIG.audio.stepLengthRun : CONFIG.audio.stepLengthWalk;
    if (w.acc >= len && d > 0.001) {
      w.acc = 0;
      w.left = !w.left;
      drop(x, z, Math.atan2(dx, dz), w.left ? 1 : -1, run, now);
    }
  };

  useFrame(() => {
    const now = performance.now() / 1000;
    const you = net.you;
    if (you?.alive && !you.invisible && !you.hidden) {
      const sp = Math.hypot(you.vx, you.vz);
      step('__me', net.local.x, net.local.z, sp > CONFIG.move.walkSpeed + 0.3, now);
    }
    for (const e of net.entities.values()) {
      if (e.leavingAt || e.flags & (EF.GHOST | EF.HIDDEN)) continue;
      step(e.id, e.rx, e.rz, !!(e.flags & EF.RUN), now);
    }
    // quem saiu da cena deixa de ser acompanhado
    if (walkers.current.size > net.entities.size + 4) {
      for (const id of walkers.current.keys()) if (id !== '__me' && !net.entities.has(id)) walkers.current.delete(id);
    }
    const arr = fade.array as Float32Array;
    for (let i = 0; i < max; i++) {
      const age = now - born[i];
      arr[i] = age > life ? 0 : strength.current[i] * (1 - age / life) * Math.min(1, age * 6 + 0.3);
    }
    fade.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, max]} frustumCulled={false} renderOrder={2} />;
}
