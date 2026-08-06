// [OpenCode] — 2026-08-06 — Tests de l'Incrément 6 : sélection du meilleur chemin harmonique global.
// Exécutable avec : node src/melody/test-harmonic-path-finder.js

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createHarmonicContext, addHarmonicAnchor, setStartChord } from './harmonic-context.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import { scoreChordTransition } from './transition-score.js';
import * as pathfinderModule from './harmonic-path-finder.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';

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

// Les divisions internes étant non arrondies, on tolère l'epsilon flottant.
function assertScoreInRange(value, msg = 'score') {
  assertAllNumbersFinite(value, msg);
  if (value < -1e-9 || value > 100 + 1e-9) {
    throw new Error(`${msg} hors bornes [0,100] : ${value}`);
  }
}

// ---------------------------------------------------------------------------
// Constantes du score canonique (miroir du module, pour l'oracle)
// ---------------------------------------------------------------------------

const W_COMPATIBILITY = 0.60;
const W_TRANSITION = 0.40;

const CATEGORY_SCORES = {
  'chord-tone': 100,
  'available-tension': 90,
  'suspension': 60,
  'non-chord-tone-allowed': 30,
  incompatible: 0,
};

// ---------------------------------------------------------------------------
// Helpers de construction de candidats
// ---------------------------------------------------------------------------

function makeCandidate(id, rootPc, pcs, opts = {}) {
  const degree = opts.degree !== undefined ? opts.degree : null;
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
      degree,
      romanNumeral: degree == null ? null : String(degree),
      diatonic: true,
      borrowed: false,
      secondaryDominantTarget: null,
      approachType: 'none',
    },
  };
  if (bassPc !== null) candidate.bassPitchClass = bassPc;
  return candidate;
}

function makeCandidateNoBass(id, rootPc, pcs, opts = {}) {
  return makeCandidate(id, rootPc, pcs, opts);
}

function cloneCandidate(candidate) {
  return JSON.parse(JSON.stringify(candidate));
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
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-path' });
}

function harmonicContextInKey(track, keyString) {
  return createHarmonicContext(track, { tonalContext: setManualTonalContext(createTonalContext(), keyString) });
}

function candidatesByAnchor(ctx, track, index) {
  const anchor = ctx.anchors[index];
  return generateChordCandidatesForAnchor({ anchor, track, harmonicContext: ctx }).candidates;
}

function weightedSumOf(path, transitions) {
  const compatSum = path.reduce((s, c) => s + CATEGORY_SCORES[c.melodyCompatibility.category], 0);
  const transSum = transitions.reduce((s, tr) => s + tr.totalScore, 0);
  return W_COMPATIBILITY * compatSum + W_TRANSITION * transSum;
}

