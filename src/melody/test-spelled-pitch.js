// [OpenCode] — 2026-08-06 — Tests de l'Incrément 3 : modèle enharmonique
// et stabilisation des contrats musicaux partagés.
// Exécutable avec : node src/melody/test-spelled-pitch.js

import {
  createSpelledPitch,
  validateSpelledPitch,
  pitchClassFromSpelling,
  sameSound,
  sameSpelling,
  spellPitchClass,
  spellMidiNote,
  spellScale,
  spellChordReference,
  parseSpelledChordSymbol,
  setPreferredKeySpelling,
  clearPreferredKeySpelling,
  createSpelledKeyFromKeyObject,
  createSpelledKeyFromTonicSpelling,
  formatSpelledPitch,
} from './spelled-pitch.js';
import {
  estimateTonalContextFromMelody,
  setManualTonalContext,
  correctTonalContext,
  clearTonalConfirmation,
} from './tonal-context.js';
import {
  createHarmonicContext,
  setStartChord,
  setEndChord,
  setStartChordLocked,
  setEndChordLocked,
  addHarmonicAnchor,
  validateHarmonicContext,
} from './harmonic-context.js';
import { createMelodyTrack } from './melody-track.js';
import { createMidiCapture } from './midi-capture.js';

let total = 0;
let passed = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name} : ${err.message}`);
    process.exitCode = 1;
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

function assertDeepEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, msg = '') {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error(msg || 'expected function to throw');
}

function assertNotNull(value, msg = '') {
  if (value == null) throw new Error(msg || 'expected non-null');
}

function makeCMajorTrack() {
  const capture = createMidiCapture();
  const notes = [60, 62, 64, 65, 67];
  for (const note of notes) {
    capture.noteOn(note, 0.8, 0);
    capture.noteOff(note, 0, 0);
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-spell' });
}

function makeShortTrack() {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.noteOff(60, 0, 0);
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-short' });
}

console.log('=== Incrément 3 — Orthographe enharmonique et contrats stabilisés ===\n');

// ===========================================================================
// A. SpelledPitch — identité sonore vs orthographe
// ===========================================================================

runTest('A01 — C# et Db ont la même pitchClass', () => {
  const cs = createSpelledPitch({ pitchClass: 1, letter: 'C', accidental: 1, octave: 4, origin: 'manual', explicit: true });
  const db = createSpelledPitch({ pitchClass: 1, letter: 'D', accidental: -1, octave: 4, origin: 'manual', explicit: true });
  assertEqual(cs.pitchClass, 1);
  assertEqual(db.pitchClass, 1);
});

runTest('A02 — C# et Db n\'ont pas la même orthographe', () => {
  const cs = createSpelledPitch({ pitchClass: 1, letter: 'C', accidental: 1, octave: 4, origin: 'manual', explicit: true });
  const db = createSpelledPitch({ pitchClass: 1, letter: 'D', accidental: -1, octave: 4, origin: 'manual', explicit: true });
  assertTrue(sameSound(cs, db));
  assertFalse(sameSpelling(cs, db));
  assertEqual(cs.letter, 'C');
  assertEqual(db.letter, 'D');
});

runTest('A03 — pitchClassFromSpelling valide letter + accidental', () => {
  assertEqual(pitchClassFromSpelling('C', 0), 0);
  assertEqual(pitchClassFromSpelling('C', 1), 1);
  assertEqual(pitchClassFromSpelling('D', -1), 1);
  assertEqual(pitchClassFromSpelling('F', -1), 4);
  assertEqual(pitchClassFromSpelling('G', 1), 8);
});

runTest('A04 — Rejet d\'une orthographe incohérente', () => {
  const err = assertThrows(() => createSpelledPitch({ pitchClass: 2, letter: 'C', accidental: 1 }));
  assertTrue(err.message.includes('Incohérence'));
});

runTest('A05 — Double bémol accepté', () => {
  const bb = createSpelledPitch({ pitchClass: 9, letter: 'B', accidental: -2, octave: null, origin: 'manual', explicit: true });
  assertEqual(bb.pitchClass, 9);
  assertEqual(bb.accidental, -2);
});

runTest('A06 — Double dièse accepté', () => {
  const cx = createSpelledPitch({ pitchClass: 2, letter: 'C', accidental: 2, octave: null, origin: 'manual', explicit: true });
  assertEqual(cx.pitchClass, 2);
  assertEqual(cx.accidental, 2);
});

runTest('A07 — Aucune triple altération générée automatiquement', () => {
  const cMajor = createSpelledKeyFromKeyObject({ tonicPitchClass: 0, mode: 'major' });
  const scale = spellScale({ selected: { tonicPitchClass: 0, mode: 'major' }, spelledKey: cMajor });
  for (const note of scale) {
    assertTrue(Math.abs(note.accidental) <= 2, `${formatSpelledPitch(note)} a une altération > 2`);
  }
});

// ===========================================================================
// B. Orthographe des gammes
// ===========================================================================

function scaleLetters(key) {
  return spellScale({ selected: { tonicPitchClass: key.tonicPitchClass, mode: key.mode }, spelledKey: key })
    .map((s) => formatSpelledPitch(s));
}

runTest('B08 — Do majeur correctement orthographié', () => {
  const key = createSpelledKeyFromKeyObject({ tonicPitchClass: 0, mode: 'major' });
  assertDeepEqual(scaleLetters(key), ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
});

runTest('B09 — Fa majeur avec Si♭', () => {
  const key = createSpelledKeyFromKeyObject({ tonicPitchClass: 5, mode: 'major' });
  assertDeepEqual(scaleLetters(key), ['F', 'G', 'A', 'B♭', 'C', 'D', 'E']);
});

runTest('B10 — Ré♭ majeur', () => {
  const key = createSpelledKeyFromTonicSpelling(1, 'major', 'D', -1);
  assertDeepEqual(scaleLetters(key), ['D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C']);
});

runTest('B11 — Do dièse majeur avec Mi dièse et Si dièse', () => {
  const key = createSpelledKeyFromTonicSpelling(1, 'major', 'C', 1);
  assertDeepEqual(scaleLetters(key), ['C♯', 'D♯', 'E♯', 'F♯', 'G♯', 'A♯', 'B♯']);
});

runTest('B12 — Fa dièse majeur avec Mi dièse', () => {
  const key = createSpelledKeyFromTonicSpelling(6, 'major', 'F', 1);
  assertDeepEqual(scaleLetters(key), ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
});

runTest('B13 — Sol bémol majeur avec Do bémol', () => {
  const key = createSpelledKeyFromTonicSpelling(6, 'major', 'G', -1);
  assertDeepEqual(scaleLetters(key), ['G♭', 'A♭', 'B♭', 'C♭', 'D♭', 'E♭', 'F']);
});

runTest('B13b — 7 lettres distinctes dans chaque gamme', () => {
  for (let pc = 0; pc < 12; pc++) {
    const key = createSpelledKeyFromKeyObject({ tonicPitchClass: pc, mode: 'major' });
    const letters = new Set(spellScale({ selected: { tonicPitchClass: pc, mode: 'major' }, spelledKey: key }).map((s) => s.letter));
    assertEqual(letters.size, 7, `Tonalité ${pc} majeur n'a pas 7 lettres distinctes`);
  }
});

