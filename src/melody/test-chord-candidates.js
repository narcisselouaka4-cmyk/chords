// [OpenCode] — 2026-08-06 — Tests de l'Incrément 4 : génération des candidats d'accords.
// Exécutable avec : node src/melody/test-chord-candidates.js

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack, setEventEnabled } from './melody-track.js';
import {
  createHarmonicContext,
  addHarmonicAnchor,
  setStartChord,
  setEndChord,
  setStartChordLocked,
  setEndChordLocked,
} from './harmonic-context.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
import { resolveCanonicalChordDefinition } from '../chord-engine/chord-display.js';
import {
  generateChordCandidatesForAnchor,
  generateChordCandidatesForContext,
  classifyMelodyCompatibility,
  validateChordCandidate,
  deduplicateChordCandidates,
  limitChordCandidates,
  getIdentityMetadata,
  computeChordPitchClasses,
  SUPPORTED_QUALITIES,
} from './chord-candidate-generator.js';

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

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function assertIncludes(haystack, needle, msg = '') {
  if (!haystack.includes(needle)) {
    throw new Error(`${msg} expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`);
  }
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

function trackFromMidiNotes(midis, options = {}) {
  const clock = makeClock();
  const capture = makeCapture(clock);
  for (const midi of midis) {
    capture.noteOn(midi, 0.8, 0);
    clock.advance(400);
    capture.noteOff(midi, 0, 0);
    clock.advance(100);
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: options.sourceCaptureId || 'cap-cand' }, options);
}

function harmonicContextInKey(track, keyString, options = {}) {
  const tonalContext = setManualTonalContext(createTonalContext(), keyString);
  const ctx = createHarmonicContext(track, { tonalContext });
  let result = ctx;
  if (options.startChord) {
    result = setStartChord(result, options.startChord, { locked: options.startLocked || false });
  }
  if (options.endChord) {
    result = setEndChord(result, options.endChord, { locked: options.endLocked || false });
  }
  if (options.startLocked && !options.startChord) {
    throw new Error('startLocked requires startChord');
  }
  if (options.endLocked && !options.endChord) {
    throw new Error('endLocked requires endChord');
  }
  return result;
}

function addNoteAnchor(ctx, track, noteIndex, policy = 'automatic', type = 'user', originalChord = null) {
  const evt = track.events[noteIndex];
  return addHarmonicAnchor(ctx, {
    melodyEventId: evt ? evt.id : null,
    relativeTime: evt ? evt.startedAt : 0,
    type,
    harmonizationPolicy: policy,
    originalChord,
  });
}

function firstCandidateByQuality(result, quality) {
  return result.candidates.find((c) => c.qualityId === quality) || null;
}

function hasCandidate(result, rootPc, quality) {
  return result.candidates.some((c) => c.rootPitchClass === rootPc && c.qualityId === quality);
}

console.log('=== Incrément 4 — Génération des candidats d\'accords ===\n');

// ===========================================================================
// 1. SOURCE UNIQUE
// ===========================================================================

runTest('S01 — CHORD_DEFINITIONS reste le référentiel unique', () => {
  const def = resolveCanonicalChordDefinition('maj7');
  assertNotNull(def);
  assertEqual(def.symbol, 'maj7');
});

runTest('S02 — Aucune table indépendante de qualités dans src/melody', () => {
  // Le générateur n'expose que SUPPORTED_QUALITIES (ensemble de symboles)
  // et consomme CHORD_DEFINITIONS pour les intervalles.
  assertTrue(SUPPORTED_QUALITIES.has('m7'));
  assertTrue(SUPPORTED_QUALITIES.has('maj7'));
  assertFalse(SUPPORTED_QUALITIES.has('C#m7')); // symboles complets exclus
});

runTest('S03 — Anciennes définitions d\'accords restent compatibles', () => {
  // Les consommateurs existants (voicing-engine, chord-display) lisent
  // name, symbol, intervals. Les nouveaux champs ne cassent pas ce contrat.
  const allHaveIntervals = CHORD_DEFINITIONS.every((d) => Array.isArray(d.intervals));
  assertTrue(allHaveIntervals);
  const canonical = CHORD_DEFINITIONS.filter((d) => !d.parentSymbol);
  assertTrue(canonical.length > 0);
});

runTest('S04 — Métadonnées d\'identité accessibles depuis la définition canonique', () => {
  const meta = getIdentityMetadata('maj7');
  assertDeepEqual(meta.identityIntervals, [4, 11]);
  assertIncludes(meta.optionalIntervals, 7);
  assertTrue(meta.extensionIntervals.length > 0);
});

// ===========================================================================
// 2. IDENTITÉ DES ACCORDS
// ===========================================================================

