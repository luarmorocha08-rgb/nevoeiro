import { useState } from 'react';
import { SKINS } from '@nevoeiro/shared';
import { unlockAudio } from '../audio/sfx';
import { createRoom, joinRoom, serverUrl } from '../net/connection';
import { startOffline } from '../net/offline';
import { useStore } from '../net/store';
import { isTouchDevice } from '../quality';
import { useOrientation } from './useOrientation';

export function Home() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const conn = useStore((s) => s.conn);
  const error = useStore((s) => s.connError);
  const set = useStore((s) => s.set);
  const [code, setCode] = useState('');
  const [name, setName] = useState(settings.name);
  const busy = conn === 'connecting' || conn === 'reconnecting';

  const opts = () => {
    unlockAudio();
    const n = name.trim() || 'Viajante';
    const skin = settings.skin || SKINS[Math.floor(Math.random() * SKINS.length)].id;
    update({ name: n, skin });
    return { name: n, skin };
  };

  const orientation = useOrientation();
  return (
    <div className="home">
      {isTouchDevice() && orientation === 'portrait' && (
        <p className="rotate-hint" role="note">⟲ Vire o celular para jogar melhor (opcional)</p>
      )}
      <div className="home-inner">
        <p className="eyebrow">◇ Uma vila. Uma noite. Ninguém é quem parece.</p>
        <h1 className="logo">
          <span className="logo-n">N</span>EVOEIRO
        </h1>
        <p className="subtitle">Dedução social em 3D · inocentes x assassinos sobrenaturais</p>

        <div className="panel home-panel">
          <label className="field">
            <span>Seu nome</span>
            <input value={name} maxLength={16} placeholder="Viajante" onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="home-actions">
            <button className="btn primary" disabled={busy} onClick={() => createRoom(opts())}>
              Criar sala
            </button>
            <div className="join-row">
              <input
                className="code-input"
                value={code}
                maxLength={5}
                placeholder="CÓDIGO"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && code.length >= 4 && joinRoom(code, opts())}
              />
              <button className="btn" disabled={busy || code.length < 4} onClick={() => joinRoom(code, opts())}>
                Entrar
              </button>
            </div>
            <button className="btn ghost" disabled={busy} onClick={() => createRoom({ ...opts(), testMode: true })}>
              ◈ Modo de teste (com bots)
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                const o = opts();
                startOffline(o.name, o.skin);
              }}
            >
              ◇ Jogar offline contra bots (sem servidor)
            </button>
          </div>

          {busy && <p className="muted">Conectando a {serverUrl()}…</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <div className="home-foot">
          <button className="link" onClick={() => set({ settingsOpen: true })}>Configurações</button>
          <span>·</span>
          <span className="muted">Servidor: {serverUrl()}</span>
        </div>
      </div>
    </div>
  );
}
