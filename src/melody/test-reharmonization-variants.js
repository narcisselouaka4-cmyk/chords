// [OpenCode] — 2026-08-24 — Tests des variantes de réharmonisation.
// Exécutable : node src/melody/test-reharmonization-variants.js

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from './harmonic-context.js';
import { buildReharmonizationVariants } from './reharmonization-variants.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ ' + msg); }
}

function buildR1Wrapper() {
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
  return { track, harmonicContext: ctx };
}

// V1 : 3 variantes sur R1, une recommandée
{
  const wrapper = buildR1Wrapper();
  const { variants, recommendedId } = buildReharmonizationVariants(wrapper);
  assert(variants.length === 3, 'R1 : 3 variantes générées');
  assert(variants.some((v) => v.id === 'faithful'), 'variante faithful présente');
  assert(variants.some((v) => v.id === 'gospel'), 'variante gospel présente');
  assert(variants.some((v) => v.id === 'tense'), 'variante tense présente');
  assert(variants.some((v) => v.id === recommendedId && v.recommended === true), 'une variante recommandée');
  assert(variants.filter((v) => v.recommended).length === 1, 'exactement une variante recommandée');
}

// V2 : chaque variante a un plan, un validationReport, un label et une description
{
  const wrapper = buildR1Wrapper();
  const { variants } = buildReharmonizationVariants(wrapper);
  for (const v of variants) {
    assert(typeof v.id === 'string' && v.id.length > 0, `variante ${v.id} : id défini`);
    assert(typeof v.label === 'string' && v.label.length > 0, `variante ${v.id} : label défini`);
    assert(typeof v.description === 'string', `variante ${v.id} : description définie`);
    assert(v.plan && Array.isArray(v.plan.steps) && v.plan.steps.length > 0, `variante ${v.id} : plan avec steps`);
    assert(v.validationReport && v.validationReport.maxScore === 4, `variante ${v.id} : validationReport`);
  }
}

// V3 : variante faithful n'utilise aucune technique Gospel
{
  const wrapper = buildR1Wrapper();
  const { variants } = buildReharmonizationVariants(wrapper);
  const faithful = variants.find((v) => v.id === 'faithful');
  assert(faithful.plan.techniqueReport.used.length === 0, 'faithful : aucune technique Gospel utilisée');
}

// V4 : variante gospel utilise seulement des techniques structurelles
{
  const wrapper = buildR1Wrapper();
  const { variants } = buildReharmonizationVariants(wrapper);
  const gospel = variants.find((v) => v.id === 'gospel');
  for (const used of gospel.plan.techniqueReport.used) {
    const src = gospel.plan.steps[used.stepIndex].candidate.source;
    assert(['gospel-add9', 'gospel-add6', 'gospel-sus2'].includes(src), `gospel : technique structurelle à step ${used.stepIndex} (src=${src})`);
  }
}

// V5 : variante tendue peut contenir des passages (pas garanti sur R1, mais la structure le permet)
{
  const wrapper = buildR1Wrapper();
  const { variants } = buildReharmonizationVariants(wrapper);
  const tense = variants.find((v) => v.id === 'tense');
  // Au minimum, la variante tendue contient les mêmes candidats que gospel + passages possibles.
  assert(tense.plan.steps.length === wrapper.harmonicContext.anchors.length, 'tense : autant de steps que d\'ancres');
}

// V6 : wrapper invalide → TypeError
{
  let threw = false;
  try {
    buildReharmonizationVariants(null);
  } catch (err) {
    threw = err instanceof TypeError;
  }
  assert(threw, 'wrapper null : TypeError');
}

// V7 : la variante recommandée a le meilleur score de validité
{
  const wrapper = buildR1Wrapper();
  const { variants, recommendedId } = buildReharmonizationVariants(wrapper);
  const recommended = variants.find((v) => v.id === recommendedId);
  const maxScore = Math.max(...variants.map((v) => v.validationReport.score));
  assert(recommended.validationReport.score === maxScore, 'recommandée = score de validité max');
}

console.log(`\n${passed} tests réussis, ${failed} échoués (sur ${passed + failed})`);
if (failed > 0) process.exit(1);