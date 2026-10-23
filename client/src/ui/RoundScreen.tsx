/**
 * Intervalo entre rodadas: quem venceu, quem era quem (papéis revelados), placar parcial
 * e contagem para a próxima rodada — onde todos voltam vivos com papéis novos.
 */
import { useEffect, useState } from 'react';
import { ROLE_INFO, type ScoreRow } from '@nevoeiro/shared';
import { serverNow } from '../net/netState';
import { useStore } from '../net/store';
import { roleColor } from '../theme';
import { Icon } from './Icons';
import { SkinSwatch } from './SkinSwatch';

export function RoundScreen() {
  const r = useStore((s) => s.roundResult);
  const phase = useStore((s) => s.phase);
  const myId = useStore((s) => s.role?.netId);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!r?.nextAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((r.nextAt - serverNow()) / 1000)));
    tick();
    const h = setInterval(tick, 250);
    return () => clearInterval(h);
  }, [r]);
  if (!r || phase !== 'intermission') return null;
  const killersWon = r.winner === 'assassinos';
  const mine = r.players.find((p) => p.netId === myId);
  const won = mine ? mine.team === r.winner : false;
  const killers = r.players.filter((p) => p.team === 'assassinos');
  return (
    <div className={`overlay round-screen ${killersWon ? 'killer' : 'innocent'}`}>
      <div className="round-card panel">
        <p className="eyebrow">Fim da rodada {r.round} de {r.totalRounds} · {won ? '◆ seu time venceu' : '◇ seu time perdeu'}</p>
        <h1 className="end-title">{killersWon ? 'Os assassinos venceram a rodada' : 'Os inocentes venceram a rodada'}</h1>
        <p className="end-reason">{r.reason}</p>
        <div className="round-cols">
          <section>
            <h4>Os assassinos eram</h4>
            {killers.map((p) => (
              <div key={p.netId} className={`round-killer${p.netId === myId ? ' me' : ''}`}>
                <SkinSwatch skin={p.skin} size={22} />
                <span>{p.name}</span>
                <em style={{ color: roleColor(p.role) }}><Icon name={p.role} size={13} /> {ROLE_INFO[p.role].name}</em>
              </div>
            ))}
          </section>
          <section>
            <h4>Placar</h4>
            <Scoreboard rows={r.scores} myId={myId} limit={6} />
          </section>
        </div>
        <p className="round-next">
          Rodada {r.round + 1} em <strong>{left}s</strong> — todos voltam vivos e os papéis são sorteados de novo.
        </p>
      </div>
    </div>
  );
}

export function Scoreboard({ rows, myId, limit }: { rows: ScoreRow[]; myId?: string; limit?: number }) {
  const list = limit ? rows.slice(0, limit) : rows;
  const meIdx = rows.findIndex((r) => r.netId === myId);
  return (
    <ol className="scoreboard">
      {list.map((r, i) => (
        <li key={r.netId} className={r.netId === myId ? 'me' : ''}>
          <span className="pos">{i + 1}º</span>
          <SkinSwatch skin={r.skin} size={18} />
          <span className="sname">{r.name}</span>
          <span className="pts">{r.points} pts</span>
        </li>
      ))}
      {limit && meIdx >= limit && (
        <li className="me">
          <span className="pos">{meIdx + 1}º</span>
          <SkinSwatch skin={rows[meIdx].skin} size={18} />
          <span className="sname">{rows[meIdx].name}</span>
          <span className="pts">{rows[meIdx].points} pts</span>
        </li>
      )}
    </ol>
  );
}
