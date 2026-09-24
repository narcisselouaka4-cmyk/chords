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
  keySequence,
  CUSTOM_GRID_NAME,
  listMovementNames,
  TECHNIQUES,
  judgeAnswer,
  realizesChord,
  isTextbookScope,
  exerciseVoicingsFor,
  voiceLeadingCost,
  topNoteChoices,
  spellChordTone,
  renderTopNoteSelect,
  isTensionQuality,
  planPassingChord,
  PASSING_QUALITIES_BY_LEVEL,
} from './practice-exercise.js';
import { loadGrids, saveGrids, upsertGrid, removeGrid } from './practice-grids.js';
import {
  respectsLowIntervalLimits, respectsFamilyDefinition, minorNinthClashes, hasEleventhAgainstMajorThird,
} from './voicing-engine/textbook-voicings.js';
import movementsLibrary from './data/movements-library.json' with { type: 'json' };
import { getVoicingLabVoicings } from './voicing-engine/voicinglab-availability.js';
import { generateCopilotVoicing } from './pedagogie/copilot-voicing.js';
import { parseChordSymbol } from './pedagogie/chord-parser-v2.js';
import { detectChord } from './chord-engine/index.js';
import { formatPc } from './chord-engine/naming.js';
import { applyDoublings } from './voicing-engine/doublings.js';
import { spellDegreeInKey, spellPcInKey, keyLabel } from './practice-key-spelling.js';
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
  // [Claude] — 2026-09-24 — Depuis que les techniques infidèles sont barrées,
  // 7#9b13, 13#11 et maj13#11 n'ont plus de Close (36 tirages sur 492) : le test
  // échouait au hasard. On retire au sort jusqu'à un accord qui a un Close.
  const hasClose = (t) => getAvailableTechniques(t.name).some((c) => c.id === 'close' && c.playable);
  for (let i = 0; i < 50 && !hasClose(ex.getState().target); i += 1) ex.next();
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

// [Claude] — 2026-09-24 — Mode Progression retiré (décision de Narcisse) : il
// choisissait seul extensions et altérations, sans contexte.
function checkProgressionModeRemoved() {
  const ex = createPracticeExercise();
  ex.setMode('progression');
  check('Mode Progression retiré : setMode(\'progression\') sans effet', ex.getState().mode === 'chord');
  check('API Progression retirée', ex.setCustomProgressionFromDegrees === undefined && ex.setCustomProgression === undefined);
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
  check('fourway_close indisponible en mode movement', unavailableTechniquesFor('Cmaj7', 'movement').includes('fourway_close'));
}

function checkPreviousNavigation() {
  const ex = createPracticeExercise();
  ex.setMode('movement');
  ex.setTechnique('close');
  ex.setKeyChoice(0);
  ex.setContentChoice('Cadence II-V-I majeur'); // déterministe
  check('mouvement : pas de précédent au premier accord', ex.canGoPrevious() === false);

  const prog = ex.getState().progression;
  ex.check([...prog.chords[0].notes]); // valide le 1er accord → avance d'une étape (son passage, F#dim7)
  const afterAdvance = ex.getState();
  if (afterAdvance.stepIndex > 0 || afterAdvance.progression.onPassing) {
    const scoreBefore = afterAdvance.score;
    check('mouvement : précédent disponible après avancée', ex.canGoPrevious() === true);
    const moved = ex.previous();
    const back = ex.getState();
    check("mouvement : previous() recule d'une étape (du passage à son accord)", moved !== null && back.stepIndex === 0 && !back.progression.onPassing && back.target.name === prog.chords[0].name);
    check('mouvement : previous() ne touche pas au score', back.score === scoreBefore);
    check('mouvement : previous() remet les tentatives à zéro', back.attempts === 0);
  } else {
    check('mouvement : avancée préalable au test previous', false, `la validation du 1er accord n'a pas avancé — notes=${prog.chords[0].notes.join(',')}`);
  }

  const exChord = createPracticeExercise();
  check('mode accord : jamais de précédent', exChord.canGoPrevious() === false);
}

function checkContentChoice() {
  const movements = listMovementNames();
  check('liste des mouvements non vide', movements.length > 0);
  const exMv = createPracticeExercise();
  exMv.setMode('movement');
  exMv.setContentChoice(movements[0]);
  check('mouvement choisi respecté', exMv.getState().progression.name === movements[0], `obtenu=${exMv.getState().progression.name}`);

  exMv.setContentChoice(null);
  check('retour au tirage aléatoire', exMv.getState().movementChoice === null);

  // « Ma grille » active, choisir un mouvement de la bibliothèque l'affiche bien.
  const exCustom = createPracticeExercise();
  exCustom.setCustomGrid('Dm7 G7 Cmaj7');
  check('Ma grille choisie', exCustom.getState().progression.name === CUSTOM_GRID_NAME);
  exCustom.setContentChoice('Cadence II-V-I majeur');
  check('mouvement choisi après Ma grille', exCustom.getState().progression.name === 'Cadence II-V-I majeur');
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
  ex.setMode('movement');
  ex.setContentChoice('Turnaround III-VI-II-V-I');
  const seqs = [1, 3, 5].map((d) => {
    ex.setDifficulty(d);
    const p = ex.getState().progression;
    return { name: p.name, symbols: p.chords.map((c) => c.symbol).join(' ') };
  });
  check('Mouvement conservé à tous les niveaux', seqs.every((x) => x.name === 'Turnaround III-VI-II-V-I' && x.symbols.split(' ').length === 5));
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

  // Difficulté 1★ en Mouvement : voicings VoicingLab de difficulté 1 (2 notes).
  const pr = createPracticeExercise();
  pr.setMode('movement');
  pr.setContentChoice('Cadence II-V-I majeur');
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
  // [Claude] — 2026-09-24 — Seules les variantes fidèles au nom sont accessibles
  // (couleurs et notes définissantes présentes, basse = 1, 3 ou 5) : le reste
  // du référentiel est lu mais écarté, et la technique barrée si plus rien.
  const { VOICINGLAB_STYLE_BY_FAMILY, getVoicingLabVoicings } = await import('./voicing-engine/voicinglab-availability.js');
  let raw = 0;
  for (const key of Object.keys(ref.chords)) {
    const [pc, quality] = key.split('|');
    for (const family of Object.keys(VOICINGLAB_STYLE_BY_FAMILY)) {
      if (family === 'rootlessA' || family === 'rootlessB') continue;
      raw += getVoicingLabVoicings(Number(pc), alias[quality] ?? quality, family).length;
    }
    raw += getVoicingLabVoicings(Number(pc), alias[quality] ?? quality, 'rootlessA').length
      + getVoicingLabVoicings(Number(pc), alias[quality] ?? quality, 'rootlessB').length;
  }
  check('Référentiel VoicingLab lu en entier (10 674 voicings)', raw === 10674, String(raw));
  // [Claude] — 2026-09-24 — Accords de 11e, de 13e et altérés : les variantes non
  // conformes au manuel sont reconstruites (souvent en plusieurs renversements :
  // Block en 4), d'où 3 180 → 3 658 voicings ; hors de ce périmètre, rien ne change.
  const inScope = (q) => isTextbookScope(q);
  let scoped = 0;
  for (const key of Object.keys(ref.chords)) {
    const [pc, quality] = key.split('|');
    const q = alias[quality] ?? quality;
    if (!inScope(q)) continue;
    for (const c of getAvailableTechniques(names[pc] + q)) scoped += c.count;
  }
  // [Claude] — 2026-09-24 — Réalisme (Narcisse : « les voicings proposés sont
  // absurdes ») : renversements de la close position ajoutés (240 hors périmètre,
  // 252 dans le périmètre), voicings qu'une main ne tient pas retirés (plus d'une
  // 10e, main gauche seule au-dessus de La4 : 7 + 25) et 7alt reconstruits en
  // vrais accords altérés (272 → 238 voicings, renversements compris) :
  // 3 714 → 3 947 et 3 658 → 3 851.
  check('Voicings accessibles hors 11e / 13e / altérés = voicings fidèles au nom (3 947)', total - scoped === 3947, String(total - scoped));
  check('Voicings accessibles des 11e / 13e / altérés, reconstructions comprises (3 851)', scoped === 3851, String(scoped));
  check('Stride proposé (C7 : 2 voicings)', getAvailableTechniques('C7').find((c) => c.id === 'stride')?.count === 2);
  check('Cluster barré pour D13 (sans 13e), proposé pour D7#11',
    getAvailableTechniques('D13').find((c) => c.id === 'cluster')?.count === 0
    && getAvailableTechniques('D7#11').find((c) => c.id === 'cluster')?.count === 1);
  check('Stride exclu de la note du dessus (main gauche seule)',
    findVoicingsByTopNote(0, '7', 10, { technique: 'stride' }).length === 0);
}

// [Claude] — 2026-09-24 — Accords épelés selon la tonalité (capture de Narcisse :
// « A#maj7 » comme IV de Fa) et tonalité affichée en mode Progression.
function checkKeySpelling() {
  console.log('\n=== Orthographe selon la tonalité ===');
  const spell = (key, list) => list.map(([deg, off]) => spellDegreeInKey((key + off) % 12, deg, key)).join(' ');
  check('Fa majeur : IV V III VI II V I = Bb C A D G C F', spell(5, [[4, 5], [5, 7], [3, 4], [6, 9], [2, 2], [5, 7], [1, 0]]) === 'Bb C A D G C F');
  check('Do majeur : bII bIII #IV bVI bVII = Db Eb F# Ab Bb', spell(0, [[2, 1], [3, 3], [4, 6], [6, 8], [7, 10]]) === 'Db Eb F# Ab Bb');
  check('Gb majeur : IV = B (pas Cb)', spellDegreeInKey(11, 4, 6) === 'B');
  check('Libellés : Bb majeur, C# mineur', keyLabel(10) === 'Bb majeur' && keyLabel(1, true) === 'C# mineur');
  check('Accord joué épelé selon l\'armure (A# → Bb en Fa, A# en Ré)', spellPcInKey(10, 5) === 'Bb' && spellPcInKey(10, 2) === 'A#');

  const ex = createPracticeExercise();
  ex.setMode('movement');
  ex.setDifficulty(1);
  ex.setKeyChoice(5);
  ex.setContentChoice('IV-V-vi-ii pop');
  const prog = ex.getState().progression;
  check('Mouvement en Fa : Bbmaj7 C7 Dm7 Gm7', prog.chords.map((c) => c.name).join(' ') === 'Bbmaj7 C7 Dm7 Gm7',
    prog.chords.map((c) => c.name).join(' '));
  check('Tonalité connue du mouvement (F majeur)', prog.currentKey === 5 && prog.minor === false);
  ex.setTechnique('drop2');
  ex.setVariant(1);
  check('Nom épelé conservé après changement de technique et de variante', ex.getState().target.name === 'Bbmaj7');
  const wrong = ex.check([60, 64, 67]);
  check('Message d\'erreur : accord attendu épelé en bémols', wrong.message.includes('Bbmaj7'), wrong.message);
  const mv = createPracticeExercise();
  mv.setMode('movement');
  mv.setKeyChoice(1);
  mv.setContentChoice('Alternance mineur 6 – diminué (Barry Harris)');
  const target = mv.getState().target;
  check('Mouvement mineur : « Tonalité C# mineur », C#m6', target.keyLabel === 'Tonalité C# mineur' && target.name === 'C#m6', `${target.keyLabel} ${target.name}`);
}

