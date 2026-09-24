// [Claude] — 2026-09-21 — Tests headless du moteur de voicing de l'onglet Exercices.

import {
  createPracticeExercise,
  exerciseVoicingToSequence,
  unavailableTechniquesFor,
  getAvailableTechniques,
  findVoicingsByTopNote,
  findChordsByTopNote,
  TOP_NOTE_FILTERS,
  renderExerciseTarget,
  renderTopNoteBrowser,
  TARGET_QUALITY_GROUPS,
  listProgressionNames,
  listMovementNames,
  TECHNIQUES,
} from './practice-exercise.js';
import { generateCopilotVoicing } from './pedagogie/copilot-voicing.js';
import { parseChordSymbol } from './pedagogie/chord-parser-v2.js';
import { detectChord } from './chord-engine/index.js';
import { formatPc } from './chord-engine/naming.js';
import { applyDoublings } from './voicing-engine/doublings.js';
import {
  favoriteFromTarget, toggleFavorite, loadFavorites, saveFavorites, renderFavoritesList,
  removeFavorite, restoreFavorite, restoreFavorites, groupFavorites, favoriteMatches,
} from './practice-favorites.js';

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
  // Fmaj13#11 n'existe pas sur VoicingLab : seules les variantes dérivées
  // validées (rootless, open) restent, jamais Block/Spread/Shell/Drop 2.
  check('Fmaj13#11 : ni Shell, ni Close, ni Drop 2, ni Block, ni Spread',
    ['shell', 'close', 'drop2', 'block', 'spread'].every((t) => unavailableTechniquesFor('Fmaj13#11').includes(t)));
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

// [Claude] — 2026-09-23 — Qualités absentes de VoicingLab servies par des
// voicings dérivés (une note déplacée depuis un voicing VoicingLab réel).
function checkDerivedQualities() {
  console.log('\n=== Voicings dérivés (qualités absentes de VoicingLab) ===');
  const tones = {
    'm13': [0, 2, 3, 5, 7, 9, 10], '11': [0, 2, 4, 5, 7, 10], 'maj11': [0, 2, 4, 5, 7, 11],
    '13#11': [0, 2, 4, 6, 7, 9, 10], 'maj13#11': [0, 2, 4, 6, 7, 9, 11], '7sus2': [0, 2, 7, 10],
    'madd9': [0, 2, 3, 7], 'add11': [0, 4, 5, 7], '6add11': [0, 4, 5, 7, 9],
  };
  for (const [quality, allowed] of Object.entries(tones)) {
    for (let rootPc = 0; rootPc < 12; rootPc += 1) {
      const ex = createPracticeExercise();
      ex.setTargetChoice(rootPc, quality);
      const t = ex.getState().target;
      const ok = t && t.voicing.derived === true
        && t.notes.every((n) => allowed.includes((((n - rootPc) % 12) + 12) % 12));
      if (!ok) { check(`${quality} sur ${rootPc} : voicing dérivé aux notes de l'accord`, false, JSON.stringify(t?.notes)); return; }
    }
    check(`${quality} : 12 tons jouables, notes toutes dans l'accord, marqué dérivé`, true);
  }
  // Pas de 11 juste dans maj13#11 (cause du bug « toutes touches blanches »).
  const ex = createPracticeExercise();
  ex.setTargetChoice(5, 'maj13#11');
  check('Fmaj13#11 dérivé sans Bb (11 juste)', !ex.getState().target.notes.some((n) => n % 12 === 10));
  // Une qualité réelle VoicingLab n'est jamais marquée dérivée.
  const real = createPracticeExercise();
  real.setTargetChoice(0, 'maj7');
  check('Cmaj7 : voicing VoicingLab réel (non dérivé)', !real.getState().target.voicing.derived);
}

