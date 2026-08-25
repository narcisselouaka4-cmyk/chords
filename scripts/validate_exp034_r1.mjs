// [Claude] — 2026-08-25 — EXP-034 : harnais de validation de l'inclusion des
// tensions disponibles dans le voicing.
//
// Reproduit trois mesures dans un seul passage, sans dépendance à Electron :
//   1. R1 audio (Track_011) — mélodie extraite par melody_extractor.py depuis
//      le stem vocals de Demucs, tonalité Chordify (Do majeur, cf. EXP-029).
//   2. R1 MIDI-live (EXP-026) — la référence intouchable, 4/4 sur la Version
//      gospel.
//   3. Acquis EXP-030 — voicings idiomatiques et qualité 7#5.
//
// Usage : node scripts/validate_exp034_r1.mjs <melody.json>

import { readFileSync } from 'fs';
import { createMidiCapture } from '../src/melody/midi-capture.js';
import { createMelodyTrack } from '../src/melody/melody-track.js';
import { createTonalContext, setManualTonalContext } from '../src/melody/tonal-context.js';
import { createHarmonicContext, addHarmonicAnchor } from '../src/melody/harmonic-context.js';
import { buildGospelHarmonizationPlan } from '../src/melody/gospel-harmonization-planner.js';
import { buildAudioMelodyWrapper } from '../src/melody/reharmonization-audio-capture.js';
import { buildReharmonizationVariants } from '../src/melody/reharmonization-variants.js';
import { validateReharmonizationPlan } from '../src/melody/reharmonization-validator.js';
import { spellChordReference, formatSpelledPitch } from '../src/melody/spelled-pitch.js';

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pc = (n) => ((n % 12) + 12) % 12;
const midiName = (m) => `${PC_NAMES[pc(m)]}${Math.floor(m / 12) - 1}`;

function chordSymbol(candidate, tonalContext) {
  if (!candidate || !candidate.chord) return '—';
  const s = spellChordReference(candidate.chord, tonalContext);
  let sym = formatSpelledPitch(s.rootSpelling) + (s.quality || '');
  if (s.bass != null && s.bassSpelling) sym += '/' + formatSpelledPitch(s.bassSpelling);
  return sym;
}

/** Détaille les steps dont la note mélodique n'est pas dans le voicing. */
function melodyReport(plan) {
  const tc = plan.harmonicContext.tonalContext;
  const rows = [];
  for (const step of plan.steps) {
    if (!step.anchor?.melodyEventId) continue;
    const ev = plan.track.events.find((e) => e.id === step.anchor.melodyEventId);
    if (!ev) continue;
    const vpcs = (step.voicing?.midiNotes || []).map(pc);
    rows.push({
      index: step.index,
      note: midiName(ev.midi),
      midi: ev.midi,
      chord: chordSymbol(step.candidate, tc),
      category: step.candidate?.melodyCompatibility?.category ?? '?',
      interval: step.candidate?.melodyCompatibility?.matchingInterval ?? null,
      audible: vpcs.includes(pc(ev.midi)),
      voicing: (step.voicing?.midiNotes || []).map(midiName).join(' '),
      voicingTechnique: step.gospelVoicingTechnique?.name
        || step.jazzVoicingTechnique?.name
        || step.neoSoulVoicingTechnique?.name
        || 'canonique',
    });
  }
  return rows;
}

