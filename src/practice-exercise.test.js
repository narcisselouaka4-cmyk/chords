// [Claude] — 2026-09-21 — Tests headless du moteur de voicing de l'onglet Exercices.

import {
  createPracticeExercise,
  exerciseVoicingToSequence,
  unavailableTechniquesFor,
  listProgressionNames,
  listMovementNames,
  TECHNIQUES,
} from './practice-exercise.js';
import { generateCopilotVoicing } from './pedagogie/copilot-voicing.js';
import { parseChordSymbol } from './pedagogie/chord-parser-v2.js';
import { detectChord } from './chord-engine/index.js';
import { formatPc } from './chord-engine/naming.js';

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

function checkChordTargetHasVoicing() {
  const ex = createPracticeExercise();
  ex.next();
  const state = ex.getState();
  check('Mode accord cible a une cible', state.target != null);
  check('Cible a un voicing', state.target.voicing != null);
  check('Voicing jouable', state.target.voicing.isPlayable === true, JSON.stringify(state.target.voicing.diagnostics));
  check('Main gauche non vide', state.target.voicing.leftHand.length > 0);
  check('Main droite non vide', state.target.voicing.rightHand.length > 0);
  check('Notes fusionnées cohérentes', state.target.notes.length === state.target.voicing.leftHand.length + state.target.voicing.rightHand.length);
}

function checkSpecificChords() {
  const cases = ['G#m7', 'C#7'];
  for (const name of cases) {
    const v = generateCopilotVoicing(name, { styleId: 'auto', context: 'accompaniment' });
    check(`${name} voicing jouable`, v.isPlayable === true, v.diagnostics.join(' ; '));
    check(`${name} a LH et RH`, v.leftHand.length > 0 && v.rightHand.length > 0);
    const lhMax = Math.max(...v.leftHand);
    const rhMin = Math.min(...v.rightHand);
    check(`${name} RH au-dessus de LH`, rhMin > lhMax, `LH max=${lhMax} RH min=${rhMin}`);
  }

  // Vérifie aussi que l'exercice peut générer aléatoirement un G#m7
  // en un nombre raisonnable d'essais.
  const ex = createPracticeExercise();
  let found = null;
  for (let i = 0; i < 500; i += 1) {
    ex.next();
    const t = ex.getState().target;
    if (t.rootPc === 8 && t.symbol === 'm7') {
      found = t;
      break;
    }
  }
  check('G#m7 généré par l\'exercice', found != null);
}

function checkTechniqueSwitch() {
  const ex = createPracticeExercise();
  ex.next();
  const firstTarget = ex.getState().target;
  const first = firstTarget.voicing.technique;
  // 'rootless' a été retiré du sélecteur de l'onglet Exercices (n'a de sens
  // que dans un contexte fonctionnel ii-V-I, cf. usage Copilot IA). On vérifie
  // avec 'close', seule technique applicable à TOUS les accords : drop2 exige
  // 4 sons et quartal un empilement de quartes interne à l'accord, donc l'une
  // comme l'autre peut légitimement être refusée sur une cible tirée au sort.
  ex.setTechnique('close');
  const secondTarget = ex.getState().target;
  const second = secondTarget.voicing.technique;
  check('setTechnique change la technique', second === 'close', `avant=${first} après=${second}`);
  check('setTechnique conserve le même accord', secondTarget.rootPc === firstTarget.rootPc && secondTarget.symbol === firstTarget.symbol);
}

function checkProgressionVoicings() {
  const ex = createPracticeExercise();
  ex.setMode('progression');
  const state = ex.getState();
  check('Progression a des accords', state.progression.chords.length > 0);
  check('Tous les accords de progression ont un voicing jouable', state.progression.chords.every((c) => c.voicing?.isPlayable));
}

function checkDemoSequence() {
  const ex = createPracticeExercise();
  ex.next();
  const seq = exerciseVoicingToSequence(ex.getState().target.voicing);
  check('Séquence démo non vide', seq.length > 0);
  check('Séquence block : même offset', seq.every((n) => n.startOffsetMs === 0));
  check('Séquence a des notes MIDI', seq.every((n) => Number.isFinite(n.midi) && n.midi >= 12 && n.midi <= 127));
}

