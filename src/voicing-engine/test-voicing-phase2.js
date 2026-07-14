// Tests Phase 2A — Stateless Simple Two-Hand Voicing Generator.
// Objectif : valider le style Simple-v1 sans UI, sans voice leading,
// sans modification de fichier src/ui/.

import { normalizeVoicingInput } from './chord-input.js';
import { generateVoicing, generateVoicingFromSymbol } from './generate-voicing.js';
import { generateCloseVoicing, CLOSE_GENERATOR_ID } from './candidate-generator.js';
import {
  generateSimpleVoicing,
  SIMPLE_GENERATOR_ID,
  SIMPLE_CANDIDATE_BUDGET,
  getSimpleRightHandPitchClasses,
  getCanonicalPitchClasses,
  computeOmittedPitchClasses,
  computeDoubledPitchClasses,
} from './styles/simple.js';
import { checkCandidateHardConstraints } from './constraints.js';
import { LH_HARD_RANGE, RH_HARD_RANGE, RH_SOFT_RANGE, RH_MAX_SPAN } from './hand-ranges.js';
import { midiToNoteName } from './midi-convention.js';

const failures = [];
let total = 0;
let passed = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, error: err });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'expected true');
}

function assertFalse(value, msg = '') {
  if (value) throw new Error(msg || 'expected false');
}

function assertArrayEqual(actual, expected, msg = '') {
  const a = [...actual].sort((x, y) => x - y);
  const e = [...expected].sort((x, y) => x - y);
  if (a.length !== e.length || !a.every((v, i) => v === e[i])) {
    throw new Error(`${msg} expected [${expected.join(',')}], got [${actual.join(',')}]`);
  }
}

function assertSetEqual(actual, expected, msg = '') {
  const a = new Set(actual);
  const b = new Set(expected);
  if (a.size !== b.size || ![...a].every((x) => b.has(x))) {
    throw new Error(`${msg} expected {${[...b].join(',')}}, got {${[...a].join(',')}}`);
  }
}

function pcSet(notes) {
  return notes.map((n) => n % 12);
}

function assertLhPcSet(result, expectedPcs, msg = '') {
  if (!result.ok) throw new Error(`${msg} result not ok: ${result.rejectionReasons?.join('; ')}`);
  assertSetEqual(pcSet(result.selectedCandidate.lh.notes), expectedPcs, `${msg} LH pitch class mismatch`);
}

function assertRhPcSet(result, expectedPcs, msg = '') {
  if (!result.ok) throw new Error(`${msg} result not ok: ${result.rejectionReasons?.join('; ')}`);
  assertSetEqual(pcSet(result.selectedCandidate.rh.notes), expectedPcs, `${msg} RH pitch class mismatch`);
}

function assertNoHandCrossing(result, msg = '') {
  if (!result.ok) return;
  const maxLh = Math.max(...result.selectedCandidate.lh.notes);
  const minRh = Math.min(...result.selectedCandidate.rh.notes);
  assertTrue(maxLh <= minRh, `${msg} hand crossing: LH max ${maxLh} > RH min ${minRh}`);
}

function assertHardValid(result, msg = '') {
  if (!result.ok) return;
  const hard = checkCandidateHardConstraints(result.selectedCandidate);
  assertTrue(hard.valid, `${msg} hard constraints: ${hard.errors.join('; ')}`);
}

function assertBassIsLowest(result, msg = '') {
  if (!result.ok) return;
  const all = [...result.selectedCandidate.lh.notes, ...result.selectedCandidate.rh.notes];
  const lowest = Math.min(...all);
  const expectedBass = result.input.bassPc ?? result.input.rootPc;
  assertEqual(lowest % 12, expectedBass, `${msg} lowest note pc mismatch`);
}

console.log('\n=== Phase 2A: Oracles de base ===');

test('C simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' }, { style: 'simple' });
  assertTrue(r.ok, r.rejectionReasons?.join('; '));
  assertLhPcSet(r, [0], 'C');
  assertRhPcSet(r, [0, 4, 7], 'C');
  assertEqual(r.selectedCandidate.metadata.generatorId, SIMPLE_GENERATOR_ID);
  assertEqual(r.selectedCandidate.metadata.style, 'simple');
  assertEqual(r.selectedCandidate.metadata.rootless, false);
});