function compareStringSeq(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function compareNumSeq(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// Oracle exhaustif : énumère tous les chemins, applique le départage complet.
function exhaustiveBest(candidateLayers) {
  let best = null;
  function rec(t, compatSum, transSum, ids, idxs) {
    if (t === candidateLayers.length) {
      const ws = W_COMPATIBILITY * compatSum + W_TRANSITION * transSum;
      const cand = { ws, compatSum, transSum, ids, idxs };
      if (best === null || beats(cand, best)) best = cand;
      return;
    }
    const layer = candidateLayers[t];
    for (let j = 0; j < layer.length; j++) {
      const c = layer[j];
      let newTrans = transSum;
      if (t > 0) {
        const from = candidateLayers[t - 1][idxs[t - 1]];
        newTrans += scoreChordTransition({ from, to: c }).totalScore;
      }
      rec(t + 1, compatSum + CATEGORY_SCORES[c.melodyCompatibility.category], newTrans,
        ids.concat([c.id]), idxs.concat([j]));
    }
  }
  function beats(a, b) {
    if (a.ws !== b.ws) return a.ws > b.ws;
    if (a.compatSum !== b.compatSum) return a.compatSum > b.compatSum;
    if (a.transSum !== b.transSum) return a.transSum > b.transSum;
    const ic = compareStringSeq(a.ids, b.ids);
    if (ic !== 0) return ic < 0;
    return compareNumSeq(a.idxs, b.idxs) < 0;
  }
  rec(0, 0, 0, [], []);
  return best;
}

// ---------------------------------------------------------------------------
// T1 — API et contrat de sortie
// ---------------------------------------------------------------------------

runTest('T01 — export présent et champs exacts', () => {
  assertEqual(typeof findBestHarmonicPath, 'function');
  const layers = [[makeCandidate('c-a', 0, [0, 4, 7])], [makeCandidate('g-b', 7, [7, 11, 2, 5])]];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  assertDeepEqual(
    Object.keys(r).sort(),
    ['compatibilityScore', 'path', 'totalScore', 'transitionScore', 'transitions', 'weights'],
  );
});

runTest('T02 — longueurs, références et bornes', () => {
  const l0 = [makeCandidate('a0', 0, [0, 4, 7]), makeCandidate('a1', 2, [2, 6, 9])];
  const l1 = [makeCandidate('b0', 7, [7, 11, 2, 5]), makeCandidate('b1', 5, [5, 9, 0])];
  const r = findBestHarmonicPath({ candidateLayers: [l0, l1] });
  assertEqual(r.path.length, 2);
  assertEqual(r.transitions.length, 1);
  assertTrue(r.path[0] === l0[0] || r.path[0] === l0[1], 'path[0] référence de la couche 0');
  assertTrue(r.path[1] === l1[0] || r.path[1] === l1[1], 'path[1] référence de la couche 1');
  assertAllNumbersFinite(r);
  assertScoreInRange(r.compatibilityScore, 'compatibilityScore');
  assertScoreInRange(r.transitionScore, 'transitionScore');
  assertScoreInRange(r.totalScore, 'totalScore');
});

runTest('T03 — cohérence from/to des transitions', () => {
  const layers = [
    [makeCandidate('a0', 0, [0, 4, 7])],
    [makeCandidate('b0', 7, [7, 11, 2, 5])],
    [makeCandidate('c0', 9, [9, 0, 4])],
  ];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  assertEqual(r.transitions.length, 2);
  assertEqual(r.transitions[0].fromId, r.path[0].id);
  assertEqual(r.transitions[0].toId, r.path[1].id);
  assertEqual(r.transitions[1].fromId, r.path[1].id);
  assertEqual(r.transitions[1].toId, r.path[2].id);
});

// ===========================================================================
// T2 — Une seule couche
// ===========================================================================

runTest('T2 — une couche : meilleure compatibilité, transitions vides', () => {
  const layer = [
    makeCandidate('nct', 0, [0, 4, 7], { category: 'non-chord-tone-allowed' }),
    makeCandidate('ct', 0, [0, 4, 7], { category: 'chord-tone' }),
  ];
  const r = findBestHarmonicPath({ candidateLayers: [layer] });
  assertEqual(r.path.length, 1);
  assertEqual(r.path[0].id, 'ct');
  assertEqual(r.transitions.length, 0);
  assertEqual(r.transitionScore, null);
  assertEqual(r.totalScore, r.compatibilityScore);
  assertEqual(r.compatibilityScore, 100);
});

runTest('T2b — une couche : tie-break déterministe sur égalité', () => {
  const a = makeCandidate('z-c', 0, [0, 4, 7], { category: 'chord-tone' });
  const b = makeCandidate('a-c', 0, [9, 0, 4], { category: 'chord-tone' });
  const r = findBestHarmonicPath({ candidateLayers: [[a, b]] });
  assertEqual(r.path[0], b, 'identifiant lexicalement plus petit');
  assertEqual(r.totalScore, 100);
});

// ===========================================================================
// T3 — Deux couches
// ===========================================================================

runTest('T3 — le couple optimal est sélectionné avec la formule exacte', () => {
  const l0 = [makeCandidate('a0', 0, [0, 4, 7], { category: 'suspension' }), makeCandidate('a1', 7, [7, 11, 2, 5], { category: 'chord-tone' })];
  const l1 = [makeCandidate('b0', 7, [7, 11, 2, 5]), makeCandidate('b1', 0, [0, 4, 7], { category: 'available-tension' })];
  const r = findBestHarmonicPath({ candidateLayers: [l0, l1] });
  // Calcul manuel des quatre couples avec la formule exacte.
  let bestWs = null;
  for (const a of l0) {
    for (const b of l1) {
      const ws = weightedSumOf([a, b], [scoreChordTransition({ from: a, to: b })]);
      if (bestWs === null || ws > bestWs) bestWs = ws;
    }
  }
  const chosenWs = weightedSumOf(r.path, r.transitions);
  assertEqual(chosenWs, bestWs, 'le couple retenu atteint le maximum manuel');
  const norm = W_COMPATIBILITY * 2 + W_TRANSITION * 1;
  assertEqual(r.totalScore, chosenWs / norm, 'totalScore = weightedSum / normalizationWeight');
});

// ===========================================================================
// T4 — Optimum global contre choix glouton
// ===========================================================================

runTest('T4 — l optimum global bat le greedy couche par couche', () => {
  // Tous les candidats partagent la même compatibilité (chord-tone = 100) :
  // le greedy par couche se contente du premier choix local. L'optimum global
  // privilégie la chaîne de transitions idéales A2→B2→C2 (accords identiques).
  const A1 = makeCandidate('A1', 0, [0, 4, 7, 11], { category: 'chord-tone' });
  const B1 = makeCandidate('B1', 6, [6, 10, 1, 5], { category: 'chord-tone' });
  const C1 = makeCandidate('C1', 11, [11, 6, 10, 3], { category: 'chord-tone' });
  const A2 = makeCandidate('A2', 0, [0, 4, 7], { category: 'chord-tone' });
  const B2 = makeCandidate('B2', 0, [0, 4, 7], { category: 'chord-tone' });
  const C2 = makeCandidate('C2', 0, [0, 4, 7], { category: 'chord-tone' });
  const layers = [[A1, A2], [B1, B2], [C1, C2]];

  const greedyPath = [A1, B1, C1];
  const r = findBestHarmonicPath({ candidateLayers: layers });

  assertDeepEqual(r.path.map((c) => c.id), ['A2', 'B2', 'C2'], 'optimum global différent du greedy');
  const greedyTrans = [
    scoreChordTransition({ from: A1, to: B1 }),
    scoreChordTransition({ from: B1, to: C1 }),
  ];
  assertTrue(weightedSumOf(r.path, r.transitions) > weightedSumOf(greedyPath, greedyTrans),
    'le chemin global dépasse le greedy');
  const greedyTotal = weightedSumOf(greedyPath, greedyTrans) / (W_COMPATIBILITY * 3 + W_TRANSITION * 2);
  assertTrue(r.totalScore > greedyTotal, 'totalScore optimal > totalScore greedy');
});

// ===========================================================================
// T5 — Oracle exhaustif
// ===========================================================================

runTest('T5a — oracle exhaustif (3 couches 2×2×2)', () => {
  const layers = [
    [makeCandidate('a0', 0, [0, 4, 7]), makeCandidate('a1', 7, [7, 11, 2, 5], { category: 'available-tension' })],
    [makeCandidate('b0', 7, [7, 2, 4]), makeCandidate('b1', 0, [0, 4, 7])],
    [makeCandidate('c0', 5, [5, 9, 0]), makeCandidate('c1', 0, [0, 4, 8])],
  ];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  const oracle = exhaustiveBest(layers);
  assertDeepEqual(r.path.map((c) => c.id), oracle.ids);
  assertEqual(weightedSumOf(r.path, r.transitions), oracle.ws);
});

runTest('T5b — oracle exhaustif (4 couches 3×2×4×2)', () => {
  const layers = [
    [makeCandidate('a0', 0, [0, 4, 7]), makeCandidate('a1', 2, [2, 6, 9]), makeCandidate('a2', 9, [9, 0, 4])],
    [makeCandidate('b0', 7, [7, 11, 2]), makeCandidate('b1', 5, [5, 9, 0])],
    [makeCandidate('c0', 0, [0, 3, 7]), makeCandidate('c1', 4, [4, 7, 10]), makeCandidate('c2', 6, [6, 10, 1]), makeCandidate('c3', 8, [8, 0, 3])],
    [makeCandidate('d0', 11, [11, 2, 6]), makeCandidate('d1', 3, [3, 7, 10])],
  ];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  const oracle = exhaustiveBest(layers);
  assertEqual(r.path.length, 4);
  assertDeepEqual(r.path.map((c) => c.id), oracle.ids);
  assertEqual(weightedSumOf(r.path, r.transitions), oracle.ws);
});

// ===========================================================================
// T6 — Formules exactes
// ===========================================================================

runTest('T6 — formula exactes vérifiées séparément', () => {
  const layers = [
    [makeCandidate('a', 0, [0, 4, 7]), makeCandidate('d', 2, [2, 6, 9], { category: 'available-tension' })],
    [makeCandidate('b', 7, [7, 11, 2, 5]), makeCandidate('e', 5, [5, 9, 0], { category: 'suspension' })],
    [makeCandidate('c', 0, [0, 4, 7, 11]), makeCandidate('f', 9, [9, 0, 4], { category: 'non-chord-tone-allowed' })],
  ];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  const compatSum = r.path.reduce((s, c) => s + CATEGORY_SCORES[c.melodyCompatibility.category], 0);
  const transSum = r.transitions.reduce((s, tr) => s + tr.totalScore, 0);
  assertEqual(r.compatibilityScore, compatSum / r.path.length);
  assertEqual(r.transitionScore, transSum / r.transitions.length);
  const norm = W_COMPATIBILITY * r.path.length + W_TRANSITION * (r.path.length - 1);
  const wsum = W_COMPATIBILITY * compatSum + W_TRANSITION * transSum;
  assertEqual(r.totalScore, wsum / norm);
  assertEqual(r.weights.compatibility, 0.60);
  assertEqual(r.weights.transition, 0.40);
});

// ===========================================================================
// T7 — Départages
// ===========================================================================

runTest('T7a — départage par compatibilité sur égalité pondérée', () => {
  // Égalité exacte de weightedSum entre deux chemins A→X et B→Y distincts,
  // avec des sommes de compatibilité différentes. On précalcule une matrice de
  // transitions sur un petit répertoire, puis on cherche de façon déterministe
  // (aucun hasard) le premier triplet de couches satisfaisant l'égalité.
  const pool = [
    { id: 'C', root: 0, pcs: [0, 4, 7] },
    { id: 'Cmaj7', root: 0, pcs: [0, 4, 7, 11] },
    { id: 'G7', root: 7, pcs: [7, 11, 2, 5] },
    { id: 'Am7', root: 9, pcs: [9, 0, 3, 7] },
    { id: 'Dm7', root: 2, pcs: [2, 5, 9, 0] },
    { id: 'Em7', root: 4, pcs: [4, 7, 11, 2] },
  ];
  const pairT = pool.map((p) => pool.map((q) =>
    scoreChordTransition({ from: makeCandidate('p', p.root, p.pcs), to: makeCandidate('q', q.root, q.pcs) }).totalScore));
  const cats = ['chord-tone', 'available-tension', 'suspension', 'non-chord-tone-allowed'];
  function sc(cat) { return CATEGORY_SCORES[cat]; }
  function ws(ca, cx, w) { return W_COMPATIBILITY * (sc(ca) + sc(cx)) + W_TRANSITION * w; }
  let found = null;
  outer:
  for (let i = 0; i < pool.length; i++) {
    for (let j = 0; j < pool.length; j++) {
      for (let k = 0; k < pool.length; k++) {
        for (let l = 0; l < pool.length; l++) {
          for (const catA of cats) {
            for (const catB of cats) {
              for (const catX of cats) {
                for (const catY of cats) {
                  const wsAX = ws(catA, catX, pairT[i][k]);
                  const wsBY = ws(catB, catY, pairT[j][l]);
                  if (wsAX !== wsBY) continue;
                  const cAX = sc(catA) + sc(catX);
                  const cBY = sc(catB) + sc(catY);
                  if (cAX === cBY) continue;
                  const wsAY = ws(catA, catY, pairT[i][l]);
                  const wsBX = ws(catB, catX, pairT[j][k]);
                  if (wsAX > wsAY && wsAX > wsBX) {
                    found = {
                      layers: [
                        [makeCandidate('TIE-A', pool[i].root, pool[i].pcs, { category: catA }), makeCandidate('TIE-B', pool[j].root, pool[j].pcs, { category: catB })],
                        [makeCandidate('TIE-X', pool[k].root, pool[k].pcs, { category: catX }), makeCandidate('TIE-Y', pool[l].root, pool[l].pcs, { category: catY })],
                      ],
                      cAX,
                      cBY,
                    };
                    break outer;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  assertTrue(found !== null, 'cas de départage par compatibilité non trouvé');
  const r = findBestHarmonicPath({ candidateLayers: found.layers });
  const chosenCompat = r.path.reduce((s, c) => s + CATEGORY_SCORES[c.melodyCompatibility.category], 0);
  assertEqual(chosenCompat, Math.max(found.cAX, found.cBY), 'le départage privilégie la compatibilité');
});

runTest('T7b — départage par identifiant lexical', () => {
  const x = makeCandidate('x-b', 0, [0, 4, 7], { category: 'chord-tone', bass: 0 });
  const y = makeCandidate('x-a', 0, [0, 4, 7], { category: 'chord-tone', bass: 0 });
  const r = findBestHarmonicPath({ candidateLayers: [[x, y]] });
  assertEqual(r.path[0].id, 'x-a');
});

runTest('T7c — clones à identifiant identique départagés par indice', () => {
  const same = [makeCandidate('dup', 0, [0, 4, 7]), makeCandidate('dup', 0, [0, 4, 7])];
  const r = findBestHarmonicPath({ candidateLayers: [same] });
  assertEqual(r.path[0], same[0], 'indice le plus petit retenu');
});

runTest('T7d — appels répétés strictement déterministes', () => {
  const layers = [
    [makeCandidate('A', 0, [0, 4, 7]), makeCandidate('A2', 2, [2, 6, 9])],
    [makeCandidate('B', 7, [7, 11, 2, 5]), makeCandidate('B2', 0, [0, 4, 7, 11])],
    [makeCandidate('C', 5, [5, 9, 0]), makeCandidate('C2', 9, [9, 0, 4])],
  ];
  const r1 = findBestHarmonicPath({ candidateLayers: layers });
  const r2 = findBestHarmonicPath({ candidateLayers: layers });
  assertDeepEqual(r1.path.map((c) => c.id), r2.path.map((c) => c.id));
  assertDeepEqual(r1.transitions.map((t) => t.fromId), r2.transitions.map((t) => t.fromId));
  assertEqual(r1.totalScore, r2.totalScore);
  assertTrue(r1.path.every((c, i) => r2.path[i] === c), 'mêmes références');
});

// ===========================================================================
// T8 — Directionnalité V→I
// ===========================================================================

runTest('T8 — le bonus V→I influence le chemin, pas l ordre inverse', () => {
  const G7 = makeCandidate('G7', 7, [7, 11, 2, 5], { degree: 4, bass: 7 });
  const CM = makeCandidate('CM', 0, [0, 4, 7, 11], { degree: 0, bass: 0 });
  const F = makeCandidate('F', 5, [5, 9, 0, 3], { category: 'available-tension' });
  const AM = makeCandidate('AM', 9, [9, 0, 3, 7], { category: 'available-tension' });

  // Sens direct : G7 (V) puis C (I). Les deux chemins de compatibilité 200
  // (G7→CM et CM→G7 via couches inversées) ne diffèrent que par le bonus.
  const forward = findBestHarmonicPath({ candidateLayers: [[G7, F], [CM, AM]] });
  assertDeepEqual(forward.path.map((c) => c.id), ['G7', 'CM'], 'V→I retenu');
  assertEqual(forward.transitions[0].resolutionScore, 100);

  const reverse = findBestHarmonicPath({ candidateLayers: [[CM, AM], [G7, F]] });
  assertDeepEqual(reverse.path.map((c) => c.id), ['CM', 'G7'], 'I→V de l autre côté');
  assertEqual(reverse.transitions[0].resolutionScore, null, 'pas de bonus inversé');

  const wForward = weightedSumOf(forward.path, forward.transitions);
  const wReverse = weightedSumOf(reverse.path, reverse.transitions);
  assertTrue(wForward > wReverse, 'le bonus V→I améliore réellement le chemin');
});

// ===========================================================================
// T9 — Accord identique
// ===========================================================================

runTest('T9 — même candidat référencé ou cloné entre couches', () => {
  const c = makeCandidate('idem', 0, [0, 4, 7, 11]);
  const layers = [[c], [c], [cloneCandidate(c)]];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  assertAllNumbersFinite(r);
  assertScoreInRange(r.totalScore, 'totalScore');
  const r2 = findBestHarmonicPath({ candidateLayers: layers });
  assertDeepEqual(r.path.map((x) => x.id), r2.path.map((x) => x.id));
  assertTrue(r.path[0] === c && r.path[1] === c, 'référence identique conservée');
});

// ===========================================================================
// T10 — Basses absentes
// ===========================================================================

runTest('T10 — basses absentes sans NaN', () => {
  const layers = [
    [makeCandidateNoBass('nb-a', 0, [0, 4, 7]), makeCandidate('wb-a', 0, [0, 4, 7, 11], { bass: 7 })],
    [makeCandidateNoBass('nb-b', 7, [7, 11, 2, 5]), makeCandidate('wb-b', 5, [5, 9, 0], { bass: 9 })],
    [makeCandidate('wb-c', 9, [9, 0, 4], { bass: 0 }), makeCandidateNoBass('nb-c', 0, [0, 3, 7])],
  ];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  assertAllNumbersFinite(r);
  assertEqual(r.path.length, 3);
});

// ===========================================================================
// T11 — Cardinalités différentes
// ===========================================================================

runTest('T11 — couches 4, 2, 5, 3 avec pitch classes variées', () => {
  const layers = [
    [makeCandidate('a0', 0, [0, 4, 7]), makeCandidate('a1', 2, [2, 6, 9]), makeCandidate('a2', 4, [4, 7, 11]), makeCandidate('a3', 9, [9, 0, 4])],
    [makeCandidate('b0', 7, [7, 11, 2, 5]), makeCandidate('b1', 5, [5, 9, 0, 3])],
    [makeCandidate('c0', 0, [0, 3, 7, 10]), makeCandidate('c1', 2, [2, 5, 9, 0]), makeCandidate('c2', 6, [6, 1, 5, 8]), makeCandidate('c3', 8, [8, 0, 3, 6]), makeCandidate('c4', 10, [10, 1, 5, 8])],
    [makeCandidate('d0', 11, [11, 2, 5]), makeCandidate('d1', 3, [3, 7, 10]), makeCandidate('d2', 8, [6, 10, 1, 4])],
  ];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  assertEqual(r.path.length, 4);
  assertAllNumbersFinite(r);
  assertTrue(r.totalScore >= 0 && r.totalScore <= 100);
});

// ===========================================================================
// T12 — Verrouillage réel Inc4
// ===========================================================================

runTest('T12 — candidat verrouillé retenu (contrat réel Inc4)', () => {
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
  assertEqual(l0.length, 1, 'la couche verrouillée ne contient que le candidat verrouillé');
  assertTrue(l0[0].locked === true, 'candidat marqué locked');
  assertTrue(l1.length > 1, 'la seconde couche reste libre');
  const r = findBestHarmonicPath({ candidateLayers: [l0, l1] });
  assertEqual(r.path[0], l0[0], 'le candidat verrouillé est choisi (couche à option unique)');
  assertAllNumbersFinite(r);
});

// ===========================================================================
// T13 — Immutabilité
// ===========================================================================

runTest('T13 — entrées non mutées, résultat et conteneurs figés', () => {
  const raw = [[makeCandidate('a', 0, [0, 4, 7])], [makeCandidate('b', 7, [7, 11, 2, 5])]];
  const snapshot = JSON.stringify(raw);
  const r = findBestHarmonicPath({ candidateLayers: raw });
  assertEqual(JSON.stringify(raw), snapshot, 'entrées modifiées');
  assertTrue(Object.isFrozen(r));
  assertTrue(Object.isFrozen(r.path));
  assertTrue(Object.isFrozen(r.transitions));
  assertTrue(Object.isFrozen(r.weights));
  assertFalse(Object.isFrozen(r.path[0]), 'candidats d entrée non figés');
  assertFalse(Object.isFrozen(raw[0]), 'couche d entrée non figée');
  let pushThrew = false;
  try { r.path.push(1); } catch (e) { pushThrew = true; }
  assertTrue(pushThrew || r.path.length === 2, 'path figé');
  assertEqual(r.path.length, 2);
});

// ===========================================================================
// T14 — Entrées invalides
// ===========================================================================

runTest('T14 — TypeError sur entrées invalides', () => {
  const valid = [makeCandidate('v', 0, [0, 4, 7])];
  assertThrowsTypeError(() => findBestHarmonicPath({}), 'candidateLayers absent');
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: null }), 'candidateLayers null');
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [] }), 'candidateLayers vide');
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [[]] }), 'couche vide');
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: ['x'] }), 'couche non tableau');
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [valid, null] }), 'couche null');
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [[null]] }), 'candidat null');
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [['bad']] }), 'candidat non objet');
  const emptyId = makeCandidate('', 0, [0, 4, 7]);
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [[emptyId]] }), 'identifiant vide');
  const noCompat = { ...makeCandidate('nc', 0, [0, 4, 7]) };
  delete noCompat.melodyCompatibility;
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [[noCompat]] }), 'melodyCompatibility absente');
  const badCat = {
    ...makeCandidate('bc', 0, [0, 4, 7]),
    melodyCompatibility: { ...makeCandidate('x', 0, [0, 4, 7]).melodyCompatibility, category: 'weird' },
  };
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [[badCat]] }), 'category inconnue');
  const nanRoot = { ...makeCandidate('nr', 0, [0, 4, 7]), rootPitchClass: NaN };
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [[nanRoot]] }), 'rootPitchClass NaN');
  const infPcs = { ...makeCandidate('pi', 0, [0, 4, 7]), pitchClasses: [0, Infinity] };
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [[infPcs]] }), 'pitchClasses Infinity');
  const badScore = {
    ...makeCandidate('bs', 0, [0, 4, 7]),
    melodyCompatibility: { ...makeCandidate('x', 0, [0, 4, 7]).melodyCompatibility, category: 'chord-tone' },
  };
  assertThrowsTypeError(() => findBestHarmonicPath({ candidateLayers: [[badScore, { ...badScore, melodyCompatibility: null }]] }), 'melodyCompatibility null');
});

