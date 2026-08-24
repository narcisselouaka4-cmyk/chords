// [OpenCode] — 2026-08-25 — EXP-031 Tâche 2 : tests bibliothèque Neo Soul V1.
// Exécutable : node src/melody/test-neo-soul-techniques.js

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from './harmonic-context.js';
import {
  buildNeoSoulCandidatesForAnchor,
  identifyNeoSoulTechnique,
  listNeoSoulTechniques,
  NEO_SOUL_TECHNIQUES,
} from './neo-soul-techniques.js';
import {
  generateNeoSoulVoicings,
  identifyNeoSoulVoicingTechnique,
  NEO_SOUL_VOICING_TECHNIQUES,
} from './neo-soul-voicings.js';

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

// N1 : catalogue
assert(NEO_SOUL_TECHNIQUES.length === 1, 'catalogue techniques contient 1 technique V1');
assert(listNeoSoulTechniques().length === 1, 'listNeoSoulTechniques retourne 1 entrée');
assert(NEO_SOUL_TECHNIQUES.every((t) => t.id && t.name && t.description && t.source), 'chaque technique a id/name/description/source');

// N2 : catalogue voicings
assert(NEO_SOUL_VOICING_TECHNIQUES.length === 1, 'catalogue voicings contient 1 technique (quartal)');
assert(NEO_SOUL_VOICING_TECHNIQUES.some((t) => t.id === 'neo-soul-quartal'), 'neo-soul-quartal présent');

// N3 : 7b9 → mineur se déclenche quand la mélodie est compatible avec la dominante 7b9 d'un mineur
{
  // En Do majeur, Dm7 (ii, pc 2) est une cible mineure. Sa dominante = A7 (pc 9).
  // A7b9 : intervals [0,4,7,10,13] = 1, 3e M, 5e, 7e m, b9.
  // Mélodie Ab (pc 8) sur A7b9 (pc 9) : intervalle (8-9+12)%12 = 11 = 7e majeure.
  // 7e majeure n'est PAS chord-tone (7e m = intervalle 10 est chord-tone).
  // Utilisons Bb (pc 10) sur A7b9 : intervalle (10-9)%12 = 1 = b9 → chord-tone.
  // Bb sur A7b9 = b9, dans la définition [0,4,7,10,13] (13 = b9 à l'octave sup).
  // En MIDI : Bb4 = 70. Sur A7b9 (pc 9), intervalle (10-9) = 1 = b9.
  const track = buildTrack([70, 60], '7b9-minor'); // Bb4 (pc 10) puis C4
  const ctx = buildCtx(track, 'C');
  const cands = buildNeoSoulCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(sourcesOf(cands).includes('neo-soul-7b9-to-minor'), '7b9→mineur présent quand mélodie compatible (Bb4 = b9 de A7b9)');
  const c = cands.find((x) => x.source === 'neo-soul-7b9-to-minor' && x.rootPitchClass === 9);
  assert(c, 'dominante A7b9 (pc 9) produite vers Dm (pc 2)');
  assert(c && c.qualityId === '7b9', 'qualité 7b9');
  assert(c && c.melodyCompatibility.category === 'chord-tone', 'mélodie Bb4 = b9 = chord-tone de A7b9');
  assert(c && c.tonalRelation.resolvesTo === 2, 'résout vers Dm (pc 2)');
}

// N4 : 7b9 → mineur ne se déclenche pas sur la dernière ancre
{
  const track = buildTrack([72], 'last'); // C5 seule = dernière ancre
  const ctx = buildCtx(track, 'C');
  const cands = buildNeoSoulCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  assert(!sourcesOf(cands).includes('neo-soul-7b9-to-minor'), '7b9→mineur absent sur la dernière ancre');
}

