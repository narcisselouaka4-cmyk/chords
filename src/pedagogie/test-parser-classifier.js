// [Claude] — 2026-09-09 — Tests du parser d'accords v2 et du classificateur d'intention.

import {
  parseChordSymbol,
  chordSymbolToMidi,
  chordSymbolToPitchClasses,
  isChordSymbolRecognized,
  extractChordSymbol,
} from './chord-parser-v2.js';
import { classifyIntent, listIntents, describeIntent } from './intent-classifier.js';

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

function checkParser() {
  check('Cmaj7 reconnu', isChordSymbolRecognized('Cmaj7'));
  check('C#13b9 reconnu', isChordSymbolRecognized('C#13b9'));
  check('G7alt reconnu', isChordSymbolRecognized('G7alt'));
  check('Dm9/E reconnu', isChordSymbolRecognized('Dm9/E'));
  check('Symbole invalide rejeté', !isChordSymbolRecognized('XYZ'));

  const c13b9 = parseChordSymbol('C#13b9');
  check('C#13b9 a 6 notes', c13b9.notes.length === 6, `trouvé ${c13b9.notes.length}`);
  check('C#13b9 notes correctes', JSON.stringify(c13b9.notes) === JSON.stringify(['C#', 'E#', 'G#', 'B', 'D', 'A#']));

  const gAlt = parseChordSymbol('G7alt');
  check('G7alt notes correctes', JSON.stringify(gAlt.notes) === JSON.stringify(['G', 'B', 'D#', 'F', 'A#']));

  const dm9OverE = parseChordSymbol('Dm9/E');
  check('Dm9/E basse = E', dm9OverE.bassPc === 4, `trouvé ${dm9OverE.bassPc}`);

  const midi = chordSymbolToMidi('Am9', { baseMidi: 48 });
  check('Am9 MIDI base 48 = 5 notes', midi.length === 5, `trouvé ${midi.length}`);
  check('Am9 contient A3 (57)', midi.includes(57));

  const pcs = chordSymbolToPitchClasses('Am9');
  check('Am9 pitch classes absolues', JSON.stringify(pcs) === JSON.stringify([0, 4, 7, 9, 11]));
}

function checkExtractChordSymbol() {
  check('Extrait Cmaj7 isolé', extractChordSymbol('Cmaj7') === 'Cmaj7');
  check('Extrait G7alt dans phrase', extractChordSymbol('montre-moi un G7alt') === 'G7alt');
  check('Extrait Dm9/E', extractChordSymbol('Dm9/E') === 'Dm9/E');
  check('Pas de symbole', extractChordSymbol('bonjour') === null);
}

function checkClassifier() {
  check('Intention C#13b9 = play_voicing', classifyIntent('C#13b9').intent === 'play_voicing');
  check('Intention G7alt = play_voicing', classifyIntent('G7alt').intent === 'play_voicing');
  check('Intention "voicing jazz de Cmaj7" = play_voicing', classifyIntent('voicing jazz de Cmaj7').intent === 'play_voicing');
  check('Intention "lick gospel" = play_lick', classifyIntent('lick gospel').intent === 'play_lick');
  check('Intention "riff" = play_lick', classifyIntent('riff').intent === 'play_lick');
  check('Intention "joue la gamme de Do" = play_note', classifyIntent('joue la gamme de Do majeur').intent === 'play_note');
  check('Intention "explique un II-V-I" = explain', classifyIntent('explique-moi un II-V-I').intent === 'explain');
  check('Intention "propose" = suggest', classifyIntent('propose quelque chose').intent === 'suggest');
  check('Intention "bonjour" = unknown', classifyIntent('bonjour').intent === 'unknown');

  const voicingParams = classifyIntent('montre-moi un drop 2 jazz de Cmaj7');
  check('Params style jazz', voicingParams.params.styleId === 'jazz');
  check('Params technique drop2', voicingParams.params.technique === 'drop2');
  check('Params chord Cmaj7', voicingParams.params.chordSymbol === 'Cmaj7');

  const lickParams = classifyIntent('fais-moi un lick gospel sur Am9 à la main droite');
  check('Lick style gospel', lickParams.params.styleId === 'gospel');
  check('Lick chord Am9', lickParams.params.chordSymbol === 'Am9');
  check('Lick hand RH', lickParams.params.hand === 'RH');

  // Tests play_progression.
  const prog = classifyIntent('joue un ii-V-I en Do majeur');
  check('Intention "ii-V-I" = play_progression', prog.intent === 'play_progression', `trouvé ${prog.intent}`);
  check('Params chords ii-V-I', Array.isArray(prog.params.chords) && prog.params.chords.length === 3, `trouvé ${JSON.stringify(prog.params.chords)}`);

  const gt = classifyIntent('démo 7 vers 3 sur Dm7 G7 Cmaj7');
  check('Intention "7 vers 3" = play_progression', gt.intent === 'play_progression', `trouvé ${gt.intent}`);
  check('Params focus 7-to-3', gt.params.focus === '7-to-3', `trouvé ${gt.params.focus}`);
  check('Params chords extraits 7→3', Array.isArray(gt.params.chords) && gt.params.chords.length >= 2, `trouvé ${JSON.stringify(gt.params.chords)}`);

  const explicit = classifyIntent('progression Dm7 - G7 - Cmaj7 en jazz');
  check('Intention progression explicite = play_progression', explicit.intent === 'play_progression', `trouvé ${explicit.intent}`);
  check('Params style progression jazz', explicit.params.styleId === 'jazz');
}

async function runTests() {
  checkParser();
  checkExtractChordSymbol();
  checkClassifier();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