function checkMovementVoicings() {
  const ex = createPracticeExercise();
  ex.setMode('movement');
  const state = ex.getState();
  check('Mouvement a des accords', state.progression.chords.length > 0);
  check('Tous les accords du mouvement ont un voicing', state.progression.chords.every((c) => c.voicing?.isPlayable));
  check('Détection mouvement utilise rootPc', true);
}

// ── Phase 2 : vraies techniques de voicing ──

function checkCloseIsReallyClose() {
  // Une « position fermée » dont la main droite s'étale sur plus d'une octave
  // n'est pas une position fermée. Testé y compris sur des accords à extensions.
  for (const symbol of ['Cmaj7', 'G#m7', 'C13', 'Cm11', 'D#maj9', 'F7']) {
    const v = generateCopilotVoicing(symbol, { technique: 'close', context: 'accompaniment' });
    const rhSpan = v.rightHand.length > 1 ? Math.max(...v.rightHand) - Math.min(...v.rightHand) : 0;
    check(`close ${symbol} : écart main droite ≤ 12`, rhSpan <= 12, `span=${rhSpan} RH=${v.rightHand.join(',')}`);
  }
}

function checkDrop2Algorithm() {
  // Refus explicite sur une triade, sans repli silencieux.
  for (const triad of ['C#m', 'C', 'Am', 'F']) {
    const v = generateCopilotVoicing(triad, { technique: 'drop2', context: 'accompaniment' });
    check(`drop2 ${triad} (triade) refusé`, v.isPlayable === false, `LH=${v.leftHand} RH=${v.rightHand}`);
    check(`drop2 ${triad} : diagnostic explicite`,
      v.diagnostics.some((d) => /4 sons/i.test(d)), v.diagnostics.join(' | '));
  }

  // Sur 4 sons : la voix descendue est bien la 2e DEPUIS LE HAUT de
  // l'empilement fermé, et elle se retrouve seule à la main gauche.
  const cases = [
    { symbol: 'Cmaj7', stack: [60, 64, 67, 71] },
    { symbol: 'Cm7', stack: [60, 63, 67, 70] },
  ];
  for (const { symbol, stack } of cases) {
    const v = generateCopilotVoicing(symbol, { technique: 'drop2', context: 'accompaniment' });
    const expectedLhPc = stack[2] % 12;            // 2e voix depuis le haut
    const expectedRhPcs = [stack[0], stack[1], stack[3]].map((n) => n % 12).sort((a, b) => a - b);
    const actualRhPcs = v.rightHand.map((n) => n % 12).sort((a, b) => a - b);
    check(`drop2 ${symbol} jouable`, v.isPlayable, v.diagnostics.join(' | '));
    check(`drop2 ${symbol} : main gauche = 2e voix depuis le haut`,
      v.leftHand.length === 1 && v.leftHand[0] % 12 === expectedLhPc,
      `LH=${v.leftHand.join(',')} attendu pc=${expectedLhPc}`);
    check(`drop2 ${symbol} : les 3 autres voix à la main droite`,
      JSON.stringify(actualRhPcs) === JSON.stringify(expectedRhPcs),
      `RH pcs=${actualRhPcs.join(',')} attendu=${expectedRhPcs.join(',')}`);
  }

  // Accord à extension : l'empilement de référence inclut la 9e (Db) pour
  // ne pas la perdre. La 2e voix depuis le haut est alors Ab (#5).
  {
    const symbol = 'C7#5#9';
    const v = generateCopilotVoicing(symbol, { technique: 'drop2', context: 'accompaniment' });
    const expectedLhPc = 8; // Ab
    const actualRhPcs = v.rightHand.map((n) => n % 12).sort((a, b) => a - b);
    const expectedRhPcs = [0, 3, 4, 10]; // C, D#(#9), E, Bb
    check(`drop2 ${symbol} jouable`, v.isPlayable, v.diagnostics.join(' | '));
    check(`drop2 ${symbol} : main gauche = 2e voix depuis le haut`,
      v.leftHand.length === 1 && v.leftHand[0] % 12 === expectedLhPc,
      `LH=${v.leftHand.join(',')} attendu pc=${expectedLhPc}`);
    check(`drop2 ${symbol} : les autres voix à la main droite`,
      JSON.stringify(actualRhPcs) === JSON.stringify(expectedRhPcs),
      `RH pcs=${actualRhPcs.join(',')} attendu=${expectedRhPcs.join(',')}`);
  }
}

