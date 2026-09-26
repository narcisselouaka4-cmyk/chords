// [Claude] — 2026-09-25 — Tests de la relecture exacte d'une session (player.js) :
// note posée pile au début d'un moment, pédale rejouée, ce qui sonnait remis en
// place quand on reprend au milieu d'un passage.
//
// Lancer : node src/recorder/test-player.js

import { createPlayer } from './player.js';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function recorderPlayer() {
  const received = [];
  const player = createPlayer({
    onNoteOn: (note, velocity) => received.push(`on ${note}`),
    onNoteOff: (note) => received.push(`off ${note}`),
    onSustain: (down) => received.push(`pedal ${down ? 'down' : 'up'}`),
  });
  return { player, received };
}

// Session : pédale à 0, Dm9 à 0 (pile au début), G13 pile à 2 s, pédale relevée à 3,5 s.
const EVENTS = [
  { type: 'control', controller: 64, value: 127, time: 0 },
  ...[38, 53, 57, 60, 64].flatMap((n) => [{ type: 'note_on', note: n, velocity: 0.7, time: 0 }, { type: 'note_off', note: n, time: 1.9 }]),
  ...[43, 53, 57, 59, 64].flatMap((n) => [{ type: 'note_on', note: n, velocity: 0.7, time: 2 }, { type: 'note_off', note: n, time: 3.9 }]),
  { type: 'control', controller: 64, value: 0, time: 3.5 },
];

async function testStartIncluded() {
  const { player, received } = recorderPlayer();
  player.load(EVENTS);
  player.setSpeed(20);
  player.play();
  for (let i = 0; i < 100 && player.isPlaying; i += 1) await sleep(10);
  check('Début : la pédale et l\'accord posés à 0 s sont joués', received[0] === 'pedal down' && received.filter((r) => r.startsWith('on ')).length === 10, received.slice(0, 7).join(', '));
  check('Pédale relevée rejouée', received.includes('pedal up'));
}

async function testSeekOnMoment() {
  const { player, received } = recorderPlayer();
  player.load(EVENTS);
  player.seek(2);
  player.setSpeed(20);
  player.play();
  await sleep(40);
  player.pause();
  const ons = received.filter((r) => r.startsWith('on ')).map((r) => Number(r.slice(3)));
  check('Saut pile sur un moment (2 s) : G13 joué, rien de Dm9', [43, 53, 57, 59, 64].every((n) => ons.includes(n)) && !ons.includes(38), received.join(', '));
  check('Saut pile sur un moment : pédale enfoncée remise', received[0] === 'pedal down', received.join(', '));
}

async function testSeekInsideChord() {
  const { player, received } = recorderPlayer();
  player.load(EVENTS);
  player.seek(1);
  player.play();
  await sleep(30);
  player.pause();
  check('Reprise au milieu de Dm9 : les touches tenues sonnent à nouveau', [38, 53, 57, 60, 64].every((n) => received.includes(`on ${n}`)), received.join(', '));
  check('Pause : tout relâché, pédale relevée', received.slice(-1)[0] === 'pedal up', received.slice(-3).join(', '));
}

await testStartIncluded();
await testSeekOnMoment();
await testSeekInsideChord();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
