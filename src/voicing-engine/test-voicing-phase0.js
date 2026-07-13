// Tests Phase 0 et 0.5 du Two-Hand Piano Voicing Engine V1.
// Objectif : valider fondations pures sans générer de voicings utilisateurs.
// Pas de dépendances src/ui/ autorisées ici.

import { normalizeVoicingInput, normalizeVoicingInputFromSymbol } from './chord-input.js';
import {
  pcOctaveToMidi,
  midiToPcOctave,
  midiToNoteName,
  noteNameToMidi,
  pcMidiInstances,
  NOTE_NAMING_POLICY,
} from './midi-convention.js';
import {
  LH_HARD_RANGE,
  LH_SOFT_RANGE,
  RH_HARD_RANGE,
  RH_SOFT_RANGE,
  LH_MAX_SPAN,
  RH_MAX_SPAN,
  midiInRange,
  span,
  isIntegerMidi,
} from './hand-ranges.js';
import {
  DEFAULT_HAND_METADATA,
  createDefaultCandidateMetadata,
  createHandVoicing,
  createVoicingCandidate,
} from './data-model.js';
import { checkHandHardConstraints, checkCandidateHardConstraints, measureSoftConstraintFeatures } from './constraints.js';
import { INVARIANT_CORPUS, findInvariant, invariantsByClassification } from './corpus-invariants.js';
import { isSupportedInV1, isKnownQuality, qualityCategory, VOICING_V1_VOCABULARY } from './vocabulary.js';

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

function assertValid(result) {
  if (!result.valid) throw new Error(`expected valid, got errors: ${result.errors.join('; ')}`);
}

function assertInvalid(result) {
  if (result.valid || result.errors.length === 0) throw new Error('expected invalid');
}

console.log('\n=== Phase 0.5: Contrat d\'entrée ===');

test('normalizeVoicingInput valide pour Cmaj7', () => {
  const r = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  assertValid(r);
  assertEqual(r.rootPc, 0);
  assertEqual(r.quality, 'maj7');
  assertArrayEqual(r.chordTonePcs, [0, 4, 7, 11]);
  assertEqual(r.bassIsInChord, false);
});

test('normalizeVoicingInput avec basse slash', () => {
  const r = normalizeVoicingInput({ rootPc: 2, quality: 'm7', bassPc: 9 }); // Dm/A
  assertValid(r);
  assertSetEqual(r.chordTonePcs, [2, 5, 9, 0]); // D F A C
  assertEqual(r.bassIsInChord, true);
});

test('normalizeVoicingInput refuse rootPc invalide', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 12, quality: 'maj7', bassPc: null }));
});

test('normalizeVoicingInput refuse quality inconnue', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 0, quality: 'weird', bassPc: null }));
});

test('normalizeVoicingInput refuse basse hors plage', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: -1 }));
});

test('normalizeVoicingInputFromSymbol Cmaj7/D', () => {
  const r = normalizeVoicingInputFromSymbol('Cmaj7/D');
  assertValid(r);
  assertEqual(r.rootPc, 0);
  assertEqual(r.quality, 'maj7');
  assertEqual(r.bassPc, 2);
  assertArrayEqual(r.chordTonePcs, [0, 4, 7, 11]);
});

test('normalizeVoicingInputFromSymbol refuse N', () => {
  assertInvalid(normalizeVoicingInputFromSymbol('N'));
});

// Tests Phase 0.5 — VoicingInput frontières

test('rootPc = 0 (C) valide', () => {
  const r = normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: null });
  assertValid(r);
  assertEqual(r.rootPc, 0);
});

test('rootPc = 11 (B) valide', () => {
  const r = normalizeVoicingInput({ rootPc: 11, quality: '', bassPc: null });
  assertValid(r);
  assertEqual(r.rootPc, 11);
});

test('rootPc négatif invalide', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: -1, quality: '', bassPc: null }));
});

test('rootPc = 12 invalide', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 12, quality: '', bassPc: null }));
});

test('rootPc float invalide', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 5.5, quality: '', bassPc: null }));
});

test('rootPc string invalide', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 'C', quality: '', bassPc: null }));
});

test('rootPc NaN invalide', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: NaN, quality: '', bassPc: null }));
});