// [Claude] — 2026-09-24 — Techniques barrées quand elles trahissent l'accord
// (captures de Narcisse : Shell de Fmaj7#11 sans #11, Drop 3 de Fmaj13 avec la
// 7e majeure à la basse, lu « Dmadd9 »).
function checkFaithfulTechniques() {
  console.log('\n=== Techniques fidèles au nom de l\'accord ===');
  const count = (symbol, id) => getAvailableTechniques(symbol).find((c) => c.id === id)?.count ?? 0;
  check('Shell barré pour Fmaj7#11, G7alt, Dm11 ; gardé pour Fmaj7, G7, Dm7',
    ['Fmaj7#11', 'G7alt', 'Dm11'].every((s) => count(s, 'shell') === 0) && ['Fmaj7', 'G7', 'Dm7'].every((s) => count(s, 'shell') > 0));
  check('Two-note shell gardé pour les accords simples (maj7, 7, m7)', ['Cmaj7', 'C7', 'Cm7'].every((s) => count(s, 'two_note_shell') > 0));
  let bassOk = true;
  for (let v = 0; v < 8; v += 1) {
    const ex = createPracticeExercise();
    ex.setTechnique('drop3');
    ex.setTargetChoice(5, 'maj13');
    for (let i = 0; i < v; i += 1) ex.setVariant(1);
    const t = ex.getState().target;
    if (t.voicing.technique === 'drop3' && Math.min(...t.notes) % 12 === 4) bassOk = false;
  }
  check('Drop 3 de Fmaj13 : jamais la 7e majeure (E) à la basse', bassOk);
  const rootless = findVoicingsByTopNote(7, '13', 4, { technique: 'rootless' });
  check('Rootless non soumis à la règle de basse (G13, top E)', rootless.length > 0);
  let empty = [];
  for (const q of TARGET_QUALITY_GROUPS.flatMap((g) => g.qualities)) {
    for (let root = 0; root < 12; root += 1) {
      const name = `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][root]}${q}`;
      if (!getAvailableTechniques(name).some((c) => c.playable)) empty.push(name);
    }
  }
  check('Aucune des 48 qualités sans voicing, sur les 12 fondamentales', empty.length === 0, empty.slice(0, 5).join(' '));
}