test('Cm simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'm' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [0, 3, 7]);
});

test('C7 simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: '7' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [0, 4, 10]);
});

test('Cmaj7 simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [0, 4, 11]);
});

test('Cm7 simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'm7' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [0, 3, 10]);
});

test('Cm7b5 simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'm7b5' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [3, 6, 10]);
});

test('Cdim simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'dim' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [0, 3, 6]);
});

test('Caug simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'aug' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [0, 4, 8]);
});

test('Csus2 simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'sus2' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [0, 2, 7]);
});

test('Csus4 simple voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'sus4' }, { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [0]);
  assertRhPcSet(r, [0, 5, 7]);
});

console.log('\n=== Phase 2A: Slash chords ===');

test('C/E simple voicing', () => {
  const r = generateVoicingFromSymbol('C/E', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [4]);
  assertRhPcSet(r, [0, 4, 7]);
  assertBassIsLowest(r);
});

test('C/G simple voicing', () => {
  const r = generateVoicingFromSymbol('C/G', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [7]);
  assertRhPcSet(r, [0, 4, 7]);
  assertBassIsLowest(r);
});

test('G7/B simple voicing', () => {
  const r = generateVoicingFromSymbol('G7/B', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [11]);
  assertRhPcSet(r, [7, 11, 5]);
  assertBassIsLowest(r);
});

test('Fm7/D simple voicing', () => {
  const r = generateVoicingFromSymbol('Fm7/D', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [2]);
  assertRhPcSet(r, [5, 8, 3]);
  assertBassIsLowest(r);
});

test('C#m7b5/D simple voicing', () => {
  const r = generateVoicingFromSymbol('C#m7b5/D', { style: 'simple' });
  assertTrue(r.ok, r.rejectionReasons?.join('; '));
  assertLhPcSet(r, [2]); // D
  assertRhPcSet(r, [1, 4, 7, 11]); // C# E G B accord complet
  assertBassIsLowest(r);
});

console.log('\n=== Phase 2A: Oracles hors Do ===');

test('Dmaj7 → LH D, RH D F# C#, A omis', () => {
  const r = generateVoicingFromSymbol('Dmaj7', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [2]);
  assertRhPcSet(r, [2, 6, 1]);
  assertArrayEqual(r.selectedCandidate.metadata.omittedPitchClasses, [9]);
});

test('F#7 → LH F#, RH F# A# E, C# omis', () => {
  const r = generateVoicingFromSymbol('F#7', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [6]);
  assertRhPcSet(r, [6, 10, 4]);
  assertArrayEqual(r.selectedCandidate.metadata.omittedPitchClasses, [1]);
});

test('Bbm7 → LH Bb, RH Bb Db Ab, F omis', () => {
  const r = generateVoicingFromSymbol('Bbm7', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [10]);
  assertRhPcSet(r, [10, 1, 8]);
  assertArrayEqual(r.selectedCandidate.metadata.omittedPitchClasses, [5]);
});

test('Amaj7 → LH A, RH A C# G#, E omis', () => {
  const r = generateVoicingFromSymbol('Amaj7', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [9]);
  assertRhPcSet(r, [9, 1, 8]);
  assertArrayEqual(r.selectedCandidate.metadata.omittedPitchClasses, [4]);
});

test('Gm7b5 → LH G, RH Bb Db F', () => {
  const r = generateVoicingFromSymbol('Gm7b5', { style: 'simple' });
  assertTrue(r.ok);
  assertLhPcSet(r, [7]);
  assertRhPcSet(r, [10, 1, 5]);
});

console.log('\n=== Phase 2A: Doublures LH pour triades bassIsRoot ===');

test('C major → LH contient fondamentale + octave', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' }, { style: 'simple' });
  assertTrue(r.ok);
  const lh = r.selectedCandidate.lh.notes;
  assertEqual(lh.length, 2);
  assertEqual(lh[1] - lh[0], 12);
  assertEqual(lh[0] % 12, 0);
  assertEqual(r.selectedCandidate.metadata.doubledPitchClasses.length, 1);
  assertEqual(r.selectedCandidate.metadata.doubledPitchClasses[0], 0);
});