// ===========================================================================
// C. Tonalités détectées et manuelles
// ===========================================================================

runTest('C14 — Tonalité détectée avec orthographe par défaut', () => {
  const track = makeCMajorTrack();
  const { context } = estimateTonalContextFromMelody(track);
  assertNotNull(context.spelledKey);
  assertEqual(context.spelledKey.source, 'detected-default');
  assertEqual(context.spelledKey.tonic.letter, 'C');
  assertEqual(context.spelledKey.tonic.accidental, 0);
});

runTest('C15 — Sélection manuelle D♭ conservée', () => {
  const track = makeCMajorTrack();
  const { context } = estimateTonalContextFromMelody(track);
  const manual = setManualTonalContext(context, 'Db');
  assertEqual(manual.selected.tonicPitchClass, 1);
  assertEqual(manual.selected.mode, 'major');
  assertEqual(manual.spelledKey.tonic.letter, 'D');
  assertEqual(manual.spelledKey.tonic.accidental, -1);
  assertEqual(manual.spelledKey.source, 'manual');
  assertTrue(manual.spelledKey.explicit);
});

runTest('C16 — Sélection manuelle C# conservée', () => {
  const track = makeCMajorTrack();
  const { context } = estimateTonalContextFromMelody(track);
  const manual = setManualTonalContext(context, 'C#');
  assertEqual(manual.selected.tonicPitchClass, 1);
  assertEqual(manual.selected.mode, 'major');
  assertEqual(manual.spelledKey.tonic.letter, 'C');
  assertEqual(manual.spelledKey.tonic.accidental, 1);
  assertEqual(manual.spelledKey.source, 'manual');
});

