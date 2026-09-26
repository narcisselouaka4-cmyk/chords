// [Claude] — 2026-09-25 — Tests de la voix du dessus (melody-line.js).
//
// Lancer : node src/recorder/test-melody-line.js

import { extractMelody, melodyLines } from './melody-line.js';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Jeu fabriqué : notes (début, durée), pédale. */
function take() {
  const events = [];
  const api = {
    note(at, midi, hold = 0.4, velocity = 0.7) {
      events.push({ type: 'note_on', note: midi, velocity, channel: 0, time: at });
      events.push({ type: 'note_off', note: midi, velocity: 0, channel: 0, time: at + hold });
      return api;
    },
    chord(at, notes, hold = 1, velocity = 0.6) { notes.forEach((n) => api.note(at, n, hold, velocity)); return api; },
    pedal(at, down) { events.push({ type: 'control', controller: 64, value: down ? 127 : 0, channel: 0, time: at }); return api; },
    events: () => [...events].sort((a, b) => a.time - b.time),
  };
  return api;
}

const midis = (melody) => melody.map((n) => n.midi).join(',');

function testMelodyOnTopOfChords() {
  // Dm9 → G13 → Cmaj9, mélodie La4 Sol4 Fa4 | Mi5 | Ré5 Do5 (Narcisse : « les top notes dans mes accords »).
  const t = take()
    .chord(0, [38, 53, 57, 60, 64], 1.9).note(0, 69, 0.9)
    .note(1, 67, 0.45).note(1.5, 65, 0.45)
    .chord(2, [43, 53, 59, 64], 1.9).note(2, 76, 1.8)
    .chord(4, [36, 52, 59, 62], 1.9).note(4, 74, 0.9).note(5, 72, 0.9);
  const melody = extractMelody(t.events());
  check('Mélodie sur les accords : La4 Sol4 Fa4 Mi5 Ré5 Do5', midis(melody) === '69,67,65,76,74,72', midis(melody));
  const lines = melodyLines(t.events());
  check('Texte pour le Copilote : groupé par accord, notes écrites d\'après l\'accord',
    lines.length === 3 && /^0:00,0 Dm9 : La4 Sol4 Fa4$/.test(lines[0]) && /^0:02,0 G13 : Mi5$/.test(lines[1]) && /^0:04,0 Cmaj9 : Ré5 Do5$/.test(lines[2]), lines.join(' / '));
}

function testAccompanimentUnderHeldNote() {
  // Mi5 tenu pendant que la main gauche marche : Do3 Ré3 Mi3 Sol3 ne sont pas la mélodie.
  const t = take().note(0, 76, 2).note(0.5, 48).note(1, 50).note(1.5, 52).note(2.2, 74, 0.5).note(2.4, 55);
  check('Basse qui marche sous une note tenue : pas dans la mélodie', midis(extractMelody(t.events())) === '76,74', midis(extractMelody(t.events())));
}

function testCompingBetweenMelodyNotes() {
  // Mélodie Sol4 La4 Si4 Do5 (notes brèves) ; accords de main gauche Do3 Mi3 Sol3 entre elles.
  const t = take();
  [67, 69, 71, 72].forEach((m, i) => { t.note(i, m, 0.3); t.chord(i + 0.5, [48, 52, 55], 0.3); });
  check('Accompagnement de main gauche entre les notes : pas dans la mélodie', midis(extractMelody(t.events())) === '67,69,71,72', midis(extractMelody(t.events())));
}

function testLineAlone() {
  const t = take();
  [60, 62, 64, 65, 67].forEach((m, i) => t.note(i * 0.3, m, 0.25));
  check('Ligne seule : toutes ses notes', midis(extractMelody(t.events())) === '60,62,64,65,67');
}

function testLegatoLine() {
  // Ligne qui descend legato : chaque touche relâchée 60 ms après la suivante.
  const t = take();
  [76, 74, 72, 71, 69, 67].forEach((m, i) => t.note(i * 0.25, m, 0.31));
  check('Ligne legato qui descend (touches qui se chevauchent) : toutes ses notes', midis(extractMelody(t.events())) === '76,74,72,71,69,67', midis(extractMelody(t.events())));
  // Voix intérieure qui bouge sous une note de mélodie tenue : pas la mélodie.
  const inner = take().note(0, 72, 2).note(0.5, 69, 0.5).note(1, 70, 0.8).note(2.1, 74, 0.5);
  check('Voix intérieure sous une note tenue : pas dans la mélodie', midis(extractMelody(inner.events())) === '72,74', midis(extractMelody(inner.events())));
}

function testPedalDoesNotLengthen() {
  const t = take().pedal(0, true).note(0, 72, 0.3).note(1, 74, 0.3).pedal(3, false);
  const [first] = extractMelody(t.events());
  check('Pédale enfoncée : la note de mélodie dure jusqu\'au relâchement de la touche (au plus jusqu\'à la suivante)', Math.abs(first.end - 0.3) < 1e-9, String(first.end));
}

function testEmpty() {
  check('Rien joué : pas de mélodie', extractMelody([]).length === 0 && melodyLines([]).length === 0);
}

testMelodyOnTopOfChords();
testAccompanimentUnderHeldNote();
testCompingBetweenMelodyNotes();
testLineAlone();
testLegatoLine();
testPedalDoesNotLengthen();
testEmpty();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