test('bassPc = 0 (C) valide', () => {
  const r = normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: 0 });
  assertValid(r);
  assertEqual(r.bassPc, 0);
  assertEqual(r.bassIsInChord, true);
});

test('bassPc = 11 (B) valide', () => {
  const r = normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: 11 });
  assertValid(r);
  assertEqual(r.bassPc, 11);
  assertEqual(r.bassIsInChord, false);
});

test('bassPc négative invalide', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: -1 }));
});

test('bassPc > 11 invalide', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: 12 }));
});

test('absence de basse', () => {
  const r = normalizeVoicingInput({ rootPc: 0, quality: 'maj7' });
  assertValid(r);
  assertEqual(r.bassPc, null);
  assertEqual(r.bassIsInChord, false);
});

test('objet d\'entrée non modifié', () => {
  const input = { rootPc: 0, quality: 'maj7', bassPc: null };
  normalizeVoicingInput(input);
  assertEqual(input.rootPc, 0);
  assertEqual(input.quality, 'maj7');
  assertEqual(input.bassPc, null);
});

test('résultat immuable', () => {
  const r = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  assertValid(r);
  const originalRootPc = r.rootPc;
  const originalLength = r.chordTonePcs.length;
  let thrown = false;
  try {
    r.rootPc = 99;
  } catch (e) {
    thrown = true;
  }
  try {
    r.chordTonePcs.push(99);
  } catch (e) {
    thrown = true;
  }
  assertTrue(thrown, 'au moins une mutation aurait dû lever une erreur');
  assertEqual(r.rootPc, originalRootPc);
  assertEqual(r.chordTonePcs.length, originalLength);
});

test('résultat invalide également immuable', () => {
  const r = normalizeVoicingInput({ rootPc: 99, quality: 'maj7', bassPc: null });
  assertInvalid(r);
  const originalLength = r.errors.length;
  let thrown = false;
  try {
    r.errors.push('extra');
  } catch (e) {
    thrown = true;
  }
  assertTrue(thrown, 'la mutation de errors aurait dû lever une erreur');
  assertEqual(r.errors.length, originalLength);
});

const SUPPORTED_V1_QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim', 'aug', 'sus2', 'sus4'];

test('toutes les qualités supportées V1', () => {
  for (const q of SUPPORTED_V1_QUALITIES) {
    const r = normalizeVoicingInput({ rootPc: 0, quality: q, bassPc: null });
    if (!r.valid) {
      throw new Error(`quality ${JSON.stringify(q)} should be valid, got ${r.errors.join('; ')}`);
    }
    assertTrue(isSupportedInV1(q), `quality ${q} should be in vocabulary`);
  }
});

test('qualité future reconnue mais non supportée V1', () => {
  const r = normalizeVoicingInput({ rootPc: 0, quality: '9', bassPc: null });
  assertValid(r); // Le contrat l\'accepte, le générateur V1 la refusera
  assertFalse(isSupportedInV1('9'));
  assertEqual(qualityCategory('9'), 'futurePhase');
});

test('qualité inconnue rejetée', () => {
  assertInvalid(normalizeVoicingInput({ rootPc: 0, quality: 'XYZ', bassPc: null }));
  assertFalse(isKnownQuality('XYZ'));
});

test('normalizeVoicingInputFromSymbol refuse nom de note invalide', () => {
  const r = normalizeVoicingInputFromSymbol('H7');
  assertInvalid(r);
});

test('normalizeVoicingInputFromSymbol refuse basse invalide', () => {
  const r = normalizeVoicingInputFromSymbol('C/X');
  assertInvalid(r);
});

test('normalizeVoicingInputFromSymbol accorde basse bémol', () => {
  const r = normalizeVoicingInputFromSymbol('C/Bb');
  assertValid(r);
  assertEqual(r.bassPc, 10);
});

console.log('\n=== Phase 0.5: Convention MIDI et notation ===');

test('C4 = MIDI 60', () => {
  assertEqual(pcOctaveToMidi(0, 4), 60);
});

test('C2 = 36, C3 = 48, C5 = 72, C6 = 84', () => {
  assertEqual(pcOctaveToMidi(0, 2), 36);
  assertEqual(pcOctaveToMidi(0, 3), 48);
  assertEqual(pcOctaveToMidi(0, 5), 72);
  assertEqual(pcOctaveToMidi(0, 6), 84);
});

