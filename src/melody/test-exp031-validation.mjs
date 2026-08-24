// [OpenCode] — 2026-08-25 — EXP-031 Tâche 4 : validation synthétique Jazz + Neo Soul.
// Construire 2-3 progressions par style pour déclencher explicitement chaque
// technique V1, et produire un tableau chord-by-chord (format R1).

import { createMidiCapture } from './midi-capture.js';
import { createMelodyTrack } from './melody-track.js';
import { createTonalContext, setManualTonalContext } from './tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from './harmonic-context.js';
import { buildReharmonizationVariants } from './reharmonization-variants.js';
import { validateReharmonizationPlan } from './reharmonization-validator.js';
import { spellChordReference, formatSpelledPitch } from './spelled-pitch.js';

function buildTrack(melodyMidis, name = 'test') {
  let t = 0;
  const capture = createMidiCapture({ getTime: () => t });
  for (const midi of melodyMidis) {
    capture.noteOn(midi, 0.8, 0, name); t += 1000; capture.noteOff(midi, 0, 0, name); t += 100;
  }
  capture.finalize();
  return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: name }, { name, sopranoPolicy: 'melody-must-be-top' });
}
function buildCtx(track, key = 'C') {
  const tonalContext = setManualTonalContext(createTonalContext(), key);
  let ctx = createHarmonicContext(track, { tonalContext });
  for (let i = 0; i < track.events.length; i++) {
    ctx = addHarmonicAnchor(ctx, { melodyEventId: track.events[i].id, relativeTime: track.events[i].startedAt, type: i === 0 ? 'start' : i === track.events.length - 1 ? 'end' : 'user', harmonizationPolicy: 'automatic' });
  }
  return ctx;
}

function chordSymbol(candidate, tonalContext) {
  if (!candidate || !candidate.chord) return '—';
  const spelled = spellChordReference(candidate.chord, tonalContext);
  const root = formatSpelledPitch(spelled.rootSpelling);
  let symbol = root + (spelled.quality || '');
  if (spelled.bass != null && spelled.bassSpelling) {
    symbol += '/' + formatSpelledPitch(spelled.bassSpelling);
  }
  return symbol;
}

function printTable(label, variants, styleId) {
  console.log(`\n================================================`);
  console.log(`TABLEAU — ${label} (style: ${styleId})`);
  console.log(`================================================`);
  for (const v of variants) {
    console.log(`\n--- ${v.label} (id=${v.id}) score=${v.validationReport.score}/4 ---`);
    console.log(`  Description: ${v.description}`);
    console.log(`  Progression: ${v.plan.steps.map(s => chordSymbol(s.candidate, v.plan.harmonicContext.tonalContext)).join(' | ')}`);
    if (v.plan.techniqueReport.used.length > 0) {
      console.log(`  Techniques: ${v.plan.techniqueReport.used.map(t => `${t.name}@step${t.stepIndex+1}`).join(', ')}`);
    } else {
      console.log(`  Techniques: (aucune)`);
    }
    const voicingTechs = v.plan.steps.map(s => 
      s.jazzVoicingTechnique?.name || s.gospelVoicingTechnique?.name || s.neoSoulVoicingTechnique?.name || 'canonique'
    );
    console.log(`  Voicing techniques: ${voicingTechs.join(' | ')}`);
    console.log(`  Criteria: ${v.validationReport.criteria.map(c => `${c.criterionName}=${c.satisfied?'OK':'KO'}`).join(', ')}`);
  }
}

// ============================================================================
// PROGRESSION 1 — Jazz : substitution tritonique
// ============================================================================
// Contexte : Do majeur. Progression I - V/vi - vi - V/ii - ii - V - I
// Mélodie conçue pour déclencher :
//   Step 2 (V/vi = E7 vers Am) : mélodie = F (b9 de E7) → sub triton = Bb7 vers Am
//   Step 4 (V/ii = A7 vers Dm) : mélodie = C (b9 de A7) → sub triton = Eb7 vers Dm
//   Step 6 (V = G7 vers C) : mélodie = Ab (b9 de G7) → sub triton = Db7 vers C
{
  console.log('\n========== PROGRESSION JAZZ 1 : Substitution tritonique sur V7b9 ==========');
  // Mélodie : C  F  E  C  Bb  Ab  G  C
  //          60 65 64 60 70  68  67 72
  // Steps:  0   1  2  3  4   5   6  7
  // Harmonique visée : C  E7  Am  A7  Dm  G7  C
  // Mais on laisse le path-finder choisir ; on conçoit la mélodie pour déclencher tritone sub.
  // Step 0: C (60) sur C
  // Step 1: F (65) → compatible avec Bb7 (sub de E7) : F = 5e de Bb (intervalle 6)
  // Step 2: E (64) sur Am → canonique
  // Step 3: C (60) → compatible avec Eb7 (sub de A7) : C = 6e/13 de Eb (intervalle 9) → autorisé
  // Step 4: Bb (70) sur Dm → canonique (9e de Dm)
  // Step 5: Ab (68) → compatible avec Db7 (sub de G7) : Ab = b9 de Db (intervalle 1) → autorisé
  // Step 6: G (67) → canonique
  // Step 7: C (72) → canonique
  const melody = [60, 65, 64, 60, 70, 68, 67, 72];
  const track = buildTrack(melody, 'jazz-tritone-test');
  const ctx = buildCtx(track, 'C');
  const { variants } = buildReharmonizationVariants({ track, harmonicContext: ctx }, { styleId: 'jazz' });
  printTable('JAZZ 1 — Triton sub (V7b9 mélodie)', variants, 'jazz');
}