runTest('C17 — Scores automatiques inchangés après sélection orthographique', () => {
  const track = makeCMajorTrack();
  const { context } = estimateTonalContextFromMelody(track);
  const beforeScores = context.candidates.map((c) => c.score);
  const manualDb = setManualTonalContext(context, 'Db');
  const afterScores = manualDb.candidates.map((c) => c.score);
  assertDeepEqual(beforeScores, afterScores);
  const manualCs = setManualTonalContext(context, 'C#');
  assertDeepEqual(beforeScores, manualCs.candidates.map((c) => c.score));
});

runTest('C18 — Suppression de la correction manuelle restaure l\'orthographe par défaut', () => {
  const track = makeCMajorTrack();
  const { context } = estimateTonalContextFromMelody(track);
  const manual = setManualTonalContext(context, 'Db');
  const cleared = clearTonalConfirmation(manual);
  assertFalse(cleared.confirmedByUser);
  assertEqual(cleared.selectionOrigin, 'detected');
  assertEqual(cleared.spelledKey.source, 'detected-default');
  assertEqual(cleared.spelledKey.tonic.letter, 'C');
  assertEqual(cleared.spelledKey.tonic.accidental, 0);
});

runTest('C19 — Ancien TonalContext sans SpelledKey reste accepté', () => {
  const legacy = {
    id: 'legacy',
    selected: { tonicPitchClass: 5, mode: 'major' },
    candidates: [],
    selectionOrigin: 'detected',
    melodyEstimate: null,
    harmonyEstimate: null,
    confirmedByUser: false,
    confidence: null,
    createdAt: 0,
    updatedAt: 0,
  };
  const cleared = clearPreferredKeySpelling(legacy);
  assertEqual(cleared.selected.tonicPitchClass, 5);
  assertEqual(cleared.spelledKey.tonic.letter, 'F');
});

// ===========================================================================
// D. ChordReference et orthographe
// ===========================================================================

runTest('D20 — ChordReference C#m7', () => {
  const chord = parseSpelledChordSymbol('C#m7');
  assertEqual(chord.root, 1);
  assertEqual(chord.quality, 'm7');
  assertEqual(chord.bass, null);
  assertEqual(chord.rootSpelling.letter, 'C');
  assertEqual(chord.rootSpelling.accidental, 1);
  assertEqual(chord.originalSymbol, 'C#m7');
});

runTest('D21 — ChordReference D♭m7', () => {
  const chord = parseSpelledChordSymbol('Dbm7');
  assertEqual(chord.root, 1);
  assertEqual(chord.quality, 'm7');
  assertEqual(chord.bass, null);
  assertEqual(chord.rootSpelling.letter, 'D');
  assertEqual(chord.rootSpelling.accidental, -1);
  assertEqual(chord.originalSymbol, 'Dbm7');
});

runTest('D22 — C#m7 et D♭m7 partagent la même qualité canonique et symboles conservés', () => {
  const cs = parseSpelledChordSymbol('C#m7');
  const db = parseSpelledChordSymbol('Dbm7');
  assertEqual(cs.quality, db.quality);
  assertEqual(cs.root, db.root);
  assertFalse(sameSpelling(cs.rootSpelling, db.rootSpelling));
  assertEqual(cs.originalSymbol, 'C#m7');
  assertEqual(db.originalSymbol, 'Dbm7');
});

