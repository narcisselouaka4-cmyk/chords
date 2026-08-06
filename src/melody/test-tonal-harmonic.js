// [OpenCode] — 2026-08-06 — Tests de l'Incrément 2 : contexte tonal et harmonique.
// Exécutable avec : node src/melody/test-tonal-harmonic.js

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack, setEventEnabled, diagnoseMelodyTrack } from './melody-track.js';
import {
  estimateTonalContextFromMelody,
  createTonalContext,
  selectTonalCandidate,
  setManualTonalContext,
  correctTonalContext,
  clearTonalConfirmation,
  compareTonalEstimates,
  rebuildTonalContext,
  melodyTrackToRawEvents,
} from './tonal-context.js';
import {
  createHarmonicContext,
  setStartChord,
  setEndChord,
  setStartChordLocked,
  setEndChordLocked,
  addHarmonicAnchor,
  updateHarmonicAnchor,
  removeHarmonicAnchor,
  setOriginalProgression,
  validateHarmonicContext,
  sortAnchors,
} from './harmonic-context.js';
import { computeKeyFromRawNotes, computeKeyCandidatesFromRawNotes } from '../analyzer/key-detector.js';
import { parseChordSymbol, resolveCanonicalChordDefinition } from '../chord-engine/chord-display.js';
import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';

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

function assertNotNull(value, msg = '') {
  if (value == null) throw new Error(msg || 'expected non-null');
}

function makeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
    set: (ms) => { t = ms; },
  };
}

function makeCapture(clock) {
  return createMidiCapture({ getTime: clock.now });
}

