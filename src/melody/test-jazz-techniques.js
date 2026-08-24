// [OpenCode] — 2026-08-25 — EXP-031 Tâche 1 : tests bibliothèque Jazz V1.
// Exécutable : node src/melody/test-jazz-techniques.js
//
// Valide que chaque technique Jazz V1 se déclenche dans les conditions
// attendues et ne se déclenche pas hors conditions. Vérifie la traçabilité
// (identifyJazzTechnique) et les voicings idiomatiques (Drop 2, Rootless).

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from './harmonic-context.js';
import {
  buildJazzCandidatesForAnchor,
  identifyJazzTechnique,
  listJazzTechniques,
  JAZZ_TECHNIQUES,
} from './jazz-techniques.js';
import {
  generateJazzVoicings,
  identifyJazzVoicingTechnique,
  JAZZ_VOICING_TECHNIQUES,
} from './jazz-voicings.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ ' + msg); }
}

function buildTrack(melodyMidis, name = 'test') {
  let t = 0;
  const capture = createMidiCapture({ getTime: () => t });
  for (const midi of melodyMidis) {
    capture.noteOn(midi, 0.8, 0, name); t += 500; capture.noteOff(midi, 0, 0, name); t += 100;
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: name }, { name, sopranoPolicy: 'melody-must-be-top' });
}

function buildCtx(track, key = 'C') {
  const tonalContext = setManualTonalContext(createTonalContext(), key);
  let ctx = createHarmonicContext(track, { tonalContext });
  for (let i = 0; i < track.events.length; i++) {
    ctx = addHarmonicAnchor(ctx, {
      melodyEventId: track.events[i].id,
      relativeTime: track.events[i].startedAt,
      type: i === 0 ? 'start' : i === track.events.length - 1 ? 'end' : 'user',
      harmonizationPolicy: 'automatic',
    });
  }
  return ctx;
}

function sourcesOf(candidates) {
  return candidates.map((c) => c.source);
}

// J1 : catalogue exposé et stable
assert(JAZZ_TECHNIQUES.length === 1, 'catalogue techniques contient 1 technique V1');
assert(listJazzTechniques().length === 1, 'listJazzTechniques retourne 1 entrée');
assert(JAZZ_TECHNIQUES.every((t) => t.id && t.name && t.description && t.source), 'chaque technique a id/name/description/source');

// J2 : catalogue voicings Jazz
assert(JAZZ_VOICING_TECHNIQUES.length === 2, 'catalogue voicings contient 2 techniques (drop2, rootless)');
assert(JAZZ_VOICING_TECHNIQUES.some((t) => t.id === 'jazz-drop2'), 'jazz-drop2 présent');
assert(JAZZ_VOICING_TECHNIQUES.some((t) => t.id === 'jazz-rootless'), 'jazz-rootless présent');

// J3 : substitution tritonique se déclenche quand la mélodie est compatible avec la substitute
{
  // En Do majeur, G7 (V) → substitute Db7 (triton). Db7 = Db F Ab Cb.
  // Mélodie F4 (pc 5) = 3e majeure de Db7 (intervalle 4) → compatible.
  const track = buildTrack([65, 60], 'tritone'); // F4 puis C4
  const ctx = buildCtx(track, 'C');
  const cands = buildJazzCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(sourcesOf(cands).includes('jazz-tritone-sub'), 'tritone sub présent quand mélodie compatible (F4 sur Db7)');
  const tritone = cands.find((c) => c.source === 'jazz-tritone-sub');
  assert(tritone && tritone.rootPitchClass === 1, 'tritone sub root = Db (pc 1)');
  assert(tritone && tritone.tonalRelation.tritoneOf === 7, 'tritone sub = sub de G (pc 7)');
  assert(tritone && tritone.tonalRelation.resolvesTo === 0, 'tritone sub résout vers C (pc 0)');
  assert(tritone && tritone.melodyCompatibility.category === 'chord-tone', 'tritone sub : mélodie = chord-tone');
}

// J4 : substitution tritonique ne se déclenche pas sur la dernière ancre (pas de cible)
{
  const track = buildTrack([65], 'tritone-last'); // F4 seule = dernière ancre
  const ctx = buildCtx(track, 'C');
  const cands = buildJazzCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(!sourcesOf(cands).includes('jazz-tritone-sub'), 'tritone sub absent sur la dernière ancre');
}

