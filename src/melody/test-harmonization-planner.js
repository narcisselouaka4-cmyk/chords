// [OpenCode] — 2026-08-07 — Tests de l'Incrément 8 : assemblage déterministe du
// pipeline complet de harmonisation mélodique.
// Exécutable avec : node src/melody/test-harmonization-planner.js

import * as harmonizationPlannerModule from './harmonization-planner.js';
import { buildHarmonizationPlan } from './harmonization-planner.js';
import * as voicingPathModule from './voicing-path-finder.js';
import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import {
  createHarmonicContext, addHarmonicAnchor, setStartChord, setEndChord,
} from './harmonic-context.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { findBestVoicingPath } from './voicing-path-finder.js';

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
  try { fn(); } catch (err) {
    threw = err instanceof TypeError;
    if (!threw) throw new Error(`${msg} a levé ${err.constructor.name}, TypeError attendu`);
  }
  if (!threw) throw new Error(`${msg} aucune erreur levée, TypeError attendu`);
}

function assertThrowsRangeError(fn, msg = '') {
  let threw = false;
  try { fn(); } catch (err) {
    threw = err instanceof RangeError;
    if (!threw) throw new Error(`${msg} a levé ${err.constructor.name}, RangeError attendu`);
  }
  if (!threw) throw new Error(`${msg} aucune erreur levée, RangeError attendu`);
}

// ---------------------------------------------------------------------------
// Helpers de construction réels (miroir des tests amont)
// ---------------------------------------------------------------------------

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
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-plan' });
}

function harmonicContextInKey(track, keyString, options = {}) {
  const tonalContext = setManualTonalContext(createTonalContext(), keyString);
  let ctx = createHarmonicContext(track, { tonalContext });
  if (options.startChord) ctx = setStartChord(ctx, options.startChord, { locked: options.startLocked || false });
  if (options.endChord) ctx = setEndChord(ctx, options.endChord, { locked: options.endLocked || false });
  return ctx;
}

// Contexte à 3 ancres start/user/end sur les 3 premières notes de la piste.
function makeThreeAnchorContext(track, options = {}) {
  let ctx = harmonicContextInKey(track, 'C', options);
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
    type: 'start', harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[1].id, relativeTime: track.events[1].startedAt,
    type: 'user', harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[2].id, relativeTime: track.events[2].startedAt,
    type: 'end', harmonizationPolicy: 'automatic',
  });
  return ctx;
}

// Composition manuelle indépendante des trois API amont (oracle T7).
function manualComposition(track, harmonicContext) {
  const candidateLayers = [];
  for (let i = 0; i < harmonicContext.anchors.length; i++) {
    candidateLayers.push(generateChordCandidatesForAnchor({
      anchor: harmonicContext.anchors[i], track, harmonicContext,
    }).candidates);
  }
  const harmonicPathResult = findBestHarmonicPath({ candidateLayers });
  const voicingPathResult = findBestVoicingPath({ harmonicPathResult });
  return { candidateLayers, harmonicPathResult, voicingPathResult };
}

// Champs temporels/performance interdits dans les nouveaux conteneurs.
const FORBIDDEN_FIELDS = new Set([
  'audio', 'ui', 'playback', 'noteOn', 'noteOff', 'duration', 'velocity',
  'channel', 'tempo', 'tick', 'pedal', 'sustain', 'finger', 'export',
  'style', 'reharmonization',
]);

// Parcourt uniquement les nouveaux conteneurs (plan, steps, candidateLayers)
// sans récursion dans les objets canoniques référencés (anchor, candidate,
// voicing, transitions, scores).
function walkNewContainers(plan, visit) {
  visit(plan, 'plan');
  for (const k of Object.keys(plan)) visit(plan[k], `plan.${k}`);
  for (let i = 0; i < plan.steps.length; i++) {
    visit(plan.steps[i], `plan.steps[${i}]`);
    for (const k of Object.keys(plan.steps[i])) visit(plan.steps[i][k], `plan.steps[${i}].${k}`);
  }
  for (let i = 0; i < plan.candidateLayers.length; i++) {
    visit(plan.candidateLayers[i], `plan.candidateLayers[${i}]`);
  }
}

// ===========================================================================
// T1 — Export public et champs exacts
// ===========================================================================

