// [Claude] — 2026-09-09 — Tests du générateur de voicings du Copilot IA.

import {
  generateCopilotVoicing,
  voicingToNoteSequence,
  validateHandVoicing,
  chordSymbolToMidi,
  listCopilotStyles,
  defaultTechniqueForStyle,
} from './copilot-voicing.js';

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

function checkCmaj7Gospel() {
  const v = generateCopilotVoicing('Cmaj7', { styleId: 'gospel', context: 'accompaniment' });
  check('Cmaj7 gospel est jouable', v.isPlayable, v.diagnostics.join(' ; '));
  check('Cmaj7 gospel a une main gauche', v.leftHand.length > 0);
  // Cmaj7 n'a que 4 tons (C E G B) ; LH prend déjà C et E (basse + tierce en
  // drop2), il ne reste donc que G et B comme tons DISTINCTS pour la main
  // droite. >= 3 supposait implicitement qu'on pouvait doubler une note à
  // l'octave pour combler le compte — c'est exactement le défaut corrigé
  // dans pickNotesFromRange() (voir correctif Sol#m7/dédoublonnage pitch class).
  check('Cmaj7 gospel a une main droite', v.rightHand.length >= 2);
  check('Cmaj7 gospel technique = drop2', v.technique === 'drop2');
  check('Main gauche dans le grave', Math.max(...v.leftHand) <= 55);
  check('Main droite au-dessus de la main gauche', Math.min(...v.rightHand) > Math.max(...v.leftHand));
}

function checkStyles() {
  const styles = listCopilotStyles();
  check('5 styles disponibles', styles.length === 5);
  check('Auto présent', styles.some((s) => s.id === 'auto'));
  check('Gospel présent', styles.some((s) => s.id === 'gospel'));
  check('Technique par défaut gospel = drop2', defaultTechniqueForStyle('gospel') === 'drop2');
  check('Technique par défaut jazz = rootless', defaultTechniqueForStyle('jazz') === 'rootless');
}

function checkPatterns() {
  const v = generateCopilotVoicing('Dm7', { styleId: 'jazz', context: 'accompaniment' });
  const block = voicingToNoteSequence(v, { pattern: 'block' });
  check('Pattern block : même offset pour toutes les notes', block.every((n) => n.startOffsetMs === 0));
  const up = voicingToNoteSequence(v, { pattern: 'arppegio-up' });
  check('Pattern arppegio-up : offsets croissants', up.every((n, i) => i === 0 || n.startOffsetMs >= up[i - 1].startOffsetMs));
  const down = voicingToNoteSequence(v, { pattern: 'arppegio-down' });
  check('Pattern arppegio-down : offsets croissants', down.every((n, i) => i === 0 || n.startOffsetMs >= down[i - 1].startOffsetMs));
  const rolled = voicingToNoteSequence(v, { pattern: 'rolled' });
  check('Pattern rolled : notes espacées de 80 ms', rolled.every((n, i) => i === 0 || n.startOffsetMs === rolled[i - 1].startOffsetMs + 80));
}

function checkValidation() {
  const valid = validateHandVoicing([36, 43], [60, 64, 67, 71]);
  check('Voicing valide passé', valid.valid, valid.diagnostics.join(' ; '));
  const tooWide = validateHandVoicing([36], [60, 80]);
  check('Span main droite trop grand détecté', !tooWide.valid);
  const overlap = validateHandVoicing([60], [55, 70]);
  check('Chevauchement main droite/main gauche détecté', !overlap.valid);
}

function checkChordSymbolToMidi() {
  const notes = chordSymbolToMidi('Cmaj7');
  check('Cmaj7 résolu en notes MIDI', notes.length >= 4);
  check('Cmaj7 contient un C', notes.some((n) => n % 12 === 0));
  check('Cmaj7 contient un E', notes.some((n) => n % 12 === 4));
  check('Cmaj7 contient un B', notes.some((n) => n % 12 === 11));
}

function checkAutoFallback() {
  const v = generateCopilotVoicing('G13', { styleId: 'auto' });
  check('Style auto produit un voicing jouable', v.isPlayable, v.diagnostics.join(' ; '));
}

