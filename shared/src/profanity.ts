/**
 * Filtro básico de palavrões (PT/EN). O servidor sempre aplica; o cliente pode aplicar antes.
 * Ampliar a lista conforme a comunidade. Ignora acentos e repetições ("caaaralho").
 */
const WORDS = [
  'porra', 'caralho', 'merda', 'puta', 'puto', 'foda', 'fodase', 'foder', 'fdp', 'cu', 'buceta',
  'viado', 'arrombado', 'desgraca', 'otario', 'babaca', 'cacete', 'piranha', 'vagabunda', 'vsf', 'pqp',
  'corno', 'bosta', 'retardado', 'fuck', 'shit', 'bitch', 'cunt', 'dick', 'asshole', 'nigger', 'faggot',
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/(.)\1{2,}/g, '$1');
}

const dedupe = (s: string) => s.replace(/(.)\1+/g, '$1');

export function filterProfanity(text: string): string {
  return text.replace(/[\p{L}\p{N}@$!]+/gu, (word) => {
    const n = dedupe(normalize(word));
    const hit = WORDS.some((w) => {
      const d = dedupe(w);
      return n === d || (d.length >= 5 && n.includes(d));
    });
    return hit ? '*'.repeat(word.length) : word;
  });
}

/** Limpa e limita um nome de jogador. */
export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const clean = filterProfanity(s.replace(/[^\p{L}\p{N} _.-]/gu, '').trim()).slice(0, 16);
  return clean || 'Viajante';
}