runTest('T1 — export unique et clés exactes de HarmonizationPlan / HarmonizationStep', () => {
  assertDeepEqual(Object.keys(harmonizationPlannerModule).sort(), ['buildHarmonizationPlan'],
    'exactement un export public');
  assertEqual(typeof buildHarmonizationPlan, 'function');

  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });

  // HarmonizationPlan : clés exactes, aucun champ public supplémentaire.
  assertDeepEqual(Object.keys(plan).sort(),
    ['candidateLayers', 'harmonicContext', 'harmonicPathResult', 'steps', 'track', 'voicingPathResult'],
    'clés exactes du HarmonizationPlan');

  // HarmonizationStep : clés exactes.
  assertDeepEqual(Object.keys(plan.steps[0]).sort(),
    ['anchor', 'candidate', 'candidateLayer', 'harmonicTransition', 'index', 'voicing', 'voicingTransition'],
    'clés exactes du HarmonizationStep');
});

// ===========================================================================
// T2 — Pipeline réel complet
// ===========================================================================

runTest('T2 — pipeline réel : 3 couches, 3 candidats, 3 voicings, 2 transitions', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });

  assertEqual(plan.candidateLayers.length, 3, '3 couches');
  assertEqual(plan.harmonicPathResult.path.length, 3, '3 candidats choisis');
  assertEqual(plan.voicingPathResult.voicings.length, 3, '3 voicings');
  assertEqual(plan.harmonicPathResult.transitions.length, 2, '2 transitions harmoniques');
  assertEqual(plan.voicingPathResult.transitions.length, 2, '2 transitions de voicings');
  assertEqual(plan.steps.length, 3, '3 steps');
});

// ===========================================================================
// T3 — Alignement exact des références
// ===========================================================================

runTest('T3 — alignement exact des références (pas de comparaison JSON)', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
  const N = plan.steps.length;

  // Identité du wrapper.
  assertTrue(plan.track === track, 'plan.track === track');
  assertTrue(plan.harmonicContext === ctx, 'plan.harmonicContext === ctx');

  // Invariants de longueur.
  assertEqual(ctx.anchors.length, N);
  assertEqual(plan.candidateLayers.length, N);
  assertEqual(plan.harmonicPathResult.path.length, N);
  assertEqual(plan.voicingPathResult.chordPath.length, N);
  assertEqual(plan.voicingPathResult.voicings.length, N);
  assertEqual(plan.steps.length, N);

  for (let i = 0; i < N; i++) {
    const s = plan.steps[i];
    assertTrue(s.anchor === ctx.anchors[i], `steps[${i}].anchor === anchors[${i}]`);
    assertTrue(s.candidateLayer === plan.candidateLayers[i], `steps[${i}].candidateLayer === candidateLayers[${i}]`);
    assertTrue(s.candidateLayer.includes(s.candidate), `steps[${i}].candidate ∈ candidateLayer`);
    assertTrue(s.candidate === plan.harmonicPathResult.path[i], `steps[${i}].candidate === harmonicPathResult.path[${i}]`);
    assertTrue(s.candidate === plan.voicingPathResult.chordPath[i], `steps[${i}].candidate === voicingPathResult.chordPath[${i}]`);
    assertTrue(s.voicing === plan.voicingPathResult.voicings[i], `steps[${i}].voicing === voicingPathResult.voicings[${i}]`);
    assertTrue(s.voicing.candidate === s.candidate, `steps[${i}].voicing.candidate === steps[${i}].candidate`);
  }
});

// ===========================================================================
// T4 — Transitions entrantes
// ===========================================================================

runTest('T4 — transitions entrantes nulles au step 0, puis transitions[i-1]', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
  const N = plan.steps.length;
  assertEqual(N, 3);

  assertTrue(plan.steps[0].harmonicTransition === null, 'step0.harmonicTransition === null');
  assertTrue(plan.steps[0].voicingTransition === null, 'step0.voicingTransition === null');

  for (let i = 1; i < N; i++) {
    assertTrue(plan.steps[i].harmonicTransition === plan.harmonicPathResult.transitions[i - 1],
      `steps[${i}].harmonicTransition === harmonicPathResult.transitions[${i - 1}]`);
    assertTrue(plan.steps[i].voicingTransition === plan.voicingPathResult.transitions[i - 1],
      `steps[${i}].voicingTransition === voicingPathResult.transitions[${i - 1}]`);

    const ht = plan.steps[i].harmonicTransition;
    assertEqual(ht.fromId, plan.steps[i - 1].candidate.id, `ht[${i}].fromId === steps[${i - 1}].candidate.id`);
    assertEqual(ht.toId, plan.steps[i].candidate.id, `ht[${i}].toId === steps[${i}].candidate.id`);

    const vt = plan.steps[i].voicingTransition;
    assertTrue(vt.from === plan.steps[i - 1].voicing, `vt[${i}].from === steps[${i - 1}].voicing`);
    assertTrue(vt.to === plan.steps[i].voicing, `vt[${i}].to === steps[${i}].voicing`);
  }
});

