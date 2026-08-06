// [OpenCode] — 2026-08-06 — Tests de l'Incrément 5 : scoring de transition entre ChordCandidate.
// Exécutable avec : node src/melody/test-transition-score.js

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createHarmonicContext, addHarmonicAnchor } from './harmonic-context.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import * as transitionModule from './transition-score.js';
import { scoreChordTransition, TRANSITION_WEIGHTS } from './transition-score.js';

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

function assertThrowsTypeError(fn, msg = '') {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = err instanceof TypeError;
    if (!threw) throw new Error(`${msg} a levé ${err.constructor.name}, TypeError attendu`);
  }
  if (!threw) throw new Error(`${msg} aucune erreur levée, TypeError attendu`);
}

function assertAllNumbersFinite(value, path = 'result') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} n'est pas fini : ${value}`);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      assertAllNumbersFinite(value[key], `${path}.${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers de construction de candidats
// ---------------------------------------------------------------------------

function makeCandidate(id, pcs, rootPc, bassPc = null, degree = null, spelling = null) {
  return {
    id,
    anchorId: 'anchor-test',
    melodyEventId: null,
    rootPitchClass: rootPc,
    bassPitchClass: bassPc,
    rootSpelling: spelling || { pitchClass: rootPc, letter: 'C', accidental: 0, octave: null, origin: 'fallback', explicit: false },
    qualityId: 'test',
    pitchClasses: pcs.slice(),
    tonalRelation: degree == null
      ? { degree: null, romanNumeral: null, diatonic: true, borrowed: false, secondaryDominantTarget: null, approachType: 'none' }
      : { degree, romanNumeral: String(degree), diatonic: true, borrowed: false, secondaryDominantTarget: null, approachType: 'none' },
  };
}

function makeCandidateNoBass(id, pcs, rootPc, degree = null) {
  const c = makeCandidate(id, pcs, rootPc, null, degree);
  delete c.bassPitchClass;
  return c;
}

function makeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

function trackFromMidiNotes(midis) {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });
  for (const midi of midis) {
    capture.noteOn(midi, 0.8, 0);
    clock.advance(400);
    capture.noteOff(midi, 0, 0);
    clock.advance(100);
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-trans' });
}

function harmonicContextInKey(track, keyString) {
  const tonalContext = setManualTonalContext(createTonalContext(), keyString);
  return createHarmonicContext(track, { tonalContext });
}

console.log('=== Incrément 5 — Scoring de transition entre ChordCandidate ===\n');

// ===========================================================================
// T1 — Déterminisme
// ===========================================================================

runTest('T01 — Deux appels identiques produisent exactement le même JSON', () => {
  const c = makeCandidate('c1', [0, 4, 7, 11], 0);
  const g = makeCandidate('g7', [7, 11, 2, 5], 7, null, 4);
  const s1 = scoreChordTransition({ from: c, to: g });
  const s2 = scoreChordTransition({ from: c, to: g });
  assertEqual(JSON.stringify(s1), JSON.stringify(s2));
});

// ===========================================================================
// T2 — Non-mutation et gel
// ===========================================================================

runTest('T02 — Candidats profonds inchangés après l\'appel', () => {
  const c = makeCandidate('c1', [0, 4, 7, 11], 0);
  const g = makeCandidate('g7', [7, 11, 2, 5], 7, null, 4);
  const cJson = JSON.stringify(c);
  const gJson = JSON.stringify(g);
  scoreChordTransition({ from: c, to: g });
  assertEqual(JSON.stringify(c), cJson, 'from muté');
  assertEqual(JSON.stringify(g), gJson, 'to muté');
});

runTest('T02b — Résultat et structures imbriquées figés', () => {
  const c = makeCandidate('c1', [0, 4, 7, 11], 0);
  const g = makeCandidate('g7', [7, 11, 2, 5], 7);
  const s = scoreChordTransition({ from: c, to: g });
  assertTrue(Object.isFrozen(s));
  assertTrue(Object.isFrozen(s.componentScores));
  assertTrue(Object.isFrozen(s.activeWeights));
  assertTrue(Object.isFrozen(s.limits));
});

// ===========================================================================
// T3 — Équivalence enharmonique
// ===========================================================================