test('Fsus4 → LH contient fondamentale + octave', () => {
  const r = generateVoicingFromSymbol('Fsus4', { style: 'simple' });
  assertTrue(r.ok);
  const lh = r.selectedCandidate.lh.notes;
  assertEqual(lh.length, 2);
  assertEqual(lh[1] - lh[0], 12);
  assertEqual(lh[0] % 12, 5);
});

test('Basse slash non fondamentale → LH seule note, pas de doublure LH auto', () => {
  const r = generateVoicingFromSymbol('C/E', { style: 'simple' });
  assertTrue(r.ok);
  assertEqual(r.selectedCandidate.lh.notes.length, 1);
  // LH ne contient qu'une note ; il n'y a pas de doublure artificielle en LH.
  const lhPcs = pcSet(r.selectedCandidate.lh.notes);
  assertEqual(lhPcs.length, 1);
});

console.log('\n=== Phase 2A: Test anti-index réel ===');

// Ce test appelle directement la fonction pure de sélection RH avec des
// chordTonePcs volontairement permutés (non triés, non canoniques). Il doit
// échouer avec une implémentation basée sur les index de chordTonePcs et
// réussir avec une dérivation fondée sur (rootPc + interval) % 12.
const ANTI_INDEX_CASES = [
  {
    symbol: 'Dmaj7',
    rootPc: 2,
    quality: 'maj7',
    chordTonePcs: [9, 6, 2, 1],
    expectedRhPcs: [2, 6, 1],
  },
  {
    symbol: 'F#7',
    rootPc: 6,
    quality: '7',
    chordTonePcs: [10, 6, 4, 1],
    expectedRhPcs: [6, 10, 4],
  },
  {
    symbol: 'Bbm7',
    rootPc: 10,
    quality: 'm7',
    chordTonePcs: [8, 1, 10, 5],
    expectedRhPcs: [10, 1, 8],
  },
  {
    symbol: 'Amaj7',
    rootPc: 9,
    quality: 'maj7',
    chordTonePcs: [4, 9, 1, 8],
    expectedRhPcs: [9, 1, 8],
  },
];

for (const c of ANTI_INDEX_CASES) {
  test(`anti-index ${c.symbol} : chordTonePcs [${c.chordTonePcs.join(',')}]`, () => {
    const scrambledInput = Object.freeze({
      rootPc: c.rootPc,
      quality: c.quality,
      bassPc: null,
      chordTonePcs: Object.freeze([...c.chordTonePcs]),
      bassIsInChord: false,
      valid: true,
      errors: Object.freeze([]),
    });
    const actual = getSimpleRightHandPitchClasses(c.rootPc, c.quality, true);
    assertSetEqual(actual, c.expectedRhPcs);

    // Vérification d'intégrité : la fonction de sélection ignore chordTonePcs.
    const r = generateSimpleVoicing(scrambledInput);
    assertTrue(r.ok, r.rejectionReasons?.join('; '));
    assertRhPcSet(r, c.expectedRhPcs);
  });
}

console.log('\n=== Phase 2A: Transpositions exhaustives ===');

const SUPPORTED_QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim', 'aug', 'sus2', 'sus4'];
const SEVENTH_QUALITIES = ['7', 'maj7', 'm7', 'm7b5'];

// Table d'intervalles indépendante réservée aux tests d'omission de quinte.
// Ne doit pas être utilisée pour calculer la production ; elle sert uniquement
// à vérifier que generateVoicing(..., { style: 'simple' }) omet bien la quinte.
const TEST_SIMPLE_SEVENTH_RULES = Object.freeze({
  '7': Object.freeze({
    canonicalIntervals: Object.freeze([0, 4, 7, 10]),
    rhIntervals: Object.freeze([0, 4, 10]),
    omittedIntervals: Object.freeze([7]),
  }),
  'maj7': Object.freeze({
    canonicalIntervals: Object.freeze([0, 4, 7, 11]),
    rhIntervals: Object.freeze([0, 4, 11]),
    omittedIntervals: Object.freeze([7]),
  }),
  'm7': Object.freeze({
    canonicalIntervals: Object.freeze([0, 3, 7, 10]),
    rhIntervals: Object.freeze([0, 3, 10]),
    omittedIntervals: Object.freeze([7]),
  }),
});

