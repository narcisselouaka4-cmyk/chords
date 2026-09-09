// [Claude] — 2026-09-09 — Générateur de licks et riffs pour le Copilot IA.
//
// Produits : licks mélodiques, riffs rythmiques, fills courts, patterns gospel/jazz.
// Validation intégrée : tessiture, spans, voice leading, positions de main.

import { chordSymbolToMidi } from './copilot-voicing.js';
import { parseChordSymbol as parseNewChordSymbol, chordSymbolToPitchClasses } from './chord-parser-v2.js';
import { resolveCanonicalChordDefinition } from '../chord-engine/chord-display.js';
import { midiToNoteName } from '../voicing-engine/midi-convention.js';
import movementsLibrary from '../data/movements-library.json' with { type: 'json' };

/**
 * @typedef {{
 *   target: string,
 *   styleId: string,
 *   hand: 'RH' | 'LH' | 'both',
 *   difficulty: 'beginner' | 'intermediate' | 'advanced',
 *   lengthBeats: number,
 *   notes: {midi: number, startOffsetMs: number, durationMs: number, velocity: number, hand: 'LH'|'RH', role: string}[],
 *   isPlayable: boolean,
 *   diagnostics: string[]
 * }} CopilotLick
 */

const STYLE_LICK_PROFILES = {
  gospel: {
    scales: ['majorPentatonic', 'majorBlues', 'mixolydian'],
    ornaments: ['graceNote', 'turn', 'mordent'],
    rhythmTemplates: [
      [0, 0.5, 1, 1.5, 2, 3],           // syncopé gospel
      [0, 0.66, 1, 1.33, 2, 2.5, 3],    // triolé feel
      [0, 0.25, 0.75, 1.5, 2.25, 3],    // mouvement rapide
    ],
  },
  jazz: {
    scales: ['mixolydian', 'dorian', 'altered', 'lydianDominant'],
    ornaments: ['enclosure', 'approachTone', 'chromaticPassage'],
    rhythmTemplates: [
      [0, 0.66, 1, 1.5, 2, 2.5, 3],
      [0, 0.5, 1, 1.5, 2, 2.33, 2.66, 3],
      [0, 0.25, 0.75, 1.5, 2, 2.5, 3],
    ],
  },
  neoSoul: {
    scales: ['dorian', 'mixolydian', 'minorPentatonic'],
    ornaments: ['slide', 'doubleStop', 'ghostNote'],
    rhythmTemplates: [
      [0, 0.5, 1, 1.5, 2, 3],
      [0, 0.75, 1.25, 2, 2.5, 3],
      [0, 0.33, 0.66, 1.33, 2, 2.66, 3],
    ],
  },
  worship: {
    scales: ['majorPentatonic', 'major'],
    ornaments: ['graceNote'],
    rhythmTemplates: [
      [0, 1, 2, 3],
      [0, 0.5, 1.5, 2.5, 3],
      [0, 1, 2, 2.5, 3],
    ],
  },
};

const DIFFICULTY_SPANS = {
  beginner: 7,
  intermediate: 10,
  advanced: 14,
};

const HAND_RANGES = {
  LH: { min: 36, max: 60 },
  RH: { min: 55, max: 84 },
};

/**
 * Calcule les pitch classes de la gamme/échelle adaptée à un accord.
 * @param {string} chordSymbol
 * @param {string} scaleType
 * @returns {number[] | null}
 */
function scalePitchClassesForChord(chordSymbol, scaleType) {
  const parsed = parseNewChordSymbol(chordSymbol);
  if (!parsed || parsed.rootPc == null) return null;
  const root = ((parsed.rootPc % 12) + 12) % 12;
  const quality = parsed.qualityId || '';

  const majorScale = [0, 2, 4, 5, 7, 9, 11];
  const dorian = [0, 2, 3, 5, 7, 9, 10];
  const mixolydian = [0, 2, 4, 5, 7, 9, 10];
  const minorPentatonic = [0, 3, 5, 7, 10];
  const majorPentatonic = [0, 2, 4, 7, 9];
  const majorBlues = [0, 2, 3, 4, 7, 9];
  const altered = [0, 1, 3, 4, 6, 8, 10];
  const lydianDominant = [0, 2, 4, 6, 7, 9, 10];

  const isMinor = parsed.category === 'minor';
  const isDominant = parsed.category === 'dominant' || parsed.category === 'sus';

  switch (scaleType) {
    case 'majorPentatonic': return majorPentatonic.map((n) => (root + n) % 12);
    case 'minorPentatonic': return minorPentatonic.map((n) => (root + n) % 12);
    case 'majorBlues': return majorBlues.map((n) => (root + n) % 12);
    case 'dorian': return dorian.map((n) => (root + n) % 12);
    case 'mixolydian': return mixolydian.map((n) => (root + n) % 12);
    case 'altered': return altered.map((n) => (root + n) % 12);
    case 'lydianDominant': return lydianDominant.map((n) => (root + n) % 12);
    case 'major':
    default:
      return majorScale.map((n) => (root + n) % 12);
  }
}

