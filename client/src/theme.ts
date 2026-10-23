/**
 * Paleta e identidade visual do Nevoeiro — fonte única de cores para a UI (via CSS vars)
 * e para a cena 3D. Mude aqui e tudo acompanha.
 */
import type { RoleId, Team } from '@nevoeiro/shared';

export const THEME = {
  night: '#0B0F1A',
  night2: '#141B2D',
  fog: '#8A97B0',
  warmLight: '#F2A65A',
  moonlight: '#A9C4FF',
  text: '#E8ECF4',
  textMuted: '#8A93A6',
  /** Inocentes (verde‑água) e assassinos (vermelho — só aparece para assassinos). */
  team: {
    inocentes: '#4FC3A1',
    assassinos: '#E5484D',
  } satisfies Record<Team, string>,
  /** Destaque de cada papel: só no ícone e no efeito da habilidade. */
  role: {
    metamorfo: '#B07CFF',
    fantasma: '#C9D6E8',
    zumbi: '#7BC74D',
    teleportador: '#3FB6FF',
    xerife: '#E8B04A',
    detetive: '#D9C27A',
    anjo: '#FFE7A3',
    rastreador: '#FF6B3D',
    civil: '#8A93A6',
  } satisfies Record<RoleId, string>,
  alert: {
    death: '#7A1E24',
    deathText: '#FFB3B6',
    revive: '#E8B04A',
    arrest: '#6FA8DC',
  },
  /** Cores usadas só na cena 3D. */
  scene: {
    background: '#0B0F1A',
    /** cor da neblina exponencial (mistura da noite com a névoa) */
    fogFar: '#1A2233',
    ground: '#1B2620',
    windowLit: '#F2A65A',
    ember: '#FF8A3D',
    firefly: '#D7F27A',
    blood: '#4A0B10',
  },
} as const;

export function roleColor(id?: string | null): string {
  return (id && (THEME.role as Record<string, string>)[id]) || THEME.textMuted;
}

export function teamColor(team?: Team | null): string {
  return team ? THEME.team[team] : THEME.textMuted;
}

/** Converte "#RRGGBB" em "r, g, b" para usar em rgba() no CSS. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Publica a paleta como variáveis CSS (chamado uma vez no início). */
export function applyThemeCss(): void {
  const r = document.documentElement.style;
  r.setProperty('--night', THEME.night);
  r.setProperty('--night-2', THEME.night2);
  r.setProperty('--night-rgb', rgb(THEME.night));
  r.setProperty('--night-2-rgb', rgb(THEME.night2));
  r.setProperty('--fog', THEME.fog);
  r.setProperty('--fog-rgb', rgb(THEME.fog));
  r.setProperty('--warm', THEME.warmLight);
  r.setProperty('--warm-rgb', rgb(THEME.warmLight));
  r.setProperty('--moon', THEME.moonlight);
  r.setProperty('--moon-rgb', rgb(THEME.moonlight));
  r.setProperty('--text', THEME.text);
  r.setProperty('--muted', THEME.textMuted);
  r.setProperty('--innocent', THEME.team.inocentes);
  r.setProperty('--innocent-rgb', rgb(THEME.team.inocentes));
  r.setProperty('--killer', THEME.team.assassinos);
  r.setProperty('--killer-rgb', rgb(THEME.team.assassinos));
  r.setProperty('--death', THEME.alert.death);
  r.setProperty('--death-rgb', rgb(THEME.alert.death));
  r.setProperty('--death-text', THEME.alert.deathText);
  r.setProperty('--gold', THEME.alert.revive);
  r.setProperty('--gold-rgb', rgb(THEME.alert.revive));
  r.setProperty('--arrest', THEME.alert.arrest);
  for (const [id, c] of Object.entries(THEME.role)) {
    r.setProperty(`--role-${id}`, c);
    r.setProperty(`--role-${id}-rgb`, rgb(c));
  }
}
