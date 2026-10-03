// [Claude] — 2026-09-24 — Tests des exemples joués par le Copilote IA
// (copilot-demo.js) : deux mains, voicings rootless enchaînés par défaut,
// triades et accords sur basse voicés, registre, technique demandée.
//
// Lancer : node src/pedagogie/test-copilot-demo.js

import { buildChordExample, buildExampleChords, voiceChord } from './copilot-demo.js';

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

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const pcOf = (n) => ((n % 12) + 12) % 12;
const noteName = (n) => `${NAMES[pcOf(n)]}${Math.floor(n / 12) - 1}`;
const show = (c) => `${c.name} ${c.leftHand.map(noteName).join(' ')} | ${c.rightHand.map(noteName).join(' ')}`;
const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const rootOf = (name) => (PCS[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;

function testTwoHandsByDefault() {
  const ex = buildChordExample(['Dm7', 'G7', 'Cmaj7']);
  check('2-5-1 : trois accords, dans l\'ordre', ex?.title === 'Dm7 → G7 → Cmaj7', ex?.title);
  const all = ex.chords.every((c) => c.leftHand.length >= 1 && c.rightHand.length >= 3);
  check('2-5-1 : basse à gauche, trois notes au moins à droite (plus de shell à une main)', all, ex.chords.map(show).join(' / '));
  check('2-5-1 : la basse est la fondamentale', ex.chords.every((c) => pcOf(Math.min(...c.leftHand)) === rootOf(c.name)), ex.chords.map(show).join(' / '));
  check('2-5-1 : main droite en rootless', ex.chords.every((c) => c.technique === 'rootless'), ex.chords.map((c) => c.technique).join(' '));
  // Voicings enchaînés : le dessus bouge d'une tierce au plus d'un accord à l'autre.
  const tops = ex.chords.map((c) => Math.max(...c.rightHand));
  check('2-5-1 : voix du dessus enchaînée (tierce au plus)', tops.slice(1).every((t, i) => Math.abs(t - tops[i]) <= 4), tops.map(noteName).join(' → '));
  const hands = new Set(ex.events.filter((e) => e.type === 'noteOn').map((e) => e.hand));
  check('2-5-1 : les deux mains jouent', hands.has('lh') && hands.has('rh'));
  check('Sous-titre : style et main droite', /Ballade · 3 accords · main droite en voicings rootless/.test(ex.subtitle), ex.subtitle);
}

function testRegisterLift() {
  const ex = buildChordExample(['Bm7b5', 'E7', 'Am7']);
  const lows = ex.chords.map((c) => Math.min(...c.rightHand));
  check('II-V-I mineur : main droite pas sous Mi3 (rootless remonté d\'une octave)', lows.every((n) => n >= 52), ex.chords.map(show).join(' / '));
  check('II-V-I mineur : basse sous la main droite', ex.chords.every((c) => Math.max(...c.leftHand) < Math.min(...c.rightHand)));
}

function testTriadsAndSlashChords() {
  const worship = buildChordExample(['F', 'G', 'Am'], { styleId: 'worship' });
  check('Triades F G Am : aucun accord perdu', worship?.title === 'F → G → Am', worship?.title);
  const triadsOk = worship.chords.every((c) => {
    const want = new Set({ F: [5, 9, 0], G: [7, 11, 2], Am: [9, 0, 4] }[c.name]);
    return c.rightHand.length === 3 && c.rightHand.every((n) => want.has(pcOf(n)));
  });
  check('Triades : main droite = la triade', triadsOk, worship.chords.map(show).join(' / '));
  const moves = worship.chords.slice(1).map((c, i) => Math.abs(Math.max(...c.rightHand) - Math.max(...worship.chords[i].rightHand)));
  check('Triades : reliées par le plus petit mouvement (dessus à une tierce au plus)', moves.every((m) => m <= 4), moves.join(' '));
  const pop = buildChordExample(['C', 'G/B', 'Am', 'F']);
  const gb = pop.chords[1];
  check('G/B : la basse écrite (Si) à la main gauche', pcOf(Math.min(...gb.leftHand)) === 11, show(gb));
  check('G/B : triade de Sol à la main droite', gb.rightHand.every((n) => [7, 11, 2].includes(pcOf(n))), show(gb));
  const basses = pop.chords.map((c) => pcOf(Math.min(...c.leftHand)));
  check('C G/B Am F : ligne de basse Do Si La Fa', basses.join(',') === '0,11,9,5', basses.join(','));
}

function testBasslessVoicingRevoiced() {
  const ex = buildChordExample(['C6/9']);
  const c = ex.chords[0];
  check('C6/9 : une basse (Do) sous la main droite', pcOf(Math.min(...c.leftHand)) === 0 && Math.min(...c.leftHand) <= 48, show(c));
  check('C6/9 : la main droite garde les couleurs (6te et 9e)', c.rightHand.some((n) => pcOf(n) === 9) && c.rightHand.some((n) => pcOf(n) === 2), show(c));
  const sus = buildExampleChords(['Gsus4', 'G7']);
  check('Gsus4 → G7 : plus de shell à deux notes', sus[0].voicing.rightHand.length === 3, `${sus[0].name} ${sus[0].voicing.technique}`);
}

function testRequestedTechniqueKept() {
  const ex = buildChordExample(['Dm7', 'G7', 'Cmaj7'], { technique: 'rootless', pattern: 'block' });
  check('Rootless demandé, plaqué : le voicing tel quel, sans basse ajoutée', ex.chords.every((c) => c.rightHand.length === 0 && c.leftHand.length === 4), ex.chords.map(show).join(' / '));
  check('Rootless demandé : sous-titre « voicing Rootless (A/B) »', /voicing Rootless/.test(ex.subtitle), ex.subtitle);
  const block = buildChordExample(['Dm7', 'G7', 'Cmaj7'], { pattern: 'block' });
  check('Plaqué sans technique demandée : les deux mains quand même', block.chords.every((c) => c.leftHand.length >= 1 && c.rightHand.length >= 3), block.chords.map(show).join(' / '));
}

function testVoiceChord() {
  const c = voiceChord('C/E');
  check('voiceChord C/E : Mi en octave à la main gauche', c.voicing.leftHand.length === 2 && c.voicing.leftHand.every((n) => pcOf(n) === 4), c.voicing.leftHand.map(noteName).join(' '));
  check('voiceChord : accord inconnu → null', voiceChord('Xyz') === null);
}

testTwoHandsByDefault();
testRegisterLift();
testTriadsAndSlashChords();
testBasslessVoicingRevoiced();
testRequestedTechniqueKept();
testVoiceChord();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