test('A0 = 21', () => {
  assertEqual(pcOctaveToMidi(9, 0), 21);
});

test('midiToPcOctave C4 roundtrip', () => {
  const { pc, octave } = midiToPcOctave(60);
  assertEqual(pc, 0);
  assertEqual(octave, 4);
});

test('frontières B3/C4 et B4/C5', () => {
  assertEqual(midiToNoteName(59), 'B3');
  assertEqual(midiToNoteName(60), 'C4');
  assertEqual(midiToNoteName(71), 'B4');
  assertEqual(midiToNoteName(72), 'C5');
});

test('midiToNoteName en dièses', () => {
  assertEqual(midiToNoteName(70, { useSharps: true }), 'A#4');
  assertEqual(midiToNoteName(61, { useSharps: true }), 'C#4');
});

test('midiToNoteName en bémols par défaut', () => {
  assertEqual(midiToNoteName(70), 'Bb4');
  assertEqual(midiToNoteName(61), 'Db4');
  assertEqual(NOTE_NAMING_POLICY.defaultUseSharps, false);
});

test('noteNameToMidi valide', () => {
  assertEqual(noteNameToMidi('C4'), 60);
  assertEqual(noteNameToMidi('Bb2'), 46);
  assertEqual(noteNameToMidi('F#3'), 54);
  assertEqual(noteNameToMidi('A#4'), 70);
  assertEqual(noteNameToMidi('Db4'), 61);
});

test('noteNameToMidi avec entrée invalide retourne null', () => {
  assertEqual(noteNameToMidi(''), null);
  assertEqual(noteNameToMidi(null), null);
  assertEqual(noteNameToMidi('H4'), null);
  assertEqual(noteNameToMidi('C'), null);
  assertEqual(noteNameToMidi('C4x'), null);
});

test('doubles altérations rejetées', () => {
  assertEqual(noteNameToMidi('C##4'), null);
  assertEqual(noteNameToMidi('Bbb3'), null);
});

test('round-trip nom → MIDI → nom avec politique documentée', () => {
  const midi = noteNameToMidi('Bb2');
  assertEqual(midi, 46);
  assertEqual(midiToNoteName(midi), 'Bb2');
  assertEqual(midiToNoteName(midi, { useSharps: true }), 'A#2');
});

test('pcMidiInstances C', () => {
  assertArrayEqual(pcMidiInstances(0, 2, 4), [36, 48, 60]);
});

test('pcMidiInstances avec minOctave > maxOctave retourne []', () => {
  assertArrayEqual(pcMidiInstances(0, 5, 2), []);
});

test('les douze pitch classes dans plusieurs octaves', () => {
  for (let pc = 0; pc < 12; pc++) {
    const midi = pcOctaveToMidi(pc, 4);
    const { pc: back, octave } = midiToPcOctave(midi);
    assertEqual(back, pc);
    assertEqual(octave, 4);
  }
});

test('resolveCanonicalChordDefinition choisit la définition normale malgré une variante rootless plus loin', async () => {
  const { resolveCanonicalChordDefinition } = await import('../chord-engine/chord-display.js');
  const def = resolveCanonicalChordDefinition('m7b5');
  assertTrue(!!def, 'definition should be found');
  assertArrayEqual(def.intervals, [0, 3, 6, 10]);
  assertEqual(def.parentSymbol, undefined);
});

console.log('\n=== Phase 0.6: Valeurs MIDI non entières ===');

test('midiInRange accepte entier et rejette 36.5, NaN, Infinity et string', () => {
  assertTrue(midiInRange(36, LH_HARD_RANGE));
  assertFalse(midiInRange(36.5, LH_HARD_RANGE));
  assertFalse(midiInRange(NaN, LH_HARD_RANGE));
  assertFalse(midiInRange(Infinity, LH_HARD_RANGE));
  assertFalse(midiInRange('36', LH_HARD_RANGE));
});

