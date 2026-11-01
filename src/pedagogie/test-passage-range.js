// [Claude] — 2026-10-03 — Tests de passage-range.js : la plage du Copilote, choisie avec des
// listes (Début / Fin), 10 minutes au plus.
// Exécutable avec : node src/pedagogie/test-passage-range.js

import {
  splitTime, joinTime, timeOptions, setRangeBound, rangeLength, MAX_PASSAGE_SECONDS, FOLLOW_SECONDS,
} from './passage-range.js';

let total = 0;
let passed = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); } else console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log('Heures, minutes, secondes');
check('9:57 → 0 h 9 min 57 s, et retour', JSON.stringify(splitTime(597)) === '{"h":0,"m":9,"s":57}' && joinTime({ m: 9, s: 57 }) === 597);
check('1:02:05 → 1 h 2 min 5 s', JSON.stringify(splitTime(3725.8)) === '{"h":1,"m":2,"s":5}');

console.log('Les listes');
const short = timeOptions(751); // 12:31
check('Vidéo de 12:31 : pas d\'heures, minutes 0 à 12, secondes 0 à 59',
  short.hours.length === 0 && short.minutes.length === 13 && short.minutes.at(-1) === 12 && short.seconds.length === 60 && short.seconds.at(-1) === 59);
const long = timeOptions(5400); // 1:30:00
check('Vidéo de 1:30:00 : heures 0 et 1, minutes 0 à 59', JSON.stringify(long.hours) === '[0,1]' && long.minutes.length === 60);
check('Durée inconnue : seulement la minute 0', timeOptions(NaN).minutes.length === 1);

console.log('Les bords');
const amazing = setRangeBound(setRangeBound({ start: 0, end: 30 }, 'start', 597, 751), 'end', 657, 751);
check('Amazing Grace : 9:57 → 10:57', amazing.start === 597 && amazing.end === 657, JSON.stringify(amazing));
check('Une plage de 10 min est permise', setRangeBound({ start: 60, end: 90 }, 'end', 660, 751).end === 660);
const tooLong = setRangeBound({ start: 60, end: 90 }, 'end', 700, 751);
check(`Plus de ${MAX_PASSAGE_SECONDS / 60} min : le début suit, et l'écran le dit`, tooLong.start === 100 && tooLong.end === 700 && tooLong.adjusted === 'start', JSON.stringify(tooLong));
const startAfterEnd = setRangeBound({ start: 10, end: 40 }, 'start', 120, 751);
check(`Début après la fin : la fin suit (${FOLLOW_SECONDS} s plus loin)`, startAfterEnd.start === 120 && startAfterEnd.end === 150 && startAfterEnd.adjusted === 'end', JSON.stringify(startAfterEnd));
const endBeforeStart = setRangeBound({ start: 300, end: 330 }, 'end', 200, 751);
check('Fin avant le début : le début suit', endBeforeStart.end === 200 && endBeforeStart.start === 170 && endBeforeStart.adjusted === 'start', JSON.stringify(endBeforeStart));
const atEnd = setRangeBound({ start: 0, end: 30 }, 'start', 9999, 751);
check('Rien au-delà de la fin de la vidéo', atEnd.start === 750 && atEnd.end === 751, JSON.stringify(atEnd));
check('Durée lisible', rangeLength({ start: 597, end: 657 }) === '1:00' && rangeLength({ start: 0, end: 600 }) === '10:00' && rangeLength({ start: 0, end: 3725 }) === '1:02:05');

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;
