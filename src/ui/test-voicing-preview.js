// Tests Phase 1.5A — Read-Only Close Voicing Text Preview.
// Vérifie l'adaptateur UI, le modèle textuel et le rendu sans mutation.

import {
  effectiveChordToVoicingInput,
  buildVoicingTextModel,
  resolveUseSharps,
  setUseSharps,
  inferUseSharpsFromSymbol,
} from './voicing-preview.js';
import { generateVoicing } from '../voicing-engine/generate-voicing.js';
import { noteNameToMidi } from '../voicing-engine/midi-convention.js';

let total = 0;
let passed = 0;

function run(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, msg = '') {
  if (actual.length !== expected.length || !actual.every((v, i) => v === expected[i])) {
    throw new Error(`${msg} expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'expected true');
}

function assertFalse(value, msg = '') {
  if (value) throw new Error(msg || 'expected false');
}

// -----------------------------------------------------------------------------
// effectiveChordToVoicingInput
// -----------------------------------------------------------------------------
run('effectiveChordToVoicingInput — accord majeur simple', () => {
  const input = effectiveChordToVoicingInput('C');
  assertEqual(input.rootPc, 0);
  assertEqual(input.quality, '');
  assertEqual(input.bassPc, null);
});

run('effectiveChordToVoicingInput — slash chord C/E', () => {
  const input = effectiveChordToVoicingInput('C/E');
  assertEqual(input.rootPc, 0);
  assertEqual(input.quality, '');
  assertEqual(input.bassPc, 4);
});

run('effectiveChordToVoicingInput — Fm7/D', () => {
  const input = effectiveChordToVoicingInput('Fm7/D');
  assertEqual(input.rootPc, 5);
  assertEqual(input.quality, 'm7');
  assertEqual(input.bassPc, 2);
});

run('effectiveChordToVoicingInput — N retourne null', () => {
  assertEqual(effectiveChordToVoicingInput('N'), null);
});

run('effectiveChordToVoicingInput — chaîne vide retourne null', () => {
  assertEqual(effectiveChordToVoicingInput(''), null);
});

// -----------------------------------------------------------------------------
// buildVoicingTextModel — notation
// -----------------------------------------------------------------------------
run('buildVoicingTextModel — notation dièses pour [56,57,61,64]', () => {
  const result = generateVoicing({ rootPc: 0, quality: '' });
  const model = buildVoicingTextModel(result, { useSharps: true });
  assertEqual(model.state, 'ok');
  const rh = model.hands.find((h) => h.hand === 'RH');
  assertTrue(rh != null);
  const hasC4 = rh.names.includes('C4');
  const hasE4 = rh.names.includes('E4');
  assertTrue(hasC4, 'devrait contenir C4');
  assertTrue(hasE4, 'devrait contenir E4');
});

run('buildVoicingTextModel — notation bémols pour Ab3/G#3 selon préférence', () => {
  const result = generateVoicing({ rootPc: 8, quality: 'maj7' });
  const sharps = buildVoicingTextModel(result, { useSharps: true });
  const flats = buildVoicingTextModel(result, { useSharps: false });
  const rhSharp = sharps.hands.find((h) => h.hand === 'RH');
  const rhFlat = flats.hands.find((h) => h.hand === 'RH');
  assertTrue(rhSharp.names.some((n) => n.startsWith('G#')));
  assertTrue(rhFlat.names.some((n) => n.startsWith('Ab')));
  assertArrayEqual(rhSharp.midis, rhFlat.midis, 'les MIDI doivent être identiques');
});

run('buildVoicingTextModel — ordre MIDI strict', () => {
  const result = generateVoicing({ rootPc: 0, quality: '7' });
  const model = buildVoicingTextModel(result, { useSharps: true });
  const rh = model.hands.find((h) => h.hand === 'RH');
  for (let i = 1; i < rh.midis.length; i++) {
    assertTrue(rh.midis[i] > rh.midis[i - 1], 'les MIDI doivent être croissants');
  }
});

// -----------------------------------------------------------------------------
// Cas musicaux bloquants
// -----------------------------------------------------------------------------
run('Fm7/D — LH D2 et RH C4 Eb4 F4 Ab4 (sans A naturel)', () => {
  const result = generateVoicing({ rootPc: 5, quality: 'm7', bassPc: 2 });
  assertTrue(result.ok, `result not ok: ${result.rejectionReasons?.join('; ')}`);
  const model = buildVoicingTextModel(result, { useSharps: false });
  const lh = model.hands.find((h) => h.hand === 'LH');
  const rh = model.hands.find((h) => h.hand === 'RH');
  assertArrayEqual(lh.names, ['D2']);
  const rhSet = new Set(rh.names);
  assertTrue(rhSet.has('C4'));
  assertTrue(rhSet.has('Eb4'));
  assertTrue(rhSet.has('F4'));
  assertTrue(rhSet.has('Ab4'));
  assertFalse(rhSet.has('A4'), 'ne doit pas contenir A naturel');
});

run('Gm7b5 — RH contient Bb Db F G', () => {
  const result = generateVoicing({ rootPc: 10, quality: 'm7b5' });
  assertTrue(result.ok);
  const model = buildVoicingTextModel(result, { useSharps: false });
  const rh = model.hands.find((h) => h.hand === 'RH');
  const rhPcs = rh.midis.map((m) => m % 12).sort((a, b) => a - b);
  assertArrayEqual(rhPcs, [1, 4, 8, 10], 'pitch classes RH Gm7b5');
});

run('Fsus4 — RH contient Bb C F', () => {
  const result = generateVoicing({ rootPc: 5, quality: 'sus4' });
  assertTrue(result.ok);
  const model = buildVoicingTextModel(result, { useSharps: false });
  const rh = model.hands.find((h) => h.hand === 'RH');
  const rhPcs = rh.midis.map((m) => m % 12).sort((a, b) => a - b);
  assertArrayEqual(rhPcs, [0, 5, 10], 'pitch classes RH Fsus4');
});

run('Amaj7 — identité MIDI constante Ab3/Affichage G#3', () => {
  const result = generateVoicing({ rootPc: 9, quality: 'maj7' });
  assertTrue(result.ok);
  const sharps = buildVoicingTextModel(result, { useSharps: true });
  const flats = buildVoicingTextModel(result, { useSharps: false });
  const rhSharp = sharps.hands.find((h) => h.hand === 'RH');
  const rhFlat = flats.hands.find((h) => h.hand === 'RH');
  assertArrayEqual(rhSharp.midis, rhFlat.midis);
  const expectedPcs = new Set([1, 4, 8, 9]);
  const actualPcs = new Set(rhSharp.midis.map((m) => m % 12));
  assertEqual(actualPcs.size, expectedPcs.size);
  for (const pc of expectedPcs) {
    assertTrue(actualPcs.has(pc), `manque pc ${pc}`);
  }
  assertTrue(rhSharp.names.some((n) => n.startsWith('G#')));
  assertTrue(rhFlat.names.some((n) => n.startsWith('Ab')));
});

run('C/E — LH E2 et RH séparée (pas de both textuel)', () => {
  const result = generateVoicing({ rootPc: 0, quality: '', bassPc: 4 });
  assertTrue(result.ok);
  const model = buildVoicingTextModel(result, { useSharps: true });
  const lh = model.hands.find((h) => h.hand === 'LH');
  const rh = model.hands.find((h) => h.hand === 'RH');
  assertArrayEqual(lh.names, ['E2']);
  assertTrue(rh.names.includes('C4'));
  assertTrue(rh.names.includes('E4'));
  assertTrue(rh.names.includes('G4'));
});

run('C/G — LH G2', () => {
  const result = generateVoicing({ rootPc: 0, quality: '', bassPc: 7 });
  assertTrue(result.ok);
  const model = buildVoicingTextModel(result, { useSharps: true });
  const lh = model.hands.find((h) => h.hand === 'LH');
  assertArrayEqual(lh.names, ['G2']);
});

run('G7/B — LH B2', () => {
  const result = generateVoicing({ rootPc: 7, quality: '7', bassPc: 11 });
  assertTrue(result.ok);
  const model = buildVoicingTextModel(result, { useSharps: true });
  const lh = model.hands.find((h) => h.hand === 'LH');
  assertArrayEqual(lh.names, ['B2']);
});

// -----------------------------------------------------------------------------
// États indisponibles
// -----------------------------------------------------------------------------
run('Qualité non supportée — état unsupported', () => {
  const result = generateVoicing({ rootPc: 0, quality: '13' });
  assertFalse(result.ok);
  const model = buildVoicingTextModel(result);
  assertEqual(model.state, 'unsupported');
  assertEqual(model.reason, 'Qualité non supportée en V1');
});

run('NO_VALID_CLOSE_VOICING — état no-valid', () => {
  const fakeResult = {
    ok: false,
    input: { rootPc: 0, quality: '', bassPc: null },
    selectedCandidate: null,
    candidatesConsidered: 0,
    candidatesValid: 0,
    diagnostics: [],
    rejectionReasons: ['NO_VALID_CLOSE_VOICING'],
  };
  const model = buildVoicingTextModel(fakeResult);
  assertEqual(model.state, 'no-valid');
  assertEqual(model.reason, 'NO_VALID_CLOSE_VOICING');
});

// -----------------------------------------------------------------------------
// Immutabilité / absence de mutation
// -----------------------------------------------------------------------------
run('generateVoicing ne mute pas son entrée', () => {
  const input = { rootPc: 0, quality: '7', bassPc: null };
  const snapshot = JSON.stringify(input);
  generateVoicing(input);
  assertEqual(JSON.stringify(input), snapshot);
});

run('buildVoicingTextModel ne mute pas le résultat du moteur', () => {
  const result = generateVoicing({ rootPc: 0, quality: '' });
  const before = JSON.stringify(result);
  buildVoicingTextModel(result);
  assertEqual(JSON.stringify(result), before);
});

// -----------------------------------------------------------------------------
// Préférence enharmonique persistence
// -----------------------------------------------------------------------------
run('resolveUseSharps respecte setUseSharps', () => {
  const store = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
    },
  };
  try {
    setUseSharps(true);
    assertTrue(resolveUseSharps());
    setUseSharps(false);
    assertFalse(resolveUseSharps());
  } finally {
    globalThis.window = originalWindow;
  }
});

// -----------------------------------------------------------------------------
// Règles enharmoniques canoniques
// -----------------------------------------------------------------------------
run('inferUseSharpsFromSymbol — dièse explicite dans fondamentale', () => {
  assertTrue(inferUseSharpsFromSymbol('F#maj7'));
});

run('inferUseSharpsFromSymbol — bémol explicite dans fondamentale', () => {
  assertFalse(inferUseSharpsFromSymbol('Bbmaj7'));
});

run('inferUseSharpsFromSymbol — dièse explicite dans basse slash', () => {
  assertTrue(inferUseSharpsFromSymbol('E7/D#'));
});

run('inferUseSharpsFromSymbol — bémol explicite dans basse slash', () => {
  assertFalse(inferUseSharpsFromSymbol('C/Fb'));
});

run('inferUseSharpsFromSymbol — fondamentale conventionnellement diésée', () => {
  assertTrue(inferUseSharpsFromSymbol('Amaj7'));
  assertTrue(inferUseSharpsFromSymbol('E7'));
  assertTrue(inferUseSharpsFromSymbol('D'));
});

run('inferUseSharpsFromSymbol — fondamentale conventionnellement bémolée', () => {
  assertFalse(inferUseSharpsFromSymbol('Fm7'));
  assertFalse(inferUseSharpsFromSymbol('Bb7'));
  assertFalse(inferUseSharpsFromSymbol('Eb'));
});

run('inferUseSharpsFromSymbol — m7b5/dim bémolés par défaut', () => {
  assertFalse(inferUseSharpsFromSymbol('Gm7b5'));
  assertFalse(inferUseSharpsFromSymbol('Bdim'));
});

run('inferUseSharpsFromSymbol — aug diésé par défaut', () => {
  assertTrue(inferUseSharpsFromSymbol('Caug'));
});

run('inferUseSharpsFromSymbol — C indéterminé', () => {
  assertEqual(inferUseSharpsFromSymbol('C'), null);
});

run('E7/D# → LH D#2 et RH G#3 B3 D4 E4', () => {
  const input = effectiveChordToVoicingInput('E7/D#');
  const result = generateVoicing(input);
  const model = buildVoicingTextModel(result, { effectiveChord: 'E7/D#' });
  const lh = model.hands.find((h) => h.hand === 'LH');
  const rh = model.hands.find((h) => h.hand === 'RH');
  assertArrayEqual(lh.names, ['D#2']);
  assertTrue(rh.names.includes('G#3'));
  assertTrue(rh.names.includes('B3'));
  assertTrue(rh.names.includes('D4'));
  assertTrue(rh.names.includes('E4'));
  assertFalse(rh.names.includes('Ab3'));
  assertFalse(rh.names.includes('Eb2'));
});

run('Amaj7 → C# et G# affichés (pas Db ni Ab)', () => {
  const input = effectiveChordToVoicingInput('Amaj7');
  const result = generateVoicing(input);
  const model = buildVoicingTextModel(result, { effectiveChord: 'Amaj7' });
  const rh = model.hands.find((h) => h.hand === 'RH');
  assertTrue(rh.names.some((n) => n.startsWith('C#')));
  assertTrue(rh.names.some((n) => n.startsWith('G#')));
  assertFalse(rh.names.some((n) => n.startsWith('Db')));
  assertFalse(rh.names.some((n) => n.startsWith('Ab')));
});

run('Fm7/D → Eb et Ab affichés (pas D# ni G#)', () => {
  const input = effectiveChordToVoicingInput('Fm7/D');
  const result = generateVoicing(input);
  const model = buildVoicingTextModel(result, { effectiveChord: 'Fm7/D' });
  const rh = model.hands.find((h) => h.hand === 'RH');
  assertTrue(rh.names.includes('Eb4'));
  assertTrue(rh.names.includes('Ab4'));
  assertFalse(rh.names.includes('D#4'));
  assertFalse(rh.names.includes('G#4'));
});

run('Gm7b5 → Bb et Db affichés', () => {
  const input = effectiveChordToVoicingInput('Gm7b5');
  const result = generateVoicing(input);
  const model = buildVoicingTextModel(result, { effectiveChord: 'Gm7b5' });
  const rh = model.hands.find((h) => h.hand === 'RH');
  assertTrue(rh.names.includes('Bb3'));
  assertTrue(rh.names.includes('Db4'));
});

run('Mêmes MIDI, orthographe différente selon le contexte', () => {
  const inputSharp = effectiveChordToVoicingInput('E7/D#');
  const resultSharp = generateVoicing(inputSharp);
  const modelSharp = buildVoicingTextModel(resultSharp, { effectiveChord: 'E7/D#' });
  const rhSharp = modelSharp.hands.find((h) => h.hand === 'RH');

  // G#3 (contexte diésé) et Ab3 (contexte bémolé) partagent le même MIDI.
  const midi = noteNameToMidi('G#3');
  assertEqual(midi, noteNameToMidi('Ab3'), 'G#3 et Ab3 ont le même MIDI');

  const nameSharp = rhSharp.names[rhSharp.midis.indexOf(56)];
  assertEqual(nameSharp, 'G#3');

  // Même MIDI formaté comme si l’accord était Fm7/D (famille bémolée).
  const nameFlatContext = buildVoicingTextModel(resultSharp, { effectiveChord: 'Fm7/D' })
    .hands.find((h) => h.hand === 'RH')
    .names[rhSharp.midis.indexOf(56)];
  assertEqual(nameFlatContext, 'Ab3');
});

run('Octaves inchangées par la correction enharmonique', () => {
  const input = effectiveChordToVoicingInput('E7/D#');
  const result = generateVoicing(input);
  const model = buildVoicingTextModel(result, { effectiveChord: 'E7/D#' });
  const lh = model.hands.find((h) => h.hand === 'LH');
  assertEqual(noteNameToMidi('D#2'), noteNameToMidi('Eb2'));
  assertEqual(lh.midis[0], noteNameToMidi('D#2'));
});

// -----------------------------------------------------------------------------
// Résumé
// -----------------------------------------------------------------------------
console.log(`\n=== Phase 1.5A UI Voicing Preview : ${passed}/${total} tests OK ===`);
if (passed !== total) {
  process.exitCode = 1;
}