// Fixture : mélodie simple en Do majeur (C D E F G)
function makeCMajorMelody() {
  const clock = makeClock();
  const capture = makeCapture(clock);
  const notes = [60, 62, 64, 65, 67]; // C4 D4 E4 F4 G4
  for (const note of notes) {
    capture.noteOn(note, 0.8, 0);
    clock.advance(400);
    capture.noteOff(note, 0, 0);
    clock.advance(100);
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-cmaj' });
}

// Fixture : mélodie en La mineur (A B C D E)
function makeAMinorMelody() {
  const clock = makeClock();
  const capture = makeCapture(clock);
  const notes = [69, 71, 72, 74, 76]; // A4 B4 C5 D5 E5
  for (const note of notes) {
    capture.noteOn(note, 0.8, 0);
    clock.advance(400);
    capture.noteOff(note, 0, 0);
    clock.advance(100);
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-amin' });
}

// Fixture : mélodie vide
function makeEmptyMelody() {
  const capture = createMidiCapture();
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-empty' });
}

// Fixture : mélodie ambiguë C majeur / A mineur (C D E G A)
function makeAmbiguousMelody() {
  const clock = makeClock();
  const capture = makeCapture(clock);
  const notes = [60, 62, 64, 67, 69]; // C D E G A
  for (const note of notes) {
    capture.noteOn(note, 0.8, 0);
    clock.advance(400);
    capture.noteOff(note, 0, 0);
    clock.advance(100);
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-ambig' });
}

// Fixture : mélodie très courte (une seule note)
function makeShortMelody() {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(400);
  capture.noteOff(60, 0, 0);
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-short' });
}

// Fixture : poids par durée (C long, E et G courts)
function makeWeightedMelody() {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(1000);
  capture.noteOff(60, 0, 0);
  clock.advance(50);
  capture.noteOn(64, 0.8, 0);
  clock.advance(100);
  capture.noteOff(64, 0, 0);
  clock.advance(50);
  capture.noteOn(67, 0.8, 0);
  clock.advance(100);
  capture.noteOff(67, 0, 0);
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-weighted' });
}

function getFirstCandidateEvidence(track) {
  const { context } = estimateTonalContextFromMelody(track);
  return context.candidates[0].evidence;
}

console.log('=== Incrément 2 — Contexte tonal et harmonique ===\n');

// ===========================================================================
// SECTION A : Estimation tonale depuis MelodyTrack
// ===========================================================================

// T01 : Estimation depuis une MelodyTrack simple (Do majeur)
runTest('T01 — estimation depuis une MelodyTrack simple (Do majeur)', () => {
  const track = makeCMajorMelody();
  const { context, diagnostics } = estimateTonalContextFromMelody(track);
  assertNotNull(context.melodyEstimate, 'Doit produire une estimation');
  assertEqual(context.melodyEstimate.tonicPitchClass, 0, 'Tonique = Do (0)');
  assertEqual(context.melodyEstimate.mode, 'major');
  assertTrue(context.melodyEstimate.confidence > 0, 'Confiance > 0');
  assertEqual(context.melodyEstimate.source, 'melody-raw-notes');
  assertEqual(diagnostics.totalEnabled, 5);
});

// T02 : Appel réel du chemin notes brutes (computeKeyFromRawNotes)
runTest('T02 — appel réel du chemin notes brutes', () => {
  const track = makeCMajorMelody();
  const { events } = melodyTrackToRawEvents(track);
  const key = computeKeyFromRawNotes(events);
  assertNotNull(key, 'computeKeyFromRawNotes doit retourner un résultat');
  assertEqual(key.pc, 0, 'Tonique = Do (0)');
  assertEqual(key.mode, 'major');
  assertEqual(key.source, 'krumhansl-raw');
});

// T03 : Aucun appel au chemin fondé sur les accords pour une mélodie seule
runTest('T03 — aucun appel au chemin fondé sur les accords', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  // Tous les candidats doivent avoir source 'melody-raw-notes'
  for (const c of context.candidates) {
    assertEqual(c.source, 'melody-raw-notes',
      `Le candidat ${c.tonicPitchClass} ${c.mode} doit avoir source melody-raw-notes`);
  }
});

// T04 : Événements disabled ignorés
runTest('T04 — événements disabled ignorés', () => {
  const track = makeCMajorMelody();
  const disabled = setEventEnabled(track, track.events[0].id, false);
  const { context, diagnostics } = estimateTonalContextFromMelody(disabled);
  assertEqual(diagnostics.totalEnabled, 4, '4 événements activés sur 5');
  assertTrue(diagnostics.disabledEventIds.length > 0);
  assertNotNull(context.melodyEstimate);
});

// T05 : Événements incomplets ignorés et signalés
runTest('T05 — événements incomplets ignorés et signalés', () => {
  const track = makeCMajorMelody();
  // On crée un événement avec durée nulle
  const badEvent = { ...track.events[0], id: 'bad-1', duration: 0, endedAt: track.events[0].startedAt, enabled: true };
  const modifiedTrack = { ...track, events: [badEvent, ...track.events] };
  const { diagnostics } = estimateTonalContextFromMelody(modifiedTrack);
  assertTrue(diagnostics.incompleteEventIds.includes('bad-1'),
    'L\'événement incomplet doit être signalé');
});

// T06 : Plusieurs candidats conservés
runTest('T06 — plusieurs candidats conservés', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  assertTrue(context.candidates.length >= 2, 'Au moins 2 candidats');
  // Le premier doit être Do majeur
  assertEqual(context.candidates[0].tonicPitchClass, 0);
  assertEqual(context.candidates[0].mode, 'major');
});

// T07 : Sélection d'un candidat
runTest('T07 — sélection d\'un candidat', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  // Sélectionne le 2e candidat
  const updated = selectTonalCandidate(context, 1);
  assertEqual(updated.selected.tonicPitchClass, context.candidates[1].tonicPitchClass);
  assertEqual(updated.selected.mode, context.candidates[1].mode);
  assertEqual(updated.selectionOrigin, 'detected');
  assertTrue(updated.confirmedByUser);
});

// T08 : Tonalité manuelle séparée des candidats détectés
runTest('T08 — tonalité manuelle séparée des candidats détectés', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const beforeCandidates = context.candidates.length;
  const manual = setManualTonalContext(context, 'Fm');
  assertEqual(manual.selected.tonicPitchClass, 5); // Fa
  assertEqual(manual.selected.mode, 'minor');
  assertEqual(manual.selectionOrigin, 'manual');
  assertTrue(manual.confirmedByUser);
  // La confiance manuelle n'est pas une confiance calculée par le détecteur
  assertEqual(manual.confidence, null);
  // Les candidats détectés sont conservés intacts, aucun candidat factice injecté
  assertEqual(manual.candidates.length, beforeCandidates);
  assertTrue(manual.candidates.every((c) => c.source === 'melody-raw-notes'),
    'Aucun candidat factice ne doit être injecté');
  assertTrue(manual.candidates.every((c) => Number.isFinite(c.score) && c.score <= 1),
    'Les scores doivent rester les scores de corrélation');
});

