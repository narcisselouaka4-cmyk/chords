import {
  exportAnalysisToMidi,
  exportAnalysisToJson,
  exportAnalysisToText,
  computeProductStatistics,
  buildAnalysisMidiEvents,
} from './analysis-export.js';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

function makeSegment(start, end, chord, override = null) {
  return { startTime: start, endTime: end, chord, manualOverride: override };
}

function makeAnalysis(chords, extra = {}) {
  return {
    duration: 10,
    tempo: 120,
    timeSignature: '4/4',
    title: 'Test Analysis',
    chords,
    ...extra,
  };
}

// ── Helpers MIDI ──

function getChordEvents(analysis, options = {}) {
  const tracks = buildAnalysisMidiEvents(analysis, options);
  const chordTrack = tracks.find((t) => t.name === 'Chords detected');
  return chordTrack ? chordTrack.events : [];
}

function extractPcsFromEvents(events) {
  const ons = events.filter((e) => e.type === 'note_on' && e.velocity > 0);
  return [...new Set(ons.map((e) => e.note % 12))].sort((a, b) => a - b);
}

function extractPcsFromMidi(bytes) {
  // Parsing minimal SMF : cherche les status bytes 0x9n avec velocity > 0.
  const pcs = new Set();
  let i = 0;
  while (i < bytes.length - 2) {
    const b = bytes[i];
    if ((b & 0xf0) === 0x90 && bytes[i + 2] > 0) {
      pcs.add(bytes[i + 1] % 12);
      i += 3;
    } else if ((b & 0x80) === 0x80) {
      i += 3;
    } else {
      i++;
    }
  }
  return [...pcs].sort((a, b) => a - b);
}

