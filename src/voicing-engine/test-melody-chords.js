// [Claude] — 2026-09-25 — Tests des melody chords (melody-chords.js).
//
// Narcisse : « la top note porte la mélodie, la basse est indépendante (cycle
// de quintes ou de tierces), on comble avec des notes de l'accord ».
//
// Lancer : node src/voicing-engine/test-melody-chords.js

import { parseMelodyText, parseKeyName, guessKey, harmonizeMelody } from './melody-chords.js';
import { noteRoles } from '../pedagogie/note-roles.js';
import { minorNinthClashes, respectsLowIntervalLimits } from './textbook-voicings.js';

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

const pcOf = (n) => ((n % 12) + 12) % 12;
// Changements de basse (une basse tenue sous deux notes n'en est pas un).
const moves = (result) => {
  const roots = result.chords.filter((c) => !c.passing).map((c) => c.rootPc);
  return roots.slice(1).map((r, i) => pcOf(r - roots[i])).filter((d) => d !== 0);
};
const grid = (result) => result.chords.filter((c) => !c.passing).map((c) => c.chord).join(' ');

const MELODIES = {
  miReDo: 'Mi4 Ré4 Do4:2',
  scale: 'Do5 Si4 La4 Sol4 Fa4 Mi4 Ré4 Do4:2',
  amazing: 'Ré4 Sol4:2 Si4:0.5 Sol4:0.5 Si4:2 La4 Sol4:2 Mi4 Ré4:2',
  minor: 'Mi5 Ré5 Do5 Si4 La4:2',
  high: 'Sol5 Fa5 Mi5 Ré5 Do5:2',
};

function testParse() {
  const m = parseMelodyText('Mi4 Ré4 Do4:2');
  check('Mélodie tapée : « Mi4 Ré4 Do4:2 »', m.map((n) => `${n.midi}:${n.beats}`).join(' ') === '64:1 62:1 60:2', JSON.stringify(m));
  check('Noms anglais et altérations : « E4 Bb3 F#4 Sib3 Fa#4:0,5 »', parseMelodyText('E4 Bb3 F#4 Sib3 Fa#4:0,5').map((n) => `${n.midi}:${n.beats}`).join(' ') === '64:1 58:1 66:1 58:1 66:0.5');
  check('Sans octave : la note la plus proche de la précédente', parseMelodyText('Mi Ré Do Si').map((n) => n.midi).join(',') === '64,62,60,59');
  check('Mots ignorés, séparateurs variés', parseMelodyText('mélodie : Do4, Ré4 → Mi4').map((n) => n.midi).join(',') === '60,62,64');
  check('Tonalités tapées', parseKeyName('Sib')?.pc === 10 && parseKeyName('La mineur')?.minor === true && parseKeyName('F#m')?.pc === 6 && parseKeyName('Do majeur')?.minor === false && parseKeyName('xyz') === null);
  check('Tonalité devinée : Mi Ré Do → Do majeur', guessKey(m).pc === 0);
}

function testTopNoteAndChords() {
  for (const [name, text] of Object.entries(MELODIES)) {
    const melody = parseMelodyText(text);
    for (const bass of ['quintes', 'tierces', 'libre']) {
      const r = harmonizeMelody(melody, { bass });
      const chords = r.chords.filter((c) => !c.passing);
      const top = chords.every((c) => Math.max(...c.rightHand) === c.melody && Math.max(...c.leftHand, ...c.rightHand) === c.melody);
      const fits = chords.every((c) => {
        const role = noteRoles(c.chord, [c.melody])[0];
        return role && (role.inChord || role.tension);
      });
      const span = chords.every((c) => Math.max(...c.rightHand) - Math.min(...c.rightHand) <= 12 && c.rightHand.length >= 3 && c.rightHand.length <= 4);
      const left = chords.every((c) => c.leftHand[0] >= 36 && c.leftHand[0] <= 47 && pcOf(c.leftHand[0]) === c.rootPc && Math.max(...c.leftHand) - c.leftHand[0] <= 16 && Math.max(...c.leftHand) < Math.min(...c.rightHand));
      const clean = chords.every((c) => {
        const all = [...c.leftHand, ...c.rightHand];
        return minorNinthClashes(all, c.rootPc, { flatNineChord: /b9/.test(c.quality) }).length === 0
          && respectsLowIntervalLimits(c.leftHand) && respectsLowIntervalLimits(c.rightHand)
          && !c.rightHand.slice(0, -1).some((n) => pcOf(n) === pcOf(c.melody) || c.melody - n === 1);
      });
      const ok = top && fits && span && left && clean;
      check(`${name} (${bass}) : dessus = mélodie, note de l'accord ou tension, mains jouables`, ok, `${grid(r)} | top ${top} fits ${fits} span ${span} left ${left} clean ${clean}`);
    }
  }
}