function checkComplexChords() {
  const cases = [
    { symbol: 'C#13b9', expectedNotes: 5 },
    { symbol: 'G7alt', expectedNotes: 4 },
    { symbol: 'Dm9/E', expectedNotes: 4 },
    { symbol: 'F#m7b5', expectedNotes: 4 },
    { symbol: 'Cmaj7#11', expectedNotes: 4 },
    { symbol: 'Eb7#9', expectedNotes: 4 },
    { symbol: 'A7b9b13', expectedNotes: 4 },
  ];
  for (const c of cases) {
    const v = generateCopilotVoicing(c.symbol, { styleId: 'jazz', context: 'accompaniment' });
    const total = v.leftHand.length + v.rightHand.length;
    check(`${c.symbol} est jouable`, v.isPlayable, v.diagnostics.join(' ; '));
    check(`${c.symbol} a au moins ${c.expectedNotes} notes`, total >= c.expectedNotes, `trouvé ${total}`);
  }
}

function checkNoPitchClassDuplicates() {
  // Régression Narcisse : la RH ne doit jamais empiler deux fois la même
  // classe de hauteur (ex. Ré#4 + Ré#5) quand assez de tons distincts de
  // l'accord sont disponibles — dupliquer à l'octave gonflait l'écart entre
  // les mains sans ajouter de substance harmonique.
  const cases = ['G#m7', 'F7', 'Dmaj7', 'D#maj9', 'A#7', 'Amaj7'];
  for (const symbol of cases) {
    const v = generateCopilotVoicing(symbol, { styleId: 'gospel', context: 'accompaniment' });
    const rhPcs = v.rightHand.map((n) => n % 12);
    const lhPcs = v.leftHand.map((n) => n % 12);
    check(`${symbol} : main droite sans doublon de pitch class`, new Set(rhPcs).size === rhPcs.length, `RH=${v.rightHand.join(',')}`);
    check(`${symbol} : main gauche sans doublon de pitch class`, new Set(lhPcs).size === lhPcs.length, `LH=${v.leftHand.join(',')}`);
  }
}

function checkNewFamilies() {
  const families = ['drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block', 'so_what'];
  for (const technique of families) {
    for (const symbol of ['C7#5#9', 'Cm7', 'Cmaj7']) {
      const v = generateCopilotVoicing(symbol, { technique, context: 'accompaniment' });
      check(`${technique} ${symbol} : produit un voicing`, v.leftHand.length + v.rightHand.length > 0 || !v.isPlayable, v.diagnostics.join(' | '));
      if (v.isPlayable) {
        check(`${technique} ${symbol} : tessiture respectée`,
          v.leftHand.every((n) => n >= 28 && n <= 55) && v.rightHand.every((n) => n >= 48 && n <= 84),
          `LH=${v.leftHand.join(',')} RH=${v.rightHand.join(',')}`);
      }
    }
  }

  // Vérifications ciblées conformes aux transformations demandées.
  const drop3 = generateCopilotVoicing('C7#5#9', { technique: 'drop3', context: 'accompaniment' });
  check('drop3 C7#5#9 jouable', drop3.isPlayable, drop3.diagnostics.join(' | '));
  check('drop3 C7#5#9 : une seule note en main gauche', drop3.leftHand.length === 1);
  check('drop3 C7#5#9 : main droite au-dessus de la main gauche',
    drop3.rightHand.length > 0 && Math.min(...drop3.rightHand) > Math.max(...drop3.leftHand));

  const drop24 = generateCopilotVoicing('C7#5#9', { technique: 'drop2_4', context: 'accompaniment' });
  check('drop2-4 C7#5#9 jouable', drop24.isPlayable, drop24.diagnostics.join(' | '));
  check('drop2-4 C7#5#9 : deux notes en main gauche', drop24.leftHand.length === 2);
  check('drop2-4 C7#5#9 : main droite au-dessus de la main gauche',
    drop24.rightHand.length > 0 && Math.min(...drop24.rightHand) > Math.max(...drop24.leftHand));

  const fourWay = generateCopilotVoicing('Cm7', { technique: 'fourway_close', context: 'accompaniment' });
  check('fourway_close Cm7 jouable', fourWay.isPlayable, fourWay.diagnostics.join(' | '));
  check('fourway_close Cm7 : main gauche vide', fourWay.leftHand.length === 0);
  check('fourway_close Cm7 : 4 notes en main droite', fourWay.rightHand.length >= 4);

  const soWhat = generateCopilotVoicing('Cmaj9#11', { technique: 'so_what', context: 'accompaniment' });
  check('So What Cmaj9#11 jouable', soWhat.isPlayable, soWhat.diagnostics.join(' | '));
}

async function runTests() {
  checkStyles();
  checkCmaj7Gospel();
  checkPatterns();
  checkValidation();
  checkChordSymbolToMidi();
  checkAutoFallback();
  checkComplexChords();
  checkNoPitchClassDuplicates();
  checkNewFamilies();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
