/**
 * Skins são APENAS visuais — nunca revelam o papel.
 * As cores seguem a arte de referência dos personagens. Quando o modelo final existir,
 * coloque /client/assets/characters/<id>.glb e ele substitui a cápsula automaticamente.
 */
export interface SkinDef {
  id: string;
  label: string;
  top: string;
  bottom: string;
  skinTone: string;
  hair: string;
  shoes: string;
}

export const SKINS: SkinDef[] = [
  { id: 'capuz-vinho', label: 'Capuz vinho', top: '#8e3b2f', bottom: '#3d5a80', skinTone: '#d9a585', hair: '#4a2f1f', shoes: '#e8e6e1' },
  { id: 'camisa-petroleo', label: 'Camisa petróleo', top: '#2f6f73', bottom: '#2b2b2e', skinTone: '#e0b48f', hair: '#1a1a1a', shoes: '#e8e6e1' },
  { id: 'sueter-mostarda', label: 'Suéter mostarda', top: '#c99a2e', bottom: '#59613f', skinTone: '#5a3b28', hair: '#111111', shoes: '#e8e6e1' },
  { id: 'cardigan-lavanda', label: 'Cardigã lavanda', top: '#a58fd0', bottom: '#8fb0d3', skinTone: '#edc9a8', hair: '#e6d29a', shoes: '#e8e6e1' },
  { id: 'camisa-marinho', label: 'Camisa marinho', top: '#26365e', bottom: '#c8b48e', skinTone: '#e6b98f', hair: '#111111', shoes: '#e8e6e1' },
  { id: 'trico-verde', label: 'Tricô verde', top: '#2f5e45', bottom: '#ddd3bf', skinTone: '#c98e66', hair: '#2b1a12', shoes: '#4a3022' },
  { id: 'camisa-salmao', label: 'Camisa salmão', top: '#c9766a', bottom: '#3e5f8a', skinTone: '#e1b08a', hair: '#8a6136', shoes: '#4a3022' },
  { id: 'blusa-malva', label: 'Blusa malva', top: '#9c5a5f', bottom: '#2e2e31', skinTone: '#e8c09c', hair: '#0f0f0f', shoes: '#141414' },
  { id: 'moletom-roxo', label: 'Moletom roxo', top: '#5a2e6b', bottom: '#4a4a4c', skinTone: '#8a5a3c', hair: '#1d120c', shoes: '#e8e6e1' },
  { id: 'jaqueta-jeans', label: 'Jaqueta jeans', top: '#6f93be', bottom: '#343438', skinTone: '#ddb08a', hair: '#2e1d12', shoes: '#e8e6e1' },
  { id: 'gola-creme', label: 'Gola alta creme', top: '#e9e1d0', bottom: '#5a3a26', skinTone: '#edcaa8', hair: '#111111', shoes: '#141414' },
  { id: 'bomber-oliva', label: 'Bomber oliva', top: '#5b6b3c', bottom: '#262628', skinTone: '#4a2e1e', hair: '#111111', shoes: '#8a7a62' },
  { id: 'jaqueta-caramelo', label: 'Jaqueta caramelo', top: '#8a5530', bottom: '#2c3e5c', skinTone: '#d9a37e', hair: '#3b2617', shoes: '#4a3022' },
  { id: 'camisa-esmeralda', label: 'Camisa esmeralda', top: '#1e6b5c', bottom: '#88a9cf', skinTone: '#c8926a', hair: '#141010', shoes: '#e8e6e1' },
  { id: 'sueter-cinza', label: 'Suéter cinza', top: '#6b6b6b', bottom: '#333336', skinTone: '#dcae8b', hair: '#3a2a1f', shoes: '#e8e6e1' },
  { id: 'cardigan-laranja', label: 'Cardigã laranja', top: '#c8652a', bottom: '#5b6640', skinTone: '#f0c8a8', hair: '#9c4a26', shoes: '#4a3022' },
];

export const SKIN_IDS = SKINS.map((s) => s.id);

export function getSkin(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

export function isValidSkin(id: unknown): id is string {
  return typeof id === 'string' && SKIN_IDS.includes(id);
}