runTest('D23 — Slash chord D♭/F conserve les orthographes respectives', () => {
  const chord = parseSpelledChordSymbol('Db/F');
  assertEqual(chord.root, 1);
  assertEqual(chord.bass, 5);
  assertEqual(chord.rootSpelling.letter, 'D');
  assertEqual(chord.rootSpelling.accidental, -1);
  assertEqual(chord.bassSpelling.letter, 'F');
  assertEqual(chord.bassSpelling.accidental, 0);
});

runTest('D24 — Accord explicite prioritaire sur respelling automatique', () => {
  const chord = parseSpelledChordSymbol('Dbm7');
  const ctx = createSpelledKeyFromKeyObject({ tonicPitchClass: 0, mode: 'major' });
  const spelled = spellChordReference(chord, { selected: { tonicPitchClass: 0, mode: 'major' }, spelledKey: ctx });
  assertEqual(spelled.rootSpelling.letter, 'D');
  assertEqual(spelled.rootSpelling.accidental, -1);
  assertEqual(spelled.originalSymbol, 'Dbm7');
});

runTest('D25 — Respelling contextuel seulement sur demande ou absence d\'écriture explicite', () => {
  const chord = parseSpelledChordSymbol('Dbm7');
  const ctx = createSpelledKeyFromKeyObject({ tonicPitchClass: 1, mode: 'major' }); // C# major context
  const forced = spellChordReference(chord, { selected: { tonicPitchClass: 1, mode: 'major' }, spelledKey: ctx }, { forceRespelling: true });
  assertEqual(forced.rootSpelling.letter, 'C');
  assertEqual(forced.rootSpelling.accidental, 1);
});

// ===========================================================================
// E. Verrouillage startChord / endChord
// ===========================================================================

runTest('E26 — startChord verrouillable', () => {
  const track = makeShortTrack();
  let ctx = createHarmonicContext(track, { startChord: 'Cmaj7' });
  assertFalse(ctx.startChord.locked);
  ctx = setStartChordLocked(ctx, true);
  assertTrue(ctx.startChord.locked);
  ctx = setStartChordLocked(ctx, false);
  assertFalse(ctx.startChord.locked);
});

runTest('E27 — endChord verrouillable', () => {
  const track = makeShortTrack();
  let ctx = createHarmonicContext(track, { endChord: 'G7' });
  assertFalse(ctx.endChord.locked);
  ctx = setEndChordLocked(ctx, true);
  assertTrue(ctx.endChord.locked);
  ctx = setEndChordLocked(ctx, false);
  assertFalse(ctx.endChord.locked);
});

runTest('E28 — Version incrémentée lors du verrouillage', () => {
  const track = makeShortTrack();
  let ctx = createHarmonicContext(track, { startChord: 'Cmaj7' });
  const v1 = ctx.version;
  ctx = setStartChordLocked(ctx, true);
  assertEqual(ctx.version, v1 + 1);
  ctx = setStartChordLocked(ctx, false);
  assertEqual(ctx.version, v1 + 2);
});

// ===========================================================================
// F. Politique des ancres hors plage
// ===========================================================================

runTest('F29 — Ancre facultative après la fin = warning', () => {
  const track = makeShortTrack();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: track.duration + 1.0, harmonizationPolicy: 'automatic' });
  const result = validateHarmonicContext(ctx, track);
  assertTrue(result.warnings.some((w) => w.code === 'ANCHOR_TIME_OUTSIDE_TRACK'));
  assertFalse(result.errors.some((e) => e.code === 'ANCHOR_TIME_OUTSIDE_TRACK'));
  assertEqual(result.anchorStatuses[0].status, 'warning');
});

runTest('F30 — Ancre force après la fin = error', () => {
  const track = makeShortTrack();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: track.duration + 1.0, harmonizationPolicy: 'force' });
  const result = validateHarmonicContext(ctx, track);
  assertTrue(result.errors.some((e) => e.code === 'ANCHOR_TIME_OUTSIDE_TRACK'));
  assertEqual(result.anchorStatuses[0].status, 'error');
});

runTest('F31 — Ancre verrouillée après la fin = error', () => {
  const track = makeShortTrack();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: track.duration + 1.0, locked: true });
  const result = validateHarmonicContext(ctx, track);
  assertTrue(result.errors.some((e) => e.code === 'ANCHOR_TIME_OUTSIDE_TRACK'));
  assertEqual(result.anchorStatuses[0].status, 'error');
});

