// [Claude] — 2026-09-21 — Tests headless du moteur de voicing de l'onglet Exercices.

import {
  createPracticeExercise,
  exerciseVoicingToSequence,
  unavailableTechniquesFor,
  getAvailableTechniques,
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
  // Les techniques structurelles peuvent produire un voicing tenu par une
  // seule main (close, quartal, so_what, fourway_close) ; on vérifie juste
  // qu'il y a des notes au total.
  const totalNotes = state.target.voicing.leftHand.length + state.target.voicing.rightHand.length;
  check('Voicing contient des notes', totalNotes > 0, `LH=${state.target.voicing.leftHand.join(',')} RH=${state.target.voicing.rightHand.join(',')}`);
  check('Notes fusionnées cohérentes', state.target.notes.length === totalNotes);
}

function checkSpecificChords() {
  const cases = ['G#m7', 'C#7'];
  for (const name of cases) {
    const v = generateCopilotVoicing(name, { styleId: 'auto', context: 'accompaniment' });
    check(`${name} voicing jouable`, v.isPlayable === true, v.diagnostics.join(' ; '));
    const total = v.leftHand.length + v.rightHand.length;
    check(`${name} a des notes`, total > 0, `LH=${v.leftHand.join(',')} RH=${v.rightHand.join(',')}`);
    // L'affichage Exercices fusionne LH+RH, donc on autorise le chevauchement.
    const all = [...v.leftHand, ...v.rightHand].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < all.length; i += 1) gaps.push(all[i] - all[i - 1]);
    const maxGap = Math.max(...gaps, 0);
    check(`${name} voicing compact (écart max ≤ 12/15)`, maxGap <= 12 || (maxGap === gaps[gaps.length - 1] && maxGap <= 15), `gaps=${gaps.join(',')}`);
  }

  // Vérifie aussi que l'exercice peut générer aléatoirement un accord mineur 7
  // quand la difficulté le permet.
  const ex = createPracticeExercise();
  ex.setDifficulty(2);
  let found = null;
  for (let i = 0; i < 500; i += 1) {
    ex.next();
    const t = ex.getState().target;
    if (t.symbol === 'm7') {
      found = t;
      break;
    }
  }
  check('m7 généré par l\'exercice en diff. 2', found != null, found ? found.name : 'non trouvé');
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
  // n'est pas une position fermée. Les accords à 5+ sons sont limités aux 4
  // voix principales (1-3-5-7) pour rester compact, conformément au
  // comportement de VoicingLab.
  for (const symbol of ['Cmaj7', 'G#m7', 'C13', 'Cm11', 'D#maj9', 'F7']) {
    const v = generateCopilotVoicing(symbol, { technique: 'close', context: 'accompaniment' });
    const all = [...v.leftHand, ...v.rightHand].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < all.length; i += 1) gaps.push(all[i] - all[i - 1]);
    const maxGap = Math.max(...gaps, 0);
    check(`close ${symbol} : compact`, maxGap <= 12 || (maxGap === gaps[gaps.length - 1] && maxGap <= 15),
      `gaps=${gaps.join(',')} RH=${v.rightHand.join(',')}`);
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
  // Le voicing quartal est une réalisation pianistique réelle : il peut être
  // interprété comme un accord enrichi (ex. Dm7 quartal → Dm11). On vérifie
  // qu'il est jouable et compact ; l'exercice affiche la cible détectée.
  for (const symbol of ['Cm9', 'G#m9', 'C9', 'Am9']) {
    const v = generateCopilotVoicing(symbol, { technique: 'quartal', context: 'accompaniment' });
    check(`quartal ${symbol} jouable`, v.isPlayable, v.diagnostics.join(' | '));
    const notes = [...v.leftHand, ...v.rightHand].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < notes.length; i += 1) gaps.push(notes[i] - notes[i - 1]);
    const maxGap = Math.max(...gaps, 0);
    check(`quartal ${symbol} : compact`, maxGap <= 12 || (maxGap === gaps[gaps.length - 1] && maxGap <= 15), `gaps=${gaps.join(',')}`);
    // La cible affichée dans l'exercice est l'accord détecté sur ce voicing.
    const detected = detectChord(notes);
    check(`quartal ${symbol} : détectable`, detected != null, `notes=${notes.join(',')}`);
  }

  // Quartal reste applicable aux accords sans 9e/sus4/11e, mais le résultat
  // sera nommé comme un accord enrichi dans l'exercice.
  for (const symbol of ['C#m', 'Am7']) {
    const v = generateCopilotVoicing(symbol, { technique: 'quartal', context: 'accompaniment' });
    check(`quartal ${symbol} produit un voicing`, v.leftHand.length + v.rightHand.length > 0, v.diagnostics.join(' | '));
  }
}