/**
 * Choisit une échelle adaptée au style et à l'accord.
 */
function pickScale(chordSymbol, styleId) {
  const profile = STYLE_LICK_PROFILES[styleId] || STYLE_LICK_PROFILES.gospel;
  return profile.scales[Math.floor(Math.random() * profile.scales.length)];
}

function pickRhythmTemplate(styleId, difficulty) {
  const profile = STYLE_LICK_PROFILES[styleId] || STYLE_LICK_PROFILES.gospel;
  const templates = profile.rhythmTemplates;
  // Plus la difficulté est élevée, plus on prend un template dense.
  const index = difficulty === 'advanced'
    ? templates.length - 1
    : difficulty === 'intermediate'
      ? Math.min(1, templates.length - 1)
      : 0;
  return templates[index] || templates[0];
}

function seedRandom(seed) {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Génère un lick mélodique jouable.
 *
 * @param {string} target - Symbole d'accord cible (ex. "Cmaj7").
 * @param {object} options
 * @param {string} [options.styleId='gospel']
 * @param {'RH'|'LH'|'both'} [options.hand='RH']
 * @param {'beginner'|'intermediate'|'advanced'} [options.difficulty='intermediate']
 * @param {number} [options.lengthBeats=4]
 * @param {number} [options.bpm=90]
 * @param {number} [options.startOffsetMs=0]
 * @returns {CopilotLick}
 */
export function generateCopilotLick(target, options = {}) {
  const diagnostics = [];
  const styleId = options.styleId || 'gospel';
  const hand = options.hand || 'RH';
  const difficulty = options.difficulty || 'intermediate';
  const lengthBeats = options.lengthBeats || 4;
  const bpm = options.bpm || 90;
  const beatMs = (60 / bpm) * 1000;
  const startOffsetMs = options.startOffsetMs || 0;

  const seed = hashString(`${target}|${styleId}|${hand}|${difficulty}|${lengthBeats}`);
  const rnd = seedRandom(seed);

  const scaleType = pickScale(target, styleId);
  const scalePcs = scalePitchClassesForChord(target, scaleType);
  if (!scalePcs) {
    diagnostics.push(`Impossible de déterminer l'échelle pour ${target}.`);
    return { target, styleId, hand, difficulty, lengthBeats, notes: [], isPlayable: false, diagnostics };
  }

  const range = hand === 'LH' ? HAND_RANGES.LH : HAND_RANGES.RH;
  // Centrer autour de C4 pour RH, C3 pour LH.
  const centerMidi = hand === 'LH' ? 48 : 64;

  const template = pickRhythmTemplate(styleId, difficulty);
  const times = template.filter((t) => t < lengthBeats);

  const notes = [];
  let previousMidi = centerMidi;
  const maxLeap = difficulty === 'beginner' ? 3 : difficulty === 'advanced' ? 7 : 5;
  const maxSpan = DIFFICULTY_SPANS[difficulty] || 10;
  const halfSpan = Math.floor(maxSpan / 2);
  // Fenêtre fixe autour du centre de départ ; les notes y sont ramenées
  // par transpositions d'octave, pour garantir la jouabilité.
  const lowLimit = Math.max(range.min, centerMidi - halfSpan);
  const highLimit = Math.min(range.max, centerMidi + halfSpan);
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const pc = scalePcs[Math.floor(rnd() * scalePcs.length)];
    // Construire la note candidate au sein de +/- maxLeap de la précédente.
    const prevPc = previousMidi % 12;
    let delta = ((pc - prevPc + 12) % 12);
    if (delta > 6) delta -= 12;
    // Borner le saut à maxLeap en allant vers l'octave la plus proche.
    if (delta > maxLeap) delta -= 12;
    if (delta < -maxLeap) delta += 12;
    let midi = previousMidi + delta;

    // Ramener dans la fenêtre autorisée par transposition d'octave.
    while (midi > highLimit && midi - 12 >= range.min) midi -= 12;
    while (midi < lowLimit && midi + 12 <= range.max) midi += 12;
    // Dernier recours : clamp.
    midi = Math.max(lowLimit, Math.min(highLimit, midi));

    const durationMs = Math.round(beatMs * (0.5 + rnd() * 0.5));
    notes.push({
      midi,
      startOffsetMs: startOffsetMs + Math.round(t * beatMs),
      durationMs,
      velocity: 0.75 + rnd() * 0.15,
      hand,
      role: i === 0 ? 'target' : 'passage',
    });
    previousMidi = midi;
  }

  // Ajouter une note d'approche / appoggiature pour niveau avancé.
  if (difficulty === 'advanced' && notes.length >= 2) {
    const idx = Math.floor(rnd() * (notes.length - 1));
    const targetNote = notes[idx];
    const targetPc = targetNote.midi % 12;
    const approachPc = scalePcs[Math.floor(rnd() * scalePcs.length)];
    let delta = ((approachPc - targetPc + 12) % 12);
    if (delta > 6) delta -= 12;
    // Approche courte : demi-ton ou ton conjoint/chromatique.
    if (Math.abs(delta) > 2) delta = delta > 0 ? 1 : -1;
    let approachMidi = targetNote.midi + delta;
    approachMidi = Math.max(range.min, Math.min(range.max, approachMidi));
    notes.splice(idx, 0, {
      midi: approachMidi,
      startOffsetMs: targetNote.startOffsetMs - Math.max(50, Math.round(beatMs * 0.1)),
      durationMs: Math.max(80, Math.round(beatMs * 0.15)),
      velocity: 0.6,
      hand,
      role: 'approach',
    });
  }

  // Trier par startOffsetMs.
  notes.sort((a, b) => a.startOffsetMs - b.startOffsetMs);

  const validation = validateLick(notes, difficulty);
  diagnostics.push(...validation.diagnostics);

  return {
    target,
    styleId,
    hand,
    difficulty,
    lengthBeats,
    notes,
    isPlayable: validation.valid,
    diagnostics,
  };
}