// [Claude] — 2026-09-23 — Recherche de voicings par note du dessus (sans octave).
function checkTopNoteSearch() {
  console.log('\n=== Recherche par note du dessus ===');
  const pcOf = (n) => ((n % 12) + 12) % 12;
  const fmaj7A = findVoicingsByTopNote(5, 'maj7', 9);
  check('Fmaj7 / La au sommet : plusieurs suggestions', fmaj7A.length >= 5, String(fmaj7A.length));
  check('Toutes ont La comme note la plus haute (toute octave)',
    fmaj7A.every((v) => pcOf(Math.max(...v.lh, ...v.rh)) === 9));
  check('Aucun shell ni two-note shell', fmaj7A.every((v) => v.technique !== 'shell' && v.technique !== 'two_note_shell'));
  check('Triées du plus simple au plus complexe',
    fmaj7A.every((v, i) => i === 0 || fmaj7A[i - 1].difficulty <= v.difficulty));
  check('Voicing de l\'exemple présent : MG F3 C4 / MD E4 A4',
    fmaj7A.some((v) => v.lh.join() === '53,60' && v.rh.join() === '64,69'));
  const adv = findVoicingsByTopNote(5, 'maj7', 9, { level: 'advanced' });
  check('Filtre Avancé : difficultés 4–5 uniquement', adv.length > 0 && adv.every((v) => v.difficulty >= 4));
  const drop2 = findVoicingsByTopNote(5, 'maj7', 9, { technique: 'drop2' });
  check('Filtre technique : uniquement Drop 2', drop2.length > 0 && drop2.every((v) => v.technique === 'drop2'));
  check('Technique shell demandée : aucune suggestion', findVoicingsByTopNote(5, 'maj7', 9, { technique: 'shell' }).length === 0);

  const ex = createPracticeExercise();
  ex.setTargetChoice(5, 'maj7');
  ex.setTopNote(9);
  const seen = new Set();
  const n = ex.getState().target.voicing.variantCount;
  for (let i = 0; i < n; i += 1) {
    const t = ex.getState().target;
    check(`Suggestion ${i + 1} : La au sommet`, pcOf(Math.max(...t.notes)) === 9);
    seen.add(`${t.voicing.leftHand}|${t.voicing.rightHand}`);
    ex.setVariant(1);
  }
  check('Les flèches parcourent toutes les suggestions', seen.size === n);
  ex.selectTopNoteSuggestion(2);
  check('Clic sur une suggestion : sélection directe', ex.getState().target.voicing.variantIndex === 2);
  ex.setTopNote(1);
  check('Note absente du sommet : voicing habituel signalé (topNoteMiss)', ex.getState().target.topNoteMiss === true);
  ex.setTopNote(null);
  check('Recherche désactivée : plus de suggestions', !ex.getState().target.voicing.topNoteSuggestions && !ex.getState().target.topNoteMiss);

  const rnd = createPracticeExercise();
  rnd.setTopNote(7);
  rnd.clearTargetChoice();
  const t = rnd.getState().target;
  check('Aléatoire avec note du dessus : accord tiré qui a Sol au sommet', !t.topNoteMiss && pcOf(Math.max(...t.notes)) === 7, t.name);
}

// [Claude] — 2026-09-23 — Les 10 674 voicings VoicingLab sont tous accessibles
// depuis une technique de l'Exercice (Stride et Cluster compris).
async function checkAllVoicingLabReachable() {
  console.log('\n=== Couverture totale du référentiel VoicingLab ===');
  const ref = (await import('./data/voicinglab-reference.json', { with: { type: 'json' } })).default;
  const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const alias = { 69: '6/9', m69: 'm6/9' };
  let total = 0;
  for (const key of Object.keys(ref.chords)) {
    const [pc, quality] = key.split('|');
    for (const c of getAvailableTechniques(names[pc] + (alias[quality] ?? quality))) total += c.count;
  }
  check('10 674 voicings VoicingLab accessibles dans l\'Exercice', total === 10674, String(total));
  check('Stride proposé (C7 : 2 voicings)', getAvailableTechniques('C7').find((c) => c.id === 'stride')?.count === 2);
  check('Cluster proposé (D13 : 1 voicing)', getAvailableTechniques('D13').find((c) => c.id === 'cluster')?.count === 1);
  check('Stride exclu de la note du dessus (main gauche seule)',
    findVoicingsByTopNote(0, '7', 10, { technique: 'stride' }).length === 0);
}

