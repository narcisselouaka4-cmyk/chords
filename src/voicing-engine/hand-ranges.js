// Plages et contraintes physiques des mains.
// Valeurs en numéros MIDI. Pure data, pas de logique UI.

/** @typedef {{ min: number, max: number }} HandRange */

/** @type {HandRange} */
export const LH_HARD_RANGE = Object.freeze({ min: 28, max: 55 });

/** @type {HandRange} */
export const LH_SOFT_RANGE = Object.freeze({ min: 36, max: 48 });

/** @type {HandRange} */
export const RH_HARD_RANGE = Object.freeze({ min: 48, max: 84 });

/** @type {HandRange} */
export const RH_SOFT_RANGE = Object.freeze({ min: 55, max: 72 });

/** Max span (semitones) autorisé pour une main. */
export const LH_MAX_SPAN = 12;
export const RH_MAX_SPAN = 16;

/**
 * Vérifie qu'une note MIDI est dans une plage stricte.
 * @param {number} midi
 * @param {HandRange} range
 * @returns {boolean}
 */
export function midiInRange(midi, range) {
  return Number.isInteger(midi) && midi >= range.min && midi <= range.max;
}

/**
 * Calcule l'étendue (max - min) d'un ensemble de notes MIDI.
 * Retourne 0 pour 0 ou 1 note.
 * @param {number[]} midis
 * @returns {number}
 */
export function span(midis) {
  if (!midis || midis.length < 2) return 0;
  return Math.max(...midis) - Math.min(...midis);
}

/**
 * Vérifie qu'une valeur est un numéro MIDI entier.
 * Rejette les non-nombres, les valeurs non entières, NaN, Infinity et les
 * chaînes numériques (par typage strict via Number.isInteger).
 * @param {any} value
 * @returns {boolean}
 */
export function isIntegerMidi(value) {
  return Number.isInteger(value);
}
