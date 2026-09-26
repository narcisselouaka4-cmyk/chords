// [Claude] — 2026-09-09 — Générateur de progressions harmoniques pour le Copilot IA.
//
// Produits : ii-V-I, guide tones 7→3, enchaînements d'accords.
// Chaque accord est joué main gauche (basse) + main droite (accord / guide tone).
// Le focus "7-to-3" met la guide tone (7e d'un accord, puis 3e du suivant) en
// note la plus aiguë de la main droite pour la faire entendre clairement.

import {
  LH_HARD_RANGE,
  LH_MAX_SPAN,
  RH_HARD_RANGE,
  RH_MAX_SPAN,
  span,
  midiInRange,
} from '../voicing-engine/hand-ranges.js';
import { chordName } from '../chord-engine/naming.js';
import { parseChordSymbol } from './chord-parser-v2.js';

/**
 * @typedef {{
 *   chordSymbol: string,
 *   leftHand: number[],
 *   rightHand: number[],
 *   focusNote?: number,
 *   durationMs: number,
 *   startOffsetMs: number,
 * }} ProgressionChord
 *
 * @typedef {{
 *   chords: ProgressionChord[],
 *   isPlayable: boolean,
 *   diagnostics: string[],
 *   totalDurationMs: number,
 * }} CopilotProgression
 */

const FOCUS_NAMES = {
  '7-to-3': 'guide-tone 7→3',
  '3-to-7': 'guide-tone 3→7',
  'full': 'accords complets',
  'guide-tones-only': 'guide tones seuls',
};

const DEFAULT_STYLE_TECHNIQUE = {
  worship: 'close',
  gospel: 'drop2',
  jazz: 'rootless',
  neoSoul: 'quartal',
};

/**
 * Génère une démonstration de progression harmonique.
 *
 * @param {string[]} chordSymbols - Liste des accords à enchaîner, ex. ["Dm7", "G7", "Cmaj7"].
 * @param {object} options
 * @param {string} [options.focus='full'] - '7-to-3', '3-to-7', 'full', 'guide-tones-only'.
 * @param {string} [options.styleId='jazz'] - 'auto'|'worship'|'gospel'|'jazz'|'neoSoul'.
 * @param {string} [options.pattern='block'] - 'block'|'arppegio-up'|'arppegio-down'|'rolled'.
 * @param {number} [options.durationMs=2000] - Durée totale de la progression.
 * @param {number} [options.startOffsetMs=0] - Délai avant le premier accord.
 * @returns {CopilotProgression}
 */
export function generateCopilotProgression(chordSymbols, options = {}) {
  const diagnostics = [];
  const symbols = Array.isArray(chordSymbols) ? chordSymbols : [chordSymbols].filter(Boolean);
  if (symbols.length === 0) {
    diagnostics.push('Aucun accord fourni pour la progression.');
    return emptyProgression(diagnostics);
  }

  const focus = FOCUS_NAMES[options.focus] ? options.focus : 'full';
  let styleId = options.styleId || 'jazz';
  if (styleId === 'auto') styleId = 'jazz';
  const pattern = ['block', 'arppegio-up', 'arppegio-down', 'rolled'].includes(options.pattern)
    ? options.pattern
    : 'block';
  const totalDurationMs = Math.max(200, Math.min(8000, Number.isFinite(options.durationMs) ? options.durationMs : 2000));
  const globalStartOffsetMs = Number.isFinite(options.startOffsetMs) ? Math.max(0, Math.min(8000, options.startOffsetMs)) : 0;
  const chordDurationMs = Math.floor(totalDurationMs / symbols.length);

  const parsedChords = symbols.map((sym) => {
    const parsed = parseChordSymbol(sym);
    if (!parsed || !parsed.ok) {
      diagnostics.push(`Accord non reconnu : ${sym}`);
      return null;
    }
    // Conserver le symbole d'origine dans le résultat du parser.
    parsed.input = sym;
    return parsed;
  });

  if (parsedChords.some((p) => p === null)) {
    return emptyProgression(diagnostics);
  }

  const chords = [];
  for (let i = 0; i < parsedChords.length; i += 1) {
    const parsed = parsedChords[i];
    const chordStartMs = globalStartOffsetMs + i * chordDurationMs;
    const chordResult = buildProgressionChord(parsed, {
      focus,
      styleId,
      previous: parsedChords[i - 1] || null,
      next: parsedChords[i + 1] || null,
    });
    chords.push({
      chordSymbol: parsed.input,
      leftHand: chordResult.leftHand,
      rightHand: chordResult.rightHand,
      focusNote: chordResult.focusNote,
      durationMs: chordDurationMs,
      startOffsetMs: chordStartMs,
    });
    diagnostics.push(...chordResult.diagnostics);
  }

  const playable = validateProgression(chords);
  diagnostics.push(...playable.diagnostics);

  return {
    chords,
    isPlayable: playable.valid,
    diagnostics,
    totalDurationMs: chords.length * chordDurationMs,
  };
}

