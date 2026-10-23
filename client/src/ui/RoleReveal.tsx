import { useEffect, useState, type CSSProperties } from 'react';
import { ROLE_INFO } from '@nevoeiro/shared';
import { serverNow } from '../net/netState';
import { useStore } from '../net/store';
import { roleColor, teamColor } from '../theme';
import { Icon } from './Icons';

/** Revelação do papel: carta que vira com a cor do papel (início da partida e Tab). */
export function RoleReveal() {
  const role = useStore((s) => s.role);
  const show = useStore((s) => s.showRole);
  const phase = useStore((s) => s.phase);
  const revealEndsAt = useStore((s) => s.revealEndsAt);
  const set = useStore((s) => s.set);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (phase !== 'reveal') return;
    const h = setInterval(() => setLeft(Math.max(0, Math.ceil((revealEndsAt - serverNow()) / 1000))), 250);
    return () => clearInterval(h);
  }, [phase, revealEndsAt]);

  if (!role || !show) return null;
  const info = ROLE_INFO[role.role];
  const killer = info.team === 'assassinos';
  const color = roleColor(role.role);
  return (
    <div className="overlay reveal" onClick={() => phase !== 'reveal' && set({ showRole: false })}>
      {/* key: a carta vira de novo a cada rodada */}
      <div className="flip-card" key={role.round}>
        <div className="card-face card-back">N</div>
        <div className="card-face card-front" style={{ '--c': color } as CSSProperties}>
          {role.totalRounds > 1 && (
            <p className="round-tag">Rodada {role.round} de {role.totalRounds}{role.round > 1 ? ' · papel novo' : ''}</p>
          )}
          <p className="eyebrow" style={{ color: teamColor(info.team) }}>
            {killer ? '◆ Você é um ASSASSINO' : '● Você é INOCENTE'}
          </p>
          <div className="card-sigil">
            <Icon name={role.role} size={52} strokeWidth={1.4} />
          </div>
          <h1 className="reveal-title">{info.name}</h1>
          <p className="reveal-tag">“{info.tagline}”</p>
          <p className="reveal-desc">{info.description}</p>
          {info.abilities.length > 0 && (
            <ul className="reveal-abilities">
              {info.abilities.map((a, i) => (
                <li key={a.action}>
                  <Icon name={a.action} size={18} color={color} />
                  <strong>{a.label}</strong> <span className="muted">· {['Q', 'E'][i]} · {a.hint}</span>
                </li>
              ))}
            </ul>
          )}
          {killer && role.partners.length > 0 && (
            <div className="partners">
              <span className="eyebrow">Seus parceiros</span>
              {role.partners.map((p) => (
                <div key={p.netId} className="partner">
                  ◆ {p.name} — <em style={{ color: roleColor(p.role) }}>{ROLE_INFO[p.role].name}</em>
                </div>
              ))}
              <p className="muted small">Canal secreto: selecione "Assassinos" no chat.</p>
            </div>
          )}
          <p className="reveal-goal">
            {killer
              ? `Objetivo: matar ${role.killsNeeded} de ${role.totalInnocents} inocentes antes que a vila termine as tarefas.`
              : `Objetivo: terminar as tarefas da vila ou eliminar os ${role.killers} assassinos antes que matem ${role.killsNeeded} inocentes.`}
          </p>
          {phase === 'reveal' ? <p className="countdown">A névoa se fecha em {left}s…</p> : <p className="countdown">Toque para fechar</p>}
        </div>
      </div>
    </div>
  );
}
