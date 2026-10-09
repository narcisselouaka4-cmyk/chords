// [Claude] — 2026-10-04 — Tests de melodic-moves.js : ce que font les lignes du prof (lick,
// approche, remplacement d'un accord de la boucle).
// Exécutable avec : node src/pedagogie/test-melodic-moves.js

import { lineMoves, movesLines } from './melodic-moves.js';
import { songStructure } from './song-structure.js';

let total = 0;
let passed = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

// Sol majeur, deux secondes par accord : G Em C D, quatre tours ; au tour 2, le Do n'est pas
// joué (Em dure jusqu'à 14 s).
const chords = [];
const notes = [];
const VOICINGS = { G: [59, 62, 67], Em: [59, 64, 67], C: [60, 64, 67], D: [57, 62, 66] };
const BASS = { G: 43, Em: 40, C: 36, D: 38 };
const play = (label, start, end) => {
  chords.push({ start, end, label });
  notes.push({ midi: BASS[label], start, end: end - 0.1, hand: 'lh' });
  for (const midi of VOICINGS[label]) notes.push({ midi, start, end: end - 0.1, hand: 'rh' });
};
for (let k = 0; k < 4; k += 1) {
  const t = k * 8;
  play('G', t, t + 2);
  if (k === 1) {
    play('Em', t + 2, t + 6);
  } else {
    play('Em', t + 2, t + 4);
    play('C', t + 4, t + 6);
  }
  play('D', t + 6, t + 8);
}
const line = (hand, list) => list.forEach(([midi, start]) => notes.push({ midi, start, end: start + 0.18, hand }));
// Tour 1 : un lick sur G (Ré5 Mi5 Ré5 Si4) ; une descente Sol4 Fa#4 Fa4 qui arrive sur le Do
// plaqué à 4 s (sur son Mi4, la note la plus proche) ; à la main gauche, Mi2 Ré2 → Do2 à 4 s.
line('rh', [[74, 0.5], [76, 0.7], [74, 0.9], [71, 1.1]]);
line('rh', [[67, 3.3], [66, 3.55], [65, 3.8]]);
line('lh', [[40, 3.2], [38, 3.6]]);
// Tour 2 : à la place du Do (12 → 14 s), une ligne Do5 Si4 La4 Sol4.
line('rh', [[72, 12.2], [71, 12.5], [69, 12.8], [67, 13.1]]);
// Tour 3 : un lick « blues » sur G, avec la tierce mineure (Si♭4).
line('rh', [[67, 16.4], [70, 16.6], [71, 16.8], [74, 17.0]]);

const structure = songStructure({ chords, notes, key: 'G' });
const loop = structure.sections.find((s) => s.kind === 'loop');
check('La structure : G Em C D, le Do sauté au tour 2', loop && loop.pattern.map((x) => x.degree).join('-') === '1-6-4-5' && loop.missing.length === 1,
  JSON.stringify(structure.sections.map((s) => [s.kind, s.pattern?.map((x) => x.degree).join('-'), s.missing?.length])));

let moves = lineMoves({ notes, chords, structure, start: 0, end: 8 });
const lick = moves.find((m) => m.kind === 'lick');
check('Tour 1 : un lick sur G, décrit par ses notes (5 · 13 · 5 · 3)', lick && lick.over.name === 'G' && lick.over.degree === '1' && lick.roles.join(' · ') === '5 · 13 · 5 · 3' && !lick.blue,
  JSON.stringify(moves.map((m) => [m.kind, m.hand, m.roles?.join(' · '), m.over?.name])));
const approach = moves.find((m) => m.kind === 'approche' && m.hand === 'rh');
check('Une descente qui mène au 4 (C), et arrive sur sa tierce (Mi4) au changement',
  approach && approach.direction === 'descente' && approach.to.degree === '4' && approach.to.name === 'C' && approach.lands.midi === 64 && approach.to.at === 4,
  JSON.stringify(approach));
const walk = moves.find((m) => m.kind === 'approche' && m.hand === 'lh');
check('À la main gauche, une marche de basse Mi2 Ré2 Do2 vers le 4 (sa fondamentale)', walk && walk.notes.join(',') === '40,38,36' && walk.lands.role === '1',
  JSON.stringify(walk));

moves = lineMoves({ notes, chords, structure, start: 8, end: 16 });
const instead = moves.find((m) => m.kind === 'remplacement');
check('Tour 2 : la ligne joue à la place du 4 (C), absent à ce tour', instead && instead.instead.degree === '4' && instead.instead.name === 'C' && !instead.played,
  JSON.stringify(moves.map((m) => [m.kind, m.instead?.degree])));

moves = lineMoves({ notes, chords, structure, start: 16, end: 24 });
const blues = moves.find((m) => m.kind === 'lick');
check('Tour 3 : un lick avec la tierce mineure sur un accord majeur, « notes bleues »', blues && blues.blue && blues.roles.includes('(b3)') || blues?.roles.includes('#9'),
  JSON.stringify(blues));

console.log('Pour le Copilote');
const lines = movesLines(lineMoves({ notes, chords, structure, start: 0, end: 16 }));
check('« lick sur G (le 1) — 5 · 13 · 5 · 3 »', lines.some((l) => l === '- 0:00–0:01 main droite : lick sur G (le 1) — 5 · 13 · 5 · 3.'), lines.join('\n'));
check('« descente (…) qui mène au 4 (C) : elle arrive sur sa tierce (Mi4) à 0:04 »',
  lines.some((l) => /^- 0:03–0:04 main droite : descente \(Sol4 Fa♯4 Fa4 Mi4\) qui mène au 4 \(C\) : elle arrive sur sa tierce \(Mi4\) à 0:04\.$/.test(l)), lines.join('\n'));
check('« marche de basse (Mi2 Ré2 Do2) qui mène au 4 (C) : … sa fondamentale (Do2) »',
  lines.some((l) => /marche de basse \(Mi2 Ré2 Do2\) qui mène au 4 \(C\) : elle arrive sur sa fondamentale \(Do2\) à 0:04/.test(l)), lines.join('\n'));
check('« ligne (…) à la place du 4 (C) de la boucle, qui n\'est pas joué à ce tour »',
  lines.some((l) => /ligne \(Do5 Si4 La4 Sol4\) à la place du 4 \(C\) de la boucle, qui n'est pas joué à ce tour\.$/.test(l)), lines.join('\n'));
check('Rien à dire : pas de bloc', movesLines([]).length === 0);

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;