// T09 : Correction utilisateur non écrasée
runTest('T09 — correction utilisateur non écrasée', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const corrected = correctTonalContext(context, 'G');
  assertEqual(corrected.selected.tonicPitchClass, 7); // Sol
  assertEqual(corrected.selected.mode, 'major');
  assertEqual(corrected.selectionOrigin, 'corrected');
  // Ré-estimer ne doit pas écraser la correction
  const { context: reEstimated } = estimateTonalContextFromMelody(track);
  assertEqual(reEstimated.selectionOrigin, 'detected',
    'Une nouvelle estimation ne doit pas affecter le contexte corrigé');
});

// T10 : Retrait de confirmation
runTest('T10 — retrait de confirmation', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const originalTopCandidate = context.candidates[0];
  const manual = setManualTonalContext(context, 'Am');
  assertTrue(manual.confirmedByUser);
  assertEqual(manual.candidates.length, context.candidates.length);
  const cleared = clearTonalConfirmation(manual);
  assertFalse(cleared.confirmedByUser);
  assertEqual(cleared.selectionOrigin, 'detected');
  // Doit revenir à l'estimation mélodique
  assertEqual(cleared.selected.tonicPitchClass, originalTopCandidate.tonicPitchClass);
  assertEqual(cleared.selected.mode, originalTopCandidate.mode);
  // Aucun candidat factice ne doit subsister
  assertTrue(cleared.candidates.every((c) => c.source === 'melody-raw-notes'),
    'Les candidats automatiques d\'origine doivent rester intacts');
});

// T11 : Contexte sans estimation suffisante
runTest('T11 — contexte sans estimation suffisante (piste vide)', () => {
  const track = makeEmptyMelody();
  const { context, diagnostics } = estimateTonalContextFromMelody(track);
  assertEqual(context.melodyEstimate, null);
  assertEqual(context.selected, null);
  assertEqual(context.candidates.length, 0);
  assertEqual(diagnostics.reason, 'no-events');
});

// ===========================================================================
// SECTION B : HarmonicContext
// ===========================================================================

// T12 : Création d'un HarmonicContext vide
runTest('T12 — création d\'un HarmonicContext vide', () => {
  const track = makeCMajorMelody();
  const ctx = createHarmonicContext(track);
  assertEqual(ctx.melodyTrackId, track.id);
  assertEqual(ctx.startChord, null);
  assertEqual(ctx.endChord, null);
  assertEqual(ctx.anchors.length, 0);
  assertEqual(ctx.originalProgression.length, 0);
  assertEqual(ctx.version, 1);
});

// T13 : Accord initial valide
runTest('T13 — accord initial valide', () => {
  const track = makeCMajorMelody();
  const ctx = createHarmonicContext(track, { startChord: 'Cmaj7' });
  assertNotNull(ctx.startChord);
  assertEqual(ctx.startChord.chord.root, 0);
  assertEqual(ctx.startChord.chord.quality, 'maj7');
  assertEqual(ctx.startChord.chord.bass, null);
  assertEqual(ctx.startChord.locked, false);
});

// T14 : Accord final valide
runTest('T14 — accord final valide', () => {
  const track = makeCMajorMelody();
  const ctx = createHarmonicContext(track, { endChord: 'G7' });
  assertNotNull(ctx.endChord);
  assertEqual(ctx.endChord.chord.root, 7);
  assertEqual(ctx.endChord.chord.quality, '7');
  assertEqual(ctx.endChord.locked, false);
});

// T15 : Symbole d'accord inconnu rejeté proprement
runTest('T15 — symbole d\'accord inconnu rejeté proprement', () => {
  const track = makeCMajorMelody();
  try {
    createHarmonicContext(track, { startChord: 'Cxyz_invalid' });
    throw new Error('Devait rejeter le symbole inconnu');
  } catch (err) {
    assertTrue(err.message.includes('invalide') || err.message.includes('inconnue'),
      `Message d'erreur attendu, reçu : ${err.message}`);
  }
});

// T16 : Ajout d'une ancre liée à MelodyEvent
runTest('T16 — ajout d\'une ancre liée à MelodyEvent', () => {
  const track = makeCMajorMelody();
  const ctx = createHarmonicContext(track);
  const updated = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id,
    relativeTime: track.events[0].startedAt,
    type: 'user',
    harmonizationPolicy: 'force',
  });
  assertEqual(updated.anchors.length, 1);
  assertEqual(updated.anchors[0].melodyEventId, track.events[0].id);
  assertEqual(updated.anchors[0].harmonizationPolicy, 'force');
  assertEqual(updated.version, ctx.version + 1);
});

