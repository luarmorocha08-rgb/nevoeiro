import { ROLE_INFO } from '@nevoeiro/shared';
import { leaveRoom, sendReset } from '../net/connection';
import { useStore } from '../net/store';
import { SkinSwatch } from './SkinSwatch';

export function EndScreen() {
  const end = useStore((s) => s.end);
  const isHost = useStore((s) => s.hostId === s.sessionId);
  const myId = useStore((s) => s.role?.netId);
  if (!end) return null;
  const killersWon = end.winner === 'assassinos';
  const mine = end.players.find((p) => p.netId === myId);
  const won = mine ? mine.team === end.winner : false;
  const sorted = [...end.players].sort((a, b) => (a.team === b.team ? 0 : a.team === 'assassinos' ? -1 : 1));
  return (
    <div className={`overlay end ${killersWon ? 'killer' : 'innocent'}`}>
      <div className="end-card">
        <p className="eyebrow">{won ? '◆ Vitória' : '◇ Derrota'} · {Math.floor(end.durationSec / 60)}min {end.durationSec % 60}s</p>
        <h1 className="end-title">{killersWon ? 'Os assassinos venceram' : 'Os inocentes venceram'}</h1>
        <p className="end-reason">{end.reason}</p>
        <div className="end-grid">
          {sorted.map((p) => {
            const info = ROLE_INFO[p.role];
            return (
              <div key={p.netId} className={`end-player ${p.team} ${p.status}${p.netId === myId ? ' me' : ''}`}>
                <SkinSwatch skin={p.skin} size={28} />
                <div>
                  <div className="pname">{p.name}</div>
                  <div className="prole" style={{ color: info.color }}>{info.name}</div>
                </div>
                <span className={`status ${p.status}`}>{p.status === 'vivo' ? 'vivo' : p.status === 'preso' ? 'preso' : '✝'}</span>
              </div>
            );
          })}
        </div>
        <details className="timeline">
          <summary>Linha do tempo</summary>
          <ul>
            {end.timeline.map((t, i) => (
              <li key={i}>
                <span className="muted">{Math.floor(t.t / 60)}:{String(t.t % 60).padStart(2, '0')}</span> {t.text}
              </li>
            ))}
          </ul>
        </details>
        <div className="end-actions">
          {isHost ? (
            <button className="btn primary" onClick={sendReset}>Voltar ao lobby</button>
          ) : (
            <span className="muted">Aguardando o anfitrião…</span>
          )}
          <button className="btn ghost" onClick={leaveRoom}>Sair da sala</button>
        </div>
      </div>
    </div>
  );
}