test('isIntegerMidi true pour entier, false sinon', async () => {
  const { isIntegerMidi } = await import('./hand-ranges.js');
  assertTrue(isIntegerMidi(60));
  assertFalse(isIntegerMidi(60.5));
  assertFalse(isIntegerMidi(NaN));
  assertFalse(isIntegerMidi(Infinity));
  assertFalse(isIntegerMidi('60'));
});

test('isIntegerMidi true pour entier, false sinon', async () => {
  const { isIntegerMidi } = await import('./hand-ranges.js');
  assertTrue(isIntegerMidi(60));
  assertFalse(isIntegerMidi(60.5));
  assertFalse(isIntegerMidi(NaN));
  assertFalse(isIntegerMidi(Infinity));
  assertFalse(isIntegerMidi('60'));
});

test('pcOctaveToMidi rejette arguments non entiers', () => {
  assertEqual(pcOctaveToMidi(0, 4), 60);
  let threw = false;
  try { pcOctaveToMidi(0.5, 4); } catch (e) { threw = true; }
  assertTrue(threw, 'pcOctaveToMidi should throw on non-integer pc');
  threw = false;
  try { pcOctaveToMidi(0, 4.5); } catch (e) { threw = true; }
  assertTrue(threw, 'pcOctaveToMidi should throw on non-integer octave');
});

test('midiToPcOctave rejette MIDI non entier', () => {
  assertEqual(midiToPcOctave(60).pc, 0);
  let threw = false;
  try { midiToPcOctave(60.5); } catch (e) { threw = true; }
  assertTrue(threw, 'midiToPcOctave should throw on non-integer midi');
  threw = false;
  try { midiToPcOctave(NaN); } catch (e) { threw = true; }
  assertTrue(threw, 'midiToPcOctave should throw on NaN');
});

test('noteNameToMidi rejette nom avec octave non entier', () => {
  assertEqual(noteNameToMidi('C4.5'), null);
  assertEqual(noteNameToMidi('CNaN'), null);
});

test('pcMidiInstances ignore octaves non entiers', async () => {
  const mod = await import('./midi-convention.js');
  assertArrayEqual(mod.pcMidiInstances(0, 2, 4), [36, 48, 60]);
  let threw = false;
  try { mod.pcMidiInstances(0, 2.5, 4); } catch (e) { threw = true; }
  assertTrue(threw, 'pcMidiInstances should throw on non-integer octaves');
});

test('createHandVoicing rejette MIDI non entier', () => {
  let threw = false;
  try { createHandVoicing('LH', [36.5]); } catch (e) { threw = true; }
  assertTrue(threw, 'createHandVoicing should throw on float midi');
  threw = false;
  try { createHandVoicing('RH', [NaN]); } catch (e) { threw = true; }
  assertTrue(threw, 'createHandVoicing should throw on NaN midi');
  threw = false;
  try { createHandVoicing('LH', [Infinity]); } catch (e) { threw = true; }
  assertTrue(threw, 'createHandVoicing should throw on Infinity midi');
  threw = false;
  try { createHandVoicing('RH', ['60']); } catch (e) { threw = true; }
  assertTrue(threw, 'createHandVoicing should throw on string midi');
});

test('checkHandHardConstraints rejette LH avec float, NaN, Infinity et string', () => {
  const cases = [36.5, NaN, Infinity, '36'];
  for (const bad of cases) {
    let threw = false;
    try { createHandVoicing('LH', [bad]); } catch (e) { threw = true; }
    assertTrue(threw, `createHandVoicing(LH, [${bad}]) should throw`);
  }
});

test('checkHandHardConstraints rejette RH avec float, NaN, Infinity et string', () => {
  const cases = [60.5, NaN, Infinity, '60'];
  for (const bad of cases) {
    let threw = false;
    try { createHandVoicing('RH', [bad]); } catch (e) { threw = true; }
    assertTrue(threw, `createHandVoicing(RH, [${bad}]) should throw`);
  }
});

console.log('\n=== Phase 0.5: Plages des mains ===');

test('LH hard range 28-55', () => {
  assertEqual(LH_HARD_RANGE.min, 28);
  assertEqual(LH_HARD_RANGE.max, 55);
  assertTrue(midiInRange(36, LH_HARD_RANGE));
  assertTrue(!midiInRange(27, LH_HARD_RANGE));
  assertTrue(!midiInRange(56, LH_HARD_RANGE));
});