runTest('T03 — Même identité sonore, orthographes différentes → mêmes scores', () => {
  const pcs = [0, 1, 5, 8]; // C#maj7 / Dbmaj7
  const spellingCs = { pitchClass: 1, letter: 'C', accidental: 1, octave: null, origin: 'key-context', explicit: true };
  const spellingDb = { pitchClass: 1, letter: 'D', accidental: -1, octave: null, origin: 'key-context', explicit: true };
  const sCs = scoreChordTransition({
    from: makeCandidate('from-cs', pcs, 1, null, null, spellingCs),
    to: makeCandidate('to-cs', pcs, 1, null, null, spellingCs),
  });
  const sDb = scoreChordTransition({
    from: makeCandidate('from-db', pcs, 1, null, null, spellingDb),
    to: makeCandidate('to-db', pcs, 1, null, null, spellingDb),
  });
  assertDeepEqual(sCs.componentScores, sDb.componentScores);
  assertEqual(sCs.totalScore, sDb.totalScore);
  assertEqual(sCs.commonTones, sDb.commonTones);
  assertEqual(sCs.movementSemitones, sDb.movementSemitones);
  assertEqual(sCs.fromId, 'from-cs');
  assertEqual(sDb.fromId, 'from-db');
});

// ===========================================================================
// T4 — Notes communes
// ===========================================================================

runTest('T04 — Mouvement de fondamentale contrôlé : plus de notes communes → commonScore ≥', () => {
  const from1 = makeCandidate('f1', [0, 4, 7], 0);
  const to3 = makeCandidate('t3', [9, 0, 4], 9);
  const to4 = makeCandidate('t4', [9, 0, 4, 7], 9);
  const s1 = scoreChordTransition({ from: from1, to: to3 });
  const s2 = scoreChordTransition({ from: from1, to: to4 });
  assertEqual(s1.rootFifthsDistance, s2.rootFifthsDistance);
  assertTrue(s2.componentScores.common >= s1.componentScores.common,
    'commonScore plus élevé attendu avec davantage de notes communes');
  assertTrue(s2.commonTones > s1.commonTones);
});

// ===========================================================================
// T5 — Mouvement proche contre éloigné
// ===========================================================================

runTest('T05 — Paire proche obtient un motionScore supérieur', () => {
  const near = scoreChordTransition({ from: makeCandidate('n1', [0, 4, 7], 0), to: makeCandidate('n2', [0, 4, 7, 9], 0) });
  const far = scoreChordTransition({ from: makeCandidate('f1', [0, 4, 7], 0), to: makeCandidate('f2', [1, 5, 8], 6) });
  assertTrue(near.componentScores.motion > far.componentScores.motion);
});

// ===========================================================================
// T6 — Accord identique
// ===========================================================================

runTest('T06 — from === to valide, borné, totalScore = 100', () => {
  const c = makeCandidate('c1', [0, 4, 7, 11], 0);
  const s = scoreChordTransition({ from: c, to: c });
  assertTrue(Number.isFinite(s.totalScore));
  assertTrue(s.totalScore <= 100 && s.totalScore >= 0);
  assertEqual(s.totalScore, 100);
});

runTest('T06b — Deux clones séparés du même candidat', () => {
  const s = scoreChordTransition({
    from: makeCandidate('idem', [0, 4, 7, 11], 0),
    to: makeCandidate('idem', [0, 4, 7, 11], 0),
  });
  assertTrue(Number.isFinite(s.totalScore));
  assertEqual(s.totalScore, 100);
});

// ===========================================================================
// T07 — Cardinalités différentes et symétrie
// ===========================================================================

runTest('T07 — 4 vs 5 pitch classes, symétrie des composantes', () => {
  const maj7 = makeCandidate('cmaj7', [0, 4, 7, 11], 0);
  const maj9 = makeCandidate('cmaj9', [0, 2, 4, 7, 11], 0);
  const sAB = scoreChordTransition({ from: maj7, to: maj9 });
  const sBA = scoreChordTransition({ from: maj9, to: maj7 });
  assertDeepEqual(sAB.componentScores, sBA.componentScores);
  assertEqual(sAB.totalScore, sBA.totalScore);
  assertEqual(sAB.fromId, 'cmaj7');
  assertEqual(sBA.fromId, 'cmaj9');
});

// ===========================================================================
// T08 — Basse absente ou mélangée
// ===========================================================================

runTest('T08 — Deux basses absentes → bassScore null, bass inactif', () => {
  const s = scoreChordTransition({ from: makeCandidate('a', [0, 4, 7], 0), to: makeCandidate('b', [9, 0, 4], 9) });
  assertEqual(s.bassScore, null);
  assertFalse('bass' in s.activeWeights);
});

