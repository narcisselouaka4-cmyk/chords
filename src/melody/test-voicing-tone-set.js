// [Claude] — 2026-08-25 — EXP-034 : tests de l'inclusion des tensions
// disponibles dans le voicing.
//
// Ce que ces tests ferment :
//   · la règle ne doit se déclencher QUE sur `available-tension` — jamais sur
//     une note que la théorie de l'accord ne sanctionne pas ;
//   · l'inclusion doit être garantie, pas seulement permise : si la tension
//     entre dans l'ensemble de tons, elle est dans TOUS les voicings produits ;
//   · enrichir ne doit jamais rendre un accord injouable (propriété balayée
//     sur tout le vocabulaire × les douze notes mélodiques) ;
//   · les techniques de style partagent le même ensemble de tons, sinon une
//     tension entrée au canonique ferait disparaître la forme idiomatique.
//
// Usage : node src/melody/test-voicing-tone-set.js

import {
  availableMelodyTension,
  withMelodyTension,
  MAX_VOICING_TONES,
} from './voicing-tone-set.js';
import { generatePlayableChordVoicings } from './voicing-path-finder.js';
import { generateGospelVoicings } from './gospel-voicings.js';
import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from './harmonic-context.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); }
}
function runTest(name, fn) {
  console.log(`\n📋 ${name}`);
  try { fn(); } catch (err) { failed++; console.error(`  ✗ exception : ${err.message}`); }
}

const pc = (n) => ((n % 12) + 12) % 12;

/** Candidat minimal suffisant pour la règle (pas pour le voicing). */
function fakeCandidate(pitchClasses, category, melodyPitchClass) {
  return { pitchClasses, melodyCompatibility: { category, melodyPitchClass } };
}

/**
 * Construit de vrais candidats via le générateur canonique, pour une note
 * mélodique donnée en Do majeur. Renvoie tous les candidats de l'ancre.
 */
function realCandidatesFor(melodyMidi, key = 'C') {
  let t = 0;
  const capture = createMidiCapture({ getTime: () => t });
  capture.noteOn(melodyMidi, 0.8, 0, 'x'); t += 1000; capture.noteOff(melodyMidi, 0, 0, 'x');
  capture.finalize();
  const track = createMelodyTrack(
    { notes: capture.getNotes(), sourceCaptureId: 'x' },
    { name: 'x', sopranoPolicy: 'melody-must-be-top' },
  );
  const tonalContext = setManualTonalContext(createTonalContext(), key);
  let ctx = createHarmonicContext(track, { tonalContext });
  ctx = addHarmonicAnchor(ctx, {
    melodyEventId: track.events[0].id,
    relativeTime: track.events[0].startedAt,
    type: 'start',
    harmonizationPolicy: 'automatic',
  });
  const res = generateChordCandidatesForAnchor({
    anchor: ctx.anchors[0], track, harmonicContext: ctx,
  });
  return res.status === 'generated' ? res.candidates : [];
}

// ── A. La règle : ce qui déclenche et ce qui ne déclenche pas ──

runTest('A. La règle ne se déclenche que sur une tension disponible', () => {
  const g7 = [7, 11, 2, 5];
  assert(availableMelodyTension(fakeCandidate(g7, 'available-tension', 4)) === 4,
    'available-tension → la pitch class mélodique est retenue');
  assert(availableMelodyTension(fakeCandidate(g7, 'chord-tone', 11)) === null,
    'chord-tone → rien à ajouter, la note est déjà là');
  assert(availableMelodyTension(fakeCandidate(g7, 'suspension', 0)) === null,
    'suspension → refusée : une suspension change la fonction, pas la couleur');
  assert(availableMelodyTension(fakeCandidate(g7, 'non-chord-tone-allowed', 1)) === null,
    'non-chord-tone-allowed → refusée : la théorie de l accord ne la sanctionne pas');
  assert(availableMelodyTension(fakeCandidate(g7, 'incompatible', 1)) === null,
    'incompatible → refusée');
  assert(availableMelodyTension(fakeCandidate(g7, 'non-chord-tone-allowed', -1)) === null,
    'aucun événement mélodique (pc = -1) → rien');
  assert(availableMelodyTension(null) === null, 'candidat absent → rien, pas d exception');
  assert(availableMelodyTension({}) === null, 'candidat sans compatibilité → rien');
});

runTest('A. Une seule pitch class est ajoutée, et c est celle de la mélodie', () => {
  const r = withMelodyTension([7, 11, 2, 5], fakeCandidate([7, 11, 2, 5], 'available-tension', 4));
  assert(r.addedTensions.length === 1 && r.addedTensions[0] === 4,
    'exactement une tension, la 13e de G7 (mi)');
  assert(JSON.stringify(r.pitchClasses) === JSON.stringify([2, 4, 5, 7, 11]),
    `ensemble trié et dédoublonné : ${r.pitchClasses}`);
});

runTest('A. Une tension déjà présente n est pas dupliquée', () => {
  const r = withMelodyTension([0, 4, 7], fakeCandidate([0, 4, 7], 'available-tension', 4));
  assert(r.addedTensions.length === 0 && r.pitchClasses.length === 3,
    'la pitch class est déjà dans l ensemble : aucun ajout');
});

runTest('A. Le plafond de cardinalité fait renoncer, il ne déborde pas', () => {
  const six = [0, 2, 4, 7, 9, 10];
  const r = withMelodyTension(six, fakeCandidate(six, 'available-tension', 5));
  assert(r.addedTensions.length === 0, 'six pitch classes : la règle s abstient');
  assert(r.pitchClasses.length === MAX_VOICING_TONES,
    'l ensemble reste au plafond, jamais au-dessus');
  const five = [0, 2, 4, 7, 10];
  const r5 = withMelodyTension(five, fakeCandidate(five, 'available-tension', 5));
  assert(r5.addedTensions.length === 1 && r5.pitchClasses.length === 6,
    'cinq pitch classes : la sixième passe');
});

