// [OpenCode] — 2026-08-06 — Tests de l'Incrément 7 : génération de voicings
// de piano jouables et sélection globale du chemin de voicings optimal.
// Exécutable avec : node src/melody/test-voicing-path-finder.js

import * as voicingPathModule from './voicing-path-finder.js';
import {
  generatePlayableChordVoicings,
  scoreVoicingTransition,
  findBestVoicingPath,
} from './voicing-path-finder.js';
import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createHarmonicContext, addHarmonicAnchor, setStartChord } from './harmonic-context.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';

// constante littérale indépendante du module (VOICING_PATH_SETTINGS n est plus
// exporté : le test ne doit plus l importer).
const SETTINGS = {
  minMidiNote: 36, maxMidiNote: 84,
  leftHandMinMidi: 36, leftHandMaxMidi: 60,
  rightHandMinMidi: 48, rightHandMaxMidi: 84,
  leftHandMinNotes: 1, leftHandMaxNotes: 2,
  rightHandMinNotes: 2, rightHandMaxNotes: 4,
  leftHandMaxSpan: 12, rightHandMaxSpan: 12,
  maxInterHandGap: 24,
  unmatchedVoiceCost: 12, largeLeapThreshold: 7, largeLeapPenalty: 6,
  parallelFifthPenalty: 12, parallelOctavePenalty: 18,
  targetBassMidi: 43, targetLeftUpperMidi: 52, targetRightHandMidi: 64,
};

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
    if (!Number.isInteger(value) || !Number.isFinite(value)) {
      throw new Error(`${path} n'est pas un entier fini : ${value}`);
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
// Helpers de construction de candidats (miroir de l'Incrément 6)
// ---------------------------------------------------------------------------

function makeCandidate(id, rootPc, pcs, opts = {}) {
  const bassPc = opts.bass !== undefined ? opts.bass : null;
  const candidate = {
    id,
    anchorId: opts.anchorId || 'anchor-test',
    melodyEventId: null,
    rootPitchClass: rootPc,
    rootSpelling: { pitchClass: rootPc, letter: 'C', accidental: 0, octave: null, origin: 'fallback', explicit: false },
    qualityId: opts.quality || 'test',
    pitchClasses: pcs.slice(),
    melodyCompatibility: {
      category: opts.category || 'chord-tone',
      melodyPitchClass: 0,
      melodyMidi: null,
      matchingInterval: null,
      exactPitchRequired: false,
      exactPitchSatisfied: true,
      sopranoPolicy: 'free',
      harmonizationPolicy: 'automatic',
      reasons: [],
    },
    tonalRelation: {
      degree: opts.degree === undefined ? null : opts.degree,
      romanNumeral: opts.degree == null ? null : String(opts.degree),
      diatonic: true,
      borrowed: false,
      secondaryDominantTarget: null,
      approachType: 'none',
    },
  };
  if (bassPc !== null) candidate.bassPitchClass = bassPc;
  return candidate;
}

function harmonicResult(candidates) {
  return {
    path: candidates,
    transitions: [],
    compatibilityScore: 100,
    transitionScore: candidates.length > 1 ? 100 : null,
    totalScore: 100,
    weights: { compatibility: 0.6, transition: 0.4 },
  };
}

function makeClock() {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
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
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-v' });
}

function harmonicContextInKey(track, keyString) {
  return createHarmonicContext(track, {
    tonalContext: setManualTonalContext(createTonalContext(), keyString),
  });
}

function candidatesByAnchor(ctx, track, index) {
  const anchor = ctx.anchors[index];
  return generateChordCandidatesForAnchor({ anchor, track, harmonicContext: ctx }).candidates;
}

function compareArrays(x, b) {
  const n = Math.min(x.length, b.length);
  for (let i = 0; i < n; i++) if (x[i] !== b[i]) return x[i] - b[i];
  return x.length - b.length || 0;
}

function mkChord(id, root, pcs) { return makeCandidate(id, root, pcs); }
function mkCompleteCandidate() { return makeCandidate('cc', 0, [0, 4, 7]); }
function scoreTransitionFrom(from, to) {
  return scoreVoicingTransition({ fromMidiNotes: from, toMidiNotes: to });
}

// ---------------------------------------------------------------------------
// Oracle exhaustif indépendant : énumère tous les chemins entre voicings de
// couches données et garde le meilleur selon les neuf critères (coût cumulé,
// octaves, quintes, grands sauts, non appariées, mouvement, registre, puis
// séquence MIDI lexicographique et séquence d indices). Aucune DP ni greedy.
// ---------------------------------------------------------------------------

function exhaustiveOracle(layers) {
  function oracleBeats(a, b) {
    if (a.cost !== b.cost) return a.cost < b.cost;
    if (a.oct !== b.oct) return a.oct < b.oct;
    if (a.fifth !== b.fifth) return a.fifth < b.fifth;
    if (a.leap !== b.leap) return a.leap < b.leap;
    if (a.unm !== b.unm) return a.unm < b.unm;
    if (a.move !== b.move) return a.move < b.move;
    if (a.reg !== b.reg) return a.reg < b.reg;
    for (let i = 0; i < a.midseq.length; i++) {
      const d = compareArrays(a.midseq[i], b.midseq[i]);
      if (d !== 0) return d < 0;
    }
    for (let i = 0; i < a.idxseq.length; i++) {
      if (a.idxseq[i] !== b.idxseq[i]) return a.idxseq[i] < b.idxseq[i];
    }
    return false;
  }
  let best = null;
  function rec(t, chosen, cost, oct, fifth, leap, unm, move, reg) {
    if (t === layers.length) {
      const cand = {
        midseq: chosen.map((v) => v.midiNotes),
        idxseq: chosen.map((v, idx) => layers[idx].indexOf(v)),
        cost, oct, fifth, leap, unm, move, reg,
      };
      if (best === null || oracleBeats(cand, best)) best = cand;
      return;
    }
    for (const v of layers[t]) {
      let nc = cost, no = oct, nf = fifth, nl = leap, nu = unm, nm = move, nr = reg;
      nr += v.registerDeviation;
      if (t > 0) {
        const tr = scoreVoicingTransition({
          fromMidiNotes: chosen[t - 1].midiNotes,
          toMidiNotes: v.midiNotes,
        });
        nc += tr.cost; no += tr.parallelOctaves; nf += tr.parallelFifths;
        nl += tr.largeLeapCount; nu += tr.unmatchedVoiceCount; nm += tr.totalMovement;
      }
      rec(t + 1, chosen.concat([v]), nc, no, nf, nl, nu, nm, nr);
    }
  }
  rec(0, [], 0, 0, 0, 0, 0, 0, 0);
  return best;
}

// ---------------------------------------------------------------------------
// T1 — API : exports (3) et settings littéral indépendant
// ---------------------------------------------------------------------------

runTest('T1 — exports exacts (3) et settings figés/identiques au littéral', () => {
  assertEqual(typeof generatePlayableChordVoicings, 'function');
  assertEqual(typeof scoreVoicingTransition, 'function');
  assertEqual(typeof findBestVoicingPath, 'function');

  // Exports du module en tant que namespace : exactement les trois fonctions.
  assertDeepEqual(
    Object.keys(voicingPathModule).sort(),
    ['findBestVoicingPath', 'generatePlayableChordVoicings', 'scoreVoicingTransition'],
    'exactement 3 exports publics',
  );

  // VoicingTransitionScore : clés exactes.
  const score = scoreVoicingTransition({ fromMidiNotes: [60, 64, 67], toMidiNotes: [60, 64, 67] });
  assertDeepEqual(Object.keys(score).sort(), [
    'cost', 'largeLeapCount', 'maxMovement', 'movements', 'parallelFifths',
    'parallelOctaves', 'stationaryVoiceCount', 'totalMovement', 'unmatchedVoiceCount',
  ], 'clés du VoicingTransitionScore');
  // VoicingMovement : clés exactes sur un mouvement match.
  assertDeepEqual(Object.keys(score.movements[0]).sort(), [
    'fromIndex', 'fromNote', 'semitones', 'toIndex', 'toNote',
  ], 'clés du VoicingMovement');

  const cand = makeCandidate('c', 0, [0, 4, 7]);
  const result = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand]) });
  // VoicingPathResult : clés exactes.
  assertDeepEqual(
    Object.keys(result).sort(),
    ['chordPath', 'largeLeapCount', 'parallelFifths', 'parallelOctaves', 'registerDeviation',
      'settings', 'totalCost', 'totalMovement', 'transitions', 'unmatchedVoiceCount', 'voicings'],
    'champs exacts du VoicingPathResult',
  );
  // transitioion wrapper : { from, to, score }.
  const two = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand, cand]) });
  assertDeepEqual(Object.keys(two.transitions[0]).sort(), ['from', 'score', 'to'],
    'wrapper transition { from, to, score }');
  assertTrue(Object.keys(two.transitions[0].from).length > 0, 'from = PianoVoicing');
  // PianoVoicing : clés exactes.
  assertDeepEqual(Object.keys(two.transitions[0].from).sort(), [
    'bassMidiNote', 'bassPitchClass', 'candidate', 'inversionInterval', 'isRootPosition',
    'leftHand', 'midiNotes', 'registerDeviation', 'rightHand', 'spanSemitones',
  ], 'clés du PianoVoicing');

  assertTrue(Object.isFrozen(result.settings), 'settings figé');
  assertDeepEqual(Object.keys(result.settings).sort(), Object.keys(SETTINGS).sort(), 'clés settings');
  assertEqual(Object.keys(result.settings).length, 21, '21 clés settings');
  for (const k of Object.keys(SETTINGS)) {
    assertEqual(result.settings[k], SETTINGS[k], `settings.${k}`);
  }
});

