import { useEffect } from 'react';
import { triggerAbility } from '../game/abilities';
import { GameCanvas } from '../game/GameCanvas';
import { input, setKeyBlocker } from '../input/InputManager';
import { getState, useStore } from '../net/store';
import { voice } from '../voice/VoiceManager';
import { Hud } from './Hud';

export function GameScreen() {
  const sensitivity = useStore((s) => s.settings.sensitivity);
  const invertY = useStore((s) => s.settings.invertY);

  useEffect(() => {
    input.sensitivity = sensitivity;
    input.invertY = invertY;
  }, [sensitivity, invertY]);

  useEffect(() => {
    input.start();
    setKeyBlocker(() => getState().chatOpen);
    const onLock = () => getState().set({ pointerLocked: !!document.pointerLockElement });
    document.addEventListener('pointerlockchange', onLock);
    const off = input.on((a) => {
      const st = getState();
      switch (a) {
        case 'ability0':
          triggerAbility(0);
          break;
        case 'ability1':
          triggerAbility(1);
          break;
        case 'chat':
          st.set({ chatOpen: true });
          break;
        case 'map':
          st.set({ mapOpen: !st.mapOpen, teleportPicking: false });
          break;
        case 'role':
          st.set({ showRole: !st.showRole });
          break;
        case 'mute':
          st.set({ voice: { ...st.voice, micOn: !st.voice.micOn } });
          void voice.applyMic();
          break;
        case 'pttDown':
          st.set({ voice: { ...st.voice, pttHeld: true } });
          void voice.applyMic();
          break;
        case 'pttUp':
          st.set({ voice: { ...st.voice, pttHeld: false } });
          void voice.applyMic();
          break;
        case 'escape':
          st.set({ mapOpen: false, teleportPicking: false, showRole: st.phase === 'reveal', examine: null });
          break;
      }
    });
    return () => {
      off();
      document.removeEventListener('pointerlockchange', onLock);
      document.exitPointerLock?.();
    };
  }, []);

  return (
    <div className="game-screen">
      <GameCanvas />
      <Hud />
    </div>
  );
}
