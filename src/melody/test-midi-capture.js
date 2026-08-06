// [OpenCode] — 2026-08-06 — Tests de l'Incrément 0 : capture MIDI temporelle
// non destructive. Exécutable avec : node src/melody/test-midi-capture.js

import { createMidiCapture } from './midi-capture.js';

let total = 0;
let passed = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name} : ${err.message}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'expected true');
}

function assertFalse(value, msg = '') {
  if (value) throw new Error(msg || 'expected false');
}

function assertDeepEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
    set: (ms) => { t = ms; },
  };
}

function hasActive(timeline, midi) {
  return timeline.activeNotes.some((n) => n.midi === midi);
}

function activeCount(timeline) {
  return timeline.activeNotes.length;
}

console.log('=== Incrément 0 — Capture MIDI temporelle non destructive ===\n');

// ---------------------------------------------------------------------------
// T01 : note-on / note-off normal
// ---------------------------------------------------------------------------
runTest('T01 — note-on / note-off normal conserve time, note, velocity et channel', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  clock.advance(100); // 0.1s
  capture.noteOn(60, 0.75, 0);
  clock.advance(200); // 0.2s plus tard
  capture.noteOff(60, 0, 0);

  const events = capture.getEvents();
  assertEqual(events.length, 2);
  assertEqual(events[0].type, 'note_on');
  assertEqual(events[0].note, 60);
  assertEqual(events[0].velocity, 0.75);
  assertEqual(events[0].channel, 0);
  assertEqual(events[0].time, 0.1);
  assertEqual(events[1].type, 'note_off');
  assertEqual(events[1].time, 0.3);
});

// ---------------------------------------------------------------------------
// T02 : note-on vélocité 0 traité comme note-off
// ---------------------------------------------------------------------------
runTest('T02 — note-on vélocité 0 équivaut à note-off', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.noteOn(60, 0, 0); // doit être traité comme note-off

  const events = capture.getEvents();
  assertEqual(events.length, 2);
  assertEqual(events[1].type, 'note_off');
  assertEqual(events[1].note, 60);

  const timeline = capture.getTimeline(0.2);
  assertFalse(hasActive(timeline, 60), 'La note ne doit plus être active');
});

// ---------------------------------------------------------------------------
// T03 : répétition de la même note avant relâchement
// ---------------------------------------------------------------------------
runTest('T03 — répétition de la même note avant relâchement crée deux note-on distincts', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);  // t=0
  clock.advance(50);
  capture.noteOn(60, 0.7, 0);  // t=0.05 (re-déclenchement)
  clock.advance(100);
  capture.noteOff(60, 0, 0);      // t=0.15

  const events = capture.getEvents();
  const noteOns = events.filter((e) => e.type === 'note_on');
  assertEqual(noteOns.length, 2);
  assertEqual(noteOns[0].time, 0);
  assertEqual(noteOns[1].time, 0.05);
  assertEqual(noteOns[1].velocity, 0.7);

  const timeline = capture.getTimeline(0.1);
  assertTrue(hasActive(timeline, 60));
  assertEqual(timeline.activeNotes.find((n) => n.midi === 60).velocity, 0.7);
});

// ---------------------------------------------------------------------------
// T04 : accords simultanés
// ---------------------------------------------------------------------------
runTest('T04 — accords simultanés conservent tous les événements', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  const chord = [60, 64, 67];
  for (const note of chord) capture.noteOn(note, 0.8, 0);
  clock.advance(500);
  for (const note of chord) capture.noteOff(note, 0, 0);

  const events = capture.getEvents();
  assertEqual(events.length, 6);

  const timeline = capture.getTimeline(0.1);
  for (const note of chord) {
    assertTrue(hasActive(timeline, note), `Note ${note} doit être active`);
  }

  const timelineAfter = capture.getTimeline(0.6);
  for (const note of chord) {
    assertFalse(hasActive(timelineAfter, note), `Note ${note} ne doit plus être active`);
  }
});

// ---------------------------------------------------------------------------
// T05 : sustain CC64
// ---------------------------------------------------------------------------
runTest('T05 — sustain CC64 maintient les notes après note-off', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);
  capture.sustain(true, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);

  const events = capture.getEvents();
  assertEqual(events.some((e) => e.type === 'control' && e.controller === 64 && e.value === 127), true);

  const timeline = capture.getTimeline(0.15);
  assertTrue(timeline.sustainPedal, 'La pédale doit être active');
  assertTrue(hasActive(timeline, 60), 'La note doit être maintenue par le sustain');
  assertTrue(timeline.sustainedNotes.some((n) => n.midi === 60), 'La note doit être marquée sustained');
});