// ---------------------------------------------------------------------------
// T2 — Génération d'un accord réel
// ---------------------------------------------------------------------------

runTest('T2 — génération d un accord réel', () => {
  const cand = mkChord('c-maj7', 0, [0, 4, 7, 11]);
  const vs = generatePlayableChordVoicings({ candidate: cand });
  assertTrue(vs.length > 0, 'au moins un voicing');
  for (const v of vs) {
    const pcs = v.midiNotes.map((n) => n % 12);
    assertEqual(new Set(pcs).size, 4, 'chaque pc exactement une fois');
    for (const pc of [0, 4, 7, 11]) assertTrue(pcs.includes(pc), `pc ${pc} manquant`);
    assertEqual(pcs.length, 4, 'aucune note étrangère');
    for (let i = 1; i < v.midiNotes.length; i++) {
      assertTrue(v.midiNotes[i] > v.midiNotes[i - 1], 'strictement croissant');
    }
    assertDeepEqual(v.leftHand.concat(v.rightHand), v.midiNotes, 'LH.concat(RH) === midiNotes');
    assertTrue(v.leftHand.length >= SETTINGS.leftHandMinNotes);
    assertTrue(v.leftHand.length <= SETTINGS.leftHandMaxNotes);
    assertTrue(v.rightHand.length >= SETTINGS.rightHandMinNotes);
    assertTrue(v.rightHand.length <= SETTINGS.rightHandMaxNotes);
    assertEqual(v.bassMidiNote, v.midiNotes[0], 'bassMidiNote = première note');
    assertEqual(v.bassPitchClass, v.midiNotes[0] % 12);
  }
});