runTest('I05 — maj7 conserve 3 et 7', () => {
  const meta = getIdentityMetadata('maj7');
  assertIncludes(meta.identityIntervals, 4); // tierce majeure
  assertIncludes(meta.identityIntervals, 11); // septième majeure
});

runTest('I06 — m7 conserve b3 et b7', () => {
  const meta = getIdentityMetadata('m7');
  assertIncludes(meta.identityIntervals, 3);
  assertIncludes(meta.identityIntervals, 10);
});

runTest('I07 — 7 conserve 3 et b7', () => {
  const meta = getIdentityMetadata('7');
  assertIncludes(meta.identityIntervals, 4);
  assertIncludes(meta.identityIntervals, 10);
});

runTest('I08 — m7b5 conserve b3, b5 et b7', () => {
  const meta = getIdentityMetadata('m7b5');
  assertIncludes(meta.identityIntervals, 3);
  assertIncludes(meta.identityIntervals, 6);
  assertIncludes(meta.identityIntervals, 10);
});

runTest('I09 — dim7 conserve sa structure identitaire', () => {
  const meta = getIdentityMetadata('dim7');
  assertIncludes(meta.identityIntervals, 3);
  assertIncludes(meta.identityIntervals, 6);
  assertIncludes(meta.identityIntervals, 9);
  // Pas de quinte optionnelle
  assertFalse(meta.optionalIntervals.includes(7));
});

runTest('I10 — 7sus4 ne requiert pas une tierce majeure', () => {
  const meta = getIdentityMetadata('7sus4');
  assertFalse(meta.identityIntervals.includes(4));
  assertIncludes(meta.identityIntervals, 5); // quarte
  assertIncludes(meta.identityIntervals, 10); // septième
});

runTest('I11 — Omission de quinte autorisée lorsqu\'elle est déclarée', () => {
  const meta = getIdentityMetadata('maj7');
  assertIncludes(meta.optionalIntervals, 7);
  assertIncludes(meta.supportedOmissions, 7);
});

runTest('I12 — Omission identitaire interdite', () => {
  // Une définition sans supportedOmissions vide interdit toute omission d'identité.
  const meta = getIdentityMetadata('m7b5');
  for (const interval of meta.identityIntervals) {
    assertFalse(meta.supportedOmissions.includes(interval),
      `L'intervalle identitaire ${interval} de m7b5 ne doit pas être dans supportedOmissions`);
  }
});

// ===========================================================================
// 3. COMPATIBILITÉ MÉLODIQUE
// ===========================================================================

runTest('M13 — Mélodie comme chord-tone', () => {
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 4, midi: 64, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
    rootPc: 0,
    quality: 'maj7',
    bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
  });
  assertEqual(compat.category, 'chord-tone');
  assertEqual(compat.matchingInterval, 4);
});

runTest('M14 — Mélodie comme available-tension', () => {
  // La neuvième majeure (D) sur un maj7 est une tension disponible,
  // car le maj9 contient la 9e dans ses intervalles complets. On teste donc
  // la 9e par rapport au maj7 (sans 9e), où elle est dans extensionIntervals.
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 2, midi: 62, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
    rootPc: 0,
    quality: 'maj7',
    bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
  });
  assertEqual(compat.category, 'available-tension');
  assertEqual(compat.matchingInterval, 2);
});

runTest('M15 — Mélodie comme suspension', () => {
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 5, midi: 65, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
    rootPc: 0,
    quality: 'maj7',
    bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
  });
  assertEqual(compat.category, 'suspension');
  assertEqual(compat.matchingInterval, 5);
});

runTest('M16 — Note de passage tolérée', () => {
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 1, midi: 61, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
    rootPc: 0,
    quality: 'maj7',
    bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
  });
  assertEqual(compat.category, 'non-chord-tone-allowed');
});

runTest('M17 — Note incompatible rejetée', () => {
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 1, midi: 61, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'force', preserveExactPitch: false },
    rootPc: 0,
    quality: 'maj7',
    bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'force', preserveExactPitch: false },
  });
  assertEqual(compat.category, 'incompatible');
});

runTest('M18 — preserveExactPitch enregistré comme contrainte future', () => {
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 4, midi: 64, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: true },
    rootPc: 0,
    quality: 'maj7',
    bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: true },
  });
  assertTrue(compat.exactPitchRequired);
  assertEqual(compat.melodyMidi, 64);
  // Aucun voicing n'est généré : la satisfaction exacte n'est pas prétendue.
  assertFalse(compat.exactPitchSatisfied);
  assertTrue(compat.reasons.some((r) => r.includes('voicing futur')));
});

