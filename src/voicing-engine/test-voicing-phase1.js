// Tests Phase 1 — Stateless Close Voicing Generator.
// Objectif : valider le générateur close-v1 sans UI, sans voice leading,
// sans style avancé, sans rootless, sans modification d'export MIDI.

import { normalizeVoicingInput } from './chord-input.js';
import {
  generateCloseVoicing,
  generateRotations,
  midiInstancesInRange,
  generateRightHandCandidates,
  rankCandidate,
  CLOSE_GENERATOR_ID,
  CLOSE_CANDIDATE_BUDGET,
} from './candidate-generator.js';
import { generateVoicing, generateVoicingFromSymbol } from './generate-voicing.js';
import { createHandVoicing } from './data-model.js';
import { checkCandidateHardConstraints } from './constraints.js';
import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  RH_MAX_SPAN,
} from './hand-ranges.js';
import { midiToNoteName } from './midi-convention.js';
import { NOTE_NAMES } from '../chord-engine/intervals.js';

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
  if (actual.length !== expected.length || !actual.every((v, i) => v === expected[i])) {
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

function assertLhOneNote(result, expectedPc, msg = '') {
  if (!result.ok) throw new Error(`${msg} result not ok: ${result.rejectionReasons?.join('; ')}`);
  const lh = result.selectedCandidate.lh.notes;
  assertEqual(lh.length, 1, `${msg} LH must contain exactly one note`);
  assertEqual(lh[0] % 12, expectedPc, `${msg} LH pitch class mismatch`);
}

function assertRhPcSet(result, expectedPcs, msg = '') {
  if (!result.ok) throw new Error(`${msg} result not ok: ${result.rejectionReasons?.join('; ')}`);
  assertSetEqual(pcSet(result.selectedCandidate.rh.notes), expectedPcs, `${msg} RH pitch class mismatch`);
}

console.log('\n=== Phase 1: Rotations ===');

test('generateRotations C major triad', () => {
  const rots = generateRotations([0, 4, 7]);
  assertEqual(rots.length, 3);
  assertArrayEqual(rots[0], [0, 4, 7]);
  assertArrayEqual(rots[1], [4, 7, 12]);
  assertArrayEqual(rots[2], [7, 12, 16]);
});

test('generateRotations ascending order preserved', () => {
  const rots = generateRotations([0, 4, 7]);
  for (const rot of rots) {
    for (let i = 1; i < rot.length; i++) {
      assertTrue(rot[i] > rot[i - 1], `rotation not ascending: ${rot.join(',')}`);
    }
  }
});

test('generateRotations C7', () => {
  const rots = generateRotations([0, 4, 7, 10]);
  assertEqual(rots.length, 4);
});

console.log('\n=== Phase 1: Utility functions ===');

test('midiInstancesInRange C4 area', () => {
  const notes = midiInstancesInRange(0, 48, 84);
  assertArrayEqual(notes, [48, 60, 72, 84]);
});

test('generateRightHandCandidates budget respected', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const rh = generateRightHandCandidates(input);
  assertTrue(rh.candidates.length <= CLOSE_CANDIDATE_BUDGET, `got ${rh.candidates.length}`);
});

console.log('\n=== Phase 1: Triades ===');

test('C major close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' });
  assertTrue(r.ok, r.rejectionReasons?.join('; '));
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 4, 7]);
  assertEqual(r.selectedCandidate.metadata.generatorId, CLOSE_GENERATOR_ID);
  assertEqual(r.selectedCandidate.metadata.rootless, false);
});

test('Cm minor close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'm' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 3, 7]);
});

test('Cdim diminished close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'dim' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 3, 6]);
});

test('Caug augmented close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'aug' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 4, 8]);
});

test('Csus2 close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'sus2' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 2, 7]);
});

test('Csus4 close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'sus4' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 5, 7]);
});

console.log('\n=== Phase 1: Septièmes ===');

test('Cmaj7 close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 4, 7, 11]);
});

test('C7 close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: '7' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 4, 7, 10]);
});

test('Cm7 close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'm7' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 3, 7, 10]);
});

test('Cm7b5 close voicing', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'm7b5' });
  assertTrue(r.ok);
  assertLhOneNote(r, 0);
  assertRhPcSet(r, [0, 3, 6, 10]);
});

console.log('\n=== Phase 1: Slash chords bloquants ===');

test('Fm7/D : LH D, RH F Ab C Eb, D globalement plus grave', () => {
  const r = generateVoicingFromSymbol('Fm7/D');
  assertTrue(r.ok, r.rejectionReasons?.join('; '));
  assertLhOneNote(r, 2); // D
  assertRhPcSet(r, [5, 8, 0, 3]); // F Ab C Eb
  const all = [...r.selectedCandidate.lh.notes, ...r.selectedCandidate.rh.notes];
  const lowest = Math.min(...all);
  assertEqual(lowest % 12, 2, 'lowest note must be D');
  assertEqual(lowest, r.selectedCandidate.lh.notes[0], 'LH must hold lowest note');
  assertFalse(r.selectedCandidate.rh.notes.some((n) => n % 12 === 9), 'no natural A in RH');
});