// ---------------------------------------------------------------------------
// T3 — Basse explicite
// ---------------------------------------------------------------------------

runTest('T3 — basse dans l accord et basse externe, toujours la plus grave', () => {
  const inChord = mkChord('c/e', 0, [0, 4, 7], { quality: 'test', bass: 4 });
  inChord.bassPitchClass = 4;
  const vs1 = generatePlayableChordVoicings({ candidate: inChord });
  assertTrue(vs1.length > 0);
  for (const v of vs1) assertEqual(v.midiNotes[0] % 12, 4, 'basse dans l accord = plus grave');

  const ext = mkChord('c/d', 0, [0, 4, 7]);
  ext.bassPitchClass = 2;
  const vs2 = generatePlayableChordVoicings({ candidate: ext });
  assertTrue(vs2.length > 0);
  for (const v of vs2) {
    assertEqual(v.midiNotes[0] % 12, 2, 'basse externe = plus grave');
    const pcs = v.midiNotes.map((n) => n % 12);
    for (const pc of [0, 4, 7, 2]) assertTrue(pcs.includes(pc), `pc ${pc} présent`);
  }
});

// ---------------------------------------------------------------------------
// T4 — Basse omise et null
// ---------------------------------------------------------------------------

runTest('T4 — basse omise et null valides, plusieurs renverseents, pas de NaN', () => {
  const cand = mkChord('c', 0, [0, 4, 7]);
  const vsOmitted = generatePlayableChordVoicings({ candidate: cand });
  const candNull = { ...makeCandidate('c2', 0, [0, 4, 7]), bassPitchClass: null };
  const vsNull = generatePlayableChordVoicings({ candidate: candNull });
  assertTrue(vsOmitted.length > 0 && vsNull.length > 0);
  assertEqual(vsOmitted.length, vsNull.length);
  const inversions = new Set(vsOmitted.map((v) => v.inversionInterval));
  assertTrue(inversions.size > 1, 'plusieurs renversements possibles sans basse');
  assertAllNumbersFinite(vsOmitted);
  assertAllNumbersFinite(vsNull);
});

// ---------------------------------------------------------------------------
// T5 — Registre : bornes inclusives prouvées (36 et 84 réellement générées)
// ---------------------------------------------------------------------------

runTest('T5 — bornes inclusives 36/84 atteintes, mains, spans, registerDeviation', () => {
  const cand = mkChord('c', 0, [0, 4, 7]);
  const vs = generatePlayableChordVoicings({ candidate: cand });
  // Codecs: les bornes sont atteignables, pas seulement vérifiées par inégalité.
  assertTrue(vs.some((v) => v.midiNotes.includes(36)), 'contient la note 36');
  assertTrue(vs.some((v) => v.midiNotes.includes(84)), 'contient la note 84');

  const s = SETTINGS;
  for (const v of vs) {
    for (const n of v.midiNotes) assertTrue(n >= s.minMidiNote && n <= s.maxMidiNote, `note ${n}>${s.maxMidiNote} ou <${s.minMidiNote}`);
    assertTrue(v.leftHand.length <= 2, 'max 2 notes à gauche');
    assertTrue(v.rightHand.length <= 4, 'max 4 notes à droite');
    if (v.leftHand.length > 1) assertTrue(v.leftHand[1] - v.leftHand[0] <= s.leftHandMaxSpan);
    assertTrue(v.rightHand[v.rightHand.length - 1] - v.rightHand[0] <= s.rightHandMaxSpan);
    assertTrue(v.leftHand[v.leftHand.length - 1] < v.rightHand[0], 'LH strictly below RH');
    assertTrue(v.rightHand[0] - v.leftHand[v.leftHand.length - 1] <= s.maxInterHandGap);
    let dev = Math.abs(v.leftHand[0] - s.targetBassMidi);
    if (v.leftHand.length > 1) dev += Math.abs(v.leftHand[1] - s.targetLeftUpperMidi);
    for (const rn of v.rightHand) dev += Math.abs(rn - s.targetRightHandMidi);
    assertEqual(v.registerDeviation, dev);
    assertEqual(v.spanSemitones, v.midiNotes[v.midiNotes.length - 1] - v.midiNotes[0]);
  }
});

// ---------------------------------------------------------------------------
// T6 — Transition immobile
// ---------------------------------------------------------------------------

runTest('T6 — transition immobile (mêmes notes)', () => {
  const t = scoreTransitionFrom([60, 64, 67], [60, 64, 67]);
  assertEqual(t.totalMovement, 0);
  assertEqual(t.maxMovement, 0);
  assertEqual(t.stationaryVoiceCount, 3);
  assertEqual(t.unmatchedVoiceCount, 0);
  assertEqual(t.largeLeapCount, 0);
  assertEqual(t.parallelFifths, 0);
  assertEqual(t.parallelOctaves, 0);
  assertEqual(t.cost, 0);
});

// ---------------------------------------------------------------------------
// T7 — Mouvement simple
// ---------------------------------------------------------------------------

runTest('T7 — mouvement simple vérifié manuellement', () => {
  const t = scoreTransitionFrom([60, 64, 67], [62, 64, 70]);
  assertEqual(t.totalMovement, 5);
  assertEqual(t.maxMovement, 3);
  assertEqual(t.stationaryVoiceCount, 1);
  assertEqual(t.unmatchedVoiceCount, 0);
  assertEqual(t.largeLeapCount, 0);
  assertEqual(t.cost, 5);
  assertEqual(t.movements.length, 3);
  assertDeepEqual(t.movements[0], { fromIndex: 0, toIndex: 0, fromNote: 60, toNote: 62, semitones: 2 });
});

// ---------------------------------------------------------------------------
// T8 — RÉGRESSION : cardinalités égales, appariement direct par indice
// ---------------------------------------------------------------------------