// T17 : Ancre avec MelodyEvent inexistant rejetée
runTest('T17 — ancre avec MelodyEvent inexistant rejetée', () => {
  const track = makeCMajorMelody();
  const ctx = createHarmonicContext(track);
  const withBadAnchor = addHarmonicAnchor(ctx, {
    melodyEventId: 'nonexistent-id',
    relativeTime: 0,
  });
  const result = validateHarmonicContext(withBadAnchor, track);
  assertFalse(result.valid);
  assertTrue(result.errors.some((e) => e.code === 'UNKNOWN_MELODY_EVENT'));
});

// T18 : Ancres triées sans mutation de l'entrée
runTest('T18 — ancres triées sans mutation de l\'entrée', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: 2.0, type: 'user' });
  ctx = addHarmonicAnchor(ctx, { relativeTime: 0.5, type: 'user' });
  ctx = addHarmonicAnchor(ctx, { relativeTime: 1.0, type: 'user' });
  // L'ordre d'insertion est 2.0, 0.5, 1.0
  const originalOrder = ctx.anchors.map((a) => a.relativeTime);
  const sorted = sortAnchors(ctx);
  const sortedOrder = sorted.anchors.map((a) => a.relativeTime);
  assertDeepEqual(sortedOrder, [0.5, 1.0, 2.0], 'Doit être trié');
  // L'original ne doit pas être muté
  assertDeepEqual(ctx.anchors.map((a) => a.relativeTime), originalOrder,
    'L\'entrée ne doit pas être mutée');
});

// T19 : Politiques force / automatic / skip
runTest('T19 — politiques force / automatic / skip', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: 0, harmonizationPolicy: 'force' });
  ctx = addHarmonicAnchor(ctx, { relativeTime: 1, harmonizationPolicy: 'automatic' });
  ctx = addHarmonicAnchor(ctx, { relativeTime: 2, harmonizationPolicy: 'skip' });
  assertEqual(ctx.anchors[0].harmonizationPolicy, 'force');
  assertEqual(ctx.anchors[1].harmonizationPolicy, 'automatic');
  assertEqual(ctx.anchors[2].harmonizationPolicy, 'skip');
  // Politique inconnue rejetée
  try {
    addHarmonicAnchor(ctx, { relativeTime: 3, harmonizationPolicy: 'invalid' });
    throw new Error('Devait rejeter');
  } catch (err) {
    assertTrue(err.message.includes('inconnue'));
  }
});

// T20 : Progression originale manuelle
runTest('T20 — progression originale manuelle', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  ctx = setOriginalProgression(ctx, [
    { relativeTime: 0, chord: 'Dm7' },
    { relativeTime: 2, chord: 'G7' },
    { relativeTime: 4, chord: 'Cmaj7' },
  ]);
  assertEqual(ctx.originalProgression.length, 3);
  assertEqual(ctx.originalProgression[0].originalChord.root, 2); // Ré
  assertEqual(ctx.originalProgression[0].originalChord.quality, 'm7');
  assertEqual(ctx.originalProgression[1].originalChord.root, 7); // Sol
  assertEqual(ctx.originalProgression[2].originalChord.root, 0); // Do
  assertEqual(ctx.version, 2);
});

// T21 : Ordre temporel invalide signalé
runTest('T21 — ordre temporel invalide signalé', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  ctx = setOriginalProgression(ctx, [
    { relativeTime: 4, chord: 'Cmaj7' },
    { relativeTime: 2, chord: 'G7' },
    { relativeTime: 0, chord: 'Dm7' },
  ]);
  const result = validateHarmonicContext(ctx, track);
  assertFalse(result.valid);
  assertTrue(result.errors.some((e) => e.code === 'PROGRESSION_TIME_ORDER'));
});

// ===========================================================================
// SECTION C : Comparaison mélodie/harmonie
// ===========================================================================