test('LH soft range C2-C3 (36-48)', () => {
  assertEqual(LH_SOFT_RANGE.min, 36);
  assertEqual(LH_SOFT_RANGE.max, 48);
});

test('RH hard range 48-84', () => {
  assertEqual(RH_HARD_RANGE.min, 48);
  assertEqual(RH_HARD_RANGE.max, 84);
  assertTrue(midiInRange(60, RH_HARD_RANGE));
  assertTrue(!midiInRange(47, RH_HARD_RANGE));
  assertTrue(!midiInRange(85, RH_HARD_RANGE));
});

test('RH soft range G3-C5 (55-72)', () => {
  assertEqual(RH_SOFT_RANGE.min, 55);
  assertEqual(RH_SOFT_RANGE.max, 72);
});

test('span', () => {
  assertEqual(span([36, 48]), 12);
  assertEqual(span([60, 64, 67]), 7);
  assertEqual(span([]), 0);
  assertEqual(span([60]), 0);
});

test('LH max span <= 12', () => assertEqual(LH_MAX_SPAN, 12));
test('RH max span <= 16', () => assertEqual(RH_MAX_SPAN, 16));

console.log('\n=== Phase 0.5: Contraintes hard ===');

test('checkHandHardConstraints accepte LH valide', () => {
  const h = createHandVoicing('LH', [36, 43, 48]);
  assertValid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints refuse LH hors range', () => {
  const h = createHandVoicing('LH', [36, 43, 56]);
  assertInvalid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints refuse doublon LH', () => {
  const h = createHandVoicing('LH', [36, 36, 43]);
  assertInvalid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints refuse span trop grand LH', () => {
  const h = createHandVoicing('LH', [36, 49]);
  assertInvalid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints accepte RH valide', () => {
  const h = createHandVoicing('RH', [55, 60, 64, 67]);
  assertValid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints refuse RH sous limite', () => {
  const h = createHandVoicing('RH', [47, 60, 64]);
  assertInvalid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints refuse RH au-dessus limite', () => {
  const h = createHandVoicing('RH', [60, 64, 85]);
  assertInvalid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints accepte RH span exactement 16', () => {
  const h = createHandVoicing('RH', [55, 71]);
  assertValid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints refuse RH span 17', () => {
  const h = createHandVoicing('RH', [55, 72]);
  assertInvalid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints refuse doublon RH', () => {
  const h = createHandVoicing('RH', [60, 60, 64]);
  assertInvalid(checkHandHardConstraints(h));
});

test('checkHandHardConstraints accepte main vide', () => {
  const h = createHandVoicing('LH', []);
  assertValid(checkHandHardConstraints(h));
});

test('checkCandidateHardConstraints accepte candidate valide', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [36, 43, 48]);
  const rh = createHandVoicing('RH', [55, 60, 64, 67]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertValid(checkCandidateHardConstraints(c));
});

test('checkCandidateHardConstraints refuse croisement', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [36, 43, 60]);
  const rh = createHandVoicing('RH', [55, 64, 67, 71]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertInvalid(checkCandidateHardConstraints(c));
});

test('checkCandidateHardConstraints accepte main gauche vide', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', []);
  const rh = createHandVoicing('RH', [55, 60, 64, 67]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertValid(checkCandidateHardConstraints(c));
});

test('checkCandidateHardConstraints accepte main droite vide', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [36, 43, 48]);
  const rh = createHandVoicing('RH', []);
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertValid(checkCandidateHardConstraints(c));
});

test('checkCandidateHardConstraints accepte les deux mains vides', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', []);
  const rh = createHandVoicing('RH', []);
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertValid(checkCandidateHardConstraints(c));
});

test('checkCandidateHardConstraints max(LH) === min(RH) est autorisé', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [36, 48]); // max = 48
  const rh = createHandVoicing('RH', [48, 55, 60]); // min = 48
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertValid(checkCandidateHardConstraints(c));
});

test('checkCandidateHardConstraints max(LH) > min(RH) est invalide', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [36, 49]); // max = 49
  const rh = createHandVoicing('RH', [48, 55, 60]); // min = 48
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertInvalid(checkCandidateHardConstraints(c));
});