function printMelodyRows(rows, only) {
  const sel = only ? rows.filter((r) => only.includes(r.index)) : rows;
  console.log('  step | note | accord | compat mélodie      | it | audible | voicing');
  for (const r of sel) {
    console.log(
      `  ${String(r.index).padStart(4)} | ${r.note.padEnd(4)} | ${r.chord.padEnd(6)} `
      + `| ${String(r.category).padEnd(19)} | ${String(r.interval ?? '').padStart(2)} `
      + `| ${(r.audible ? 'oui' : 'NON').padEnd(7)} | ${r.voicing} [${r.voicingTechnique}]`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1. R1 audio (Track_011)
// ---------------------------------------------------------------------------

function runR1Audio(melodyPath) {
  console.log('\n=========== R1 AUDIO (Track_011, stem vocals) ===========');
  const extracted = JSON.parse(readFileSync(melodyPath, 'utf-8'));
  const built = buildAudioMelodyWrapper(extracted, {
    name: 'Mélodie extraite (vocals)',
    // Tonalité Chordify mesurée en EXP-029 sur Track_011/original.mp3.
    harmonicKey: { key: 'C', mode: 'major' },
  });
  if (built.status !== 'success') {
    console.error('  ÉCHEC construction du wrapper :', built.message);
    return null;
  }
  console.log(`  ${built.noteCount} notes extraites, tonalité = `
    + `${built.wrapper.harmonicContext.tonalContext?.selected?.tonicPitchClass} `
    + `${built.wrapper.harmonicContext.tonalContext?.selected?.mode}`);

  const variants = buildReharmonizationVariants(built.wrapper, { styleId: 'gospel' });
  const out = {};
  for (const v of variants.variants) {
    const rep = v.validationReport;
    const ko = rep.criteria.filter((c) => !c.satisfied).map((c) => c.criterionName);
    console.log(`\n  ${v.label} : ${rep.score}/4${ko.length ? ' — KO : ' + ko.join(', ') : ''}`);
    const mel = rep.criteria.find((c) => c.criterionId === 'melody-audible');
    out[v.id] = { score: rep.score, failing: mel ? mel.failingStepIndices : [] };
    if (mel && mel.failingStepIndices.length) {
      console.log(`  steps sans mélodie audible : ${mel.failingStepIndices.join(', ')}`);
      printMelodyRows(melodyReport(v.plan), mel.failingStepIndices);
    }
  }
  // Détail permanent des 3 steps historiques d'EXP-029.
  const gospel = variants.variants.find((v) => v.id === 'stylistic') || variants.variants[0];
  console.log('\n  — Steps 20, 22, 29 (les trois d\'EXP-029), variante gospel :');
  printMelodyRows(melodyReport(gospel.plan), [20, 22, 29]);
  console.log(`\n  Recommandée : ${variants.recommendedId}`);
  return out;
}

// ---------------------------------------------------------------------------
// 2. R1 MIDI-live (EXP-026) — référence intouchable
// ---------------------------------------------------------------------------

function buildR1MidiPlan() {
  const progression = ['C', 'F', 'G', 'Am', 'Dm', 'G', 'C'];
  const melody = [64, 65, 64, 62, 64, 60, 60];
  let t = 0;
  const capture = createMidiCapture({ getTime: () => t });
  for (const midi of melody) {
    capture.noteOn(midi, 0.8, 0, 'r1'); t += 1000; capture.noteOff(midi, 0, 0, 'r1'); t += 100;
  }
  capture.finalize();
  const track = createMelodyTrack(
    { notes: capture.getNotes(), sourceCaptureId: 'r1' },
    { name: 'R1', sopranoPolicy: 'melody-must-be-top' },
  );
  const tonalContext = setManualTonalContext(createTonalContext(), 'C');
  let ctx = createHarmonicContext(track, { tonalContext });
  for (let i = 0; i < track.events.length; i++) {
    ctx = addHarmonicAnchor(ctx, {
      melodyEventId: track.events[i].id,
      relativeTime: track.events[i].startedAt,
      type: i === 0 ? 'start' : i === track.events.length - 1 ? 'end' : 'user',
      harmonizationPolicy: 'automatic',
      originalChord: progression[i],
    });
  }
  return { track, harmonicContext: ctx };
}

function runR1Midi() {
  console.log('\n=========== R1 MIDI-LIVE (EXP-026, référence) ===========');
  const wrapper = buildR1MidiPlan();
  const variants = buildReharmonizationVariants(wrapper, { styleId: 'gospel' });
  const out = {};
  for (const v of variants.variants) {
    console.log(`  ${v.label} : ${v.validationReport.score}/4`);
    out[v.id] = v.validationReport.score;
  }
  console.log(`  Recommandée : ${variants.recommendedId}`);

  // Acquis EXP-030 : voicings idiomatiques sur le plan Gospel direct.
  const plan = buildGospelHarmonizationPlan(wrapper);
  const techs = plan.steps.map((s) => s.gospelVoicingTechnique?.name || 'canonique');
  const idiomatic = techs.filter((t) => t !== 'canonique').length;
  console.log(`\n  EXP-030 — voicings idiomatiques : ${idiomatic}/${techs.length}`);
  console.log(`  ${techs.join(' | ')}`);
  const rep = validateReharmonizationPlan(plan, { styleId: 'gospel' });
  console.log(`  Plan Gospel direct : ${rep.score}/4`);
  printMelodyRows(melodyReport(plan));
  out.idiomatic = idiomatic;
  out.gospelPlanScore = rep.score;
  return out;
}

// ---------------------------------------------------------------------------

const melodyPath = process.argv[2];
const midi = runR1Midi();
const audio = melodyPath ? runR1Audio(melodyPath) : null;

console.log('\n=========== RÉSUMÉ ===========');
console.log(`R1 MIDI-live gospel : ${midi.stylistic}/4 (attendu 4/4)`);
console.log(`R1 MIDI-live voicings idiomatiques : ${midi.idiomatic}/7 (attendu 6/7)`);
if (audio) {
  console.log(`R1 audio fidèle    : ${audio.faithful?.score}/4`);
  console.log(`R1 audio gospel    : ${audio.stylistic?.score}/4  steps KO mélodie : `
    + `[${(audio.stylistic?.failing || []).join(', ')}]`);
  console.log(`R1 audio tendue    : ${audio.tense?.score}/4  steps KO mélodie : `
    + `[${(audio.tense?.failing || []).join(', ')}]`);
}
