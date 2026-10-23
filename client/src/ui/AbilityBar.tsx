import type { CSSProperties } from 'react';
import { ROLE_INFO } from '@nevoeiro/shared';
import { triggerAbility } from '../game/abilities';
import { useStore } from '../net/store';
import { roleColor } from '../theme';
import { Icon } from './Icons';

/** Botões de habilidade: anel radial de recarga, contagem, pulso quando volta (mouse, toque, Q/E). */
export function AbilityBar({ touch }: { touch: boolean }) {
  const role = useStore((s) => s.role);
  const you = useStore((s) => s.you);
  const target = useStore((s) => s.target);
  const bodyTarget = useStore((s) => s.bodyTarget);
  const flash = useStore((s) => s.readyFlash);
  if (!role || !you?.alive) return null;
  const info = ROLE_INFO[role.role];
  const keys = ['Q', 'E'];
  const color = roleColor(role.role);

  return (
    <div className={`ability-bar${touch ? ' touch' : ''}`}>
      {info.abilities.map((a, i) => {
        const st = you.abilities.find((x) => x.action === a.action);
        const cdMs = st?.cd ?? 0;
        const total = cooldownTotal(a.action, cdMs);
        const frac = total > 0 ? Math.min(1, cdMs / total) : 0;
        const active = (st?.active ?? 0) > 0;
        const blocked = !!st?.blocked;
        const ready = cdMs <= 0 && !blocked;
        const t = a.target === 'player' ? target : a.target === 'body' ? bodyTarget : null;
        const hasTarget = a.target === 'none' || a.target === 'point' || !!t;
        const flashing = flash?.action === a.action && Date.now() - flash.at < 900;
        const style = { '--c': color } as CSSProperties;
        return (
          <button
            key={a.action}
            style={style}
            className={`ability${ready ? ' ready' : ''}${active ? ' active' : ''}${blocked ? ' blocked' : ''}${ready && hasTarget ? ' armed' : ''}${flashing ? ' flash' : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerAbility(i);
            }}
            title={`${a.label} — ${a.hint}`}
            aria-label={`${a.label}${cdMs > 0 ? `, recarregando ${Math.ceil(cdMs / 1000)} segundos` : ready ? ', pronta' : ''}`}
          >
            <Icon name={a.action} size={touch ? 30 : 28} />
            <span className="ab-label">{a.label}</span>
            {!touch && <span className="ab-key">{keys[i]}</span>}
            {cdMs > 0 && (
              <>
                <span
                  className="ab-ring"
                  style={{ background: `conic-gradient(from 0deg, ${color} ${(1 - frac) * 360}deg, rgba(255,255,255,0.08) 0)`, WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))', mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))' }}
                />
                <span className="ab-cd" style={{ background: `rgba(11,15,26,${0.35 + frac * 0.45})` }}>{Math.ceil(cdMs / 1000)}</span>
              </>
            )}
            {active && <span className="ab-active">{Math.ceil((st?.active ?? 0) / 1000)}s</span>}
            {st?.uses !== undefined && <span className="ab-uses">×{st.uses}</span>}
            {blocked && <span className="ab-blocked">{st?.blocked}</span>}
            {t && ready && <span className="ab-target">{t.name}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Duração total da recarga atual (para o anel): o maior valor visto desde que ela começou.
 *  Cobre a recarga inicial da partida e a punição da algema sem números fixos. */
const maxSeen = new Map<string, number>();
function cooldownTotal(action: string, cdMs: number): number {
  if (cdMs <= 0) {
    maxSeen.set(action, 0);
    return 1;
  }
  const next = Math.max(maxSeen.get(action) ?? 0, cdMs);
  maxSeen.set(action, next);
  return next;
}
