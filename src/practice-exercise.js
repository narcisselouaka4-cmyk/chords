// [Claude] — 2026-07-07 — Exercices rapides pour l'onglet Entraînement.
// Modes : accord cible, progression, mouvement dans les 12 tons.
// [Claude] — 2026-09-21 — Les voicings affichés/joués sont désormais produits
// par le moteur Copilot IA (copilot-voicing.js) : vrai split main gauche /
// main droite, validation de tessiture, fallback guide tones. La détection
// côté élève (check()) reste inchangée : elle compare les notes jouées au
// rootPc/symbol cible, indépendamment de l'octave et de la répartition.

import { detectChord } from './chord-engine/index.js';
import { formatPc, noteName } from './chord-engine/naming.js';
import { miniKeyboardForNotes } from './ui/mini-keyboard.js';
import movementsLibrary from './data/movements-library.json' with { type: 'json' };
import {
  generateCopilotVoicing,
  voicingToNoteSequence,
} from './pedagogie/copilot-voicing.js';

const PRACTICE_SYMBOLS = ['', 'm', 'm7', '7', 'maj7', 'm9', '9', 'maj9', '7sus4', 'dim7'];

const PROGRESSION_TEMPLATES = [
  { name: 'II-V-I majeur', degrees: [2, 5, 0], symbols: ['m7', '7', 'maj7'] },
  { name: 'I-V-vi-IV pop', degrees: [0, 7, 9, 5], symbols: ['', '', 'm', ''] },
  { name: 'I-VI-II-V jazz', degrees: [0, 9, 2, 7], symbols: ['maj7', '7', 'm7', '7'] },
  { name: 'III-VI-II-V turnaround', degrees: [4, 9, 2, 7], symbols: ['m7', '7', 'm7', '7'] },
];

const DEGREE_SEMITONES = {
  1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11,
};

const DEFAULT_QUALITY_FOR_DEGREE = {
  1: 'maj7', 2: 'm7', 3: 'm7', 4: 'maj7', 5: '7', 6: 'm7', 7: '7',
};

const MOVEMENT_QUALITY_ALIASES = {
  alt: '7#9b13',
  '7alt': '7#9b13',
  'b5alt': '7#9b13',
  '5alt': '7#9b13',
  m: 'm',
  'm(maj7)': 'mMaj7',
  'maj7#11': 'maj7#11',
};

export const TECHNIQUES = ['auto', 'close', 'drop2', 'quartal'];

export const TECHNIQUE_LABELS = {
  auto: 'Auto',
  close: 'Close position',
  drop2: 'Drop 2',
  quartal: 'Quartal',
};

const MAX_TARGET_ATTEMPTS = 10;

/**
 * Techniques inapplicables à un accord donné, déterminées en interrogeant
 * réellement le moteur plutôt qu'en codant en dur une liste de symboles :
 * Drop 2 refuse les triades (4 sons minimum), Quartal refuse les accords dont
 * l'empilement de quartes sortirait de l'accord.
 *
 * Sert à griser les options du sélecteur pour la cible courante.
 *
 * @param {string} chordSymbol - ex. "C#m", "Cm9"
 * @returns {string[]} techniques à désactiver
 */
export function unavailableTechniquesFor(chordSymbol) {
  const out = [];
  for (const technique of TECHNIQUES) {
    if (technique === 'auto') continue;
    const voicing = generateCopilotVoicing(chordSymbol, { technique, context: 'accompaniment' });
    if (!voicing.isPlayable) out.push(technique);
  }
  return out;
}

/** Noms des progressions proposables dans le sélecteur du mode progression. */
export function listProgressionNames() {
  return PROGRESSION_TEMPLATES.map((t) => t.name);
}

/** Noms des mouvements proposables dans le sélecteur du mode mouvement. */
export function listMovementNames() {
  return movementsLibrary.movements.map((m) => m.name);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
  return array[randomInt(0, array.length - 1)];
}

function formatNoteNameWithOctave(midi) {
  const pcName = noteName(midi);
  const octave = Math.floor(midi / 12) - 1;
  return `${pcName}${octave}`;
}

/**
 * Génère un voicing jouable pour un symbole complet, en essayant d'abord la
 * technique demandée puis les autres en cascade si le moteur retourne
 * isPlayable: false (cas rare, après fallback guide tones).
 *
 * @param {string} chordSymbol - ex. "G#m7", "C#7"
 * @param {string} technique - 'auto' | 'close' | 'drop2' | 'rootless' | 'quartal'
 * @returns {{voicing: object, technique: string}}
 */
