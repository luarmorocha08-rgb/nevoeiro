import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { CONFIG } from '@nevoeiro/shared';
import { input } from '../input/InputManager';
import { net } from '../net/netState';
import { useStore } from '../net/store';
import { QUALITY_PROFILES, isTouchDevice, resolveQuality, type QualityProfile } from '../quality';
import { Bodies } from './Bodies';
import { FogParticles, FxLayer, TargetSystem, ThermalVision } from './Effects';
import { LocalPlayer, RemotePlayers, SpectatorCamera } from './Players';
import { World } from './World';

/** Luz da lua que acompanha o jogador (sombras só onde importa). */
function Moon({ quality }: { quality: QualityProfile }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    l.position.set(net.local.x - 18, 30, net.local.z - 12);
    l.target.position.set(net.local.x, 0, net.local.z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      color="#9db6d6"
      intensity={1.6}
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
    />
  );
}

export function GameCanvas() {
  const qSetting = useStore((s) => s.settings.quality);
  const quality = QUALITY_PROFILES[resolveQuality(qSetting)];
  const touch = isTouchDevice();

  return (
    <Canvas
      key={qSetting}
      className="game-canvas"
      shadows={quality.shadows ? 'soft' : false}
      dpr={quality.dpr}
      gl={{ antialias: quality.antialias, powerPreference: 'high-performance' }}
      camera={{ fov: 62, near: 0.1, far: 220, position: [0, 3, 8] }}
      onPointerDown={(e) => {
        const el = e.target as HTMLCanvasElement;
        if (touch) return;
        if (e.button === 2) input.beginDrag(e);
        else if (e.button === 0 && !document.pointerLockElement && !useStore.getState().end) {
          el.requestPointerLock?.();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={[CONFIG.view.fogColor]} />
      <fogExp2 attach="fog" args={[CONFIG.view.fogColor, CONFIG.view.fogDensity]} />
      <ambientLight color="#6a7d96" intensity={1.1} />
      <hemisphereLight args={['#3c5470', '#141a14', 0.9]} />
      <Moon quality={quality} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep="vary">
          <World quality={quality} />
          <RemotePlayers />
          <LocalPlayer />
          <Bodies />
        </Physics>
      </Suspense>
      <SpectatorCamera />
      <ThermalVision />
      <FogParticles count={quality.fogParticles} />
      <FxLayer />
      <TargetSystem />
    </Canvas>
  );
}
