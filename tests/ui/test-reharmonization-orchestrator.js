// [OpenCode] — 2026-08-07 — Incrément 9, Lot 1 : tests de l'orchestrateur UI.
// Exécutable avec : node tests/ui/test-reharmonization-orchestrator.js
// Aucun navigateur, jsdom ou dépendance supplémentaire : Node seul.
//
// Le chemin de SUCCÈS exécute le véritable planificateur canonique
// (buildHarmonizationPlan) — pas de mocks.

import { buildDemoFixture, DEMO_FIXTURE_META } from '../../src/ui/reharmonization-demo-fixture.js';
import {
  buildReharmonizationViewModel,
  sanitizeHarmonizationInput,
  mapHarmonizationPlanToViewModel,
} from '../../src/ui/reharmonization-orchestrator.js';
import { miniKeyboardForNotes } from '../../src/ui/mini-keyboard.js';
import { buildHarmonizationPlan } from '../../src/melody/harmonization-planner.js';
import {
  spellChordReference,
  formatSpelledPitch,
  spellMidiNote,
} from '../../src/melody/spelled-pitch.js';
import { createMidiCapture } from '../../src/melody/midi-capture.js';
import { createMelodyTrack } from '../../src/melody/melody-track.js';
import { createTonalContext, setManualTonalContext } from '../../src/melody/tonal-context.js';
import { createHarmonicContext } from '../../src/melody/harmonic-context.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'expected true');
}

function assertDeepEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`);
  }
}

// --- Helpers de construction canonique (miroir des factories publiques) ----

function makeFixedClock() {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

function trackFromMidis(midis) {
  const clock = makeFixedClock();
  const capture = createMidiCapture({ getTime: clock.now });
  for (const midi of midis) {
    capture.noteOn(midi, 0.8, 0);
    clock.advance(400);
    capture.noteOff(midi, 0, 0);
    clock.advance(100);
  }
  capture.finalize();
  return createMelodyTrack(
    { notes: capture.getNotes(), sourceCaptureId: 'cap-test' },
    { sopranoPolicy: 'melody-must-be-top', harmonizationPolicy: 'automatic' },
  );
}

// Contexte sans ancre (pour le cas RangeError) via factory publique.
function contextWithoutAnchors(track) {
  const tonalContext = setManualTonalContext(createTonalContext(), 'C');
  return createHarmonicContext(track, { tonalContext });
}

function expectedChordSymbol(candidate, tonalContext) {
  const sp = spellChordReference(candidate.chord, tonalContext);
  let sym = formatSpelledPitch(sp.rootSpelling) + (sp.quality || '');
  if (sp.bass != null && sp.bassSpelling) sym += '/' + formatSpelledPitch(sp.bassSpelling);
  return sym;
}

// --- Source des fichiers (pour les gardes statiques) -----------------------

const fixtureSrc = fs.readFileSync(
  fileURLToPath(new URL('../../src/ui/reharmonization-demo-fixture.js', import.meta.url)),
  'utf8',
);
const orchestratorSrc = fs.readFileSync(
  fileURLToPath(new URL('../../src/ui/reharmonization-orchestrator.js', import.meta.url)),
  'utf8',
);

// ===========================================================================
// Tests
// ===========================================================================

console.log('Tests reharmonization-orchestrator (Incrément 9 — Lot 1)');

runTest('T1 — fixture construite uniquement par les factories publiques', () => {
  const fixture = buildDemoFixture();
  assertTrue(fixture.track && typeof fixture.track === 'object', 'track doit être un objet');
  assertTrue(Array.isArray(fixture.track.events), 'track.events doit être un tableau');
  assertTrue(fixture.track.events.length === 3, 'la fixture doit contenir 3 événements');
  assertTrue(fixture.harmonicContext && typeof fixture.harmonicContext === 'object', 'harmonicContext requis');
  assertTrue(Array.isArray(fixture.harmonicContext.anchors), 'anchors doit être un tableau');
  assertEqual(fixture.harmonicContext.anchors.length, 3, '3 ancres attendues');
  assertEqual(fixture.harmonicContext.melodyTrackId, fixture.track.id, 'melodyTrackId doit correspondre à track.id');
  assertTrue(fixture.meta && fixture.meta.isDemo === true, 'meta.isDemo doit être true');
});

runTest('T2 — appel réel à buildHarmonizationPlan via l’orchestrateur', () => {
  const fixture = buildDemoFixture();
  const vm = buildReharmonizationViewModel({ track: fixture.track, harmonicContext: fixture.harmonicContext });
  assertEqual(vm.status, 'success', 'statut success attendu');
  assertTrue(vm.steps && vm.steps.length > 0, 'au moins un step attendu');
  assertTrue(vm.totals && typeof vm.totals === 'object', 'totals attendus');
});

runTest('T3 — nombre de viewSteps identique à plan.steps', () => {
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };
  const plan = buildHarmonizationPlan(sanitizeHarmonizationInput(wrapper));
  const vm = buildReharmonizationViewModel(wrapper);
  assertEqual(vm.steps.length, plan.steps.length, 'longueurs de steps');
});

runTest('T4 — identifiants, symboles et notes MIDI issus du plan réel', () => {
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };
  const plan = buildHarmonizationPlan(sanitizeHarmonizationInput(wrapper));
  const vm = buildReharmonizationViewModel(wrapper);
  const tc = fixture.harmonicContext.tonalContext;
  assertEqual(vm.steps.length, plan.steps.length, 'longueurs');
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const view = vm.steps[i];
    assertEqual(view.index, step.index, `index ${i}`);
    assertEqual(view.anchorId, step.anchor.id, `anchorId ${i}`);
    assertEqual(view.chordSymbol, expectedChordSymbol(step.candidate, tc), `chordSymbol ${i}`);
    assertEqual(view.chordQualityId, step.candidate.qualityId, `qualityId ${i}`);
    assertDeepEqual(view.voicingMidiNotes, step.voicing.midiNotes, `voicingMidiNotes ${i}`);
    const ev = fixture.track.events.find((e) => e.id === step.anchor.melodyEventId);
    assertEqual(view.topNoteMidi, ev.midi, `topNoteMidi ${i}`);
    assertEqual(view.topNoteName, formatSpelledPitch(spellMidiNote(ev.midi, tc), { showOctave: true }), `topNoteName ${i}`);
  }
});

runTest('T5 — alternatives (candidat retenu exclu) et totaux issus du plan réel', () => {
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };
  const plan = buildHarmonizationPlan(sanitizeHarmonizationInput(wrapper));
  const vm = buildReharmonizationViewModel(wrapper);
  const tc = fixture.harmonicContext.tonalContext;
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const layer = step.candidateLayer;

    // Le candidat retenu appartient bien à candidateLayer (invariant canonique).
    const candidateIndexInLayer = layer.findIndex((c) => c === step.candidate);
    assertTrue(candidateIndexInLayer >= 0, `step ${i} : le candidat retenu doit appartenir à candidateLayer`);

    // Le viewModel contient exactement candidateLayer.length - 1 alternatives.
    assertEqual(vm.steps[i].alternatives.length, layer.length - 1, `nb alternatives ${i}`);

    // Le candidat retenu n'apparaît pas dans les alternatives.
    for (const alt of vm.steps[i].alternatives) {
      assertEqual(alt.id === step.candidate.id, false, `step ${i} : le candidat retenu ne doit pas figurer dans les alternatives`);
    }

    // Ordre des autres candidats conservé : les alternatives correspondent à
    // candidateLayer privée du candidat retenu, dans l'ordre original.
    const expectedAlts = layer.filter((c) => c !== step.candidate);
    assertEqual(expectedAlts.length, vm.steps[i].alternatives.length, `longueur attendue ${i}`);
    for (let j = 0; j < expectedAlts.length; j++) {
      assertEqual(vm.steps[i].alternatives[j].id, expectedAlts[j].id, `alt id ${i}.${j}`);
      assertEqual(vm.steps[i].alternatives[j].symbol, expectedChordSymbol(expectedAlts[j], tc), `alt symbol ${i}.${j}`);
    }
  }

  // Vérification exacte des totaux : chaque valeur comparée directement au
  // champ correspondant du véritable HarmonizationPlan (aucune valeur inventée).
  const h = plan.harmonicPathResult;
  const v = plan.voicingPathResult;
  assertEqual(vm.totals.harmonicPathTotal, h.totalScore, 'harmonicPathTotal');
  assertEqual(vm.totals.harmonicCompatibilityScore, h.compatibilityScore, 'harmonicCompatibilityScore');
  assertEqual(vm.totals.harmonicTransitionScore, h.transitionScore, 'harmonicTransitionScore');
  assertEqual(vm.totals.harmonicWeights.compatibility, h.weights.compatibility, 'harmonicWeights.compatibility');
  assertEqual(vm.totals.harmonicWeights.transition, h.weights.transition, 'harmonicWeights.transition');
  assertEqual(vm.totals.voicingTotalCost, v.totalCost, 'voicingTotalCost');
  assertEqual(vm.totals.voicingTotalMovement, v.totalMovement, 'voicingTotalMovement');
  assertEqual(vm.totals.voicingRegisterDeviation, v.registerDeviation, 'voicingRegisterDeviation');
  assertEqual(vm.totals.voicingParallelFifths, v.parallelFifths, 'voicingParallelFifths');
  assertEqual(vm.totals.voicingParallelOctaves, v.parallelOctaves, 'voicingParallelOctaves');
});

runTest('T6 — déterminisme de deux fixtures fraîches et de leurs viewModels', () => {
  // Deux constructions réellement indépendantes (deux appels à buildDemoFixture).
  const fixture1 = buildDemoFixture();
  const fixture2 = buildDemoFixture();

  // Représentation JSON complète des deux fixtures.
  assertDeepEqual(JSON.stringify(fixture1), JSON.stringify(fixture2), 'JSON complet des deux fixtures');

  // track.id et harmonicContext.id.
  assertEqual(fixture1.track.id, fixture2.track.id, 'track.id');
  assertEqual(fixture1.harmonicContext.id, fixture2.harmonicContext.id, 'harmonicContext.id');

  // MelodyEvent et leurs identifiants.
  assertEqual(fixture1.track.events.length, fixture2.track.events.length, 'nombre d’événements');
  for (let i = 0; i < fixture1.track.events.length; i++) {
    assertEqual(fixture1.track.events[i].id, fixture2.track.events[i].id, `event id ${i}`);
  }

  // Timestamps (startedAt/endedAt/duration des events, createdAt/updatedAt du
  // track et du harmonicContext).
  for (let i = 0; i < fixture1.track.events.length; i++) {
    assertEqual(fixture1.track.events[i].startedAt, fixture2.track.events[i].startedAt, `event startedAt ${i}`);
    assertEqual(fixture1.track.events[i].endedAt, fixture2.track.events[i].endedAt, `event endedAt ${i}`);
    assertEqual(fixture1.track.events[i].duration, fixture2.track.events[i].duration, `event duration ${i}`);
  }
  assertEqual(fixture1.track.createdAt, fixture2.track.createdAt, 'track.createdAt');
  assertEqual(fixture1.track.updatedAt, fixture2.track.updatedAt, 'track.updatedAt');
  assertEqual(fixture1.harmonicContext.createdAt, fixture2.harmonicContext.createdAt, 'harmonicContext.createdAt');

  // Ancres et leurs identifiants.
  assertEqual(fixture1.harmonicContext.anchors.length, fixture2.harmonicContext.anchors.length, 'nombre d’ancres');
  for (let i = 0; i < fixture1.harmonicContext.anchors.length; i++) {
    assertEqual(fixture1.harmonicContext.anchors[i].id, fixture2.harmonicContext.anchors[i].id, `anchor id ${i}`);
    assertEqual(fixture1.harmonicContext.anchors[i].relativeTime, fixture2.harmonicContext.anchors[i].relativeTime, `anchor relativeTime ${i}`);
  }

  // Deux viewModels produits séparément.
  const vm1 = buildReharmonizationViewModel({ track: fixture1.track, harmonicContext: fixture1.harmonicContext });
  const vm2 = buildReharmonizationViewModel({ track: fixture2.track, harmonicContext: fixture2.harmonicContext });
  assertDeepEqual(vm1, vm2, 'viewModels produits séparément');
});

runTest('T7 — absence de Date.now et Math.random dans la fixture', () => {
  assertTrue(!/Date\.now\s*\(/.test(fixtureSrc), 'la fixture ne doit pas appeler Date.now()');
  assertTrue(!/Math\.random\s*\(/.test(fixtureSrc), 'la fixture ne doit pas appeler Math.random()');
});

runTest('T8 — TypeError transformé en état erreur', () => {
  const vm = buildReharmonizationViewModel({});
  assertEqual(vm.status, 'error', 'statut error attendu');
  assertEqual(vm.errorKind, 'TypeError', 'errorKind TypeError attendu');
  assertTrue(typeof vm.message === 'string' && vm.message.length > 0, 'message requis');

  // Cas supplémentaire : track sans harmonicContext.
  const fixture = buildDemoFixture();
  const vm2 = buildReharmonizationViewModel({ track: fixture.track });
  assertEqual(vm2.status, 'error', 'statut error attendu (sans harmonicContext)');
  assertEqual(vm2.errorKind, 'TypeError', 'errorKind TypeError attendu (sans harmonicContext)');
});

runTest('T9 — RangeError pour contexte sans ancre transformé en état erreur', () => {
  const track = trackFromMidis([60, 64, 67]);
  const harmonicContext = contextWithoutAnchors(track);
  const vm = buildReharmonizationViewModel({ track, harmonicContext });
  assertEqual(vm.status, 'error', 'statut error attendu');
  assertEqual(vm.errorKind, 'RangeError', 'errorKind RangeError attendu (ancres vides)');
  assertTrue(/ancre/i.test(vm.message), 'le message doit mentionner une ancre');
});

runTest('T10 — absence de mutation du véritable plan transformé', () => {
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };

  // 1. Construire un véritable plan canonique.
  const plan = buildHarmonizationPlan(sanitizeHarmonizationInput(wrapper));

  // 2. Enregistrer son snapshot JSON (avant transformation), ainsi que ceux de
  //    track et harmonicContext.
  const snapPlan = JSON.stringify(plan);
  const snapTrack = JSON.stringify(fixture.track);
  const snapCtx = JSON.stringify(fixture.harmonicContext);

  // 3. Transmettre CE MÊME plan à mapHarmonizationPlanToViewModel (la
  //    transformation réellement exécutée par l'orchestrateur sur le plan).
  const vm = mapHarmonizationPlanToViewModel(plan, {
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
  });
  assertEqual(vm.status, 'success', 'mapHarmonizationPlanToViewModel doit produire un succès');

  // 4. Vérifier le snapshot du plan après transformation (le plan et ses
  //    sous-objets ne doivent pas avoir été mutés).
  assertEqual(JSON.stringify(plan), snapPlan, 'le plan transformé ne doit pas être muté');

  // 5. track et harmonicContext inchangés.
  assertEqual(JSON.stringify(fixture.track), snapTrack, 'track ne doit pas être muté');
  assertEqual(JSON.stringify(fixture.harmonicContext), snapCtx, 'harmonicContext ne doit pas être muté');

  // Double appel pour s'assurer de la pureté (idempotence).
  mapHarmonizationPlanToViewModel(plan, { track: fixture.track, harmonicContext: fixture.harmonicContext });
  assertEqual(JSON.stringify(plan), snapPlan, 'le plan reste non muté après un second appel');
});

runTest('T11 — aucun champ interdit envoyé au moteur (sanitarisation)', () => {
  const fixture = buildDemoFixture();
  const sanitized = sanitizeHarmonizationInput({
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
    // Champs interdits qui ne doivent JAMAIS atteindre le moteur.
    style: 'jazz',
    reharmonization: 'x',
    settings: { foo: 1 },
    uiLabel: 'demo',
    meta: DEMO_FIXTURE_META,
  });
  assertDeepEqual(Object.keys(sanitized).sort(), ['harmonicContext', 'track'], 'seules track et harmonicContext doivent rester');
  // L'orchestrateur doit réussir malgré les champs interdits en entrée.
  const vm = buildReharmonizationViewModel({
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
    style: 'jazz',
    reharmonization: 'x',
    settings: { foo: 1 },
  });
  assertEqual(vm.status, 'success', 'les champs interdits ne doivent pas casser l’orchestrateur');
});

runTest('T12 — aucun appel à reharmonizer.js ni au moteur de voicing UI', () => {
  assertTrue(!/reharmonizer/.test(orchestratorSrc), "l'orchestrateur ne doit pas référencer reharmonizer");
  assertTrue(!/generate-voicing/.test(orchestratorSrc), "l'orchestrateur ne doit pas référencer generate-voicing");
  // Les voicings affichés proviennent du plan canonique (voicing-path-finder).
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };
  const plan = buildHarmonizationPlan(sanitizeHarmonizationInput(wrapper));
  const vm = buildReharmonizationViewModel(wrapper);
  for (let i = 0; i < plan.steps.length; i++) {
    assertDeepEqual(vm.steps[i].voicingMidiNotes, plan.steps[i].voicing.midiNotes, `voicing canonique ${i}`);
  }
});

runTest('T13 — contrat miniKeyboardForNotes().svg sur un véritable viewStep', () => {
  const fixture = buildDemoFixture();
  const vm = buildReharmonizationViewModel({ track: fixture.track, harmonicContext: fixture.harmonicContext });
  assertEqual(vm.status, 'success', 'viewModel success requis');
  // Prend les notes d’un véritable viewStep (voicing réel issu du plan).
  const step = vm.steps[0];
  assertTrue(Array.isArray(step.voicingMidiNotes) && step.voicingMidiNotes.length > 0, 'voicingMidiNotes non vide requis');
  const result = miniKeyboardForNotes(step.voicingMidiNotes.slice());
  assertTrue(result && typeof result === 'object', 'result doit être un objet');
  assertTrue(typeof result.svg === 'string', 'result.svg doit être une chaîne');
  assertTrue(result.svg.length > 0, 'result.svg doit être non vide');
  assertTrue(/<svg[\s>]/.test(result.svg), 'result.svg doit contenir un élément svg');
});

// ===========================================================================

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed === total) {
  console.log('INCRÉMENT 9 — LOT 1 : tests orchestrator OK');
} else {
  console.log('INCRÉMENT 9 — LOT 1 : ÉCHEC');
}
