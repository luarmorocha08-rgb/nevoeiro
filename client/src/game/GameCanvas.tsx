import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG } from '@nevoeiro/shared';
import { ambient } from '../audio/ambient';
import { input } from '../input/InputManager';
import { net } from '../net/netState';
import { getState, useStore } from '../net/store';
import { QUALITY_PROFILES, isTouchDevice, resolveQuality, saveAutoQuality, type QualityLevel, type QualityProfile } from '../quality';
import { THEME } from '../theme';
import { Bodies } from './Bodies';
import './fog';
import { FogController, FogVeils, SkyDome } from './Atmosphere';
import { MOON_DIR } from './fog';
import { AmbientParticles, ChimneySmoke, FallingLeaves, FxLayer, TargetSystem, ThermalVision } from './Effects';
import { Lantern, LocalPlayer, OrbitCamera, RemotePlayers, SpectatorCamera } from './Players';
import { PostFx } from './PostFx';
import { TaskMarkers } from './TaskMarkers';
import { Footprints } from './Footprints';
import { World } from './World';

/** Luz da lua fria e direcional, que acompanha o jogador (sombras só onde importa). */
export function Moon({ quality, follow = true }: { quality: QualityProfile; follow?: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l || !follow) return;
    // a luz vem da lua que aparece no céu (MOON_DIR)
    l.position.set(net.local.x + MOON_DIR.x * 40, MOON_DIR.y * 40 + 6, net.local.z + MOON_DIR.z * 40);
    l.target.position.set(net.local.x, 0, net.local.z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      position={[MOON_DIR.x * 40, MOON_DIR.y * 40 + 6, MOON_DIR.z * 40]}
      color={THEME.moonlight}
      intensity={CONFIG.graphics.light.moon}
      castShadow={quality.shadows}
      shadow-mapSize-width={quality.shadowMapSize}
      shadow-mapSize-height={quality.shadowMapSize}
      shadow-camera-left={-28}
      shadow-camera-right={28}
      shadow-camera-top={28}
      shadow-camera-bottom={-28}
      shadow-camera-near={1}
      shadow-camera-far={80}
      shadow-bias={-0.0008}
      shadow-radius={quality.softShadows ? 4 : 1}
    />
  );
}

/** Iluminação noturna: céu frio, ambiente baixo e lua (luzes quentes ficam no World). */
export function NightLighting({ quality, follow = true }: { quality: QualityProfile; follow?: boolean }) {
  return (
    <>
      <color attach="background" args={[THEME.scene.background]} />
      {/* THREE.Fog só transporta os uniforms da névoa (near = tempo, far = densidade) — ver fog.ts */}
      <fog attach="fog" args={[THEME.scene.fogFar, 0, CONFIG.graphics.fogDensity]} />
      {/* noite legível: ambiente e céu azulados (nada fica preto chapado) + lua com sombras */}
      <ambientLight color={THEME.scene.ambient} intensity={CONFIG.graphics.light.ambient} />
      <hemisphereLight args={[THEME.moonlight, THEME.scene.groundBounce, CONFIG.graphics.light.hemisphere]} />
      <Moon quality={quality} follow={follow} />
      <SkyDome stars={quality.stars} clouds={!quality.lite} />
    </>
  );
}

/**
 * Qualidade automática real: mede o FPS nos primeiros segundos de partida e sobe/desce
 * um nível. O resultado fica salvo para as próximas vezes. Também alimenta o contador de FPS.
 */
function QualityGovernor({ level }: { level: QualityLevel }) {
  const s = useRef({ frames: 0, time: 0, sampling: false, done: false, fpsAcc: 0, fpsFrames: 0 });
  useFrame((_, dt) => {
    const st = getState();
    const r = s.current;
    // contador de FPS (atualiza 2x por segundo)
    r.fpsAcc += dt;
    r.fpsFrames++;
    if (r.fpsAcc >= 0.5) {
      st.set({ fps: Math.round(r.fpsFrames / r.fpsAcc) });
      r.fpsAcc = 0;
      r.fpsFrames = 0;
    }
    if (r.done || st.settings.quality !== 'auto' || st.phase !== 'playing') return;
    const A = CONFIG.graphics.autoQuality;
    r.time += dt;
    if (r.time < A.warmupSeconds) return;
    r.frames++;
    if (r.time < A.warmupSeconds + A.sampleSeconds) return;
    r.done = true;
    const fps = r.frames / A.sampleSeconds;
    const order: QualityLevel[] = ['low', 'medium', 'high'];
    let i = order.indexOf(level);
    if (fps < A.lowBelow) i = Math.max(0, i - 1);
    else if (fps > A.highAbove) i = Math.min(2, i + 1);
    const next = order[i];
    console.info(`[qualidade] FPS medido ${fps.toFixed(1)} em "${level}" → "${next}"`);
    saveAutoQuality(next);
    if (next !== level) st.set({ autoQuality: next });
  });
  return null;
}

/** Áudio que depende da cena: passos, ambiente e trilha. */
function AudioSystem() {
  useFrame((_, dt) => {
    ambient.update(Math.min(dt, 0.1));
    ambient.updateSteps();
  });
  return null;
}

export function GameCanvas() {
  const qSetting = useStore((s) => s.settings.quality);
  const measured = useStore((s) => s.autoQuality);
  const ended = useStore((s) => !!s.end);
  const level = resolveQuality(qSetting, measured);
  const quality = QUALITY_PROFILES[level];
  const touch = isTouchDevice();

  return (
    <Canvas
      className="game-canvas"
      shadows={quality.shadows ? (quality.softShadows ? 'soft' : 'percentage') : false}
      // celular: no máximo 1,5x de resolução (desempenho e bateria)
      dpr={touch ? [quality.dpr[0], Math.min(quality.dpr[1], 1.5)] : quality.dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 62, near: 0.1, far: CONFIG.graphics.cullDistance + 30, position: [0, 3, 8] }}
      onPointerDown={(e) => {
        const el = e.target as HTMLCanvasElement;
        if (touch) return;
        if (e.button === 2) input.beginDrag(e);
        else if (e.button === 0 && !document.pointerLockElement && !useStore.getState().end) {
          el.requestPointerLock?.();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      onCreated={({ scene, gl }) => {
        // depuração (só em desenvolvimento)
        if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __gl: gl });
      }}
    >
      <NightLighting quality={quality} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep="vary">
          <World quality={quality} />
          <RemotePlayers />
          <LocalPlayer />
          <Bodies />
        </Physics>
      </Suspense>
      <Lantern />
      <SpectatorCamera />
      <OrbitCamera active={ended} radius={24} height={10} />
      <FogController lite={quality.lite} />
      <FogVeils count={quality.fogVeils} />
      <ThermalVision />
      <AmbientParticles dust={quality.dust} fireflies={quality.fireflies} />
      {quality.leaves > 0 && <FallingLeaves count={quality.leaves} />}
      {quality.smoke && <ChimneySmoke />}
      <FxLayer quality={quality} />
      <TargetSystem />
      <TaskMarkers />
      <Footprints />
      <AudioSystem />
      <QualityGovernor level={level} />
      <PostFx quality={quality} />
    </Canvas>
  );
}