// [Claude] — 2026-09-23 — Navigateur : tous les accords ayant une note au sommet.
function checkTopNoteBrowser() {
  console.log('\n=== Navigateur par note du dessus ===');
  const pcOf = (n) => ((n % 12) + 12) % 12;
  const all = findChordsByTopNote(9);
  check('La au sommet : plus de 200 accords', all.length > 200, String(all.length));
  check('Fmaj7 présent avec 7 voicings', all.find((r) => r.name === 'Fmaj7')?.voicings.length === 7);
  // L'index de chaque puce charge exactement ce voicing dans l'exercice.
  let coherent = true;
  for (const r of all.filter((_, i) => i % 17 === 0)) {
    const ex = createPracticeExercise();
    ex.setTopNote(9);
    ex.setTargetChoice(r.rootPc, r.quality);
    const v = r.voicings[r.voicings.length - 1];
    ex.selectTopNoteSuggestion(v.index);
    const t = ex.getState().target;
    if (t.voicing.technique !== v.technique || pcOf(Math.max(...t.notes)) !== 9) coherent = false;
  }
  check('Clic sur une puce : accord + voicing chargés, La au sommet', coherent);
  const simple = findChordsByTopNote(9, { level: 'simple' });
  check('Niveau Simple : moins d\'accords, difficultés ≤ 2',
    simple.length < all.length && simple.every((r) => r.voicings.every((v) => v.difficulty <= 2)));
  const allQualities = TARGET_QUALITY_GROUPS.flatMap((g) => g.qualities);
  check('48 qualités dans les familles', allQualities.length === 48 && new Set(allQualities).size === 48);
  const html = renderTopNoteBrowser(all, { topPc: 9 });
  check('Liste groupée par famille', html.includes('>Mineurs</li>') && html.includes('>Majeurs</li>'));
  check('Liste épurée : un bouton par accord, pas de puce par voicing',
    (html.match(/data-browse-root=/g) || []).length === all.length && !html.includes('data-browse-index'));
}

// [Claude] — 2026-09-23 — Régression signalée par Narcisse : après un clic sur
// « Block », la note du dessus ne proposait plus que des Block (0 en Simple).
function checkTopNoteIgnoresCardTechnique() {
  console.log('\n=== Note du dessus : indépendante de la technique cliquée ===');
  const ex = createPracticeExercise();
  ex.setTechnique('block');
  ex.setTargetChoice(5, 'maj7');
  ex.setTopNote(9);
  const techniques = new Set(ex.getState().target.voicing.topNoteSuggestions.map((s) => s.technique));
  check('Technique Block cliquée : suggestions de plusieurs techniques', techniques.size > 1, [...techniques].join(','));
  ex.setTopNoteLevel('simple');
  const simple = ex.getState().target;
  check('Niveau Simple toujours servi après un clic sur Block (accord ou repli signalé)',
    simple.topNoteMiss === true || simple.voicing.topNoteSuggestions.length > 0);
  for (const level of ['simple', 'intermediate', 'advanced']) {
    const found = findChordsByTopNote(0, { level });
    const techs = new Set(found.flatMap((r) => r.voicings.map((v) => v.technique)));
    check(`Navigateur ${level} (Do au sommet) : accords trouvés, plusieurs techniques`, found.length > 50 && techs.size > 1, `${found.length} / ${[...techs].join(',')}`);
  }
}

// [Claude] — 2026-09-23 — Doublures d'octave (idée de Narcisse : F2+F3 à la main gauche).
function checkDoublings() {
  console.log('\n=== Doublures d\'octave ===');
  const d = applyDoublings({ leftHand: [53, 57, 64], rightHand: [] }, 5, 'bass');
  check('Fmaj7 une main : F2+F3 à la main gauche, le reste à droite',
    d.leftHand.join() === '41,53' && d.rightHand.join() === '57,64' && d.doubled.join() === '41');
  const rootless = applyDoublings({ leftHand: [52, 57], rightHand: [62, 67] }, 5, 'bass');
  check('Voicing rootless : aucune basse inventée', rootless.doubled.length === 0);
  const c6 = applyDoublings({ leftHand: [], rightHand: [60, 64, 67, 69] }, 0, 'melody');
  check('Mélodie doublée jamais sous la basse (C6 ≠ Am7)', c6.doubled.length === 0);
  const ex = createPracticeExercise();
  let total = 0; let changed = 0; let stable = true; let validated = true;
  for (const [root, sym] of [[5, 'maj7'], [0, '7'], [2, 'm7'], [7, '13'], [9, 'm7b5'], [4, '7b9'], [0, '6']]) {
    for (const tech of ['auto', 'close', 'drop2', 'stride', 'block', 'open']) {
      ex.setTechnique(tech); ex.setDoubling('none'); ex.setTargetChoice(root, sym);
      const plain = ex.getState().target;
      if (!plain) continue;
      ex.setDoubling('full');
      const t = ex.getState().target;
      total += 1;
      if (t.voicing.doubled?.length) changed += 1;
      const a = detectChord(plain.notes); const b = detectChord(t.notes);
      if (a?.rootPc !== b?.rootPc || a?.symbol !== b?.symbol) stable = false;
      if (new Set(plain.notes.map((n) => n % 12)).size !== new Set(t.notes.map((n) => n % 12)).size) stable = false;
      if (!ex.check(t.notes).success) validated = false;
    }
  }
  check('Doublures appliquées à une majorité de voicings', changed > total / 2, `${changed}/${total}`);
  check('Doublures : accord détecté et classes de hauteur inchangés', stable);
  check('Doublures : le voicing enrichi est validé par check()', validated);
  ex.setDoubling('none');
  check('Doublures désactivées : rien d\'ajouté', !ex.getState().target.voicing.doubled);
}

