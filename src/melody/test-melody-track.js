// [OpenCode] — 2026-08-06 — Tests de l'Incrément 1 : piste mélodique explicite.
// Exécutable avec : node src/melody/test-melody-track.js

import { createMidiCapture } from './midi-capture.js';
import {
  createMelodyTrack,
  createEmptyMelodyTrack,
  diagnoseMelodyTrack,
  setEventEnabled,
  setEventSopranoPolicy,
  setEventHarmonizationPolicy,
  setEventPreserveExactPitch,
  renameMelodyTrack,
  addMarker,
  removeMarker,
  sliceMelodyTrack,
  buildMelodyPlaybackEvents,
  validateMelodyTrack,
} from './melody-track.js';

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

function makeCapture(clock) {
  return createMidiCapture({ getTime: clock.now });
}

console.log('=== Incrément 1 — Piste mélodique explicite ===\n');

// ---------------------------------------------------------------------------
// T01 : conversion d'une note normale
// ---------------------------------------------------------------------------
runTest('T01 — conversion d\'une note normale en MelodyEvent', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.75, 0);
  clock.advance(200);
  capture.noteOff(60, 0.25, 0);
  capture.finalize();

  const track = createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-1' });
  assertEqual(track.events.length, 1);
  assertEqual(track.events[0].midi, 60);
  assertEqual(track.events[0].velocity, 0.75);
  assertEqual(track.events[0].channel, 0);
  assertEqual(track.events[0].startedAt, 0);
  assertEqual(track.events[0].endedAt, 0.2);
  assertEqual(track.events[0].duration, 0.2);
});

// ---------------------------------------------------------------------------
// T02 : conservation exacte du MIDI et de l'octave
// ---------------------------------------------------------------------------
runTest('T02 — conservation exacte du MIDI et de l\'octave', () => {
  const capture = createMidiCapture();
  capture.noteOn(72, 0.8, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  assertEqual(track.events[0].midi, 72);
  assertEqual(track.events[0].pitchClass, 0);
  assertEqual(track.events[0].octave, 1);
});

// ---------------------------------------------------------------------------
// T03 : conservation des temps et de la durée
// ---------------------------------------------------------------------------
runTest('T03 — conservation des temps et de la durée', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  assertEqual(track.events[0].startedAt, 0);
  assertEqual(track.events[0].endedAt, 0.1);
  assertEqual(track.events[0].duration, 0.1);
});

// ---------------------------------------------------------------------------
// T04 : conservation de la vélocité
// ---------------------------------------------------------------------------
runTest('T04 — conservation de la vélocité', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.55, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  assertEqual(track.events[0].velocity, 0.55);
});

// ---------------------------------------------------------------------------
// T05 : valeurs par défaut des trois politiques
// ---------------------------------------------------------------------------
runTest('T05 — valeurs par défaut des trois politiques', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  assertEqual(track.events[0].preserveExactPitch, true);
  assertEqual(track.events[0].sopranoPolicy, 'allow-notes-above');
  assertEqual(track.events[0].harmonizationPolicy, 'automatic');
  assertEqual(track.events[0].enabled, true);
});

// ---------------------------------------------------------------------------
// T06 : plusieurs notes successives
// ---------------------------------------------------------------------------
runTest('T06 — plusieurs notes successives conservent l\'ordre', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  clock.advance(50);
  capture.noteOn(62, 0.8, 0);
  clock.advance(100);
  capture.noteOff(62, 0, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  assertEqual(track.events.length, 2);
  assertEqual(track.events[0].midi, 60);
  assertEqual(track.events[1].midi, 62);
  assertTrue(track.events[1].startedAt > track.events[0].endedAt);
});

// ---------------------------------------------------------------------------
// T07 : accord ou attaque simultanée conservé sans suppression
// ---------------------------------------------------------------------------
runTest('T07 — attaque simultanée conservée sans suppression', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.noteOn(64, 0.8, 0);
  capture.noteOn(67, 0.8, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  assertEqual(track.events.length, 3);
  assertTrue(track.events.some((e) => e.midi === 60));
  assertTrue(track.events.some((e) => e.midi === 64));
  assertTrue(track.events.some((e) => e.midi === 67));
});

// ---------------------------------------------------------------------------
// T08 : chevauchement legato conservé et diagnostiqué
// ---------------------------------------------------------------------------
runTest('T08 — chevauchement legato conservé et diagnostiqué', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.noteOn(62, 0.8, 0); // attaque avant note-off de 60
  clock.advance(50);
  capture.noteOff(60, 0, 0);
  clock.advance(50);
  capture.noteOff(62, 0, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  const diagnostic = diagnoseMelodyTrack(track);
  assertTrue(track.events.length >= 2);
  assertTrue(diagnostic.overlaps.length > 0 || diagnostic.simultaneousAttacks.length > 0,
    'Le diagnostic doit signaler le chevauchement ou l\'attaque simultanée');
});