for (const quality of SUPPORTED_QUALITIES) {
  test(`simple all roots for quality '${quality}'`, () => {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const r = generateVoicing({ rootPc, quality }, { style: 'simple' });
      assertTrue(r.ok, `root ${rootPc} quality ${quality} failed: ${r.rejectionReasons?.join('; ')}`);
      assertBassIsLowest(r, `${rootPc}/${quality}`);
      assertNoHandCrossing(r, `${rootPc}/${quality}`);
      assertHardValid(r, `${rootPc}/${quality}`);

      const canonical = new Set(getCanonicalPitchClasses(rootPc, quality));
      assertTrue(canonical.size > 0);

      const rhSet = new Set(pcSet(r.selectedCandidate.rh.notes));
      for (const pc of rhSet) {
        assertTrue(canonical.has(pc), `${rootPc}/${quality} foreign pc ${pc} in RH`);
      }

      // La basse jouée (fondamentale sauf slash) doit être présente au moins en LH.
      const playedBassPc = r.input.bassPc ?? r.input.rootPc;
      const present = new Set(pcSet([...r.selectedCandidate.lh.notes, ...r.selectedCandidate.rh.notes]));
      assertTrue(present.has(playedBassPc), `${rootPc}/${quality} missing played bass pc ${playedBassPc}`);
    }
  });
}

for (const quality of ['7', 'maj7', 'm7']) {
  test(`simple ${quality} omits fifth independently`, () => {
    const rule = TEST_SIMPLE_SEVENTH_RULES[quality];
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const r = generateVoicing({ rootPc, quality }, { style: 'simple' });
      assertTrue(r.ok, `${rootPc}/${quality}: ${r.rejectionReasons?.join('; ')}`);

      // Attente calculée uniquement depuis la table de test et rootPc.
      const expectedRhPcs = rule.rhIntervals.map((i) => (rootPc + i) % 12);
      assertRhPcSet(r, expectedRhPcs);

      // La quinte doit être omise de la RH et reportée dans omittedPitchClasses.
      const fifthPc = (rootPc + 7) % 12;
      assertFalse(pcSet(r.selectedCandidate.rh.notes).includes(fifthPc), `${rootPc}/${quality} should omit fifth in RH`);
      assertTrue(r.selectedCandidate.metadata.omittedPitchClasses.includes(fifthPc), `${rootPc}/${quality} should report omitted fifth`);

      // Seule la quinte est omise ; aucune autre pitch class canonique ne doit
      // apparaître dans omittedPitchClasses.
      const expectedOmitted = rule.omittedIntervals.map((i) => (rootPc + i) % 12).sort((a, b) => a - b);
      assertArrayEqual(
        [...r.selectedCandidate.metadata.omittedPitchClasses].sort((a, b) => a - b),
        expectedOmitted,
        `${rootPc}/${quality} omitted pitch classes mismatch`,
      );

      // La basse fondamentale et les 3 notes RH couvrent root, third, seventh ;
      // la quinte est la seule absente.
      const present = new Set(pcSet([...r.selectedCandidate.lh.notes, ...r.selectedCandidate.rh.notes]));
      for (const interval of rule.rhIntervals) {
        assertTrue(present.has((rootPc + interval) % 12), `${rootPc}/${quality} missing RH interval ${interval}`);
      }
    }
  });
}

test('m7b5 with root in LH omits root in RH, no fifth omission reported', () => {
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    const r = generateVoicing({ rootPc, quality: 'm7b5' }, { style: 'simple' });
    assertTrue(r.ok);
    // RH = b3, b5, b7
    const expectedRhPcs = [(rootPc + 3) % 12, (rootPc + 6) % 12, (rootPc + 10) % 12];
    assertRhPcSet(r, expectedRhPcs);
    // La fondamentale est en LH, donc elle ne doit pas apparaître dans omittedPitchClasses.
    assertFalse(r.selectedCandidate.metadata.omittedPitchClasses.includes(rootPc));
    assertArrayEqual(r.selectedCandidate.metadata.omittedPitchClasses, []);
  }
});

console.log('\n=== Phase 2A: Contrats d\'échec ===');