// ===========================================================================
// T15 — Matrice suffisamment large
// ===========================================================================

runTest('T15 — matrice large : fini, borné, déterministe', () => {
  const sizes = [6, 8, 7, 9, 5];
  const roots = [0, 2, 4, 5, 7, 9, 11, 1, 3, 6];
  const cats = ['chord-tone', 'available-tension', 'suspension', 'non-chord-tone-allowed'];
  const layers = sizes.map((n, t) =>
    Array.from({ length: n }, (_, j) => {
      const root = roots[(t * 3 + j) % 10];
      return makeCandidate(`L${t}-${j}`, root,
        [root, (root + 4) % 12, (root + 7) % 12, (root + 11) % 12],
        { category: cats[(t + j) % 4] });
    }),
  );
  const t0 = process.hrtime.bigint();
  const r1 = findBestHarmonicPath({ candidateLayers: layers });
  const r2 = findBestHarmonicPath({ candidateLayers: layers });
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  assertDeepEqual(r1.path.map((c) => c.id), r2.path.map((c) => c.id));
  assertAllNumbersFinite(r1);
  assertScoreInRange(r1.totalScore, 'totalScore');
  assertTrue(elapsedMs < 5000, 'temps compatible programmation dynamique');
});

// ===========================================================================
// T16 — Vrais ChordCandidate
// ===========================================================================