// ---------------------------------------------------------------------------
// T06 : relâchement pendant sustain
// ---------------------------------------------------------------------------
runTest('T06 — relâchement pendant sustain conserve la note jusqu\'à fin de sustain', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);  // t=0
  capture.sustain(true, 0);     // t=0
  clock.advance(100);
  capture.noteOff(60, 0, 0);      // t=0.1
  clock.advance(100);
  capture.sustain(false, 0);   // t=0.2

  const duringSustain = capture.getTimeline(0.15);
  assertTrue(hasActive(duringSustain, 60));

  const afterSustain = capture.getTimeline(0.25);
  assertFalse(hasActive(afterSustain, 60));
  assertFalse(afterSustain.sustainedNotes.some((n) => n.midi === 60));
});

// ---------------------------------------------------------------------------
// T07 : fin de sustain
// ---------------------------------------------------------------------------
runTest('T07 — fin de sustain libère uniquement les notes du canal concerné', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);
  capture.noteOn(62, 0.8, 1);
  capture.sustain(true, 0);
  clock.advance(50);
  capture.noteOff(60, 0, 0);
  capture.noteOff(62, 0, 1);
  clock.advance(50);
  capture.sustain(false, 0);

  const timeline = capture.getTimeline(0.15);
  assertFalse(hasActive(timeline, 60), 'Canal 0 : note libérée par fin de sustain');
  assertFalse(hasActive(timeline, 62), 'Canal 1 : note déjà relâchée car pas de sustain sur ce canal');
  assertFalse(timeline.sustainPedal, 'Aucun canal en sustain');
});

// ---------------------------------------------------------------------------
// T08 : déconnexion MIDI (finalize)
// ---------------------------------------------------------------------------
runTest('T08 — finalize génère des note-off pour notes actives sans note-off', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);
  capture.noteOn(64, 0.8, 0);
  clock.advance(300);

  const events = capture.finalize('disconnect');
  const noteOffs = events.filter((e) => e.type === 'note_off');
  assertEqual(noteOffs.length, 2);
  assertEqual(noteOffs[0].note, 60);
  assertEqual(noteOffs[1].note, 64);
  assertTrue(noteOffs[0].time >= 0.3, 'Les note-off générés par finalize doivent être au temps courant');
  assertTrue(noteOffs.every((e) => e.synthetic === true), 'Les note-off de finalize doivent être marqués synthetic');
  assertEqual(noteOffs[0].terminationReason, 'disconnect');

  const timeline = capture.getTimeline(Number.POSITIVE_INFINITY);
  assertEqual(activeCount(timeline), 0);
});

// ---------------------------------------------------------------------------
// T09 : arrêt forcé de session (finalize)
// ---------------------------------------------------------------------------
runTest('T09 — finalize nettoie aussi les notes sustained', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);
  capture.sustain(true, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  clock.advance(100);
  // Note 60 est sustained ; on appelle finalize sans relâcher le sustain
  capture.finalize('session-stop');

  const events = capture.getEvents();
  const noteOff = events.filter((e) => e.type === 'note_off');
  // Un note-off manuel à 0.1 + un note-off de finalize à 0.2 + epsilon
  assertEqual(noteOff.length, 2);
  assertEqual(noteOff[0].note, 60);
  assertEqual(noteOff[1].note, 60);

  const controls = events.filter((e) => e.type === 'control' && e.controller === 64);
  assertEqual(controls.length, 2); // sustain on + sustain off généré par finalize
  assertTrue(controls[1].synthetic === true, 'Le sustain-off de finalize est synthétique');
  assertEqual(controls[1].terminationReason, 'session-stop');

  const timeline = capture.getTimeline(Number.POSITIVE_INFINITY);
  assertEqual(activeCount(timeline), 0);
  assertFalse(timeline.sustainPedal);
});

// ---------------------------------------------------------------------------
// T10 : plusieurs canaux
// ---------------------------------------------------------------------------
runTest('T10 — plusieurs canaux conservent leurs événements séparément', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);
  capture.noteOn(60, 0.6, 1); // même note, canal différent
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  clock.advance(50);
  capture.noteOff(60, 0, 1);

  const events = capture.getEvents();
  const noteOns = events.filter((e) => e.type === 'note_on');
  assertEqual(noteOns.length, 2);
  assertEqual(noteOns[0].channel, 0);
  assertEqual(noteOns[1].channel, 1);

  const timeline = capture.getTimeline(0.12);
  // Les deux canaux sont maintenant indépendants grâce à la clé sourceId|channel|note
  assertEqual(activeCount(timeline), 1);
  assertEqual(timeline.activeNotes[0].channel, 1);
});

// ---------------------------------------------------------------------------
// T11 : horloge monotone
// ---------------------------------------------------------------------------
runTest('T11 — horloge par défaut est monotone', () => {
  const capture = createMidiCapture();

  capture.noteOn(60, 0.8, 0);
  capture.noteOn(62, 0.8, 0);
  capture.noteOff(60, 0, 0);
  capture.noteOff(62, 0, 0);

  const events = capture.getEvents();
  for (let i = 1; i < events.length; i++) {
    assertTrue(events[i].time >= events[i - 1].time, 'Les temps doivent être monotones');
  }
});