runTest('T8 — cardinalités égales : appariement direct par indice (36→72)', () => {
  const t = scoreTransitionFrom([36, 41, 47], [72, 77, 83]);
  assertEqual(t.unmatchedVoiceCount, 0, 'aucune insertion/suppression');
  assertEqual(t.totalMovement, 108, '3×36');
  assertEqual(t.maxMovement, 36);
  assertEqual(t.stationaryVoiceCount, 0);
  assertEqual(t.largeLeapCount, 3, '3 grands sauts de 36');
  assertEqual(t.parallelFifths, 0);
  assertEqual(t.parallelOctaves, 0);
  assertEqual(t.cost, 108 + 3 * SETTINGS.largeLeapPenalty, '108 + 3×6 = 126');
  assertDeepEqual(t.movements.map((mm) => [mm.fromIndex, mm.toIndex]), [[0, 0], [1, 1], [2, 2]]);
  assertDeepEqual(t.movements.map((mm) => [mm.fromNote, mm.toNote]), [[36, 72], [41, 77], [47, 83]]);
});

// ---------------------------------------------------------------------------
// T8b — Cardinalités différentes : immobiles + suppression, sans croisement
// ---------------------------------------------------------------------------

runTest('T8b — cardinalités différentes : [60,64,67]→[60,64]', () => {
  const t = scoreTransitionFrom([60, 64, 67], [60, 64]);
  assertEqual(t.unmatchedVoiceCount, 1, 'une suppression');
  assertEqual(t.totalMovement, 0, 'aucun mouvement');
  assertEqual(t.cost, SETTINGS.unmatchedVoiceCost, 'cost = 12');
  assertEqual(t.stationaryVoiceCount, 2, 'deux voix immobiles');
  assertEqual(t.largeLeapCount, 0);
  assertEqual(t.parallelFifths, 0);
  assertEqual(t.parallelOctaves, 0);
  // Pas de croisement : appariements 60→60 puis 64→64, suppression de 67.
  assertDeepEqual(t.movements.map((mm) => [mm.fromIndex, mm.toIndex]),
    [[0, 0], [1, 1], [2, null]], 'ordres non croisés');
  assertDeepEqual(t.movements.map((mm) => [mm.fromNote, mm.toNote]),
    [[60, 60], [64, 64], [67, null]], 'notes exactes');
});

// ---------------------------------------------------------------------------
// T8c — Égalités exactes d alignement (suite d opérations depuis le début)
// ---------------------------------------------------------------------------

runTest('T8c — égalités [50]↔[48,52] : match/insert puis match/delete', () => {
  const a = scoreTransitionFrom([50], [48, 52]);
  assertDeepEqual(a.movements.map((mm) =>
    mm.fromIndex === null ? 'insert' : mm.toIndex === null ? 'delete' : 'match'),
    ['match', 'insert'], 'A : match puis insert (voix graves d abord)');
  assertDeepEqual(a.movements[0], { fromIndex: 0, toIndex: 0, fromNote: 50, toNote: 48, semitones: 2 },
    'A mouvement 1 : 50→48');
  assertEqual(a.movements[1].fromIndex, null);
  assertEqual(a.movements[1].toIndex, 1);
  assertEqual(a.movements[1].fromNote, null);
  assertEqual(a.movements[1].toNote, 52);
  assertEqual(a.movements[1].semitones, null);
  assertEqual(a.totalMovement, 2);
  assertEqual(a.maxMovement, 2);
  assertEqual(a.stationaryVoiceCount, 0);
  assertEqual(a.unmatchedVoiceCount, 1);
  assertEqual(a.largeLeapCount, 0);
  assertEqual(a.parallelFifths, 0);
  assertEqual(a.parallelOctaves, 0);
  assertEqual(a.cost, 14);

  const b = scoreTransitionFrom([48, 52], [50]);
  assertDeepEqual(b.movements.map((mm) =>
    mm.fromIndex === null ? 'insert' : mm.toIndex === null ? 'delete' : 'match'),
    ['match', 'delete'], 'B : match puis delete');
  assertDeepEqual(b.movements[0], { fromIndex: 0, toIndex: 0, fromNote: 48, toNote: 50, semitones: 2 },
    'B : 48→50 apparié');
  assertEqual(b.movements[1].fromIndex, 1);
  assertEqual(b.movements[1].toIndex, null);
  assertEqual(b.movements[1].fromNote, 52);
  assertEqual(b.movements[1].semitones, null);
  assertEqual(b.totalMovement, 2);
  assertEqual(b.maxMovement, 2);
  assertEqual(b.stationaryVoiceCount, 0);
  assertEqual(b.unmatchedVoiceCount, 1);
  assertEqual(b.largeLeapCount, 0);
  assertEqual(b.parallelFifths, 0);
  assertEqual(b.parallelOctaves, 0);
  assertEqual(b.cost, 14);
});

// ---------------------------------------------------------------------------
// T9 — Parallèles
// ---------------------------------------------------------------------------

runTest('T9 — quintes et octaves parallèles, direction, pas d unisson', () => {
  const fifth = scoreTransitionFrom([55, 62], [57, 64]);
  assertEqual(fifth.parallelFifths, 1);
  assertEqual(fifth.totalMovement, 4);
  assertEqual(fifth.cost, 4 + 12);

  const oct = scoreTransitionFrom([48, 60], [50, 62]);
  assertEqual(oct.parallelOctaves, 1);

  const contra = scoreTransitionFrom([55, 62], [53, 64]);
  assertEqual(contra.parallelFifths, 0);

  const oblique = scoreTransitionFrom([55, 62], [55, 64]);
  assertEqual(oblique.parallelFifths, 0);

  const oct2 = scoreTransitionFrom([48, 72], [50, 74]);
  assertEqual(oct2.parallelOctaves, 1);
  const notOct = scoreTransitionFrom([48, 60], [50, 62]);
  assertEqual(notOct.parallelFifths, 0);
  assertEqual(notOct.parallelOctaves, 1);
});