test('style inconnu retourne UNSUPPORTED_STYLE', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' }, { style: 'unknown' });
  assertFalse(r.ok);
  assertTrue(r.rejectionReasons?.includes('UNSUPPORTED_STYLE'));
});

test('style jazz retourne UNSUPPORTED_STYLE', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' }, { style: 'jazz' });
  assertFalse(r.ok);
  assertTrue(r.rejectionReasons?.includes('UNSUPPORTED_STYLE'));
});

test('qualité future retourne UNSUPPORTED_QUALITY en simple', () => {
  const r = generateVoicing({ rootPc: 0, quality: '9' }, { style: 'simple' });
  assertFalse(r.ok);
  assertTrue(r.rejectionReasons?.includes('UNSUPPORTED_QUALITY'));
});

test('qualité inconnue retourne échec', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'weird' }, { style: 'simple' });
  assertFalse(r.ok);
});

test('entrée invalide retourne échec', () => {
  const r = generateVoicing({ rootPc: 12, quality: '' }, { style: 'simple' });
  assertFalse(r.ok);
});

console.log('\n=== Phase 2A: Non-régression Close ===');

test('generateVoicing(input) inchangé', () => {
  const input = { rootPc: 0, quality: 'maj7' };
  const r1 = generateVoicing(input);
  const r2 = generateVoicing(input, {});
  const r3 = generateVoicing(input, { style: 'close' });
  assertTrue(r1.ok && r2.ok && r3.ok);
  assertArrayEqual(r1.selectedCandidate.lh.notes, r2.selectedCandidate.lh.notes);
  assertArrayEqual(r1.selectedCandidate.rh.notes, r2.selectedCandidate.rh.notes);
  assertArrayEqual(r1.selectedCandidate.lh.notes, r3.selectedCandidate.lh.notes);
  assertArrayEqual(r1.selectedCandidate.rh.notes, r3.selectedCandidate.rh.notes);
  assertEqual(r1.selectedCandidate.metadata.generatorId, CLOSE_GENERATOR_ID);
});

test('generateVoicing(input, {}) === generateCloseVoicing(input)', () => {
  const input = normalizeVoicingInput({ rootPc: 5, quality: 'm7', bassPc: null });
  const r1 = generateVoicing(input);
  const r2 = generateCloseVoicing(input);
  assertTrue(r1.ok && r2.ok);
  assertArrayEqual(r1.selectedCandidate.lh.notes, r2.selectedCandidate.lh.notes);
  assertArrayEqual(r1.selectedCandidate.rh.notes, r2.selectedCandidate.rh.notes);
});

console.log('\n=== Phase 2A: Immutabilité et déterminisme ===');

test('entrée non mutée', () => {
  const input = { rootPc: 0, quality: 'maj7', bassPc: null };
  generateVoicing(input, { style: 'simple' });
  assertEqual(input.rootPc, 0);
  assertEqual(input.quality, 'maj7');
  assertEqual(input.bassPc, null);
});

test('résultat profondément immuable', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' }, { style: 'simple' });
  assertTrue(Object.isFrozen(r));
  assertTrue(Object.isFrozen(r.selectedCandidate));
  assertTrue(Object.isFrozen(r.selectedCandidate.lh.notes));
  assertTrue(Object.isFrozen(r.selectedCandidate.rh.notes));
  assertTrue(Object.isFrozen(r.selectedCandidate.metadata));
  assertTrue(Array.isArray(r.rejectionReasons) && Object.isFrozen(r.rejectionReasons));
});

function assertArrayDeeplyFrozen(arr, msg = '') {
  assertTrue(Object.isFrozen(arr), `${msg} array must be frozen`);
  // En mode strict, push() sur un tableau gelé lève une TypeError.
  let thrown = false;
  try {
    arr.push(99);
  } catch (e) {
    thrown = true;
  }
  assertTrue(thrown, `${msg} mutation should have thrown`);
}

test('métadonnées Simple : omittedPitchClasses gelé', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' }, { style: 'simple' });
  const arr = r.selectedCandidate.metadata.omittedPitchClasses;
  assertArrayEqual(arr, [7]);
  assertArrayDeeplyFrozen(arr, 'omittedPitchClasses');
});

