import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { CONFIG } from '@nevoeiro/shared';
import { FogController, FogVeils } from '../game/Atmosphere';
import { AmbientParticles } from '../game/Effects';
import { NightLighting } from '../game/GameCanvas';
import { OrbitCamera } from '../game/Players';
import { World } from '../game/World';
import { QUALITY_PROFILES } from '../quality';

/** Fundo dos menus: a vila em neblina com a câmera girando devagar (leve, sem física). */
export function MenuBackground() {
  const q = QUALITY_PROFILES.low;
  return (
    <div className="menu-bg" aria-hidden="true">
      <Canvas dpr={[0.5, 0.8]} gl={{ antialias: false, powerPreference: 'low-power' }} camera={{ fov: 55, near: 0.1, far: CONFIG.graphics.cullDistance + 30, position: [24, 10, 0] }}>
        <NightLighting quality={q} follow={false} />
        <Suspense fallback={null}>
          <World quality={q} physics={false} />
        </Suspense>
        <FogController fixedDensity={CONFIG.graphics.fogDensity * 0.8} lite />
        <FogVeils count={8} center={() => ({ x: 0, z: 0 })} />
        <AmbientParticles dust={0} fireflies={30} />
        <OrbitCamera active radius={26} height={9} speed={0.035} />
      </Canvas>
      <div className="menu-shade" />
    </div>
  );
}
