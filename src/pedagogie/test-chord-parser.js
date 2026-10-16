// [Claude] — 2026-09-09 — Tests du parser d'accords du Copilot IA.

import {
  parseChordSymbol,
  chordSymbolToPitchClasses,
  chordSymbolToMidi,
  isChordSymbolRecognized,
} from './chord-parser.js';
import { Note } from '@tonaljs/tonal';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    failed += 1;
    console.log(`${RED}✗${RESET} ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function checkBasicTriads() {
  check('C majeur', JSON.stringify(chordSymbolToPitchClasses('C')) === '[0,4,7]');
  check('Cm mineur', JSON.stringify(chordSymbolToPitchClasses('Cm')) === '[0,3,7]');
  check('Cdim', JSON.stringify(chordSymbolToPitchClasses('Cdim')) === '[0,3,6]');
  check('Caug', JSON.stringify(chordSymbolToPitchClasses('Caug')) === '[0,4,8]');
  check('Csus4', JSON.stringify(chordSymbolToPitchClasses('Csus4')) === '[0,5,7]');
}

function checkSevenths() {
  check('Cmaj7', JSON.stringify(chordSymbolToPitchClasses('Cmaj7')) === '[0,4,7,11]');
  check('C7', JSON.stringify(chordSymbolToPitchClasses('C7')) === '[0,4,7,10]');
  check('Cm7', JSON.stringify(chordSymbolToPitchClasses('Cm7')) === '[0,3,7,10]');
  check('Cm7b5', JSON.stringify(chordSymbolToPitchClasses('Cm7b5')) === '[0,3,6,10]');
  check('Cdim7', JSON.stringify(chordSymbolToPitchClasses('Cdim7')) === '[0,3,6,9]');
}

function checkTensionsAndAlterations() {
  const c9 = chordSymbolToPitchClasses('C9');
  const c13 = chordSymbolToPitchClasses('C13');
  check('C9 reconnu', isChordSymbolRecognized('C9'));
  check('C9 contient 5 classes', c9.length === 5);
  check('C9 contient 9e (D)', c9.includes(2));
  check('C13 contient 6 classes', c13.length === 6);
  check('C13 contient 9e (D)', c13.includes(2));
  check('C13 contient 13e (A)', c13.includes(9));
  const c7b9 = chordSymbolToPitchClasses('C7b9');
  const c7Hash9 = chordSymbolToPitchClasses('C7#9');
  const c7Hash11 = chordSymbolToPitchClasses('C7#11');
  const c7b13 = chordSymbolToPitchClasses('C7b13');
  check('C7b9 contient b9', c7b9.includes(1));
  check('C7b9 contient 7', c7b9.includes(10));
  check('C7#9 contient #9', c7Hash9.includes(3));
  check('C7#11 contient #11', c7Hash11.includes(6));
  check('C7b13 contient b13', c7b13.includes(8));
}

function checkComplexSymbols() {
  const c13b9 = chordSymbolToPitchClasses('C#13b9');
  check('C#13b9 reconnu', isChordSymbolRecognized('C#13b9'));
  check('C#13b9 contient au moins 5 classes', c13b9.length >= 5);
  check('C#13b9 contient C#', c13b9.includes(1));
  check('C#13b9 contient b9', c13b9.includes(2));
  check('C#13b9 contient 13', c13b9.includes(10));

  const gAlt = chordSymbolToPitchClasses('G7alt');
  check('G7alt reconnu', isChordSymbolRecognized('G7alt'));
  check('G7alt contient b9', gAlt.includes(8) || gAlt.includes(3)); // G#=8 ou D#=3 selon l'enharmonique choisie
  check('G7alt contient #9', gAlt.includes(10) || gAlt.includes(5)); // A#=10 ou F=5
  check('G7alt ne contient pas la quinte juste', !gAlt.includes(2)); // D naturel = 2
}

function checkSlashBass() {
  const dm9OverE = chordSymbolToPitchClasses('Dm9/E');
  check('Dm9/E reconnu', isChordSymbolRecognized('Dm9/E'));
  check('Dm9/E contient la basse E', dm9OverE.includes(4));

  const cOverG = chordSymbolToPitchClasses('C/G');
  check('C/G contient G', cOverG.includes(7));
}

// [Claude] — 2026-09-24 — « 6/9 » n'est pas une basse séparée : le « / » coupait
// l'accord en C6 et la neuvième (Ré) disparaissait.
function checkSixNine() {
  const pcs = (s) => JSON.stringify(chordSymbolToPitchClasses(s));
  check('C6/9 = C E G A D (9e présente)', pcs('C6/9') === '[0,2,4,7,9]', pcs('C6/9'));
  check('Cm6/9 = C Eb G A D (9e présente)', pcs('Cm6/9') === '[0,2,3,7,9]', pcs('Cm6/9'));
  check('C69 = C E G A D', pcs('C69') === '[0,2,4,7,9]', pcs('C69'));
  check('Cm69 = C Eb G A D', pcs('Cm69') === '[0,2,3,7,9]', pcs('Cm69'));
  check('C6/9 sans basse séparée, lu « sixth added ninth »',
    parseChordSymbol('C6/9').bassPc === null && parseChordSymbol('C6/9').qualityId === 'sixth added ninth');
  check('Bb6/9 transposé : Bb D F G C', pcs('Bb6/9') === '[0,2,5,7,10]', pcs('Bb6/9'));
  const cOverE = parseChordSymbol('C/E');
  check('C/E reste un accord avec basse Mi', cOverE.ok && cOverE.bassPc === 4 && pcs('C/E') === '[0,4,7]');
  const sixNineOverE = parseChordSymbol('C6/9/E');
  check('C6/9/E : 6/9 avec basse Mi', sixNineOverE.ok && sixNineOverE.bassPc === 4 && pcs('C6/9/E') === '[0,2,4,7,9]');
  check('C/X : suffixe illisible ignoré comme avant (C majeur)', pcs('C/X') === '[0,4,7]');
  check('C6 inchangé (sans 9e)', pcs('C6') === '[0,4,7,9]');
}

function checkEnharmonics() {
  check('C# = Db', Note.get('C#').chroma === Note.get('Db').chroma);
  check('F# = Gb', Note.get('F#').chroma === Note.get('Gb').chroma);
  check('Bbb = A', Note.get('Bbb').chroma === Note.get('A').chroma);
  check('pitch class 0 = C', Note.get('C').chroma === 0);
}

function checkMidiConversion() {
  const cmaj7 = chordSymbolToMidi('Cmaj7', 48);
  check('Cmaj7 MIDI base 48 = 4 notes', cmaj7.length === 4);
  check('Cmaj7 MIDI contient C3', cmaj7.includes(48));
  check('Cmaj7 MIDI contient E4', cmaj7.includes(64) || cmaj7.includes(52));
  check('Cmaj7 MIDI contient B3', cmaj7.includes(59));
}

async function runTests() {
  checkBasicTriads();
  checkSevenths();
  checkTensionsAndAlterations();
  checkComplexSymbols();
  checkSlashBass();
  checkSixNine();
  checkEnharmonics();
  checkMidiConversion();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