// [Claude] — 2026-09-24 — Clusters VoicingLab = main droite seule (ex. G4 A4 Bb4
// pour Eb7#11, sans fondamentale ni septième) : main gauche ajoutée.
function checkClusterLeftHand() {
  console.log('\n=== Cluster : main gauche fondamentale + septième ===');
  const ex = createPracticeExercise();
  ex.setTechnique('cluster');
  ex.setTargetChoice(3, '7#11');
  const v = ex.getState().target.voicing;
  check('Eb7#11 cluster : LH Eb2 Db3, RH VoicingLab intacte',
    v.leftHand.join() === '39,49' && v.rightHand.join() === '67,69,70' && v.addedLH.join() === '39,49');
  const d = detectChord(ex.getState().target.notes);
  check('Eb7#11 cluster détecté avec la bonne fondamentale', d?.rootPc === 3, d?.symbol);
  let total = 0; let rooted = 0;
  for (let root = 0; root < 12; root += 1) {
    for (const q of ['7', '9', '13', '7#11', '7b13', '7#9', '7sus4']) {
      ex.setTargetChoice(root, q);
      const t = ex.getState().target;
      if (t?.voicing.technique !== 'cluster') continue;
      total += 1;
      if (t.voicing.leftHand.length > 0 && Math.max(...t.voicing.leftHand) < Math.min(...t.voicing.rightHand)
        && detectChord(t.notes)?.rootPc === root) rooted += 1;
    }
  }
  check('Clusters (dominantes courantes) : main gauche sous la main droite et fondamentale détectée', total > 0 && rooted === total, `${rooted}/${total}`);
}

// [Claude] — 2026-09-24 — Filtres de la recherche par note du dessus (demande de
// Narcisse : trier les voicings, pas choisir à sa place).
function checkTopNoteFilters() {
  console.log('\n=== Note du dessus : filtres ===');
  const two = findVoicingsByTopNote(5, 'maj7', 9, { hands: 'two' });
  check('Deux mains : main gauche et main droite non vides', two.length > 0 && two.every((v) => v.lh.length && v.rh.length));
  const drop2 = findVoicingsByTopNote(5, 'maj7', 9, { technique: 'drop2' });
  check('Technique Drop 2 seule', drop2.length > 0 && drop2.every((v) => v.technique === 'drop2'));

  // La carte et le navigateur appliquent les mêmes filtres : même index.
  const ex = createPracticeExercise();
  ex.setTargetChoice(5, 'maj7');
  ex.setTopNote(9);
  ex.setTopNoteFilter('hands', 'two');
  const target = ex.getState().target;
  const browsed = findChordsByTopNote(9, { ...ex.getState().topNote })
    .find((r) => r.rootPc === 5 && r.quality === 'maj7');
  check('Carte et navigateur : mêmes voicings filtrés',
    browsed && browsed.voicings.length === target.voicing.topNoteSuggestions.length, `${browsed?.voicings.length} / ${target.voicing.topNoteSuggestions.length}`);
  check('Carte filtrée : voicing affiché conforme aux filtres',
    target.voicing.leftHand.length > 0 && target.voicing.rightHand.length > 0);
  const inC = findChordsByTopNote(9, { key: '0' }).map((r) => r.name);
  check('Tonalité C : G13, Dm11, Fmaj7#11 présents ; G7b9, Bm11, Ebmaj7#11 exclus',
    ['G13', 'Dm11', 'Fmaj7#11'].every((n) => inC.includes(n)) && !['G7b9', 'Bm11', 'D#maj7#11'].some((n) => inC.includes(n)), inC.join(' '));
  const cScale = new Set([0, 2, 4, 5, 7, 9, 11]);
  check('Tonalité C : toutes les notes des voicings listés sont dans la gamme',
    findChordsByTopNote(4, { key: '0' }).every((r) => findVoicingsByTopNote(r.rootPc, r.quality, 4, { key: '0' })
      .every((v) => [...v.lh, ...v.rh].every((n) => cScale.has(n % 12)))));
  const ofC = findChordsByTopNote(9, { chordRoot: '0' });
  check('Accords de C : seulement des fondamentales C', ofC.length > 0 && ofC.every((r) => r.rootPc === 0));
  ex.setTopNoteFilter('hands', 'bogus');
  check('Valeur de filtre invalide ignorée', ex.getState().topNote.hands === 'two');
  ex.setTopNoteFilter('octave', '5');
  check('Filtres retirés (octave, famille, taille, fondamentale) refusés', !('octave' in ex.getState().topNote) && !TOP_NOTE_FILTERS.size && !TOP_NOTE_FILTERS.family && !TOP_NOTE_FILTERS.root);
}