// ---------------------------------------------------------------------------
// T12 : aucune note bloquée après finalize()
// ---------------------------------------------------------------------------
runTest('T12 — aucune note bloquée après finalize()', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(48, 0.8, 0);
  capture.noteOn(55, 0.8, 0);
  capture.noteOn(60, 0.8, 0);
  capture.sustain(true, 0);
  clock.advance(100);
  capture.noteOff(48, 0, 0);
  capture.noteOff(55, 0, 0);
  capture.noteOff(60, 0, 0);
  clock.advance(100);

  capture.finalize();

  const timeline = capture.getTimeline(Number.POSITIVE_INFINITY);
  assertEqual(activeCount(timeline), 0, 'Aucune note active après finalize');
  assertEqual(timeline.sustainedNotes.length, 0, 'Aucune note sustained après finalize');
  assertFalse(timeline.sustainPedal, 'Pédale relâchée après finalize');
});

// ---------------------------------------------------------------------------
// Test complémentaire : getTimeline n'altère pas l'état de capture
// ---------------------------------------------------------------------------
runTest('Bonus — getTimeline est pure et n\'altère pas l\'état interne', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);
  capture.getTimeline(0.05);
  capture.getTimeline(0.1);
  capture.getTimeline(0.2);

  const events = capture.getEvents();
  assertEqual(events.length, 1);
  assertEqual(events[0].type, 'note_on');
});

// ---------------------------------------------------------------------------
// T13 : note-off orphelin
// ---------------------------------------------------------------------------
runTest('T13 — note-off orphelin est enregistré sans crasher', () => {
  const capture = createMidiCapture();
  capture.noteOff(60, 0, 0);
  const events = capture.getEvents();
  assertEqual(events.length, 1);
  assertEqual(events[0].type, 'note_off');
});

// ---------------------------------------------------------------------------
// T14 : finalize idempotent
// ---------------------------------------------------------------------------
runTest('T14 — finalize est idempotent', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });

  capture.noteOn(60, 0.8, 0);
  clock.advance(100);

  const first = capture.finalize('session-stop');
  const second = capture.finalize('session-stop');

  assertEqual(first.length, second.length);
  assertDeepEqual(first, second, 'Deux appels à finalize doivent retourner le même événement');

  // Aucun nouvel événement ne doit être généré au second appel
  const events = capture.getEvents();
  assertEqual(events.filter((e) => e.synthetic).length, 1);
});

// ---------------------------------------------------------------------------
// T15 : snapshot JSON-safe et immutabilité
// ---------------------------------------------------------------------------
runTest('T15 — getTimeline/getNotes/getEvents retournent des snapshots JSON-safe', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.noteOff(60, 0, 0);

  const timeline = capture.getTimeline(0.1);
  const notes = capture.getNotes();
  const events = capture.getEvents();

  // Aucun Map/Set/fonction/DOM/référence circulaire
  const jsonTimeline = JSON.stringify(timeline);
  const jsonNotes = JSON.stringify(notes);
  const jsonEvents = JSON.stringify(events);

  assertTrue(jsonTimeline.includes('activeNotes'));
  assertTrue(jsonNotes.includes('startedAt'));
  assertTrue(jsonEvents.includes('note_on'));

  // Mutation externe sans effet
  timeline.activeNotes.push({ midi: 999 });
  notes.push({ midi: 999 });
  events.push({ type: 'fake' });

  assertEqual(capture.getTimeline(0.1).activeNotes.length, 0);
  assertEqual(capture.getNotes().length, 1);
  assertEqual(capture.getEvents().length, 2);
});

// ---------------------------------------------------------------------------
// T16 : horloge reculant
// ---------------------------------------------------------------------------
runTest('T16 — horloge invalide rejette les timestamps incohérents', () => {
  const capture = createMidiCapture({ getTime: () => -5 });
  try {
    capture.noteOn(60, 0.8, 0);
    throw new Error('Devait rejeter un timestamp négatif');
  } catch (err) {
    assertTrue(err.message.includes('horloge'));
  }
});

// ---------------------------------------------------------------------------
// T17 : plusieurs sources
// ---------------------------------------------------------------------------
runTest('T17 — plusieurs sources conservent leurs notes séparément', () => {
  const clock = makeClock();
  const capture = createMidiCapture({ getTime: clock.now });
  capture.noteOn(60, 0.8, 0, 'piano');
  clock.advance(1);
  capture.noteOn(60, 0.6, 0, 'clavier-usb');

  const timeline = capture.getTimeline(0.05);
  assertEqual(activeCount(timeline), 2);
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;