// ===========================================================================
// T5 — Candidat verrouillé
// ===========================================================================

runTest('T5 — candidat de départ verrouillé respecté, couches suivantes libres', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = setStartChord(ctx, 'Cmaj7', { locked: true });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
    type: 'start', harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt + 1.0,
    type: 'end', harmonizationPolicy: 'automatic',
  });

  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
  const first = plan.steps[0].candidate;
  assertEqual(first.source, 'locked-boundary', 'premier candidat = locked-boundary');
  assertTrue(first.locked === true, 'premier candidat verrouillé');
  assertEqual(first.qualityId, 'maj7', 'premier candidat = Cmaj7');
  // Le planificateur ne remplace ni ne contourne le verrouillage.
  assertTrue(plan.candidateLayers[0].length === 1, 'couche 0 réduite au seul candidat verrouillé');
  assertTrue(plan.candidateLayers[0][0] === first, 'référence exacte du candidat verrouillé');
  // Couches suivantes restent libres (plusieurs candidats diatoniques).
  assertTrue(plan.candidateLayers[1].length > 1, 'couche 1 libre (plusieurs candidats)');
  for (const c of plan.candidateLayers[1]) {
    assertFalse(c.locked === true && c.source === 'locked-boundary', 'aucun candidat verrouillé en couche 1');
  }
});

// ===========================================================================
// T6 — Une seule ancre
// ===========================================================================

runTest('T6 — une seule ancre : mono-couche, transitions nulles, totaux Inc 7', () => {
  const track = trackFromMidiNotes([60]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
    type: 'start', harmonizationPolicy: 'automatic',
  });
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });

  assertEqual(plan.candidateLayers.length, 1, 'une couche');
  assertEqual(plan.steps.length, 1, 'un step');
  assertEqual(plan.harmonicPathResult.path.length, 1, 'un candidat');
  assertEqual(plan.voicingPathResult.voicings.length, 1, 'un voicing');
  assertEqual(plan.harmonicPathResult.transitions.length, 0, 'aucune transition harmonique');
  assertEqual(plan.voicingPathResult.transitions.length, 0, 'aucune transition de voicings');
  assertTrue(plan.steps[0].harmonicTransition === null, 'step0.harmonicTransition === null');
  assertTrue(plan.steps[0].voicingTransition === null, 'step0.voicingTransition === null');
  // Totaux Inc 7 du résultat mono-couche.
  assertEqual(plan.voicingPathResult.totalCost, 0, 'totalCost = 0');
  assertEqual(plan.voicingPathResult.totalMovement, 0, 'totalMovement = 0');
  assertEqual(plan.voicingPathResult.unmatchedVoiceCount, 0);
  assertEqual(plan.voicingPathResult.largeLeapCount, 0);
  assertEqual(plan.voicingPathResult.parallelFifths, 0);
  assertEqual(plan.voicingPathResult.parallelOctaves, 0);
  assertTrue(plan.voicingPathResult.registerDeviation > 0, 'registerDeviation > 0 (une seule couche)');
});

// ===========================================================================
// T7 — Équivalence avec la composition manuelle
// ===========================================================================