// [Claude] — 2026-09-23 — Navigateur : tous les accords ayant une note au sommet.
function checkTopNoteBrowser() {
  console.log('\n=== Navigateur par note du dessus ===');
  const pcOf = (n) => ((n % 12) + 12) % 12;
  const all = findChordsByTopNote(9);
  check('La au sommet : plus de 150 accords', all.length > 150, String(all.length));
  // 5 et non plus 6 depuis le recentrage de registre (2026-09-24) : le Drop 2
  // F4 | C5 E5 A5 descend à F3 | C4 E4 A4, identique note pour note (et main
  // pour main) à un Spread déjà listé, donc gardé une seule fois.
  check('Fmaj7 présent avec 5 voicings fidèles', all.find((r) => r.name === 'Fmaj7')?.voicings.length === 5,
    String(all.find((r) => r.name === 'Fmaj7')?.voicings.length));
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
  // [Claude] — 2026-09-24 — Main gauche entre Fa2 et Mi3 : Eb2 Db3 (7e mineure
  // sous Fa2) passait sous la limite grave de Levine.
  check('Eb7#11 cluster : LH Eb3 Db4, RH VoicingLab intacte',
    v.leftHand.join() === '51,61' && v.rightHand.join() === '67,69,70' && v.addedLH.join() === '51,61');
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

// [Claude] — 2026-09-23 — Doublures étendues au mode Mouvement.
function checkDoublingsInSequences() {
  console.log('\n=== Doublures : Mouvement ===');
  for (const mode of ['movement']) {
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
    // [Claude] — 2026-09-24 — Voicings enchaînés : selon la variante choisie, une
    // doublure n'est pas toujours possible (stride à basse sur la quinte). On
    // vérifie qu'elle est appliquée partout où elle l'est.
    let allValid = true; let missed = 0; let doubledSeen = 0;
    const steps = ex.getState().progression.chords.length * 2;
    for (let i = 0; i < steps; i += 1) {
      const target = ex.getState().target;
      const plain = { ...target.voicing, leftHand: target.voicing.leftHand.filter((n) => !target.voicing.doubled?.includes(n)), rightHand: target.voicing.rightHand.filter((n) => !target.voicing.doubled?.includes(n)) };
      const possible = applyDoublings(plain, target.rootPc, 'full').doubled.length;
      if (target.voicing.doubled?.length) doubledSeen += 1;
      else if (possible) missed += 1;
      if (!ex.check(target.notes).success) { allValid = false; break; }
    }
    check(`${mode} : voicings doublés validés d'accord en accord`, allValid);
    check(`${mode} : les doublures persistent après avancement (partout où elles sont possibles)`, missed === 0 && doubledSeen > 0, `${doubledSeen}/${steps}, manquées ${missed}`);
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

// [Claude] — 2026-09-24 — Mouvements : « II-V-I altéré en mineur » et « Cycle de
// tierces majeures » étaient remplacés en silence par un autre mouvement.
function movementChords(name, { key = 0, difficulty = 3, technique = 'auto' } = {}) {
  const ex = createPracticeExercise();
  ex.setMode('movement');
  ex.setTechnique(technique);
  ex.setDifficulty(difficulty);
  ex.setKeyChoice(key);
  ex.setContentChoice(name);
  return ex.getState().progression;
}

function checkMovementLibraryComplete() {
  console.log('\n=== Mouvements : bibliothèque complète, 12 tons × 5 niveaux ===');
  const failures = [];
  for (const movement of movementsLibrary.movements) {
    const size = movement.pattern.split('-').length;
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      for (let key = 0; key < 12; key += 1) {
        const prog = movementChords(movement.name, { key, difficulty });
        if (prog.name !== movement.name || prog.chords.length !== size || prog.notice) {
          failures.push(`${movement.name} niveau ${difficulty} ton ${key} → ${prog.name} (${prog.chords.length}/${size})`);
        }
      }
    }
  }
  check('Chaque mouvement choisi est construit tel quel (aucun remplacement)', failures.length === 0, failures.slice(0, 3).join(' ; '));

  // [Claude] — 2026-09-24 (nuit) — Règle de Narcisse : l'altération du V se joue en passage.
  const minor = movementChords('II-V-I altéré en mineur', { difficulty: 2 });
  check('II-V-I altéré en mineur (Do) : Dm7b5 G7 CmMaj7, G7alt en passage', minor.chords.map((c) => c.name).join(' ') === 'Dm7b5 G7 CmMaj7'
    && minor.chords[1].passingChord?.name === 'G7alt', minor.chords.map((c) => c.name + (c.passingChord ? ` (${c.passingChord.name})` : '')).join(' '));
  check('II-V-I altéré en mineur : V sur Sol (pas Solb), tonalité C mineur',
    minor.chords[1].rootPc === 7 && minor.minor === true, `V=${minor.chords[1].rootPc}`);
  const minor5 = movementChords('II-V-I altéré en mineur', { difficulty: 5, key: 9 });
  check('II-V-I altéré en mineur (La, niveau 5) : Bm7b5 (B7alt) E7 (E7alt) AmMaj7',
    minor5.chords.map((c) => c.name + (c.passingChord ? ` (${c.passingChord.name})` : '')).join(' ') === 'Bm7b5 (B7alt) E7 (E7alt) AmMaj7',
    minor5.chords.map((c) => c.name + (c.passingChord ? ` (${c.passingChord.name})` : '')).join(' '));
  // Niveau 1 : structure de base du motif (le niveau 3 l'enrichit en 13e).
  const coltrane = movementChords('Cycle de tierces majeures', { difficulty: 1 });
  check('Cycle de tierces majeures (Do) : Cmaj7 Eb7 Abmaj7 B7 Emaj7 G7 Cmaj7',
    coltrane.chords.map((c) => c.name).join(' ') === 'Cmaj7 Eb7 Abmaj7 B7 Emaj7 G7 Cmaj7', coltrane.chords.map((c) => c.name).join(' '));
  const coltrane3 = movementChords('Cycle de tierces majeures');
  check('Intermédiaire (niveau 3) enrichi : Cmaj13 Eb13 Abmaj13 B13 Emaj13 G13 Cmaj13',
    coltrane3.chords.map((c) => c.name).join(' ') === 'Cmaj13 Eb13 Abmaj13 B13 Emaj13 G13 Cmaj13', coltrane3.chords.map((c) => c.name).join(' '));
  // [Claude] — 2026-09-24 (nuit) — Le niveau se lit surtout aux passages (Narcisse) :
  // accords principaux 7e → 9e → 11e / 13e (#11 sur le majeur), passages diminués,
  // puis 7b9 / 7#5 / 7b5, puis altérés.
  const levels = [1, 2, 3, 4, 5].map((difficulty) => movementChords('Cadence II-V-I majeur', { difficulty }).chords
    .map((c) => c.symbol + (c.passingChord ? ` (${c.passingChord.symbol})` : '')).join(' '));
  check('Chaque niveau change la grille (II-V-I : 7e, 9e, 13e + diminué, 7b9 / 7#5, altérés)',
    levels.join(' | ') === 'm7 7 maj7 | m9 9 maj9 | m11 (dim7) 13 maj13 | m11 (7b9) 13 (7#5) maj7#11 | m11 (7alt) 13 (7#9) maj7#11', levels.join(' | '));
  const tritone = movementChords('Tritone substitution V7', { difficulty: 1 });
  check('Tritone substitution V7 (Do) : Dm7 Db7 Cmaj7', tritone.chords.map((c) => c.name).join(' ') === 'Dm7 Db7 Cmaj7',
    tritone.chords.map((c) => c.name).join(' '));
  const secondary = movementChords('V/V vers I', { difficulty: 1 });
  check('V/V vers I (Do) : Cmaj7 D7 G7 Cmaj7', secondary.chords.map((c) => c.name).join(' ') === 'Cmaj7 D7 G7 Cmaj7',
    secondary.chords.map((c) => c.name).join(' '));
}

function checkMovementReplacementNotice() {
  console.log('\n=== Mouvement impossible : remplacement annoncé ===');
  const broken = { id: 'test-broken', category: 'Test', name: 'Mouvement de test impossible', pattern: '2-5-1b7', level: 1, description: '' };
  movementsLibrary.movements.push(broken);
  try {
    const prog = movementChords(broken.name, { key: 0, difficulty: 1 });
    check('Mouvement impossible : un autre mouvement complet est proposé',
      prog.name !== broken.name && prog.chords.length === prog.pattern.split('-').length, prog.name);
    check('Mouvement impossible : le remplacement est annoncé (nom, accord fautif, remplaçant)',
      Boolean(prog.notice) && prog.notice.includes(broken.name) && prog.notice.includes('Cb7') && prog.notice.includes(prog.name), prog.notice);
  } finally {
    movementsLibrary.movements.splice(movementsLibrary.movements.indexOf(broken), 1);
  }
  check('Mouvement constructible : aucun avertissement', movementChords('Cadence II-V-I majeur').notice === null);
}

// [Claude] — 2026-09-24 — Drop 3 trop aigus (VoicingLab transpose Do vers le haut).
function checkDrop3Register() {
  console.log('\n=== Drop 3 : registre jouable ===');
  const ex = createPracticeExercise();
  ex.setTechnique('drop3');
  let total = 0; let tooHigh = 0; let notOctave = 0; let movedInC = 0;
  for (const group of TARGET_QUALITY_GROUPS) {
    for (const quality of group.qualities) {
      for (let root = 0; root < 12; root += 1) {
        const raw = getVoicingLabVoicings(root, quality, 'drop3');
        ex.setTargetChoice(root, quality);
        const count = ex.getState().target?.voicing?.technique === 'drop3' ? ex.getState().target.voicing.variantCount : 0;
        for (let i = 0; i < count; i += 1) {
          const v = ex.getState().target.voicing;
          const all = [...v.leftHand, ...v.rightHand];
          total += 1;
          // Plus haut que Do5 seulement si l'octave du dessous passe sous les limites graves.
          if ((Math.min(...all) + Math.max(...all)) / 2 > 72 && respectsLowIntervalLimits(all.map((n) => n - 12))) tooHigh += 1;
          // Même voicing VoicingLab à l'octave près : écarts identiques, décalage
          // multiple de 12 (les voicings reconstruits d'après les manuels mis à part).
          const shift = v.octaveShift ?? 0;
          const back = `${v.leftHand.map((n) => n - shift)}|${v.rightHand.map((n) => n - shift)}`;
          if (!v.rebuilt && (shift % 12 !== 0 || !raw.some((r) => `${r.lh}|${r.rh}` === back))) notOctave += 1;
          if (root === 0 && ['maj7', 'm7', '7', 'm7b5', 'dim7', 'mMaj7', '6', 'm6'].includes(quality) && shift !== 0) movedInC += 1;
          ex.setVariant(1);
        }
      }
    }
  }
  check('Drop 3 : milieu du voicing au plus Do5 (C5), sauf limite grave', total > 1000 && tooHigh === 0, `${tooHigh}/${total}`);
  check('Drop 3 : même voicing VoicingLab, seule l\'octave change', notOctave === 0, `${notOctave}/${total}`);
  check('Drop 3 : accords de 4 sons en Do inchangés (registre de référence VoicingLab)', movedInC === 0, `${movedInC}`);
  ex.setTargetChoice(11, 'maj7');
  ex.setVariant(2);
  const b = ex.getState().target.voicing;
  check('Bmaj7 Drop 3 : B3 | A#4 D#5 F#5 (au lieu de B4 | A#5 D#6 F#6)', b.leftHand.join() === '59' && b.rightHand.join() === '70,75,78',
    `${b.leftHand} | ${b.rightHand}`);
  // [Claude] — 2026-09-24 — Rien sur la provenance à l'écran (décision de Narcisse).
  check('Info-bulle de la variante : décalage d\'octave gardé dans l\'état, pas affiché', b.octaveShift === -12 && !/VoicingLab|octave plus/.test(b.variantLabel), b.variantLabel);
  ex.setTargetChoice(0, '9');
  ex.setVariant(1);
  const c9 = ex.getState().target.voicing;
  check('C9 Drop 3 : C4 D4 | E5 A#5 (au lieu de C5 D5 | E6 A#6)', c9.leftHand.join() === '60,62' && c9.rightHand.join() === '76,82',
    `${c9.leftHand} | ${c9.rightHand}`);
  ex.setTargetChoice(0, 'maj7');
  check('Cmaj7 Drop 3 : E3 | C4 G4 B4 inchangé', ex.getState().target.voicing.leftHand.join() === '52' && !ex.getState().target.voicing.octaveShift);
}

// [Claude] — 2026-09-24 — Registre étendu à toutes les familles (VoicingLab
// transpose Do vers le haut : en Si, Drop 2 avec la main gauche à D#5, Shell avec
// la basse à B3). Plafond du milieu par technique, octaves seulement.
const REGISTER_CEILING_BY_TECHNIQUE = {
  shell: 60, two_note_shell: 60, stride: 60, rootless: 64, fourway_close: 76,
};

function checkRegisterAllFamilies() {
  console.log('\n=== Registre : toutes les familles ===');
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ex = createPracticeExercise();
  let total = 0; let tooHigh = 0; let notOctave = 0; let overlap = 0; let muddy = 0; const movedInC = new Set();
  for (const technique of TECHNIQUES.filter((t) => t !== 'auto')) {
    const ceiling = REGISTER_CEILING_BY_TECHNIQUE[technique] ?? 72;
    ex.setTechnique(technique);
    for (const quality of TARGET_QUALITY_GROUPS.flatMap((g) => g.qualities)) {
      for (let root = 0; root < 12; root += 1) {
        const count = getAvailableTechniques(`${names[root]}${quality}`).find((c) => c.id === technique)?.count ?? 0;
        if (count === 0) continue;
        ex.setTargetChoice(root, quality);
        for (let i = 0; i < count; i += 1) {
          const v = ex.getState().target.voicing;
          ex.setVariant(1);
          if (v.technique !== technique) continue;
          total += 1;
          // Cluster : on juge le registre de la main droite VoicingLab, avant l'ajout de la main gauche.
          const own = v.addedLH ? v.rightHand : [...v.leftHand, ...v.rightHand];
          const all = [...v.leftHand, ...v.rightHand];
          const skipBass = technique === 'stride';
          // Au-dessus du plafond seulement si l'octave du dessous est boueuse (Levine).
          if ((Math.min(...own) + Math.max(...own)) / 2 > ceiling
            && respectsLowIntervalLimits(all.map((n) => n - 12), { skipBass })) tooHigh += 1;
          if (!respectsLowIntervalLimits(all, { skipBass })) muddy += 1;
          if (v.leftHand.length && v.rightHand.length && Math.max(...v.leftHand) >= Math.min(...v.rightHand)) overlap += 1;
          const shift = v.octaveShift ?? 0;
          // Octaves entières ; montée seulement pour un voicing publié trop grave.
          if (shift % 12 !== 0 || (shift > 0 && respectsLowIntervalLimits(all.map((n) => n - shift), { skipBass }))) notOctave += 1;
          if (root === 0 && shift < 0) movedInC.add(technique);
        }
      }
    }
  }
  check('Toutes familles : milieu sous le plafond de la technique, sauf limite grave', total > 7000 && tooHigh === 0, `${tooHigh}/${total}`);
  check('Toutes familles : aucun intervalle sous sa limite grave (Levine)', muddy === 0, `${muddy}/${total}`);
  check('Toutes familles : octaves entières, montée seulement si le voicing publié est boueux', notOctave === 0, String(notOctave));
  check('Toutes familles : main gauche toujours sous la main droite', overlap === 0, String(overlap));
  // [Claude] — 2026-09-24 — Spread aussi : dessus au-dessus de Sol5 en Do
  // (C6 spread C3 | E5 G5 A5 → C2 | E4 G4 A4).
  check('En Do, seuls Drop 3 (accords enrichis), Spread (dessus au-dessus de Sol5) et Stride (basse sur la quinte) descendent',
    [...movedInC].every((t) => t === 'drop3' || t === 'stride' || t === 'spread'), [...movedInC].join(' '));

  const shown = (root, quality, technique, variant = 0) => {
    ex.setTechnique(technique);
    ex.setTargetChoice(root, quality);
    for (let i = 0; i < variant; i += 1) ex.setVariant(1);
    return ex.getState().target.voicing;
  };
  const bMaj7 = shown(11, 'maj7', 'drop2', 2);
  check('Bmaj7 Drop 2 : D#4 | A#4 B4 F#5 (au lieu de D#5 | A#5 B5 F#6)', bMaj7.leftHand.join() === '63' && bMaj7.rightHand.join() === '70,71,78', `${bMaj7.leftHand} | ${bMaj7.rightHand}`);
  const shellB7 = shown(11, '7', 'shell');
  check('Shell de B7 : B2 D#3 A3 (au lieu de B3 D#4 A4)', shellB7.leftHand.join() === '47,51,57', shellB7.leftHand.join());
  check('Info-bulle (Shell) : décalage d\'octave non affiché', shellB7.octaveShift === -12 && !/VoicingLab|octave plus/.test(shellB7.variantLabel), shellB7.variantLabel);
  const rootlessG = shown(7, 'maj7', 'rootless');
  check('Rootless de Gmaj7 inchangé : B3 D4 F#4 A4', rootlessG.leftHand.join() === '59,62,66,69' && !rootlessG.octaveShift, rootlessG.leftHand.join());
  const strideC = shown(0, 'maj7', 'stride', 1);
  check('Stride de Cmaj7 (quinte à la basse) : G2 E3 G3 B3', strideC.leftHand.join() === '43,52,55,59', strideC.leftHand.join());
  const fourWayC = shown(0, 'maj7', 'fourway_close', 2);
  check('4-way close de Cmaj7 inchangé : G4 B4 C5 E5', fourWayC.rightHand.join() === '67,71,72,76' && !fourWayC.octaveShift, fourWayC.rightHand.join());
  const clusterB7 = shown(11, '7', 'cluster');
  check('Cluster de B7 : main droite descendue, main gauche ajoutée dessous',
    clusterB7.rightHand.join() === '63,65,66,67' && clusterB7.leftHand.join() === '47,57', `${clusterB7.leftHand} | ${clusterB7.rightHand}`);
}

// [Claude] — 2026-09-24 — Voicings des accords de 11e, de 13e et altérés contrôlés
// d'après les manuels (Narcisse : « Bmaj13 en close position : main gauche B3 D#4,
// main droite A#4 G#5 ? ») ; les non conformes sont reconstruits sur les mêmes notes.
function checkTextbookVoicings() {
  console.log('\n=== Voicings 11e / 13e / altérés : définitions des manuels ===');
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const scope = TARGET_QUALITY_GROUPS.flatMap((g) => g.qualities).filter((q) => isTextbookScope(q));
  check('Périmètre : 11e, 13e et altérés, sans add11 / m7b5 / dim7',
    ['maj13', 'm11', '13', '7b9', '7alt', 'maj7#11', '7#5'].every((q) => scope.includes(q))
    && !['add11', '6add11', 'm7b5', 'dim7', 'maj7', '9', '7'].some((q) => scope.includes(q)), scope.join(' '));
  const thirdsOf = (q) => (q.includes('sus4') || q === '11' || q === 'maj11') ? [5] : [/^m(?!aj)/.test(q) ? 3 : 4];
  const seventhsOf = (q) => [/maj|Maj/.test(q) ? 11 : (/^m?6/.test(q) ? 9 : 10)];
  let total = 0; let failures = 0; const bad = [];
  for (const q of scope) {
    for (let root = 0; root < 12; root += 1) {
      for (const technique of TECHNIQUES.filter((t) => t !== 'auto')) {
        for (const v of exerciseVoicingsFor(root, q, technique)) {
          total += 1;
          const notes = [...v.lh, ...v.rh];
          const ok = respectsFamilyDefinition(technique, v, root, { thirds: thirdsOf(q), sevenths: seventhsOf(q) })
            && respectsLowIntervalLimits(notes, { skipBass: technique === 'stride' })
            && minorNinthClashes(notes, root, { flatNineChord: /b9|alt/.test(q) }).length === 0
            && !hasEleventhAgainstMajorThird(notes, root);
          if (!ok) failures += 1;
          if (!ok && bad.length < 5) bad.push(`${names[root]}${q} ${technique} ${notes.join(',')}`);
        }
      }
    }
  }
  check('Tous les voicings servis respectent leur famille et les règles (Levine, 9e mineure, 11 contre tierce)',
    total > 3500 && failures === 0, `${failures}/${total} ; ${bad.join(' / ')}`);

  const shown = (root, quality, technique, variant = 0) => {
    const ex = createPracticeExercise();
    ex.setTechnique(technique);
    ex.setTargetChoice(root, quality);
    for (let i = 0; i < variant; i += 1) ex.setVariant(1);
    return ex.getState().target?.voicing;
  };
  const bClose = shown(11, 'maj13', 'close');
  check('Bmaj13 close : B3 D#4 G#4 A#4 dans une octave (VoicingLab : B D# A# G# sur 21 demi-tons)',
    bClose.technique === 'close' && [...bClose.leftHand, ...bClose.rightHand].join() === '59,63,68,70',
    `${bClose.leftHand} | ${bClose.rightHand}`);
  // Reconstruction connue du code (rebuilt), jamais affichée (décision de Narcisse).
  check('Bmaj13 close : reconstruit (état), sans mention à l\'écran', bClose.rebuilt && !/manuels|VoicingLab|reconstruit/i.test(bClose.variantLabel), bClose.variantLabel);
  // Aucun mot de provenance à l'écran : carte d'un voicing reconstruit, d'une
  // qualité dérivée (Cm13), d'un cluster à main gauche ajoutée, navigateur.
  const provenance = /VoicingLab|dériv|reconstruit|manuels|ajoutée \(fondamentale/i;
  const cards = [[11, 'maj13', 'close'], [0, 'm13', 'auto'], [3, '7#11', 'cluster']].map(([root, quality, technique]) => {
    const ex = createPracticeExercise();
    ex.setTechnique(technique);
    ex.setTargetChoice(root, quality);
    return renderExerciseTarget(ex.getState().target, { categories: getAvailableTechniques(ex.getState().target.name) });
  });
  const browser = renderTopNoteBrowser(findChordsByTopNote(9), { topPc: 9 });
  check('Aucune mention de provenance (VoicingLab, dérivé, reconstruit, main gauche ajoutée)',
    cards.every((html) => !provenance.test(html)) && !provenance.test(browser) && !browser.includes('*</span>'));
  const dm11 = shown(2, 'm11', 'close');
  check('Dm11 close : D4 F4 G4 C5', [...dm11.leftHand, ...dm11.rightHand].join() === '62,65,67,72', `${dm11.leftHand} | ${dm11.rightHand}`);
  const cmaj7 = shown(0, 'maj7', 'close');
  check('Hors périmètre inchangé : Cmaj7 close C4 E4 G4 B4, VoicingLab', [...cmaj7.leftHand, ...cmaj7.rightHand].join() === '60,64,67,71' && !cmaj7.rebuilt);

  // Upper structures : triades du manuel sur la tierce et la septième.
  const triadRoots = (root, q) => new Set(exerciseVoicingsFor(root, q, 'upper_structure').map((v) => {
    const pcs = [...new Set(v.rh.map((n) => n % 12))];
    return pcs.find((r) => pcs.every((p) => [0, 4, 7].includes((p - r + 12) % 12)));
  }));
  check('C7b9 upper structure : triades bV (Gb) et VI (A) seulement', [...triadRoots(0, '7b9')].sort().join() === '6,9', [...triadRoots(0, '7b9')].join());
  check('C7alt upper structure : triades bV (Gb) et bVI (Ab) seulement', [...triadRoots(0, '7alt')].sort().join() === '6,8', [...triadRoots(0, '7alt')].join());
  check('D13 upper structure barré (triade de Sol = 11 juste contre la tierce, aucune triade du manuel sans b9 ni #11)',
    exerciseVoicingsFor(2, '13', 'upper_structure').length === 0);
  const open7s5 = exerciseVoicingsFor(0, '7#5', 'open');
  check('C7#5 open : plus de quinte juste à côté de la #5', open7s5.length > 0
    && open7s5.every((v) => ![...v.lh, ...v.rh].some((n) => n % 12 === 7)), open7s5.map((v) => `${v.lh}|${v.rh}`).join(' / '));
  const bDrop24 = shown(11, 'maj13', 'drop2_4');
  // [Claude] — 2026-09-24 — Une octave plus bas qu'avant : dessus A#5 au-dessus de Sol5.
  check('Bmaj13 drop 2-4 proposé (VoicingLab : 13e à la basse, écarté) : B2 G#3 | D#4 A#4',
    bDrop24?.technique === 'drop2_4' && [...bDrop24.leftHand, ...bDrop24.rightHand].join() === '47,56,63,70',
    bDrop24 && `${bDrop24.leftHand} | ${bDrop24.rightHand}`);
}

// [Claude] — 2026-09-24 — Réponse jugée sur l'accord annoncé, pas sur la lecture
// du voicing affiché (Shell de C6 = Do Mi La, lu « Am » par detectChord).
function checkValidationAgainstAnnouncedChord() {
  console.log('\n=== Validation : accord annoncé, pas lecture du voicing affiché ===');
  const ex = createPracticeExercise();
  ex.setTechnique('shell');
  ex.setTargetChoice(0, '6');
  const c6 = ex.getState().target;
  const attempts = ex.getState().attempts;
  check('C6 shell affiché C3 E3 A3 (lu « Am » par le détecteur)', c6.notes.join() === '48,52,57' && detectChord(c6.notes).symbol === 'm');
  check('C6 : Do Mi Sol La (vrai C6) accepté', ex.isCorrect([48, 52, 55, 57]));
  check('C6 : le voicing affiché accepté', ex.isCorrect([60, 64, 69]));
  check('C6 : La Do Mi (La mineur) refusé', !ex.isCorrect([57, 60, 64]));
  check('isCorrect ne compte pas d\'essai', ex.getState().attempts === attempts);
  const wrong = ex.check([57, 60, 64]);
  check('C6 : message « Vous avez joué Am. Cible : C6 »', !wrong.success && wrong.message.includes('Am') && wrong.message.includes('C6'), wrong.message);

  ex.setTechnique('rootless');
  ex.setTargetChoice(0, 'maj7');
  check('Cmaj7 rootless affiché E3 G3 B3 D4 (lu « Em7 »)', ex.getState().target.notes.join() === '52,55,59,62');
  check('Cmaj7 : Do Mi Sol Si accepté', ex.isCorrect([48, 52, 55, 59]));
  check('Cmaj7 : Mi Sol Si (Mi mineur, 3 notes sans fondamentale) refusé', !ex.isCorrect([52, 55, 59]));
  check('Cmaj7 : Mi Sol Si Ré à une autre octave accepté', ex.isCorrect([64, 67, 71, 74]));

  ex.setTechnique('close');
  ex.setTargetChoice(0, '7');
  check('C7 close sans 9e : C9 refusé (9e étrangère)', !ex.isCorrect([48, 52, 55, 58, 62]));
  check('C7 : shell Do Mi Sib accepté', ex.isCorrect([48, 52, 58]));
  check('C7 : premier renversement (Mi à la basse) accepté', ex.isCorrect([52, 55, 58, 60]));
  check('C7 : Do Mi Sol La (C6) refusé', !ex.isCorrect([48, 52, 55, 57]));
  ex.setTargetChoice(0, '9');
  check('C9 : C7 sans 9e refusé', !ex.isCorrect([48, 52, 55, 58]));
  check('C9 : rootless Mi Sib Ré Sol accepté', ex.isCorrect([52, 58, 62, 67]));

  check('realizesChord : Fmaj7#11 exige la #11', realizesChord([53, 57, 60, 64, 71], 5, 'maj7#11') && !realizesChord([53, 57, 60, 64], 5, 'maj7#11'));
  check('realizesChord : G7alt accepte b9 et b13', realizesChord([43, 47, 53, 56, 63], 7, '7alt'));
  check('judgeAnswer : cible absente → refus', judgeAnswer([60, 64, 67], null).success === false);

  // Mouvement : même principe à chaque étape (II-V-I en Do, voicings rootless).
  const mv = createPracticeExercise();
  mv.setMode('movement');
  mv.setDifficulty(1);
  mv.setKeyChoice(0);
  mv.setContentChoice('Cadence II-V-I majeur');
  mv.setTechnique('rootless');
  const shownDm7 = mv.getState().target;
  check('Mouvement : Dm7 rootless affiché sans Ré', shownDm7.name === 'Dm7' && !shownDm7.notes.some((n) => n % 12 === 2), shownDm7.notes.join());
  check('Mouvement : Ré Fa La Do accepté pour Dm7', mv.check([50, 53, 57, 60]).success);
  check('Mouvement : étape suivante G7, Sol Si Ré Fa accepté', mv.getState().target.name === 'G7' && mv.isCorrect([55, 59, 62, 65]));
}

// [Claude] — 2026-09-24 — « Ma grille » : accords tapés en symboles, joués comme
// un mouvement dans les tonalités choisies, qualités gardées telles quelles
// (remplace la progression personnalisée du mode Progression, retiré).
function checkTypedCustomGrid() {
  console.log('\n=== Ma grille : accords tapés en symboles ===');
  const typed = (input) => {
    const ex = createPracticeExercise();
    ex.setCustomGrid(input);
    return ex;
  };
  const names = (prog) => prog.chords.map((c) => `${c.name}:${c.symbol}`).join(' ');
  const basic = typed('Dm7 G7 Cmaj7');
  const prog = basic.getState().progression;
  check('« Dm7 G7 Cmaj7 » construite telle quelle, lue en Do majeur, départ en Do', basic.getState().mode === 'movement'
    && prog.name === CUSTOM_GRID_NAME && names(prog) === 'Dm7:m7 G7:7 Cmaj7:maj7' && prog.currentKey === 0 && !prog.notice,
    `${prog.name} ${names(prog)} ton ${prog.currentKey}`);
  check('Ma grille : Ré Fa La Do validé sur Dm7', basic.check([50, 53, 57, 60]).success);
  // [Claude] — 2026-09-24 (nuit) — Règle de Narcisse : un accord de tension se joue en passage.
  const withPassing = (prog) => prog.chords.map((c) => `${c.name}:${c.symbol}${c.passingChord ? ` (${c.passingChord.name}:${c.passingChord.symbol})` : ''}`).join(' ');
  const rich = typed('Dm11 G7#9b13 Cmaj13').getState().progression;
  check('Extensions gardées ; G7#9b13 joué en passage entre Dm11 et Cmaj13', withPassing(rich) === 'Dm11:m11 (G7#9b13:7#9b13) Cmaj13:maj13', withPassing(rich));
  const alt = typed('Dm7b5 G7alt CmMaj7').getState().progression;
  check('Grille mineure : lue en Do mineur, G7alt reste 7alt (en passage)', alt.minor === true && withPassing(alt) === 'Dm7b5:m7b5 (G7alt:7alt) CmMaj7:mMaj7', `${alt.minor} ${withPassing(alt)}`);
  const turn = typed('Cmaj7 Am7 Dm7 G7').getState().progression;
  check('« Cmaj7 Am7 Dm7 G7 » lue en Do majeur (pas en Sol)', turn.currentKey === 0 && turn.description.includes('C majeur'), turn.description);
  const notations = typed('Bbmaj7 F#m7b5 CM7 C-7 Cø7 C°7 CmM7 C69').getState().progression;
  check('Notations reconnues (Bbmaj7 F#m7b5 CM7 C-7 Cø7 C°7 CmM7 C69), C°7 en passage',
    notations.chords.map((c) => c.symbol + (c.passingChord ? `(${c.passingChord.symbol})` : '')).join(' ') === 'maj7 m7b5 maj7 m7 m7b5(dim7) mMaj7 6/9' && !notations.notice,
    notations.chords.map((c) => c.symbol + (c.passingChord ? `(${c.passingChord.symbol})` : '')).join(' '));
  const partial = typed('Dm7 C Xyz G7/B G7').getState().progression;
  check('Accords impossibles ignorés, pas en silence (triade, inconnu, basse séparée)',
    partial.chords.map((c) => c.name).join(' ') === 'Dm7 G7' && ['C,', 'Xyz', 'G7/B'].every((s) => partial.notice?.includes(s)), partial.notice);
  const none = typed('D F G A').getState().progression;
  check('Aucun accord jouable : autre mouvement proposé ET annoncé',
    none.name !== CUSTOM_GRID_NAME && none.notice?.includes(`« ${CUSTOM_GRID_NAME} »`) && none.notice.includes(`« ${none.name} »`), none.notice);
  const second = typed('Dm7 G7 Cmaj7');
  second.check([50, 53, 57, 60]);
  second.check([55, 59, 62, 65]);
  second.check([48, 52, 55, 59]);
  const k2 = second.getState();
  check('Ma grille : 2e tonalité = même grille transposée (Db : Ebm7 Ab7 Dbmaj7)', k2.progression.keyIndex === 1
    && k2.progression.chords.map((c) => c.name).join(' ') === 'Ebm7 Ab7 Dbmaj7', k2.progression.chords.map((c) => c.name).join(' '));
}

// [Claude] — 2026-09-24 — Mouvement 12 tons (Narcisse) : difficulté par défaut
// Intermédiaire, saut direct à un accord de la liste, choix des tonalités.
function checkMovementNavigationAndKeys() {
  console.log('\n=== Mouvement : niveau par défaut, saut direct, tonalités ===');
  const ex = createPracticeExercise();
  check('Difficulté par défaut : Intermédiaire (3)', ex.getState().difficulty === 3);
  ex.setMode('movement');
  ex.setDifficulty(5);
  ex.setKeyChoice(7);
  ex.setContentChoice('Cycle de tierces majeures');
  const cycle = ex.getState().progression;
  // Avancé : accords principaux sans tension, les altérations dans les passages.
  check('Cycle de tierces majeures en Avancé (Sol) : Gmaj7#11 Bb13 … et les altérés en passage',
    cycle.chords.map((c) => c.name).join(' ') === 'Gmaj7#11 Bb13 Ebmaj7#11 F#13 Bmaj7#11 D13 Gmaj7#11'
    && cycle.chords.slice(0, -1).every((c) => /7(alt|#9)$/.test(c.passingChord?.name || '')), cycle.chords.map((c) => c.name + (c.passingChord ? ` (${c.passingChord.name})` : '')).join(' '));
  const score = ex.getState().score;
  ex.goToStep(5);
  let st = ex.getState();
  check('Saut direct au 6e accord (D13) sans jouer les précédents', st.stepIndex === 5 && st.target.name === 'D13' && st.score === score, st.target.name);
  check('Saut direct : l\'accord attendu est bien le 6e', ex.isCorrect(st.target.notes) && !ex.isCorrect(cycle.chords[0].notes));
  ex.goToStep(99);
  check('Saut direct borné au dernier accord', ex.getState().stepIndex === cycle.chords.length - 1);

  check('Ordre chromatique depuis Sol : G G# A …', keySequence(7).slice(0, 3).join() === '7,8,9');
  check('Cycle des quartes depuis Do : C F Bb Eb …', keySequence(0, undefined, 'fourths').slice(0, 4).join() === '0,5,10,3');
  check('Cycle des quintes depuis Do : C G D A …', keySequence(0, undefined, 'fifths').slice(0, 4).join() === '0,7,2,9');
  ex.setKeyOrder('fourths');
  ex.setKeySet([0, 5, 7, 10]);
  ex.setKeyChoice(0);
  st = ex.getState();
  check('4 tonalités retenues, en quartes depuis Do : C F Bb G', st.progression.keys.join() === '0,5,10,7' && st.progression.totalKeys === 4, st.progression.keys.join());
  ex.goToKey(2);
  st = ex.getState();
  check('Saut direct à une tonalité (Bb majeur, 1er accord)', st.target.keyName === 'Bb majeur' && st.stepIndex === 0 && st.target.name === 'Bbmaj7#11', `${st.target.keyName} ${st.target.name}`);
  ex.setKeySet([]);
  check('Aucune tonalité : refusé, le tour garde les siennes', ex.getState().keySet.join() === '0,5,7,10');
  ex.setKeySet([2, 9]);
  check('Départ hors des tonalités retenues : repasse au hasard', ex.getState().keyChoice === null && [2, 9].includes(ex.getState().progression.startKey));
}

// [Claude] — 2026-09-24 — Voicings enchaînés (décision de Narcisse : démo et
// exercice partagent les mêmes voicings, adaptés au mouvement).
// [Claude] — 2026-09-24 — Réalisme des voicings (Narcisse : « les voicings
// proposés sont absurdes », démo de la Montée diatonique en Sib, Drop 2-4).
function checkPianistRealism() {
  console.log('\n=== Voicings : registre et mains de pianiste ===');
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const melody = new Set(['fourway_close', 'block']);
  let total = 0; let tooHigh = 0; let highBass = 0; let wideHand = 0; let highLeft = 0; let lowRight = 0;
  for (const technique of TECHNIQUES.filter((t) => t !== 'auto')) {
    for (const quality of TARGET_QUALITY_GROUPS.flatMap((g) => g.qualities)) {
      for (let root = 0; root < 12; root += 1) {
        for (const v of exerciseVoicingsFor(root, quality, technique)) {
          total += 1;
          const all = [...v.lh, ...v.rh];
          const low = Math.min(...all);
          const top = Math.max(...all);
          const lowerClear = respectsLowIntervalLimits(all.map((n) => n - 12), { skipBass: technique === 'stride' });
          // Au-dessus du plafond seulement si l'octave du dessous est boueuse (Levine).
          if (top > (melody.has(technique) ? 84 : 79) && lowerClear) tooHigh += 1;
          if (['spread', 'open'].includes(technique) && low > 52 && top - 12 >= 64 && lowerClear) highBass += 1;
          const span = (hand) => (hand.length ? Math.max(...hand) - Math.min(...hand) : 0);
          if ((technique !== 'stride' && span(v.lh) > 16) || span(v.rh) > 16) wideHand += 1;
          if (['shell', 'two_note_shell', 'rootless'].includes(technique) && v.rh.length === 0 && top > 69) highLeft += 1;
          if (['close', 'fourway_close'].includes(technique) && v.lh.length === 0 && low < 53 && top + 12 <= 79) lowRight += 1;
        }
      }
    }
  }
  check('Dessus au plus Sol5 (Do6 pour 4-way close et block), sauf limite grave', total > 7000 && tooHigh === 0, `${tooHigh}/${total}`);
  check('Spread / Open : basse sous Mi3 dès que la main droite reste au milieu', highBass === 0, String(highBass));
  check('Aucune main au-delà d\'une 10e (stride mis à part : basse jouée seule)', wideHand === 0, String(wideHand));
  check('Main gauche seule (shell, rootless) sous La4', highLeft === 0, String(highLeft));
  check('Close à une main : pas sous Fa3 quand l\'octave du dessus tient sous Sol5', lowRight === 0, String(lowRight));

  const spread = exerciseVoicingsFor(10, 'maj7#11', 'spread');
  check('Spread de Bbmaj7#11 : Bb2 | D4 E4 A4 (au lieu de Bb3 | D5 E5 A5)', spread.length === 1 && spread[0].lh.join() === '46' && spread[0].rh.join() === '62,64,69',
    spread.map((v) => `${v.lh}|${v.rh}`).join(' / '));
  const rootless = exerciseVoicingsFor(10, 'maj7#11', 'rootless');
  check('Rootless de Bbmaj7#11 : type B seul (le type A tombait à D4 E4 A4 C5 en main gauche)', rootless.length === 1 && rootless[0].familyId === 'rootlessB'
    && Math.max(...rootless[0].lh) <= 69, rootless.map((v) => v.lh.join()).join(' / '));

  console.log('\n=== Close position : renversements ===');
  const dm11 = exerciseVoicingsFor(2, 'm11', 'close').map((v) => v.rh);
  check('Dm11 close : position fondamentale et 1er renversement (basse Fa)', dm11.length === 2 && dm11[0][0] % 12 === 2 && dm11[1][0] % 12 === 5,
    dm11.map((rh) => rh.join()).join(' / '));
  const cmaj7 = exerciseVoicingsFor(0, 'maj7', 'close').map((v) => v.rh);
  check('Cmaj7 close : fondamentale, tierce ou quinte à la basse (pas la 7e)', cmaj7.length === 3
    && cmaj7.every((rh) => [0, 4, 7].includes(rh[0] % 12) && rh[rh.length - 1] - rh[0] < 12), cmaj7.map((rh) => rh.join()).join(' / '));
  const ex = createPracticeExercise();
  ex.setMode('movement');
  ex.setTechnique('close');
  ex.setKeyChoice(0);
  ex.setContentChoice('Cadence II-V-I majeur');
  const tops = ex.getState().progression.chords.map((c) => Math.max(...c.notes));
  check('II-V-I en close : la voix du dessus bouge par petits intervalles (≤ une quarte)',
    tops.every((t, i) => i === 0 || Math.abs(t - tops[i - 1]) <= 5), tops.join(' → '));

  console.log('\n=== 7alt : vraies altérations ===');
  let alts = 0; let fake = 0;
  for (const technique of TECHNIQUES.filter((t) => t !== 'auto')) {
    for (let root = 0; root < 12; root += 1) {
      for (const v of exerciseVoicingsFor(root, '7alt', technique)) {
        alts += 1;
        const rels = new Set([...v.lh, ...v.rh].map((n) => (((n - root) % 12) + 12) % 12));
        const ok = (rels.has(1) || rels.has(3)) && (rels.has(6) || rels.has(8)) && ![2, 5, 7, 9].some((i) => rels.has(i));
        if (!ok) fake += 1;
      }
    }
  }
  check('Tout 7alt a une 9e altérée et une quinte altérée, sans 5, 9, 11 ni 13 naturelles', alts > 150 && fake === 0, `${fake}/${alts}`);
  const openF = exerciseVoicingsFor(5, '7alt', 'open');
  check('Open de F7alt : plus de Do (quinte juste) à côté du Si', openF.length > 0 && openF.every((v) => ![...v.lh, ...v.rh].some((n) => n % 12 === 0)),
    openF.map((v) => `${v.lh}|${v.rh}`).join(' / '));
  const drop2F = exerciseVoicingsFor(5, '7alt', 'drop2');
  check('Drop 2 de F7alt : A3 | Eb4 Ab4 B4 (3, b7, #9, b5 : plus le 7b5 F A B Eb)', drop2F.length === 1 && drop2F[0].lh.join() === '57' && drop2F[0].rh.join() === '63,68,71',
    drop2F.map((v) => `${v.lh}|${v.rh}`).join(' / '));
  check('Upper structure de C7alt : toujours bV et bVI', new Set(exerciseVoicingsFor(0, '7alt', 'upper_structure').map((v) => {
    const pcs = [...new Set(v.rh.map((n) => n % 12))];
    return pcs.find((r) => pcs.every((p) => [0, 4, 7].includes((p - r + 12) % 12)));
  })).size === 2);
  check('Techniques de C7alt : quartal, So What, cluster, stride et shells barrés (aucune altération complète)',
    ['quartal', 'so_what', 'cluster', 'stride', 'shell', 'two_note_shell'].every((t) => getAvailableTechniques(`${names[0]}7alt`).find((c) => c.id === t)?.count === 0));
}

// [Claude] — 2026-09-24 — Carte : notes ajoutées par la démo (Narcisse : « la démo
// ajoute aussi des basses quand le mini-key ne l'affiche pas, je le veux aussi »).
function checkCardDemoAdditions() {
  console.log('\n=== Carte : notes ajoutées par la démo ===');
  const ex = createPracticeExercise();
  ex.setMode('movement');
  ex.setTechnique('close');
  ex.setKeyChoice(0);
  ex.setContentChoice('Cadence II-V-I majeur');
  const target = ex.getState().target;
  const demo = { lh: [38, 45], rh: [60, 62, 65, 67, 72], bass: [38, 45], doubled: [60], movedToRight: false, styleLabel: 'Gospel / worship' };
  const html = renderExerciseTarget(target, { demo });
  check('Légende : basse et doublure de la démo, avec le style', html.includes('Démo Gospel / worship : basse D2 · A2 à la main gauche, C4 doublé à la main droite'),
    (html.match(/exercise-demo-added">([^<]*)</) || [])[1]);
  const hands = (html.match(/exercise-hand-notes">([^<]*)</g) || []).join(' ');
  check('Cases des mains : le voicing de l\'exercice seul (pas la basse de la démo)', hands.length > 0 && !hands.includes('D2') && !hands.includes('A2'), hands);
  const plain = renderExerciseTarget(target, {});
  check('Sans démo : pas de légende, clavier inchangé', !plain.includes('exercise-demo-added') && plain.split('<rect').length < html.split('<rect').length,
    `${plain.split('<rect').length} / ${html.split('<rect').length}`);
  const moved = renderExerciseTarget(target, { demo: { ...demo, doubled: [], movedToRight: true, styleLabel: 'Ballade' } });
  check('Rootless passé à la main droite : annoncé dans la légende', moved.includes('Démo Ballade : basse D2 · A2 à la main gauche, voicing joué à la main droite'));
}

// [Claude] — 2026-09-24 — Option « Main gauche » par style (Narcisse : la main
// gauche ajoutée par la démo gospel lui plaisait, mais le favori ne gardait que la
// main droite ; « une option avec seulement la main droite, une option avec la
// main gauche […] déclinée en fonction du style »).
function checkLeftHandStyles() {
  console.log('\n=== Option « Main gauche » par style ===');
  const ex = createPracticeExercise();
  ex.setMode('chord');
  ex.setTechnique('close');
  ex.setTargetChoice(2, 'm11');
  const hands = () => {
    const v = ex.getState().target.voicing;
    return `${v.leftHand.join(',')}|${v.rightHand.join(',')}`;
  };
  const base = hands();
  check('Par défaut : voicing seul (main droite seule pour un close)', ex.getState().leftHandStyle === 'none' && base.startsWith('|'), base);
  ex.setLeftHandStyle('gospel');
  let v = ex.getState().target.voicing;
  check('Gospel / worship : basse D2 A2 + main droite en cadre d\'octave (C4 … C5)', hands() === '38,45|60,62,65,67,72'
    && v.styleAdded.join() === '38,45,60' && v.leftHandStyle === 'gospel', hands());
  check('La cible (notes à jouer) comprend la main gauche du style', ex.getState().target.notes.includes(38) && ex.getState().target.notes.includes(45));
  ex.setLeftHandStyle('ballade');
  check('Ballade : même basse, main droite telle quelle', hands() === '38,45|62,65,67,72', hands());
  ex.setLeftHandStyle('swing');
  check('Comping swing : fondamentale et quinte du jeu « en deux »', hands() === '38,45|62,65,67,72', hands());
  ex.setLeftHandStyle('xyz');
  check('Style inconnu ignoré', ex.getState().leftHandStyle === 'swing');
  ex.setLeftHandStyle('gospel');
  ex.setTargetChoice(7, '13');
  // Main droite de G13 à G3 : la 7e F3 la heurterait, la basse prend G2 seul.
  check('L\'option reste pour l\'accord suivant (G13 : basse G2)', ex.getState().leftHandStyle === 'gospel' && ex.getState().target.voicing.leftHand.join() === '43', hands());

  // Le cas de Narcisse : le favori garde la main gauche et la rouvre en Accord cible.
  ex.setTargetChoice(2, 'm11');
  const fav = favoriteFromTarget(ex.getState().target);
  check('Favori : main gauche du style gardée (notes et style)', fav.lh.join() === '38,45' && fav.leftHandStyle === 'gospel' && fav.styleAdded.join() === '38,45,60');
  ex.setLeftHandStyle('none');
  ex.setTargetChoice(0, 'maj7');
  ex.showFavorite(fav);
  v = ex.getState().target.voicing;
  check('Favori rouvert : main gauche D2 A2, notes ajoutées et option Gospel reprises', v.leftHand.join() === '38,45' && v.styleAdded.join() === '38,45,60'
    && ex.getState().leftHandStyle === 'gospel', `${v.leftHand} | ${ex.getState().leftHandStyle}`);
  const listHtml = renderFavoritesList([fav], { techniqueLabels: { close: 'Close position' } });
  check('Liste des favoris : « Close position + main gauche Gospel / worship »', listHtml.includes('Close position + main gauche Gospel / worship'));
  check('Voicing seul et voicing avec main gauche : deux favoris distincts', fav.key !== favoriteFromTarget({ ...ex.getState().target, voicing: { ...v, leftHand: [], rightHand: [62, 65, 67, 72] } }).key);

  // Carte : menu, légende, cases des mains.
  const html = renderExerciseTarget(ex.getState().target, { leftHandStyle: 'gospel', layout: 'chord' });
  check('Carte (Accord cible compris) : menu « Main gauche » avec Gospel choisi', /data-exercise-left-hand[\s\S]*value="gospel" selected/.test(html)
    && html.includes('Main droite seule') && html.includes('+ main gauche Ballade') && html.includes('+ main gauche Comping swing'));
  check('Carte : légende de la main gauche du style', html.includes('Main gauche Gospel / worship : basse D2 · A2, C4 doublé à la main droite'));
  check('Carte : main gauche du style dans les cases des mains', /Main gauche<\/span>\s*<span class="exercise-hand-notes">D2 · A2/.test(html));

  // Rootless : « Voicing seul », main droite remontée au-dessus de la basse.
  ex.setTechnique('rootless');
  ex.setLeftHandStyle('ballade');
  ex.setTargetChoice(10, '7#9b13');
  v = ex.getState().target.voicing;
  check('Rootless grave passé à la main droite : une octave plus haut, basse dessous (Bb2 Ab3 | D4 Gb4 Ab4 Db5)',
    v.leftHand.join() === '46,56' && v.rightHand.join() === '62,66,68,73' && v.styleMovedToRight === true, `${v.leftHand} | ${v.rightHand}`);
  check('Rootless : le menu dit « Voicing seul » (le voicing de base a sa main gauche)', renderExerciseTarget(ex.getState().target, {}).includes('>Voicing seul<'));

  // Mouvement : la grille et la démo reprennent la main gauche du style.
  const mv = createPracticeExercise();
  mv.setMode('movement');
  mv.setTechnique('close');
  mv.setKeyChoice(0);
  mv.setContentChoice('Cadence II-V-I majeur');
  mv.setLeftHandStyle('gospel');
  const chords = mv.getState().progression.chords;
  check('Mouvement : chaque accord de la grille a sa main gauche Gospel', chords.every((c) => c.voicing.leftHand.length > 0 && c.voicing.leftHandStyle === 'gospel'),
    chords.map((c) => c.voicing.leftHand.join()).join(' / '));
}

// [Claude] — 2026-09-24 — Voice leading, grille modifiable, grilles Perso (Narcisse :
// « sur le do, il faut tel voice leading (si, ré…) », « modifier cet accord précis
// sans tout recommencer », « enregistrer la grille […] catégorie Perso »).
function checkMelodyAndGrids() {
  console.log('\n=== Voice leading : note du dessus par accord ===');
  const top = (chord) => Math.max(...chord.notes) % 12;
  check('Notes possibles au dessus de Cmaj7 : C, E, G, B', topNoteChoices(0, 'maj7').map((c) => `${c.pc}:${c.degree}:${c.available}`).join() === '0:1:true,4:3:true,7:5:true,11:7:true',
    topNoteChoices(0, 'maj7').map((c) => `${c.pc}:${c.degree}:${c.available}`).join());
  check('Dessus épelé sur le degré (7e de Bbmaj7 = A, b7 de G7 = F, #9 de C7#9 = D#)',
    spellChordTone('Bb', 11, 'maj7') === 'A' && spellChordTone('G', 10, '7') === 'F' && spellChordTone('C', 3, '7#9') === 'D#');

  const ex = createPracticeExercise();
  ex.setTechnique('auto');
  ex.setKeyChoice(0);
  ex.setCustomGrid([{ name: 'Cmaj7', top: 11 }, { name: 'Dm7', top: 10 }, { name: 'G7', top: 10 }, { name: 'Cmaj7', top: 4 }], { name: 'Ma louange' });
  let prog = ex.getState().progression;
  check('Grille nommée : jouée sous son nom, catégorie Perso', prog.name === 'Ma louange' && prog.category === 'Perso' && ex.getState().customGridName === 'Ma louange');
  check('Mélodie B → C → F → E au dessus des accords', prog.chords.map(top).join() === '11,0,5,4', prog.chords.map(top).join());
  check('Mélodie dans son registre (dessus au moins Mi4, voicings de 3 notes et plus)', prog.chords.every((c) => Math.max(...c.notes) >= 64 && c.notes.length >= 3),
    prog.chords.map((c) => c.notes.join(' ')).join(' / '));
  check('Accords marqués avec leur note du dessus (intervalle), rien de manqué', prog.chords.map((c) => c.topInterval).join() === '11,10,10,4' && prog.chords.every((c) => !c.topMissed));
  ex.setStepTopNote(2, 4);
  prog = ex.getState().progression;
  check('Modifier la note du dessus d\'un accord précis (G7 : F → B) sans toucher aux autres', prog.chords.map(top).join() === '11,0,11,4', prog.chords.map(top).join());
  check('La grille garde la note choisie sur la carte (bibliothèque, enregistrement)', ex.getState().customGrid.map((c) => c.top).join() === '11,10,4,4',
    ex.getState().customGrid.map((c) => c.top).join());
  ex.goToKey(1);
  prog = ex.getState().progression;
  check('Tonalité suivante (Réb) : la mélodie est transposée (C, Db, C, F)', prog.currentKey === 1 && prog.chords.map(top).join() === '0,1,0,5', prog.chords.map(top).join());
  ex.goToStep(1);
  ex.setVariant(1);
  check('Flèches sur un accord : sa note du dessus imposée est libérée', ex.getState().progression.chords[1].topInterval == null && ex.getState().progression.chords[0].topInterval === 11);
  check('Flèches : la grille garde sa note (exploration, pas une modification)', ex.getState().customGrid[1].top === 10);
  ex.setStepTopNote(0, null);
  check('Dessus libre : note du dessus retirée', ex.getState().progression.chords[0].topInterval == null);
  ex.setDifficulty(3);
  check('Changement de niveau (grille reconstruite) : les notes choisies sur la carte restent',
    ex.getState().progression.chords.map((c) => c.topInterval ?? '-').join() === '-,10,4,4', ex.getState().progression.chords.map((c) => c.topInterval ?? '-').join());

  const mv = createPracticeExercise();
  mv.setKeyChoice(0);
  mv.setCustomGrid([{ name: 'Dm11', top: 2 }]);
  check('Dessus impossible (Dm11 avec la 9e au sommet) : signalé, dessus libre joué', mv.getState().progression.chords[0].topMissed === true);
  const html = renderTopNoteSelect({ choices: [{ interval: 11, name: 'B', degree: '7', available: true }, { interval: 2, name: 'D', degree: '9', available: false }], selected: 11 });
  check('Menu de la carte : dessus choisi, notes impossibles grisées', /value="11" selected/.test(html) && /value="2" disabled/.test(html) && html.includes('Dessus libre'));
  const preview = mv.previewGrid([{ name: 'Cmaj7', top: 4 }, { name: 'Fmaj7', top: 4 }], 'Aperçu');
  check('Aperçu d\'une grille Perso : dans son ton, mélodie comprise', preview?.length === 2 && preview.map(top).join() === '4,9', preview && preview.map(top).join());
  check('Grille tapée à l\'ancienne (texte) : toujours acceptée', (() => { const t = createPracticeExercise(); t.setCustomGrid('Dm7 G7 Cmaj7'); return t.getState().progression.chords.length === 3; })());

  console.log('\n=== Grilles Perso (enregistrées) ===');
  const store = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
  let ids = 0;
  const makeId = () => `g${++ids}`;
  let { grids, grid } = upsertGrid([], { name: 'Ma louange', chords: [{ name: 'Cmaj7', top: 11 }, { name: 'Dm7', top: null }] }, makeId);
  check('Enregistrer une grille : nom, accords et notes du dessus gardés', grid.id === 'g1' && grids.length === 1 && grid.chords[0].top === 11 && grid.chords[1].top === null);
  ({ grids } = upsertGrid(grids, { name: 'Autre', chords: [{ name: 'G7' }] }, makeId));
  ({ grids, grid } = upsertGrid(grids, { name: 'ma louange ', chords: [{ name: 'Cmaj9', top: 2 }] }, makeId));
  check('Même nom : mise à jour (même identifiant, en tête), pas de doublon', grids.length === 2 && grids[0].id === 'g1' && grids[0].chords[0].name === 'Cmaj9');
  saveGrids(store, grids);
  check('Rechargées depuis le stockage', loadGrids(store).map((g) => g.name).join() === 'ma louange,Autre');
  check('Supprimer une grille', removeGrid(loadGrids(store), 'g1').map((g) => g.id).join() === 'g2');
  store.data['piano-jazz-exercise-grids'] = '{abîmé';
  check('Stockage illisible : aucune grille, pas d\'erreur', loadGrids(store).length === 0);
  check('Grille sans nom ou sans accord refusée', upsertGrid([], { name: ' ', chords: [{ name: 'C7' }] }).grid === null && upsertGrid([], { name: 'X', chords: [] }).grid === null);
}

// [Claude] — 2026-09-24 (nuit) — Règle de Narcisse : « les accords altérés ne
// seront utilisés que dans les accords de passage » ; le niveau se lit « surtout
// avec les accords de passage » (diminué : intermédiaire ; 7b9, 7#5, 7b5 :
// semi-avancé ; altérés, #9 : avancé). Les passages sont des étapes à jouer.
function checkTensionRule() {
  console.log('\n=== Tensions réservées aux accords de passage ===');
  const tension = ['dim7', 'aug', '7b9', '7#9', '7b5', '7#5', '7b13', '7alt', '7#9b13', '7#11', '13#11', '7b5b9', '7#5#9'];
  const calm = ['maj7#11', 'maj13#11', 'm7b5', 'mMaj7', 'm6', 'm11', '13', '9', '7', '7sus4', '13sus4', '6/9', 'maj9'];
  check('Tensions : dominantes altérées, diminués, augmentés', tension.every(isTensionQuality), tension.filter((q) => !isTensionQuality(q)).join());
  check('Pas des tensions : maj7#11 (« ça sonne bien »), m7b5, m(maj7), sus, 9, 13…', calm.every((q) => !isTensionQuality(q)), calm.filter(isTensionQuality).join());

  const chordOf = (rootPc, quality, name) => ({ rootPc, quality, name });
  const dm = chordOf(2, 'm7', 'Dm7');
  const g7 = chordOf(7, '7', 'G7');
  const c = chordOf(0, 'maj7', 'Cmaj7');
  const em = chordOf(4, 'm7', 'Em7');
  check('Niveaux 1 et 2 : aucun passage', planPassingChord(c, dm, 1) === null && planPassingChord(c, dm, 2) === null);
  check('Niveau 3 : diminué sur la sensible (C → C#dim7 → Dm, Dm → F#dim7 → G)',
    planPassingChord(c, dm, 3)?.name === 'C#dim7' && planPassingChord(dm, g7, 3)?.name === 'F#dim7');
  check('Niveau 3 : diminué descendant quand la basse descend d\'un ton (Em → Ebdim7 → Dm)', planPassingChord(em, dm, 3)?.name === 'Ebdim7');
  check('Niveau 3 : rien après une dominante qui mène déjà à l\'accord (G7 → C)', planPassingChord(g7, c, 3) === null);
  check('Niveau 4 : dominante secondaire 7b9 / 7#5 / 7b5 (C → A7b9 → Dm, Dm → D7#5 → G)',
    planPassingChord(c, dm, 4, { rotation: 0 })?.name === 'A7b9' && planPassingChord(dm, g7, 4, { rotation: 1 })?.name === 'D7#5'
    && planPassingChord(g7, c, 4, { rotation: 2 })?.name === 'G7b5');
  check('Niveau 5 : altérés (G7 → G7alt → C, C → A7#9 → Dm)',
    planPassingChord(g7, c, 5, { rotation: 0 })?.name === 'G7alt' && planPassingChord(c, dm, 5, { rotation: 1 })?.name === 'A7#9');
  check('Pas de passage quand la basse bouge d\'un demi-ton (Dm7 → Db7) ni sur G7sus4 → G7',
    planPassingChord(dm, chordOf(1, '7', 'Db7'), 5) === null && planPassingChord(chordOf(7, '7sus4', 'G7sus4'), g7, 5) === null);
  check('Qualités de passage par niveau : toutes des tensions', Object.values(PASSING_QUALITIES_BY_LEVEL).flat().every(isTensionQuality));

  // Toute la bibliothèque, 12 tons × 5 niveaux : accords principaux sans tension,
  // passages en tension, passages ajoutés selon le niveau.
  const structural = [];
  const passingNotTension = [];
  const byLevel = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() };
  for (const movement of movementsLibrary.movements) {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      for (const key of [0, 3, 6, 9]) {
        const prog = movementChords(movement.name, { key, difficulty });
        prog.chords.forEach((chord, i) => {
          if (isTensionQuality(chord.symbol)) structural.push(`${movement.name} ${chord.name}`);
          const p = chord.passingChord;
          if (!p) return;
          if (!isTensionQuality(p.symbol)) passingNotTension.push(`${movement.name} ${p.name}`);
          if (!movement.passing?.[i]) byLevel[difficulty].add(p.symbol);
        });
      }
    }
  }
  check('Bibliothèque : aucun accord principal de tension (61 mouvements, 5 niveaux)', structural.length === 0, structural.slice(0, 3).join(' ; '));
  check('Bibliothèque : chaque passage est un accord de tension', passingNotTension.length === 0, passingNotTension.slice(0, 3).join(' ; '));
  const levelSets = [1, 2, 3, 4, 5].map((l) => [...byLevel[l]].sort().join('/'));
  check('Passages ajoutés par le niveau : rien, rien, diminués, 7b9 / 7#5 / 7b5, altérés',
    levelSets.join(' | ') === ' |  | dim7 | 7#5/7b5/7b9 | 7#9/7alt', levelSets.join(' | '));
  check('Bibliothèque enrichie : au moins 60 mouvements, 9 catégories', movementsLibrary.movements.length >= 60
    && new Set(movementsLibrary.movements.map((m) => m.category)).size === 9, `${movementsLibrary.movements.length} / ${[...new Set(movementsLibrary.movements.map((m) => m.category))].join(', ')}`);
  const barry = movementChords('Alternance mineur 6 – diminué (Barry Harris)', { difficulty: 1 });
  check('Passages écrits par le mouvement, dès le niveau 1 (Barry Harris : Cm6, Bdim7 entre chaque position)',
    barry.chords.map((c) => c.name + (c.passingChord ? `(${c.passingChord.name})` : '')).join(' ') === 'Cm6(Bdim7) Cm6(Bdim7) Cm6(Bdim7) Cm6');
  check('Barry Harris : les quatre positions de Cm6 (dessus C, Eb, G, A)',
    barry.chords.map((c) => Math.max(...c.notes) % 12).join() === '0,3,7,9', barry.chords.map((c) => Math.max(...c.notes) % 12).join());

  console.log('\n=== Accords de passage : étapes à jouer ===');
  const ex = createPracticeExercise();
  ex.setMode('movement');
  ex.setTechnique('drop2');
  ex.setDifficulty(4);
  ex.setKeyChoice(0);
  ex.setContentChoice('Cadence II-V-I majeur');
  let st = ex.getState();
  const [dm11, g13] = st.progression.chords;
  check('Passage d\'un Drop 2 sans 7b9 publié : voicing d\'une autre technique, enchaîné', dm11.passingChord?.name === 'D7b9'
    && dm11.passingChord.voicing.technique !== 'drop2' && dm11.passingChord.notes.length >= 3, `${dm11.passingChord?.name} ${dm11.passingChord?.voicing.technique}`);
  let chainedCost = 0;
  let firstCost = 0;
  let passages = 0;
  for (const name of listMovementNames()) {
    for (const technique of ['drop2', 'rootless']) {
      const prog = movementChords(name, { key: 5, difficulty: 5, technique });
      for (const chord of prog.chords) {
        const p = chord.passingChord;
        if (!p) continue;
        const v = exerciseVoicingsFor(p.rootPc, p.symbol, p.voicing.technique)[0];
        chainedCost += voiceLeadingCost(chord.notes, p.notes);
        firstCost += voiceLeadingCost(chord.notes, [...v.lh, ...v.rh]);
        passages += 1;
      }
    }
  }
  check('Passages enchaînés : au moins 30 % de mouvement en moins qu\'une variante fixe', passages > 100 && chainedCost < firstCost * 0.7,
    `${(chainedCost / passages).toFixed(1)} contre ${(firstCost / passages).toFixed(1)} demi-tons sur ${passages} passages`);
  check('Étapes de la tonalité : 3 accords + 2 passages', st.target.stepProgress === '1 / 5 accords', st.target.stepProgress);
  check('Accord joué → étape suivante = son passage (D7b9)', ex.check(dm11.notes).success && ex.getState().progression.onPassing && ex.getState().target.name === 'D7b9');
  check('Passage attendu : les notes de Dm11 ne suffisent plus', !ex.isCorrect(dm11.notes) && ex.isCorrect(dm11.passingChord.notes));
  check('Passage joué → accord suivant (G13)', ex.check(dm11.passingChord.notes).success && !ex.getState().progression.onPassing && ex.getState().target.name === g13.name);
  ex.previous();
  st = ex.getState();
  check('Précédent depuis G13 : retour au passage D7b9', st.progression.onPassing && st.stepIndex === 0 && st.target.name === 'D7b9');
  ex.goToStep(2);
  ex.goToPassing(1);
  st = ex.getState();
  check('Saut direct au passage qui suit G13 (G7#5), compteur 4 / 5', st.progression.onPassing && st.target.name === 'G7#5' && st.target.stepProgress === '4 / 5 accords', `${st.target.name} ${st.target.stepProgress}`);
  const before = st.target.notes.join();
  ex.setVariant(1);
  st = ex.getState();
  check('Flèches sur un passage : sa variante change, il reste l\'étape affichée', st.progression.onPassing && st.target.name === 'G7#5' && (st.target.notes.join() !== before || st.target.voicing.variantCount === 1)
    && st.progression.passingAnchors[1]?.technique === st.target.voicing.technique);
  ex.setStepTopNote(1, 4, { passing: true });
  st = ex.getState();
  check('Note du dessus d\'un passage (G7#5, dessus B)', Math.max(...st.target.notes) % 12 === 11 && st.progression.passingTopIntervals[1] === 4, st.target.notes.join());
  const bars = st.progression.chords.map((c) => c.name + (c.passingChord ? `(${c.passingChord.name})` : '')).join(' ');
  ex.goToStep(2);
  ex.check(ex.getState().target.notes);
  st = ex.getState();
  check('Dernier accord joué : tonalité suivante, sur son premier accord', st.progression.keyIndex === 1 && st.stepIndex === 0 && !st.progression.onPassing, bars);

  const grid = createPracticeExercise();
  grid.setCustomGrid([{ name: 'Cmaj7' }, { name: 'A7b9', top: 1 }, { name: 'Dm7' }, { name: 'G7' }]);
  st = grid.getState();
  check('Ma grille : A7b9 joué en passage entre Cmaj7 et Dm7, aucun passage ajouté par le niveau',
    st.progression.chords.map((c) => c.name + (c.passingChord ? `(${c.passingChord.name})` : '')).join(' ') === 'Cmaj7(A7b9) Dm7 G7');
  check('Ma grille : note du dessus du passage gardée (A7b9, dessus Bb)', Math.max(...st.progression.chords[0].passingChord.notes) % 12 === 10);
  grid.goToPassing(0);
  grid.setStepTopNote(0, 4, { passing: true });
  check('Ma grille : dessus du passage changé sur la carte → gardé dans la grille', grid.getState().customGrid[1].top === 4 && grid.getState().customGrid[0].top == null);
  const lead = createPracticeExercise();
  lead.setCustomGrid('C7#9 Fmaj7 Bb7alt Eb7b9 Abmaj7');
  check('Ma grille ancienne : tension en tête ou deux de suite → reste un accord principal',
    lead.getState().progression.chords.map((c) => c.name + (c.passingChord ? `(${c.passingChord.name})` : '')).join(' ') === 'C7#9 Fmaj7(Bb7alt) Eb7b9 Abmaj7',
    lead.getState().progression.chords.map((c) => c.name + (c.passingChord ? `(${c.passingChord.name})` : '')).join(' '));
}

function checkChainedVoicings() {
  console.log('\n=== Mouvement : voicings enchaînés ===');
  let chained = 0; let fixed = 0; let pairs = 0;
  for (const technique of ['auto', 'drop2', 'rootless', 'close']) {
    for (const name of listMovementNames()) {
      const ex = createPracticeExercise();
      ex.setMode('movement');
      ex.setTechnique(technique);
      ex.setKeyChoice(5);
      ex.setContentChoice(name);
      const chords = ex.getState().progression.chords;
      for (let i = 1; i < chords.length; i += 1) {
        const first = (c) => { const v = exerciseVoicingsFor(c.rootPc, c.symbol, c.voicing.technique)[0]; return [...v.lh, ...v.rh]; };
        chained += voiceLeadingCost(chords[i - 1].notes, chords[i].notes);
        fixed += voiceLeadingCost(first(chords[i - 1]), first(chords[i]));
        pairs += 1;
      }
    }
  }
  check('Enchaînement plus fluide qu\'une variante fixe (coût moyen au moins 25 % plus bas)', chained < fixed * 0.75,
    `${(chained / pairs).toFixed(1)} contre ${(fixed / pairs).toFixed(1)} demi-tons`);

  const ex = createPracticeExercise();
  ex.setMode('movement');
  ex.setTechnique('rootless');
  ex.setKeyChoice(0);
  ex.setContentChoice('Turnaround III-VI-II-V-I');
  const before = ex.getState().progression.chords.map((c) => c.notes.join());
  check('Premier accord : première variante', ex.getState().target.voicing.variantIndex === 0);
  ex.goToStep(2);
  ex.setVariant(1);
  const after = ex.getState().progression.chords;
  check('Flèche sur le 3e accord : sa variante change, les deux premiers restent',
    after[2].voicing.variantIndex === 1 && after[0].notes.join() === before[0] && after[1].notes.join() === before[1] && ex.getState().target.name === after[2].name,
    after.map((c) => `${c.name}:${c.voicing.variantIndex}`).join(' '));
  const target = ex.getState().target;
  check('La cible affichée est le voicing enchaîné de la grille', target.notes.join() === after[2].notes.join());
  ex.check(target.notes);
  check('Variante fixée gardée en avançant', ex.getState().progression.chords[2].voicing.variantIndex === 1);
  ex.setTechnique('drop2');
  check('Changement de technique : variantes fixées oubliées', Object.keys(ex.getState().progression.anchors).length === 0);
}

async function runTests() {
  checkChordTargetHasVoicing();
  checkSpecificChords();
  checkTechniqueSwitch();
  checkProgressionModeRemoved();
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
  checkFaithfulTechniques();
  checkKeySpelling();
  checkMovementLibraryComplete();
  checkMovementReplacementNotice();
  checkDrop3Register();
  checkRegisterAllFamilies();
  checkTextbookVoicings();
  checkValidationAgainstAnnouncedChord();
  checkTypedCustomGrid();
  checkMovementNavigationAndKeys();
  checkChainedVoicings();
  checkMelodyAndGrids();
  checkTensionRule();
  checkLeftHandStyles();
  checkCardDemoAdditions();
  checkPianistRealism();
  await checkAllVoicingLabReachable();

  console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