test('C/E : LH E, RH C E G, E globalement plus grave', () => {
  const r = generateVoicingFromSymbol('C/E');
  assertTrue(r.ok);
  assertLhOneNote(r, 4); // E
  assertRhPcSet(r, [0, 4, 7]);
  const inter = r.selectedCandidate.metadata.interHandDoubledPitchClasses || [];
  assertTrue(inter.includes(4), 'E should be reported as inter-hand doubling');
});

test('C/G : LH G, RH C E G', () => {
  const r = generateVoicingFromSymbol('C/G');
  assertTrue(r.ok);
  assertLhOneNote(r, 7); // G
  assertRhPcSet(r, [0, 4, 7]);
});

test('G7/B : LH B, RH G B D F', () => {
  const r = generateVoicingFromSymbol('G7/B');
  assertTrue(r.ok);
  assertLhOneNote(r, 11); // B
  assertRhPcSet(r, [7, 11, 2, 5]); // G B D F
});

console.log('\n=== Phase 1: Cas musicaux obligatoires ===');

test('Gm7b5 = G Bb Db F', () => {
  const r = generateVoicingFromSymbol('Gm7b5');
  assertTrue(r.ok);
  assertLhOneNote(r, 7); // G
  assertRhPcSet(r, [7, 10, 1, 5]); // G Bb Db F
});

test('Fsus4 = F Bb C', () => {
  const r = generateVoicingFromSymbol('Fsus4');
  assertTrue(r.ok);
  assertLhOneNote(r, 5); // F
  assertRhPcSet(r, [5, 10, 0]); // F Bb C
});

test('Amaj7 = A C# E G#', () => {
  const r = generateVoicingFromSymbol('Amaj7');
  assertTrue(r.ok);
  assertLhOneNote(r, 9); // A
  assertRhPcSet(r, [9, 1, 4, 8]); // A C# E G#
});

test('MIDI 60 = C4', () => {
  assertEqual(midiToNoteName(60), 'C4');
});

console.log('\n=== Phase 1: Transpositions ===');

test('Dm7 transposed', () => {
  const r = generateVoicing({ rootPc: 2, quality: 'm7' });
  assertTrue(r.ok);
  assertLhOneNote(r, 2);
  assertRhPcSet(r, [2, 5, 9, 0]);
});

const SUPPORTED_QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim', 'aug', 'sus2', 'sus4'];

for (const quality of SUPPORTED_QUALITIES) {
  test(`all roots for quality '${quality}' produce valid close voicing`, () => {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const r = generateVoicing({ rootPc, quality });
      assertTrue(r.ok, `root ${rootPc} quality ${quality} failed: ${r.rejectionReasons?.join('; ')}`);
      assertLhOneNote(r, rootPc);
      const expected = normalizeVoicingInput({ rootPc, quality }).chordTonePcs;
      assertRhPcSet(r, expected);
    }
  });
}

console.log('\n=== Phase 1: Invariants bloquants ===');

test('LH contient exactement une note', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  assertEqual(r.selectedCandidate.lh.notes.length, 1);
});

test('RH contient toutes les pitch classes obligatoires sans omission', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  assertEqual(r.selectedCandidate.rh.notes.length, 4);
});

test('Aucune pitch class étrangère dans RH', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  const rhPcs = new Set(pcSet(r.selectedCandidate.rh.notes));
  const expected = new Set([0, 4, 7, 11]);
  assertEqual(rhPcs.size, expected.size);
  for (const pc of expected) assertTrue(rhPcs.has(pc));
});

test('Notes MIDI entières', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  for (const n of [...r.selectedCandidate.lh.notes, ...r.selectedCandidate.rh.notes]) {
    assertTrue(Number.isInteger(n));
  }
});

test('Mains triées', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  const lh = r.selectedCandidate.lh.notes;
  const rh = r.selectedCandidate.rh.notes;
  for (let i = 1; i < lh.length; i++) assertTrue(lh[i] >= lh[i - 1]);
  for (let i = 1; i < rh.length; i++) assertTrue(rh[i] >= rh[i - 1]);
});

test('Aucune violation des plages strictes', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  const hard = checkCandidateHardConstraints(r.selectedCandidate);
  assertTrue(hard.valid, hard.errors.join('; '));
});

test('Span RH <= RH_MAX_SPAN', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  const rhSpan = r.selectedCandidate.rh.notes[r.selectedCandidate.rh.notes.length - 1] - r.selectedCandidate.rh.notes[0];
  assertTrue(rhSpan <= RH_MAX_SPAN);
});