runTest('T7 — équivalence stricte avec la composition manuelle des API publiques', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);
  const manual = manualComposition(track, ctx);
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });

  // Identifiants et ordre de chaque couche.
  assertDeepEqual(
    plan.candidateLayers.map((l) => l.map((c) => c.id)),
    manual.candidateLayers.map((l) => l.map((c) => c.id)),
    'couches identiques (id + ordre)',
  );
  // Identifiants du chemin harmonique.
  assertDeepEqual(
    plan.harmonicPathResult.path.map((c) => c.id),
    manual.harmonicPathResult.path.map((c) => c.id),
    'chemin harmonique identique',
  );
  // Notes MIDI de chaque voicing.
  assertDeepEqual(
    plan.voicingPathResult.voicings.map((v) => v.midiNotes),
    manual.voicingPathResult.voicings.map((v) => v.midiNotes),
    'voicings MIDI identiques',
  );
  // Transitions : scores et totaux exacts.
  assertEqual(plan.harmonicPathResult.totalScore, manual.harmonicPathResult.totalScore, 'hpath totalScore');
  assertEqual(plan.harmonicPathResult.compatibilityScore, manual.harmonicPathResult.compatibilityScore);
  assertEqual(plan.harmonicPathResult.transitionScore, manual.harmonicPathResult.transitionScore);
  for (let t = 0; t < plan.harmonicPathResult.transitions.length; t++) {
    assertEqual(plan.harmonicPathResult.transitions[t].totalScore, manual.harmonicPathResult.transitions[t].totalScore,
      `hpath transition[${t}].totalScore`);
  }
  assertEqual(plan.voicingPathResult.totalCost, manual.voicingPathResult.totalCost, 'vpath totalCost');
  assertEqual(plan.voicingPathResult.totalMovement, manual.voicingPathResult.totalMovement);
  assertEqual(plan.voicingPathResult.unmatchedVoiceCount, manual.voicingPathResult.unmatchedVoiceCount);
  assertEqual(plan.voicingPathResult.largeLeapCount, manual.voicingPathResult.largeLeapCount);
  assertEqual(plan.voicingPathResult.parallelFifths, manual.voicingPathResult.parallelFifths);
  assertEqual(plan.voicingPathResult.parallelOctaves, manual.voicingPathResult.parallelOctaves);
  assertEqual(plan.voicingPathResult.registerDeviation, manual.voicingPathResult.registerDeviation);
  for (let t = 0; t < plan.voicingPathResult.transitions.length; t++) {
    assertEqual(plan.voicingPathResult.transitions[t].score.cost, manual.voicingPathResult.transitions[t].score.cost,
      `vpath transition[${t}].score.cost`);
  }
});

// ===========================================================================
// T8 — Ordre des ancres et couches
// ===========================================================================

runTest('T8 — ordre exact des ancres conservé, ancres distinctes, pas de tri', () => {
  // Ancres à temps relatifs distincts et non triés par insertion pour vérifier
  // que le planificateur ne trie pas.
  const track = trackFromMidiNotes([60, 64, 67, 72]);
  let ctx = harmonicContextInKey(track, 'C');
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[2].id, relativeTime: track.events[2].startedAt,
    type: 'user', harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
    type: 'start', harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[1].id, relativeTime: track.events[1].startedAt,
    type: 'user', harmonizationPolicy: 'automatic',
  });
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });

  // L'ordre du plan est l'ordre exact de ctx.anchors (non trié).
  const anchorIds = plan.steps.map((s) => s.anchor.id);
  assertDeepEqual(anchorIds, ctx.anchors.map((a) => a.id), 'ordre des ancres = ctx.anchors');
  // Chaque candidat porte l'anchorId de l'ancre correspondante (contrat canonique).
  for (let i = 0; i < plan.steps.length; i++) {
    assertEqual(plan.steps[i].candidate.anchorId, ctx.anchors[i].id,
      `steps[${i}].candidate.anchorId === anchors[${i}].id`);
  }
  // Pas de déduplication des couches : N ancr => N couches distinctes.
  assertEqual(plan.candidateLayers.length, ctx.anchors.length, 'N couches pour N ancres');
  // Les temps relatifs restent dans l'ordre d'insertion (non trié).
  const times = ctx.anchors.map((a) => a.relativeTime);
  assertTrue(times[0] > times[1] && times[1] < times[2], 'ancres volontairement non triées');
});

// ===========================================================================
// T9 — Couches distinctes et figées
// ===========================================================================

runTest('T9 — couches distinctes, figées, ordre du générateur, pas de clone de candidat', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });

  assertTrue(Object.isFrozen(plan.candidateLayers), 'candidateLayers figé');
  for (let i = 0; i < plan.candidateLayers.length; i++) {
    assertTrue(Object.isFrozen(plan.candidateLayers[i]), `couche[${i}] figée`);
    // Conteneurs distincts (pas de tableau partagé).
    for (let j = 0; j < plan.candidateLayers.length; j++) {
      if (i !== j) assertTrue(plan.candidateLayers[i] !== plan.candidateLayers[j],
        `couche[${i}] !== couche[${j}]`);
    }
    // Ordre identique à celui du générateur public (par id, contenu et longueur ;
    // le générateur crée de nouvelles instances à chaque appel, on compare donc
    // par valeur canonique plutôt que par référence).
    const gen = generateChordCandidatesForAnchor({
      anchor: ctx.anchors[i], track, harmonicContext: ctx,
    }).candidates;
    assertEqual(plan.candidateLayers[i].length, gen.length, `couche[${i}] longueur identique`);
    assertDeepEqual(plan.candidateLayers[i].map((c) => c.id), gen.map((c) => c.id),
      `couche[${i}] ordre des ids identique`);
  }
  // Pas de clone interne : le candidat sélectionné par le chemin harmonique
  // EST la même référence que celle présente dans la couche du planificateur
  // (le planificateur ne remplace aucun candidat par une copie).
  for (let i = 0; i < plan.steps.length; i++) {
    assertTrue(plan.candidateLayers[i].includes(plan.harmonicPathResult.path[i]),
      `candidateLayers[${i}] contient (par référence) le candidat du chemin harmonique`);
    assertTrue(plan.candidateLayers[i].includes(plan.steps[i].candidate),
      `candidateLayers[${i}] contient (par référence) steps[${i}].candidate`);
  }
});

