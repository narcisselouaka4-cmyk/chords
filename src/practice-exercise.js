// [Claude] — 2026-07-07 — Exercices rapides pour l'onglet Entraînement.
// Modes : accord cible (reconnaître/jouer un accord) et progression (jouer une séquence).

import { detectChord } from './chord-engine/index.js';
import { formatPc } from './chord-engine/naming.js';
import { miniKeyboardForNotes } from './ui/mini-keyboard.js';

const PRACTICE_SYMBOLS = ['', 'm', 'm7', '7', 'maj7', 'm9', '9', 'maj9', '7sus4', 'dim7'];

const PROGRESSION_TEMPLATES = [
  { name: 'II-V-I majeur', degrees: [2, 5, 0], symbols: ['m7', '7', 'maj7'] },
  { name: 'I-V-vi-IV pop', degrees: [0, 7, 9, 5], symbols: ['', '', 'm', ''] },
  { name: 'I-VI-II-V jazz', degrees: [0, 9, 2, 7], symbols: ['maj7', '7', 'm7', '7'] },
  { name: 'III-VI-II-V turnaround', degrees: [4, 9, 2, 7], symbols: ['m7', '7', 'm7', '7'] },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
  return array[randomInt(0, array.length - 1)];
}

function chordNotes(rootPc, symbol) {
  // Intervalles simplifiés pour l'entraînement
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

export function createPracticeExercise() {
  let state = {
    mode: 'chord',
    target: null,
    progression: null,
    stepIndex: 0,
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

  function next() {
    state.attempts = 0;
    if (state.mode === 'chord') {
      state.target = generateChordTarget();
      state.progression = null;
      state.stepIndex = 0;
    } else {
      state.progression = generateProgressionTarget();
      state.target = state.progression.chords[0];
      state.stepIndex = 0;
    }
    return state;
  }

  function setMode(mode) {
    state.mode = mode;
    return next();
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

    // Mode progression
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
  return `
    <div class="exercise-target-card">
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