/**
 * Validation avancée d'une séquence de notes (lick ou riff).
 * @returns {{valid: boolean, diagnostics: string[]}}
 */
export function validateLick(notes, difficulty = 'intermediate') {
  const diagnostics = [];
  let valid = true;
  if (!notes || notes.length === 0) {
    return { valid: false, diagnostics: ['Aucune note dans le lick.'] };
  }

  const maxSpan = DIFFICULTY_SPANS[difficulty] || DIFFICULTY_SPANS.intermediate;
  const range = notes[0].hand === 'LH' ? HAND_RANGES.LH : HAND_RANGES.RH;
  const midis = notes.map((n) => n.midi);
  const min = Math.min(...midis);
  const max = Math.max(...midis);

  if (max - min > maxSpan) {
    diagnostics.push(`Étendue de ${max - min} demi-tons dépasse le maximum ${maxSpan} pour ${difficulty}.`);
    valid = false;
  }

  for (const n of notes) {
    if (n.midi < range.min || n.midi > range.max) {
      diagnostics.push(`Note ${midiToNoteName(n.midi)} hors de la tessiture ${midiToNoteName(range.min)}–${midiToNoteName(range.max)}.`);
      valid = false;
    }
  }

  // Voice leading : sauts excessifs entre notes consécutives.
  let totalLeap = 0;
  for (let i = 1; i < notes.length; i++) {
    const leap = Math.abs(notes[i].midi - notes[i - 1].midi);
    totalLeap += leap;
    if (leap > 12) {
      diagnostics.push(`Saut de ${leap} demi-tons entre deux notes consécutives.`);
      valid = false;
    }
  }

  // Densité rythmique raisonnable (pas deux notes au même ms sur la même main).
  const sameHandSameTime = notes.some((n, i) =>
    notes.some((m, j) => i !== j && m.hand === n.hand && m.startOffsetMs === n.startOffsetMs)
  );
  if (sameHandSameTime) {
    diagnostics.push('Deux notes démarrent exactement au même moment sur la même main.');
    valid = false;
  }

  return { valid, diagnostics };
}

/**
 * Convertit un lick en tool calls play_note compatibles avec copilot-client.js.
 * @param {CopilotLick} lick
 * @returns {object[]}
 */
export function lickToPlayNoteCalls(lick) {
  return lick.notes.map((n) => ({
    function: {
      name: 'play_note',
      arguments: JSON.stringify({
        midi: n.midi,
        startOffsetMs: n.startOffsetMs,
        durationMs: n.durationMs,
        velocity: n.velocity,
      }),
    },
  }));
}