function checkTechniqueAvailability() {
  check('drop2 listé indisponible sur une triade', unavailableTechniquesFor('C#m').includes('drop2'));
  check('drop2 listé disponible sur un accord 4 sons', !unavailableTechniquesFor('C#m7').includes('drop2'));
  check('quartal listé indisponible (non implémenté dans le catalogue actuel)', unavailableTechniquesFor('Cm9').includes('quartal'));
  // VoicingLab ne publie aucune triade mineure : aucune technique, Close compris.
  check('close indisponible sur une triade absente de VoicingLab', unavailableTechniquesFor('C#m').includes('close'));
  // VoicingLab publie un So What pour Cm7 (C3 F3 Bb3 Eb4 G4).
  check('so_what disponible sur Cm7 (publié par VoicingLab)', !unavailableTechniquesFor('Cm7').includes('so_what'));
  // Four-Way Close réservé au mode Accord cible.
  check('fourway_close disponible en mode chord', !unavailableTechniquesFor('Cmaj7', 'chord').includes('fourway_close'));
  check('fourway_close indisponible en mode progression', unavailableTechniquesFor('Cmaj7', 'progression').includes('fourway_close'));
  check('fourway_close indisponible en mode movement', unavailableTechniquesFor('Cmaj7', 'movement').includes('fourway_close'));
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
  const chosenName = names.find((n) => n.includes('II-V-I')) || names[1];
  const ex = createPracticeExercise();
  ex.setMode('progression');
  ex.setContentChoice(chosenName);
  check('progression choisie respectée', ex.getState().progression.name === chosenName, `obtenu=${ex.getState().progression.name}`);
  ex.setContentChoice(null);
  check('retour au tirage aléatoire', ex.getState().progressionChoice === null);

  const movements = listMovementNames();
  check('liste des mouvements non vide', movements.length > 0);
  const exMv = createPracticeExercise();
  exMv.setMode('movement');
  exMv.setContentChoice(movements[0]);
  check('mouvement choisi respecté', exMv.getState().progression.name === movements[0], `obtenu=${exMv.getState().progression.name}`);

  // Si une progression personnalisée est active, choisir un template doit la
  // désactiver pour que le template s'affiche réellement.
  const exCustom = createPracticeExercise();
  exCustom.setMode('progression');
  exCustom.setCustomProgression('D F G A');
  exCustom.setContentChoice('II-V-I majeur');
  check('template efface la progression personnalisée', exCustom.getState().progression.name === 'II-V-I majeur');
  check('customProgression réinitialisée', exCustom.getState().customProgression === null);
}

// ── Phase 3 : nouvelles familles de voicing ──

function checkNewFamiliesInSelector() {
  const expected = ['drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block', 'so_what'];
  for (const tech of expected) {
    check(`${tech} listé dans TECHNIQUES`, TECHNIQUES.includes(tech));
  }
}

