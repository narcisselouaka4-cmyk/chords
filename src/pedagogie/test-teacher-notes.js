// [Claude] — 2026-09-25 — Tests des notes du professeur (teacher-notes.js) : touches
// allumées image par image → notes, notes de V2N ou du son → notes, mains, frise
// pour le Copilote, transposition, passage rejoué en exemple.
//
// Lancer : node src/pedagogie/test-teacher-notes.js

import {
  samplesToNoteEvents, eventsFromTranscription, guessHands, notesInRange, notesAt,
  compactTimeline, transposeInterval, transposeChordLabel, passageExample,
} from './teacher-notes.js';

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

// Le professeur : Dm9 (Ré2 | Fa3 La3 Do4 Mi4) de 0 à 2 s, puis un lick Ré Ré# Mi sur G13.
const TEACHER = [
  { midi: 38, start: 0, end: 1.9, hand: 'lh' },
  { midi: 53, start: 0, end: 1.9, hand: 'rh' },
  { midi: 57, start: 0, end: 1.9, hand: 'rh' },
  { midi: 60, start: 0, end: 1.9, hand: 'rh' },
  { midi: 64, start: 0, end: 1.9, hand: 'rh' },
  { midi: 74, start: 2, end: 2.2, hand: 'rh' },
  { midi: 75, start: 2.25, end: 2.45, hand: 'rh' },
  { midi: 76, start: 2.5, end: 3, hand: 'rh' },
];
const GRID = [{ start: 0, end: 2, label: 'Dm9' }, { start: 2, end: 4, label: 'G13' }];

function testSamples() {
  // Clavier dessiné lu 4 fois par seconde : Do4 allumé 3 images, Mi4 2 images (main gauche).
  const samples = [
    { t: 0, keys: [{ midi: 60, hand: 'right' }, { midi: 52, hand: 'left' }] },
    { t: 0.25, keys: [{ midi: 60, hand: 'right' }, { midi: 52, hand: 'left' }] },
    { t: 0.5, keys: [{ midi: 60, hand: 'right' }] },
    { t: 0.75, keys: [] },
    { t: 1, keys: [{ midi: 67 }] },
  ];
  const notes = samplesToNoteEvents(samples, 0.25);
  const c = notes.find((n) => n.midi === 60);
  const e = notes.find((n) => n.midi === 52);
  const g = notes.find((n) => n.midi === 67);
  check('Images → notes : une note par touche allumée d\'affilée', notes.length === 3, JSON.stringify(notes));
  check('Images → notes : début et fin (Do4 de 0 à 0,75 s)', c?.start === 0 && c?.end === 0.75, JSON.stringify(c));
  check('Images → notes : main d\'après la couleur', c?.hand === 'rh' && e?.hand === 'lh' && e?.end === 0.5 && g?.hand === null);
  check('Images → notes : touche encore allumée à la fin, fermée une image plus tard', g?.end === 1.25, JSON.stringify(g));
}

function testTranscription() {
  const notes = eventsFromTranscription([
    { midi: 62, onset: 1.004, offset: 1.5, velocity: 90 },
    { midi: 60, onset: 0.5, offset: 0.4 },
    { midi: null, onset: 2 },
  ]);
  check('V2N / son → notes : triées, invalides écartées', notes.length === 2 && notes[0].midi === 60, JSON.stringify(notes));
  check('V2N / son → notes : fin absente ou avant le début → 0,25 s', notes[0].end === 0.75);
  check('V2N / son → notes : vélocité ramenée entre 0 et 1', Math.abs(notes[1].velocity - 90 / 127) < 1e-9 && notes[1].start === 1);
}

function testHands() {
  const bare = TEACHER.map(({ hand, ...n }) => n);
  const hands = guessHands(bare);
  check('Mains devinées : Ré2 sous la grande coupure → main gauche', hands.find((n) => n.midi === 38).hand === 'lh');
  check('Mains devinées : Fa3 La3 Do4 Mi4 → main droite', hands.filter((n) => [53, 57, 60, 64].includes(n.midi)).every((n) => n.hand === 'rh'));
  check('Mains devinées : note seule au-dessus de Do4 → main droite', hands.find((n) => n.midi === 76).hand === 'rh');
  check('Mains données (couleur) gardées', guessHands([{ midi: 72, start: 0, end: 1, hand: 'lh' }])[0].hand === 'lh');
}