runTest('T08b — Une seule basse présente → bassScore null', () => {
  const s = scoreChordTransition({ from: makeCandidate('a', [0, 4, 7], 0, 0), to: makeCandidate('b', [9, 0, 4], 9) });
  assertEqual(s.bassScore, null);
  assertFalse('bass' in s.activeWeights);
});

runTest('T08c — Deux basses présentes → composante bass active', () => {
  const s = scoreChordTransition({ from: makeCandidate('a', [0, 4, 7], 0, 0), to: makeCandidate('b', [9, 0, 4], 9, 9) });
  assertTrue(s.bassScore !== null);
  assertEqual(s.activeWeights.bass, TRANSITION_WEIGHTS.bass);
  assertTrue(Number.isFinite(s.bassScore));
});

runTest('T08d — Deux propriétés bassPitchClass omises → valide, bass inactif', () => {
  const s = scoreChordTransition({
    from: makeCandidateNoBass('a', [0, 4, 7], 0),
    to: makeCandidateNoBass('b', [9, 0, 4], 9),
  });
  assertEqual(s.bassScore, null);
  assertFalse('bass' in s.activeWeights);
  assertAllNumbersFinite(s);
});

runTest('T08e — Une seule propriété omise → bassScore null, bass inactif', () => {
  const s = scoreChordTransition({
    from: makeCandidate('a', [0, 4, 7], 0, 0),
    to: makeCandidateNoBass('b', [9, 0, 4], 9),
  });
  assertEqual(s.bassScore, null);
  assertFalse('bass' in s.activeWeights);
  assertAllNumbersFinite(s);
});

runTest('T08f — Ordre inverse : basse omise côté from, présente côté to', () => {
  const s = scoreChordTransition({
    from: makeCandidateNoBass('a', [0, 4, 7], 0),
    to: makeCandidate('b', [9, 0, 4], 9, 9),
  });
  assertEqual(s.bassScore, null);
  assertFalse('bass' in s.activeWeights);
  assertAllNumbersFinite(s);
});

// ===========================================================================
// T09 — Directionnalité
// ===========================================================================

runTest('T09 — V→I active resolutionScore = 100', () => {
  const s = scoreChordTransition({
    from: makeCandidate('g7', [7, 11, 2, 5], 7, null, 4),
    to: makeCandidate('cmaj7', [0, 4, 7, 11], 0, null, 0),
  });
  assertEqual(s.resolutionScore, 100);
  assertEqual(s.activeWeights.resolution, TRANSITION_WEIGHTS.resolution);
  assertEqual(s.direction, 'directional');
});

runTest('T09b — I→V ne bénéficie d\'aucune résolution', () => {
  const s = scoreChordTransition({
    from: makeCandidate('cmaj7', [0, 4, 7, 11], 0, null, 0),
    to: makeCandidate('g7', [7, 11, 2, 5], 7, null, 4),
  });
  assertEqual(s.resolutionScore, null);
  assertFalse('resolution' in s.activeWeights);
  assertEqual(s.direction, 'directional');
});

runTest('T09c — Le bonus V→I rend le total différent de I→V', () => {
  const sVI = scoreChordTransition({
    from: makeCandidate('g7', [7, 11, 2, 5], 7, null, 4),
    to: makeCandidate('cmaj7', [0, 4, 7, 11], 0, null, 0),
  });
  const sIV = scoreChordTransition({
    from: makeCandidate('cmaj7', [0, 4, 7, 11], 0, null, 0),
    to: makeCandidate('g7', [7, 11, 2, 5], 7, null, 4),
  });
  assertTrue(sVI.totalScore !== sIV.totalScore);
  assertTrue(sVI.totalScore > sIV.totalScore);
});

// ===========================================================================
// T10 — Nombres finis
// ===========================================================================

runTest('T10 — Matrice large : tous les nombres sont finis', () => {
  const set = [
    { pcs: [0, 4, 7, 11], root: 0 },
    { pcs: [7, 11, 2, 5], root: 7 },
    { pcs: [9, 0, 4, 7], root: 9 },
    { pcs: [4, 7, 11, 2], root: 4 },
    { pcs: [0, 2, 4, 7, 11], root: 0 },
    { pcs: [6, 10, 1], root: 6 },
    { pcs: [5, 9, 0, 3], root: 5 },
  ];
  const candidates = set.map((c, i) => makeCandidate(`m-${i}`, c.pcs, c.root, i % 3 === 0 ? c.root : null, i % 2 === 0 ? i : null));
  for (const from of candidates) {
    for (const to of candidates) {
      assertAllNumbersFinite(scoreChordTransition({ from, to }), `score(${from.id},${to.id})`);
    }
  }
});

