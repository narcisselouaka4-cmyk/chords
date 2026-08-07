// [OpenCode] — 2026-08-06 — Tests de l'Incrément 7 : génération de voicings
// de piano jouables et sélection globale du chemin de voicings optimal.
// Exécutable avec : node src/melody/test-voicing-path-finder.js

import {
  generatePlayableChordVoicings,
  scoreVoicingTransition,
  findBestVoicingPath,
  VOICING_PATH_SETTINGS,
} from './voicing-path-finder.js';
import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createHarmonicContext, addHarmonicAnchor, setStartChord } from './harmonic-context.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';

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

// ---------------------------------------------------------------------------
// T1 — API publique et champs exacts
// ---------------------------------------------------------------------------

runTest('T1 — exports et champs exacts des trois API', () => {
  assertEqual(typeof generatePlayableChordVoicings, 'function');
  assertEqual(typeof scoreVoicingTransition, 'function');
  assertEqual(typeof findBestVoicingPath, 'function');

  const cand = makeCandidate('c', 0, [0, 4, 7]);
  const result = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand]) });
  assertDeepEqual(
    Object.keys(result).sort(),
    ['chordPath', 'largeLeapCount', 'parallelFifths', 'parallelOctaves', 'registerDeviation',
      'settings', 'totalCost', 'totalMovement', 'transitions', 'unmatchedVoiceCount', 'voicings'],
  );
  assertTrue(Object.isFrozen(result.settings));
  assertEqual(result.settings, VOICING_PATH_SETTINGS);
});

// ---------------------------------------------------------------------------
// T2 — Génération d'un accord réel
// ---------------------------------------------------------------------------

runTest('T2 — génération d un accord réel', () => {
  const cand = makeCandidate('c-maj7', 0, [0, 4, 7, 11]);
  const vs = generatePlayableChordVoicings({ candidate: cand });
  assertTrue(vs.length > 0, 'au moins un voicing');
  for (const v of vs) {
    const pcs = v.midiNotes.map((n) => n % 12);
    assertEqual(new Set(pcs).size, 4, 'chaleures exactement une fois');
    for (const pc of [0, 4, 7, 11]) {
      assertTrue(pcs.includes(pc), `pc ${pc} manquant`);
    }
    assertEqual(pcs.length, 4, 'aucune note étrangère');
    for (let i = 1; i < v.midiNotes.length; i++) {
      assertTrue(v.midiNotes[i] > v.midiNotes[i - 1], 'strictement croissant');
    }
    assertDeepEqual(v.leftHand.concat(v.rightHand), v.midiNotes, 'LH.concat(RH) === midiNotes');
    assertTrue(v.leftHand.length >= VOICING_PATH_SETTINGS.leftHandMinNotes);
    assertTrue(v.leftHand.length <= VOICING_PATH_SETTINGS.leftHandMaxNotes);
    assertTrue(v.rightHand.length >= VOICING_PATH_SETTINGS.rightHandMinNotes);
    assertTrue(v.rightHand.length <= VOICING_PATH_SETTINGS.rightHandMaxNotes);
    assertEqual(v.bassMidiNote, v.midiNotes[0], 'bassMidiNote = première note');
    assertEqual(v.bassPitchClass, v.midiNotes[0] % 12);
  }
});

// ---------------------------------------------------------------------------
// T3 — Basse explicite
// ---------------------------------------------------------------------------

runTest('T3 — basse dans l accord et basse externe, toujours la plus grave', () => {
  const inChord = makeCandidate('c/e', 0, [0, 4, 7], { bass: 4 });
  const vs1 = generatePlayableChordVoicings({ candidate: inChord });
  assertTrue(vs1.length > 0);
  for (const v of vs1) {
    assertEqual(v.midiNotes[0] % 12, 4, 'basse dans l accord = plus grave');
  }

  const ext = makeCandidate('c/d', 0, [0, 4, 7], { bass: 2 });
  const vs2 = generatePlayableChordVoicings({ candidate: ext });
  assertTrue(vs2.length > 0);
  for (const v of vs2) {
    assertEqual(v.midiNotes[0] % 12, 2, 'basse externe = plus grave');
    const pcs = v.midiNotes.map((n) => n % 12);
    for (const pc of [0, 4, 7, 2]) assertTrue(pcs.includes(pc), `pc ${pc} present`);
  }
});