function emptyProgression(diagnostics) {
  return {
    chords: [],
    isPlayable: false,
    diagnostics,
    totalDurationMs: 0,
  };
}

/**
 * Construit un accord de progression (LH basse + RH accord/guide tone).
 * @returns {{
 *   leftHand: number[],
 *   rightHand: number[],
 *   focusNote?: number,
 *   diagnostics: string[],
 * }}
 */
function buildProgressionChord(parsed, { focus, styleId, previous, next }) {
  const diagnostics = [];
  const rootPc = parsed.rootPc;
  const bassPc = parsed.bassPc !== null ? parsed.bassPc : rootPc;
  const thirdPc = findPc(parsed, 4) || findPc(parsed, 3);
  const seventhPc = findPc(parsed, 11) || findPc(parsed, 10);
  const fifthPc = findPc(parsed, 7);

  // LH : basse de l'accord, confortablement dans la tessiture grave.
  const leftHand = buildBassNotes(bassPc, rootPc);

  // RH : notes de l'accord dans la tessiture médium/aiguë.
  let rightHand = [];
  let focusNote = null;

  if (focus === 'guide-tones-only') {
    // Seulement 3e et 7e à la main droite.
    if (thirdPc !== null) rightHand.push(noteInRange(thirdPc, RH_HARD_RANGE));
    if (seventhPc !== null) rightHand.push(noteInRange(seventhPc, RH_HARD_RANGE));
  } else if (focus === '7-to-3') {
    // On veut entendre la 7e de cet accord puis la 3e du suivant.
    // Si un accord suivant existe, on place la 3e de CET accord dans la
    // tessiture de la 7e de l'accord précédent pour un voice leading clair.
    const targets = [];
    if (thirdPc !== null) targets.push(thirdPc);
    if (seventhPc !== null) targets.push(seventhPc);
    if (fifthPc !== null) targets.push(fifthPc);
    rightHand = buildRightHandWithFocus(parsed, targets, focus, previous, next);
    focusNote = rightHand[rightHand.length - 1] || null;
  } else if (focus === '3-to-7') {
    const targets = [];
    if (thirdPc !== null) targets.push(thirdPc);
    if (seventhPc !== null) targets.push(seventhPc);
    if (fifthPc !== null) targets.push(fifthPc);
    rightHand = buildRightHandWithFocus(parsed, targets, focus, previous, next);
    focusNote = rightHand[rightHand.length - 1] || null;
  } else {
    // full : accord complet.
    rightHand = buildRightHandFull(parsed, styleId);
    focusNote = null;
  }

  // S'assurer que la main droite est au-dessus de la main gauche.
  const adjusted = avoidHandOverlap(leftHand, rightHand);

  if (rightHand.length === 0) {
    diagnostics.push(`Aucune note trouvée pour ${parsed.input} en main droite.`);
  }

  return {
    leftHand: dedupAndSort(adjusted.leftHand),
    rightHand: dedupAndSort(adjusted.rightHand),
    focusNote,
    diagnostics,
  };
}