// ---------------------------------------------------------------------------
// T10 — Greedy indépendant vs DP (fixture C → G7 → Fmaj7, ≥3 couches)
// ---------------------------------------------------------------------------

runTest('T10 — greedy vs DP : DP strictement meilleur (C→G7→Fmaj7)', () => {
  const C = mkChord('x0', 0, [0, 4, 7]);
  const G7 = mkChord('x1', 7, [7, 11, 2, 5]);
  const FM7 = mkChord('x2', 5, [5, 9, 0, 4]);
  const cs = [C, G7, FM7];

  function movingTotals(seq) {
    let t = { cost: 0, oct: 0, fifth: 0, leap: 0, unm: 0, move: 0, reg: 0 };
    for (let i = 0; i < seq.length; i++) {
      t.reg += seq[i].registerDeviation;
      if (i > 0) {
        const tr = scoreVoicingTransition({ fromMidiNotes: seq[i - 1].midiNotes, toMidiNotes: seq[i].midiNotes });
        t.cost += tr.cost; t.oct += tr.parallelOctaves; t.fifth += tr.parallelFifths;
        t.leap += tr.largeLeapCount; t.unm += tr.unmatchedVoiceCount; t.move += tr.totalMovement;
      }
    }
    return t;
  }

  // greedy indépendant : couche 0 = min(registre) ; puis min locale du
  // (cost, octaves, quintes, sauts, non appariées, mouvement, registre next).
  const layers = cs.map((c) => generatePlayableChordVoicings({ candidate: c }));
  const g = [];
  g.push(layers[0].slice().sort((x, y) =>
    x.registerDeviation - y.registerDeviation || compareArrays(x.midiNotes, y.midiNotes))[0]);
  for (let t = 1; t < layers.length; t++) {
    const last = g[t - 1];
    let best = null;
    let bestKey = null;
    for (const vo of layers[t]) {
      const tr = scoreVoicingTransition({ fromMidiNotes: last.midiNotes, toMidiNotes: vo.midiNotes });
      const key = [tr.cost, tr.parallelOctaves, tr.parallelFifths, tr.largeLeapCount,
        tr.unmatchedVoiceCount, tr.totalMovement, vo.registerDeviation];
      if (bestKey === null || lessKey(key, bestKey)) { best = vo; bestKey = key; }
    }
    g.push(best);
  }
  function lessKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; }

  const dm = findBestVoicingPath({ harmonicPathResult: harmonicResult(cs) });
  const gMid = g.map((v) => v.midiNotes);
  const dMid = dm.voicings.map((v) => v.midiNotes);
  assertEqual(dm.voicings.length, 3, '3 couches');
  assertTrue(JSON.stringify(gMid) !== JSON.stringify(dMid), 'greedy diverge de la DP');
  assertTrue(JSON.stringify(gMid[0]) !== JSON.stringify(dMid[0]) ||
             JSON.stringify(gMid[1]) !== JSON.stringify(dMid[1]), 'le premier choix diffère');

  const tg = movingTotals(g);
  const tp = { cost: dm.totalCost, oct: dm.parallelOctaves, fifth: dm.parallelFifths,
    leap: dm.largeLeapCount, unm: dm.unmatchedVoiceCount, move: dm.totalMovement, reg: dm.registerDeviation };

  const ORDER = ['cost', 'oct', 'fifth', 'leap', 'unm', 'move', 'reg'];
  let strictlyBetter = false;
  for (const f of ORDER) {
    if (tp[f] !== tg[f]) { strictlyBetter = tp[f] < tg[f]; break; }
  }
  assertTrue(strictlyBetter, 'le tuple DP bat strictement le greedy');
  // cohérence interne : totalCost = somme des coûts de transition.
  assertEqual(dm.transitions.reduce((a, t) => a + t.score.cost, 0), dm.totalCost, 'totalCost = Σ transitions');

  // La DP correspond exactement à l oracle exhaustif sur cette même progression.
  const oracle = exhaustiveOracle(layers);
  assertDeepEqual(dMid, oracle.midseq, 'la DP doit égaler l oracle exhaustif');
  assertEqual(dm.totalCost, oracle.cost);
  assertEqual(dm.parallelOctaves, oracle.oct);
  assertEqual(dm.parallelFifths, oracle.fifth);
  assertEqual(dm.largeLeapCount, oracle.leap);
  assertEqual(dm.unmatchedVoiceCount, oracle.unm);
  assertEqual(dm.totalMovement, oracle.move);
  assertEqual(dm.registerDeviation, oracle.reg);
});

// ---------------------------------------------------------------------------
// T11 — Oracle exhaustif indépendant (petites couches, tuple complet)
// ---------------------------------------------------------------------------

runTest('T11 — oracle exhaustif indépendant (petites couches)', () => {
  const cand0 = mkChord('a', 0, [0, 4, 7]);
  const cand1 = mkChord('b', 5, [5, 9, 0, 2]);
  const cand2 = mkChord('c', 0, [0, 4, 7]);
  const layers = [cand0, cand1, cand2].map((c) => generatePlayableChordVoicings({ candidate: c }));

  const best = exhaustiveOracle(layers);

  const result = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand0, cand1, cand2]) });
  assertDeepEqual(result.voicings.map((v) => v.midiNotes), best.midseq, 'la DP doit égaler l oracle');
  assertEqual(result.totalCost, best.cost);
  assertEqual(result.registerDeviation, best.reg);
  assertEqual(result.parallelOctaves, best.oct);
  assertEqual(result.parallelFifths, best.fifth);
  assertEqual(result.unmatchedVoiceCount, best.unm);
  assertEqual(result.largeLeapCount, best.leap);
  assertEqual(result.totalMovement, best.move);
});