// ===========================================================================
// T11 — Entrées invalides
// ===========================================================================

runTest('T11 — TypeError sur entrées invalides', () => {
  const valid = makeCandidate('v', [0, 4, 7], 0);
  assertThrowsTypeError(() => scoreChordTransition({}), 'candidats absents');
  assertThrowsTypeError(() => scoreChordTransition({ from: null, to: valid }), 'from absent');
  assertThrowsTypeError(() => scoreChordTransition({ from: valid, to: null }), 'to absent');
  assertThrowsTypeError(() => scoreChordTransition({ from: makeCandidate('', [0, 4, 7], 0), to: valid }), 'id absent');
  assertThrowsTypeError(() => scoreChordTransition({ from: makeCandidate('x', [], 0), to: valid }), 'pitchClasses vide');
  assertThrowsTypeError(() => scoreChordTransition({ from: { id: 'x', pitchClasses: 'C', rootPitchClass: 0 }, to: valid }), 'pitchClasses non tableau');
  assertThrowsTypeError(() => scoreChordTransition({ from: makeCandidate('x', [0, 4.5, 7], 0), to: valid }), 'pitch class non entière');
  assertThrowsTypeError(() => scoreChordTransition({ from: makeCandidate('x', [0, 12, 7], 0), to: valid }), 'pitch class hors 0-11');
  assertThrowsTypeError(() => scoreChordTransition({ from: makeCandidate('x', [0, 4, 7]), to: valid }), 'rootPitchClass absent');
  assertThrowsTypeError(() => scoreChordTransition({ from: makeCandidate('x', [0, 4, 7], -1), to: valid }), 'rootPitchClass hors 0-11');
  assertThrowsTypeError(() => scoreChordTransition({ from: makeCandidate('x', [0, 4, 7], 0, 13), to: valid }), 'bassPitchClass hors 0-11');
});

runTest('T11b — from === to ne renvoie jamais d\'erreur', () => {
  const c = makeCandidate('c1', [0, 4, 7], 0);
  const s = scoreChordTransition({ from: c, to: c });
  assertTrue(Number.isFinite(s.totalScore));
});

// ===========================================================================
// T12 — Absence de path finding
// ===========================================================================

runTest('T12 — Aucun champ de chemin dans le résultat', () => {
  const s = scoreChordTransition({ from: makeCandidate('a1', [0, 4, 7], 0), to: makeCandidate('b1', [9, 0, 4], 9) });
  assertFalse('path' in s);
  assertFalse('transitions' in s);
  assertFalse('chosenChord' in s);
  assertFalse('chosenCandidate' in s);
  assertFalse('bestPath' in s);
});

runTest('T12b — Aucune fonction de sélection exportée', () => {
  const keys = Object.keys(transitionModule).filter((k) => typeof transitionModule[k] === 'function');
  assertDeepEqual(keys, ['scoreChordTransition']);
});

// ===========================================================================
// T13 — Compatibilité avec de vrais ChordCandidate
// ===========================================================================

runTest('T13 — De vrais candidats générés passent au scoreur', () => {
  const track = trackFromMidiNotes([60, 64]); // C4 puis E4 en Do majeur
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id,
    relativeTime: track.events[0].startedAt,
    type: 'start',
    harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[1].id,
    relativeTime: track.events[1].startedAt,
    type: 'end',
    harmonizationPolicy: 'automatic',
  });
  const r0 = generateChordCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  const r1 = generateChordCandidatesForAnchor({ anchor: ctx.anchors[1], track, harmonicContext: ctx });
  assertTrue(r0.candidates.length > 0, 'Aucun candidat généré pour l\'ancre 0');
  assertTrue(r1.candidates.length > 0, 'Aucun candidat généré pour l\'ancre 1');
  const c0 = r0.candidates[0];
  const c1 = r1.candidates[0];
  const s = scoreChordTransition({ from: c0, to: c1 });
  assertEqual(s.fromId, c0.id);
  assertEqual(s.toId, c1.id);
  assertAllNumbersFinite(s);
});

// ===========================================================================
// T14 — Non-régression (sanity locale)
// ===========================================================================

runTest('T14 — Sanity des imports sans régression', () => {
  assertEqual(typeof generateChordCandidatesForAnchor, 'function');
  assertEqual(typeof scoreChordTransition, 'function');
  assertEqual(TRANSITION_WEIGHTS.common, 0.35);
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;