// Tests — fichier MIDI : écriture (buildMidiFile) et lecture (parseMidiFile).
//
// Usage : node src/recorder/test-midi-file.js

import { buildMidiFile, parseMidiFile } from './serializer.js';

let failed = 0;
let passed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Une session : Do majeur plaqué à 0 s, la pédale, un Sol à 1,5 s, relâché à 2,25 s.
const events = [
  { type: 'note_on', note: 60, velocity: 0.8, channel: 0, time: 0 },
  { type: 'note_on', note: 64, velocity: 0.5, channel: 0, time: 0 },
  { type: 'control', controller: 64, value: 127, channel: 0, time: 0.1 },
  { type: 'note_off', note: 60, velocity: 0, channel: 0, time: 1 },
  { type: 'note_on', note: 64, velocity: 0, channel: 0, time: 1 },
  { type: 'note_on', note: 67, velocity: 1, channel: 0, time: 1.5 },
  { type: 'control', controller: 64, value: 0, channel: 0, time: 2 },
  { type: 'note_off', note: 67, velocity: 0, channel: 0, time: 2.25 },
];
const file = buildMidiFile(events, { name: 'Ma session' });
check('En-tête MThd', String.fromCharCode(...file.slice(0, 4)) === 'MThd');
const back = parseMidiFile(file);
check('Le nom de la session est dans le fichier', back.name === 'Ma session', back.name);
check('Même nombre d\'évènements', back.events.length === events.length, `${back.events.length}`);
const g = back.events.find((e) => e.type === 'note_on' && e.note === 67);
check('Les temps sont en secondes, au bon endroit (Sol à 1,5 s, pas 0,75 ni 3)', Math.abs(g.time - 1.5) < 0.002, `${g?.time}`);
check('La durée est respectée (2,25 s)', Math.abs(back.duration - 2.25) < 0.002, `${back.duration}`);
check('Les forces sont gardées (0,5 → 0,5 à 1/127 près)', Math.abs(back.events.find((e) => e.note === 64 && e.type === 'note_on').velocity - 0.5) < 0.01);
check('Une note_on à force nulle devient un relâchement', back.events.filter((e) => e.note === 64 && e.type === 'note_off').length === 1);
check('La pédale est gardée', back.events.filter((e) => e.type === 'control' && e.controller === 64).map((e) => e.value).join() === '127,0');

// Un fichier d'ailleurs : format 1, 96 ticks par noire, tempo à 60 puis 120 à la noire, statut
// courant, une piste de batterie à écarter.
const vlq = (n) => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
const chunk = (type, data) => [...type].map((c) => c.charCodeAt(0)).concat([(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255], data);
const tempoTrack = [0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40, ...vlq(192), 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0xff, 0x2f, 0];
const piano = [0, 0x90, 60, 100, ...vlq(96), 62, 90, ...vlq(96), 60, 0, ...vlq(96), 0x80, 62, 0, 0, 0xff, 0x2f, 0];
const drums = [0, 0x99, 36, 100, 10, 0x89, 36, 0, 0, 0xff, 0x2f, 0];
const external = new Uint8Array([...chunk('MThd', [0, 1, 0, 3, 0, 96]), ...chunk('MTrk', tempoTrack), ...chunk('MTrk', piano), ...chunk('MTrk', drums)]);
const ext = parseMidiFile(external);
const ons = ext.events.filter((e) => e.type === 'note_on');
check('Format 1 : les pistes sont fusionnées, la batterie écartée', ons.map((e) => e.note).join() === '60,62', ons.map((e) => e.note).join());
check('Statut courant et note_on à 0 compris (2 relâchements)', ext.events.filter((e) => e.type === 'note_off').length === 2);
check('Tempo 60 : Ré à 1 s', Math.abs(ons[1].time - 1) < 0.002, `${ons[1].time}`);
check('Changement de tempo à 120 : relâchement de Ré à 2,5 s', Math.abs(ext.duration - 2.5) < 0.002, `${ext.duration}`);
let threw = false;
try { parseMidiFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])); } catch { threw = true; }
check('Un fichier qui n\'est pas du MIDI est refusé clairement', threw);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