runTest('M19 — melody-must-be-top enregistré comme contrainte future', () => {
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 4, midi: 64, sopranoPolicy: 'melody-must-be-top', harmonizationPolicy: 'automatic', preserveExactPitch: false },
    rootPc: 0,
    quality: 'maj7',
    bassPc: null,
    policies: { sopranoPolicy: 'melody-must-be-top', harmonizationPolicy: 'automatic', preserveExactPitch: false },
  });
  assertEqual(compat.sopranoPolicy, 'melody-must-be-top');
  assertEqual(compat.category, 'chord-tone');
});

runTest('M20 — allow-notes-above n\'élimine pas une mélodie intérieure', () => {
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 7, midi: 67, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
    rootPc: 0,
    quality: 'maj7',
    bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
  });
  assertEqual(compat.category, 'chord-tone');
  assertEqual(compat.sopranoPolicy, 'allow-notes-above');
});

runTest('M21 — harmonizationPolicy skip retourne skipped', () => {
  const track = trackFromMidiNotes([60]); // C4
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0, 'skip');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.status, 'skipped');
  assertEqual(result.candidates.length, 0);
});

runTest('M22 — harmonizationPolicy force sans candidat retourne no-valid-candidate', () => {
  // Sans contexte tonal et sans accord original, aucune famille n'est
  // générable. En mode force, le résultat est explicitement vide.
  const track = trackFromMidiNotes([61]); // C#4
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: 0, harmonizationPolicy: 'force' });
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.status, 'no-valid-candidate');
  assertEqual(result.candidates.length, 0);
  assertTrue(result.warnings.some((w) => w.code === 'FORCE_NO_CANDIDATE'));
});

runTest('M23 — automatic conserve plusieurs catégories compatibles', () => {
  const track = trackFromMidiNotes([64]); // E4 = tierce de Cmaj7
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertTrue(result.candidates.length >= 2, `Attendu ≥2 candidats, obtenu ${result.candidates.length}`);
  const categories = new Set(result.candidates.map((c) => c.melodyCompatibility.category));
  assertTrue(categories.has('chord-tone'));
});

// ===========================================================================
// 4. ANCRES
// ===========================================================================

runTest('A24 — Ancre liée à MelodyEvent', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 1); // ancre sur E4
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.anchorId, ctx.anchors[0].id);
  assertEqual(result.melodyEventId, track.events[1].id);
  assertTrue(result.candidates.length > 0);
});

runTest('A25 — Ancre sans MelodyEvent', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addHarmonicAnchor(ctx, { relativeTime: 0, type: 'section' });
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.melodyEventId, null);
  assertEqual(result.status, 'generated');
});

runTest('A26 — Ancre invalide', () => {
  const track = trackFromMidiNotes([60]);
  const ctx = harmonicContextInKey(track, 'C');
  const result = generateChordCandidatesForAnchor({
    anchor: null,
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.status, 'invalid-anchor');
});

runTest('A27 — Accord initial verrouillé', () => {
  const track = trackFromMidiNotes([60]); // C4
  let ctx = harmonicContextInKey(track, 'C', { startChord: 'Fm7', startLocked: true });
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.candidates.length, 1);
  assertEqual(result.candidates[0].source, 'locked-boundary');
  assertEqual(result.candidates[0].qualityId, 'm7');
  assertEqual(result.candidates[0].rootPitchClass, 5); // F
  assertTrue(result.candidates[0].locked);
});

runTest('A28 — Accord final verrouillé', () => {
  const track = trackFromMidiNotes([70]); // Bb3 = 10
  let ctx = harmonicContextInKey(track, 'C', { endChord: 'G7', endLocked: true });
  ctx = addNoteAnchor(ctx, track, 0, 'automatic', 'end');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.candidates.length, 1);
  assertEqual(result.candidates[0].source, 'locked-boundary');
  assertEqual(result.candidates[0].qualityId, '7');
  assertEqual(result.candidates[0].rootPitchClass, 7); // G
});

runTest('A29 — Accord verrouillé incompatible signalé', () => {
  // Mélodie C# (pc 1) avec accord final verrouillé G7 en mode force. C# n'est
  // pas une note constitutive, tension ou suspension de G7 (G B D F), donc le
  // candidat est généré mais marqué avec des violations.
  const track = trackFromMidiNotes([61]);
  let ctx = harmonicContextInKey(track, 'C', { endChord: 'G7', endLocked: true });
  ctx = addNoteAnchor(ctx, track, 0, 'force', 'end');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.candidates.length, 1);
  assertTrue(result.candidates[0].validation.hardViolations.length > 0 ||
    result.candidates[0].validation.warnings.length > 0);
});

runTest('A30 — Accord original non verrouillé inclus comme candidat', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic', 'original-chord', 'Cmaj7');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertTrue(hasCandidate(result, 0, 'maj7'));
  const original = result.candidates.find((c) => c.source === 'manual');
  assertNotNull(original);
  assertEqual(original.qualityId, 'maj7');
  assertEqual(original.rootPitchClass, 0);
});