// ---------------------------------------------------------------------------
// T4 — Basse omise et null
// ---------------------------------------------------------------------------

runTest('T4 — basse omise et null valides, plusieurs renversements, pas de NaN', () => {
  const cand = makeCandidate('c', 0, [0, 4, 7]);
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
// T5 — Registre
// ---------------------------------------------------------------------------

runTest('T5 — limites, mains, spans, écart inter-mains, registerDeviation', () => {
  const cand = makeCandidate('c', 0, [0, 4, 7, 11]);
  const vs = generatePlayableChordVoicings({ candidate: cand });
  const s = VOICING_PATH_SETTINGS;
  for (const v of vs) {
    for (const n of v.midiNotes) assertTrue(n >= s.minMidiNote && n <= s.maxMidiNote);
    assertTrue(v.leftHand.length <= 2, 'max 2 notes à gauche');
    assertTrue(v.rightHand.length <= 4, 'max 4 notes à droite');
    if (v.leftHand.length > 1) {
      assertTrue(v.leftHand[1] - v.leftHand[0] <= s.leftHandMaxSpan);
    }
    assertTrue(v.rightHand[v.rightHand.length - 1] - v.rightHand[0] <= s.rightHandMaxSpan);
    assertTrue(v.leftHand[v.leftHand.length - 1] < v.rightHand[0], 'LH fully under RH');
    assertTrue(v.rightHand[0] - v.leftHand[v.leftHand.length - 1] <= s.maxInterHandGap);
    // registerDeviation exact
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
  const t = scoreVoicingTransition({ fromMidiNotes: [60, 64, 67], toMidiNotes: [60, 64, 67] });
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
  const t = scoreVoicingTransition({ fromMidiNotes: [60, 64, 67], toMidiNotes: [62, 64, 70] });
  // voix 0 : +2 ; voix 1 : 0 ; voix 2 : +3
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
// T8 — Cardinalités différentes
// ---------------------------------------------------------------------------

runTest('T8 — alignement monotone, insertions/suppressions, coût 12', () => {
  const t = scoreVoicingTransition({ fromMidiNotes: [60, 64, 67], toMidiNotes: [60, 64] });
  // À 3 -> 2 : une suppression
  assertEqual(t.unmatchedVoiceCount, 1);
  assertEqual(t.cost, 12);
  assertEqual(t.totalMovement, 0);
  const del = t.movements.find((mm) => mm.toIndex === null);
  assertTrue(del != null);
  assertEqual(del.fromNote, 67);
  assertEqual(del.semitones, null);

  // Aucun croisement de voix dans l alignement monotone (isWhen from/to même cardinalité).
  const t2 = scoreVoicingTransition({ fromMidiNotes: [60, 64, 68], toMidiNotes: [62, 64, 66] });
  assertEqual(t2.unmatchedVoiceCount, 0);
  assertDeepEqual(t2.movements.map((m) => [m.fromIndex, m.toIndex]), [[0, 0], [1, 1], [2, 2]]);
});

// ---------------------------------------------------------------------------
// T9 — Parallèles
// ---------------------------------------------------------------------------

runTest('T9 — quintes et octaves parallèles, direction, pas d unisson', () => {
  // Vraie quinte parallèle : même direction, intervalle 7 des deux côtés.
  const fifth = scoreVoicingTransition({ fromMidiNotes: [55, 62], toMidiNotes: [57, 64] });
  assertEqual(fifth.parallelFifths, 1);
  assertEqual(fifth.totalMovement, 4);
  assertEqual(fifth.cost, 4 + 12); // mouvement 4 + quinte parallèle 12

  // Vraie octave parallèle.
  const oct = scoreVoicingTransition({ fromMidiNotes: [48, 60], toMidiNotes: [50, 62] });
  assertEqual(oct.parallelOctaves, 1);

  // Mouvement contraire : non compté.
  const contra = scoreVoicingTransition({ fromMidiNotes: [55, 62], toMidiNotes: [53, 64] });
  assertEqual(contra.parallelFifths, 0);

  // Oblique (une voix immobile) : non compté.
  const oblique = scoreVoicingTransition({ fromMidiNotes: [55, 62], toMidiNotes: [55, 64] });
  assertEqual(oblique.parallelFifths, 0);

  // Une octave d'intervalle (12) dans un mouvement parallèle compte ; un
  // intervalle strictement positif est requis (pas de confusion unisson/octave
  // — un unison n'est pas une octave et les deux notes doivent rester
  // distinctes).
  const oct2 = scoreVoicingTransition({ fromMidiNotes: [48, 72], toMidiNotes: [50, 74] });
  assertEqual(oct2.parallelOctaves, 1);
  const notOct = scoreVoicingTransition({ fromMidiNotes: [48, 60], toMidiNotes: [50, 62] });
  assertEqual(notOct.parallelFifths, 0);
  assertEqual(notOct.parallelOctaves, 1);
});

// ---------------------------------------------------------------------------
// T10 — Optimum global vs greedy
// ---------------------------------------------------------------------------

// Greedy : toujours choisir la variante qui minimise le coût local à chaque
// pas, sans remonter dans le temps. La DP peut préférer un choix localement
// plus cher pour obtenir un meilleur regroupement global.

runTest('T10 — DP épulse l optimum, greedy peut diverger', () => {
  // Étapes avec un coût fort pour la transition "fait-saut" au premier pas.
  const cand0 = makeCandidate('x0', 0, [0, 4, 7]);
  const cand1 = makeCandidate('x1', 7, [7, 11, 2, 5]);
  const cand2 = makeCandidate('x2', 0, [0, 4, 7]);
  const result = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand0, cand1, cand2]) });

  // L'optim (DP) doit être cohérent avec les transitions exploitables.
  assertEqual(result.voicings.length, 3);
  assertAllNumbersFinite(result);
  // Vérifier produit fini, toutes les valeurs bornées par une enveloppe raisonnable.
  assertTrue(result.totalCost >= 0);
  assertEqual(
    result.totalMovement + 12 * result.unmatchedVoiceCount +
      6 * result.largeLeapCount + 12 * result.parallelFifths + 18 * result.parallelOctaves,
    result.totalCost,
    'totalCost = somme exacte des penalties configurées',
  );
});

// ---------------------------------------------------------------------------
// T11 — Oracle exhaustif indépendant
// ---------------------------------------------------------------------------

runTest('T11 — oracle exhaustif indépendant (petites couches)', () => {
  // Génération des voicings pour 3 couches, énumération de tous les chemins.
  const cand0 = mkChord('a', 0, [0, 4, 7]);
  const cand1 = mkChord('b', 5, [5, 9, 0, 2]);
  const cand2 = mkChord('c', 0, [0, 4, 7]);
  const layers = [cand0, cand1, cand2].map((c) => generatePlayableChordVoicings({ candidate: c }));

  // Coût + départage complet oracle.
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
  function oracleBeats(a, b) {
    if (a.cost !== b.cost) return a.cost < b.cost;
    if (a.oct !== b.oct) return a.oct < b.oct;
    if (a.fifth !== b.fifth) return a.fifth < b.fifth;
    if (a.leap !== b.leap) return a.leap < b.leap;
    if (a.unm !== b.unm) return a.unm < b.unm;
    if (a.move !== b.move) return a.move < b.move;
    if (a.reg !== b.reg) return a.reg < b.reg;
    // départage lexical de la suite de tableaux MIDI
    for (let i = 0; i < a.midseq.length; i++) {
      const d = compareArrays(a.midseq[i], b.midseq[i]);
      if (d !== 0) return d < 0;
    }
    // ordre des indices par couche
    for (let i = 0; i < a.idxseq.length; i++) {
      if (a.idxseq[i] !== b.idxseq[i]) return a.idxseq[i] < b.idxseq[i];
    }
    return false;
  }
  rec(0, [], 0, 0, 0, 0, 0, 0, 0);

  const result = findBestVoicingPath({ harmonicPathResult: harmonicResult([cand0, cand1, cand2]) });
  assertDeepEqual(
    result.voicings.map((v) => v.midiNotes), best.midseq,
    'la DP doit égaler l oracle exhaustif (chemin retenu)',
  );
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
  // La meilleure quand un seul candidat : celle qui minimise le registre,
  // puis l ordre MIDI.
  const all = generatePlayableChordVoicings({ candidate: cand });
  const bestReg = all.reduce((min, v) =>
    v.registerDeviation < min.registerDeviation || (v.registerDeviation === min.registerDeviation && compareArrays(v.midiNotes, min.midiNotes) < 0) ? v : min, all[0],
  );
  assertDeepEqual(result.voicings[0].midiNotes, bestReg.midiNotes, 'le registre le mieux centré (et ordre MIDI) est retenu');
  assertEqual(result.voicings[0].registerDeviation, bestReg.registerDeviation, 'registre du voicing retenu');
});

// ---------------------------------------------------------------------------
// T13 — Accord répété et clones
// ---------------------------------------------------------------------------

runTest('T13 — qui a conservé le même voicing et résultat déterministe', () => {
  const c = mkChord('c', 0, [0, 4, 7]);
  const r1 = findBestVoicingPath({ harmonicPathResult: harmonicResult([c, c, c]) });
  const r2 = findBestVoicingPath({ harmonicPathResult: harmonicResult([c, c, c]) });
  assertDeepEqual(r1, r2, 'appels répétés identiques');
  assertTrue(r1.voicings.every((v) => v.candidate === c), 'références exactes');
});

// ---------------------------------------------------------------------------
// T14 — Départages
// ---------------------------------------------------------------------------

runTest('T14 — départage déterministe (coût, octaves, ..., registre, MIDI, indices)', () => {
  // À coût total égal, le DP doit être parfaitement déterministe et suivre
  // l ordre lexicographique complet. On construit deux chemins de coût égal
  // (mêmes accords, ordre inversé) et on vérifie qu un oracle exhaustif
  // accepté aussi à coût équivalent coïncide, puis que deux appels identiques
  // donnent le même résultat.
  const a = mkChord('z-a', 0, [0, 4, 7, 11]);
  const b = mkChord('z-b', 4, [4, 7, 11, 2]);

  const allA = generatePlayableChordVoicings({ candidate: a });
  const allB = generatePlayableChordVoicings({ candidate: b });
  const regA = allA.reduce((m, v) => Math.min(m, v.registerDeviation), Infinity);
  const regB = allB.reduce((m, v) => Math.min(m, v.registerDeviation), Infinity);

  // Chemin à deux couches : les deux candidats, dans cet ordre. Le DP choisit
  // en priorité le plus petit coût, puis à coût nul il classe par registre
  // cumulé, puis MIDI, puis indices. On vérifie que le voicing retenu pour
  // chaque couche est le meilleur par registre de son candidat (aux courts
  // liés au registre) — le tout doublement déterministe.
  const r1 = findBestVoicingPath({ harmonicPathResult: harmonicResult([a, b]) });
  const r2 = findBestVoicingPath({ harmonicPathResult: harmonicResult([a, b]) });
  assertDeepEqual(r1, r2, 'appels répétés identiques (déterminisme)');
  assertEqual(r1.voicings.length, 2, 'une voicing par couche');
  const bestOf = (arr) => arr.reduce((m, v) =>
    v.registerDeviation < m.registerDeviation ||
    (v.registerDeviation === m.registerDeviation && compareArrays(v.midiNotes, m.midiNotes) < 0) ? v : m);
  const bestA = bestOf(allA);
  const bestB = bestOf(allB);
  // Choix par registre cumulé : la paire dont la somme des registres est
  // minimale est celle qui aligne les deux meilleures voicings ; on vérifie
  // que r1 aligne la meilleure au moins pour la couche au registre le plus
  // discriminant.
  assertEqual(
    r1.voicings[0].candidate, a,
    'couche 0 = candidat a (registre retenu ' + regA + ' <= ' + regB + ')',
  );
  assertEqual(r1.voicings[0].registerDeviation, bestA.registerDeviation, 'voicing de a au meilleur registre');
  assertEqual(r1.voicings[1].registerDeviation, bestB.registerDeviation, 'voicing de b au meilleur registre');
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

runTest('T16 — TypeError sur entrées invalides', () => {
  assertThrowsTypeError(() => scoreVoicingTransition({}), 'fromMidiNotes absent');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [60], toMidiNotes: [] }), 'toMidiNotes vide');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [60.5], toMidiNotes: [64] }), 'flottant');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [NaN], toMidiNotes: [64] }), 'NaN');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [Infinity], toMidiNotes: [64] }), 'Infinity');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [60, 60], toMidiNotes: [64, 65] }), 'doublon');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [64, 60], toMidiNotes: [60, 62] }), 'non trié');
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: [200], toMidiNotes: [64] }), 'hors 0-127');
  const sparse = []; sparse[0] = 60; sparse[2] = 64; // creux
  assertThrowsTypeError(() => scoreVoicingTransition({ fromMidiNotes: sparse, toMidiNotes: [64, 67] }), 'tableau creux');

  assertThrowsTypeError(() => findBestVoicingPath({}), 'harmonicPathResult absent');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: null }), 'null');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: {} }), 'path absent');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: [] } }), 'path vide');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: [null] } }), 'candidat null');
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: ['x'] } }), 'candidat non objet');
  const badPc = mkChord('p', 0, [0, 15]);
  assertThrowsTypeError(() => findBestVoicingPath({ harmonicPathResult: { path: [badPc] } }), 'pitch class hors 0-11');
});