/**
 * Retourne la pitch class d'un intervalle par rapport à la fondamentale si elle
 * est présente dans l'accord.
 */
function findPc(parsed, semitones) {
  const target = (parsed.rootPc + semitones) % 12;
  const notes = parsed.notes || [];
  const exists = notes.some((n) => {
    const pc = noteNameToPc(n);
    return pc === target;
  });
  return exists ? target : null;
}

function noteNameToPc(name) {
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6,
    Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  return map[name] ?? null;
}

/**
 * Place une pitch class dans une tessiture MIDI confortable.
 */
function noteInRange(pc, range) {
  // Cherche l'octave la plus proche du centre.
  const center = Math.floor((range.min + range.max) / 2);
  let midi = center + ((pc - (center % 12) + 12) % 12);
  if (midi > range.max) midi -= 12;
  if (midi < range.min) midi += 12;
  return Math.max(range.min, Math.min(range.max, midi));
}

/**
 * Construit les notes de basse pour la main gauche.
 */
function buildBassNotes(bassPc, rootPc) {
  const bass = noteInRange(bassPc, LH_HARD_RANGE);
  // Pour les slash chords, ajouter aussi la fondamentale une octave au-dessus
  // si elle est différente et reste jouable.
  if (bassPc !== rootPc) {
    const root = bass + ((rootPc - bassPc + 12) % 12);
    if (root - bass <= 12 && root <= LH_HARD_RANGE.max && root >= LH_HARD_RANGE.min) {
      return [bass, root];
    }
  }
  return [bass];
}

/**
 * Construit la main droite avec une note de focus en haut (7→3 ou 3→7).
 */
function buildRightHandWithFocus(parsed, targets, focus, previous, next) {
  const notes = [];
  for (const pc of targets) {
    notes.push(noteInRange(pc, RH_HARD_RANGE));
  }
  if (notes.length === 0) return [];

  // Dédupliquer et trier.
  const unique = dedupAndSort(notes);

  // Focus 7→3 : la note la plus aiguë de la main droite doit être la guide
  // tone de l'accord courant (7e) ET on s'assure que la 3e de l'accord
  // suivant est aussi présente dans la tessiture pour faire entendre la
  // résolution. On ne supprime jamais la 7e courante.
  if (focus === '7-to-3' && next) {
    const nextThirdPc = findPc(next, 4) || findPc(next, 3);
    const currentSeventh = findPc(parsed, 11) || findPc(parsed, 10);
    if (nextThirdPc !== null && currentSeventh !== null) {
      // S'assurer que la 7e actuelle est en haut.
      const currentSeventhMidi = unique.find((n) => n % 12 === currentSeventh)
        || noteInRange(currentSeventh, RH_HARD_RANGE);
      // Ajuster la 3e du suivant pour rester proche (±4 demi-tons) de la 7e.
      let nextThirdMidi = currentSeventhMidi + ((nextThirdPc - currentSeventh + 12) % 12);
      if (nextThirdMidi > currentSeventhMidi + 4) nextThirdMidi -= 12;
      if (nextThirdMidi < currentSeventhMidi - 4) nextThirdMidi += 12;
      nextThirdMidi = Math.max(RH_HARD_RANGE.min, Math.min(RH_HARD_RANGE.max, nextThirdMidi));

      // Si la 3e du suivant n'est pas déjà présente, l'ajouter à côté de la 7e.
      if (!unique.some((n) => n % 12 === nextThirdPc)) {
        unique.push(nextThirdMidi);
      }
      // Forcer la 7e actuelle à être la note la plus aiguë (focusNote).
      const others = unique.filter((n) => n % 12 !== currentSeventh);
      unique.length = 0;
      unique.push(...others);
      unique.push(Math.max(currentSeventhMidi, nextThirdMidi + 1));
      // Si l'accord suivant est le dernier, on garde la 7e en haut.
    }
  }

  // Focus 3→7 : inverse — la 3e actuelle en haut, la 7e du suivant proche.
  if (focus === '3-to-7' && next) {
    const nextSeventhPc = findPc(next, 11) || findPc(next, 10);
    const currentThird = findPc(parsed, 4) || findPc(parsed, 3);
    if (nextSeventhPc !== null && currentThird !== null) {
      const currentThirdMidi = unique.find((n) => n % 12 === currentThird)
        || noteInRange(currentThird, RH_HARD_RANGE);
      let nextSeventhMidi = currentThirdMidi + ((nextSeventhPc - currentThird + 12) % 12);
      if (nextSeventhMidi > currentThirdMidi + 4) nextSeventhMidi -= 12;
      if (nextSeventhMidi < currentThirdMidi - 4) nextSeventhMidi += 12;
      nextSeventhMidi = Math.max(RH_HARD_RANGE.min, Math.min(RH_HARD_RANGE.max, nextSeventhMidi));
      if (!unique.some((n) => n % 12 === nextSeventhPc)) {
        unique.push(nextSeventhMidi);
      }
      const others = unique.filter((n) => n % 12 !== currentThird);
      unique.length = 0;
      unique.push(...others);
      unique.push(Math.max(currentThirdMidi, nextSeventhMidi + 1));
    }
  }

  return dedupAndSort(unique);
}