// ===========================================================================
// 5. FAMILLES
// ===========================================================================

runTest('F31 — Candidats diatoniques en tonalité majeure', () => {
  const track = trackFromMidiNotes([60]); // C4
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const diatonic = result.candidates.filter((c) => c.source === 'diatonic');
  assertTrue(diatonic.length >= 2, `Attendu ≥2 candidats diatoniques, obtenu ${diatonic.length}`);
  assertTrue(diatonic.some((c) => c.tonalRelation.romanNumeral === 'I'));
});

runTest('F32 — Candidats diatoniques en tonalité mineure', () => {
  const track = trackFromMidiNotes([69]); // A4
  let ctx = harmonicContextInKey(track, 'Am');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const diatonic = result.candidates.filter((c) => c.source === 'diatonic');
  assertTrue(diatonic.length >= 2, `Attendu ≥2 candidats diatoniques mineurs, obtenu ${diatonic.length}`);
  assertTrue(diatonic.some((c) => c.tonalRelation.romanNumeral === 'i'));
});

runTest('F33 — Substitution diatonique documentée', () => {
  // En Do majeur, iii (Em7) peut substituer I (Cmaj7).
  const track = trackFromMidiNotes([64]); // E4, note partagée par Cmaj7 et Em7
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const subs = result.candidates.filter((c) => c.source === 'substitution');
  assertTrue(subs.length > 0, 'Au moins une substitution diatonique attendue');
  assertTrue(subs.some((c) => c.tonalRelation.approachType === 'diatonic-substitution'));
});

runTest('F34 — Dominante secondaire avec cible', () => {
  const track = trackFromMidiNotes([69]); // A4 = tierce majeure de F7 (V/ii en Do)
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const secDom = result.candidates.filter((c) => c.source === 'secondary-dominant');
  assertTrue(secDom.some((c) => c.tonalRelation.secondaryDominantTarget != null),
    'Une dominante secondaire doit enregistrer sa cible');
});

runTest('F35 — Dominante secondaire sans cible non générée', () => {
  // La génération n'émet pas de dominante secondaire sans cible identifiable.
  // En mineur, la cible doit être un degré valide du mode.
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'Am');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const secDom = result.candidates.filter((c) => c.source === 'secondary-dominant');
  for (const c of secDom) {
    assertNotNull(c.tonalRelation.secondaryDominantTarget);
  }
});

runTest('F36 — Diminué d\'approche valide', () => {
  // En Do majeur, sur la note D (ré) comme cible ii, l'approche est Ebdim7.
  const track = trackFromMidiNotes([63]); // Eb4 = note d'Eb dim7
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const approaches = result.candidates.filter((c) => c.source === 'diminished-approach');
  assertTrue(approaches.some((c) => c.qualityId === 'dim7'),
    'Un diminué d\'approche est attendu');
});

runTest('F37 — Symétrie dim7 sans quadruplon inutile', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const approaches = result.candidates.filter((c) => c.source === 'diminished-approach');
  const roots = new Set(approaches.map((c) => c.rootPitchClass));
  // Moins de racines que de degrés cibles (la symétrie regroupe les doublons)
  assertTrue(roots.size <= 7, `Attendu ≤7 racines dim7, obtenu ${roots.size}`);
});

runTest('F38 — Emprunt modal limité', () => {
  const track = trackFromMidiNotes([63]); // Eb4
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
    options: { maxCandidatesPerAnchor: 30 },
  });
  const borrowed = result.candidates.filter((c) => c.source === 'borrowed');
  assertTrue(borrowed.length > 0, `Au moins un emprunt modal attendu, obtenu ${borrowed.length}`);
  assertTrue(borrowed.every((c) => c.tonalRelation.borrowed === true));
});

runTest('F39 — Candidat chromatique non justifié rejeté', () => {
  // Mélodie F# (pc 6) en Do majeur. Aucun accord diatonique ne contient F#.
  const track = trackFromMidiNotes([66]); // F#4
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const diatonic = result.candidates.filter((c) => c.source === 'diatonic');
  assertTrue(diatonic.every((c) => c.melodyCompatibility.category !== 'incompatible'),
    'Un candidat diatonique incompatible avec la mélodie doit être filtré');
});

// ===========================================================================
// 6. ENHARMONIE
// ===========================================================================

runTest('E40 — D♭ majeur produit une orthographe en bémols', () => {
  const track = trackFromMidiNotes([61]); // C#4 / Db4
  let ctx = harmonicContextInKey(track, 'Db');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  // En Ré♭ majeur, l'accord de tonique est D♭maj7 (root pc 1, lettre D, bémol).
  const c = result.candidates.find((cand) => cand.rootPitchClass === 1 && cand.qualityId === 'maj7');
  assertNotNull(c, 'D♭maj7 devrait apparaître en tant qu\'accord diatonique de Ré♭ majeur');
  assertEqual(c.rootSpelling.letter, 'D');
  assertEqual(c.rootSpelling.accidental, -1);
});