test('notes exactement aux limites hard', () => {
  const lhMin = createHandVoicing('LH', [28]);
  const lhMax = createHandVoicing('LH', [55]);
  const rhMin = createHandVoicing('RH', [48]);
  const rhMax = createHandVoicing('RH', [84]);
  assertValid(checkHandHardConstraints(lhMin));
  assertValid(checkHandHardConstraints(lhMax));
  assertValid(checkHandHardConstraints(rhMin));
  assertValid(checkHandHardConstraints(rhMax));
});

test('notes juste hors des limites hard', () => {
  const lhBelow = createHandVoicing('LH', [27]);
  const lhAbove = createHandVoicing('LH', [56]);
  const rhBelow = createHandVoicing('RH', [47]);
  const rhAbove = createHandVoicing('RH', [85]);
  assertInvalid(checkHandHardConstraints(lhBelow));
  assertInvalid(checkHandHardConstraints(lhAbove));
  assertInvalid(checkHandHardConstraints(rhBelow));
  assertInvalid(checkHandHardConstraints(rhAbove));
});

test('checkCandidateHardConstraints vérifie slash bass correcte', () => {
  const input = normalizeVoicingInput({ rootPc: 2, quality: 'm7', bassPc: 9 }); // Dm/A
  const lh = createHandVoicing('LH', [45, 50, 54]);
  const rh = createHandVoicing('RH', [62, 69]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertValid(checkCandidateHardConstraints(c));
});

test('checkCandidateHardConstraints détecte basse slash non la plus grave', () => {
  const input = normalizeVoicingInput({ rootPc: 2, quality: 'm7', bassPc: 9 }); // Dm/A
  const lh = createHandVoicing('LH', [38, 45, 50]);
  const rh = createHandVoicing('RH', [62, 69]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertInvalid(checkCandidateHardConstraints(c));
});

console.log('\n=== Phase 0.5: Soft features ===');

test('measureSoftConstraintFeatures compte notes dans soft ranges', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [43]);
  const rh = createHandVoicing('RH', [59, 60, 64]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  const f = measureSoftConstraintFeatures(c);
  assertEqual(f.lhNotesInSoft, 1);
  assertEqual(f.rhNotesInSoft, 3);
  assertEqual(f.totalNotesInSoft, 4);
  assertEqual(f.completeness, 4);
  assertEqual(f.doublings, 0);
  assertEqual(f.omissions, 0);
});

test('measureSoftConstraintFeatures détecte omission', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [36]);
  const rh = createHandVoicing('RH', [64]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  const f = measureSoftConstraintFeatures(c);
  assertEqual(f.completeness, 2);
  assertEqual(f.omissions, 2);
  assertEqual(f.doublings, 0);
});

test('measureSoftConstraintFeatures compte doublures', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [36]); // C
  const rh = createHandVoicing('RH', [60, 64, 67, 71]); // C + E + G + B (C doublé)
  const c = createVoicingCandidate(input, lh, rh, 0);
  const f = measureSoftConstraintFeatures(c);
  assertEqual(f.doublings, 1);
  assertEqual(f.completeness, 4);
  assertEqual(f.omissions, 0);
});

test('measureSoftConstraintFeatures notes hard mais hors soft', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: null });
  const lh = createHandVoicing('LH', [29]); // hard OK, soft KO
  const rh = createHandVoicing('RH', [84]); // hard OK, soft KO
  const c = createVoicingCandidate(input, lh, rh, 0);
  const f = measureSoftConstraintFeatures(c);
  assertEqual(f.lhNotesInSoft, 0);
  assertEqual(f.rhNotesInSoft, 0);
  assertEqual(f.totalNotesInSoft, 0);
});

test('measureSoftConstraintFeatures notes exactement aux limites soft', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: null });
  const lh = createHandVoicing('LH', [36, 48]); // limites soft LH
  const rh = createHandVoicing('RH', [55, 72]); // limites soft RH
  const c = createVoicingCandidate(input, lh, rh, 0);
  const f = measureSoftConstraintFeatures(c);
  assertEqual(f.lhNotesInSoft, 2);
  assertEqual(f.rhNotesInSoft, 2);
});