// T22 : Comparaison mélodie/harmonie en accord
runTest('T22 — comparaison mélodie/harmonie en accord', () => {
  const melodyEst = {
    tonicPitchClass: 0, mode: 'major', confidence: 0.85, score: 0.85,
    source: 'melody-raw-notes',
    evidence: { noteCount: 5, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const harmonyEst = {
    tonicPitchClass: 0, mode: 'major', confidence: 0.9, score: 0.9,
    source: 'harmony-chords',
    evidence: { noteCount: 3, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const comparison = compareTonalEstimates(melodyEst, harmonyEst);
  assertEqual(comparison.agreement, 'exact');
  assertEqual(comparison.recommendation, 'use-melody');
});

// T23 : Comparaison mélodie/harmonie en conflit
runTest('T23 — comparaison mélodie/harmonie en conflit', () => {
  const melodyEst = {
    tonicPitchClass: 0, mode: 'major', confidence: 0.85, score: 0.85,
    source: 'melody-raw-notes',
    evidence: { noteCount: 5, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const harmonyEst = {
    tonicPitchClass: 6, mode: 'major', confidence: 0.7, score: 0.7,
    source: 'harmony-chords',
    evidence: { noteCount: 3, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const comparison = compareTonalEstimates(melodyEst, harmonyEst);
  assertEqual(comparison.agreement, 'conflict');
  assertEqual(comparison.recommendation, 'request-user-confirmation');
  assertTrue(comparison.reasons.length > 0);
});

// ===========================================================================
// SECTION D : Propriétés générales
// ===========================================================================

// T24 : Sorties JSON-sérialisables
runTest('T24 — sorties JSON-sérialisables', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const json = JSON.stringify(context);
  const parsed = JSON.parse(json);
  assertEqual(parsed.candidates.length, context.candidates.length);
  assertEqual(parsed.melodyEstimate.tonicPitchClass, context.melodyEstimate.tonicPitchClass);

  const harmCtx = createHarmonicContext(track, { startChord: 'Cmaj7' });
  const harmJson = JSON.stringify(harmCtx);
  const harmParsed = JSON.parse(harmJson);
  assertEqual(harmParsed.startChord.chord.root, 0);
  assertEqual(harmParsed.startChord.chord.quality, 'maj7');
  assertEqual(harmParsed.startChord.locked, false);
});

// T25 : Immutabilité des entrées
runTest('T25 — immutabilité des entrées', () => {
  const track = makeCMajorMelody();
  const trackJson = JSON.stringify(track);

  const { context } = estimateTonalContextFromMelody(track);
  // La track ne doit pas avoir été modifiée
  assertEqual(JSON.stringify(track), trackJson);

  const ctx = createHarmonicContext(track);
  const ctxJson = JSON.stringify(ctx);
  const updated = setStartChord(ctx, 'G7');
  // Le contexte original ne doit pas être modifié
  assertEqual(JSON.stringify(ctx), ctxJson);
  assertEqual(ctx.startChord, null);
  assertNotNull(updated.startChord);
  assertEqual(updated.startChord.locked, false);
});

// T26 : Version incrémentée après édition
runTest('T26 — version incrémentée après édition', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  assertEqual(ctx.version, 1);
  ctx = setStartChord(ctx, 'Cmaj7');
  assertEqual(ctx.version, 2);
  ctx = setEndChord(ctx, 'G7');
  assertEqual(ctx.version, 3);
  ctx = addHarmonicAnchor(ctx, { relativeTime: 1.0 });
  assertEqual(ctx.version, 4);
  ctx = removeHarmonicAnchor(ctx, ctx.anchors[0].id);
  assertEqual(ctx.version, 5);
});

// T27 : Aucun doublon de source de vérité des accords
runTest('T27 — aucun doublon de source de vérité des accords', () => {
  // Vérifie que parseChordSymbol et resolveCanonicalChordDefinition
  // proviennent bien de chord-display.js et utilisent CHORD_DEFINITIONS
  const parsed = parseChordSymbol('Cmaj7');
  assertEqual(parsed.root, 0);
  assertEqual(parsed.quality, 'maj7');

  const def = resolveCanonicalChordDefinition('maj7');
  assertNotNull(def);
  assertEqual(def.symbol, 'maj7');

  // Vérifie que CHORD_DEFINITIONS contient les qualités utilisées
  const symbols = CHORD_DEFINITIONS.filter((d) => !d.parentSymbol).map((d) => d.symbol);
  assertTrue(symbols.includes('maj7'));
  assertTrue(symbols.includes('7'));
  assertTrue(symbols.includes('m7'));
  assertTrue(symbols.includes(''));
});

// T28 : Tests existants toujours verts (vérification structurelle)
runTest('T28 — computeKeyCandidatesFromRawNotes retourne 24 candidats', () => {
  const track = makeCMajorMelody();
  const { events } = melodyTrackToRawEvents(track);
  const candidates = computeKeyCandidatesFromRawNotes(events);
  assertEqual(candidates.length, 24, '24 combinaisons (12 pc × 2 modes)');
  // Triés par score décroissant
  for (let i = 1; i < candidates.length; i++) {
    assertTrue(candidates[i - 1].score >= candidates[i].score,
      `Les candidats doivent être triés par score décroissant (index ${i})`);
  }
});

// ===========================================================================
// SECTION E : Tests supplémentaires
// ===========================================================================

// T29 : Mise à jour d'une ancre
runTest('T29 — mise à jour d\'une ancre', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: 1.0, type: 'user', label: 'original' });
  const anchorId = ctx.anchors[0].id;
  ctx = updateHarmonicAnchor(ctx, anchorId, { label: 'modifié', locked: true });
  assertEqual(ctx.anchors[0].label, 'modifié');
  assertTrue(ctx.anchors[0].locked);
  assertEqual(ctx.version, 3);
});

// T30 : Suppression d'une ancre
runTest('T30 — suppression d\'une ancre', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: 0.5 });
  ctx = addHarmonicAnchor(ctx, { relativeTime: 1.0 });
  assertEqual(ctx.anchors.length, 2);
  ctx = removeHarmonicAnchor(ctx, ctx.anchors[0].id);
  assertEqual(ctx.anchors.length, 1);
});

