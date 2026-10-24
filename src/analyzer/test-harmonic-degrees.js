// [Claude] — 2026-09-25 — Tests de régression pour deux bugs du moteur d'analyse harmonique :
//   1. degreeName / formatDegree : les tables de degrés doivent être indexées par écart
//      en DEMI-TONS (0..11), pas par degré diatonique (7 entrées).
//   2. key-detector : le bonus de dominante doit viser le V (deg 7), pas le IV (deg 5).
// Style aligné sur les autres src/analyzer/test-*.js, avec une fonction check().

import { degreeName } from './harmonic-utils.js';
import { detectTurnarounds } from './harmonic-patterns.js';
import { chordScoreForKey, detectKey } from './key-detector.js';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`✅ ${label}`);
  } else {
    failed++;
    console.error(`❌ ${label}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Bug 1 — degreeName : table majeure indexée par demi-ton (Do majeur, keyPc = 0)
// ---------------------------------------------------------------------------
const MAJOR_EXPECTED = {
  0: 'I',    // Do
  1: 'bII',  // Do#/Réb
  2: 'ii',   // Ré  (sortait « iii » avant le fix)
  3: 'bIII', // Ré#/Mib
  4: 'iii',  // Mi  (sortait « V » avant le fix)
  5: 'IV',   // Fa
  6: '#IV',  // Fa#
  7: 'V',    // Sol (sortait « 7 », hors tableau, avant le fix)
  8: 'bVI',  // Sol#/Lab
  9: 'vi',   // La
  10: 'bVII',// La#/Sib
  11: 'vii°',// Si
};
for (const [semi, expected] of Object.entries(MAJOR_EXPECTED)) {
  const rootPc = Number(semi); // keyPc = 0 → écart = rootPc
  const got = degreeName(rootPc, 0, 'major');
  check(
    `degreeName majeur : demi-ton ${semi} → ${expected}`,
    got === expected,
    `obtenu « ${got} »`,
  );
}

// ---------------------------------------------------------------------------
// Bug 1 — degreeName : table mineure (La mineur, keyPc = 9)
// ---------------------------------------------------------------------------
const A_MINOR_PC = 9;
const MINOR_CASES = [
  [9, 'i'],    // La
  [11, 'ii°'], // Si  → écart 2
  [0, 'III'],  // Do  → écart 3
  [2, 'iv'],   // Ré  → écart 5
  [4, 'v/V'],  // Mi  → écart 7
  [5, 'VI'],   // Fa  → écart 8
  [7, 'VII'],  // Sol → écart 10
];
for (const [rootPc, expected] of MINOR_CASES) {
  const got = degreeName(rootPc, A_MINOR_PC, 'minor');
  check(
    `degreeName mineur : racine ${rootPc} en Lam → ${expected}`,
    got === expected,
    `obtenu « ${got} »`,
  );
}

// ---------------------------------------------------------------------------
// Bug 1 — formatDegree via detectTurnarounds : le turnaround I - vi - ii - V
// (degrés en demi-tons [0, 9, 2, 7]) doit être libellé correctement.
// ---------------------------------------------------------------------------
{
  const key = { pc: 0, mode: 'major', name: 'Do' };
  const chords = [
    { rootPc: 0, symbol: 'maj7', duration: 1 }, // C  → I
    { rootPc: 9, symbol: 'm7', duration: 1 },   // Am → vi
    { rootPc: 2, symbol: 'm7', duration: 1 },   // Dm → ii
    { rootPc: 7, symbol: '7', duration: 1 },    // G7 → V
  ];
  const turnarounds = detectTurnarounds(chords, key);
  check(
    'detectTurnarounds : un turnaround détecté sur I-vi-ii-V',
    turnarounds.length === 1,
    `obtenu ${turnarounds.length}`,
  );
  const desc = turnarounds[0]?.description || '';
  check(
    'formatDegree : libellé du turnaround = « I - vi - ii - V »',
    desc.includes('I - vi - ii - V'),
    `description « ${desc} »`,
  );
}

// ---------------------------------------------------------------------------
// Bug 2 — chordScoreForKey (branche majeure) : le bonus de dominante vise le V (deg 7).
// ---------------------------------------------------------------------------
{
  // G7 = V de Do → poids 4 (V) + bonus dominante 2 = 6.
  const g7 = chordScoreForKey([{ rootPc: 7, symbol: '7', duration: 1 }], 0, 'major');
  check(
    'chordScoreForKey : G7 en Do reçoit le bonus de dominante (V)',
    Math.abs(g7 - 6) < 1e-9,
    `score obtenu ${g7}`,
  );

  // F7 = IV de Do → poids 3 (IV) SANS bonus de dominante (bug corrigé).
  const f7 = chordScoreForKey([{ rootPc: 5, symbol: '7', duration: 1 }], 0, 'major');
  check(
    'chordScoreForKey : F7 en Do ne reçoit PLUS le bonus de dominante (IV, pas V)',
    Math.abs(f7 - 3) < 1e-9,
    `score obtenu ${f7} (attendu 3, l'ancien code donnait 5)`,
  );

  // Dm7 - G7 - Cmaj7 en Do majeur : (1 + 6 + 6.5) / 3 = 4.5.
  const iiVI = chordScoreForKey(
    [
      { rootPc: 2, symbol: 'm7', duration: 1 },
      { rootPc: 7, symbol: '7', duration: 1 },
      { rootPc: 0, symbol: 'maj7', duration: 1 },
    ],
    0,
    'major',
  );
  check(
    'chordScoreForKey : Dm7-G7-Cmaj7 en Do majeur → score 4.5',
    Math.abs(iiVI - 4.5) < 1e-9,
    `score obtenu ${iiVI}`,
  );
}

// ---------------------------------------------------------------------------
// Bug 2 — detectKey (bout en bout) : Dm7 - G7 - Cmaj7 → Do majeur, bonne confiance.
// ---------------------------------------------------------------------------
{
  const chords = [
    { rootPc: 2, symbol: 'm7', duration: 1 },  // Dm7
    { rootPc: 7, symbol: '7', duration: 1 },   // G7
    { rootPc: 0, symbol: 'maj7', duration: 1 },// Cmaj7
  ];
  const key = detectKey([], chords, { latin: false });
  check(
    'detectKey : Dm7-G7-Cmaj7 → tonalité C',
    key && key.name === 'C',
    `obtenu ${key ? key.name : 'null'}`,
  );
  check(
    'detectKey : Dm7-G7-Cmaj7 → mode majeur',
    key && key.mode === 'major',
    `obtenu ${key ? key.mode : 'null'}`,
  );
  check(
    'detectKey : Dm7-G7-Cmaj7 → confiance élevée (≥ 0.7)',
    key && key.confidence >= 0.7,
    `confiance obtenue ${key ? key.confidence : 'null'}`,
  );
}

console.log(`\n=== Tests degrés harmoniques : ${passed} OK, ${failed} KO ===`);
