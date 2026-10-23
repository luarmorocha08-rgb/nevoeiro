import { getSkin } from '@nevoeiro/shared';

/** Mini figura da skin (cabeça, tronco e pernas nas cores do personagem). */
export function SkinSwatch({ skin, size = 44 }: { skin: string; size?: number }) {
  const s = getSkin(skin);
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" aria-hidden="true" className="skin-swatch">
      <rect x="12" y="34" width="7" height="18" rx="3" fill={s.bottom} />
      <rect x="21" y="34" width="7" height="18" rx="3" fill={s.bottom} />
      <rect x="11" y="51" width="8" height="4" rx="1.5" fill={s.shoes} />
      <rect x="21" y="51" width="8" height="4" rx="1.5" fill={s.shoes} />
      <rect x="9" y="17" width="22" height="20" rx="8" fill={s.top} />
      <rect x="4" y="18" width="6" height="16" rx="3" fill={s.top} />
      <rect x="30" y="18" width="6" height="16" rx="3" fill={s.top} />
      <circle cx="20" cy="10" r="7" fill={s.skinTone} />
      <path d="M13 9 a7 7 0 0 1 14 0 q-7 -3 -14 0z" fill={s.hair} />
    </svg>
  );
}