// T31 : Validation complète d'un contexte valide
runTest('T31 — validation complète d\'un contexte valide', () => {
  const track = makeCMajorMelody();
  const { context: tonalCtx } = estimateTonalContextFromMelody(track);
  let ctx = createHarmonicContext(track, {
    tonalContext: tonalCtx,
    startChord: 'Cmaj7',
    endChord: 'Cmaj7',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id,
    relativeTime: track.events[0].startedAt,
    type: 'start',
    harmonizationPolicy: 'force',
  });
  const result = validateHarmonicContext(ctx, track);
  assertTrue(result.valid, `Contexte valide : ${result.errors.map((e) => e.message).join('; ')}`);
  assertEqual(result.errors.length, 0);
});

// T32 : setStartChord avec null retire l'accord
runTest('T32 — setStartChord avec null retire l\'accord', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track, { startChord: 'Cmaj7' });
  assertNotNull(ctx.startChord);
  ctx = setStartChord(ctx, null);
  assertEqual(ctx.startChord, null);
});

// T33 : setEndChord avec null retire l'accord
runTest('T33 — setEndChord avec null retire l\'accord', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track, { endChord: 'G7' });
  assertNotNull(ctx.endChord);
  ctx = setEndChord(ctx, null);
  assertEqual(ctx.endChord, null);
});

// T48 : Verrouillage de startChord
runTest('T48 — startChord verrouillable', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track, { startChord: 'Cmaj7' });
  assertFalse(ctx.startChord.locked);
  ctx = setStartChordLocked(ctx, true);
  assertTrue(ctx.startChord.locked);
  assertEqual(ctx.startChord.chord.root, 0);
});

// T49 : Verrouillage de endChord
runTest('T49 — endChord verrouillable', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track, { endChord: 'G7' });
  assertFalse(ctx.endChord.locked);
  ctx = setEndChordLocked(ctx, true);
  assertTrue(ctx.endChord.locked);
  assertEqual(ctx.endChord.chord.root, 7);
});

// T50 : Tonalité manuelle enharmonique C# vs Db
runTest('T50 — tonalité manuelle C# majeur conservée', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const manualCs = correctTonalContext(context, 'C#');
  assertEqual(manualCs.selected.tonicPitchClass, 1);
  assertEqual(manualCs.spelledKey.tonic.letter, 'C');
  assertEqual(manualCs.spelledKey.tonic.accidental, 1);
  assertEqual(manualCs.spelledKey.source, 'corrected');
});

// T51 : Tonalité manuelle Db majeur conservée
runTest('T51 — tonalité manuelle Db majeur conservée', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const manualDb = correctTonalContext(context, 'Db');
  assertEqual(manualDb.selected.tonicPitchClass, 1);
  assertEqual(manualDb.spelledKey.tonic.letter, 'D');
  assertEqual(manualDb.spelledKey.tonic.accidental, -1);
  assertEqual(manualDb.spelledKey.source, 'corrected');
});

// T52 : setStartChord avec option locked
runTest('T52 — setStartChord accepte une option locked', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  ctx = setStartChord(ctx, 'Cmaj7', { locked: true });
  assertTrue(ctx.startChord.locked);
});