function buildPlayableVoicing(chordSymbol, technique) {
  const order = [technique, ...TECHNIQUES.filter((t) => t !== technique)];
  for (const t of order) {
    const options = { styleId: 'auto', context: 'accompaniment' };
    if (t !== 'auto') options.technique = t;
    const voicing = generateCopilotVoicing(chordSymbol, options);
    if (voicing.isPlayable) {
      return { voicing, technique: voicing.technique };
    }
  }
  return { voicing: null, technique };
}

/**
 * Construit la cible complète d'un accord : nom, rootPc, symbol (qualité),
 * notes fusionnées LH+RH pour la détection/affichage, et le voicing complet.
 *
 * @param {number} rootPc
 * @param {string} symbol - qualité seule, ex. 'm7'
 * @param {string} technique
 * @returns {object|null}
 */
function buildChordTarget(rootPc, symbol, technique) {
  const rootName = formatPc(rootPc, false);
  const chordSymbol = symbol ? `${rootName}${symbol}` : rootName;
  const { voicing, technique: usedTechnique } = buildPlayableVoicing(chordSymbol, technique);
  if (!voicing) return null;
  const notes = [...voicing.leftHand, ...voicing.rightHand];
  return {
    type: 'chord',
    rootPc,
    symbol,
    name: chordSymbol,
    notes,
    voicing: {
      ...voicing,
      technique: usedTechnique,
    },
  };
}