test('measureSoftConstraintFeatures span nul avec une seule note', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: '', bassPc: null });
  const lh = createHandVoicing('LH', [36]);
  const rh = createHandVoicing('RH', [60]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  const f = measureSoftConstraintFeatures(c);
  assertEqual(f.lhSpan, 0);
  assertEqual(f.rhSpan, 0);
  assertEqual(f.totalSpan, 24);
});

test('measureSoftConstraintFeatures mesure bassToRightGap', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: 2 }); // C/E
  const lh = createHandVoicing('LH', [40]); // E
  const rh = createHandVoicing('RH', [64, 67, 71]); // E-G-C
  const c = createVoicingCandidate(input, lh, rh, 0);
  const f = measureSoftConstraintFeatures(c);
  assertEqual(f.bassToRightGap, 24); // 64 - 40
});

test('measureSoftConstraintFeatures est déterministe', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [43]);
  const rh = createHandVoicing('RH', [59, 60, 64]);
  const c = createVoicingCandidate(input, lh, rh, 0);
  const f1 = measureSoftConstraintFeatures(c);
  const f2 = measureSoftConstraintFeatures(c);
  assertEqual(JSON.stringify(f1), JSON.stringify(f2));
});

test('soft features ne rendent jamais un candidat invalide', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', [36]);
  const rh = createHandVoicing('RH', [84]); // très aigu, mais hard OK
  const c = createVoicingCandidate(input, lh, rh, 0);
  // Les soft features retournent des mesures, pas de flag valid
  const f = measureSoftConstraintFeatures(c);
  assertTrue(typeof f.completeness === 'number');
  assertTrue(typeof f.doublings === 'number');
  assertTrue(typeof f.omissions === 'number');
});

test('soft features placeholders suffixés Reserved', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const c = createVoicingCandidate(input, createHandVoicing('LH', []), createHandVoicing('RH', []), 0);
  const f = measureSoftConstraintFeatures(c);
  assertEqual(f.bassDistanceFromIdealLowReserved, 0);
  assertEqual(f.voiceLeadingCostReserved, 0);
});

console.log('\n=== Phase 0.5: Data model immuable ===');

test('DEFAULT_HAND_METADATA rootless false', () => {
  assertEqual(DEFAULT_HAND_METADATA.rootless, false);
});

test('createDefaultCandidateMetadata generatorId vide', () => {
  const m = createDefaultCandidateMetadata();
  assertEqual(m.generatorId, '');
  assertEqual(m.rootless, false);
});

test('createHandVoicing trie les notes', () => {
  const h = createHandVoicing('LH', [48, 36, 43]);
  assertArrayEqual(h.notes, [36, 43, 48]);
  assertEqual(h.hand, 'LH');
  assertEqual(h.metadata.rootless, false);
});

test('createVoicingCandidate immuable', () => {
  const input = normalizeVoicingInput({ rootPc: 0, quality: 'maj7', bassPc: null });
  const lh = createHandVoicing('LH', []);
  const rh = createHandVoicing('RH', []);
  const c = createVoicingCandidate(input, lh, rh, 0);
  assertEqual(c.score, 0);
  assertEqual(c.metadata.rootless, false);
  assertTrue(Object.isFrozen(c));
  assertTrue(Object.isFrozen(c.lh));
  assertTrue(Object.isFrozen(c.lh.notes));
});

console.log('\n=== Phase 0.5: Corpus enrichi ===');

test('INVARIANT_CORPUS contient au moins 48 cas', () => {
  assertTrue(INVARIANT_CORPUS.length >= 48, `got ${INVARIANT_CORPUS.length}`);
});

test('INVARIANT_CORPUS contient au moins 6 fondamentales différentes', () => {
  const roots = new Set(INVARIANT_CORPUS.map((c) => {
    const input = normalizeVoicingInputFromSymbol(c.symbol);
    return input.rootPc;
  }));
  assertTrue(roots.size >= 6, `got ${roots.size} distinct roots`);
});

