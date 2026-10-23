import { useEffect } from 'react';
import { unlockAudio } from './audio/sfx';
import { tryResume } from './net/connection';
import { useStore } from './net/store';
import { GameScreen } from './ui/GameScreen';
import { Home } from './ui/Home';
import { Lobby } from './ui/Lobby';
import { SettingsModal } from './ui/Settings';

export function App() {
  const screen = useStore((s) => s.screen);
  const conn = useStore((s) => s.conn);

  useEffect(() => {
    void tryResume();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <>
      {screen === 'home' && <Home />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <GameScreen />}
      {screen !== 'game' && conn === 'reconnecting' && (
        <div className="overlay reconnect">
          <div className="panel">
            <h2>Reconectando…</h2>
            <div className="spinner" />
          </div>
        </div>
      )}
      <SettingsModal />
    </>
  );
}