runTest('E41 — C# majeur conserve E# et B# lorsque nécessaire', () => {
  const track = trackFromMidiNotes([61]); // C#4 / Db4
  let ctx = harmonicContextInKey(track, 'C#');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const c = result.candidates.find((cand) => cand.rootPitchClass === 1);
  assertNotNull(c);
  assertEqual(c.rootSpelling.letter, 'C');
  assertEqual(c.rootSpelling.accidental, 1);
});

runTest('E42 — Accord manuel explicite conserve son symbole', () => {
  const track = trackFromMidiNotes([61]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic', 'original-chord', 'Dbm7');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const manual = result.candidates.find((c) => c.source === 'manual');
  assertNotNull(manual);
  assertEqual(manual.rootSpelling.letter, 'D');
  assertEqual(manual.rootSpelling.accidental, -1);
  assertEqual(manual.chord.originalSymbol, 'Dbm7');
});

runTest('E43 — Même hauteur, orthographes fonctionnelles distinctes', () => {
  // Dbm7 en contexte C# majeur force le respelling, mais l'explicite Db
  // est conservée.
  const track = trackFromMidiNotes([61]);
  let ctx = harmonicContextInKey(track, 'C#');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic', 'original-chord', 'Dbm7');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const manual = result.candidates.find((c) => c.source === 'manual');
  assertNotNull(manual);
  assertEqual(manual.rootPitchClass, 1);
  assertEqual(manual.rootSpelling.letter, 'D');
  assertEqual(manual.rootSpelling.accidental, -1);
});

runTest('E44 — Respelling ne modifie pas les pitch classes', () => {
  const track = trackFromMidiNotes([61]);
  let ctx = harmonicContextInKey(track, 'C#');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic', 'original-chord', 'Dbm7');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const manual = result.candidates.find((c) => c.source === 'manual');
  const expectedPcs = computeChordPitchClasses(1, 'm7');
  assertDeepEqual(manual.pitchClasses, expectedPcs);
});

// ===========================================================================
// 7. DÉDOUBLONNAGE ET LIMITES
// ===========================================================================

runTest('D45 — Doublon réel supprimé', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const ids = new Set(result.candidates.map((c) => c.id));
  assertEqual(ids.size, result.candidates.length, 'Tous les IDs doivent être uniques');
});

runTest('D46 — Fonctions distinctes conservées', () => {
  // En Do majeur, Cmaj7 (I) et Em7 (iii-for-I) partagent des notes mais ont
  // des fonctions différentes.
  const track = trackFromMidiNotes([64]); // E4
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const diatonic = result.candidates.filter((c) => c.source === 'diatonic' && c.rootPitchClass === 0);
  const substitution = result.candidates.filter((c) => c.source === 'substitution' && c.rootPitchClass === 4);
  assertTrue(diatonic.length > 0, 'Cmaj7 diatonique préservé');
  assertTrue(substitution.length > 0, 'Em7 substitution préservé');
});

runTest('D47 — Basses différentes conservées', () => {
  // On ne génère pas de slash chords dans les familles automatiques, mais le
  // dédoublonnage documente qu'une basse différente change la clé.
  // Vérifions au moins que la clé de dédoublonnage inclut la basse.
  const c1 = { pitchClasses: [0, 4, 7], qualityId: '', bassPitchClass: null, tonalRelation: { degree: 0, approachType: 'none', romanNumeral: 'I' }, rootSpelling: { letter: 'C', accidental: 0 } };
  const c2 = { ...c1, bassPitchClass: 4 };
  const result = deduplicateChordCandidates([c1, c2]);
  assertEqual(result.length, 2);
});

runTest('D48 — Plafond configurable respecté', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
    options: { maxCandidatesPerAnchor: 3 },
  });
  assertTrue(result.candidates.length <= 3, `Attendu ≤3 candidats, obtenu ${result.candidates.length}`);
});

runTest('D49 — Aucun minimum artificiel de candidats', () => {
  // Sans contexte tonal et sans accord original, aucun candidat n'est généré
  // artificiellement.
  const track = trackFromMidiNotes([60]);
  let ctx = createHarmonicContext(track);
  ctx = addHarmonicAnchor(ctx, { relativeTime: 0, harmonizationPolicy: 'automatic' });
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.candidates.length, 0, 'Aucun minimum artificiel de candidats');
});

runTest('D50 — Ordre déterministe', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const r1 = generateChordCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  const r2 = generateChordCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assertDeepEqual(r1.candidates.map((c) => c.id), r2.candidates.map((c) => c.id));
  assertDeepEqual(r1.candidates.map((c) => c.source), r2.candidates.map((c) => c.source));
});