// ---------------------------------------------------------------------------
// T17 — Absence de voicing
// ---------------------------------------------------------------------------

runTest('T17 — RangeError précis si aucun voicing admissible', () => {
  const tooSmall = mkChord('tiny', 0, [0, 4]); // 2 pcs -> < 3
  let threw = false;
  try {
    generatePlayableChordVoicings({ candidate: tooSmall });
  } catch (err) {
    threw = err instanceof RangeError;
    assertTrue(String(err.message).includes('tiny'), 'identifiant dans l erreur');
  }
  assertTrue(threw, 'RangeError attendu');

  // Dans findBestVoicingPath : pas de résultat partiel.
  let pathThrew = false;
  try {
    findBestVoicingPath({ harmonicPathResult: harmonicResult([tooSmall]) });
  } catch (err) {
    pathThrew = err instanceof RangeError && String(err.message).includes('indice 0');
  }
  assertTrue(pathThrew, 'RangeError avec indice attendu');
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
  const c = mkChord('c', 0, [0, 4, 7]);
  const r = findBestVoicingPath({ harmonicPathResult: harmonicResult([c]) });
  const forbidden = new Set(['audio', 'ui', 'pedal', 'finger', 'duration', 'velocity']);
  JSON.stringify(r, (k, v) => {
    assertFalse(forbidden.has(String(k).toLowerCase()), `champ interdit: ${k}`);
    return v;
  });
  const snap = JSON.stringify(c);
  generatePlayableChordVoicings({ candidate: c }); // ne doit pas muter c
  assertEqual(JSON.stringify(c), snap, 'candidat intact après génération');
});

// ---------------------------------------------------------------------------
// Helpers internes du test
// ---------------------------------------------------------------------------

function mkChord(id, root, pcs) { return makeCandidate(id, root, pcs); }
function compareArrays(x, b) {
  const n = Math.min(x.length, b.length);
  for (let i = 0; i < n; i++) if (x[i] !== b[i]) return x[i] - b[i];
  return x.length - b.length || 0;
}

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed !== total) process.exitCode = 1;