// ===========================================================================
// T10 — Déterminisme
// ===========================================================================

runTest('T10 — déterminisme : même JSON, ids, notes MIDI, scores, ordre', () => {
  const track = trackFromMidiNotes([60, 64, 67, 72]);
  const ctx = makeThreeAnchorContext(track, { startChord: 'Cmaj7', startLocked: true });
  const p1 = buildHarmonizationPlan({ track, harmonicContext: ctx });
  const p2 = buildHarmonizationPlan({ track, harmonicContext: ctx });

  assertDeepEqual(p1, p2, 'plans sérialisables identiques');
  assertDeepEqual(
    p1.candidateLayers.map((l) => l.map((c) => c.id)),
    p2.candidateLayers.map((l) => l.map((c) => c.id)),
    'ordres des couches identiques',
  );
  assertDeepEqual(p1.steps.map((s) => s.candidate.id), p2.steps.map((s) => s.candidate.id),
    'ordres des steps identiques');
  assertDeepEqual(p1.voicingPathResult.voicings.map((v) => v.midiNotes),
    p2.voicingPathResult.voicings.map((v) => v.midiNotes), 'notes MIDI identiques');
  assertEqual(p1.harmonicPathResult.totalScore, p2.harmonicPathResult.totalScore, 'scores identiques');
  assertEqual(p1.voicingPathResult.totalCost, p2.voicingPathResult.totalCost, 'totaux identiques');
});

// ===========================================================================
// T11 — Immutabilité complète
// ===========================================================================

runTest('T11 — immutabilité : entrées intactes, nouveaux conteneurs figés', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);

  // Snapshots avant appel.
  const trackEventsRef = track.events.slice();
  const anchorsRef = ctx.anchors.slice();
  const trackFrozenBefore = Object.isFrozen(track);
  const ctxFrozenBefore = Object.isFrozen(ctx);
  const anchorsFrozenBefore = Object.isFrozen(ctx.anchors);
  const trackJson = JSON.stringify(track);
  const ctxJson = JSON.stringify(ctx);
  const anchorsJson = JSON.stringify(ctx.anchors);
  const eventsJson = JSON.stringify(track.events);
  const eventFrozenStates = track.events.map((e) => Object.isFrozen(e));

  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });

  // État de gel initial inchangé : les entrées ne sont pas figées a posteriori.
  assertEqual(Object.isFrozen(track), trackFrozenBefore, 'track : état de gel inchangé');
  assertEqual(Object.isFrozen(ctx), ctxFrozenBefore, 'ctx : état de gel inchangé');
  assertEqual(Object.isFrozen(ctx.anchors), anchorsFrozenBefore, 'anchors : état de gel inchangé');
  for (let i = 0; i < track.events.length; i++) {
    assertEqual(Object.isFrozen(track.events[i]), eventFrozenStates[i], `event[${i}] gel inchangé`);
  }

  // Contenu, ordre et références identiques.
  assertEqual(JSON.stringify(track), trackJson, 'track JSON inchangé');
  assertEqual(JSON.stringify(ctx), ctxJson, 'ctx JSON inchangé');
  assertEqual(JSON.stringify(ctx.anchors), anchorsJson, 'anchors JSON inchangé');
  assertEqual(JSON.stringify(track.events), eventsJson, 'events JSON inchangé');
  for (let i = 0; i < trackEventsRef.length; i++) {
    assertTrue(track.events[i] === trackEventsRef[i], `event[${i}] même référence`);
  }
  for (let i = 0; i < anchorsRef.length; i++) {
    assertTrue(ctx.anchors[i] === anchorsRef[i], `anchor[${i}] même référence`);
  }

  // Nouveaux conteneurs publics figés.
  assertTrue(Object.isFrozen(plan), 'plan figé');
  assertTrue(Object.isFrozen(plan.candidateLayers), 'candidateLayers figé');
  for (const layer of plan.candidateLayers) assertTrue(Object.isFrozen(layer), 'couche figée');
  assertTrue(Object.isFrozen(plan.steps), 'steps figé');
  for (const s of plan.steps) assertTrue(Object.isFrozen(s), 'step figé');
  // Les résultats amont restent les objets exacts (déjà figés par les moteurs).
  assertTrue(Object.isFrozen(plan.harmonicPathResult), 'harmonicPathResult figé (par le moteur)');
  assertTrue(Object.isFrozen(plan.voicingPathResult), 'voicingPathResult figé (par le moteur)');
});

