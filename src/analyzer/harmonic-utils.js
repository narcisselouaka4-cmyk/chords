// [Claude] — 2026-07-07 — Utilitaires harmoniques partagés entre analyseurs.
// Centralise la logique de classification d'accords (dominante, mineur, majeur)
// et les helpers de degrés pour éviter la duplication entre substitutions.js
// et harmonic-patterns.js.

// [Claude] — 2026-09-25 — Tables de degrés indexées par ÉCART EN DEMI-TONS (0..11),
// et non par degré diatonique. `degreeOf` renvoie un écart chromatique 0-11 ; il faut
// donc 12 entrées, sinon les racines non diatoniques tombaient hors tableau
// (ex. en Do majeur : Ré→« iii », Mi→« V », Sol→index 7 hors table).
// Les degrés chromatiques utilisent les altérations usuelles (bII, bIII, #IV, bVI, bVII).
export const DEGREE_NAMES_MAJOR = [
  'I',   // 0
  'bII', // 1
  'ii',  // 2
  'bIII',// 3
  'iii', // 4
  'IV',  // 5
  '#IV', // 6
  'V',   // 7
  'bVI', // 8
  'vi',  // 9
  'bVII',// 10
  'vii°',// 11
];
export const DEGREE_NAMES_MINOR = [
  'i',   // 0
  'bII', // 1
  'ii°', // 2
  'III', // 3
  '#III',// 4
  'iv',  // 5
  '#IV', // 6
  'v/V', // 7  (v en mineur naturel, V en mineur harmonique)
  'VI',  // 8
  '#VI', // 9
  'VII', // 10
  'vii°',// 11 (sensible du mineur harmonique)
];

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