// ---------------------------------------------------------------------------
// T09 : événement désactivé non supprimé
// ---------------------------------------------------------------------------
runTest('T09 — événement désactivé reste présent', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.noteOn(64, 0.8, 0);
  capture.finalize();
  let track = createMelodyTrack({ notes: capture.getNotes() });
  track = setEventEnabled(track, track.events[0].id, false);
  assertEqual(track.events.length, 2);
  assertEqual(track.events[0].enabled, false);
  assertEqual(track.events[1].enabled, true);
});

// ---------------------------------------------------------------------------
// T10 : modification de sopranoPolicy non destructive
// ---------------------------------------------------------------------------
runTest('T10 — modification de sopranoPolicy non destructive', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  const track1 = createMelodyTrack({ notes: capture.getNotes() });
  const track2 = setEventSopranoPolicy(track1, track1.events[0].id, 'melody-must-be-top');
  assertEqual(track1.events[0].sopranoPolicy, 'allow-notes-above');
  assertEqual(track2.events[0].sopranoPolicy, 'melody-must-be-top');
  assertEqual(track2.version, track1.version + 1);
});

// ---------------------------------------------------------------------------
// T11 : modification de harmonizationPolicy non destructive
// ---------------------------------------------------------------------------
runTest('T11 — modification de harmonizationPolicy non destructive', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  const track1 = createMelodyTrack({ notes: capture.getNotes() });
  const track2 = setEventHarmonizationPolicy(track1, track1.events[0].id, 'skip');
  assertEqual(track1.events[0].harmonizationPolicy, 'automatic');
  assertEqual(track2.events[0].harmonizationPolicy, 'skip');
});

// ---------------------------------------------------------------------------
// T12 : ajout et suppression d'un marqueur
// ---------------------------------------------------------------------------
runTest('T12 — ajout et suppression d\'un marqueur', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  let track = createMelodyTrack({ notes: capture.getNotes() });
  track = addMarker(track, 0.05, 'phrase-start', 'Phrase A');
  assertEqual(track.markers.length, 1);
  assertEqual(track.markers[0].type, 'phrase-start');
  const markerId = track.markers[0].id;
  track = removeMarker(track, markerId);
  assertEqual(track.markers.length, 0);
});

// ---------------------------------------------------------------------------
// T13 : découpage temporel de la piste
// ---------------------------------------------------------------------------
runTest('T13 — découpage temporel de la piste', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  clock.advance(100);
  capture.noteOn(62, 0.8, 0);
  clock.advance(100);
  capture.noteOff(62, 0, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  const sliced = sliceMelodyTrack(track, 0.15, 0.35);
  assertTrue(sliced.events.length >= 1);
  assertTrue(sliced.events.every((e) => e.startedAt >= 0 && e.endedAt <= 0.2));
});

// ---------------------------------------------------------------------------
// T14 : temps relatifs commençant à zéro
// ---------------------------------------------------------------------------
runTest('T14 — temps relatifs commençant à zéro', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  clock.advance(500);
  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-delay' });
  assertEqual(track.startedAt, 0.5);
  assertEqual(track.events[0].startedAt, 0);
  assertTrue(Math.abs(track.events[0].endedAt - 0.1) < 1e-9, 'endedAt relatif doit valoir 0.1');
});

// ---------------------------------------------------------------------------
// T15 : construction des événements de lecture
// ---------------------------------------------------------------------------
runTest('T15 — construction des événements de lecture', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  const playback = buildMelodyPlaybackEvents(track);
  assertEqual(playback.length, 2);
  assertEqual(playback[0].type, 'note_on');
  assertEqual(playback[1].type, 'note_off');
  assertEqual(playback[0].melodyEventId, track.events[0].id);
});

// ---------------------------------------------------------------------------
// T16 : relecture préservant ordre, notes et durées
// ---------------------------------------------------------------------------
runTest('T16 — relecture préservant ordre, notes et durées', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  clock.advance(50);
  capture.noteOn(64, 0.6, 0);
  clock.advance(100);
  capture.noteOff(64, 0, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  const playback = buildMelodyPlaybackEvents(track);
  assertEqual(playback.filter((p) => p.type === 'note_on').map((p) => p.midi).join(','), '60,64');
  const on60 = playback.find((p) => p.type === 'note_on' && p.midi === 60);
  const off60 = playback.find((p) => p.type === 'note_off' && p.midi === 60);
  assertEqual(off60.time - on60.time, 0.1);
});

// ---------------------------------------------------------------------------
// T17 : fin synthétique conservée et signalée
// ---------------------------------------------------------------------------
runTest('T17 — fin synthétique conservée et signalée', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(100);
  capture.finalize('session-stop');
  const notes = capture.getNotes();
  const track = createMelodyTrack({ notes, sourceCaptureId: 'cap-stop' });
  assertEqual(notes[0].terminationReason, 'session-stop');
  assertTrue(track.events[0].annotations.includes('forced:session-stop'),
    'La fin forcée doit être signalée dans les annotations');
  const diagnostic = diagnoseMelodyTrack(track);
  assertTrue(diagnostic.forcedTerminations.length > 0);
});