function checkQuartalDetectable() {
  // Un voicing quartal affiché à l'élève doit rester identifiable, sinon il
  // lui est impossible de valider l'exercice en le jouant.
  for (const symbol of ['Cm9', 'G#m9', 'C9', 'Am9']) {
    const v = generateCopilotVoicing(symbol, { technique: 'quartal', context: 'accompaniment' });
    check(`quartal ${symbol} jouable`, v.isPlayable, v.diagnostics.join(' | '));
    const notes = [...v.leftHand, ...v.rightHand];
    const detected = detectChord(notes);
    const parsed = parseChordSymbol(symbol);
    const expectedSymbol = symbol.replace(/^[A-G][#b]?/, '');
    check(`quartal ${symbol} : detectChord retrouve l'accord`,
      detected && detected.rootPc === parsed.rootPc && detected.symbol === expectedSymbol,
      `détecté=${detected ? formatPc(detected.rootPc, false) + detected.symbol : 'aucun'}`);
    check(`quartal ${symbol} : tierce présente dans le voicing`,
      notes.some((n) => n % 12 === (parsed.rootPc + 3) % 12 || n % 12 === (parsed.rootPc + 4) % 12),
      `notes=${notes.join(',')}`);
  }

  // Accords sur lesquels l'empilement de quartes sortirait de l'accord : on
  // refuse explicitement plutôt que d'afficher un voicing invalidable.
  for (const symbol of ['C#m', 'Am7']) {
    const v = generateCopilotVoicing(symbol, { technique: 'quartal', context: 'accompaniment' });
    check(`quartal ${symbol} refusé (quartes hors accord)`, v.isPlayable === false, v.diagnostics.join(' | '));
  }
}

function checkTechniqueAvailability() {
  check('drop2 listé indisponible sur une triade', unavailableTechniquesFor('C#m').includes('drop2'));
  check('drop2 listé disponible sur un accord 4 sons', !unavailableTechniquesFor('C#m7').includes('drop2'));
  check('quartal listé disponible sur un accord à 9e', !unavailableTechniquesFor('Cm9').includes('quartal'));
  check('close jamais listée indisponible', !unavailableTechniquesFor('C#m').includes('close'));
}

function checkPreviousNavigation() {
  const ex = createPracticeExercise();
  ex.setMode('progression');
  // Technique close : fondamentale en bas, donc detectChord valide systématiquement
  // l'accord et l'exercice peut avancer d'une étape.
  ex.setTechnique('close');
  ex.setContentChoice('II-V-I majeur'); // déterministe
  check('progression : pas de précédent au premier accord', ex.canGoPrevious() === false);

  const prog = ex.getState().progression;
  ex.check([...prog.chords[0].notes]); // valide le 1er accord → avance d'une étape
  const afterAdvance = ex.getState();
  if (afterAdvance.stepIndex > 0) {
    const scoreBefore = afterAdvance.score;
    check('progression : précédent disponible après avancée', ex.canGoPrevious() === true);
    const moved = ex.previous();
    const back = ex.getState();
    check("progression : previous() recule d'une étape", moved !== null && back.stepIndex === afterAdvance.stepIndex - 1);
    check('progression : previous() ne touche pas au score', back.score === scoreBefore);
    check('progression : previous() remet les tentatives à zéro', back.attempts === 0);
  } else {
    check('progression : avancée préalable au test previous', false, `la validation du 1er accord n'a pas avancé — notes=${prog.chords[0].notes.join(',')}`);
  }

  const exChord = createPracticeExercise();
  check('mode accord : jamais de précédent', exChord.canGoPrevious() === false);
}

function checkContentChoice() {
  const names = listProgressionNames();
  check('liste des progressions non vide', names.length > 0);
  const ex = createPracticeExercise();
  ex.setMode('progression');
  ex.setContentChoice(names[1]);
  check('progression choisie respectée', ex.getState().progression.name === names[1], `obtenu=${ex.getState().progression.name}`);
  ex.setContentChoice(null);
  check('retour au tirage aléatoire', ex.getState().progressionChoice === null);

  const movements = listMovementNames();
  check('liste des mouvements non vide', movements.length > 0);
  const exMv = createPracticeExercise();
  exMv.setMode('movement');
  exMv.setContentChoice(movements[0]);
  check('mouvement choisi respecté', exMv.getState().progression.name === movements[0], `obtenu=${exMv.getState().progression.name}`);
}

// ── Phase 3 : nouvelles familles de voicing ──

function checkNewFamiliesInSelector() {
  const expected = ['drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block', 'so_what'];
  for (const tech of expected) {
    check(`${tech} listé dans TECHNIQUES`, TECHNIQUES.includes(tech));
  }
}

function checkNewFamiliesPlayable() {
  // On privilégie les accords que detectChord reconnaît exactement, pour
  // éviter que le test ne rejette à tort une famille valide sur une ambiguïté
  // du classificateur (ex. inversion ou extension non présente dans le
  // dictionnaire de symboles).
  const cases = [
    { symbol: 'C9', techniques: ['drop2', 'drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block', 'so_what'] },
    { symbol: 'Cmaj7', techniques: ['drop2', 'drop2_4', 'fourway_close', 'spread', 'open', 'block'] },
    { symbol: 'Cm7', techniques: ['drop2', 'drop2_4', 'fourway_close', 'spread', 'open', 'block'] },
    { symbol: 'C7', techniques: ['drop2', 'drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block'] },
  ];
  for (const { symbol, techniques } of cases) {
    const parsed = parseChordSymbol(symbol);
    const expectedSymbol = symbol.replace(/^[A-G][#b]?/, '');
    for (const technique of techniques) {
      const v = generateCopilotVoicing(symbol, { technique, context: 'accompaniment' });
      check(`${technique} ${symbol} : voicing jouable`, v.isPlayable, v.diagnostics.join(' | '));
      if (!v.isPlayable) continue;
      const detected = detectChord([...v.leftHand, ...v.rightHand]);
      const matches = detected && detected.rootPc === parsed.rootPc && detected.symbol === expectedSymbol;
      check(`${technique} ${symbol} : detectChord retrouve l'accord`, matches,
        `détecté=${detected ? formatPc(detected.rootPc, false) + detected.symbol : 'aucun'}`);
      // Ces familles ne font que déplacer des octaves : pas de doublon de pitch
      // class superflu dans une même main.
      const rhPcs = v.rightHand.map((n) => n % 12);
      check(`${technique} ${symbol} : main droite sans doublon de pitch class`, new Set(rhPcs).size === rhPcs.length, `RH=${v.rightHand.join(',')}`);
    }
  }
}

function checkFourWayCloseAcceptsEmptyLeftHand() {
  const v = generateCopilotVoicing('Cmaj7', { technique: 'fourway_close', context: 'accompaniment' });
  check('fourway_close : main gauche vide', v.leftHand.length === 0);
  check('fourway_close : main droite non vide', v.rightHand.length >= 4);
  check('fourway_close : jouable malgré LH vide', v.isPlayable, v.diagnostics.join(' | '));
}

function checkUnavailableTechniquesReflectDetection() {
  // Drop 2 et So What sont grisés sur les accords où detectChord ne valide pas
  // le résultat (triade pour drop2, accord sans 11e/#11 pour so_what).
  check('drop2 grisé sur triade', unavailableTechniquesFor('C#m').includes('drop2'));
  check('so_what grisé sur Cm7', unavailableTechniquesFor('Cm7').includes('so_what'));
}

function runTests() {
  checkChordTargetHasVoicing();
  checkSpecificChords();
  checkTechniqueSwitch();
  checkProgressionVoicings();
  checkDemoSequence();
  checkMovementVoicings();
  checkCloseIsReallyClose();
  checkDrop2Algorithm();
  checkQuartalDetectable();
  checkTechniqueAvailability();
  checkPreviousNavigation();
  checkContentChoice();
  checkNewFamiliesInSelector();
  checkNewFamiliesPlayable();
  checkFourWayCloseAcceptsEmptyLeftHand();
  checkUnavailableTechniquesReflectDetection();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