/**
 * Construit la main droite pour un accord complet (full).
 */
function buildRightHandFull(parsed, styleId) {
  const notes = [];
  for (const name of parsed.notes || []) {
    const pc = noteNameToPc(name);
    if (pc !== null) notes.push(noteInRange(pc, RH_HARD_RANGE));
  }
  // Limiter à 4 notes pour rester confortable.
  let unique = dedupAndSort(notes);
  if (unique.length > 4) {
    // Garder 3e, 7e et tensions si possible.
    const priority = [];
    const thirdPc = findPc(parsed, 4) || findPc(parsed, 3);
    const seventhPc = findPc(parsed, 11) || findPc(parsed, 10);
    const fifthPc = findPc(parsed, 7);
    const rootPc = parsed.rootPc;
    for (const pc of [thirdPc, seventhPc, fifthPc, rootPc]) {
      if (pc !== null && !priority.includes(pc)) priority.push(pc);
    }
    for (const n of unique) {
      if (!priority.includes(n % 12)) priority.push(n % 12);
    }
    unique = unique.filter((n) => priority.slice(0, 4).includes(n % 12));
  }
  return unique;
}

/**
 * Évite le chevauchement LH/RH en remontant la RH au besoin.
 */
function avoidHandOverlap(leftHand, rightHand) {
  const lhMax = leftHand.length ? Math.max(...leftHand) : 0;
  let rh = rightHand.map((n) => (n <= lhMax + 3 ? n + 12 : n));
  rh = rh.map((n) => Math.max(RH_HARD_RANGE.min, Math.min(RH_HARD_RANGE.max, n)));
  return { leftHand, rightHand: rh };
}

function dedupAndSort(notes) {
  const unique = Array.from(new Set(notes.filter(Number.isFinite)));
  unique.sort((a, b) => a - b);
  return unique;
}

/**
 * Valide l'ensemble de la progression.
 * @returns {{valid: boolean, diagnostics: string[]}}
 */
