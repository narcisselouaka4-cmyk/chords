// [OpenCode] — 2026-08-24 — Tests du validateur de réharmonisation.
// Exécutable : node src/melody/test-reharmonization-validator.js
//
// Valide les 4 critères sur un plan R1 connu (4/4 attendu) et sur des cas
// adversaires (plan dégradé artificiellement pour vérifier que chaque critère
// peut échouer indépendamment).

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from './harmonic-context.js';
import { buildGospelHarmonizationPlan } from './gospel-harmonization-planner.js';
import { validateReharmonizationPlan } from './reharmonization-validator.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ ' + msg); }
}

function buildR1() {
  const progression = ['C', 'F', 'G', 'Am', 'Dm', 'G', 'C'];
  const melodyAll = [64, 65, 64, 62, 64, 60, 60];
  let t = 0;
  const capture = createMidiCapture({ getTime: () => t });
  for (const midi of melodyAll) {
    capture.noteOn(midi, 0.8, 0, 'r1'); t += 1000; capture.noteOff(midi, 0, 0, 'r1'); t += 100;
  }
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'r1' }, { name: 'R1', sopranoPolicy: 'melody-must-be-top' });
  const tonalContext = setManualTonalContext(createTonalContext(), 'C');
  let ctx = createHarmonicContext(track, { tonalContext });
  for (let i = 0; i < track.events.length; i++) {
    ctx = addHarmonicAnchor(ctx, { melodyEventId: track.events[i].id, relativeTime: track.events[i].startedAt, type: i === 0 ? 'start' : i === track.events.length - 1 ? 'end' : 'user', harmonizationPolicy: 'automatic', originalChord: progression[i] });
  }
  return buildGospelHarmonizationPlan({ track, harmonicContext: ctx });
}

// V1 : R1 valide → 4/4
{
  const plan = buildR1();
  const report = validateReharmonizationPlan(plan);
  assert(report.score === 4, 'R1 : score 4/4');
  assert(report.maxScore === 4, 'maxScore = 4');
  assert(report.ratio === 1, 'ratio = 1.0');
  assert(report.criteria.length === 4, '4 critères');
  assert(report.criteria.every((c) => c.satisfied), 'R1 : tous critères OK');
  assert(report.criteria[0].criterionId === 'melody-audible', 'critère 1 = melody-audible');
  assert(report.criteria[1].criterionId === 'passage-resolution', 'critère 2 = passage-resolution');
  assert(report.criteria[2].criterionId === 'no-parallel-motion', 'critère 3 = no-parallel-motion');
  assert(report.criteria[3].criterionId === 'traceability', 'critère 4 = traceability');
}

// V2 : plan sans track → critère 1 non applicable (OK par défaut)
{
  const plan = buildR1();
  const planNoTrack = { ...plan, track: null };
  const report = validateReharmonizationPlan(planNoTrack);
  assert(report.criteria[0].satisfied === true, 'mélodie audible : non applicable sans track = OK');
}

// V3 : plan avec quintes parallèles artificielles → critère 3 KO
{
  const plan = buildR1();
  const planDegraded = {
    ...plan,
    voicingPathResult: { ...plan.voicingPathResult, parallelFifths: 2, parallelOctaves: 1 },
  };
  const report = validateReharmonizationPlan(planDegraded);
  assert(report.criteria[2].satisfied === false, 'quintes parallèles : KO quand > 0');
  assert(report.score === 3, 'score = 3/4 avec parallèles');
}

// V4 : plan avec source non justifiable → critère 4 KO
{
  const plan = buildR1();
  const badCandidate = { ...plan.steps[0].candidate, source: 'unknown-source' };
  const badStep = { ...plan.steps[0], candidate: badCandidate };
  const planDegraded = { ...plan, steps: [badStep, ...plan.steps.slice(1)] };
  const report = validateReharmonizationPlan(planDegraded);
  assert(report.criteria[3].satisfied === false, 'traçabilité : KO avec source inconnue');
  assert(report.criteria[3].failingStepIndices.includes(0), 'step 0 signalé');
}

// V5 : passage non résolu (dernier step est un passage) → critère 2 KO
{
  const plan = buildR1();
  const passageCandidate = { ...plan.steps[plan.steps.length - 1].candidate, source: 'secondary-dominant' };
  const passageStep = { ...plan.steps[plan.steps.length - 1], candidate: passageCandidate };
  const planDegraded = { ...plan, steps: [...plan.steps.slice(0, -1), passageStep] };
  const report = validateReharmonizationPlan(planDegraded);
  assert(report.criteria[1].satisfied === false, 'passage non résolu sur dernier step : KO');
}

// V6 : plan invalide → score 0
{
  const report = validateReharmonizationPlan(null);
  assert(report.score === 0, 'plan null : score 0');
  assert(report.maxScore === 4, 'plan null : maxScore 4');
}

console.log(`\n${passed} tests réussis, ${failed} échoués (sur ${passed + failed})`);
if (failed > 0) process.exit(1);