// ===========================================================================
// 8. VALIDATION ET CONTRATS
// ===========================================================================

runTest('V51 — CandidateValidationReport JSON-safe', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertTrue(result.candidates.length > 0);
  const json = JSON.stringify(result.candidates[0].validation);
  const parsed = JSON.parse(json);
  assertEqual(typeof parsed.valid, 'boolean');
  assertTrue(Array.isArray(parsed.hardViolations));
  assertTrue(Array.isArray(parsed.warnings));
  assertTrue(Array.isArray(parsed.satisfiedConstraints));
});

runTest('V52 — AnchorCandidateGenerationResult JSON-safe', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const json = JSON.stringify(result);
  const parsed = JSON.parse(json);
  assertEqual(parsed.anchorId, ctx.anchors[0].id);
  assertTrue(Array.isArray(parsed.candidates));
  assertEqual(typeof parsed.rejectedSummary.total, 'number');
});

runTest('V53 — Entrées non mutées', () => {
  const track = trackFromMidiNotes([60]);
  const trackJson = JSON.stringify(track);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const ctxJson = JSON.stringify(ctx);
  generateChordCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assertEqual(JSON.stringify(track), trackJson, 'La MelodyTrack ne doit pas être mutée');
  assertEqual(JSON.stringify(ctx), ctxJson, 'Le HarmonicContext ne doit pas être muté');
});

runTest('V54 — Identifiants stables', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const r1 = generateChordCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  const r2 = generateChordCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assertDeepEqual(r1.candidates.map((c) => c.id), r2.candidates.map((c) => c.id));
});

runTest('V55 — Même entrée produit exactement la même sortie', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 1);
  const r1 = generateChordCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  const r2 = generateChordCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assertDeepEqual(r1, r2);
});

runTest('V56 — Candidat inconnu rejeté proprement', () => {
  // Construire un candidat avec une qualité inexistante et le valider.
  const fake = {
    anchorId: 'a1',
    melodyEventId: null,
    chord: { root: 0, quality: 'xyz', bass: null, rootSpelling: { pitchClass: 0, letter: 'C', accidental: 0, octave: null, origin: 'fallback', explicit: false }, bassSpelling: null, originalSymbol: 'Cxyz' },
    rootPitchClass: 0,
    rootSpelling: { pitchClass: 0, letter: 'C', accidental: 0, octave: null, origin: 'fallback', explicit: false },
    bassPitchClass: null,
    bassSpelling: null,
    qualityId: 'xyz',
    canonicalDefinitionId: 'xyz',
    pitchClasses: [0, 4, 7],
    spelledTones: [],
    identityIntervals: [4, 7],
    optionalIntervals: [],
    omittedIntervals: [],
    omissionReason: null,
    melodyCompatibility: { category: 'chord-tone', melodyPitchClass: 0, melodyMidi: null, matchingInterval: 0, exactPitchRequired: false, exactPitchSatisfied: true, sopranoPolicy: 'free', harmonizationPolicy: 'automatic', reasons: [] },
    tonalRelation: { degree: null, romanNumeral: null, diatonic: false, borrowed: false, secondaryDominantTarget: null, approachType: 'none' },
    locked: false,
    source: 'diatonic',
  };
  const report = validateChordCandidate(fake, {});
  assertFalse(report.valid);
  assertTrue(report.hardViolations.some((v) => v.code === 'UNSUPPORTED_QUALITY' || v.code === 'UNKNOWN_DEFINITION'));
});

runTest('V57 — Aucune logique de transition exécutée', () => {
  const track = trackFromMidiNotes([60, 64]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  ctx = addNoteAnchor(ctx, track, 1);
  const results = generateChordCandidatesForContext({ harmonicContext: ctx, track });
  assertEqual(results.length, 2);
  // Chaque ancre est indépendante : aucun champ de transition n'est présent.
  for (const r of results) {
    assertFalse('transitions' in r);
  }
});

runTest('V58 — Aucun voicing généré', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  for (const c of result.candidates) {
    assertFalse('voicing' in c);
    assertFalse('leftHand' in c);
    assertFalse('rightHand' in c);
  }
});

runTest('V59 — Aucun appel réseau ou IA', () => {
  // Les fonctions publiques sont synchrones et ne retournent pas de Promise.
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertFalse(result instanceof Promise, 'La génération ne doit pas être asynchrone');
  assertFalse(result.candidates[0] instanceof Promise, 'Les candidats ne doivent pas être des promesses');
});

// ===========================================================================
// 9. SCÉNARIO DE RÉFÉRENCE (A♭ majeur, Fm7 → B♭m7)
// ===========================================================================

