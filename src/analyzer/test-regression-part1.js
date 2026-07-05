import { buildChordTimeline, isMelodicSession } from './chord-timeline.js';
import { computeKeyFromRawNotes } from './key-detector.js';

// Tests de non-régression — Partie 1 du cahier des charges correctif.

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

// ---------------------------------------------------------------------------
// Bug 1.3 : 6 notes jouées avec jitter 0-150ms → toutes intégrées, topNote = max
// ---------------------------------------------------------------------------
runTest('Bug 1.3 — Fmaj9 6 notes (F3,C4,E4,G4,A4,C5) avec jitter', () => {
  const baseNotes = [53, 60, 64, 67, 69, 72]; // F3, C4, E4, G4, A4, C5
  const events = [];
  const startTime = 1.0;
  const duration = 2.0;

  // note-on avec jitter croissant 0-150ms
  for (let i = 0; i < baseNotes.length; i++) {
    events.push({
      time: startTime + i * 0.03,
      type: 'note_on',
      note: baseNotes[i],
      velocity: 0.8,
    });
  }
  // note-off
  for (let i = 0; i < baseNotes.length; i++) {
    events.push({
      time: startTime + duration,
      type: 'note_off',
      note: baseNotes[i],
    });
  }

  const timeline = buildChordTimeline(events);
  assert(!timeline.isMelodic, 'Ne doit pas être classé mélodique');
  assert(timeline.chords.length >= 1, 'Au moins un accord détecté');
  const chord = timeline.chords[0];
  assert(chord.notes.length === 6, `6 notes attendues, got ${chord.notes.length}: ${chord.notes.join(',')}`);
  const topNote = Math.max(...chord.notes);
  assert(topNote === 72, `Top note attendue C5 (72), got ${topNote}`);
});

// ---------------------------------------------------------------------------
// Bug 1.4 : mélodie isolée C D E F G → Do majeur via computeKeyFromRawNotes
// ---------------------------------------------------------------------------
runTest('Bug 1.4 — Mélodie isolée C D E F G → Do majeur', () => {
  const notes = [60, 62, 64, 65, 67]; // C4 D4 E4 F4 G4
  const events = [];
  let t = 0;
  for (const note of notes) {
    events.push({ time: t, type: 'note_on', note, velocity: 0.8 });
    events.push({ time: t + 0.4, type: 'note_off', note });
    t += 0.5;
  }

  assert(isMelodicSession(events), 'Doit être classé mélodique');
  const timeline = buildChordTimeline(events);
  assert(timeline.isMelodic, 'Timeline doit retourner isMelodic=true');
  assert(timeline.melodyLine.length === 5, 'Ligne mélodique de 5 notes');

  const key = computeKeyFromRawNotes(events);
  assert(key != null, 'Tonalité détectée');
  assert(key.name === 'C', `Tonalité attendue C, got ${key.name}`);
  assert(key.mode === 'major', `Mode majeur attendu, got ${key.mode}`);
});

// ---------------------------------------------------------------------------
// Sanity check : progression II-V-I classique reste non-mélodique
// ---------------------------------------------------------------------------
runTest('Sanity — Progression II-V-I non mélodique', () => {
  const chords = [
    [50, 60, 63, 67], // Dm7 (D3,C4,Eb4,G4) → non, D F A C : D3 F3 A3 C4
    [43, 59, 62, 65], // G7 (G2,B3,D4,F4)
    [48, 52, 55, 59], // Cmaj7 (C3,E3,G3,B3)
  ];
  const events = [];
  let t = 0;
  for (const notes of chords) {
    for (const note of notes) {
      events.push({ time: t, type: 'note_on', note, velocity: 0.8 });
    }
    for (const note of notes) {
      events.push({ time: t + 1.8, type: 'note_off', note });
    }
    t += 2;
  }

  assert(!isMelodicSession(events), 'Ne doit pas être classé mélodique');
  const timeline = buildChordTimeline(events);
  assert(!timeline.isMelodic, 'Timeline non mélodique');
  assert(timeline.chords.length >= 2, 'Au moins 2 accords détectés');
});

console.log('\n=== Partie 1 regression tests done ===');