// ============================================================================
// PROGRESSION 2 — Jazz : voicings Drop 2 / Rootless
// ============================================================================
// Même progression mais on vérifie les voicings idiomatiques.
{
  console.log('\n========== PROGRESSION JAZZ 2 : Voicings Drop 2 / Rootless ==========');
  // Mélodie sur une progression II-V-I simple pour bien voir les voicings
  // Dm7 - G7 - Cmaj7
  // Notes : F (9e Dm) - F (b9 G7? non) - E (3e Cmaj7)
  // Mieux : mélodie qui force des accords 4 notes (maj7, m7, 7)
  const melody = [65, 67, 72]; // F4 (9e Dm7), G4 (13e G7 / 3e Cmaj7), C5 (fond C)
  const track = buildTrack(melody, 'jazz-voicings-test');
  const ctx = buildCtx(track, 'C');
  const { variants } = buildReharmonizationVariants({ track, harmonicContext: ctx }, { styleId: 'jazz' });
  printTable('JAZZ 2 — Voicings (II-V-I)', variants, 'jazz');
}

// ============================================================================
// PROGRESSION 3 — Neo Soul : 7b9 vers mineur
// ============================================================================
// Contexte : Do majeur. Cible mineure = Dm (ii).
// Mélodie conçue pour déclencher A7b9 vers Dm : mélodie Bb (b9 de A).
{
  console.log('\n========== PROGRESSION NEO SOUL 1 : 7b9 vers mineur (A7b9 → Dm9) ==========');
  // Step 0: C (tonique)
  // Step 1: Bb (b9 de A7) → déclenche A7b9 vers Dm
  // Step 2: F (3e de Dm)
  // Step 3: E (pour transition)
  // Step 4: C (tonique)
  const melody = [60, 70, 65, 64, 60];
  const track = buildTrack(melody, 'neo-soul-7b9-test');
  const ctx = buildCtx(track, 'C');
  const { variants } = buildReharmonizationVariants({ track, harmonicContext: ctx }, { styleId: 'neoSoul' });
  printTable('NEO SOUL 1 — 7b9 vers mineur', variants, 'neoSoul');
}

// ============================================================================
// PROGRESSION 4 — Neo Soul : voicing quartal
// ============================================================================
// Progression simple en mineur pour voir le voicing quartal sur m9
{
  console.log('\n========== PROGRESSION NEO SOUL 2 : Voicing quartal (Dm9) ==========');
  const melody = [65, 62, 60]; // F4 (9e Dm9), D4 (fond), C4
  const track = buildTrack(melody, 'neo-soul-quartal-test');
  const ctx = buildCtx(track, 'C');
  const { variants } = buildReharmonizationVariants({ track, harmonicContext: ctx }, { styleId: 'neoSoul' });
  printTable('NEO SOUL 2 — Voicing quartal', variants, 'neoSoul');
}

// ============================================================================
// PROGRESSION 5 — Worship (fidèle pur)
// ============================================================================
{
  console.log('\n========== PROGRESSION WORSHIP : Diatonique pur ==========');
  const melody = [60, 64, 67, 64, 60];
  const track = buildTrack(melody, 'worship-test');
  const ctx = buildCtx(track, 'C');
  const { variants } = buildReharmonizationVariants({ track, harmonicContext: ctx }, { styleId: 'worship' });
  printTable('WORSHIP — Diatonique', variants, 'worship');
}

// ============================================================================
// VALIDATION R1 GOSPEL INCHANGÉ
// ============================================================================
{
  console.log('\n========== RÉGRESSION R1 (GOSPEL) ==========');
  const progression = ['C', 'F', 'G', 'Am', 'Dm', 'G', 'C'];
  const melodyAll = [64, 65, 64, 62, 64, 60, 60]; // E F E D E C C
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
  const { variants, recommendedId } = buildReharmonizationVariants({ track, harmonicContext: ctx }, { styleId: 'gospel' });
  printTable('R1 GOSPEL (référence inchangée)', variants, 'gospel');
  const recommended = variants.find(v => v.id === recommendedId);
  console.log(`\nRÉSULTAT R1 Gospel: recommandée = ${recommended.label}, score = ${recommended.validationReport.score}/4`);
  console.log(`  → R1 Gospel ${recommended.validationReport.score === 4 ? 'INCHANGÉ (4/4 ★)' : 'RÉGRÉDÉ !'} après EXP-031`);
}

console.log('\n================================================');
console.log('FIN VALIDATION SYNTHÉTIQUE');
console.log('================================================');