test('INVARIANT_CORPUS contient au moins 10 qualités V1 distinctes', () => {
  const qualities = new Set(INVARIANT_CORPUS.map((c) => {
    const input = normalizeVoicingInputFromSymbol(c.symbol);
    return input.quality;
  }));
  const supported = [...qualities].filter((q) => isSupportedInV1(q));
  assertTrue(supported.length >= 10, `got ${supported.length} supported qualities: ${supported.join(',')}`);
});

test('INVARIANT_CORPUS classifications non vides', () => {
  const hard = invariantsByClassification('hard_invariants');
  const acceptable = invariantsByClassification('acceptable_properties');
  const style = invariantsByClassification('style_preferences');
  const out = invariantsByClassification('out_of_scope');
  assertTrue(hard.length > 0, 'hard_invariants should not be empty');
  assertTrue(acceptable.length > 0, 'acceptable_properties should not be empty');
  assertTrue(style.length > 0, 'style_preferences should not be empty');
  assertTrue(out.length > 0, 'out_of_scope should not be empty');
});

test('tous les cas du corpus ont rootPcSet et basse cohérents', () => {
  for (const c of INVARIANT_CORPUS) {
    const input = normalizeVoicingInputFromSymbol(c.symbol);
    if (!input.valid) {
      throw new Error(`failed to parse ${c.symbol}: ${input.errors.join('; ')}`);
    }
    assertSetEqual(input.chordTonePcs, c.expectedPcSet, `${c.name}: `);
    const effectiveBass = input.bassPc != null ? input.bassPc : input.rootPc;
    assertEqual(effectiveBass, c.expectedBassPc, `${c.name}: `);
  }
});

test('findInvariant retourne le bon cas', () => {
  assertEqual(findInvariant('Cmaj7')?.name, 'Cmaj7');
  assertTrue(findInvariant('XYZ') === undefined);
});

test('non-régression Fmaj7/D : pas de A naturel si on attendait Fm7/D', () => {
  const input = normalizeVoicingInputFromSymbol('Fmaj7/D');
  assertValid(input);
  assertSetEqual(input.chordTonePcs, [0, 4, 5, 9], 'Fmaj7/D chord tones ');
  assertEqual(input.bassPc, 2, 'bass D');
  assertTrue(input.chordTonePcs.includes(9), 'Fmaj7/D must contain A natural');
  assertTrue(!input.chordTonePcs.includes(8), 'Fmaj7/D must NOT contain Ab');
});

console.log('\n=== Phase 0.5: Vocabulaire V1 ===');

test('vocabulaire supporte exactement les 10 qualités V1', () => {
  for (const q of SUPPORTED_V1_QUALITIES) {
    assertTrue(isSupportedInV1(q), `${q} should be supported`);
  }
  const supported = Object.keys(VOICING_V1_VOCABULARY).filter((q) => isSupportedInV1(q));
  assertEqual(supported.length, 10);
});

test('vocabulaire classe correctement qualités future et inconnues', () => {
  assertEqual(qualityCategory('9'), 'futurePhase');
  assertEqual(qualityCategory('13'), 'futurePhase');
  assertFalse(isKnownQuality('XYZ'));
  assertEqual(qualityCategory('XYZ'), 'unknown');
});

console.log('\n=== Phase 0.5: Isolation du voicing-engine ===');

test('aucun module du voicing-engine n\'importe src/ui/', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'test-voicing-phase0.js');
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/from\s+['"]\.\.\/ui\//.test(content)) {
      throw new Error(`${f} imports from ../ui/ (forbidden)`);
    }
    if (/from\s+['"]\.\.\/ui\.js['"]/.test(content)) {
      throw new Error(`${f} imports ui.js (forbidden)`);
    }
  }
});

test('chord-engine/chord-display.js n\'importe pas src/ui/', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../chord-engine/chord-display.js');
  const content = fs.readFileSync(file, 'utf8');
  if (/from\s+['"]\.\.\/ui\//.test(content)) {
    throw new Error('chord-display.js imports from ../ui/ (forbidden)');
  }
});

console.log('\n=== Phase 0.5: Récapitulatif ===');
console.log(`Total: ${total}, Passés: ${passed}, Échecs: ${failures.length}`);
if (failures.length > 0) {
  console.log('\nÉchecs :');
  for (const f of failures) {
    console.log(`- ${f.name}: ${f.error.stack || f.error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nPhase 0.5 validée avec succès.');
}