// ---------------------------------------------------------------------------
// T18 : déconnexion signalée
// ---------------------------------------------------------------------------
runTest('T18 — déconnexion signalée', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize('disconnect');
  const track = createMelodyTrack({ notes: capture.getNotes() });
  assertTrue(track.events[0].annotations.includes('forced:disconnect'));
});

// ---------------------------------------------------------------------------
// T19 : snapshot source non muté
// ---------------------------------------------------------------------------
runTest('T19 — snapshot source non muté', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  const notes = capture.getNotes();
  const notesCopy = JSON.stringify(notes);
  const track = createMelodyTrack({ notes, sourceCaptureId: 'cap-orig' });
  track.events[0].midi = 999;
  assertDeepEqual(JSON.stringify(notes), notesCopy, 'Le snapshot source ne doit pas être modifié');
});

// ---------------------------------------------------------------------------
// T20 : MelodyTrack JSON-sérialisable
// ---------------------------------------------------------------------------
runTest('T20 — MelodyTrack JSON-sérialisable', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  const track = createMelodyTrack({ notes: capture.getNotes() });
  const json = JSON.stringify(track);
  const parsed = JSON.parse(json);
  assertEqual(parsed.events.length, 1);
  assertEqual(parsed.events[0].midi, 60);
});

// ---------------------------------------------------------------------------
// T21 : retours publics non mutables extérieurement
// ---------------------------------------------------------------------------
runTest('T21 — retours publics non mutables extérieurement', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  const track1 = createMelodyTrack({ notes: capture.getNotes() });
  const track1Json = JSON.stringify(track1);

  // Les méthodes d'édition retournent des copies sans muter l'original.
  const track2 = renameMelodyTrack(track1, 'Autre nom');
  assertEqual(track2.name, 'Autre nom');
  assertEqual(track1.name, JSON.parse(track1Json).name);
  assertEqual(track1.events.length, 1);
  assertEqual(track1.markers.length, 0);

  // JSON.stringify reste stable après édition.
  assertEqual(JSON.stringify(track1), track1Json);
});

// ---------------------------------------------------------------------------
// T22 : version de piste incrémentée après édition
// ---------------------------------------------------------------------------
runTest('T22 — version incrémentée après édition', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  const track1 = createMelodyTrack({ notes: capture.getNotes() });
  const track2 = renameMelodyTrack(track1, 'Nouveau nom');
  assertEqual(track2.version, track1.version + 1);
});

// ---------------------------------------------------------------------------
// T23 : deux événements de même note conservés
// ---------------------------------------------------------------------------
runTest('T23 — deux note-on de même note deviennent deux MelodyEvent', () => {
  const clock = makeClock();
  const capture = makeCapture(clock);
  capture.noteOn(60, 0.8, 0);
  clock.advance(50);
  capture.noteOn(60, 0.7, 0);
  clock.advance(100);
  capture.noteOff(60, 0, 0);
  capture.finalize();
  const notes = capture.getNotes();
  const track = createMelodyTrack({ notes });
  assertEqual(track.events.length, 2, 'Chaque note-on historique doit produire un MelodyEvent');
  assertTrue(track.events.some((e) => e.velocity === 0.8));
  assertTrue(track.events.some((e) => e.velocity === 0.7));
});

// ---------------------------------------------------------------------------
// T24 : validation refusée en présence d'événements incomplets
// ---------------------------------------------------------------------------
runTest('T24 — validation refuse une piste vide', () => {
  const track = createEmptyMelodyTrack();
  const validation = validateMelodyTrack(track);
  assertFalse(validation.valid);
  assertTrue(validation.errors.length > 0);
});

// ---------------------------------------------------------------------------
// T25 : piste vide gérée proprement
// ---------------------------------------------------------------------------
runTest('T25 — piste vide gérée proprement', () => {
  const track = createEmptyMelodyTrack({ name: 'Vide' });
  assertEqual(track.events.length, 0);
  assertEqual(track.duration, 0);
  assertEqual(track.name, 'Vide');
  const playback = buildMelodyPlaybackEvents(track);
  assertEqual(playback.length, 0);
});

// ---------------------------------------------------------------------------
// T26 : modification de preserveExactPitch
// ---------------------------------------------------------------------------
runTest('T26 — modification de preserveExactPitch', () => {
  const capture = createMidiCapture();
  capture.noteOn(60, 0.8, 0);
  capture.finalize();
  const track1 = createMelodyTrack({ notes: capture.getNotes() });
  const track2 = setEventPreserveExactPitch(track1, track1.events[0].id, false);
  assertEqual(track2.events[0].preserveExactPitch, false);
});

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed < total) process.exitCode = 1;