runTest('F32 — Temps négatif = error', () => {
  const track = makeShortTrack();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: -0.5 });
  const result = validateHarmonicContext(ctx, track);
  assertTrue(result.errors.some((e) => e.code === 'ANCHOR_TIME_NEGATIVE'));
  assertEqual(result.anchorStatuses[0].status, 'error');
});

// ===========================================================================
// G. Identifiants, sérialisation, immutabilité
// ===========================================================================

runTest('G33 — Identifiants stables après respelling', () => {
  const track = makeCMajorTrack();
  const { context } = estimateTonalContextFromMelody(track);
  const idBefore = context.id;
  const eventIdsBefore = track.events.map((e) => e.id);
  const manual = setManualTonalContext(context, 'Db');
  assertEqual(manual.id, idBefore);
  for (let i = 0; i < track.events.length; i++) {
    assertEqual(track.events[i].id, eventIdsBefore[i]);
  }
});

runTest('G34 — JSON-sérialisation', () => {
  const sp = createSpelledPitch({ pitchClass: 1, letter: 'D', accidental: -1, octave: 4, origin: 'manual', explicit: true });
  const key = createSpelledKeyFromTonicSpelling(1, 'major', 'D', -1);
  const chord = parseSpelledChordSymbol('Dbm7');
  const json = JSON.stringify({ sp, key, chord });
  const parsed = JSON.parse(json);
  assertEqual(parsed.sp.letter, 'D');
  assertEqual(parsed.key.tonic.letter, 'D');
  assertEqual(parsed.chord.originalSymbol, 'Dbm7');
});

runTest('G35 — Immutabilité', () => {
  const sp = createSpelledPitch({ pitchClass: 1, letter: 'D', accidental: -1, octave: null, origin: 'manual', explicit: true });
  const key = createSpelledKeyFromKeyObject({ tonicPitchClass: 0, mode: 'major' });
  assertThrows(() => { sp.letter = 'E'; });
  assertThrows(() => { key.mode = 'minor'; });
});

// ===========================================================================
// H. Non-régression et unicité des sources
// ===========================================================================

runTest('H36 — Résultat historique du détecteur tonal inchangé', () => {
  const track = makeCMajorTrack();
  const { context, diagnostics } = estimateTonalContextFromMelody(track);
  assertEqual(context.melodyEstimate.tonicPitchClass, 0);
  assertEqual(context.melodyEstimate.mode, 'major');
  assertEqual(context.melodyEstimate.source, 'melody-raw-notes');
  assertEqual(diagnostics.totalEnabled, 5);
});

runTest('H37 — Aucun second référentiel d\'accords', () => {
  // parseSpelledChordSymbol délègue obligatoirement à parseChordSymbol et CHORD_DEFINITIONS
  const chord = parseSpelledChordSymbol('Cmaj7');
  assertEqual(chord.root, 0);
  assertEqual(chord.quality, 'maj7');
});

// ===========================================================================
// I. Tous les tests précédents restent verts (sanity locale)
// ===========================================================================

runTest('I38 — spellMidiNote conserve l\'octave', () => {
  const note = spellMidiNote(61, null);
  assertEqual(note.pitchClass, 1);
  assertEqual(note.octave, 4);
});

runTest('I39 — spellPitchClass fallback déterministe', () => {
  const note = spellPitchClass(1, null);
  assertEqual(note.letter, 'C');
  assertEqual(note.accidental, 1);
});

runTest('I40 — formatSpelledPitch affiche les altérations', () => {
  assertEqual(formatSpelledPitch(createSpelledPitch({ pitchClass: 1, letter: 'D', accidental: -1, octave: null, origin: 'manual', explicit: true })), 'D♭');
  assertEqual(formatSpelledPitch(createSpelledPitch({ pitchClass: 1, letter: 'C', accidental: 1, octave: null, origin: 'manual', explicit: true })), 'C♯');
  assertEqual(formatSpelledPitch(createSpelledPitch({ pitchClass: 9, letter: 'B', accidental: -2, octave: null, origin: 'manual', explicit: true })), 'B𝄫');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;