function testRangeAndTimeline() {
  check('Passage 2–3 s : les trois notes du lick', notesInRange(TEACHER, 2, 3).map((n) => n.midi).join(',') === '74,75,76');
  check('Passage main gauche seule', notesInRange(TEACHER, 0, 3, { hand: 'LH' }).map((n) => n.midi).join(',') === '38');
  check('Ce qui sonne à 1 s : le Dm9', notesAt(TEACHER, 1).length === 5);
  const lines = compactTimeline(TEACHER, GRID);
  check('Frise : une ligne par accord de la grille', lines.length === 2, lines.join(' / '));
  check('Frise : Dm9 main gauche | main droite', lines[0] === '- 0:00 Dm9 : Ré2 | Fa3 La3 Do4 Mi4', lines[0]);
  check('Frise : le lick de G13 en ligne', /^- 0:02 G13 : — \| Ré5 · puis Ré#5 Mi5$|^- 0:02 G13 : — \| Ré5 · puis Mib5 Mi5$/.test(lines[1]), lines[1]);
  const free = compactTimeline(TEACHER, []);
  check('Frise sans grille : groupes de huit secondes', free.length === 1 && /^- 0:00 : Ré2\(g\)/.test(free[0]), free.join(' / '));
  const many = compactTimeline(Array.from({ length: 50 }, (_, i) => ({ midi: 60, start: i * 2, end: i * 2 + 1 })), Array.from({ length: 50 }, (_, i) => ({ start: i * 2, end: i * 2 + 2, label: 'C' })), { maxLines: 5 });
  check('Frise bornée : 5 lignes puis « suite non détaillée »', many.length === 6 && /non détaillée/.test(many[5]));
  check('Frise vide sans notes', compactTimeline([], GRID).length === 0);
  // Amazing Grace, 0:47 : le Fa# d'un D9 s'écrit Fa#, pas Solb.
  const d9 = compactTimeline([38, 54, 57, 60, 64].map((midi) => ({ midi, start: 47, end: 49 })), [{ start: 47, end: 50, label: 'D9' }]);
  check('Frise : notes écrites d\'après l\'accord (D9 : Fa#3)', d9[0] === '- 0:47 D9 : Ré2 | Fa#3 La3 Do4 Mi4', d9[0]);
}

function testTranspose() {
  check('Transposer de Do en Fa : +5', transposeInterval('C', 'F') === 5);
  check('Transposer de Do en Sol : −5 (le plus court)', transposeInterval('Do majeur', 'Sol') === -5);
  check('Transposer de Sib en Do : +2', transposeInterval('Sib', 'C') === 2);
  check('Transposer de Ré mineur en Mi : +2', transposeInterval('Ré mineur', 'Mi') === 2);
  check('Tonalité inconnue : pas de transposition', transposeInterval('', 'F') === 0);
  check('Accord transposé : Dm9 +3 → Fm9, C/E +2 → D/F#', transposeChordLabel('Dm9', 3) === 'Fm9' && transposeChordLabel('C/E', 2) === 'D/F#');
}

function testPassageExample() {
  const ex = passageExample(TEACHER, { start: 0, end: 3, title: 'Le passage de 0:00' });
  const ons = ex.events.filter((e) => e.type === 'noteOn');
  check('Passage en exemple : les notes exactes du professeur', ons.map((e) => e.note).join(',') === '38,53,57,60,64,74,75,76', ons.map((e) => e.note).join(','));
  check('Passage en exemple : moments gardés (lick à 2 s), mains gardées', ons.find((e) => e.note === 74).time === 2 && ons.find((e) => e.note === 38).hand === 'lh');
  check('Passage en exemple : le moment de la vidéo est gardé', ex.kind === 'tutorial' && ex.tutorialStart === 0 && ex.tutorialEnd === 3 && ex.title === 'Le passage de 0:00');
  check('Passage en exemple : rien à marquer au clavier (touches en jaune)', ex.steps === undefined && ex.events.every((e) => e.type === 'noteOn' || e.type === 'noteOff'));
  const up = passageExample(TEACHER, { start: 2, end: 3, semitones: 3 });
  check('Passage transposé de +3 : notes transposées', up.events.filter((e) => e.type === 'noteOn').map((e) => e.note).join(',') === '77,78,79', up.events.filter((e) => e.type === 'noteOn').map((e) => e.note).join(','));
  check('Passage transposé : dit dans le sous-titre', /transposées de \+3 demi-tons/.test(up.subtitle), up.subtitle);
  check('Main gauche seule', passageExample(TEACHER, { start: 0, end: 3, hand: 'LH' }).events.filter((e) => e.type === 'noteOn').length === 1);
  check('Rien entre deux instants → pas d\'exemple', passageExample(TEACHER, { start: 10, end: 12 }) === null);
}

testSamples();
testTranscription();
testHands();
testRangeAndTimeline();
testTranspose();
testPassageExample();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
