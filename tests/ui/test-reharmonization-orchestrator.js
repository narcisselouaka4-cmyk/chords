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
} from '../../src/ui/reharmonization-orchestrator.js';
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

runTest('T5 — alternatives issues des candidateLayers réelles', () => {
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };
  const plan = buildHarmonizationPlan(sanitizeHarmonizationInput(wrapper));
  const vm = buildReharmonizationViewModel(wrapper);
  const tc = fixture.harmonicContext.tonalContext;
  for (let i = 0; i < plan.steps.length; i++) {
    const layer = plan.steps[i].candidateLayer;
    assertEqual(vm.steps[i].alternatives.length, layer.length, `nb alternatives ${i}`);
    for (let j = 0; j < layer.length; j++) {
      assertEqual(vm.steps[i].alternatives[j].id, layer[j].id, `alt id ${i}.${j}`);
      assertEqual(vm.steps[i].alternatives[j].symbol, expectedChordSymbol(layer[j], tc), `alt symbol ${i}.${j}`);
    }
  }
});

runTest('T6 — déterminisme de deux exécutions', () => {
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };
  const vm1 = buildReharmonizationViewModel(wrapper);
  const vm2 = buildReharmonizationViewModel(wrapper);
  assertDeepEqual(vm1, vm2, 'deux exécutions doivent produire un viewModel identique');
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

runTest('T10 — absence de mutation des entrées et du plan', () => {
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };
  const snapTrack = JSON.stringify(fixture.track);
  const snapCtx = JSON.stringify(fixture.harmonicContext);

  const plan = buildHarmonizationPlan(sanitizeHarmonizationInput(wrapper));
  const snapPlan = JSON.stringify(plan);

  // L'orchestrateur ne doit muter ni les entrées ni le plan.
  buildReharmonizationViewModel(wrapper);
  buildReharmonizationViewModel(wrapper);

  assertEqual(JSON.stringify(fixture.track), snapTrack, 'track ne doit pas être muté');
  assertEqual(JSON.stringify(fixture.harmonicContext), snapCtx, 'harmonicContext ne doit pas être muté');
  assertEqual(JSON.stringify(plan), snapPlan, 'le plan ne doit pas être muté');
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

// ===========================================================================

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed === total) {
  console.log('INCRÉMENT 9 — LOT 1 : tests orchestrator OK');
} else {
  console.log('INCRÉMENT 9 — LOT 1 : ÉCHEC');
}