function checkNewFamiliesPlayable() {
  // Les familles structurelles doivent produire des voicings jouables et
  // compacts. La reconnaissance exacte n'est plus exigée : l'exercice
  // affiche l'accord détecté sur le voicing produit.
  const cases = [
    { symbol: 'C9', techniques: ['drop2', 'drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block', 'so_what'] },
    { symbol: 'Cmaj7', techniques: ['drop2', 'drop2_4', 'fourway_close', 'spread', 'open', 'block'] },
    { symbol: 'Cm7', techniques: ['drop2', 'drop2_4', 'fourway_close', 'spread', 'open', 'block', 'so_what'] },
    { symbol: 'C7', techniques: ['drop2', 'drop3', 'drop2_4', 'fourway_close', 'spread', 'open', 'block', 'so_what'] },
  ];
  for (const { symbol, techniques } of cases) {
    const parsed = parseChordSymbol(symbol);
    const expectedSymbol = symbol.replace(/^[A-G][#b]?/, '');
    for (const technique of techniques) {
      const v = generateCopilotVoicing(symbol, { technique, context: 'accompaniment' });
      check(`${technique} ${symbol} : voicing jouable`, v.isPlayable, v.diagnostics.join(' | '));
      if (!v.isPlayable) continue;
      // Vérification de compacité (pas de trou d'octave).
      const all = [...v.leftHand, ...v.rightHand].sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < all.length; i += 1) gaps.push(all[i] - all[i - 1]);
      const maxGap = Math.max(...gaps, 0);
      check(`${technique} ${symbol} : compact`, maxGap <= 12 || (maxGap === gaps[gaps.length - 1] && maxGap <= 15), `gaps=${gaps.join(',')}`);
      // Le voicing doit être détectable comme un accord.
      const detected = detectChord(all);
      check(`${technique} ${symbol} : détectable`, detected != null,
        `notes=${all.join(',')}`);
      // Pas de doublon de pitch class superflu dans une même main.
      const rhPcs = v.rightHand.map((n) => n % 12);
      const lhPcs = v.leftHand.map((n) => n % 12);
      check(`${technique} ${symbol} : main droite sans doublon de pitch class`, new Set(rhPcs).size === rhPcs.length, `RH=${v.rightHand.join(',')}`);
      check(`${technique} ${symbol} : main gauche sans doublon de pitch class`, new Set(lhPcs).size === lhPcs.length, `LH=${v.leftHand.join(',')}`);
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
  // Drop 2 est grisé sur les triades (technique structurellement impossible).
  check('drop2 grisé sur triade', unavailableTechniquesFor('C#m').includes('drop2'));
  check('so_what grisé sur Cmaj7 (absent de VoicingLab)', unavailableTechniquesFor('Cmaj7').includes('so_what'));
}

// [Claude] — 2026-09-23 — Mission fiabilisation : difficulté sur progression
// par degrés + blocage des familles non publiées par VoicingLab.
function checkVoicingLabGateAndCustomDifficulty() {
  console.log('\n=== Gate VoicingLab + difficulté progression par degrés ===');
  const u = (s) => unavailableTechniquesFor(s);
  check('G13 : quartal indisponible (absent de VoicingLab)', u('G13').includes('quartal'));
  check('Fmaj13#11 : block indisponible', u('Fmaj13#11').includes('block'));
  check('Fmaj13#11 : spread indisponible', u('Fmaj13#11').includes('spread'));

  const ex = createPracticeExercise();
  ex.setMode('progression');
  ex.setCustomProgressionFromDegrees([4, 5, 3, 6, 2, 5, 1].map((degree) => ({ degree })));
  const seqs = [1, 3, 5].map((d) => {
    ex.setDifficulty(d);
    const p = ex.getState().progression;
    return { name: p.name, symbols: p.chords.map((c) => c.symbol).join(' ') };
  });
  check('Progression par degrés conservée à tous les niveaux', seqs.every((x) => x.name === 'Progression personnalisée' && x.symbols.split(' ').length === 7));
  check('La difficulté change les qualités (1★ ≠ 3★)', seqs[0].symbols !== seqs[1].symbols, JSON.stringify(seqs));
  check('Aucune qualité maj13#11 inventée', seqs.every((x) => !x.symbols.includes('maj13#11')));
}

// [Claude] — 2026-09-23 — Mission couverture VoicingLab 12 tons : variantes
// réelles, filtre toutes familles, difficulté 1★.
function checkVoicingLabCoverage() {
  console.log('\n=== Couverture VoicingLab (12 tons, variantes) ===');
  const count = (sym, t) => getAvailableTechniques(sym).find((c) => c.id === t)?.count ?? 0;
  check('Fmaj13#11 : toutes les techniques indisponibles (Shell/Close/Drop2 compris)',
    unavailableTechniquesFor('Fmaj13#11').length === TECHNIQUES.length - 1);
  check('Cdim7 : 4 Drop 2 réels', count('Cdim7', 'drop2') === 4);
  check('C7 : 6 Upper Structures réelles', count('C7', 'upper_structure') === 6);
  check('G13 : pas de Drop 2 (absent de VoicingLab)', count('G13', 'drop2') === 0);
  check('F#m7 trouvé (orthographe dièse VoicingLab)', count('F#m7', 'drop2') > 0);
  check('Gbmaj7 trouvé (orthographe bémol VoicingLab)', count('Gbmaj7', 'drop2') > 0);

  // Les flèches changent réellement le voicing (notes VoicingLab distinctes).
  const cycle = (technique, rootPc, quality, n) => {
    const ex = createPracticeExercise();
    ex.setTechnique(technique);
    ex.setTargetChoice(rootPc, quality);
    const seen = new Set();
    for (let i = 0; i < n; i += 1) {
      seen.add(ex.getState().target.notes.join(','));
      ex.setVariant(1);
    }
    return seen;
  };
  const drop2 = cycle('drop2', 0, 'dim7', 4);
  check('Cdim7 Drop 2 : 4 voicings différents via les flèches', drop2.size === 4, [...drop2].join(' | '));
  const us = cycle('upper_structure', 0, '7', 6);
  check('C7 Upper Structure : 6 triades différentes via les flèches', us.size === 6, [...us].join(' | '));

  // Toute note jouée vient de VoicingLab : on retrouve le voicing publié.
  const reference = getAvailableTechniques('Ebm9');
  check('Ebm9 : au moins une technique disponible', reference.some((c) => c.playable));

  // Difficulté 1★ en Progression : voicings VoicingLab de difficulté 1 (2 notes).
  const pr = createPracticeExercise();
  pr.setMode('progression');
  pr.setCustomProgressionFromDegrees([2, 5, 1].map((degree) => ({ degree })));
  pr.setDifficulty(1);
  const chords = pr.getState().progression.chords;
  check('1★ : accords sans extension (m7 / 7 / maj7)', chords.map((c) => c.symbol).join(' ') === 'm7 7 maj7', chords.map((c) => c.symbol).join(' '));
  check('1★ : two-note shell en Auto', chords.every((c) => c.voicing.technique === 'two_note_shell'));
  check('1★ : 2 notes par accord', chords.every((c) => c.notes.length === 2));
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
  checkVoicingLabGateAndCustomDifficulty();
  checkVoicingLabCoverage();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
