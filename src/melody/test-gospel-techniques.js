// [OpenCode] — 2026-08-24 — Tests de la bibliothèque de techniques Gospel.
// Exécutable : node src/melody/test-gospel-techniques.js
//
// Valide que chaque technique se déclenche dans les conditions attendues et
// ne se déclenche pas hors conditions. Vérifie la traçabilité (identifyGospelTechnique).

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from './harmonic-context.js';
import {
  buildGospelCandidatesForAnchor,
  identifyGospelTechnique,
  listGospelTechniques,
  GOSPEL_TECHNIQUES,
} from './gospel-techniques.js';

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
    capture.noteOn(midi, 0.8, 0, name);
    t += 500;
    capture.noteOff(midi, 0, 0, name);
    t += 100;
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: name }, { name, sopranoPolicy: 'melody-must-be-top' });
}

function buildCtx(track, key = 'C') {
  const tonalContext = setManualTonalContext(createTonalContext(), key);
  let ctx = createHarmonicContext(track, { tonalContext });
  for (let i = 0; i < track.events.length; i++) {
    const type = i === 0 ? 'start' : i === track.events.length - 1 ? 'end' : 'user';
    ctx = addHarmonicAnchor(ctx, {
      melodyEventId: track.events[i].id,
      relativeTime: track.events[i].startedAt,
      type,
      harmonizationPolicy: 'automatic',
    });
  }
  return ctx;
}

function sourcesOf(candidates) {
  return candidates.map((c) => c.source);
}

// T1 : catalogue exposé et stable
assert(GOSPEL_TECHNIQUES.length === 5, 'catalogue contient 5 techniques');
assert(listGospelTechniques().length === 5, 'listGospelTechniques retourne 5 entrées');
assert(GOSPEL_TECHNIQUES.every((t) => t.id && t.name && t.description && t.source), 'chaque technique a id/name/description/source');

// T2 : add9 se déclenche quand la mélodie est la 9e
{
  // En Do majeur, Dm7 a pour 9e : E (pc 4). Mélodie E4 sur ancre.
  const track = buildTrack([64, 60], 'add9'); // E4 puis C4
  const ctx = buildCtx(track, 'C');
  const cands = buildGospelCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(sourcesOf(cands).includes('gospel-add9'), 'add9 présent quand mélodie = 9e (E4 sur Dm7)');
  const add9 = cands.find((c) => c.source === 'gospel-add9');
  assert(add9 && add9.melodyCompatibility.category === 'chord-tone', 'add9 : mélodie est chord-tone');
}

// T3 : add9 ne se déclenche pas quand la mélodie n'est pas la 9e
{
  // Mélodie C4 (pc 0) sur Do majeur : pas de 9e (E = pc 4 requis).
  const track = buildTrack([60, 60], 'no-add9');
  const ctx = buildCtx(track, 'C');
  const cands = buildGospelCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(!sourcesOf(cands).includes('gospel-add9'), 'add9 absent quand mélodie ≠ 9e');
}

// T4 : add6 se déclenche quand la mélodie est la 6e
{
  // En Do majeur, C6 a pour 6e : A (pc 9). Mélodie A4.
  const track = buildTrack([69, 60], 'add6'); // A4 puis C4
  const ctx = buildCtx(track, 'C');
  const cands = buildGospelCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(sourcesOf(cands).includes('gospel-add6'), 'add6 présent quand mélodie = 6e (A4 sur C6)');
}

// T5 : 7b9 se déclenche quand la mélodie est à b9 de la dominante
{
  // En Do majeur, G7b9 = G B D F Ab. b9 = Ab (pc 8). Mélodie Ab (MIDI 68).
  const track = buildTrack([68, 60], '7b9'); // Ab4 puis C4
  const ctx = buildCtx(track, 'C');
  const cands = buildGospelCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(sourcesOf(cands).includes('gospel-passage-7b9'), '7b9 présent quand mélodie = b9 de V');
  const c = cands.find((x) => x.source === 'gospel-passage-7b9');
  assert(c && c.melodyCompatibility.category === 'chord-tone', '7b9 : mélodie chord-tone (b9 incluse)');
}

// T6 : 7b9 ne se déclenche pas sur la dernière ancre (pas de cible de résolution)
{
  // Mélodie Ab avec une seule ancre = dernière ancre.
  const track = buildTrack([68], '7b9-last');
  const ctx = buildCtx(track, 'C');
  const cands = buildGospelCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(!sourcesOf(cands).includes('gospel-passage-7b9'), '7b9 absent sur la dernière ancre (pas de cible)');
}

// T7 : sus2 se déclenche quand la mélodie est la 2e
{
  // En Do majeur, D9sus4 a pour 2e : E (pc 4). Mélodie E4.
  const track = buildTrack([64, 60], 'sus2');
  const ctx = buildCtx(track, 'C');
  const cands = buildGospelCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(sourcesOf(cands).includes('gospel-sus2'), 'sus2 présent quand mélodie = 2e');
}

// T8 : traçabilité — identifyGospelTechnique
{
  const track = buildTrack([64, 60], 'trace');
  const ctx = buildCtx(track, 'C');
  const cands = buildGospelCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  for (const c of cands) {
    const tech = identifyGospelTechnique(c);
    if (c.source.startsWith('gospel-')) {
      assert(tech !== null, `identifyGospelTechnique retourne la technique pour source=${c.source}`);
      assert(tech.source === c.source, `identifyGospelTechnique : source cohérente pour ${c.source}`);
    } else {
      assert(tech === null, `identifyGospelTechnique retourne null pour source non gospel ${c.source}`);
    }
  }
}

// T9 : tous les candidats Gospel sont valides (compatibilité mélodique OK)
{
  const track = buildTrack([64, 65, 64, 62, 64, 60, 60], 'valid-all');
  const ctx = buildCtx(track, 'C');
  for (let i = 0; i < ctx.anchors.length; i++) {
    const cands = buildGospelCandidatesForAnchor({ anchor: ctx.anchors[i], track, harmonicContext: ctx });
    for (const c of cands) {
      assert(c.validation.valid, `candidat Gospel valide à l'ancre ${i} (source=${c.source})`);
    }
  }
}

console.log(`\n${passed} tests réussis, ${failed} échoués (sur ${passed + failed})`);
if (failed > 0) process.exit(1);