runTest('T16 — de vrais candidats générés passent au path finder', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
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
    type: 'user',
    harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[2].id,
    relativeTime: track.events[2].startedAt,
    type: 'end',
    harmonizationPolicy: 'automatic',
  });
  const layers = [];
  for (let a = 0; a < ctx.anchors.length; a++) {
    const candidates = candidatesByAnchor(ctx, track, a);
    assertTrue(candidates.length > 0, `aucun candidat pour l ancre ${a}`);
    layers.push(candidates);
  }
  const r = findBestHarmonicPath({ candidateLayers: layers });
  assertEqual(r.path.length, layers.length);
  r.path.forEach((c, i) => {
    assertTrue(layers[i].includes(c), `path[${i}] appartient à la couche ${i}`);
  });
  assertAllNumbersFinite(r);
});

// ===========================================================================
// T17 — Frontières de l'incrément
// ===========================================================================

runTest('T17 — aucun champ voicing/octave/doigté/audio/UI/segment', () => {
  const layers = [[makeCandidate('a', 0, [0, 4, 7])], [makeCandidate('b', 7, [7, 11, 2, 5])]];
  const r = findBestHarmonicPath({ candidateLayers: layers });
  const forbidden = new Set(['voicing', 'octave', 'finger', 'audio', 'segment', 'generation', 'ui', 'random']);
  // Les nouveaux conteneurs du module sont : résultat, path, transitions,
  // weights et les TransitionScore. Les candidats (dont l'orthographe porte
  // légitimement un champ octave) restent des références d'entrée : on ne les
  // inspecte pas ici.
  const ownKeys = new Set();
  (function collect(o) {
    for (const k of Object.keys(o)) {
      ownKeys.add(k);
      if (o[k] !== null && typeof o[k] === 'object') collect(o[k]);
    }
  })({
    weights: r.weights,
    transitions: r.transitions,
    scalars: { compatibilityScore: r.compatibilityScore, transitionScore: r.transitionScore, totalScore: r.totalScore },
  });
  for (const key of ownKeys) {
    assertFalse(forbidden.has(key), `clé interdite présente : ${key}`);
  }
  // La sortie ne comporte que les six champs du contrat HarmonicPathResult.
  assertDeepEqual(
    Object.keys(r).sort(),
    ['compatibilityScore', 'path', 'totalScore', 'transitionScore', 'transitions', 'weights'],
  );
});

// ===========================================================================
// T18 — Non-régression
// ===========================================================================

runTest('T18 — sanity de l écosystème et export unique', () => {
  assertEqual(typeof scoreChordTransition, 'function');
  assertEqual(typeof generateChordCandidatesForAnchor, 'function');
  assertEqual(typeof findBestHarmonicPath, 'function');
  const funcs = Object.keys(pathfinderModule).filter((k) => typeof pathfinderModule[k] === 'function');
  assertDeepEqual(funcs, ['findBestHarmonicPath'], 'seule findBestHarmonicPath est exportée');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;