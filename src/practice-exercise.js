// [Claude] — 2026-07-07 — Exercices rapides pour l'onglet Entraînement.
// Modes : accord cible, progression, mouvement dans les 12 tons.

import { detectChord } from './chord-engine/index.js';
import { formatPc } from './chord-engine/naming.js';
import { miniKeyboardForNotes } from './ui/mini-keyboard.js';
import { deriveChordDisplay } from './chord-engine/chord-display.js';
import movementsLibrary from './data/movements-library.json' with { type: 'json' };

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
  return array[randomInt(0, array.length - 1)];
}

function chordNotesFromSymbol(symbol, centerOctave = 4) {
  if (!symbol || symbol === 'N') return [];
  const display = deriveChordDisplay(symbol);
  const base = centerOctave * 12;
  return display.allPcs.map((pc) => base + pc);
}

function chordNotes(rootPc, symbol) {
  // Intervalles simplifiés pour l'entraînement (modes Accord / Progression)
  const intervalMap = {
    '': [0, 4, 7],
    m: [0, 3, 7],
    m7: [0, 3, 7, 10],
    7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    m9: [0, 3, 7, 10, 14],
    9: [0, 4, 7, 10, 14],
    maj9: [0, 4, 7, 11, 14],
    '7sus4': [0, 5, 7, 10],
    dim7: [0, 3, 6, 9],
    madd9: [0, 3, 7, 14],
    add9: [0, 4, 7, 14],
    '6': [0, 4, 7, 9],
  };
  const intervals = intervalMap[symbol] || intervalMap[''];
  const base = (4 + 1) * 12 + rootPc; // octave 4
  return intervals.map((i) => base + i);
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

function buildMovementChords(movement, keyPc) {
  const tokens = movement.pattern.split('-');
  return tokens.map((token) => {
    const parsed = parseMovementToken(token);
    if (!parsed) return null;
    const rootPc = (keyPc + parsed.offset) % 12;
    const rootName = formatPc(rootPc, false);
    const symbol = parsed.quality ? `${rootName}${parsed.quality}` : rootName;
    return {
      rootPc,
      symbol: parsed.quality || 'maj',
      name: symbol,
      notes: chordNotesFromSymbol(symbol),
      token,
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
  };

  function generateChordTarget() {
    const rootPc = randomInt(0, 11);
    const symbol = pick(PRACTICE_SYMBOLS);
    return {
      type: 'chord',
      rootPc,
      symbol,
      notes: chordNotes(rootPc, symbol),
      name: `${formatPc(rootPc, false)}${symbol}`,
    };
  }

  function generateProgressionTarget() {
    const template = pick(PROGRESSION_TEMPLATES);
    const keyPc = randomInt(0, 11);
    const chords = template.degrees.map((deg, i) => {
      const rootPc = (keyPc + deg) % 12;
      const symbol = template.symbols[i];
      return {
        rootPc,
        symbol,
        notes: chordNotes(rootPc, symbol),
        name: `${formatPc(rootPc, false)}${symbol}`,
        degree: deg === 0 ? 'I' : deg === 2 ? 'II' : deg === 4 ? 'III' : deg === 5 ? 'IV' : deg === 7 ? 'V' : deg === 9 ? 'VI' : 'VII',
      };
    });
    return {
      type: 'progression',
      name: template.name,
      keyPc,
      chords,
    };
  }

  function generateMovementTarget() {
    const movement = pick(movementsLibrary.movements);
    const startKey = randomInt(0, 11);
    const chords = buildMovementChords(movement, startKey);
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
      chords,
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
      prog.chords = buildMovementChords(prog.movement, prog.currentKey);
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
    setMode,
    check,
    getState,
  };
}

export function renderExerciseTarget(target) {
  if (!target) return '';
  const kb = miniKeyboardForNotes(target.notes || []);
  let header = '';
  if (target.movementName) {
    header = `
      <div class="exercise-movement-header">
        <div class="exercise-movement-category">${escapeHtml(target.movementCategory || '')}</div>
        <div class="exercise-movement-name">${escapeHtml(target.movementName)}</div>
        <div class="exercise-movement-description">${escapeHtml(target.movementDescription || '')}</div>
        <div class="exercise-movement-progress">
          <span class="exercise-key-label">${escapeHtml(target.keyLabel || '')}</span>
          <span class="exercise-key-progress">${escapeHtml(target.keyProgress || '')}</span>
          <span class="exercise-step-progress">${escapeHtml(target.stepProgress || '')}</span>
        </div>
      </div>
    `;
  }
  return `
    <div class="exercise-target-card ${target.movementName ? 'has-movement' : ''}">
      ${header}
      <div class="exercise-target-name">${escapeHtml(target.name)}</div>
      <div class="exercise-target-keyboard">${kb.svg}</div>
      <div class="exercise-target-notes">${escapeHtml(kb.noteNames.join(' — '))}</div>
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