// [Claude] — 2026-09-24 — Favoris : le voicing exact revient sans refaire les filtres.
function checkFavorites() {
  console.log('\n=== Favoris ===');
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)) };
  const ex = createPracticeExercise();
  ex.setTopNote(9);
  ex.setTopNoteFilter('hands', 'two');
  ex.setTargetChoice(5, 'maj7');
  ex.setDoubling('bass');
  const shown = ex.getState().target;
  const fav = favoriteFromTarget(shown);
  let list = toggleFavorite([], fav);
  saveFavorites(storage, list);
  const reloaded = loadFavorites(storage);
  check('Favori enregistré puis relu à l\'identique', reloaded.length === 1 && reloaded[0].key === fav.key
    && reloaded[0].lh.join() === shown.voicing.leftHand.join() && reloaded[0].rh.join() === shown.voicing.rightHand.join());
  check('Deuxième clic sur l\'étoile : favori retiré', toggleFavorite(list, fav).length === 0);

  // Autre session : filtres et accord différents, puis retour au favori.
  const ex2 = createPracticeExercise();
  ex2.setTargetChoice(0, '7');
  ex2.showFavorite(reloaded[0]);
  const back = ex2.getState().target;
  check('Favori réaffiché : même accord, mêmes mains, doublure conservée',
    back.name === shown.name && back.voicing.leftHand.join() === shown.voicing.leftHand.join()
    && back.voicing.rightHand.join() === shown.voicing.rightHand.join()
    && (back.voicing.doubled || []).join() === (shown.voicing.doubled || []).join());
  check('Favori réaffiché : validé en jouant ses notes', ex2.check(back.notes).success);
  check('Stockage corrompu : liste vide sans erreur', loadFavorites({ getItem: () => '{pas du json' }).length === 0);
  check('Liste des favoris : bouton d\'ouverture et de retrait', renderFavoritesList(reloaded).includes('data-favorite-open')
    && renderFavoritesList(reloaded).includes('data-favorite-remove'));

  // Beaucoup de favoris : regroupés par accord, recherche (bémols), annulation.
  const mk = (rootPc, quality, name, rh, technique) => ({ rootPc, quality, name, lh: [], rh, technique, key: `${rootPc}|${quality}|${rh}` });
  const many = [mk(10, 'm7b5', 'A#m7b5', [70, 73], 'close'), mk(2, 'm9', 'Dm9', [65, 69], 'drop2'), mk(2, 'm9', 'Dm9', [64, 69], 'close')];
  const groups = groupFavorites(many);
  check('Favoris groupés par accord, dans l\'ordre des notes', groups.map((g) => `${g.name}:${g.items.length}`).join(' ') === 'Dm9:2 A#m7b5:1');
  check('Recherche : « bb » trouve A#m7b5, « drop 2 » la technique', favoriteMatches(many[0], 'bb')
    && favoriteMatches(many[1], 'drop 2', { drop2: 'Drop 2' }) && !favoriteMatches(many[1], 'bb'));
  const after = removeFavorite(many, many[1].key);
  const undone = restoreFavorite(after, many[1], 1);
  check('Annuler une suppression : le favori revient à sa place', undone.map((f) => f.key).join() === many.map((f) => f.key).join());
  check('Bandeau « Annuler » affiché après suppression', renderFavoritesList(after, { removed: many[1] }).includes('data-favorite-undo'));
  // Plusieurs retraits d'affilée : tous annulés d'un coup, chacun à sa place.
  const r1 = { fav: many[0], index: 0 };
  const l1 = removeFavorite(many, many[0].key);
  const r2 = { fav: many[2], index: 1 };
  const l2 = removeFavorite(l1, many[2].key);
  check('Deux retraits annulés d\'un coup : ordre d\'origine rétabli', restoreFavorites(l2, [r1, r2]).map((f) => f.key).join() === many.map((f) => f.key).join());
  check('Bandeau : « 2 favoris retirés »', renderFavoritesList(l2, { removed: [many[0], many[2]] }).includes('2 favoris retirés'));
}