runTest('A. Les entrées ne sont pas mutées', () => {
  const base = [7, 11, 2, 5];
  const copy = base.slice();
  withMelodyTension(base, fakeCandidate(base, 'available-tension', 4));
  assert(JSON.stringify(base) === JSON.stringify(copy), 'le tableau source est intact');
});

// ── B. L'inclusion est garantie, pas seulement permise ──

runTest('B. La tension est dans TOUS les voicings produits, pas dans certains', () => {
  // Mi5 (76) en Do majeur : le degré V donne G7, dont mi est la 13e.
  const cands = realCandidatesFor(76);
  const g7 = cands.find((c) => c.qualityId === '7' && c.rootPitchClass === 7);
  assert(g7 !== undefined, 'le générateur produit bien un G7 pour mi5 en Do majeur');
  if (!g7) return;
  assert(g7.melodyCompatibility.category === 'available-tension',
    `mi est classé available-tension sur G7 (obtenu : ${g7.melodyCompatibility.category})`);
  const voicings = generatePlayableChordVoicings({ candidate: g7 });
  assert(voicings.length > 0, `${voicings.length} voicings produits`);
  const all = voicings.every((v) => v.midiNotes.map(pc).includes(4));
  assert(all, 'les voicings contiennent tous la 13e (mi)');
  const traced = voicings.every((v) => v.addedTensions.length === 1 && v.addedTensions[0] === 4);
  assert(traced, 'chaque voicing trace la tension ajoutée');
});

runTest('B. Une mélodie qui est note de l accord ne change rien', () => {
  // Si5 (83) en Do majeur : si est la tierce de G7, donc chord-tone.
  const cands = realCandidatesFor(83);
  const g7 = cands.find((c) => c.qualityId === '7' && c.rootPitchClass === 7);
  if (!g7) { assert(false, 'G7 attendu pour si5'); return; }
  assert(g7.melodyCompatibility.category === 'chord-tone', 'si est une note de G7');
  const voicings = generatePlayableChordVoicings({ candidate: g7 });
  const pcsUsed = new Set(voicings.flatMap((v) => v.midiNotes.map(pc)));
  assert(pcsUsed.size === 4, `quatre pitch classes seulement : ${[...pcsUsed].sort()}`);
  assert(voicings.every((v) => v.addedTensions.length === 0),
    'aucune tension tracée : le cas courant est inchangé');
});

// ── C. Enrichir ne rend jamais un accord injouable ──

runTest('C. Balayage : aucun candidat jouable ne devient injouable', () => {
  let tested = 0;
  let enriched = 0;
  let broken = 0;
  for (let midi = 60; midi <= 71; midi++) {
    for (const key of ['C', 'F', 'Am']) {
      for (const cand of realCandidatesFor(midi, key)) {
        tested++;
        if (cand.melodyCompatibility.category === 'available-tension') enriched++;
        try {
          const vs = generatePlayableChordVoicings({ candidate: cand });
          if (vs.length === 0) broken++;
        } catch (err) {
          broken++;
          console.error(`    ${cand.id} : ${err.message}`);
        }
      }
    }
  }
  assert(tested > 100, `${tested} candidats réels balayés (12 notes × 3 tonalités)`);
  assert(enriched > 0, `${enriched} d entre eux déclenchent la règle`);
  assert(broken === 0, `aucun candidat sans voicing admissible (${broken} en échec)`);
});

// ── D. Les techniques de style partagent le même ensemble ──

runTest('D. Une forme idiomatique peut porter la tension mélodique', () => {
  const cands = realCandidatesFor(76);
  const g7 = cands.find((c) => c.qualityId === '7' && c.rootPitchClass === 7);
  if (!g7) { assert(false, 'G7 attendu'); return; }
  const gv = generateGospelVoicings(g7, { centerOctave: 3 });
  assert(gv.length > 0, `${gv.length} voicings idiomatiques produits`);
  const withTension = gv.filter((v) => v.midiNotes.map(pc).includes(4));
  assert(withTension.length === gv.length,
    'toutes les formes idiomatiques contiennent la mélodie — sinon le '
    + 'post-traitement du planificateur les écarterait et retomberait au canonique');
  assert(gv.every((v) => v.addedTensions.length === 1),
    'la tension est tracée sur les voicings de style aussi');
});

runTest('D. Sans tension, les formes idiomatiques sont inchangées', () => {
  const cands = realCandidatesFor(83);
  const g7 = cands.find((c) => c.qualityId === '7' && c.rootPitchClass === 7);
  if (!g7) { assert(false, 'G7 attendu'); return; }
  const gv = generateGospelVoicings(g7, { centerOctave: 3 });
  assert(gv.every((v) => v.addedTensions.length === 0),
    'aucune tension ajoutée quand la mélodie est une note de l accord');
  assert(gv.every((v) => new Set(v.midiNotes.map(pc)).size <= 4),
    'les formes restent sur les quatre pitch classes canoniques');
});

// ── Bilan ──

console.log('\n' + '='.repeat(60));
if (failed === 0) {
  console.log(`✅ ${passed} tests réussis, 0 échoué.`);
  process.exit(0);
} else {
  console.error(`❌ ${passed} réussis, ${failed} échoué(s).`);
  process.exit(1);
}
