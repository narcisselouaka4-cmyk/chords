// Tests — un fichier MIDI comme source de l'onglet Analyse (midi-source.js).
//
// Usage : node src/analyzer/test-midi-source.js

import { analyzeMidiEvents, noteSpans, encodeWav, isMidiPath } from './midi-source.js';
import { buildMidiFile, parseMidiFile } from '../recorder/serializer.js';

let failed = 0;
let passed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const events = [];
const play = (notes, t, d) => { for (const note of notes) { events.push({ type: 'note_on', note, velocity: 0.7, channel: 0, time: t }, { type: 'note_off', note, velocity: 0, channel: 0, time: t + d }); } };
play([50, 53, 57, 60], 0, 1.9);
play([43, 53, 59, 64], 2, 1.9);
play([48, 52, 55, 59], 4, 1.9);
play([48, 52, 55, 59], 6, 1.9); // le même accord rejoué : un seul segment
events.sort((a, b) => a.time - b.time);

// Comme en vrai : la session passe par un fichier .mid (export de Sessions MIDI) puis revient.
const { events: back, duration } = parseMidiFile(buildMidiFile(events));
const a = analyzeMidiEvents(back, { duration });
check('isMidiPath : .mid et .MIDI', isMidiPath('/x/Ma session.mid') && isMidiPath('a.MIDI') && !isMidiPath('a.mp3'));
check(`Accords relevés : Dm7 → G13 → Cmaj7 (${a.chords.map((c) => c.chord).join(' → ')})`, a.chords.map((c) => c.chord).join() === 'Dm7,G13,Cmaj7');
check('Les accords se touchent (pas de trou dans la frise)', a.chords.every((c, i) => i === 0 || Math.abs(c.startTime - a.chords[i - 1].endTime) < 0.01));
check('Le dernier accord va jusqu\'à la fin du morceau', Math.abs(a.chords[2].endTime - 7.9) < 0.01 && Math.abs(a.duration - 7.9) < 0.01, `${a.chords[2].endTime} / ${a.duration}`);
check('Tonalité : Do majeur', a.key === 'C' && a.keyMode === 'major', `${a.key} ${a.keyMode}`);
check('Forme de l\'analyse audio (startTime, endTime, chord, role)', a.chords.every((c) => Number.isFinite(c.startTime) && Number.isFinite(c.endTime) && typeof c.chord === 'string' && c.role === 'structural'));
check('La basse de chaque accord (Ré3, Sol2, Do3)', a.bassSegments.map((b) => `${b.note}${b.octave}`).join() === 'D3,G2,C3', a.bassSegments.map((b) => `${b.note}${b.octave}`).join());
check('Un MIDI sans note : aucune erreur, aucun accord', analyzeMidiEvents([]).chords.length === 0);

// La pédale prolonge le son.
const pedalled = noteSpans([
  { type: 'control', controller: 64, value: 127, time: 0 },
  { type: 'note_on', note: 60, velocity: 0.8, time: 0 },
  { type: 'note_off', note: 60, velocity: 0, time: 0.5 },
  { type: 'note_on', note: 64, velocity: 0.8, time: 1 },
  { type: 'note_off', note: 64, velocity: 0, time: 1.2 },
  { type: 'control', controller: 64, value: 0, time: 2 },
]);
check('Pédale : Do tenu jusqu\'à la remontée (2 s)', pedalled.find((s) => s.midi === 60).end === 2 && pedalled.find((s) => s.midi === 64).end === 2);

const wav = encodeWav([new Float32Array([0, 0.5, -0.5, 1])], 44100);
const view = new DataView(wav.buffer);
check('WAV : en-tête RIFF/WAVE, 44 octets + données', String.fromCharCode(...wav.slice(0, 4)) === 'RIFF' && String.fromCharCode(...wav.slice(8, 12)) === 'WAVE' && wav.length === 44 + 8);
check('WAV : échantillons 16 bits', view.getInt16(46, true) === 16383 && view.getInt16(48, true) === -16384 && view.getInt16(50, true) === 32767);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