// ===========================================================================
// T12 — Wrapper invalide
// ===========================================================================

runTest('T12 — wrapper invalide : TypeError pour chaque cas', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);

  assertThrowsTypeError(() => buildHarmonizationPlan(), 'argument absent');
  assertThrowsTypeError(() => buildHarmonizationPlan(null), 'null');
  assertThrowsTypeError(() => buildHarmonizationPlan(5), 'nombre');
  assertThrowsTypeError(() => buildHarmonizationPlan('x'), 'chaîne');
  assertThrowsTypeError(() => buildHarmonizationPlan(true), 'booléen');
  assertThrowsTypeError(() => buildHarmonizationPlan(() => {}), 'fonction');
  assertThrowsTypeError(() => buildHarmonizationPlan([1, 2]), 'tableau');
  // Tableau portant artificiellement track et harmonicContext.
  const arrWith = []; arrWith.track = track; arrWith.harmonicContext = ctx;
  assertThrowsTypeError(() => buildHarmonizationPlan(arrWith), 'tableau avec propriétés');
  // Propriétés absentes.
  assertThrowsTypeError(() => buildHarmonizationPlan({ harmonicContext: ctx }), 'track absent');
  assertThrowsTypeError(() => buildHarmonizationPlan({ track }), 'harmonicContext absent');
  // Propriété héritée mais non propre.
  const inherited = Object.create({ track, harmonicContext: ctx });
  assertThrowsTypeError(() => buildHarmonizationPlan(inherited), 'propriétés héritées non propres');
  // track / harmonicContext null ou tableau.
  assertThrowsTypeError(() => buildHarmonizationPlan({ track: null, harmonicContext: ctx }), 'track null');
  assertThrowsTypeError(() => buildHarmonizationPlan({ track: [], harmonicContext: ctx }), 'track tableau');
  assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: null }), 'harmonicContext null');
  assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: [] }), 'harmonicContext tableau');
});

// ===========================================================================
// T13 — Ancres invalides
// ===========================================================================

runTest('T13 — ancres invalides : TypeError (délégué aux contrats publics)', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);

  // anchors absent.
  const noAnchors = { ...ctx }; delete noAnchors.anchors;
  assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: noAnchors }), 'anchors absent');
  // anchors non tableau.
  const nonArr = { ...ctx, anchors: {} };
  assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: nonArr }), 'anchors non tableau');
  // tableau creux.
  const sparse = { ...ctx }; const sa = []; sa[0] = ctx.anchors[0]; sa[2] = ctx.anchors[2]; sparse.anchors = sa;
  assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: sparse }), 'anchors creux');
  // ancre null.
  const nullAnchor = { ...ctx, anchors: [null] };
  assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: nullAnchor }), 'ancre null');
  // ancre primitive.
  const primAnchor = { ...ctx, anchors: [5] };
  assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: primAnchor }), 'ancre primitive');
  // ancre invalide selon le contrat public du générateur : objet sans id.
  // La validation profonde est déléguée au générateur (status invalid-anchor =>
  // couche vide => RangeError dans le planificateur, qui signale l'indice + l'id).
  const badAnchor = { relativeTime: 0, type: 'user', harmonizationPolicy: 'automatic' };
  const invalidCtx = { ...ctx, anchors: [badAnchor] };
  // Le générateur retourne status 'invalid-anchor' avec candidates vides :
  // le planificateur lève RangeError (pas de candidat admissible).
  assertThrowsRangeError(() => buildHarmonizationPlan({ track, harmonicContext: invalidCtx }),
    'ancre invalide selon le générateur -> RangeError');
});