function validateProgression(chords) {
  const diagnostics = [];
  let valid = true;

  for (const chord of chords) {
    const all = [...chord.leftHand, ...chord.rightHand];
    for (const n of all) {
      if (n < 21 || n > 108) {
        diagnostics.push(`Note ${chordName(n)} hors tessiture piano.`);
        valid = false;
      }
    }

    if (span(chord.leftHand) > LH_MAX_SPAN) {
      diagnostics.push(`Écart LH trop grand pour ${chord.chordSymbol}.`);
      valid = false;
    }
    if (span(chord.rightHand) > RH_MAX_SPAN) {
      diagnostics.push(`Écart RH trop grand pour ${chord.chordSymbol}.`);
      valid = false;
    }

    if (chord.leftHand.length && chord.rightHand.length) {
      const lhMax = Math.max(...chord.leftHand);
      const rhMin = Math.min(...chord.rightHand);
      if (rhMin < lhMax) {
        diagnostics.push(`Chevauchement LH/RH sur ${chord.chordSymbol}.`);
        valid = false;
      }
    }

    if (chord.rightHand.length === 0 && chord.leftHand.length === 0) {
      diagnostics.push(`Aucune note pour ${chord.chordSymbol}.`);
      valid = false;
    }
  }

  return { valid, diagnostics };
}

/**
 * Convertit une progression en séquence de notes MIDI avec offsets.
 *
 * @param {CopilotProgression} progression
 * @param {object} options
 * @param {string} [options.pattern='block']
 * @returns {{midi: number, startOffsetMs: number, durationMs: number, hand: 'LH'|'RH', role: string}[]}
 */
export function progressionToNoteSequence(progression, options = {}) {
  const pattern = options.pattern || 'block';
  const notes = [];

  for (const chord of progression.chords) {
    // [Claude] — 2026-09-25 — Chaque note garde son accord (rôles au clavier pendant l'écoute).
    const allNotes = [
      ...chord.leftHand.map((midi, i) => ({
        midi,
        hand: 'LH',
        role: i === 0 ? 'bass' : 'root-doubling',
        chord: chord.chordSymbol,
      })),
      ...chord.rightHand.map((midi) => ({
        midi,
        hand: 'RH',
        role: midi === chord.focusNote ? 'focus-guide-tone' : 'chord-tone',
        chord: chord.chordSymbol,
      })),
    ];

    if (pattern === 'block') {
      for (const note of allNotes) {
        notes.push({
          ...note,
          startOffsetMs: chord.startOffsetMs,
          durationMs: Math.max(200, chord.durationMs - 50),
        });
      }
    } else if (pattern === 'arppegio-up') {
      const sorted = [...allNotes].sort((a, b) => a.midi - b.midi);
      const step = Math.floor(chord.durationMs / Math.max(1, sorted.length));
      sorted.forEach((note, i) => {
        notes.push({
          ...note,
          startOffsetMs: chord.startOffsetMs + i * step,
          durationMs: Math.max(150, chord.durationMs - i * step),
        });
      });
    } else if (pattern === 'arppegio-down') {
      const sorted = [...allNotes].sort((a, b) => b.midi - a.midi);
      const step = Math.floor(chord.durationMs / Math.max(1, sorted.length));
      sorted.forEach((note, i) => {
        notes.push({
          ...note,
          startOffsetMs: chord.startOffsetMs + i * step,
          durationMs: Math.max(150, chord.durationMs - i * step),
        });
      });
    } else if (pattern === 'rolled') {
      const sorted = [...allNotes].sort((a, b) => a.midi - b.midi);
      sorted.forEach((note, i) => {
        notes.push({
          ...note,
          startOffsetMs: chord.startOffsetMs + i * 80,
          durationMs: Math.max(200, chord.durationMs - 80),
        });
      });
    }
  }

  return notes;
}

/**
 * Retourne une description textuelle de la progression.
 * @param {CopilotProgression} progression
 * @returns {string}
 */
export function formatProgressionNotes(progression) {
  return progression.chords.map((c) => {
    const lh = c.leftHand.map((n) => chordName(n)).join(' ');
    const rh = c.rightHand.map((n) => chordName(n)).join(' ');
    return `${c.chordSymbol} : LH ${lh} | RH ${rh}`;
  }).join(' → ');
}

/**
 * Liste les foci disponibles pour une progression.
 * @returns {string[]}
 */
export function listProgressionFoci() {
  return Object.keys(FOCUS_NAMES);
}

/**
 * Description d'un focus.
 */
export function describeProgressionFocus(focus) {
  return FOCUS_NAMES[focus] || focus;
}
