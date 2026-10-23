import { CONFIG, ROLE_INFO } from '@nevoeiro/shared';
import { triggerAbility } from '../game/abilities';
import { useStore } from '../net/store';

/** Botões de habilidade com recarga visual (funciona com mouse, toque e teclas Q/E). */
export function AbilityBar({ touch }: { touch: boolean }) {
  const role = useStore((s) => s.role);
  const you = useStore((s) => s.you);
  const target = useStore((s) => s.target);
  const bodyTarget = useStore((s) => s.bodyTarget);
  if (!role || !you?.alive) return null;
  const info = ROLE_INFO[role.role];
  const keys = ['Q', 'E'];

  return (
    <div className={`ability-bar${touch ? ' touch' : ''}`}>
      {info.abilities.map((a, i) => {
        const st = you.abilities.find((x) => x.action === a.action);
        const cdMs = st?.cd ?? 0;
        const total = cooldownTotal(a.action);
        const frac = total > 0 ? Math.min(1, cdMs / (total * 1000)) : 0;
        const active = (st?.active ?? 0) > 0;
        const blocked = !!st?.blocked;
        const ready = cdMs <= 0 && !blocked;
        const t = a.target === 'player' ? target : a.target === 'body' ? bodyTarget : null;
        const hasTarget = a.target === 'none' || a.target === 'point' || !!t;
        return (
          <button
            key={a.action}
            className={`ability${ready ? ' ready' : ''}${active ? ' active' : ''}${blocked ? ' blocked' : ''}${ready && hasTarget ? ' armed' : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerAbility(i);
            }}
            title={`${a.label} — ${a.hint}`}
          >
            <span className="ab-icon">{a.icon}</span>
            <span className="ab-label">{a.label}</span>
            {!touch && <span className="ab-key">{keys[i]}</span>}
            {cdMs > 0 && (
              <span className="ab-cd" style={{ background: `conic-gradient(rgba(5,8,9,.82) ${frac * 360}deg, transparent 0)` }}>
                {Math.ceil(cdMs / 1000)}
              </span>
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

function cooldownTotal(action: string): number {
  const R = CONFIG.roles;
  switch (action) {
    case 'kill': return CONFIG.kill.cooldown;
    case 'morph': return R.metamorfo.cooldown;
    case 'invisible': return R.fantasma.cooldown;
    case 'teleport': return R.teleportador.cooldown;
    case 'shoot': return R.xerife.cooldown;
    case 'cuff': return R.detetive.wrongCuffPenalty;
    case 'thermal': return R.rastreador.cooldown;
    default: return CONFIG.match.initialCooldown;
  }
}