// ---------------------------------------------------------------------------
// T12 — Une seule couche
// ---------------------------------------------------------------------------

runTest('T12 — une couche : registre centré puis départage MIDI, totaux nuls', () => {
  const cand = mkChord('c', 0, [0, 4, 7, 11]);
  const result = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand]) });
  assertEqual(result.voicings.length, 1);
  assertEqual(result.transitions.length, 0);
  assertEqual(result.totalMovement, 0);
  assertEqual(result.unmatchedVoiceCount, 0);
  assertEqual(result.largeLeapCount, 0);
  assertEqual(result.parallelFifths, 0);
  assertEqual(result.parallelOctaves, 0);
  assertEqual(result.totalCost, 0);
  const all = generatePlayableChordVoicings({ candidate: cand });
  const bestReg = all.reduce((min, v) =>
    v.registerDeviation < min.registerDeviation || (v.registerDeviation === min.registerDeviation && compareArrays(v.midiNotes, min.midiNotes) < 0) ? v : min, all[0],
  );
  assertDeepEqual(result.voicings[0].midiNotes, bestReg.midiNotes, 'registre le mieux centré');
  assertEqual(result.voicings[0].registerDeviation, bestReg.registerDeviation);
});

// ---------------------------------------------------------------------------
// T13 — Accord répété : midiNotes identiques et result déterministe
// ---------------------------------------------------------------------------

runTest('T13 — [c,c,c] voicing répété, midiNotes identiques, déterminisme', () => {
  const c = mkChord('cc', 0, [0, 4, 7]);
  const r1 = findBestVoicingPath({ harmonicPathResult: harmonicResult([c, c, c]) });
  const r2 = findBestVoicingPath({ harmonicPathResult: harmonicResult([c, c, c]) });
  assertDeepEqual(r1, r2, 'appels répétés identiques');
  const mid = r1.voicings.map((v) => v.midiNotes);
  assertDeepEqual(mid[0], mid[1], 'couche 0 == couche 1');
  assertDeepEqual(mid[1], mid[2], 'couche 1 == couche 2');
  assertTrue(r1.voicings.every((v) => v.candidate === c), 'références exactes');
});

// ---------------------------------------------------------------------------
// T14 — Départages déterministes (registe + ordre MIDI) et non-atteignabilités
// ---------------------------------------------------------------------------

runTest('T14 — départages registre/MIDI, témoins métriques exacts, non-atteignabilité octaves', () => {
  const c = mkChord('d', 0, [0, 4, 7]);
  const vsC = generatePlayableChordVoicings({ candidate: c });

  // (1) identité exacte cost = mouvement + pénalités (le mouvement ne tranche
  //     jamais seul) sur toutes les transitions d un voicing réel.
  for (const a of vsC) for (const b of vsC) {
    const t = scoreVoicingTransition({ fromMidiNotes: a.midiNotes, toMidiNotes: b.midiNotes });
    const rhs = t.totalMovement + SETTINGS.unmatchedVoiceCost * t.unmatchedVoiceCount +
      SETTINGS.largeLeapPenalty * t.largeLeapCount +
      SETTINGS.parallelFifthPenalty * t.parallelFifths +
      SETTINGS.parallelOctavePenalty * t.parallelOctaves;
    assertEqual(rhs, t.cost, 'cost = mouvement + pénalités exactes');
  }

  // (2) témoins métriques exacts : quintes, critères précédents égaux.
  {
    const t1 = scoreVoicingTransition({ fromMidiNotes: [36, 52, 55], toMidiNotes: [43, 64, 72] });
    assertEqual(t1.cost, 48); assertEqual(t1.parallelOctaves, 0);
    assertEqual(t1.parallelFifths, 0); assertEqual(t1.largeLeapCount, 2);
    assertEqual(t1.unmatchedVoiceCount, 0); assertEqual(t1.totalMovement, 36);
    const t2 = scoreVoicingTransition({ fromMidiNotes: [40, 48, 55], toMidiNotes: [40, 60, 67] });
    assertEqual(t2.cost, 48); assertEqual(t2.parallelOctaves, 0);
    assertEqual(t2.parallelFifths, 1); assertEqual(t2.largeLeapCount, 2);
    assertEqual(t2.unmatchedVoiceCount, 0); assertEqual(t2.totalMovement, 24);
  }

  // (3) témoins métriques exacts : grands sauts, critères précédents égaux.
  {
    const t1 = scoreVoicingTransition({ fromMidiNotes: [36, 52, 55], toMidiNotes: [43, 64, 72] });
    assertEqual(t1.cost, 48); assertEqual(t1.parallelOctaves, 0);
    assertEqual(t1.parallelFifths, 0); assertEqual(t1.largeLeapCount, 2);
    const t2 = scoreVoicingTransition({ fromMidiNotes: [43, 64, 72], toMidiNotes: [52, 55, 60] });
    assertEqual(t2.cost, 48); assertEqual(t2.parallelOctaves, 0);
    assertEqual(t2.parallelFifths, 0); assertEqual(t2.largeLeapCount, 3);
  }

  // (4) témoins métriques exacts : voix non appariées, critères précédents égaux.
  {
    const t1 = scoreVoicingTransition({ fromMidiNotes: [60, 76, 79], toMidiNotes: [40, 55, 59, 60] });
    assertEqual(t1.cost, 65); assertEqual(t1.parallelOctaves, 0);
    assertEqual(t1.parallelFifths, 0); assertEqual(t1.largeLeapCount, 2);
    assertEqual(t1.unmatchedVoiceCount, 1); assertEqual(t1.totalMovement, 41);
    const t2 = scoreVoicingTransition({ fromMidiNotes: [36, 52, 55], toMidiNotes: [60, 64, 67, 71] });
    assertEqual(t2.cost, 65); assertEqual(t2.parallelOctaves, 0);
    assertEqual(t2.parallelFifths, 0); assertEqual(t2.largeLeapCount, 2);
    assertEqual(t2.unmatchedVoiceCount, 3); assertEqual(t2.totalMovement, 17);
  }

  // (5) octaves parallèles structurellement 0 (jamais atteignables → jamais décisives)
  //     sur un chemin V1 généré ; elles restent atteignables dans scoreVoicingTransition.
  for (const a of vsC) for (const b of vsC) {
    const t = scoreVoicingTransition({ fromMidiNotes: a.midiNotes, toMidiNotes: b.midiNotes });
    assertEqual(t.parallelOctaves, 0, 'octaves parallèles structurellement 0');
  }
  const octWitness = scoreVoicingTransition({ fromMidiNotes: [48, 60], toMidiNotes: [50, 62] });
  assertEqual(octWitness.parallelOctaves, 1, 'octaves parallèles atteignables dans scoreVoicingTransition');

  // (6) registre départage : C→C conserve la voicing au meilleur registre.
  const res = findBestVoicingPath({ harmonicPathResult: harmonicResult([c, c]) });
  assertDeepEqual(res.voicings.map((v) => v.midiNotes), [[43, 60, 64], [43, 60, 64]], 'registre min en C→C');

  // (7) départ (ordre MIDI) à registre égal : Cmaj7 seul.
  const c4 = mkChord('c4t', 0, [0, 4, 7, 11]);
  const solo = findBestVoicingPath({ harmonicPathResult: harmonicResult([c4]) });
  const all4 = generatePlayableChordVoicings({ candidate: c4 });
  const minReg = Math.min(...all4.map((v) => v.registerDeviation));
  const ties = all4.filter((v) => v.registerDeviation === minReg);
  assertTrue(ties.length > 1, 'au moins 2 voicings à registre égal pour rendre le test pertinent');
  const lexMin = ties.slice().sort((x, y) => compareArrays(x.midiNotes, y.midiNotes))[0];
  assertDeepEqual(solo.voicings[0].midiNotes, lexMin.midiNotes,
    'à registre égal, l ordre MIDI départage');

  // (8) déterminisme parfait.
  assertDeepEqual(
    findBestVoicingPath({ harmonicPathResult: harmonicResult([c, c, c]) }),
    findBestVoicingPath({ harmonicPathResult: harmonicResult([c, c, c]) }),
    'déterminisme',
  );
});