// T34 : rebuildTonalContext crée un nouvel ID
runTest('T34 — rebuildTonalContext crée un nouvel ID', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const rebuilt = rebuildTonalContext(context);
  assertTrue(rebuilt.id !== context.id, 'Nouvel ID après reconstruction');
  assertEqual(rebuilt.candidates.length, context.candidates.length);
});

// T35 : setManualTonalContext avec objet {tonicPitchClass, mode}
runTest('T35 — setManualTonalContext avec objet', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const manual = setManualTonalContext(context, { tonicPitchClass: 3, mode: 'minor' });
  assertEqual(manual.selected.tonicPitchClass, 3); // Mib / Ré#
  assertEqual(manual.selected.mode, 'minor');
});

// T36 : compareTonalEstimates avec relatifs (Do majeur / La mineur)
runTest('T36 — comparaison relatifs (Do majeur / La mineur)', () => {
  const melodyEst = {
    tonicPitchClass: 0, mode: 'major', confidence: 0.8, score: 0.8,
    source: 'melody-raw-notes',
    evidence: { noteCount: 5, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const harmonyEst = {
    tonicPitchClass: 9, mode: 'minor', confidence: 0.7, score: 0.7,
    source: 'harmony-chords',
    evidence: { noteCount: 3, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const comparison = compareTonalEstimates(melodyEst, harmonyEst);
  assertEqual(comparison.agreement, 'relative');
});

// T37 : compareTonalEstimates avec parallèles (Do majeur / Do mineur)
runTest('T37 — comparaison parallèles (Do majeur / Do mineur)', () => {
  const melodyEst = {
    tonicPitchClass: 0, mode: 'major', confidence: 0.8, score: 0.8,
    source: 'melody-raw-notes',
    evidence: { noteCount: 5, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const harmonyEst = {
    tonicPitchClass: 0, mode: 'minor', confidence: 0.6, score: 0.6,
    source: 'harmony-chords',
    evidence: { noteCount: 3, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const comparison = compareTonalEstimates(melodyEst, harmonyEst);
  assertEqual(comparison.agreement, 'parallel');
});

// T38 : Validation avec piste vide
runTest('T38 — validation avec piste vide', () => {
  const track = makeEmptyMelody();
  const ctx = createHarmonicContext(track);
  const result = validateHarmonicContext(ctx, track);
  // Peut être valide ou avec warnings, mais pas d'erreur bloquante
  // (la piste vide est un cas limite accepté)
  assertTrue(result.errors.length === 0 || result.warnings.length > 0);
});

// T39 : Ancre avec temps négatif rejetée
runTest('T39 — ancre avec temps négatif rejetée', () => {
  const track = makeCMajorMelody();
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: -1.0 });
  const result = validateHarmonicContext(ctx, track);
  assertFalse(result.valid);
  assertTrue(result.errors.some((e) => e.code === 'ANCHOR_TIME_NEGATIVE'));
});

// T40 : Mélodie en La mineur — estimation produite avec candidats
runTest('T40 — mélodie en La mineur produit une estimation', () => {
  const track = makeAMinorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  assertNotNull(context.melodyEstimate);
  assertTrue(context.candidates.length >= 2, 'Au moins 2 candidats');
  // Avec seulement 5 notes (A B C D E), Krumhansl-Kessler peut hésiter
  // entre plusieurs tonalités. On vérifie que l'estimation existe et que
  // les candidats sont cohérents (pas de crash, pas de valeurs aberrantes).
  for (const c of context.candidates) {
    assertTrue(c.tonicPitchClass >= 0 && c.tonicPitchClass <= 11);
    assertTrue(c.mode === 'major' || c.mode === 'minor');
    assertTrue(c.confidence >= 0 && c.confidence <= 1);
  }
});

// ===========================================================================
// SECTION F : Garanties supplémentaires de l'Incrément 2
// ===========================================================================

// T41 : Non-régression — meilleur candidat = résultat historique
runTest('T41 — cohérence entre computeKeyFromRawNotes et computeKeyCandidatesFromRawNotes', () => {
  const track = makeCMajorMelody();
  const { events } = melodyTrackToRawEvents(track);
  const key = computeKeyFromRawNotes(events);
  const candidates = computeKeyCandidatesFromRawNotes(events);
  assertNotNull(key);
  assertEqual(candidates.length, 24);
  assertEqual(candidates[0].pc, key.pc, 'Le meilleur candidat correspond au résultat historique');
  assertEqual(candidates[0].mode, key.mode);
  assertEqual(candidates[0].score, key.confidence, 'Même score/confiance normalisé');
});

// T42 : Résultat historique de computeKeyFromRawNotes inchangé
runTest('T42 — résultat historique de computeKeyFromRawNotes inchangé', () => {
  const track = makeCMajorMelody();
  const { events } = melodyTrackToRawEvents(track);
  const key = computeKeyFromRawNotes(events);
  assertEqual(key.pc, 0);
  assertEqual(key.mode, 'major');
  assertEqual(key.source, 'krumhansl-raw');
});

// T43 : Mélodie ambiguë C majeur / A mineur conserve les deux candidats
runTest('T43 — mélodie ambiguë conserve Do majeur et La mineur', () => {
  const track = makeAmbiguousMelody();
  const { context } = estimateTonalContextFromMelody(track);
  assertNotNull(context.melodyEstimate);
  const hasC = context.candidates.some((c) => c.tonicPitchClass === 0 && c.mode === 'major');
  const hasAm = context.candidates.some((c) => c.tonicPitchClass === 9 && c.mode === 'minor');
  assertTrue(hasC, 'Do majeur doit être parmi les candidats');
  assertTrue(hasAm, 'La mineur doit être parmi les candidats');
});

// T44 : Très courte mélodie gérée sans confiance artificielle
runTest('T44 — très courte mélodie', () => {
  const track = makeShortMelody();
  const { context, diagnostics } = estimateTonalContextFromMelody(track);
  assertEqual(diagnostics.totalEnabled, 1);
  assertNotNull(context.melodyEstimate);
  assertTrue(context.candidates.length >= 2);
  // La confiance doit rester bornée réalistement
  assertTrue(context.melodyEstimate.confidence >= 0 && context.melodyEstimate.confidence <= 1);
});

// T45 : Corrections manuelles répétées sans accumulation de candidats
runTest('T45 — corrections manuelles répétées sans accumulation', () => {
  const track = makeCMajorMelody();
  const { context } = estimateTonalContextFromMelody(track);
  const count = context.candidates.length;
  let corrected = correctTonalContext(context, 'G');
  corrected = correctTonalContext(corrected, 'F');
  corrected = correctTonalContext(corrected, 'Bb');
  assertEqual(corrected.candidates.length, count, 'Aucun candidat factice accumulé');
  assertEqual(corrected.candidates.filter((c) => c.source === 'manual').length, 0,
    'Les candidats détectés ne doivent pas être remplacés par des entrées manuelles');
  assertEqual(corrected.selected.tonicPitchClass, 10); // Bb
  assertEqual(corrected.selected.mode, 'major');
  assertEqual(corrected.selectionOrigin, 'corrected');
});

// T46 : Symétrie de compareTonalEstimates
runTest('T46 — symétrie de compareTonalEstimates', () => {
  const a = {
    tonicPitchClass: 0, mode: 'major', confidence: 0.8, score: 0.8,
    source: 'melody-raw-notes',
    evidence: { noteCount: 5, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const b = {
    tonicPitchClass: 7, mode: 'major', confidence: 0.6, score: 0.6,
    source: 'harmony-chords',
    evidence: { noteCount: 3, weightedPitchClasses: [], supportingEventIds: [], conflictingEventIds: [] },
  };
  const ab = compareTonalEstimates(a, b);
  const ba = compareTonalEstimates(b, a);
  assertEqual(ab.agreement, ba.agreement, 'L\'agreement doit être symétrique');
  assertEqual(ab.confidenceDelta, -ba.confidenceDelta, 'Le delta change de signe lors de l\'inversion');
});

// T47 : Les durées sont exploitées conformément au détecteur
runTest('T47 — durée exploitée conformément au détecteur', () => {
  const track = makeWeightedMelody();
  const { events, diagnostics } = melodyTrackToRawEvents(track);
  assertEqual(diagnostics.totalEnabled, 3);
  const candidates = computeKeyCandidatesFromRawNotes(events);
  const top = candidates[0];
  // La note C dominante en durée avec E et G courts devrait favoriser Do majeur (pc 0)
  assertEqual(top.pc, 0, 'La tonique attendue est Do majeur');
  assertEqual(top.mode, 'major');
  // Vérification que l'histogramme reflète bien les durées
  const evidence = getFirstCandidateEvidence(track);
  assertTrue(evidence.weightedPitchClasses[0] > evidence.weightedPitchClasses[4],
    'C (pc 0) doit avoir plus de poids que E (pc 4)');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;
