// [Claude] — 2026-10-03 — Tests de example-transport.js : la barre de lecture des exemples du
// Copilote (durée, instant dans la vidéo, pauses du prof signalées).
// Exécutable avec : node src/pedagogie/test-example-transport.js

import {
  BACK_SECONDS, secondsPerBeat, exampleSeconds, videoTimeAt, markerAt, markerNote, markerSpans, timeLabel,
} from './example-transport.js';
import { passageExample } from './teacher-notes.js';

let total = 0;
let passed = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log('Durée');
check('Tempo 60 : un temps = une seconde', secondsPerBeat({ tempo: 60 }) === 1 && secondsPerBeat({}) === 1);
check('Tempo 120 : un temps = une demi-seconde', secondsPerBeat({ tempo: 120 }) === 0.5);
check('Durée = le dernier évènement', exampleSeconds({ tempo: 120, beats: 8, events: [{ time: 0 }, { time: 9 }] }) === 4.5);
check('« ⟲ 5 s »', BACK_SECONDS === 5);

// Le cas de Narcisse : le prof joue Do à 9:57, explique de 9:58 à 10:10, puis joue Mi.
const example = passageExample(
  [{ midi: 60, start: 597, end: 598 }, { midi: 64, start: 610, end: 611 }],
  { start: 597, end: 657, speech: [{ start: 598.2, end: 609.5, kind: 'parle' }] },
);
console.log('Instant dans la vidéo');
check('L\'exemple : Do, 2 s d\'explication, Mi', example.markers.length === 1 && Math.abs(example.events.find((e) => e.note === 64 && e.type === 'noteOn').time - 3) < 0.01,
  JSON.stringify(example.markers));
check('0 s → 9:57', videoTimeAt(example, 0) === 597);
check('0,5 s → 9:57,5 (avant la pause, le temps file pareil)', Math.abs(videoTimeAt(example, 0.5) - 597.5) < 1e-9);
check('Pendant la pause raccourcie : on traverse l\'explication (2 s pour 12 s)', Math.abs(videoTimeAt(example, 2) - 604) < 1e-9, String(videoTimeAt(example, 2)));
check('3 s → 10:10, la note Mi', Math.abs(videoTimeAt(example, 3) - 610) < 1e-9);
check('Sans table : le début dans la vidéo + le temps', videoTimeAt({ tutorialStart: 30 }, 4) === 34);
check('Un exemple qui ne vient pas de la vidéo : rien', videoTimeAt({ events: [] }, 4) === null);

console.log('Pauses du prof');
const pause = markerAt(example, 2);
check('À 2 s, on est dans son explication', pause?.kind === 'parle' && markerAt(example, 0.5) === null && markerAt(example, 3.2) === null);
check('La phrase peut rester un peu après la pause (le temps de la lire)', markerAt(example, 4.5, { after: 2.5 })?.kind === 'parle' && markerAt(example, 5.6, { after: 2.5 }) === null);
check('Phrase affichée', markerNote(pause) === 'Ici, le prof explique (9:58 → 10:10) : sa pause est raccourcie à 2 s.', markerNote(pause));
check('Une pause sans parole est dite autrement', /s'arrête de jouer/.test(markerNote({ ...pause, kind: 'pause' })));
const spans = markerSpans(example);
check('Marque sur la barre : à sa place, en %', spans.length === 1 && spans[0].kind === 'parle' && spans[0].left > 0 && spans[0].width > 0
  && /explique \(9:58 → 10:10\)/.test(spans[0].title), JSON.stringify(spans));
check('Pas de durée : pas de marque', markerSpans(example, 0).length === 0);
check('« 0:12 / 0:45 »', timeLabel(12.4, 45) === '0:12 / 0:45');

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;
