import { useEffect } from 'react';
import { triggerAbility } from '../game/abilities';
import { cancelTask, openTask } from '../game/tasks';
import { resetCooldownWatch } from '../game/feedback';
import { GameCanvas } from '../game/GameCanvas';
import { input, setKeyBlocker, setTaskMode } from '../input/InputManager';
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
    resetCooldownWatch();
    setKeyBlocker(() => getState().chatOpen);
    setTaskMode(() => !!getState().taskOpen);
    const onLock = () => getState().set({ pointerLocked: !!document.pointerLockElement });
    document.addEventListener('pointerlockchange', onLock);
    const off = input.on((a) => {
      const st = getState();
      // minijogo aberto: as teclas são do minijogo
      if (st.taskOpen && a !== 'escape' && a !== 'pttDown' && a !== 'pttUp' && a !== 'mute') return;
      switch (a) {
        case 'task':
          openTask();
          break;
        case 'notebook':
          st.set({ notebookOpen: !st.notebookOpen, cluesUnread: 0 });
          if (!st.notebookOpen) document.exitPointerLock?.();
          break;
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
          if (st.taskOpen) {
            cancelTask();
            break;
          }
          if (st.notebookOpen) {
            st.set({ notebookOpen: false });
            break;
          }
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