function parseMovementToken(token) {
  // Formats acceptés : "7", "b3maj7", "2m7b5", "b5alt", "1m"
  const match = String(token).match(/^([b#]?)(\d+)(.*)$/);
  if (!match) return null;
  const accidental = match[1];
  const degree = parseInt(match[2], 10);
  let quality = (match[3] || '').trim();
  let offset = DEGREE_SEMITONES[degree];
  if (offset == null) return null;
  if (accidental === 'b') offset = (offset - 1 + 12) % 12;
  if (accidental === '#') offset = (offset + 1) % 12;
  if (!quality) quality = DEFAULT_QUALITY_FOR_DEGREE[degree] || '';
  quality = MOVEMENT_QUALITY_ALIASES[quality] || quality;
  return { degree, offset, quality };
}

function buildMovementChords(movement, keyPc, technique) {
  const tokens = movement.pattern.split('-');
  return tokens.map((token) => {
    const parsed = parseMovementToken(token);
    if (!parsed) return null;
    const rootPc = (keyPc + parsed.offset) % 12;
    const target = buildChordTarget(rootPc, parsed.quality, technique);
    if (!target) return null;
    return {
      ...target,
      token,
      degree: parsed.degree,
    };
  }).filter(Boolean);
}

export function createPracticeExercise() {
  let state = {
    mode: 'chord',
    target: null,
    progression: null,
    stepIndex: 0,
    keyIndex: 0,
    score: 0,
    attempts: 0,
    technique: 'auto',
    // null = tirage aléatoire (comportement par défaut). Sinon, nom de la
    // progression / du mouvement explicitement choisi par l'utilisateur.
    progressionChoice: null,
    movementChoice: null,
  };

  function generateChordTarget() {
    for (let i = 0; i < MAX_TARGET_ATTEMPTS; i += 1) {
      const rootPc = randomInt(0, 11);
      const symbol = pick(PRACTICE_SYMBOLS);
      const target = buildChordTarget(rootPc, symbol, state.technique);
      if (target) return target;
    }
    // Repli ultime : Cmaj7 en close position est toujours jouable.
    return buildChordTarget(0, 'maj7', 'close');
  }

  function generateProgressionTarget() {
    // Progression explicitement choisie par l'utilisateur, sinon tirage au sort.
    const chosen = state.progressionChoice
      ? PROGRESSION_TEMPLATES.find((t) => t.name === state.progressionChoice)
      : null;
    for (let i = 0; i < MAX_TARGET_ATTEMPTS; i += 1) {
      const template = chosen || pick(PROGRESSION_TEMPLATES);
      // La tonalité de départ reste aléatoire même quand la progression est choisie.
      const keyPc = randomInt(0, 11);
      const chords = template.degrees.map((deg, iDeg) => {
        const rootPc = (keyPc + deg) % 12;
        const symbol = template.symbols[iDeg];
        const target = buildChordTarget(rootPc, symbol, state.technique);
        if (!target) return null;
        return {
          ...target,
          degree: deg === 0 ? 'I' : deg === 2 ? 'II' : deg === 4 ? 'III' : deg === 5 ? 'IV' : deg === 7 ? 'V' : deg === 9 ? 'VI' : 'VII',
        };
      });
      if (chords.every(Boolean)) {
        return {
          type: 'progression',
          name: template.name,
          keyPc,
          chords,
        };
      }
    }
    // Repli ultime : II-V-I majeur en Do.
    return {
      type: 'progression',
      name: 'II-V-I majeur',
      keyPc: 0,
      chords: ['m7', '7', 'maj7'].map((symbol, deg) => {
        const rootPc = ([2, 7, 0][deg]);
        const target = buildChordTarget(rootPc, symbol, state.technique);
        return {
          ...target,
          degree: deg === 0 ? 'II' : deg === 1 ? 'V' : 'I',
        };
      }),
    };
  }

  function generateMovementTarget() {
    // Mouvement explicitement choisi par l'utilisateur, sinon tirage au sort.
    const chosen = state.movementChoice
      ? movementsLibrary.movements.find((m) => m.name === state.movementChoice)
      : null;
    for (let i = 0; i < MAX_TARGET_ATTEMPTS; i += 1) {
      const movement = chosen || pick(movementsLibrary.movements);
      const startKey = randomInt(0, 11);
      const chords = buildMovementChords(movement, startKey, state.technique);
      if (chords.length === movement.pattern.split('-').length) {
        return {
          type: 'movement',
          name: movement.name,
          description: movement.description,
          category: movement.category,
          pattern: movement.pattern,
          movement,
          startKey,
          currentKey: startKey,
          totalKeys: 12,
          keyIndex: 0,
          stepIndex: 0,
          chords,
        };
      }
    }
    // Repli ultime : mouvement II-V-I.
    const fallback = movementsLibrary.movements.find((m) => m.pattern === '2m7-5-1maj7') || movementsLibrary.movements[0];
    const startKey = randomInt(0, 11);
    return {
      type: 'movement',
      name: fallback.name,
      description: fallback.description,
      category: fallback.category,
      pattern: fallback.pattern,
      movement: fallback,
      startKey,
      currentKey: startKey,
      totalKeys: 12,
      keyIndex: 0,
      stepIndex: 0,
      chords: buildMovementChords(fallback, startKey, state.technique),
    };
  }

  function attachMovementContext(chord, movementState) {
    if (!movementState || movementState.type !== 'movement') return chord;
    const keyName = formatPc(movementState.currentKey, false);
    return {
      ...chord,
      movementName: movementState.name,
      movementDescription: movementState.description,
      movementCategory: movementState.category,
      keyLabel: `Tonalité ${keyName}`,
      keyProgress: `${movementState.keyIndex + 1} / ${movementState.totalKeys} tons`,
      stepProgress: `${movementState.stepIndex + 1} / ${movementState.chords.length} accords`,
    };
  }

  /**
   * Régénère le voicing de la cible courante avec la technique stockée dans
   * l'état, sans changer l'accord (rootPc/symbol). Appelé quand l'utilisateur
   * change de technique ou après un setTechnique.
   */
  function regenerateCurrentTarget() {
    if (!state.target) return;
    const { rootPc, symbol } = state.target;
    const refreshed = buildChordTarget(rootPc, symbol, state.technique);
    if (!refreshed) return;
    // Conserver les métadonnées de contexte mouvement/progression.
    state.target = { ...state.target, ...refreshed };
  }

  function next() {
    state.attempts = 0;
    state.keyIndex = 0;
    state.stepIndex = 0;
    if (state.mode === 'chord') {
      state.target = generateChordTarget();
      state.progression = null;
    } else if (state.mode === 'progression') {
      state.progression = generateProgressionTarget();
      state.target = state.progression.chords[0];
    } else {
      state.progression = generateMovementTarget();
      state.target = attachMovementContext(state.progression.chords[0], state.progression);
    }
    return state;
  }

  function setMode(mode) {
    state.mode = mode;
    return next();
  }

  function setTechnique(technique) {
    if (!TECHNIQUES.includes(technique)) return;
    state.technique = technique;
    regenerateCurrentTarget();
    // En mode progression/mouvement, il faut aussi recalculer les autres accords
    // de la grille pour qu'ils partagent la même technique.
    if (state.progression && state.progression.chords) {
      const isMovement = state.mode === 'movement';
      const chords = state.progression.chords.map((chord) => {
        const refreshed = buildChordTarget(chord.rootPc, chord.symbol, technique);
        if (!refreshed) return chord;
        const { notes, voicing } = refreshed;
        return { ...chord, notes, voicing };
      });
      state.progression.chords = chords;
      state.target = isMovement
        ? attachMovementContext(chords[state.progression.stepIndex || 0], state.progression)
        : chords[state.stepIndex || 0];
    }
  }

  /**
   * Vrai si un accord précédent existe (modes progression et mouvement).
   * Le tout premier accord du tout premier ton n'a pas de précédent.
   */
  function canGoPrevious() {
    if (state.mode === 'chord' || !state.progression) return false;
    if (state.mode === 'progression') return state.stepIndex > 0;
    return state.progression.stepIndex > 0 || state.progression.keyIndex > 0;
  }

  /**
   * Revient à l'accord précédent pour réexaminer son voicing (et par exemple
   * changer de technique). Ne consomme aucune tentative et ne touche PAS au
   * score : c'est une navigation, pas une réponse.
   *
   * @returns {{stepIndex: number, keyIndex: number}|null} null si déjà au début
   */
  function previous() {
    if (!canGoPrevious()) return null;

    if (state.mode === 'progression') {
      state.stepIndex -= 1;
      state.attempts = 0;
      state.target = state.progression.chords[state.stepIndex];
      return { stepIndex: state.stepIndex, keyIndex: state.keyIndex };
    }

    const prog = state.progression;
    if (prog.stepIndex > 0) {
      prog.stepIndex -= 1;
    } else {
      // Retour au dernier accord de la tonalité précédente.
      prog.keyIndex -= 1;
      prog.currentKey = (prog.startKey + prog.keyIndex + 12) % 12;
      prog.chords = buildMovementChords(prog.movement, prog.currentKey, state.technique);
      prog.stepIndex = Math.max(0, prog.chords.length - 1);
    }
    state.stepIndex = prog.stepIndex;
    state.keyIndex = prog.keyIndex;
    state.attempts = 0;
    state.target = attachMovementContext(prog.chords[prog.stepIndex], prog);
    return { stepIndex: prog.stepIndex, keyIndex: prog.keyIndex };
  }

  /**
   * Fixe la progression (mode progression) ou le mouvement (mode mouvement)
   * proposé. `null` rétablit le tirage aléatoire.
   */
  function setContentChoice(name) {
    const value = name || null;
    if (state.mode === 'movement') state.movementChoice = value;
    else state.progressionChoice = value;
    return next();
  }

  function advanceMovement() {
    if (state.mode !== 'movement' || !state.progression) return null;
    const prog = state.progression;
    prog.stepIndex++;
    if (prog.stepIndex >= prog.chords.length) {
      prog.keyIndex++;
      if (prog.keyIndex >= prog.totalKeys) {
        return { completed: true };
      }
      prog.stepIndex = 0;
      prog.currentKey = (prog.startKey + prog.keyIndex) % 12;
      prog.chords = buildMovementChords(prog.movement, prog.currentKey, state.technique);
    }
    state.stepIndex = prog.stepIndex;
    state.keyIndex = prog.keyIndex;
    return { completed: false };
  }

  function check(notes) {
    if (!state.target) return { success: false, message: 'Aucun exercice actif.' };

    const detected = detectChord(notes);
    state.attempts++;

    if (state.mode === 'chord') {
      const success = detected && detected.rootPc === state.target.rootPc && detected.symbol === state.target.symbol;
      if (success) {
        state.score += Math.max(1, 4 - state.attempts + 1);
        const old = state.target;
        state.target = generateChordTarget();
        state.attempts = 0;
        return {
          success: true,
          message: `✅ ${old.name} correct ! Prochain : ${state.target.name}`,
          previousName: old.name,
          nextName: state.target.name,
        };
      }
      const playedName = detected ? `${formatPc(detected.rootPc, false)}${detected.symbol}` : 'inconnu';
      return {
        success: false,
        message: `❌ Vous avez joué ${playedName}. Cible : ${state.target.name}`,
        hint: state.target.notes,
      };
    }

    if (state.mode === 'progression') {
      const expected = state.progression.chords[state.stepIndex];
      const success = detected && detected.rootPc === expected.rootPc && detected.symbol === expected.symbol;
      if (success) {
        state.stepIndex++;
        if (state.stepIndex >= state.progression.chords.length) {
          state.score += 10;
          const completedName = state.progression.name;
          state.progression = generateProgressionTarget();
          state.target = state.progression.chords[0];
          state.stepIndex = 0;
          return {
            success: true,
            message: `✅ Progression ${completedName} terminée ! Suivante : ${state.progression.name}`,
            completed: true,
          };
        }
        state.target = state.progression.chords[state.stepIndex];
        return {
          success: true,
          message: `✅ ${expected.name} correct. Suivant : ${state.target.name}`,
          stepIndex: state.stepIndex,
        };
      }
      const playedName = detected ? `${formatPc(detected.rootPc, false)}${detected.symbol}` : 'inconnu';
      return {
        success: false,
        message: `❌ Attendu ${expected.name} (degré ${expected.degree}), joué ${playedName}.`,
        hint: expected.notes,
      };
    }

    // Mode mouvement dans les 12 tons
    const expected = state.progression.chords[state.stepIndex];
    const success = detected && detected.rootPc === expected.rootPc;
    if (success) {
      const justCompletedKey = state.stepIndex + 1 >= state.progression.chords.length;
      const advance = advanceMovement();
      if (!advance) {
        return { success: false, message: "Erreur interne de l'exercice." };
      }
      if (advance.completed) {
        state.score += 50;
        const completedName = state.progression.name;
        state.progression = generateMovementTarget();
        state.target = attachMovementContext(state.progression.chords[0], state.progression);
        state.stepIndex = 0;
        state.keyIndex = 0;
        state.attempts = 0;
        return {
          success: true,
          message: `✅ ${completedName} parcouru en 12 tons ! Suivant : ${state.progression.name}`,
          completed: true,
        };
      }
      state.target = attachMovementContext(state.progression.chords[state.progression.stepIndex], state.progression);
      state.stepIndex = state.progression.stepIndex;
      state.keyIndex = state.progression.keyIndex;
      if (justCompletedKey) {
        return {
          success: true,
          message: `✅ Tonalité ${formatPc(state.progression.currentKey, false)} validée. Prochain ton : ${state.target.keyLabel}`,
        };
      }
      return {
        success: true,
        message: `✅ ${expected.name} correct. Suivant : ${state.target.name}`,
      };
    }
    const playedName = detected ? `${formatPc(detected.rootPc, false)}${detected.symbol}` : 'inconnu';
    return {
      success: false,
      message: `❌ Attendu ${expected.name} (${state.target.keyLabel}), joué ${playedName}.`,
      hint: expected.notes,
    };
  }

  function getState() {
    return { ...state };
  }

  return {
    next,
    previous,
    canGoPrevious,
    setMode,
    setTechnique,
    setContentChoice,
    check,
    getState,
  };
}

/**
 * Convertit un voicing d'exercice en séquence MIDI temporisée, prête à être
 * passée au mécanisme de lecture audio (playVirtualNote / releaseVirtualNote).
 *
 * @param {object} voicing
 * @returns {{midi: number, startOffsetMs: number, durationMs: number}[]}
 */
export function exerciseVoicingToSequence(voicing) {
  return voicingToNoteSequence(voicing, { pattern: 'block', durationMs: 1200 });
}

export function renderExerciseTarget(target) {
  if (!target) return '';
  const voicing = target.voicing || null;
  const notes = target.notes || [];
  const leftHand = voicing?.leftHand || [];
  const rightHand = voicing?.rightHand || [];
  const technique = voicing?.technique || 'auto';
  const techniqueLabel = TECHNIQUE_LABELS[technique] || technique;

  const kb = miniKeyboardForNotes(notes, { leftHand, rightHand });

  const lhNames = leftHand.map((n) => formatNoteNameWithOctave(n)).join(' · ');
  const rhNames = rightHand.map((n) => formatNoteNameWithOctave(n)).join(' · ');

  return `
    <div class="exercise-target-card ${target.movementName ? 'has-movement' : ''}">
      <div class="exercise-target-name">${escapeHtml(target.name)}</div>
      <div class="exercise-target-technique">${escapeHtml(techniqueLabel)}</div>
      <div class="exercise-target-keyboard">${kb.svg}</div>
      <div class="exercise-target-hands">
        <div class="exercise-hand exercise-hand-lh">
          <span class="exercise-hand-label">Main gauche</span>
          <span class="exercise-hand-notes">${escapeHtml(lhNames || '—')}</span>
        </div>
        <div class="exercise-hand exercise-hand-rh">
          <span class="exercise-hand-label">Main droite</span>
          <span class="exercise-hand-notes">${escapeHtml(rhNames || '—')}</span>
        </div>
      </div>
      <button class="exercise-listen-btn" type="button" data-action="listen-exercise" aria-label="Écouter le voicing">
        <svg class="tr-i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        Écouter
      </button>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