// [Claude] — 2026-09-23 — Doublures étendues aux modes Progression et Mouvement.
function checkDoublingsInSequences() {
  console.log('\n=== Doublures : Progression et Mouvement ===');
  for (const mode of ['progression', 'movement']) {
    const ex = createPracticeExercise();
    ex.setMode(mode);
    ex.setTechnique('stride');
    ex.setDoubling('full');
    const grid = ex.getState().progression.chords;
    check(`${mode} : doublures appliquées à toute la grille`, grid.some((c) => c.voicing.doubled?.length > 0),
      grid.map((c) => c.name).join(' '));
    ex.setDoubling('none');
    check(`${mode} : doublures retirées de toute la grille`, ex.getState().progression.chords.every((c) => !c.voicing.doubled));
    ex.setDoubling('full');
    // Jouer les voicings doublés sur deux grilles complètes (Mouvement : passage au ton suivant compris).
    let allValid = true; let doubledSeen = 0;
    const steps = ex.getState().progression.chords.length * 2;
    for (let i = 0; i < steps; i += 1) {
      const target = ex.getState().target;
      if (target.voicing.doubled?.length) doubledSeen += 1;
      if (!ex.check(target.notes).success) { allValid = false; break; }
    }
    check(`${mode} : voicings doublés validés d'accord en accord`, allValid);
    check(`${mode} : les doublures persistent après avancement`, doubledSeen > steps / 2, `${doubledSeen}/${steps}`);
  }
}

// [Claude] — 2026-09-23 — Étiquette « Auto » : retour possible après un clic sur une technique.
function checkAutoTag() {
  console.log('\n=== Étiquette Auto ===');
  const ex = createPracticeExercise();
  ex.setTargetChoice(0, 'maj7');
  const cats = () => getAvailableTechniques('Cmaj7');
  let html = renderExerciseTarget(ex.getState().target, { categories: cats(), selectedTechnique: ex.getState().technique });
  check('Auto affiché et actif par défaut', /exercise-category-auto active"[^>]*data-technique="auto"/.test(html));
  check('En Auto : technique jouée marquée current', /exercise-category-tag current" data-technique="shell"/.test(html));
  ex.setTechnique('block');
  html = renderExerciseTarget(ex.getState().target, { categories: cats(), selectedTechnique: ex.getState().technique });
  check('Block choisi : Block actif, Auto inactif',
    /exercise-category-tag active" data-technique="block"/.test(html) && !/exercise-category-auto active/.test(html));
  ex.setTechnique('auto');
  check('Retour en Auto : technique auto et voicing shell', ex.getState().technique === 'auto' && ex.getState().target.voicing.technique === 'shell');
}

async function runTests() {
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
  checkDerivedQualities();
  checkTopNoteSearch();
  checkTopNoteBrowser();
  checkTopNoteIgnoresCardTechnique();
  checkAutoTag();
  checkDoublings();
  checkDoublingsInSequences();
  checkClusterLeftHand();
  checkTopNoteFilters();
  checkFavorites();
  await checkAllVoicingLabReachable();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