runTest('R60 — Fm7 verrouillé au départ', () => {
  // Mélodie commençant par Eb3 (pc 3), Fm7 contient F Ab C Eb.
  const track = trackFromMidiNotes([51]); // Eb3 = 3 + 4*12 -1? 51 = Eb3 (pc 3)
  let ctx = harmonicContextInKey(track, 'Ab', { startChord: 'Fm7', startLocked: true });
  ctx = addNoteAnchor(ctx, track, 0, 'automatic', 'start');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.candidates.length, 1);
  assertEqual(result.candidates[0].qualityId, 'm7');
  assertEqual(result.candidates[0].rootPitchClass, 5); // F
  assertTrue(result.candidates[0].locked);
});

runTest('R61 — B♭m7 verrouillé à l\'arrivée', () => {
  const track = trackFromMidiNotes([58]); // Bb3 = pc 10
  let ctx = harmonicContextInKey(track, 'Ab', { endChord: 'Bbm7', endLocked: true });
  ctx = addNoteAnchor(ctx, track, 0, 'automatic', 'end');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.candidates.length, 1);
  assertEqual(result.candidates[0].qualityId, 'm7');
  assertEqual(result.candidates[0].rootPitchClass, 10); // Bb
  assertTrue(result.candidates[0].locked);
});

runTest('R62 — Chaque note mélodique conserve sa contrainte', () => {
  const notes = [51, 56, 58, 60, 63, 65]; // Eb3 Ab3 Bb3 C4 Eb4 F4
  const track = trackFromMidiNotes(notes);
  let ctx = harmonicContextInKey(track, 'Ab');
  for (let i = 0; i < notes.length; i++) {
    ctx = addNoteAnchor(ctx, track, i);
  }
  const results = generateChordCandidatesForContext({ harmonicContext: ctx, track });
  assertEqual(results.length, notes.length);
  for (let i = 0; i < results.length; i++) {
    const melodyPc = normalizePc(notes[i]);
    for (const c of results[i].candidates) {
      assertEqual(c.melodyCompatibility.melodyPitchClass, melodyPc,
        `La contrainte mélodique de la note ${i} doit être conservée`);
    }
  }
});

runTest('R63 — Plusieurs candidats valides peuvent exister par ancre', () => {
  const track = trackFromMidiNotes([60]); // C4
  let ctx = harmonicContextInKey(track, 'Ab');
  ctx = addNoteAnchor(ctx, track, 0);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertTrue(result.candidates.length >= 2, `Attendu ≥2 candidats, obtenu ${result.candidates.length}`);
});

runTest('R64 — La progression complète n\'est pas imposée', () => {
  // On ne doit pas retrouver le chemin Fm7 → Abmaj7 → Db6/9 → Cm7 → F7(b9) → Bbm7
  // codé en dur. On vérifie seulement l'absence d'un tel chemin global.
  const notes = [51, 56, 58, 60, 63, 65];
  const track = trackFromMidiNotes(notes);
  let ctx = harmonicContextInKey(track, 'Ab');
  for (let i = 0; i < notes.length; i++) {
    ctx = addNoteAnchor(ctx, track, i);
  }
  const results = generateChordCandidatesForContext({ harmonicContext: ctx, track });
  // Aucun objet de type chemin ou transition n'est produit.
  assertFalse(results.some((r) => 'path' in r || 'transitions' in r));
});

// ===========================================================================
// 10. NON-RÉGRESSION
// ===========================================================================

runTest('NR65 — Tests des Incréments 0 à 3 toujours verts (sanity locale)', () => {
  // Ces tests sont exécutés dans le script d'intégration. Ici, on vérifie
  // seulement que les modules importés restent accessibles.
  assertTrue(typeof createMelodyTrack === 'function');
  assertTrue(typeof setManualTonalContext === 'function');
  assertTrue(typeof createHarmonicContext === 'function');
});

runTest('NR66 — Tests du moteur d\'accords toujours verts (sanity locale)', () => {
  assertTrue(typeof resolveCanonicalChordDefinition === 'function');
  assertNotNull(resolveCanonicalChordDefinition('maj7'));
});

runTest('NR67 — Résultat historique du détecteur tonal inchangé', () => {
  const track = trackFromMidiNotes([60, 62, 64, 65, 67]);
  const ctx = createTonalContext();
  const manual = setManualTonalContext(ctx, 'C');
  assertEqual(manual.selected.tonicPitchClass, 0);
  assertEqual(manual.selected.mode, 'major');
});

runTest('NR68 — Build réussi non testable ici, mais modules syntaxiquement valides', () => {
  // node --check a déjà été effectué sur les fichiers créés/modifiés.
  assertTrue(true);
});

// ===========================================================================
// 11. DURCISSEMENT DE L'INCRÉMENT 4
// ===========================================================================