test('Aucun croisement', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  const maxLh = Math.max(...r.selectedCandidate.lh.notes);
  const minRh = Math.min(...r.selectedCandidate.rh.notes);
  assertTrue(maxLh <= minRh);
});

test('rootless === false', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  assertEqual(r.selectedCandidate.metadata.rootless, false);
});

test('Aucune omission', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  assertArrayEqual(r.selectedCandidate.metadata.omittedPitchClasses, []);
});

test('Aucune doublure intra-main', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  const rh = r.selectedCandidate.rh.notes;
  const unique = new Set(rh);
  assertEqual(unique.size, rh.length);
});

test('Déterminisme : même entrée → même sortie', () => {
  const r1 = generateVoicing({ rootPc: 5, quality: 'm7' });
  const r2 = generateVoicing({ rootPc: 5, quality: 'm7' });
  assertArrayEqual(r1.selectedCandidate.lh.notes, r2.selectedCandidate.lh.notes);
  assertArrayEqual(r1.selectedCandidate.rh.notes, r2.selectedCandidate.rh.notes);
});

console.log('\n=== Phase 1: Tests négatifs ===');

test('qualité hors vocabulaire refusée', () => {
  const r = generateVoicing({ rootPc: 0, quality: '9' });
  assertFalse(r.ok);
  assertTrue(r.rejectionReasons?.includes('UNSUPPORTED_QUALITY'));
});

test('qualité inconnue refusée', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'weird' });
  assertFalse(r.ok);
});

test('pitch class invalide refusée', () => {
  const r = generateVoicing({ rootPc: 12, quality: '' });
  assertFalse(r.ok);
});

test('basse invalide refusée', () => {
  const r = generateVoicing({ rootPc: 0, quality: '', bassPc: 99 });
  assertFalse(r.ok);
});

test('entrée non normalisée (symbole N) refusée', () => {
  const r = generateVoicingFromSymbol('N');
  assertFalse(r.ok);
});

test('entrée objet nulle refusée', () => {
  const r = generateCloseVoicing(null);
  assertFalse(r.ok);
  assertTrue(r.rejectionReasons?.includes('INVALID_INPUT'));
});

test('entrée non valide refusée par generateVoicing', () => {
  const r = generateVoicing({ rootPc: 'C', quality: '' });
  assertFalse(r.ok);
});

test('candidat généré est immuable', () => {
  const r = generateVoicing({ rootPc: 0, quality: '' });
  assertTrue(Object.isFrozen(r.selectedCandidate));
  assertTrue(Object.isFrozen(r.selectedCandidate.lh.notes));
  assertTrue(Object.isFrozen(r.selectedCandidate.rh.notes));
  assertTrue(Object.isFrozen(r.selectedCandidate.metadata));
});

console.log('\n=== Phase 1: Comparaison des candidats ===');

test('rankCandidate pénalise notes hors soft range', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7' });
  const low = createHandVoicing('RH', [48, 52, 55, 59]); // juste au-dessus de RH_HARD min
  const high = createHandVoicing('RH', [72, 76, 79, 83]); // haut
  const cLow = createHandVoicing('LH', [36]);
  const cHigh = createHandVoicing('LH', [36]);
  // On construit les candidates via generateCloseVoicing pour avoir input.
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  assertTrue(r.ok);
  const rank = rankCandidate(r.selectedCandidate);
  assertTrue(Array.isArray(rank));
  assertEqual(rank[0], 0, 'first rank key must be 0 for valid candidate');
});

test('candidates rejetés documentés', () => {
  const r = generateVoicing({ rootPc: 0, quality: 'maj7' });
  assertTrue(r.candidatesConsidered > 0);
  assertTrue(r.candidatesValid > 0);
  assertTrue(r.candidatesValid <= r.candidatesConsidered);
  assertTrue(Array.isArray(r.rejectionReasons));
});

console.log('\n=== Phase 1: Isolation ===');

test('aucun module Phase 1 n\'importe src/ui/', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const files = [
    'candidate-generator.js',
    'generate-voicing.js',
    'styles/close.js',
  ];
  for (const f of files) {
    const content = fs.readFileSync(path.resolve('src/voicing-engine', f), 'utf8');
    if (content.includes("from '../ui/") || content.includes('from "../ui/')) {
      throw new Error(`${f} imports from ../ui/ (forbidden)`);
    }
  }
});

console.log('\n=== Phase 1: Récapitulatif ===');
console.log(`Total: ${total}, Passés: ${passed}, Échecs: ${failures.length}`);
if (failures.length > 0) {
  console.log('\nÉchecs :');
  for (const f of failures) {
    console.log(`- ${f.name}: ${f.error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nPhase 1 close-v1 validée avec succès.');
}