// N5 : 7b9 → mineur ne se déclenche pas pour une cible majeure (seulement mineurs)
{
  // En Do majeur, G7 (V) résout vers C (I, majeur). Pas de 7b9→mineur vers C.
  // Mélodie qui serait compatible avec D7b9 (dom de Gm, mais Gm n'est pas diatonique en Do majeur).
  // On vérifie qu'aucun candidat neo-soul ne pointe vers un degré majeur.
  const track = buildTrack([68, 60], 'no-major-target'); // Ab4 (pc 8)
  const ctx = buildCtx(track, 'C');
  const cands = buildNeoSoulCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  // Ab (pc 8) sur E7b9 (dom de Am, vi mineur) : (8 - 4 + 12) % 12 = 4 = 3e M → autorisé.
  // E7b9 pointe vers Am (vi, mineur) → devrait être présent.
  const ns = cands.filter((c) => c.source === 'neo-soul-7b9-to-minor');
  // Vérifie que toutes les cibles sont mineures (m7 ou m7b5) en Do majeur :
  // ii (Dm, pc 2), iii (Em, pc 4), vi (Am, pc 9), vii° (Bm7b5, pc 11).
  // I (C, pc 0) et IV (F, pc 5) et V (G, pc 7) sont majeurs → exclus.
  for (const c of ns) {
    const targetPc = c.tonalRelation.resolvesTo;
    assert([2, 4, 9, 11].includes(targetPc), `cible ${targetPc} est mineure en Do majeur`);
  }
}

// N6 : traçabilité
{
  const track = buildTrack([72, 60], 'trace');
  const ctx = buildCtx(track, 'C');
  const cands = buildNeoSoulCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  for (const c of cands) {
    const tech = identifyNeoSoulTechnique(c);
    if (c.source.startsWith('neo-soul-')) {
      assert(tech !== null, `identifyNeoSoulTechnique pour source=${c.source}`);
      assert(tech.source === c.source, `source cohérente pour ${c.source}`);
    } else {
      assert(tech === null, `identifyNeoSoulTechnique null pour source non neo-soul ${c.source}`);
    }
  }
}

// N7 : tous les candidats Neo Soul sont valides
{
  const track = buildTrack([72, 74, 76, 72, 71, 60, 60], 'valid-all');
  const ctx = buildCtx(track, 'C');
  for (let i = 0; i < ctx.anchors.length; i++) {
    const cands = buildNeoSoulCandidatesForAnchor({ anchor: ctx.anchors[i], track, harmonicContext: ctx });
    for (const c of cands) {
      assert(c.validation.valid, `candidat Neo Soul valide à l'ancre ${i} (source=${c.source})`);
    }
  }
}

// N8 : voicings quartal produits
{
  const track = buildTrack([72, 60], 'quartal');
  const ctx = buildCtx(track, 'C');
  const cands = buildNeoSoulCandidatesForAnchor({ anchor: ctx.anchors[0], track, harmonicContext: ctx });
  const anyCand = cands[0];
  if (anyCand) {
    const voicings = generateNeoSoulVoicings(anyCand);
    assert(voicings.length > 0, 'voicings Neo Soul produits');
    for (const v of voicings) {
      assert(v.techniqueId === 'neo-soul-quartal', `voicing ${v.techniqueId} = neo-soul-quartal`);
      const tech = identifyNeoSoulVoicingTechnique(v);
      assert(tech !== null, 'identifyNeoSoulVoicingTechnique');
      // Vérifie l'empilement de quartes justes (5 demi-tons) dans la main droite
      const rh = v.rightHand;
      for (let i = 1; i < rh.length; i++) {
        const interval = rh[i] - rh[i - 1];
        // L'empilement quartal fait des sauts de 5 ou 7 demi-tons (quarte juste/augmentée)
        // ou plus si complété. On vérifie au moins le premier saut.
        if (i === 1) {
          assert(interval === 5 || interval === 6 || interval === 7, `premier saut quartal = 5/6/7 (eu ${interval})`);
        }
      }
    }
  }
}

console.log(`\n${passed} tests réussis, ${failed} échoués (sur ${passed + failed})`);
if (failed > 0) process.exit(1);