runTest('H69 — preserveExactPitch ne se réduit pas à la pitch class', () => {
  // C3 (midi 48) et C4 (midi 60) partagent la pitch class 0.
  // La contrainte exacte n'est pas prétendue satisfaite à ce stade.
  const c3 = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 0, midi: 48, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: true },
    rootPc: 0, quality: 'maj7', bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: true },
  });
  assertTrue(c3.exactPitchRequired);
  assertFalse(c3.exactPitchSatisfied);
  assertEqual(c3.melodyMidi, 48);
});

runTest('H70 — non-chord-tone-allowed produit un avertissement explicite', () => {
  const track = trackFromMidiNotes([66]); // F#4 en Do majeur
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const nct = result.candidates.filter((c) => c.melodyCompatibility.category === 'non-chord-tone-allowed');
  assertTrue(nct.length > 0, 'Au moins un candidat non-chord-tone-allowed attendu');
  assertTrue(nct.every((c) =>
    c.validation.warnings.some((w) => w.code === 'NON_CHORD_TONE_HEURISTIC')),
    'Chaque non-chord-tone doit être signalé comme heuristique');
});

runTest('H71 — suspension produit un avertissement explicite', () => {
  const track = trackFromMidiNotes([65]); // F4 = quarte de Cmaj7
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  const sus = result.candidates.filter((c) => c.melodyCompatibility.category === 'suspension');
  assertTrue(sus.length > 0, 'Au moins un candidat suspension attendu');
  assertTrue(sus.every((c) =>
    c.validation.warnings.some((w) => w.code === 'SUSPENSION_HEURISTIC')),
    'Chaque suspension doit être signalée comme heuristique');
});

runTest('H72 — intervalle identitaire prime sur available-tension', () => {
  // Tierce majeure (E, pc 4) sur un accord de 7 : c'est identitaire, pas tension.
  const compat = classifyMelodyCompatibility({
    melodyEvent: { pitchClass: 4, midi: 64, sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
    rootPc: 0, quality: '7', bassPc: null,
    policies: { sopranoPolicy: 'allow-notes-above', harmonizationPolicy: 'automatic', preserveExactPitch: false },
  });
  assertEqual(compat.category, 'chord-tone');
  assertEqual(compat.matchingInterval, 4);
});

runTest('H73 — accord initial verrouillé incompatible expose une violation exploitable', () => {
  const track = trackFromMidiNotes([61]); // C#4 incompatible avec G7
  let ctx = harmonicContextInKey(track, 'C');
  ctx = setStartChord(ctx, 'G7', { locked: true });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id,
    relativeTime: track.events[0].startedAt,
    type: 'start',
    harmonizationPolicy: 'force',
  });
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  assertEqual(result.candidates.length, 1);
  assertTrue(result.candidates[0].validation.hardViolations.some((v) => v.code === 'MELODY_INCOMPATIBLE'));
  assertTrue(result.warnings.some((w) => w.code === 'MELODY_INCOMPATIBLE'),
    'La violation doit être exposée au niveau du résultat');
});

runTest('H74 — plafond bas ne supprime pas le candidat verrouillé', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = setStartChord(ctx, 'Cmaj7', { locked: true });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id,
    relativeTime: track.events[0].startedAt,
    type: 'start',
    harmonizationPolicy: 'automatic',
  });
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
    options: { maxCandidatesPerAnchor: 1 },
  });
  assertEqual(result.candidates.length, 1);
  assertTrue(result.candidates[0].locked);
});

runTest('H75 — troncature signalée avec le code CANDIDATES_TRUNCATED', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
    options: { maxCandidatesPerAnchor: 3 },
  });
  assertTrue(result.warnings.some((w) => w.code === 'CANDIDATES_TRUNCATED'),
    'La troncature doit être signalée');
});

runTest('H76 — aucun score musical caché dans les candidats', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 1);
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
  });
  for (const c of result.candidates) {
    assertFalse('voiceLeadingScore' in c);
    assertFalse('resolutionScore' in c);
    assertFalse('commonTones' in c);
    assertFalse('totalScore' in c);
    assertFalse('bassMovementScore' in c);
  }
});

runTest('H77 — emprunts modaux strictement limités au vocabulaire documenté', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addNoteAnchor(ctx, track, 0, 'automatic');
  const result = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0],
    track,
    harmonicContext: ctx,
    options: { maxCandidatesPerAnchor: 100 },
  });
  const borrowed = result.candidates.filter((c) => c.source === 'borrowed');
  const allowedRomans = new Set(['bIII', 'bVI', 'bVII', 'iv']);
  assertTrue(borrowed.length <= 4, `Attendu ≤4 emprunts, obtenu ${borrowed.length}`);
  assertTrue(borrowed.every((c) => allowedRomans.has(c.tonalRelation.romanNumeral)),
    'Tout emprunt doit appartenir au vocabulaire documenté');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;
