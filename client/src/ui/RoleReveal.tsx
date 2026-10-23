import { useEffect, useState } from 'react';
import { ROLE_INFO } from '@nevoeiro/shared';
import { serverNow } from '../net/netState';
import { useStore } from '../net/store';

/** Tela de revelação do papel (início da partida) e consulta (Tab / toque no papel). */
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
  return (
    <div className={`overlay reveal ${killer ? 'killer' : 'innocent'}`} onClick={() => phase !== 'reveal' && set({ showRole: false })}>
      <div className="reveal-card">
        <p className="eyebrow">{killer ? '◆ Você é um ASSASSINO' : '◇ Você é INOCENTE'}</p>
        <h1 className="reveal-title" style={{ color: info.color }}>{info.name}</h1>
        <p className="reveal-tag">“{info.tagline}”</p>
        <p className="reveal-desc">{info.description}</p>
        {info.abilities.length > 0 && (
          <ul className="reveal-abilities">
            {info.abilities.map((a) => (
              <li key={a.action}>
                <span className="ab-icon">{a.icon}</span>
                <strong>{a.label}</strong> <span className="muted">· {a.hint}</span>
              </li>
            ))}
          </ul>
        )}
        {killer && role.partners.length > 0 && (
          <div className="partners">
            <span className="eyebrow">Seus parceiros</span>
            {role.partners.map((p) => (
              <div key={p.netId} className="partner">
                {p.name} — <em>{ROLE_INFO[p.role].name}</em>
              </div>
            ))}
            <p className="muted small">Canal secreto: selecione "Assassinos" no chat.</p>
          </div>
        )}
        <p className="reveal-goal">
          {killer
            ? `Objetivo: matar ${role.killsNeeded} de ${role.totalInnocents} inocentes.`
            : `Objetivo: eliminar ou prender os ${role.killers} assassinos antes que matem ${role.killsNeeded} inocentes.`}
        </p>
        {phase === 'reveal' ? (
          <p className="countdown">A névoa se fecha em {left}s…</p>
        ) : (
          <p className="muted small">Toque para fechar</p>
        )}
      </div>
    </div>
  );
}