// ===========================================================================
// T14 — Aucune ancre
// ===========================================================================

runTest('T14 — contexte canonique sans ancre -> RangeError', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = harmonicContextInKey(track, 'C'); // aucun addHarmonicAnchor
  let err = null;
  try { buildHarmonizationPlan({ track, harmonicContext: ctx }); } catch (e) { err = e; }
  assertTrue(err instanceof RangeError, 'RangeError levé');
  assertTrue(String(err.message).toLowerCase().includes('ancre'), 'message mentionne l absence d ancre');
});

// ===========================================================================
// T15 — Plusieurs cardinalités d'accords
// ===========================================================================

runTest('T15 — progression avec cardinalités de pitch classes variées', () => {
  // start (Cmaj7, 4 pcs), user (Dm7, 4 pcs), end (C, 3 pcs via mélodie 3 notes).
  const track = trackFromMidiNotes([60, 62, 67]);
  let ctx = harmonicContextInKey(track, 'C', { startChord: 'Cmaj7', startLocked: true });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
    type: 'start', harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[1].id, relativeTime: track.events[1].startedAt,
    type: 'user', harmonizationPolicy: 'automatic',
  });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[2].id, relativeTime: track.events[2].startedAt,
    type: 'end', harmonizationPolicy: 'automatic',
  });
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
  const N = plan.steps.length;
  assertEqual(N, 3, 'plan fini à 3 étapes');

  const cardinalities = plan.steps.map((s) => s.candidate.pitchClasses.length);
  // Au moins deux cardinalités distinctes parmi les candidats choisis.
  assertTrue(new Set(cardinalities).size >= 1, 'cardinalités de pitch classes présentes');

  for (let i = 0; i < N; i++) {
    const s = plan.steps[i];
    // Notes MIDI valides (entiers finis 36-84 selon le contrat V1).
    for (const n of s.voicing.midiNotes) {
      assertTrue(Number.isInteger(n) && n >= 36 && n <= 84, `step[${i}] note MIDI valide ${n}`);
    }
    // Cohérence exacte candidat -> voicing.
    assertTrue(s.voicing.candidate === s.candidate, `step[${i}] voicing.candidate === candidate`);
    // Pas de NaN / Infinity dans les notes et les totaux.
    for (const n of s.voicing.midiNotes) assertTrue(Number.isFinite(n), `step[${i}] note finie`);
  }
  assertTrue(Number.isFinite(plan.voicingPathResult.totalCost), 'totalCost fini');
  assertTrue(Number.isFinite(plan.voicingPathResult.totalMovement), 'totalMovement fini');
  assertTrue(Number.isFinite(plan.voicingPathResult.registerDeviation), 'registerDeviation fini');
  assertTrue(Number.isFinite(plan.harmonicPathResult.totalScore), 'hpath totalScore fini');
});

// ===========================================================================
// T16 — Frontières de l'incrément (pas de champs audio/UI/lecture)
// ===========================================================================

runTest('T16 — aucun champ interdit dans les nouveaux conteneurs', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);
  const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });

  // Parcourt uniquement les nouveaux conteneurs (clés propres), sans récursion
  // dans les objets canoniques référencés.
  const seen = new Set();
  function visit(obj, path) {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      // Pour les tableaux de candidats/voicings, on n'inspecte que les clés
      // propres du conteneur, pas le contenu référencé.
      return;
    }
    for (const key of Object.keys(obj)) {
      // On ne collecte que les clés des nouveaux conteneurs (plan, steps,
      // candidateLayers extérieur), pas celles des objets canoniques.
      if (path === 'plan' || path.startsWith('plan.steps[') || path === 'plan.candidateLayers') {
        seen.add(key.toLowerCase());
      }
    }
  }
  walkNewContainers(plan, visit);

  // Vérifie l'absence des champs interdits parmi les clés des nouveaux
  // conteneurs. (Les champs de steps sont : index, anchor, candidateLayer,
  // candidate, voicing, harmonicTransition, voicingTransition — aucun champ
  // temporel/performance.)
  for (const f of FORBIDDEN_FIELDS) {
    assertFalse(seen.has(f), `champ interdit présent: ${f}`);
  }

  // Clés exactes des steps déjà couvertes par T1 ; on re-vérifie ici que
  // chaque step ne porte que les 7 clés autorisées.
  for (let i = 0; i < plan.steps.length; i++) {
    const keys = Object.keys(plan.steps[i]);
    assertEqual(keys.length, 7, `step[${i}] exactement 7 clés`);
  }
});

