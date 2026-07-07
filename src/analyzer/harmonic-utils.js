// [Claude] — 2026-07-07 — Utilitaires harmoniques partagés entre analyseurs.
// Centralise la logique de classification d'accords (dominante, mineur, majeur)
// et les helpers de degrés pour éviter la duplication entre substitutions.js
// et harmonic-patterns.js.

export const DEGREE_NAMES_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
export const DEGREE_NAMES_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

export function isMinorSymbol(symbol) {
  if (!symbol) return false;
  return /^(m(?=\d|\/|add|sus|$)|min|mi(?=\d|\/|add|sus|$)|-)/i.test(symbol);
}

export function isDominantSymbol(symbol) {
  if (!symbol || isMinorSymbol(symbol)) return false;
  return /^(7|9|13|dim|°)/i.test(symbol) || (/7/.test(symbol) && !/maj/i.test(symbol));
}

export function isMajorSymbol(symbol) {
  return !isMinorSymbol(symbol) && !isDominantSymbol(symbol);
}

export function degreeOf(rootPc, keyPc) {
  return (rootPc - keyPc + 12) % 12;
}

export function degreeName(rootPc, keyPc, mode = 'major') {
  const degree = degreeOf(rootPc, keyPc);
  const names = mode === 'minor' ? DEGREE_NAMES_MINOR : DEGREE_NAMES_MAJOR;
  return names[degree] || String(degree);
}

export function formatChordBrief(chord) {
  if (!chord) return '—';
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const root = NOTE_NAMES[chord.rootPc % 12] || '?';
  const bass = chord.bassPc != null && chord.bassPc !== chord.rootPc
    ? `/${NOTE_NAMES[chord.bassPc % 12] || '?'}`
    : '';
  return `${root}${chord.symbol || ''}${bass}`;
}