// ---------------------------------------------------------------------------
// T15 — Immutabilité
// ---------------------------------------------------------------------------

runTest('T15 — entrées non mutées, résultats figés', () => {
  const cand = mkChord('c', 0, [0, 4, 7]);
  const snapshot = JSON.stringify(cand);
  const r = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand]) });
  assertEqual(JSON.stringify(cand), snapshot, 'candidat non modifié');
  assertFalse(Object.isFrozen(cand), 'candidat d entrée non figé');
  assertTrue(Object.isFrozen(r));
  assertTrue(Object.isFrozen(r.voicings));
  assertTrue(Object.isFrozen(r.transitions));
  assertTrue(Object.isFrozen(r.settings));
  for (const v of r.voicings) {
    assertTrue(Object.isFrozen(v));
    assertTrue(Object.isFrozen(v.midiNotes));
    assertTrue(Object.isFrozen(v.leftHand));
    assertTrue(Object.isFrozen(v.rightHand));
  }
});

// ---------------------------------------------------------------------------
// T16 — Entrées invalides
// ---------------------------------------------------------------------------

runTest('T16 — TypeError sur entrées invalides (options / chemins creux)', () => {
  assertThrowsTypeError(() => scoreVoicingTransition(), 'options absente');
  assertThrowsTypeError(() => scoreVoicingTransition(undefined), 'options undefined');
  assertThrowsTypeError(() => scoreVoicingTransition(null), 'options null');
  assertThrowsTypeError(() => scoreVoicingTransition(5), 'options primitive');
  assertThrowsTypeError(() => scoreVoicingTransition([1, 2]), 'options tableau');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [60] }), 'to absent');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [60], toMidiNotes: [] }), 'to vide');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [60.5], toMidiNotes: [64] }), 'flottant');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [NaN], toMidiNotes: [64] }), 'NaN');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [Infinity], toMidiNotes: [64] }), 'Infinity');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [60, 60], toMidiNotes: [64, 65] }), 'doublon');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [64, 60], toMidiNotes: [60, 62] }), 'non trié');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [200], toMidiNotes: [64] }), 'hors 0-127');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [-5], toMidiNotes: [64] }), 'négatif');
  // valeurs hors bornes des deux côtés.
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [150], toMidiNotes: [-3] }), 'hors bornes des deux côtés');
  const sparseF = []; sparseF[0] = 60; sparseF[2] = 64;
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: sparseF, toMidiNotes: [64, 67] }), 'from creux');
  const sparseT = []; sparseT[0] = 60; sparseT[2] = 64;
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [64, 67], toMidiNotes: sparseT }), 'to creux');
  const sparseBothF = []; sparseBothF[0] = 60; sparseBothF[2] = 64;
  const sparseBothT = []; sparseBothT[0] = 64; sparseBothT[2] = 67;
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: sparseBothF, toMidiNotes: sparseBothT }), 'creux des deux côtés');
  // fromMidiNotes absent.
  assertThrowsTypeError(() => scoreVoicingTransition({ toMidiNotes: [64] }), 'from absent');
  // options tableau portant artificiellement les notes.
  const arrNotes = []; arrNotes.fromMidiNotes = [60]; arrNotes.toMidiNotes = [64];
  assertThrowsTypeError(() => scoreVoicingTransition(arrNotes), 'options tableau avec from/to');

  assertThrowsTypeError(() => generatePlayableChordVoicings(), 'gen sans options');
  assertThrowsTypeError(() => generatePlayableChordVoicings(null), 'gen null');
  assertThrowsTypeError(() => generatePlayableChordVoicings([]), 'gen tableau');
  assertThrowsTypeError(() => generatePlayableChordVoicings({}), 'gen candidate absent');
  assertThrowsTypeError(() => generatePlayableChordVoicings(5), 'gen primitive');
  // options tableau portant artificiellement candidate.
  const arrCand = []; arrCand.candidate = makeCandidate('q', 0, [0, 4, 7]);
  assertThrowsTypeError(() => generatePlayableChordVoicings(arrCand), 'gen options tableau porte candidate');

  assertThrowsTypeError(() => findBestVoicingPath(), 'path sans options');
  assertThrowsTypeError(() => findBestVoicingPath(null), 'path null');
  assertThrowsTypeError(() => findBestVoicingPath([]), 'path tableau');
  assertThrowsTypeError(() => findBestVoicingPath({}), 'hpr absent');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: null }), 'hpr null');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: {} }), 'path absent');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: [] } }), 'path vide');
  // harmonicPathResult tableau portant artificiellement path.
  const arrPath = []; arrPath.path = [mkCompleteCandidate()];
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: arrPath }), 'hpr tableau porte path');
  const creux = []; creux[0] = mkCompleteCandidate(); creux[2] = mkCompleteCandidate();
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: creux } }), 'path creux');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: [null] } }), 'candidat null');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: ['x'] } }), 'candidat non objet');
  const badPc = makeCandidate('p', 0, [0, 15]);
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: [badPc] } }), 'pc hors 0-11');
});