test('métadonnées Simple : doubledPitchClasses gelé', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' }, { style: 'simple' });
  const arr = r.selectedCandidate.metadata.doubledPitchClasses;
  assertArrayEqual(arr, [0]);
  assertArrayDeeplyFrozen(arr, 'doubledPitchClasses');
});

test('métadonnées Simple : interHandDoubledPitchClasses gelé', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' }, { style: 'simple' });
  const arr = r.selectedCandidate.metadata.interHandDoubledPitchClasses;
  assertTrue(Array.isArray(arr));
  assertArrayDeeplyFrozen(arr, 'interHandDoubledPitchClasses');
});

test('mutation post-gel n\'altère pas les métadonnées Simple', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' }, { style: 'simple' });
  const arr = r.selectedCandidate.metadata.omittedPitchClasses;
  try { arr.push(99); } catch (e) { /* attendu */ }
  assertArrayEqual(arr, [7]);
});

test('déterminisme : même entrée → même sortie (5 runs)', () => {
  const input = { rootPc: 7, quality: 'm7b5' };
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(generateVoicing(input, { style: 'simple' }));
  }
  for (let i = 1; i < results.length; i++) {
    assertArrayEqual(results[i].selectedCandidate.lh.notes, results[0].selectedCandidate.lh.notes);
    assertArrayEqual(results[i].selectedCandidate.rh.notes, results[0].selectedCandidate.rh.notes);
  }
});

console.log('\n=== Phase 2A: Métadonnées ===');

test('omittedPitchClasses calculé depuis le résultat réel', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' }, { style: 'simple' });
  assertTrue(r.ok);
  assertArrayEqual(r.selectedCandidate.metadata.omittedPitchClasses, [7]);
});

test('doubledPitchClasses calculé depuis le résultat réel', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' }, { style: 'simple' });
  assertTrue(r.ok);
  assertTrue(r.selectedCandidate.metadata.doubledPitchClasses.includes(0));
});

test('m7b5 slash ne marque pas la fondamentale comme omise', () => {
  const r = generateVoicingFromSymbol('C#m7b5/D', { style: 'simple' });
  assertTrue(r.ok);
  assertArrayEqual(r.selectedCandidate.metadata.omittedPitchClasses, []);
});

console.log('\n=== Phase 2A: Contraintes physiques ===');

test('toutes les notes MIDI sont dans les plages hard', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' }, { style: 'simple' });
  assertTrue(r.ok);
  for (const n of r.selectedCandidate.lh.notes) {
    assertTrue(n >= LH_HARD_RANGE.min && n <= LH_HARD_RANGE.max);
  }
  for (const n of r.selectedCandidate.rh.notes) {
    assertTrue(n >= RH_HARD_RANGE.min && n <= RH_HARD_RANGE.max);
  }
});

test('span RH <= RH_MAX_SPAN pour toutes les transpositions', () => {
  for (const quality of SUPPORTED_QUALITIES) {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const r = generateVoicing({ rootPc, quality }, { style: 'simple' });
      assertTrue(r.ok);
      const rh = r.selectedCandidate.rh.notes;
      const s = rh[rh.length - 1] - rh[0];
      assertTrue(s <= RH_MAX_SPAN, `${rootPc}/${quality} span ${s} > ${RH_MAX_SPAN}`);
    }
  }
});

test('budget candidats respecté', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' }, { style: 'simple' });
  assertTrue(r.candidatesConsidered <= SIMPLE_CANDIDATE_BUDGET);
});

console.log('\n=== Phase 2A: Isolation ===');

test('simple.js et generate-voicing.js n\'importent pas src/ui/', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const files = [
    'styles/simple.js',
    'generate-voicing.js',
  ];
  for (const f of files) {
    const content = fs.readFileSync(path.resolve('src/voicing-engine', f), 'utf8');
    if (content.includes("from '../ui/") || content.includes('from "../ui/')) {
      throw new Error(`${f} imports from ../ui/ (forbidden)`);
    }
  }
});

console.log('\n=== Phase 2A: Récapitulatif ===');
console.log(`Total: ${total}, Passés: ${passed}, Échecs: ${failures.length}`);
if (failures.length > 0) {
  console.log('\nÉchecs :');
  for (const f of failures) {
    console.log(`- ${f.name}: ${f.error.stack || f.error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nPhase 2A Simple-v1 validée avec succès.');
}
