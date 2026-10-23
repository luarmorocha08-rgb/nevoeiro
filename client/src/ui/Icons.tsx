/**
 * Ícones próprios (SVG de traço, 24×24) para papéis, habilidades e HUD.
 * Formas distintas por papel/ação: funcionam também para daltônicos (não dependem da cor).
 */
import type { ActionType, RoleId } from '@nevoeiro/shared';
import type { CSSProperties, ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  // ---- papéis
  metamorfo: (
    <>
      <path d="M4 7c3-2 5-2 8 0 3-2 5-2 8 0v5c0 4-3 7-8 8-5-1-8-4-8-8z" />
      <path d="M8 11h2M14 11h2M9 15c2 1.3 4 1.3 6 0" />
    </>
  ),
  fantasma: (
    <>
      <path d="M5 21V11a7 7 0 0 1 14 0v10l-2.5-2-2.5 2-2-2-2 2-2.5-2z" />
      <path d="M9.5 11v1.5M14.5 11v1.5" />
    </>
  ),
  zumbi: (
    <>
      <path d="M12 3c-4 0-7 3-7 7 0 2.5 1 4 2.5 5v3h9v-3c1.5-1 2.5-2.5 2.5-5 0-4-3-7-7-7z" />
      <path d="M9 10.5l2 1.5M15 10.5l-2 1.5M10 18v3M14 18v3" />
    </>
  ),
  teleportador: (
    <>
      <path d="M12 4a8 8 0 1 1-8 8" />
      <path d="M12 8a4 4 0 1 1-4 4" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  xerife: (
    <>
      <path d="M12 2.5l2.4 4.6 5.1.8-3.7 3.6.9 5.1L12 14.2l-4.7 2.4.9-5.1-3.7-3.6 5.1-.8z" />
      <circle cx="12" cy="10.5" r="1.6" />
      <path d="M8 20h8" />
    </>
  ),
  detetive: (
    <>
      <circle cx="10" cy="10" r="5.5" />
      <path d="M14 14l6 6M7.5 9.5a2.8 2.8 0 0 1 2.5-2" />
    </>
  ),
  anjo: (
    <>
      <ellipse cx="12" cy="4.5" rx="4" ry="1.4" />
      <path d="M12 9v11M12 11c-2-2-6-2.5-9-1 1.5 3 4.5 5 9 5M12 11c2-2 6-2.5 9-1-1.5 3-4.5 5-9 5" />
    </>
  ),
  rastreador: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3V1.5M18.5 5l1-1M5.5 5l-1-1" />
    </>
  ),
  civil: (
    <>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
    </>
  ),
  // ---- ações
  kill: (
    <>
      <path d="M14.5 3.5l6 6-9 9-3-3z" />
      <path d="M8.5 15.5l-3 3M4 17l3 3M17.5 6.5l-6 6" />
    </>
  ),
  morph: (
    <>
      <path d="M3 8c2.5-1.6 4.5-1.6 7 0v4c0 3-2 5-3.5 5.5C5 17 3 15 3 12z" />
      <path d="M14 8c2.5-1.6 4.5-1.6 7 0v4c0 3-2 5-3.5 5.5C16 17 14 15 14 12z" />
      <path d="M10.5 6.5l3 3M13.5 6.5l-3 3" />
    </>
  ),
  invisible: (
    <>
      <path d="M5 21V11a7 7 0 0 1 14 0v10" strokeDasharray="2.5 2.5" />
      <path d="M3 3l18 18" />
    </>
  ),
  teleport: (
    <>
      <ellipse cx="12" cy="18" rx="7" ry="2.5" />
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M12 8.5v7M9.5 13l2.5 2.5 2.5-2.5" />
    </>
  ),
  shoot: (
    <>
      <path d="M3 8h14l2 2h2v3h-6l-1 2h-3l1-3H8l-1 6H4l1-6H3z" />
      <path d="M11 13v2" />
    </>
  ),
  examine: (
    <>
      <circle cx="10" cy="10" r="5.5" />
      <path d="M14 14l6 6" />
      <path d="M10 7.5v5M7.5 10h5" />
    </>
  ),
  cuff: (
    <>
      <circle cx="7" cy="14" r="4" />
      <circle cx="17" cy="14" r="4" />
      <path d="M10 11l1.5-3h1L14 11M7 10V8M17 10V8" />
    </>
  ),
  revive: (
    <>
      <path d="M12 21V8M7.5 12.5L12 8l4.5 4.5" />
      <ellipse cx="12" cy="4" rx="4" ry="1.4" />
      <path d="M5 18h3M16 18h3" />
    </>
  ),
  thermal: (
    <>
      <path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />
      <path d="M12 9v7" />
      <path d="M18 5h3M18 9h2" />
    </>
  ),
  // ---- HUD
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  micOff: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M3 3l18 18" />
    </>
  ),
  map: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  run: (
    <>
      <circle cx="14" cy="4.5" r="2" />
      <path d="M6 21l3.5-6 3 2.5V22M9.5 15l1.5-6 4 2.5 3 .5M11 9l-4 1-1 3" />
    </>
  ),
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  skull: (
    <>
      <path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.6 3 5.6V20h10v-3.4c1.7-1 3-3 3-5.6a8 8 0 0 0-8-8z" />
      <circle cx="9" cy="11" r="1.6" />
      <circle cx="15" cy="11" r="1.6" />
      <path d="M10.5 20v-2M13.5 20v-2" />
    </>
  ),
  cross: <path d="M12 3v18M7 8h10" />,
  star: <path d="M12 3l2 6h6l-5 3.8 2 6.2-5-4-5 4 2-6.2L4 9h6z" />,
  chain: (
    <>
      <rect x="2.5" y="9" width="9" height="6" rx="3" />
      <rect x="12.5" y="9" width="9" height="6" rx="3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  hide: (
    <>
      <path d="M4 20V8l8-5 8 5v12z" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  // ---- tarefas
  lamp: (
    <>
      <path d="M9 4h6l1 3H8zM8 7h8v8a4 4 0 0 1-8 0z" />
      <path d="M12 10c-1 1.4-1 2.6 0 3.6 1-1 1-2.2 0-3.6zM12 19v3M9 22h6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z" />
      <path d="M10 21a2 2 0 0 0 4 0M12 3v2" />
    </>
  ),
  water: (
    <>
      <path d="M12 3c3.5 4.5 6 7.6 6 10.6a6 6 0 0 1-12 0C6 10.6 8.5 7.5 12 3z" />
      <path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.5" />
    </>
  ),
  hay: (
    <>
      <path d="M4 20l3-12h10l3 12z" />
      <path d="M8 12h8M7 16h10M10 8l-1-4M14 8l1-4M12 8V3" />
    </>
  ),
  barrel: (
    <>
      <path d="M7 3h10c1.5 3 1.5 15 0 18H7C5.5 18 5.5 6 7 3z" />
      <path d="M6 8h12M6 16h12" />
    </>
  ),
  papers: (
    <>
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v4h4M10 11h6M10 15h6M4 6v15h12" />
    </>
  ),
  grave: (
    <>
      <path d="M7 21V9a5 5 0 0 1 10 0v12" />
      <path d="M4 21h16M12 9v6M9.5 11.5h5" />
    </>
  ),
  herb: (
    <>
      <path d="M12 21V9" />
      <path d="M12 13c-4 0-6-2.5-6-6 4 0 6 2.5 6 6zM12 10c0-3.5 2-6 6-6 0 3.5-2 6-6 6zM12 17c3 0 5-1.6 5-4-3 0-5 1.6-5 4z" />
    </>
  ),
  fire: (
    <>
      <path d="M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .3 1.6 1 2.5 2 3 .8-2.6.5-5.4.5-8.5z" />
      <path d="M4 21h16" />
    </>
  ),
  fence: (
    <>
      <path d="M5 21V6l2-2 2 2v15M15 21V6l2-2 2 2v15M3 10h18M3 16h18" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  tasks: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M4 18h2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
};

export type IconName = RoleId | ActionType | keyof typeof PATHS;

export function Icon({
  name,
  size = 22,
  color = 'currentColor',
  strokeWidth = 1.7,
  style,
  title,
}: {
  name: IconName | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className="icon"
    >
      {title && <title>{title}</title>}
      {PATHS[name] ?? PATHS.civil}
    </svg>
  );
}