// ---------------------------------------------------------------------------
// T17 — Absence de voicing
// ---------------------------------------------------------------------------

runTest('T17 — RangeError s il n y a aucun voicing admissible', () => {
  const tooSmall = makeCandidate('tiny', 0, [0, 4]); // 2 pcs (< 3)
  let genErr = null;
  try { generatePlayableChordVoicings({ candidate: tooSmall }); } catch (e) { genErr = e; }
  assertTrue(genErr instanceof RangeError, 'RangeError à la génération');
  assertTrue(String(genErr.message).includes('tiny'), 'id candidat dans le message');

  // findBestVoicingPath doit propager un RangeError avec indice ET identifiant.
  let msg = null;
  try { findBestVoicingPath({ harmonicPathResult: harmonicResult([tooSmall]) }); } catch (e) { msg = e; }
  assertTrue(msg instanceof RangeError, 'RangeError au chemin');
  assertTrue(String(msg.message).includes('indice 0'), 'indice dans le message');
  assertTrue(String(msg.message).includes('tiny'), 'identifiant candidat dans le message');
});

// ---------------------------------------------------------------------------
// T18 — Vrais objets du pipeline
// ---------------------------------------------------------------------------

runTest('T18 — génération réelle, HarmonicPath, puis voicings', () => {
  const track = trackFromMidiNotes([60, 64]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = setStartChord(ctx, 'G7', { locked: true });
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
  const l0 = candidatesByAnchor(ctx, track, 0);
  const l1 = candidatesByAnchor(ctx, track, 1);
  const hpr = findBestHarmonicPath({ candidateLayers: [l0, l1] });
  const result = findBestVoicingPath({ harmonicPathResult: hpr });
  assertEqual(result.chordPath.length, hpr.path.length);
  for (let i = 0; i < hpr.path.length; i++) {
    assertEqual(result.chordPath[i], hpr.path[i], 'références exactes');
    assertEqual(result.voicings[i].candidate, hpr.path[i], 'candidate rattaché');
  }
});

// ---------------------------------------------------------------------------
// T19 — Chemin long déterministe et borné
// ---------------------------------------------------------------------------

runTest('T19 — chemin long, fini, déterministe, borné', () => {
  const chords = ['Cmaj7', 'Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7'].map((q, i) =>
    mkChord(`k${i}`, i % 12, [[0, 4, 7, 11], [2, 5, 9, 0], [7, 11, 2, 5], [0, 4, 7, 11], [9, 0, 4], [2, 5, 9, 0], [7, 11, 2, 5], [0, 4, 7, 11]][i]),
  );
  const r1 = findBestVoicingPath({ harmonicPathResult: harmonicResult(chords) });
  const r2 = findBestVoicingPath({ harmonicPathResult: harmonicResult(chords) });
  assertDeepEqual(r1, r2, 'déterminisme long chemin');
  assertEqual(r1.voicings.length, chords.length);
  assertTrue(r1.totalCost >= 0 && r1.registerDeviation >= 0);
  assertAllNumbersFinite(r1);
});

// ---------------------------------------------------------------------------
// T20 — Frontières
// ---------------------------------------------------------------------------

runTest('T20 — aucun champ audio/UI/pédale/doigté, chemin candidat intact', () => {
  const cand = mkChord('c', 0, [0, 4, 7]);
  const r = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand]) });
  const forbidden = new Set(['audio', 'ui', 'pedal', 'finger', 'duration', 'velocity']);
  JSON.stringify(r, (k, v) => {
    assertFalse(forbidden.has(String(k).toLowerCase()), `champ interdit: ${k}`);
    return v;
  });
  const snap = JSON.stringify(cand);
  generatePlayableChordVoicings({ candidate: cand });
  assertEqual(JSON.stringify(cand), snap, 'candidat intact');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed !== total) process.exitCode = 1;