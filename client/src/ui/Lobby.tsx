import { useEffect, useState } from 'react';
import { CONFIG, SKINS, killersFor } from '@nevoeiro/shared';
import { leaveRoom, sendBots, sendLobby, sendStart } from '../net/connection';
import { useStore } from '../net/store';
import { MicTest } from './MicTest';
import { SkinSwatch } from './SkinSwatch';

export function Lobby() {
  const { code, players, hostId, sessionId, testMode } = useStore();
  const update = useStore((s) => s.updateSettings);
  const set = useStore((s) => s.set);
  const me = players.find((p) => p.id === sessionId);
  const isHost = hostId === sessionId;
  const bots = players.filter((p) => p.isBot).length;
  const total = players.length;
  const canStart = testMode || total >= CONFIG.players.min;
  const [name, setName] = useState(me?.name ?? '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (me && !name) setName(me.name);
  }, [me, name]);

  const takenSkins = new Set(players.filter((p) => p.id !== sessionId).map((p) => p.skin));

  return (
    <div className="lobby">
      <header className="lobby-head">
        <button className="link" onClick={leaveRoom}>← Sair</button>
        <div className="room-code">
          <span className="eyebrow">Código da sala</span>
          <button
            className="code"
            title="Copiar"
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {code}
          </button>
          <span className="muted small">{copied ? 'Copiado!' : 'Toque para copiar e enviar aos amigos'}</span>
        </div>
        <button className="link" onClick={() => set({ settingsOpen: true })}>⚙ Configurações</button>
      </header>

      <div className="lobby-grid">
        <section className="panel">
          <h2 className="section-title">◇ Jogadores <span className="muted">{total}/{CONFIG.players.max}</span></h2>
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.id} className={p.id === sessionId ? 'me' : ''}>
                <SkinSwatch skin={p.skin} size={26} />
                <span className="pname">{p.name}</span>
                {p.id === hostId && <span className="badge">anfitrião</span>}
                {p.isBot && <span className="badge dim">bot</span>}
                {!p.connected && <span className="badge warn">reconectando</span>}
              </li>
            ))}
          </ul>
          <p className="muted small">
            {total >= CONFIG.players.min
              ? `${killersFor(total)} assassinos nesta partida.`
              : `Mínimo de ${CONFIG.players.min} jogadores${testMode ? ' — no modo de teste, bots completam a sala.' : '.'}`}
          </p>
          {isHost && (
            <div className="host-controls">
              <div className="bots-row">
                <span>Bots</span>
                <button className="btn small" onClick={() => sendBots(Math.max(0, bots - 1))}>−</button>
                <strong>{bots}</strong>
                <button className="btn small" onClick={() => sendBots(bots + 1)}>+</button>
                <button className="btn small ghost" onClick={() => sendBots(Math.max(0, CONFIG.players.min - (total - bots)))}>
                  Completar {CONFIG.players.min}
                </button>
              </div>
              <button className="btn primary big" disabled={!canStart} onClick={sendStart}>
                Iniciar partida
              </button>
            </div>
          )}
          {!isHost && <p className="muted">Aguardando o anfitrião iniciar…</p>}
        </section>

        <section className="panel">
          <h2 className="section-title">◇ Seu personagem</h2>
          <label className="field">
            <span>Nome</span>
            <input
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                sendLobby({ name });
                update({ name });
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <p className="muted small">A aparência é só visual — não revela o seu papel.</p>
          <div className="skin-grid">
            {SKINS.map((s) => (
              <button
                key={s.id}
                className={`skin-btn${me?.skin === s.id ? ' selected' : ''}${takenSkins.has(s.id) ? ' taken' : ''}`}
                title={s.label}
                onClick={() => {
                  sendLobby({ skin: s.id });
                  update({ skin: s.id });
                }}
              >
                <SkinSwatch skin={s.id} size={34} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <h3 className="section-title small">◇ Voz</h3>
          <MicTest />
        </section>
      </div>
    </div>
  );
}