function arraysMatch(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── Tests MIDI ──

runTest('MIDI — export sans correction = comportement précédent', () => {
  const chords = [makeSegment(0, 2, 'C'), makeSegment(2, 4, 'G7')];
  const events = getChordEvents(makeAnalysis(chords));
  const pcs = extractPcsFromEvents(events);
  // C major = C(0), E(4), G(7) ; G7 = G(7), B(11), D(2), F(5)
  assert(arraysMatch(pcs, [0, 2, 4, 5, 7, 11]), `pcs: ${pcs}`);
});

runTest('MIDI — Fmaj7 → Fm7/D : pas de A naturel', () => {
  const chords = [makeSegment(0, 2, 'Fmaj7', { root: 5, quality: 'm7', bass: 2 })];
  const events = getChordEvents(makeAnalysis(chords));
  const pcs = extractPcsFromEvents(events);
  // Fm7/D = F(5), Ab(8), C(0), Eb(3) + basse D(2)
  assert(arraysMatch(pcs, [0, 2, 3, 5, 8]), `pcs: ${pcs}`);
  assert(!pcs.includes(9), `A(9) ne doit pas être présent : ${pcs}`);
});

runTest('MIDI — Gm7b5 notes correctes', () => {
  const chords = [makeSegment(0, 2, 'G7', { root: 7, quality: 'm7b5', bass: null })];
  const events = getChordEvents(makeAnalysis(chords));
  const pcs = extractPcsFromEvents(events);
  // Gm7b5 = G(7), Bb(10), Db(1), F(5)
  assert(arraysMatch(pcs, [1, 5, 7, 10]), `pcs: ${pcs}`);
});

runTest('MIDI — Fsus4 notes correctes', () => {
  const chords = [makeSegment(0, 2, 'Fmaj7', { root: 5, quality: 'sus4', bass: null })];
  const events = getChordEvents(makeAnalysis(chords));
  const pcs = extractPcsFromEvents(events);
  // Fsus4 = F(5), Bb(10), C(0)
  assert(arraysMatch(pcs, [0, 5, 10]), `pcs: ${pcs}`);
  assert(!pcs.includes(9), `A(9) ne doit pas être présent : ${pcs}`);
});

runTest('MIDI — suppression override revient à détection', () => {
  const override = { root: 5, quality: 'm7', bass: 2 };
  const chordsWith = [makeSegment(0, 2, 'Fmaj7', override)];
  const chordsWithout = [makeSegment(0, 2, 'Fmaj7', null)];
  const pcsWith = extractPcsFromEvents(getChordEvents(makeAnalysis(chordsWith)));
  const pcsWithout = extractPcsFromEvents(getChordEvents(makeAnalysis(chordsWithout)));
  assert(!arraysMatch(pcsWith, pcsWithout), 'doit différer');
  assert(pcsWithout.includes(9), 'Fmaj7 contient A(9)');
  assert(!pcsWith.includes(9), 'Fm7/D ne contient pas A(9)');
});

runTest('MIDI — temps inchangés après correction', () => {
  const seg = makeSegment(1.5, 3.7, 'Fmaj7', { root: 5, quality: 'm7', bass: 2 });
  const events = getChordEvents(makeAnalysis([seg]));
  const ons = events.filter((e) => e.type === 'note_on' && e.velocity > 0);
  assert(ons.length === 5, `5 notes attendues pour Fm7/D, got ${ons.length}`);
  for (const e of ons) assert(e.time === 1.5, `startTime: ${e.time}`);
});

runTest('MIDI — slash chord basse dans accord (C/E) : pas de duplication', () => {
  const seg = makeSegment(0, 2, 'C', { root: 0, quality: '', bass: 4 });
  const events = getChordEvents(makeAnalysis([seg]));
  const ons = events.filter((e) => e.type === 'note_on' && e.velocity > 0).sort((a, b) => a.note - b.note);
  // C/E : E est déjà dans l'accord → 3 notes
  assert(ons.length === 3, `3 notes pour C/E : ${ons.length}`);
  assert(ons[0].note % 12 === 4, `basse E : ${ons[0].note}`);
});

runTest('MIDI — slash chord basse externe ajoutée une octave en dessous', () => {
  const seg = makeSegment(0, 2, 'C', { root: 0, quality: '', bass: 2 });
  const events = getChordEvents(makeAnalysis([seg]));
  const ons = events.filter((e) => e.type === 'note_on' && e.velocity > 0).sort((a, b) => a.note - b.note);
  assert(ons.length === 4, `4 notes pour C/D : ${ons.length}`);
  assert(ons[0].note % 12 === 2, `basse D : ${ons[0].note}`);
});

runTest('MIDI — N (pas d\'accord) ignoré', () => {
  const chords = [makeSegment(0, 2, 'N')];
  const events = getChordEvents(makeAnalysis(chords));
  const ons = events.filter((e) => e.type === 'note_on' && e.velocity > 0);
  assert(ons.length === 0, `N ne produit pas de notes : ${ons.length}`);
});

runTest('MIDI — plusieurs corrections sur un projet', () => {
  const chords = [
    makeSegment(0, 2, 'C', { root: 0, quality: 'm', bass: null }),
    makeSegment(2, 4, 'G7', { root: 7, quality: 'maj7', bass: null }),
    makeSegment(4, 6, 'Am7', { root: 9, quality: 'm7', bass: null }),
  ];
  const events = getChordEvents(makeAnalysis(chords));
  const pcs = extractPcsFromEvents(events);
  // Cm = 0,3,7 ; Gmaj7 = 7,11,2,6 ; Am7 = 9,0,4,7
  assert(arraysMatch(pcs, [0, 2, 3, 4, 6, 7, 9, 11]), `pcs: ${pcs}`);
});

runTest('MIDI — fichier SMF généré contient les bonnes hauteurs', () => {
  const chords = [makeSegment(0, 2, 'Fmaj7', { root: 5, quality: 'm7', bass: 2 })];
  const bytes = exportAnalysisToMidi(makeAnalysis(chords));
  assert(bytes instanceof Uint8Array, 'bytes Uint8Array');
  const pcs = extractPcsFromMidi(bytes);
  assert(arraysMatch(pcs, [0, 2, 3, 5, 8]), `pcs SMF: ${pcs}`);
});

// ── Tests JSON ──

runTest('JSON — conserve detectedChord, manualOverride, effectiveChord', () => {
  const chords = [makeSegment(0, 2, 'Fmaj7', { root: 5, quality: 'm7', bass: 2 })];
  const json = exportAnalysisToJson(makeAnalysis(chords));
  const seg = json.segments[0];
  assert(seg.detectedChord.symbol === 'Fmaj7', `detected: ${seg.detectedChord.symbol}`);
  assert(seg.detectedChord.root === 5, `detected root`);
  assert(seg.manualOverride.root === 5, `override root`);
  assert(seg.effectiveChord.symbol === 'Fm7/D', `effective: ${seg.effectiveChord.symbol}`);
  assert(seg.wasManuallyEdited === true, 'wasManuallyEdited true');
  assert(json.manuallyEditedCount === 1, 'count=1');
});

runTest('JSON — segment non corrigé a manualOverride null', () => {
  const chords = [makeSegment(0, 2, 'C')];
  const json = exportAnalysisToJson(makeAnalysis(chords));
  const seg = json.segments[0];
  assert(seg.detectedChord.symbol === 'C');
  assert(seg.manualOverride === null, 'manualOverride null');
  assert(seg.effectiveChord.symbol === 'C');
  assert(seg.wasManuallyEdited === false, 'wasManuallyEdited false');
  assert(json.manuallyEditedCount === 0, 'count=0');
});

// ── Tests texte ──

runTest('Texte — utilise symbole corrigé', () => {
  const chords = [makeSegment(0, 2, 'Fmaj7', { root: 5, quality: 'm7', bass: 2 })];
  const text = exportAnalysisToText(makeAnalysis(chords));
  assert(text.includes('Fm7/D'), `texte: ${text}`);
  assert(!text.includes('Fmaj7'), `pas Fmaj7: ${text}`);
});

runTest('Texte — marque les corrections', () => {
  const chords = [makeSegment(0, 2, 'C', { root: 0, quality: 'm', bass: null })];
  const text = exportAnalysisToText(makeAnalysis(chords));
  assert(text.includes('*'), `marqueur correction: ${text}`);
});

// ── Tests statistiques ──

runTest('Stats — utilisent effectiveChord', () => {
  const chords = [
    makeSegment(0, 2, 'Fmaj7', { root: 5, quality: 'm7', bass: 2 }),
    makeSegment(2, 4, 'C'),
    makeSegment(4, 6, 'C', { root: 0, quality: 'm', bass: null }),
  ];
  const stats = computeProductStatistics(makeAnalysis(chords));
  assert(stats.manuallyEditedCount === 2, `edited: ${stats.manuallyEditedCount}`);
  assert(stats.slashChordCount === 1, `slash: ${stats.slashChordCount}`);
  assert(stats.qualityCounts.m7 === 1, `m7 count`);
  assert(stats.qualityCounts.m === 1, `m count`);
  assert(stats.qualityCounts.major === 1, `major count`);
  // Les trois accords effectifs sont différents (Fm7/D, C, Cm) → chacun compte 1
  assert(stats.mostUsedChords.length === 3, `3 accords uniques: ${stats.mostUsedChords.length}`);
  assert(stats.mostUsedChords.every((c) => c.count === 1), 'tous count=1');
});

runTest('Stats — Fm7/D compte comme slash chord', () => {
  const chords = [makeSegment(0, 2, 'Fmaj7', { root: 5, quality: 'm7', bass: 2 })];
  const stats = computeProductStatistics(makeAnalysis(chords));
  assert(stats.slashChordCount === 1, `slash: ${stats.slashChordCount}`);
});

runTest('Stats — C/E basse dans accord ne compte pas slash', () => {
  // C/E : basse E est déjà dans l'accord C major (C-E-G)
  const chords = [makeSegment(0, 2, 'C', { root: 0, quality: '', bass: 4 })];
  const stats = computeProductStatistics(makeAnalysis(chords));
  assert(stats.slashChordCount === 0, `pas slash si basse dans accord: ${stats.slashChordCount}`);
});

console.log('\nTests Phase D — Exports terminés.');