// J5 : substitution tritonique ne se déclenche pas pour une cible quand la mélodie n'est pas compatible avec la substitute de cette cible
{
  // En Do majeur, G7 (V→I) substitute = Db7 (pc 1). Mélodie C (pc 0) sur Db7 :
  // intervalle (0 - 1 + 12) % 12 = 11 (7e majeure) → NON supporté.
  // Donc aucun tritone-sub avec root=Db (pc 1) ne doit être produit.
  // (D'autres substitutes vers d'autres cibles peuvent exister, c'est OK.)
  const track = buildTrack([72, 60], 'no-tritone'); // C5 (pc 0) puis C4
  const ctx = buildCtx(track, 'C');
  const cands = buildJazzCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  const tritoneSubs = cands.filter((c) => c.source === 'jazz-tritone-sub');
  const dbSubs = tritoneSubs.filter((c) => c.rootPitchClass === 1);
  assert(dbSubs.length === 0, 'tritone sub vers I (Db7) absent quand mélodie non compatible (C5 = 7e majeure de Db7)');
}

// J6 : traçabilité — identifyJazzTechnique
{
  const track = buildTrack([65, 60], 'trace');
  const ctx = buildCtx(track, 'C');
  const cands = buildJazzCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  for (const c of cands) {
    const tech = identifyJazzTechnique(c);
    if (c.source.startsWith('jazz-')) {
      assert(tech !== null, `identifyJazzTechnique retourne la technique pour source=${c.source}`);
      assert(tech.source === c.source, `identifyJazzTechnique : source cohérente pour ${c.source}`);
    } else {
      assert(tech === null, `identifyJazzTechnique retourne null pour source non jazz ${c.source}`);
    }
  }
}

// J7 : tous les candidats Jazz sont valides (compatibilité mélodique OK)
{
  const track = buildTrack([65, 67, 69, 65, 64, 60, 60], 'valid-all');
  const ctx = buildCtx(track, 'C');
  for (let i = 0; i < ctx.anchors.length; i++) {
    const cands = buildJazzCandidatesForAnchor({ anchor: ctx.anchors[i], track, harmonicContext: ctx });
    for (const c of cands) {
      assert(c.validation.valid, `candidat Jazz valide à l'ancre ${i} (source=${c.source})`);
    }
  }
}

// J8 : voicings Jazz — Drop 2 et Rootless produits pour un accord 4 notes
{
  const track = buildTrack([65, 60], 'voicings');
  const ctx = buildCtx(track, 'C');
  const cands = buildJazzCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  // Prend n'importe quel candidat 4 notes pour tester les voicings
  const anyCand = cands.find((c) => c.pitchClasses && c.pitchClasses.length >= 4) || cands[0];
  if (anyCand) {
    const voicings = generateJazzVoicings(anyCand);
    assert(voicings.length > 0, 'voicings Jazz produits pour un candidat 4 notes');
    const techniqueIds = new Set(voicings.map((v) => v.techniqueId));
    assert(techniqueIds.has('jazz-drop2') || techniqueIds.has('jazz-rootless'), 'voicings Jazz contiennent drop2 ou rootless');
    assert(!techniqueIds.has('gospel-cluster'), 'voicings Jazz ne contiennent pas gospel-cluster');
    for (const v of voicings) {
      const tech = identifyJazzVoicingTechnique(v);
      assert(tech !== null, `identifyJazzVoicingTechnique pour ${v.techniqueId}`);
      assert(v.techniqueId.startsWith('jazz-'), `voicing ${v.techniqueId} a un id Jazz`);
    }
  }
}

// J9 : voicings Jazz ne contiennent PAS de cluster (technique Gospel spécifique)
{
  const track = buildTrack([65, 60], 'no-cluster');
  const ctx = buildCtx(track, 'C');
  const cands = buildJazzCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  const anyCand = cands[0];
  if (anyCand) {
    const voicings = generateJazzVoicings(anyCand);
    assert(voicings.every((v) => v.techniqueId !== 'gospel-cluster'), 'aucun voicing gospel-cluster dans voicings Jazz');
    assert(voicings.every((v) => v.techniqueId !== 'gospel-drop2'), 'aucun voicing gospel-drop2 dans voicings Jazz (re-étiqueté jazz-drop2)');
  }
}

console.log(`\n${passed} tests réussis, ${failed} échoués (sur ${passed + failed})`);
if (failed > 0) process.exit(1);