function testCycles() {
  const scale = parseMelodyText(MELODIES.scale);
  const fifths = harmonizeMelody(scale, { bass: 'quintes' });
  const f = moves(fifths);
  check('Basse en quintes suivie (≥ 80 % des changements de basse une quinte plus bas)', f.filter((d) => d === 5 || d === 6).length / f.length >= 0.8, `${grid(fifths)} [${f.join(' ')}]`);
  const thirds = harmonizeMelody(scale, { bass: 'tierces' });
  const t = moves(thirds);
  check('Basse en tierces suivie (≥ 80 % des changements de basse une tierce plus bas)', t.filter((d) => d === 8 || d === 9).length / t.length >= 0.8, `${grid(thirds)} [${t.join(' ')}]`);
  const amazing = harmonizeMelody(parseMelodyText(MELODIES.amazing), { key: 'G' });
  const a = moves(amazing);
  check('Amazing Grace en Sol, basse en quintes (≥ 80 %)', a.filter((d) => d === 5 || d === 6).length / a.length >= 0.8, `${grid(amazing)} [${a.join(' ')}]`);
}

function testKeyAndEnding() {
  const r = harmonizeMelody(parseMelodyText(MELODIES.miReDo));
  check('Mi Ré Do : un 2-5-1 en Do (Dm9 G9 Cmaj7)', grid(r) === 'Dm9 G9 Cmaj7' && r.key.label === 'Do majeur' && r.key.guessed, `${grid(r)} (${r.key.label})`);
  const amazing = harmonizeMelody(parseMelodyText(MELODIES.amazing), { key: 'Sol' });
  const last = amazing.chords[amazing.chords.length - 1];
  check('Fin sur la tonique quand la dernière note le permet (Ré4 → Gmaj7 ou G6…)', last.rootPc === 7 && /^G(maj|6)/.test(last.chord) && !amazing.key.guessed, last.chord);
  const minor = harmonizeMelody(parseMelodyText(MELODIES.minor), { key: 'La mineur' });
  const end = minor.chords[minor.chords.length - 1];
  check('La mineur : fin sur Am', end.rootPc === 9 && /^Am/.test(end.chord), grid(minor));
  check('Résumé lisible : note = rôle de l\'accord', /^Mi4 = 9e de Dm9 · Ré4 = quinte de G9 · Do4 = fondamentale de Cmaj7$/.test(r.summary), r.summary);
}

function testEveryAndDeterminism() {
  const melody = parseMelodyText(MELODIES.amazing);
  const strong = harmonizeMelody(melody, { key: 'G', every: 'temps-fort' });
  const passing = strong.chords.filter((c) => c.passing);
  check('« temps-fort » : les notes brèves passent sur l\'accord tenu', passing.length === 2 && passing.every((c) => c.leftHand.length === 0 && c.rightHand.length === 1 && c.role === 'passage'), JSON.stringify(passing.map((c) => c.chord)));
  const a = JSON.stringify(harmonizeMelody(melody, { key: 'G' }));
  const b = JSON.stringify(harmonizeMelody(melody, { key: 'G' }));
  check('Déterministe : même mélodie, mêmes accords', a === b);
  const timed = harmonizeMelody([{ midi: 64, beats: 0.8, start: 1.2 }, { midi: 62, beats: 0.5, start: 2.1 }, { midi: 60, beats: 1.5, start: 2.7 }]);
  check('Mélodie jouée (moments donnés) : les moments sont gardés', timed.chords.map((c) => c.start).join(',') === '1.2,2.1,2.7');
  const long = parseMelodyText(Array.from({ length: 40 }, () => 'Do4').join(' '));
  check('32 notes au plus', harmonizeMelody(long).chords.length === 32);
  check('Rien à harmoniser : null', harmonizeMelody([]) === null && harmonizeMelody(parseMelodyText('bonjour')) === null);
}

testParse();
testTopNoteAndChords();
testCycles();
testKeyAndEnding();
testEveryAndDeterminism();

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);