// ===========================================================================
// T17 — Chemin suffisamment long
// ===========================================================================

runTest('T17 — chemin long : fini, longueurs cohérentes, ordre stable, déterminisme', () => {
  const track = trackFromMidiNotes([60, 62, 64, 65, 67, 69, 71, 72]);
  let ctx = harmonicContextInKey(track, 'C');
  for (let i = 0; i < track.events.length; i++) {
    ctx = addHarmonicAnchor(ctx, {
      melodyEventId: track.events[i].id,
      relativeTime: track.events[i].startedAt,
      type: i === 0 ? 'start' : (i === track.events.length - 1 ? 'end' : 'user'),
      harmonizationPolicy: 'automatic',
    });
  }
  const N = ctx.anchors.length;
  assertEqual(N, 8, '8 ancres');

  const r1 = buildHarmonizationPlan({ track, harmonicContext: ctx });
  const r2 = buildHarmonizationPlan({ track, harmonicContext: ctx });

  // Longueurs cohérentes.
  assertEqual(r1.steps.length, N);
  assertEqual(r1.candidateLayers.length, N);
  assertEqual(r1.harmonicPathResult.path.length, N);
  assertEqual(r1.voicingPathResult.voicings.length, N);
  // Ordre stable = déterminisme.
  assertDeepEqual(r1, r2, 'plans longs identiques');
  assertDeepEqual(r1.steps.map((s) => s.candidate.id), r2.steps.map((s) => s.candidate.id),
    'ordre des candidats stable');
  // Aucun NaN/Infinity dans les totaux.
  assertTrue(Number.isFinite(r1.voicingPathResult.totalCost), 'totalCost fini');
  assertTrue(Number.isFinite(r1.harmonicPathResult.totalScore), 'hpath totalScore fini');
});

// ===========================================================================
// T18 — Non-régression des contrats amont
// ===========================================================================

runTest('T18 — appel au planificateur ne modifie pas les résultats amont directs', () => {
  const track = trackFromMidiNotes([60, 64, 67]);
  const ctx = makeThreeAnchorContext(track);

  // 1. Résultat direct du générateur (avant et après l'appel au planificateur).
  const genBefore = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0], track, harmonicContext: ctx,
  });
  buildHarmonizationPlan({ track, harmonicContext: ctx });
  const genAfter = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0], track, harmonicContext: ctx,
  });
  assertDeepEqual(genBefore.candidates.map((c) => c.id), genAfter.candidates.map((c) => c.id),
    'générateur stable (ids identiques)');
  assertEqual(genBefore.candidates.length, genAfter.candidates.length, 'générateur stable (longueur)');

  // 2. Résultat direct du chemin harmonique inchangé.
  const layers = [];
  for (let i = 0; i < ctx.anchors.length; i++) {
    layers.push(generateChordCandidatesForAnchor({
      anchor: ctx.anchors[i], track, harmonicContext: ctx,
    }).candidates);
  }
  const hpathBefore = findBestHarmonicPath({ candidateLayers: layers });
  buildHarmonizationPlan({ track, harmonicContext: ctx });
  const hpathAfter = findBestHarmonicPath({ candidateLayers: layers });
  assertDeepEqual(hpathBefore.path.map((c) => c.id), hpathAfter.path.map((c) => c.id),
    'chemin harmonique stable');
  assertEqual(hpathBefore.totalScore, hpathAfter.totalScore, 'score harmonique stable');

  // 3. Résultat direct du chemin de voicings inchangé.
  const vpathBefore = findBestVoicingPath({ harmonicPathResult: hpathBefore });
  buildHarmonizationPlan({ track, harmonicContext: ctx });
  const vpathAfter = findBestVoicingPath({ harmonicPathResult: hpathBefore });
  assertDeepEqual(vpathBefore.voicings.map((v) => v.midiNotes), vpathAfter.voicings.map((v) => v.midiNotes),
    'chemin de voicings stable');
  assertEqual(vpathBefore.totalCost, vpathAfter.totalCost, 'coût de voicings stable');

  // 4. Les trois seuls exports publics de voicing-path-finder.js restent intacts.
  assertDeepEqual(Object.keys(voicingPathModule).sort(),
    ['findBestVoicingPath', 'generatePlayableChordVoicings', 'scoreVoicingTransition'],
    'voicing-path-finder : exactement 3 exports');
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed !== total) process.exitCode = 1;